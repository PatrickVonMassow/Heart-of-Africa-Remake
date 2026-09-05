// "Why did the interactive session die?" — the recurring lookup as a command
// (user rule: script the recurring lookup, never dump raw data). Read-only:
// it measures, prints and exits 0 whatever it finds.
//
// usage: node scripts/session-death.mjs [--limit <n>]
import { readFileSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { explainDeath, sessionExits } from './session-death-core.mjs'

const JOURNAL = repoPath('.claude/batch-activity.jsonl')

/** PID 1's start time — the container's own age. A VS Code restart rebuilds the
 *  container, so PID 1 younger than the death IS the restart, and `uptime` is
 *  not: it reports the shared WSL kernel. */
function containerStartedAtMs() {
  try {
    // BOOT TIME PLUS PID 1's OWN OFFSET. `/proc/1` inode timestamps are NOT the
    // process start (measured 05.09.2026: four hours off), and `uptime` reports
    // the shared WSL kernel rather than this container.
    const btime = Number(/^btime (\d+)$/m.exec(readFileSync('/proc/stat', 'utf8'))?.[1] ?? 0)
    const fields = readFileSync('/proc/1/stat', 'utf8').slice(readFileSync('/proc/1/stat', 'utf8').lastIndexOf(') ') + 2).split(' ')
    const ticksAfterBoot = Number(fields[19]) // field 22 of the man page, minus pid and comm
    if (!btime || !Number.isFinite(ticksAfterBoot)) return 0
    return (btime + ticksAfterBoot / 100) * 1000 // USER_HZ is 100 on every Linux this runs on
  } catch {
    return 0
  }
}

/** The cgroup's own kill counter — the only witness that says "out of memory"
 *  without being inferred from a peak with no timestamp. */
function oomKills() {
  for (const path of ['/sys/fs/cgroup/memory.events', '/sys/fs/cgroup/memory/memory.oom_control']) {
    try {
      const m = /oom_kill[ =](\d+)/.exec(readFileSync(path, 'utf8'))
      if (m) return Number(m[1])
    } catch {
      /* not this cgroup layout — try the next */
    }
  }
  return 0
}

function availableMb() {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8'))
    return m ? Math.round(Number(m[1]) / 1024) : null
  } catch {
    return null
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const limit = Number(argv[argv.indexOf('--limit') + 1]) || 8
  let journal = ''
  try {
    journal = readFileSync(JOURNAL, 'utf8')
  } catch {
    console.log(`session-death: no journal at ${JOURNAL} — nothing to explain.`)
    process.exit(0)
  }
  const exits = sessionExits(journal, { limit })
  const measured = { containerStartedAtMs: containerStartedAtMs(), oomKills: oomKills(), freeMb: availableMb() }
  const { verdict, reasons } = explainDeath({ death: exits[0] ?? null, ...measured })

  console.log(`MOST RECENT EXIT: ${verdict}`)
  for (const reason of reasons) console.log(`  · ${reason}`)
  console.log(`\nMEASURED NOW: container up since ${new Date(measured.containerStartedAtMs).toISOString()}, ` +
    `oom_kill ${measured.oomKills}, ${measured.freeMb} MB available`)
  console.log(`\nLAST ${exits.length} EXIT ROW(S) — newest first:`)
  for (const row of exits) {
    console.log(`  ${row.at}  ${row.event.padEnd(12)} pid ${String(row.pid ?? '?').padEnd(8)} ` +
      `${row.cause}${row.explicit ? ' (explicit)' : ''}`)
  }
  console.log('\nA CLEAN SessionEnd IS NOT A SELF-EXIT: an external SIGTERM runs the same shutdown.')
  process.exit(0)
}
