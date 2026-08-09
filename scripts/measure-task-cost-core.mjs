// WHERE THE TIME AND THE TOKENS OF ONE TASK ACTUALLY GO (point 572, phase 1). The
// pure decision half; `scripts/measure-task-cost.mjs` reads the transcripts and git.
//
// `scripts/measure-context-cost-core.mjs` answers "how much did we spend per hour, and
// how much of it above 150k context". It does NOT answer "which PART of a task that
// spend belongs to" — brief, implementation, gates, verification, merge, bookkeeping.
// This module adds exactly that attribution and REUSES the older module's weighting
// (`turnCost`) and its idle-gap rule unchanged, so the two tools cannot disagree about
// what a token or an active hour is.
//
// WHY THE OLD WEIGHTING STILL HOLDS for a per-phase split: `turnCost` is LINEAR in a
// turn's usage counters, so splitting one turn's cost across the phases it touched is
// the same operation on the weighted proxy as on the raw token count. Both are reported
// side by side; the weighted number is a PROXY for the bill, never the bill.
//
// WHAT THIS CANNOT DO, stated up front because a measurement that hides its blind spot
// is worse than none:
//   - A turn is attributed from the TOOL CALLS it issued. A turn that only thinks and
//     writes prose carries no such evidence and goes to `unattributed` — never guessed
//     into a phase.
//   - Shell plumbing (`grep`, `git status`, `cat`) appears in every phase and is
//     deliberately given NO vote. It does not distort a turn that also did something
//     identifiable; it leaves a turn that did nothing else unattributed.
//   - Transcript hours are MACHINE hours. Delegated agents run in parallel, so summing
//     them across sessions is not calendar time. Calendar time per point comes from git
//     (`mergeSpans`), and the two are reported as two different clocks.

import { COST_WEIGHTS, IDLE_GAP_MS, turnCost } from './measure-context-cost-core.mjs'

export { COST_WEIGHTS, IDLE_GAP_MS, turnCost }

/** The phases a task's cost is split into, in reporting order. `unattributed` is not a
 *  phase but the honest residue — evidence was missing, so nothing was assumed. */
export const PHASES = ['brief', 'implementation', 'gates', 'verification', 'merge', 'bookkeeping', 'unattributed']

export const PHASE_NOTES = {
  brief: 'getting the spec: point-brief.mjs, and READS of the spec documents',
  implementation: 'editing src/, scripts/ and docs/, and committing/pushing the branch',
  gates: 'build, lint, vitest, tsc, oxlint, npm audit — the no-browser gate',
  verification: 'browser suites, render-verify, picture checks, screenshots',
  merge: 'git merge, the branch/worktree teardown that ends it',
  bookkeeping: 'board, focus, TASKS/queue, batch and guard scripts, delegation calls',
  unattributed: 'the turn issued no tool call this classifier recognises — NOT guessed',
}

/**
 * A path as it reads relative to the repository, whichever checkout or worktree the
 * turn ran in. PURE.
 *
 * Worktree paths (`…/.claude/worktrees/agent-<id>/src/x.ts`) must fold onto the same
 * key as the main checkout's, or half of every delegated agent's work would look like
 * a different file tree. `/tmp` and the scratchpad stay ABSOLUTE on purpose — they are
 * scratch, and the classifier gives them no vote.
 */
export function normalisePath(p = '') {
  const s = String(p).replace(/\\/g, '/')
  if (s.startsWith('/tmp/') || s.startsWith('/home/')) return s
  const worktree = s.match(/\/\.claude\/worktrees\/[^/]+\/(.*)$/)
  if (worktree) return worktree[1]
  const repo = s.match(/^.*?\/hoa\/(.*)$/)
  if (repo) return repo[1]
  return s.replace(/^\.?\//, '')
}

/** Bash rules, FIRST MATCH WINS. Order is by specificity, not by phase order. */
const BASH_RULES = [
  ['verification', /scripts\/verify\/|npm (run )?test:(small|large)|npm test\b|VERIFY_GL=|render-verify|picture-(stability|check|cost)|measure-picture-cost|playwright|frameSubject|verification\//],
  ['gates', /npm run build|npm run lint|npm run test:unit|npx? vitest|vitest run|npx tsc|npx oxlint|npm audit|audit-check\.mjs|node --check|vite build/],
  ['brief', /point-brief\.mjs|tasks-source\.mjs/],
  ['merge', /git merge|worktree-cleanup|git (branch|push [^\n]*origin)[^\n]*(-d\b|--delete)|git (checkout|switch) main/],
  ['bookkeeping', /scripts\/(board|focus|batch-|dashboard|guard-preflight|finding|mechanism-review|chat-|retro-|worktree-list)|[a-z-]*-guard\.mjs|batch-boundary|ntfy\.sh/],
  ['implementation', /git (commit|add|push)\b/],
]

/** Which phase a shell command is evidence for, or null when it is plumbing. PURE. */
export function classifyBash(command = '') {
  const cmd = String(command)
  for (const [phase, re] of BASH_RULES) if (re.test(cmd)) return phase
  return null
}

/** File rules, FIRST MATCH WINS. `read` separates a spec LOOKUP from a spec EDIT. */
const SPEC_DOCS = /^(TASKS\.md|design\.md|CLAUDE\.md|docs\/tasks-archive\.md|docs\/acceptance-(criteria-detail|evidence)\.md)$/
const FILE_RULES = [
  ['verification', /^(scripts\/verify\/|verification\/|scripts\/(render-verify|picture-|measure-picture))|\.png$/],
  ['bookkeeping', /^(\.batch-dashboard\.html|TASKS\.md|scripts\/(board|batch|focus|dashboard|finding|mechanism-review|chat-)|docs\/batch-autonomy\.md)|[a-z-]*-guard(-core)?(\.test)?\.mjs$/],
  ['implementation', /^(src\/|scripts\/|docs\/|public\/|index\.html|package\.json|vite\.config|tsconfig|\.github\/)|\.md$/],
]

/**
 * Which phase a file touch is evidence for, or null. PURE.
 *
 * `read` matters: opening TASKS.md or design.md is the BRIEF phase (finding out what to
 * build); editing them is work on the documents themselves.
 */
export function classifyFile(path = '', { read = false } = {}) {
  const rel = normalisePath(path)
  if (rel.startsWith('/tmp/') || rel.startsWith('/home/')) return null
  if (read && SPEC_DOCS.test(rel)) return 'brief'
  for (const [phase, re] of FILE_RULES) if (re.test(rel)) return phase
  return null
}

/** Tools that are orchestration whatever their arguments carry. */
const ORCHESTRATION_TOOLS = new Set(['Agent', 'SendMessage', 'TaskStop', 'TaskOutput'])
/** Tools that carry no phase evidence at all — they must not vote. */
const SILENT_TOOLS = new Set(['Monitor', 'ToolSearch', 'TodoWrite', 'WebSearch', 'WebFetch', 'Skill', 'Artifact'])

/** The phase ONE tool call is evidence for, or null when it is no evidence. PURE. */
export function classifyToolCall({ name = '', input = {} } = {}) {
  if (ORCHESTRATION_TOOLS.has(name)) return 'bookkeeping'
  if (SILENT_TOOLS.has(name)) return null
  if (name === 'Bash') return classifyBash(input?.command ?? '')
  if (name === 'Read') return classifyFile(input?.file_path ?? '', { read: true })
  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') return classifyFile(input?.file_path ?? '')
  return null
}

/**
 * How ONE turn's cost divides across phases: shares summing to 1. PURE.
 *
 * A turn's tool calls each cast at most one vote, and the turn's cost is split IN
 * PROPORTION to those votes — a turn that edited three files and ran one gate is three
 * quarters implementation. No vote at all means `{ unattributed: 1 }`; nothing is
 * guessed into a phase, which is the whole point of having the bucket.
 */
export function turnPhases(tools = []) {
  const votes = new Map()
  let total = 0
  for (const t of Array.isArray(tools) ? tools : []) {
    const phase = classifyToolCall(t)
    if (!phase) continue
    votes.set(phase, (votes.get(phase) ?? 0) + 1)
    total += 1
  }
  if (total === 0) return { unattributed: 1 }
  const out = {}
  for (const [phase, n] of votes) out[phase] = n / total
  return out
}

/**
 * The phase of EVERY turn, with the evidence-free ones filled from their neighbours.
 * PURE. Returns a Map(turn → split).
 *
 * WHY A FILL IS NEEDED AT ALL, and why it is reported as a band rather than a number:
 * measured on this repository's transcripts, 77 % of the weighted cost sits on turns
 * that issue no tool call the classifier recognises — the model thinking, reading a
 * result, writing prose. Those turns cost nearly what a tool-calling turn costs, because
 * the bill is dominated by the context carried, not by the call. Attributing only the
 * tool-calling turns therefore measures a fifth of the spend and calls it the whole.
 *
 * The fill: a turn with no evidence takes the phase of the nearest evidence-bearing turn
 * in the SAME session, looking backwards first (the prose that follows a `npm run build`
 * belongs to that gate episode) and forwards only when nothing precedes it. It never
 * crosses a gap longer than `idleGapMs` — across an idle night the next turn is a new
 * episode, not a continuation. What no neighbour reaches stays `unattributed`.
 *
 * With `carry: false` the same function returns the STRICT attribution, which is a
 * floor per phase. Both are reported; the difference between them is the error bar.
 */
export function phaseSplits(turns = [], { carry = true, idleGapMs = IDLE_GAP_MS } = {}) {
  const list = (Array.isArray(turns) ? turns : []).filter((t) => Number.isFinite(t?.at))
  const out = new Map()
  const direct = new Map()
  for (const t of list) {
    const split = turnPhases(t.tools)
    direct.set(t, split)
    out.set(t, split)
  }
  if (!carry) return out
  const bySession = new Map()
  for (const t of list) {
    const key = t.session ?? t.file ?? '(none)'
    const arr = bySession.get(key) ?? []
    arr.push(t)
    bySession.set(key, arr)
  }
  const hasEvidence = (t) => !direct.get(t).unattributed
  for (const arr of bySession.values()) {
    arr.sort((a, b) => a.at - b.at)
    const filled = new Array(arr.length).fill(null)
    let prev = null
    let prevAt = 0
    for (let i = 0; i < arr.length; i++) {
      if (hasEvidence(arr[i])) {
        prev = direct.get(arr[i])
        prevAt = arr[i].at
      } else if (prev && arr[i].at - prevAt < idleGapMs) {
        filled[i] = prev
      }
    }
    let next = null
    let nextAt = 0
    for (let i = arr.length - 1; i >= 0; i--) {
      if (hasEvidence(arr[i])) {
        next = direct.get(arr[i])
        nextAt = arr[i].at
      } else if (!filled[i] && next && nextAt - arr[i].at < idleGapMs) {
        filled[i] = next
      }
    }
    for (let i = 0; i < arr.length; i++) if (filled[i]) out.set(arr[i], filled[i])
  }
  return out
}

/** The work-order point a branch name belongs to, or null. PURE. */
export function taskOfBranch(branch = '') {
  const m = String(branch).match(/^feat\/(\d+)[-/]/)
  return m ? Number(m[1]) : null
}

/**
 * Which task each turn belongs to. PURE.
 *
 * A turn's own `branch` decides where it names a feature branch. Where it does not —
 * a delegated agent records `main` while it is still setting its worktree up — the
 * transcript FILE's dominant feature branch stands in, because one delegated transcript
 * is one point by construction. `fileTasks` is that map, `{ file: task }`, computed by
 * the caller; a top-level session transcript is never in it, since a main session
 * carries many points.
 *
 * Returns the turns with `task` set (null where nothing decided it) and `taskSource`
 * naming WHICH rule decided, so the report can show how much rests on the fallback.
 */
export function assignTasks(turns = [], fileTasks = new Map()) {
  return (Array.isArray(turns) ? turns : []).map((t) => {
    const own = taskOfBranch(t?.branch ?? '')
    if (own != null) return { ...t, task: own, taskSource: 'branch' }
    const viaFile = fileTasks instanceof Map ? fileTasks.get(t?.file) : fileTasks?.[t?.file]
    if (viaFile != null) return { ...t, task: viaFile, taskSource: 'transcript' }
    return { ...t, task: null, taskSource: null }
  })
}

/**
 * The dominant feature branch of each SUBAGENT transcript. PURE.
 *
 * `rows` is [{ file, scope, branch }] — one entry per turn is enough, the count decides.
 * Only subagent transcripts get an entry: a top-level session spans many points, so
 * "its" branch would be a fiction.
 */
export function dominantTaskPerFile(rows = []) {
  const counts = new Map()
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.scope !== 'subagent') continue
    const task = taskOfBranch(r?.branch ?? '')
    if (task == null) continue
    const per = counts.get(r.file) ?? new Map()
    per.set(task, (per.get(task) ?? 0) + 1)
    counts.set(r.file, per)
  }
  const out = new Map()
  for (const [file, per] of counts) {
    const best = [...per].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    if (best) out.set(file, best[0])
  }
  return out
}

/**
 * Per-turn duration inside its session. PURE.
 *
 * A turn's wall-clock is the gap to the PREVIOUS turn of the same session, dropped when
 * it exceeds `idleGapMs` — the identical rule `activeMs` uses, so the two tools measure
 * the same "active hour". The first turn of a session spans nothing, which is the honest
 * answer and not a rounding choice.
 */
export function turnDurations(turns = [], { idleGapMs = IDLE_GAP_MS } = {}) {
  const bySession = new Map()
  for (const t of Array.isArray(turns) ? turns : []) {
    if (!Number.isFinite(t?.at)) continue
    const key = t.session ?? t.file ?? '(none)'
    const list = bySession.get(key) ?? []
    list.push(t)
    bySession.set(key, list)
  }
  const ms = new Map()
  for (const list of bySession.values()) {
    list.sort((a, b) => a.at - b.at)
    for (let i = 0; i < list.length; i++) {
      const gap = i === 0 ? 0 : list[i].at - list[i - 1].at
      ms.set(list[i], gap > 0 && gap < idleGapMs ? gap : 0)
    }
  }
  return ms
}

// The four billed counters are carried separately as well as summed: in an agent loop
// the bill is dominated by the CONTEXT a turn re-reads, not by what it writes, and a
// report that only shows a total hides which lever would move it.
const USAGE_KEYS = { input: 'input_tokens', cacheCreation: 'cache_creation_input_tokens', cacheRead: 'cache_read_input_tokens', output: 'output_tokens' }

const emptyBucket = () => ({ turns: 0, weighted: 0, raw: 0, ms: 0, input: 0, cacheCreation: 0, cacheRead: 0, output: 0 })

function addTo(bucket, { weighted, raw, ms, share, usage }) {
  bucket.turns += share
  bucket.weighted += weighted * share
  bucket.raw += raw * share
  bucket.ms += ms * share
  for (const [key, field] of Object.entries(USAGE_KEYS)) bucket[key] += (usage?.[field] ?? 0) * share
}

const roundBucket = (b) => ({
  turns: +b.turns.toFixed(1),
  weighted: Math.round(b.weighted),
  raw: Math.round(b.raw),
  hours: +(b.ms / 3_600_000).toFixed(2),
  input: Math.round(b.input),
  cacheCreation: Math.round(b.cacheCreation),
  cacheRead: Math.round(b.cacheRead),
  output: Math.round(b.output),
})

/** Quantiles of a numeric list, as { median, p90, max, min, n }. PURE. */
export function quantiles(values = []) {
  const v = (Array.isArray(values) ? values : []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return { n: 0, min: null, median: null, p90: null, max: null, sum: 0, mean: null }
  const at = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))]
  const sum = v.reduce((a, b) => a + b, 0)
  return { n: v.length, min: v[0], median: at(0.5), p90: at(0.9), max: v[v.length - 1], sum, mean: sum / v.length }
}

/**
 * THE ATTRIBUTION. PURE.
 *
 * `turns` is [{ at, usage, session, scope, branch, file, tools }]; `tools` is the turn's
 * tool_use blocks as [{ name, input }].
 *
 * Returns:
 *   phases      — per phase, over everything
 *   byScope     — the same split for `top-level` (main sessions) and `subagent`
 *   tasks       — per work-order point, its phases and its scope split
 *   evidence    — how much of the weighted cost rests on how much evidence
 */
export function attribute({ turns = [], idleGapMs = IDLE_GAP_MS, carry = true } = {}) {
  const list = (Array.isArray(turns) ? turns : []).filter((t) => Number.isFinite(t?.at))
  const durations = turnDurations(list, { idleGapMs })
  const splits = phaseSplits(list, { carry, idleGapMs })
  const phases = Object.fromEntries(PHASES.map((p) => [p, emptyBucket()]))
  const byScope = { 'top-level': Object.fromEntries(PHASES.map((p) => [p, emptyBucket()])), subagent: Object.fromEntries(PHASES.map((p) => [p, emptyBucket()])) }
  const tasks = new Map()
  const evidence = { weighted: 0, singlePhase: 0, multiPhase: 0, unattributed: 0, byBranch: 0, byTranscript: 0, noTask: 0 }

  for (const t of list) {
    const { weighted } = turnCost(t.usage)
    const u = t.usage ?? {}
    const raw =
      (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0)
    if (!(weighted > 0)) continue
    const ms = durations.get(t) ?? 0
    const split = splits.get(t) ?? { unattributed: 1 }
    const keys = Object.keys(split)
    evidence.weighted += weighted
    if (keys.length === 1 && keys[0] === 'unattributed') evidence.unattributed += weighted
    else if (keys.length === 1) evidence.singlePhase += weighted
    else evidence.multiPhase += weighted
    if (t.taskSource === 'branch') evidence.byBranch += weighted
    else if (t.taskSource === 'transcript') evidence.byTranscript += weighted
    else evidence.noTask += weighted

    const scope = t.scope === 'subagent' ? 'subagent' : 'top-level'
    let task = null
    if (t.task != null) {
      task = tasks.get(t.task) ?? { task: t.task, phases: Object.fromEntries(PHASES.map((p) => [p, emptyBucket()])), scopes: { 'top-level': emptyBucket(), subagent: emptyBucket() }, total: emptyBucket(), first: t.at, last: t.at }
      task.first = Math.min(task.first, t.at)
      task.last = Math.max(task.last, t.at)
      tasks.set(t.task, task)
    }
    for (const [phase, share] of Object.entries(split)) {
      const cell = { weighted, raw, ms, share, usage: u }
      addTo(phases[phase], cell)
      addTo(byScope[scope][phase], cell)
      if (task) {
        addTo(task.phases[phase], cell)
        addTo(task.scopes[scope], cell)
        addTo(task.total, cell)
      }
    }
  }

  const shareOf = (v) => (evidence.weighted > 0 ? +(v / evidence.weighted).toFixed(4) : null)
  return {
    phases: Object.fromEntries(PHASES.map((p) => [p, roundBucket(phases[p])])),
    byScope: {
      'top-level': Object.fromEntries(PHASES.map((p) => [p, roundBucket(byScope['top-level'][p])])),
      subagent: Object.fromEntries(PHASES.map((p) => [p, roundBucket(byScope.subagent[p])])),
    },
    tasks: [...tasks.values()]
      .map((t) => ({
        task: t.task,
        first: new Date(t.first).toISOString(),
        last: new Date(t.last).toISOString(),
        total: roundBucket(t.total),
        phases: Object.fromEntries(PHASES.map((p) => [p, roundBucket(t.phases[p])])),
        scopes: { 'top-level': roundBucket(t.scopes['top-level']), subagent: roundBucket(t.scopes.subagent) },
      }))
      .sort((a, b) => b.total.weighted - a.total.weighted),
    evidence: {
      weighted: Math.round(evidence.weighted),
      singlePhaseShare: shareOf(evidence.singlePhase),
      multiPhaseShare: shareOf(evidence.multiPhase),
      unattributedShare: shareOf(evidence.unattributed),
      taskByBranchShare: shareOf(evidence.byBranch),
      taskByTranscriptShare: shareOf(evidence.byTranscript),
      noTaskShare: shareOf(evidence.noTask),
    },
  }
}

/** The spread of a per-task figure, over the tasks that cleared `minWeighted`. PURE.
 *  Tiny task rows are transcript fragments, not tasks — a floor keeps them from
 *  dragging the median to a number no real point ever cost. */
export function taskSpread(tasks = [], { minWeighted = 0, pick = (t) => t.total.weighted } = {}) {
  const rows = (Array.isArray(tasks) ? tasks : []).filter((t) => t?.total?.weighted >= minWeighted)
  return { ...quantiles(rows.map(pick)), tasks: rows.length }
}

/**
 * THE OTHER CLOCK: calendar time per merged point, from git. PURE.
 *
 * `merges` is [{ sha, mergedAt, firstBranchCommitAt, branchCommits, subject }] as the
 * wrapper reads it. Calendar span is first branch commit → merge; it INCLUDES the waits
 * a transcript's active-hour rule deliberately drops, and that difference is the point of
 * reporting both.
 *
 * `mainCommitsBetween` counts the main-only commits that followed each merge — the
 * bookkeeping the branch never sees.
 */
export function mergeSpans(merges = []) {
  const rows = (Array.isArray(merges) ? merges : [])
    .filter((m) => Number.isFinite(m?.mergedAt) && Number.isFinite(m?.firstBranchCommitAt))
    .map((m) => ({
      sha: m.sha,
      subject: m.subject ?? '',
      task: taskOfBranch(m.branch ?? '') ?? (String(m.subject ?? '').match(/feat\/(\d+)-/)?.[1] ? Number(String(m.subject).match(/feat\/(\d+)-/)[1]) : null),
      hours: +((m.mergedAt - m.firstBranchCommitAt) / 3_600_000).toFixed(2),
      branchCommits: m.branchCommits ?? null,
      mainCommitsAfter: m.mainCommitsAfter ?? null,
    }))
  return {
    merges: rows.length,
    hours: quantiles(rows.map((r) => r.hours)),
    branchCommits: quantiles(rows.map((r) => r.branchCommits).filter((v) => Number.isFinite(v))),
    mainCommitsAfter: quantiles(rows.map((r) => r.mainCommitsAfter).filter((v) => Number.isFinite(v))),
    rows,
  }
}
