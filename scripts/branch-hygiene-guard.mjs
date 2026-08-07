// Stop hook: A MERGED BRANCH MUST NOT SURVIVE ITS MERGE. The decision logic is
// pure in branch-hygiene-core.mjs (Vitest-covered); this wrapper only asks git
// two local questions, reads the in-flight declaration and is fail-OPEN — any
// internal error allows the stop, so a guard bug can never trap the session.
//
// Cheap by construction: `git for-each-ref`, `git branch --merged origin/main`
// and `git worktree list --porcelain` are all local. No network, no `git show`
// per branch.
//
//   node scripts/branch-hygiene-guard.mjs --status   what it would decide
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { assessBranchHygiene, formatBranchHygiene, DEFAULT_GRACE_MS, normBranch } from './branch-hygiene-core.mjs'
import { declarationShields } from './batch-in-flight-core.mjs'

const PAUSE = repoPath('.claude/batch-paused')
const IN_FLIGHT = repoPath('.claude/batch-in-flight.json')

/** Calibratable grace, HOA_BRANCH_GRACE_MIN in minutes. Read here so the core
 *  stays pure. */
export function graceMs(env = process.env) {
  const raw = Number(env.HOA_BRANCH_GRACE_MIN)
  return Number.isFinite(raw) && raw > 0 ? raw * 60 * 1000 : DEFAULT_GRACE_MS
}

/** One local git call. Never a shell (a `^` in a revision is eaten by cmd.exe),
 *  always windowsHide (point 401 — the Stop chain must not flash consoles). */
function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 8 * 1024 * 1024,
  })
}

/** Tip commit date AND sha per ref — one call for every branch there is. The sha
 *  is what tells a freshly cut branch (its tip IS main's tip) from real debris. */
function tipDates() {
  const out = new Map()
  for (const line of git([
    'for-each-ref',
    '--format=%(refname:short)\t%(committerdate:unix)\t%(objectname)',
    'refs/heads',
    'refs/remotes',
  ]).split(/\r?\n/)) {
    const [name, unix, sha] = line.split('\t')
    if (!name) continue
    const n = Number(unix)
    if (Number.isFinite(n)) out.set(normBranch(name), { at: n * 1000, sha: (sha ?? '').trim() })
  }
  return out
}

/** `git branch --merged` prints `* ` for the current branch and `+ ` for one
 *  checked out in another worktree; both are names, not markers to keep. */
const mergedNames = (args) =>
  git(args)
    .split(/\r?\n/)
    .map((l) => l.replace(/^[*+]?\s*/, '').trim())
    .filter((l) => l && !l.includes('->'))

function parseWorktrees(porcelain) {
  const out = []
  let cur = null
  for (const raw of porcelain.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), branch: null, locked: false }
      out.push(cur)
    } else if (!cur) {
      continue
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice(5)
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice(7)
    } else if (line === 'locked' || line.startsWith('locked ')) {
      cur.locked = true
    }
  }
  return out
}

/** The guard's I/O half, shared with `--status` and the preflight. */
export function gatherBranchHygiene({ sessionId = '', now = Date.now() } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }

  let tips
  let localMerged
  let remoteMerged
  let worktrees
  let mainTip = null
  try {
    tips = tipDates()
    const at = (name) => tips.get(normBranch(name))?.at ?? null
    const shaOf = (name) => tips.get(normBranch(name))?.sha ?? null
    mainTip = shaOf('origin/main')
    localMerged = mergedNames(['branch', '--merged', 'origin/main']).map((name) => ({ name, tipAt: at(name), tipSha: shaOf(name) }))
    remoteMerged = mergedNames(['branch', '-r', '--merged', 'origin/main']).map((name) => ({ name, tipAt: at(name), tipSha: shaOf(name) }))
    // git's FIRST worktree is the main checkout. Deriving the root from it
    // rather than from this module's own path is what keeps the guard right
    // when it runs from an agent worktree — where REPO_ROOT is the worktree.
    worktrees = parseWorktrees(git(['worktree', 'list', '--porcelain'])).map((wt) => ({
      ...wt,
      tipAt: wt.branch ? at(wt.branch) : headDate(wt.head),
      tipSha: wt.branch ? shaOf(wt.branch) : ((wt.head ?? '').trim() || null),
      // Only asked where there is no branch to judge: a DETACHED leftover was a
      // third of the debris, and containment is the only thing that identifies it.
      mergedHead: wt.branch ? false : isAncestorOfMain(wt.head),
    }))
  } catch {
    // No origin/main, a bare/broken checkout, git missing — none of that is
    // evidence of debris.
    return { applicable: true, inputs: { readable: false } }
  }

  const declared = readInFlight(now)
  return {
    applicable: true,
    inFlightExpired: declared.expired,
    inputs: {
      now,
      repoRoot: worktrees[0]?.path ?? REPO_ROOT,
      ownPath: REPO_ROOT,
      graceMs: graceMs(),
      readable: true,
      localMerged,
      remoteMerged,
      worktrees,
      inFlightBranches: declared.branches,
      inFlightPaths: declared.paths,
      mainTip,
    },
  }
}

function headDate(sha) {
  if (!sha) return null
  try {
    const n = Number(git(['show', '-s', '--format=%ct', sha]).trim())
    return Number.isFinite(n) ? n * 1000 : null
  } catch {
    return null
  }
}

function isAncestorOfMain(sha) {
  if (!sha) return false
  try {
    git(['merge-base', '--is-ancestor', sha, 'origin/main'])
    return true
  } catch {
    return false
  }
}

/**
 * Branch/worktree evidence a session has declared it is still working on.
 *
 * Read leniently in SHAPE — a malformed field only ever widens the carve-out,
 * and merge-time deletion is the primary path anyway — but NOT in AGE (point
 * 437 G). This used to read the file raw, so a dead session's declaration
 * shielded its branch and its worktree from the sweep for ever, while the expiry
 * sat in a consumer this never called. `declarationShields` applies the same
 * `IN_FLIGHT_MAX_AGE_MS` the wait side applies; work that is genuinely still
 * moving stays protected by the sweep's own grace window on the branch tip.
 */
function readInFlight(now = Date.now()) {
  try {
    const d = JSON.parse(readFileSync(IN_FLIGHT, 'utf8'))
    const verdict = declarationShields({ declaration: d, now })
    if (!verdict.shields) return { branches: [], paths: [], expired: true, ageMs: verdict.ageMs }
    const evidence = Array.isArray(d?.evidence) ? d.evidence : []
    return {
      branches: evidence.filter((e) => e?.kind === 'branch').map((e) => String(e.ref ?? '')),
      paths: evidence.filter((e) => e?.kind === 'worktree').map((e) => String(e.path ?? '')),
      expired: false,
      ageMs: verdict.ageMs,
    }
  } catch {
    return { branches: [], paths: [], expired: false, ageMs: null }
  }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual --status run) */
    }
    const status = process.argv.includes('--status')
    const gathered = gatherBranchHygiene({ sessionId: sid })
    if (!gathered.applicable) {
      if (status) console.log(`branch-hygiene: steht zurück — ${gathered.why}`)
      process.exit(0)
    }
    const result = assessBranchHygiene(gathered.inputs)
    if (status) {
      if (gathered.inFlightExpired) {
        console.log(
          'branch-hygiene: die In-Flight-Erklärung ist ABGELAUFEN — sie schirmt nichts mehr ab. ' +
            'Wer noch arbeitet, erklärt neu: node scripts/batch-in-flight.mjs --waiting-on "<…>"',
        )
      }
      console.log(result.block ? formatBranchHygiene(result.findings) : `branch-hygiene: sauber (${result.reason})`)
      process.exit(0)
    }
    if (result.block) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: formatBranchHygiene(result.findings) }))
    }
    process.exit(0)
  } catch (e) {
    console.error(`branch-hygiene-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
