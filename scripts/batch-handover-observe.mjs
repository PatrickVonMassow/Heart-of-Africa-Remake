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
import { readOwnerLock, HANDOVER_GRACE_MS } from './batch-singleton.mjs'
import { lastWorkOrderTick, closureOf } from './batch-boundary.mjs'
import { tickedPointsInDiff } from './batch-boundary-core.mjs'
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

/**
 * The commit that TICKED one named point on main: { point, at, sha } or null.
 * Unlike `lastWorkOrderTick` — which answers "what was closed most recently" for
 * the guard's due-heuristic and deliberately looks only a few commits back — this
 * hunts ONE known point, so it may look far enough back to find it: on 28.07.2026
 * eight append-only work-order commits had already buried the tick this observer
 * needed. `tickedPointsInDiff` keeps the archive-move rule: moving an already
 * ticked point into the archive is not a tick.
 */
function tickCommitFor(point, { cwd = repoPath('.'), ref = 'main', limit = 50 } = {}) {
  if (!Number.isInteger(point) || point <= 0) return null
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const paths = ['--', 'TASKS.md', 'docs/tasks-archive.md']
  try {
    for (const row of git(['log', `-${limit}`, '--format=%H %ct', ref, ...paths]).split('\n')) {
      const m = row.trim().match(/^([0-9a-f]{7,40}) (\d+)$/)
      if (!m) continue
      if (tickedPointsInDiff(git(['show', '--format=', '--unified=0', m[1], ...paths])).includes(point)) {
        return { point, at: Number(m[2]) * 1000, sha: m[1] }
      }
    }
  } catch {
    /* no such ref / not a repo — the tick is evidence, never the judgement */
  }
  return null
}

const handovers = parseHandoverLog(read(repoPath('.claude/boundary.log')))
const launcher = parseLauncherLog(read(repoPath('.claude/autostart.log')))
const lock = readOwnerLock()
// The anchor is the handover that was TAKEN, and the question asked of it is
// whether ITS point is closed — a state, read from the split work order, rather
// than a tick that has to be caught inside a log window.
const takenPoint = handovers.length ? handovers[handovers.length - 1].point : null
const closures = takenPoint === null ? {} : { [takenPoint]: closureOf(takenPoint) }
const tick = (takenPoint === null ? null : tickCommitFor(takenPoint)) ?? lastWorkOrderTick()
const since = handovers.length ? handovers[handovers.length - 1].at : (tick?.at ?? Date.now() - 86400_000)
const result = assessChain({
  tick,
  handovers,
  launcher,
  closures,
  lock,
  commits: commitsSince(since),
  graceMs: HANDOVER_GRACE_MS, // the real constant, never a copy that can drift
})

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ tick, closures, lock, ...result }, null, 2))
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
