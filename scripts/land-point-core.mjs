// THE LANDING CHAIN, as pure decisions (point 594).
//
// WHAT IT IS. Landing a finished point is always the same six steps — merge the
// feature branch, run the fast gate, tick the work order, move the block into the
// archive, publish the board, delete the worktree — and today it is 8-12 turns of
// the ONE serial session every point passes through, at a median context of 164k.
// Measured over the last window, bookkeeping was 26.0 % of the weighted spend and
// 37.5 % of the machine hours, and 62.3 % of the main session's own cost.
//
// WHY THE DECISIONS ARE PURE AND THE DOING IS NOT. Everything that can go wrong
// here goes wrong QUIETLY: a tick that leaves the point in TASKS.md, an archive
// that gains a duplicate, a publish that reports success on unchanged bytes, a
// gate that ran two of its three steps. So each of those judgments is a function
// with no I/O, pinned in scripts/land-point-core.test.mjs, and the wrapper
// (scripts/land-point.mjs) only performs what these decide.
//
// FAIL LOUD, AND LEAVE NO HALF STATE. The chain stops at the FIRST red step and
// never continues past it — `planFrom` below is what makes that structural rather
// than remembered. Two consequences follow, and both are deliberate:
//   - a step that was never reached is reported as `skipped: not reached`, never
//     as green and never as absent;
//   - the one step that writes two files (tick + archive move) computes BOTH
//     texts before it writes EITHER, so a crash cannot land half of it.
//
// IT BYPASSES NO GUARD. Every step here is one the repository already governs,
// and driving it from a script must not hide it from the mechanism that governs
// it. Two places carry that:
//   - `fenceGuardedAction` in scripts/batch-lease-core.mjs names `land-point.mjs`
//     itself, so a session that has lost the batch lease is refused the whole
//     chain the same way it is refused a bare `git merge`;
//   - the tick+archive transition is handed to `evaluateTasksArchive` (the same
//     core the Stop-hook guard uses) BEFORE it is written, so the chain can never
//     produce a state that guard would block.

/** A landing failure that is the CHAIN's own verdict, not a crash. */
export class LandingError extends Error {
  constructor(message, { step = null, repair = null } = {}) {
    super(message)
    this.name = 'LandingError'
    this.step = step
    this.repair = repair
  }
}

// ── The steps ────────────────────────────────────────────────────────────────

/**
 * The chain, in order. Every adjacency here is load-bearing:
 *
 *   - the GATE runs after the MERGE, because two points that auto-merge cleanly
 *     can still break together (CLAUDE.md §6);
 *   - the PUSH runs after the tick and BEFORE the cleanup, and that ordering is
 *     what keeps the chain from losing work. Until the tick is committed and main
 *     is pushed, the merge commit exists only in a local branch and the tick only
 *     as an uncommitted file edit: a machine loss in that window loses the point
 *     outright, `scripts/batch-boundary.mjs` cannot see a tick that is not in
 *     `git log main -- TASKS.md docs/tasks-archive.md`, and a stray
 *     `git checkout TASKS.md` erases it. Deleting the remote branch before that
 *     push would remove the last remote copy of the work as well;
 *   - the CLEANUP runs LAST, because a branch deleted before the tick is a branch
 *     nobody can go back to when the tick fails.
 */
export const LANDING_STEPS = Object.freeze([
  { id: 'merge', label: 'merge the branch into main (--no-ff)' },
  { id: 'gate', label: 'fast gate (build, lint, unit; audit on a lockfile change)' },
  { id: 'tick', label: 'tick the point in the work order' },
  { id: 'archive', label: 'move the block into docs/tasks-archive.md' },
  { id: 'push', label: 'commit the tick and push main' },
  { id: 'board', label: 'publish the board' },
  { id: 'cleanup', label: 'delete branch, remote branch and worktree' },
])

export const STEP_IDS = Object.freeze(LANDING_STEPS.map((s) => s.id))

/** A step's human label, or the id for one this table does not know. */
export const stepLabel = (id) => LANDING_STEPS.find((s) => s.id === id)?.label ?? String(id)

/** The verdicts a step can carry. `skipped` is a RESULT, not an absence. */
export const VERDICT = Object.freeze({
  ok: 'ok',
  skipped: 'skipped',
  failed: 'failed',
  notReached: 'not-reached',
})

/**
 * NOT A FAST-FORWARD, and the reason is not the obvious one. A fast-forward
 * leaves no merge commit, and `git log --first-parent main` is the only calendar
 * measurement this project has — every fast-forwarded point would silently vanish
 * from it and from the CI guard's ref accounting. The case where a fast-forward
 * would apply is also the case that costs nothing today, and the gate after the
 * merge is mandatory either way, so nothing is traded away for it.
 */
export const MERGE_ARGS = Object.freeze(['merge', '--no-ff', '--no-edit'])

// ── The commit that makes the tick durable ───────────────────────────────────

/**
 * The message for the tick commit, trailer included.
 *
 * THE MODEL CANNOT BE GUESSED, so it is demanded. That trailer is the only
 * machine-readable evidence `scripts/model-guard.mjs` has of which model authored
 * a commit, and a script that filled in a plausible name would defeat exactly the
 * tripwire that caught three defective deliveries on 24.07.2026. The landing
 * session knows its own model and nothing else in the repository does, so it
 * passes `--model`; an absent or unparseable one fails the chain BEFORE the merge
 * rather than after it.
 *
 * The subject describes the CHANGE and names no point number, per the project's
 * commit convention; the point is identified in the body, where the work order
 * itself already carries it.
 */
export function tickCommitMessage({ number, model } = {}) {
  const name = String(model ?? '').trim()
  if (!name) {
    throw new LandingError('no authoring model given for the tick commit', {
      step: 'push',
      repair: 'pass --model "Claude Opus 5" (the model running this landing) — the trailer is model-guard\'s only evidence',
    })
  }
  return [
    'Move the finished point out of the open work order',
    '',
    `Point ${number} is verified and merged; its block moves verbatim into`,
    'docs/tasks-archive.md so TASKS.md keeps only the open work.',
    '',
    `Co-Authored-By: ${name} <noreply@anthropic.com>`,
    '',
  ].join('\n')
}

// ── Which branch, and which worktree ─────────────────────────────────────────

/**
 * The branch for a point: `feat/<N>-<slug>`. Matched on the NUMBER between the
 * prefix and the first hyphen, so `feat/59-x` is never taken for point 594 and
 * `feat/594-a` never for point 59.
 *
 * Ambiguity is an error rather than a pick: two branches for one point means
 * someone re-cut it, and guessing which one holds the work is exactly the kind of
 * silent wrong answer this chain must not give.
 */
export function resolveBranch({ branches = [], number } = {}) {
  const n = Number(number)
  const re = new RegExp(`^feat/${n}(?:-|$)`)
  const hits = (Array.isArray(branches) ? branches : []).map(String).filter((b) => re.test(b))
  if (hits.length === 1) return hits[0]
  if (hits.length === 0) {
    throw new LandingError(`no branch matches feat/${n}-* — nothing to land`, {
      step: 'merge',
      repair: 'check the branch name, or pass --branch <name> explicitly',
    })
  }
  throw new LandingError(`${hits.length} branches match feat/${n}-*: ${hits.join(', ')}`, {
    step: 'merge',
    repair: 'delete the stale one, or pass --branch <name> explicitly',
  })
}

/**
 * The worktrees whose checked-out branch is the one being landed. Plural by
 * design: an agent that was restarted can leave a second tree on the same branch,
 * and cleaning up one while the other keeps the branch alive is how the debris of
 * 28.07.2026 accumulated.
 */
export function worktreesForBranch({ worktrees = [], branch, mainRoot } = {}) {
  const want = String(branch ?? '')
  const main = String(mainRoot ?? '')
  return (Array.isArray(worktrees) ? worktrees : [])
    .filter((w) => w && String(w.branch ?? '') === want)
    .filter((w) => String(w.path ?? '') && String(w.path) !== main)
    .map((w) => String(w.path))
}

// ── Rider (a): the audit runs on a lockfile change ───────────────────────────

/** The files that can move `npm audit`'s verdict. */
export const AUDIT_TRIGGER_FILES = Object.freeze(['package-lock.json', 'package.json'])

/**
 * Does this landing need the dependency audit?
 *
 * The verdict of `npm audit` is a function of the resolved dependency TREE, which
 * is `package-lock.json`. So on a landing that did not touch it, running the audit
 * re-derives a fact already known — it is the SAME fact, not a proxy for it.
 * `package.json` is included because the two normally move together, and a
 * manifest edited now with its lock regenerated later is the one case where the
 * lockfile alone would look quiet.
 *
 * WHAT THIS DOES NOT WEAKEN, and a reviewer should check it: an advisory
 * published upstream against an UNCHANGED tree does move the verdict, and this
 * condition would not see it. That case is covered elsewhere and deliberately
 * left there — the pre-push gate runs the audit on EVERY push
 * (`LIGHT_GATE` in scripts/pre-push-gate-core.mjs) and CI runs it on every run.
 * This condition governs the landing chain only.
 */
export function auditNeeded({ changedFiles = [] } = {}) {
  const files = (Array.isArray(changedFiles) ? changedFiles : []).map((f) =>
    String(f ?? '').replace(/\\/g, '/'),
  )
  const hit = files.find((f) => AUDIT_TRIGGER_FILES.some((t) => f === t || f.endsWith(`/${t}`)))
  if (hit) return { run: true, reason: `${hit} changed — the dependency tree moved` }
  return { run: false, reason: 'no lockfile change — the dependency tree is the one this was last audited on' }
}

// ── Rider (b): an unchanged board is not republished ─────────────────────────

/**
 * Should the board be published?
 *
 * A publish is a force-push of an orphan commit plus a state write; on unchanged
 * content it produces a byte-identical object and tells the reader nothing new.
 *
 * BOTH inputs have to be unchanged, and missing the second one would be the
 * subtle bug: the board document can be byte-identical while the OPEN-POINT SET
 * moved (a tick changes the set without necessarily changing a rendered card), and
 * `board-first-guard` reads `publishDue` off exactly that fingerprint. Skipping
 * there would arm a guard that then blocks the next turn — the block loop this
 * whole area exists to avoid.
 *
 * A recorded failure or a standing `publishDue` also forces the publish: both mean
 * the live page is NOT what the record claims, and the record is the only thing an
 * unchanged-content check could otherwise trust.
 */
export function boardPublishNeeded({ fileHash = null, fingerprint = null, state = {} } = {}) {
  const s = state && typeof state === 'object' ? state : {}
  if (s.publishFailed) return { run: true, reason: 'the last publish failed — the live page is unknown' }
  if (s.publishDue) return { run: true, reason: 'a publish is due (the open-point set moved)' }
  if (!fileHash) return { run: true, reason: 'the board file could not be hashed — publish rather than assume' }
  if (s.pagesPublishedHash !== fileHash) return { run: true, reason: 'the board content changed' }
  if (fingerprint && s.publishedFingerprint && s.publishedFingerprint !== fingerprint) {
    return { run: true, reason: 'the open-point set changed since the last publish' }
  }
  if (fingerprint && !s.publishedFingerprint) {
    return { run: true, reason: 'no fingerprint was ever recorded for the live page' }
  }
  return { run: false, reason: 'content and open-point set unchanged since the last publish' }
}

// ── Rider (c): the fast gate runs concurrently, under an interlock ───────────

/** The gate's steps. `audit` is conditional (see `auditNeeded`). */
export const GATE_COMMANDS = Object.freeze({
  build: ['npm', 'run', 'build'],
  lint: ['npm', 'run', 'lint'],
  unit: ['npm', 'run', 'test:unit'],
  audit: ['node', 'scripts/audit-check.mjs'],
})

/**
 * Stray kinds that force the gate SERIAL.
 *
 * `verify-run` and `automation-browser` are the interlock the point demands: a
 * browser suite in flight is a timing verdict being taken, and three gate steps
 * fired beside it manufacture exactly the load `scripts/verify/machine-load.mjs`
 * exists to warn about. `unit-run` is here for a narrower reason — our own gate
 * runs vitest, and a second vitest on the same box is what produced four
 * "Test timed out in 5000ms" failures in tests that pass in 582 ms alone.
 */
export const SERIALISING_STRAYS = Object.freeze(['verify-run', 'automation-browser', 'unit-run'])

/**
 * Parallel or serial, and why.
 *
 * SERIAL IS THE SAFE SIDE, so every uncertainty resolves to it: an unreadable
 * process table, a forced mode, an unknown machine. The gain here is machine
 * hours (gates are 21.0 of them per window; 30-60 % of that is 2.9-5.8 % of all
 * machine hours), and the token effect is ~0.33 % — so this is worth nothing at
 * all if it costs one ambiguous red.
 */
export function gateConcurrency({ strays = [], probeOk = true, force = null } = {}) {
  if (force === 'serial') return { mode: 'serial', reason: 'forced serial (--serial)', blockers: [] }
  if (force === 'parallel') return { mode: 'parallel', reason: 'forced parallel (--parallel)', blockers: [] }
  if (probeOk !== true) {
    return { mode: 'serial', reason: 'the machine could not be probed — serial is the safe side', blockers: [] }
  }
  const blockers = (Array.isArray(strays) ? strays : []).filter(
    (s) => s && SERIALISING_STRAYS.includes(String(s.kind)),
  )
  if (blockers.length) {
    const kinds = [...new Set(blockers.map((b) => String(b.kind)))].join(', ')
    return { mode: 'serial', reason: `another run holds this machine (${kinds})`, blockers }
  }
  return { mode: 'parallel', reason: 'the machine is free of competing runs', blockers: [] }
}

// ── The tick and the archive move, as one transition ─────────────────────────

/** Where a point's block ends: the next point, or the next `##` section. */
const BLOCK_END = /^(?:- \[[ x]\] \d+\.|## )/

/**
 * Cut point N out of the open work order and produce the archived form.
 *
 * Returns { tasks, archive, block } — the two FULL texts to write, plus the block
 * that moved, so the caller can show it. Nothing is written here.
 *
 * VERBATIM MEANS VERBATIM: only the checkbox changes. The body is carried across
 * byte for byte, because the archive is machine-read (dashboard integrity, card
 * topics, sync, the brief) under the same numbering, and a reflowed block is a
 * silently different spec.
 */
export function tickAndArchive({ tasksText = '', archiveText = '', number } = {}) {
  const n = Number(number)
  if (!Number.isInteger(n) || n <= 0) throw new LandingError(`not a point number: ${number}`, { step: 'tick' })

  const lines = String(tasksText).split('\n')
  const head = new RegExp(`^- \\[( |x)\\] ${n}\\.`)
  const starts = lines.map((l, i) => (head.test(l) ? i : -1)).filter((i) => i >= 0)

  if (starts.length === 0) {
    throw new LandingError(`point ${n} is not in TASKS.md`, {
      step: 'tick',
      repair: `already landed? check docs/tasks-archive.md for "- [x] ${n}."`,
    })
  }
  if (starts.length > 1) {
    throw new LandingError(`point ${n} appears ${starts.length} times in TASKS.md`, {
      step: 'tick',
      repair: 'resolve the duplicate by hand — the chain will not guess which block is the spec',
    })
  }
  if (new RegExp(`^- \\[[ x]\\] ${n}\\.`, 'm').test(String(archiveText))) {
    throw new LandingError(`point ${n} is already in docs/tasks-archive.md`, {
      step: 'archive',
      repair: 'a previous landing moved it — remove the block still sitting in TASKS.md',
    })
  }

  const start = starts[0]
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (BLOCK_END.test(lines[i])) {
      end = i
      break
    }
  }

  // The block, with trailing blank lines dropped: they belong to the SEPARATION
  // between blocks, not to the block, and carrying them would grow one blank line
  // per landing at the archive's tail.
  const raw = lines.slice(start, end)
  while (raw.length && raw[raw.length - 1].trim() === '') raw.pop()
  if (raw[0].startsWith('- [x]')) {
    throw new LandingError(`point ${n} is already ticked in TASKS.md`, {
      step: 'tick',
      repair: 'move the block to docs/tasks-archive.md — tasks-archive-guard is already blocking on it',
    })
  }
  const block = [raw[0].replace('- [ ]', '- [x]'), ...raw.slice(1)].join('\n')

  const remaining = [...lines.slice(0, start), ...lines.slice(end)]
  const tasks = remaining.join('\n')

  const base = String(archiveText).replace(/\s*$/, '')
  const archive = `${base}\n\n${block}\n`

  return { tasks, archive, block }
}

/** A finding's identity for comparison: its rule and the points it names. */
const findingKey = (f) => `${f?.rule ?? '?'}:${[...(f?.points ?? [])].sort((a, b) => a - b).join(',')}`

/**
 * May this transition be written?
 *
 * Judged by the guard that GOVERNS the split (`evaluateTasksArchive`, the same
 * core the Stop hook uses), handed in rather than imported so this module stays
 * dependency-free and no caller can substitute a laxer judge by accident.
 *
 * IT COMPARES BEFORE WITH AFTER, and that is not a softening. The guard judges the
 * whole work order, so it also reports things this landing did not cause — an
 * unrelated gap in the numbering, a point someone else stranded. Blocking on those
 * would make every landing impossible until an unrelated repair happened, which is
 * how a gate stops being run at all. What may never pass is a finding this
 * transition INTRODUCES, and that is exactly the set computed here.
 *
 * FAILS CLOSED on a missing "after" verdict: no verdict is not a pass.
 */
export function transitionAccepted({ before = null, after = null, verdict = null } = {}) {
  const post = after ?? verdict
  if (!post || typeof post !== 'object') {
    return { ok: false, findings: [{ rule: 'no-verdict', detail: 'the archive guard returned nothing to judge' }], preexisting: [] }
  }
  const postFindings = Array.isArray(post.findings) ? post.findings : []
  const priorKeys = new Set(
    (before && Array.isArray(before.findings) ? before.findings : []).map(findingKey),
  )
  const introduced = postFindings.filter((f) => !priorKeys.has(findingKey(f)))
  const preexisting = postFindings.filter((f) => priorKeys.has(findingKey(f)))
  return { ok: introduced.length === 0, findings: introduced, preexisting }
}

// ── The plan, and the summary ────────────────────────────────────────────────

/**
 * The chain as a list of planned steps: { id, label, run, reason }.
 *
 * A step that will be SKIPPED says so here, before anything runs, so `--dry`
 * shows the reader the same plan the real run executes.
 */
export function planLanding({ number, branch, audit, board, gate, worktrees = [] } = {}) {
  const steps = LANDING_STEPS.map((s) => ({ id: s.id, label: s.label, run: true, reason: '' }))
  const at = (id) => steps.find((s) => s.id === id)

  at('merge').reason = `${branch} -> main, --no-ff`
  at('gate').reason = gate?.mode
    ? `${gate.mode}${audit?.run ? ' + audit' : ''} — ${gate.reason}`
    : 'build, lint, unit'
  at('tick').reason = `point ${number}`
  at('archive').reason = 'docs/tasks-archive.md'
  at('push').reason = 'commit the tick, push main — nothing may be deleted before this'

  const b = at('board')
  b.run = board?.run !== false
  b.reason = board?.reason ?? ''

  const c = at('cleanup')
  c.run = true
  c.reason = worktrees.length ? `branch + ${worktrees.length} worktree(s)` : 'branch (no worktree checked out)'

  return { number: Number(number), branch, steps, audit, gate, board }
}

/**
 * Fold a finished step into the results, and say whether the chain continues.
 *
 * This is the structural half of "fails LOUD at the first red step and never
 * continues past it": there is no path through this function that yields
 * `continue: true` after a failure.
 */
export function foldResult(results, { id, verdict, detail = '' } = {}) {
  const out = [...(Array.isArray(results) ? results : []), { id, verdict, detail }]
  return { results: out, continue: verdict !== VERDICT.failed }
}

/** Every step of the plan that never ran, marked as such rather than omitted. */
export function markNotReached({ plan, results = [] } = {}) {
  const done = new Set(results.map((r) => r.id))
  const rest = (plan?.steps ?? [])
    .filter((s) => !done.has(s.id))
    .map((s) => ({ id: s.id, verdict: VERDICT.notReached, detail: 'the chain stopped before this step' }))
  return [...results, ...rest]
}

const MARK = {
  [VERDICT.ok]: 'OK  ',
  [VERDICT.skipped]: 'SKIP',
  [VERDICT.failed]: 'FAIL',
  [VERDICT.notReached]: '--  ',
}

/**
 * THE ONE SUMMARY, as lines. One line per step with its verdict, then the overall
 * verdict, then — on a failure — the repair.
 *
 * It is the whole point of the command that this is what the session reads
 * instead of eight tool outputs, so it says everything a reader needs and nothing
 * they would have to scroll: no command output, no timings, no diff.
 */
export function formatLandingVerdict({ number, branch, results = [], error = null } = {}) {
  const rows = Array.isArray(results) ? results : []
  const failed = rows.find((r) => r.verdict === VERDICT.failed)
  const lines = [`landing point ${number} (${branch ?? '?'})`]
  for (const r of rows) {
    const mark = MARK[r.verdict] ?? '?   '
    lines.push(`  ${mark} ${r.id.padEnd(8)} ${stepLabel(r.id)}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  if (failed) {
    lines.push(`LANDING FAILED at "${failed.id}" — nothing past it ran, so no half state was left.`)
    const repair = error?.repair ?? failed.repair
    if (repair) lines.push(`  repair: ${repair}`)
  } else if (rows.length && rows.every((r) => r.verdict === VERDICT.ok || r.verdict === VERDICT.skipped)) {
    lines.push(`LANDED. Point ${number} is on main, ticked, archived and cleaned up.`)
  } else {
    lines.push('LANDING INCOMPLETE — see the marks above.')
  }
  return lines
}

/** 0 when every step is ok or skipped, 1 otherwise. */
export function landingExit(results = []) {
  const rows = Array.isArray(results) ? results : []
  if (!rows.length) return 1
  return rows.every((r) => r.verdict === VERDICT.ok || r.verdict === VERDICT.skipped) ? 0 : 1
}
