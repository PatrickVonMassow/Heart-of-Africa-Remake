#!/usr/bin/env node
// READ-ONLY observer for the end-to-end handover (point 388). It gathers the
// facts — git, .claude/boundary.log, .claude/autostart.log, the lock — and
// prints one line per link of the chain with the evidence that proves it, or
// the diagnosis of the link that broke. The judgement is pure and Vitest-covered
// in scripts/batch-handover-observe-core.mjs.
//
//   node scripts/batch-handover-observe.mjs          the current chain
//   node scripts/batch-handover-observe.mjs --json   the same as data
//
// It writes nothing, touches no lock and starts no session — it is safe to run
// from any session at any time, including from a worktree. Exit 0 when the whole
// chain passed, 1 while it is still pending, 2 when a link is BROKEN.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { repoPath } from './repo-paths.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { lastWorkOrderTick } from './batch-boundary.mjs'
import { assessChain, parseHandoverLog, parseLauncherLog } from './batch-handover-observe-core.mjs'

const read = (p) => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

/** Commits on main, newest first, since a moment. execFile, never a shell. */
function commitsSince(sinceMs) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--format=%H%x09%ct%x09%s', `--since=${Math.floor(sinceMs / 1000)}`, 'main'],
      { cwd: repoPath('.'), encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [sha, ct, ...rest] = l.split('\t')
        return { sha, at: Number(ct) * 1000, subject: rest.join('\t') }
      })
  } catch {
    return []
  }
}

const tick = lastWorkOrderTick()
const handovers = parseHandoverLog(read(repoPath('.claude/boundary.log')))
const launcher = parseLauncherLog(read(repoPath('.claude/autostart.log')))
const lock = readOwnerLock()
const since = handovers.length ? handovers[handovers.length - 1].at : (tick?.at ?? Date.now() - 86400_000)
const result = assessChain({ tick, handovers, launcher, lock, commits: commitsSince(since) })

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ tick, lock, ...result }, null, 2))
} else {
  const mark = { pass: 'PASS   ', pending: 'pending', broken: 'BROKEN ' }
  console.log('handover chain (point 388) — read out of the logs, never inferred\n')
  for (const l of result.links) {
    console.log(`${mark[l.status]} ${l.id.padEnd(9)} ${l.title}`)
    console.log(`          ${l.evidence}`)
    if (l.status === 'broken' && l.broken) console.log(`          → ${l.broken}`)
  }
  console.log(
    `\n${result.ok ? 'The chain is COMPLETE — one observed handover end to end.' : 'The chain is not complete.'}`,
  )
}

process.exit(result.ok ? 0 : result.links.some((l) => l.status === 'broken') ? 2 : 1)
