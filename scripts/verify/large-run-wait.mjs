import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { listProcesses } from './machine-load.mjs'
import { parseRunLoggedArgs } from './run-logged-args.mjs'
import { parseArgs } from './tiers.mjs'

/** Inspect the invoked script, not a script name quoted in somebody's payload. */
function scriptArgs(argv, script) {
  const leaf = (word) => String(word).replace(/\\/g, '/').split('/').pop().toLowerCase()
  let index = 0
  if (['node', 'nodejs', 'node.exe', 'bun', 'deno', 'tsx'].includes(leaf(argv[0]))) {
    index = argv.findIndex((word, i) => i > 0 && !word.startsWith('-'))
  }
  return index >= 0 && leaf(argv[index]) === script ? argv.slice(index + 1) : null
}

export function namesLargeRun(argv) {
  const args = scriptArgs(argv, 'run-logged.mjs')
  if (!args) return false
  const { own, forward } = parseRunLoggedArgs(args)
  return !own.show && parseArgs(forward).isLargeEquivalent
}

export function readVerifyProcesses() {
  return listProcesses().map((row) => {
    let argv
    try {
      // Keep real argument boundaries, including whitespace in --no-ladder's
      // reason or the checkout path. Windows' quoted command is the fallback.
      argv = readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
    } catch {
      argv = (row.cmd.match(/"[^"]*"|\S+/g) ?? []).map((word) => word.replace(/^"|"$/g, ''))
    }
    return { ...row, argv }
  })
}

function ancestors(pid, byPid) {
  const found = new Set()
  while (pid && !found.has(pid)) {
    found.add(pid)
    pid = byPid.get(pid)?.ppid
  }
  return found
}

/** Active runs have priority. For simultaneous launches that have not spawned
 * run-all yet, pid order chooses one admission; otherwise two LARGE waiters
 * could wait on each other forever. No file or cross-worktree ledger is used. */
export function blockingLargeRun(rows, pid) {
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const family = ancestors(pid, byPid)
  // A LARGE's re-exec, nested suites and baseline passes belong to that run.
  if (rows.some((row) => row.pid !== pid && family.has(row.pid) && namesLargeRun(row.argv))) return null
  const selfLarge = namesLargeRun(byPid.get(pid)?.argv ?? [])
  const runners = rows.filter((row) => scriptArgs(row.argv, 'run-all.mjs') !== null)
  const active = new Set(runners.flatMap((row) => [...ancestors(row.pid, byPid)]))
  return rows.filter((row) => !family.has(row.pid) && namesLargeRun(row.argv) &&
    (!selfLarge || active.has(row.pid) || row.pid < pid))
    .sort((a, b) => Number(active.has(b.pid)) - Number(active.has(a.pid)) || a.pid - b.pid)[0] ?? null
}

export async function waitForLargeRun({
  pid = process.pid, env = process.env, readProcesses = readVerifyProcesses,
  sleep = delay, report = console.log, stillRunning = sameProcess,
} = {}) {
  if (env.VERIFY_NO_WAIT === '1') return
  let reported = false
  for (;;) {
    const blocker = blockingLargeRun(readProcesses(), pid)
    if (!blocker) return
    if (!reported) {
      report(`# waiting for LARGE pid ${blocker.pid}: ${blocker.cmd}`)
      reported = true
    }
    do { await sleep(250) } while (stillRunning(blocker))
  }
}

/** Once a blocker is named, probe only that process until it exits. Repeated
 * full process-table scans would make the wait itself consume machine time. */
function sameProcess(row) {
  if (process.platform === 'linux') {
    try {
      const argv = readFileSync(`/proc/${row.pid}/cmdline`, 'utf8').split('\0').filter(Boolean)
      return JSON.stringify(argv) === JSON.stringify(row.argv)
    } catch { return false }
  }
  return readVerifyProcesses().some((other) => other.pid === row.pid && other.cmd === row.cmd)
}
