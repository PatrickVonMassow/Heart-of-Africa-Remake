// THE PHASE ATTRIBUTION HAS TO BE TRUSTWORTHY (point 572, phase 1), and its failure
// side is the same one the older cost tool already met: a number that LOOKS measured.
// The specific ways this one could lie, each pinned below:
//   - a turn guessed into a phase because no rule matched it;
//   - the carry-forward silently crossing an idle night, or overwriting real evidence;
//   - a worktree path counting as a different file tree than the main checkout's;
//   - the per-turn durations not summing to the active hours the other tool reports;
//   - a task attributed to a point the turn never worked on.
import { describe, it, expect } from 'vitest'
import { activeMs, IDLE_GAP_MS } from './measure-context-cost-core.mjs'
import {
  PHASES,
  PHASE_NOTES,
  assignTasks,
  attribute,
  classifyBash,
  classifyFile,
  classifyToolCall,
  dominantTaskPerFile,
  foldResponseLines,
  mergeSpans,
  normalisePath,
  phaseSplits,
  quantiles,
  taskOfBranch,
  taskSpread,
  turnDurations,
  turnPhases,
  turnVerificationKinds,
  verificationBreakdown,
  verificationSplits,
  VERIFICATION_KINDS,
  VERIFICATION_KIND_NOTES,
  ROUTABLE_VERIFICATION_KINDS,
  classifyVerificationBash,
  classifyVerificationToolCall,
} from './measure-task-cost-core.mjs'

const NOW = 1_785_000_000_000
const MIN = 60_000
const usage = (over = {}) => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 100_000, output_tokens: 1000, ...over })
const bash = (command) => ({ name: 'Bash', input: { command } })

describe('phases', () => {
  it('names every phase it documents, unattributed last', () => {
    expect(PHASES.at(-1)).toBe('unattributed')
    for (const p of PHASES) expect(PHASE_NOTES[p]).toBeTruthy()
  })
})

describe('normalisePath', () => {
  it('folds a worktree path onto the main checkout key', () => {
    expect(normalisePath('/workspace/hoa/.claude/worktrees/agent-a1/src/App.tsx')).toBe('src/App.tsx')
    expect(normalisePath('/workspace/hoa/src/App.tsx')).toBe('src/App.tsx')
    expect(normalisePath('C:\\Users\\x\\hoa\\src\\App.tsx')).toBe('src/App.tsx')
  })

  it('leaves scratch space absolute, so it can be given no vote', () => {
    expect(normalisePath('/tmp/claude/scratch/x.mjs')).toBe('/tmp/claude/scratch/x.mjs')
    expect(classifyFile('/tmp/claude/scratch/x.mjs')).toBeNull()
  })
})

describe('classifyBash', () => {
  it('reads the verification suites, whatever pins the backend', () => {
    expect(classifyBash('node scripts/verify/place.mjs')).toBe('verification')
    expect(classifyBash('VERIFY_GL=webgpu npm run test:small')).toBe('verification')
    expect(classifyBash('npm test 2>&1 | tail -40')).toBe('verification')
    expect(classifyBash('node scripts/picture-stability.mjs polish')).toBe('verification')
  })

  it('separates the no-browser gate from the browser suites', () => {
    expect(classifyBash('npm run build && npm run lint')).toBe('gates')
    expect(classifyBash('npm run test:unit')).toBe('gates')
    expect(classifyBash('npx vitest run scripts/x.test.mjs')).toBe('gates')
    expect(classifyBash('node scripts/audit-check.mjs')).toBe('gates')
  })

  it('reads the brief, the merge and the bookkeeping scripts', () => {
    expect(classifyBash('node scripts/point-brief.mjs 572')).toBe('brief')
    expect(classifyBash('git merge --no-ff feat/572-x')).toBe('merge')
    expect(classifyBash('node scripts/worktree-cleanup.mjs /workspace/hoa/.claude/worktrees/agent-a1')).toBe('merge')
    expect(classifyBash('node scripts/board-publish.mjs')).toBe('bookkeeping')
    expect(classifyBash('node scripts/batch-boundary.mjs 572')).toBe('bookkeeping')
    expect(classifyBash('git commit -m "x"')).toBe('implementation')
  })

  it('gives plumbing NO vote rather than a guessed phase', () => {
    for (const cmd of ['grep -rn foo src/', 'git status --short', 'git log --oneline -5', 'tail -40 /tmp/out.txt', 'sleep 5', 'ps aux']) {
      expect(classifyBash(cmd)).toBeNull()
    }
  })
})

describe('classifyFile', () => {
  it('calls a spec READ the brief and a spec EDIT work on the document', () => {
    expect(classifyFile('TASKS.md', { read: true })).toBe('brief')
    expect(classifyFile('design.md', { read: true })).toBe('brief')
    expect(classifyFile('TASKS.md')).toBe('bookkeeping')
    expect(classifyFile('design.md')).toBe('implementation')
  })

  it('puts the verify scripts and the frames under verification', () => {
    expect(classifyFile('scripts/verify/place.mjs')).toBe('verification')
    expect(classifyFile('verification/480-village-tag.png')).toBe('verification')
    expect(classifyFile('/workspace/hoa/.claude/worktrees/agent-a1/scripts/verify/x.mjs')).toBe('verification')
  })

  it('puts the board, the batch and the guards under bookkeeping and the rest under implementation', () => {
    expect(classifyFile('.batch-dashboard.html')).toBe('bookkeeping')
    expect(classifyFile('scripts/board-core.mjs')).toBe('bookkeeping')
    expect(classifyFile('scripts/model-guard.mjs')).toBe('bookkeeping')
    expect(classifyFile('src/scenes/travel/Travel.tsx')).toBe('implementation')
    expect(classifyFile('docs/analysis_de/durchsatz-analyse.md')).toBe('implementation')
  })
})

describe('classifyToolCall', () => {
  it('counts delegation as bookkeeping and the evidence-free tools as nothing', () => {
    expect(classifyToolCall({ name: 'Agent', input: {} })).toBe('bookkeeping')
    expect(classifyToolCall({ name: 'SendMessage', input: {} })).toBe('bookkeeping')
    expect(classifyToolCall({ name: 'Monitor', input: {} })).toBeNull()
    expect(classifyToolCall({ name: 'WebSearch', input: {} })).toBeNull()
  })

  it('reads a Read as a lookup and an Edit as work', () => {
    expect(classifyToolCall({ name: 'Read', input: { file_path: 'CLAUDE.md' } })).toBe('brief')
    expect(classifyToolCall({ name: 'Edit', input: { file_path: 'CLAUDE.md' } })).toBe('implementation')
  })
})

describe('turnPhases', () => {
  it('splits a turn in proportion to the votes its tool calls cast', () => {
    const split = turnPhases([
      { name: 'Edit', input: { file_path: 'src/a.ts' } },
      { name: 'Edit', input: { file_path: 'src/b.ts' } },
      bash('npm run build'),
    ])
    expect(split.implementation).toBeCloseTo(2 / 3, 6)
    expect(split.gates).toBeCloseTo(1 / 3, 6)
    expect(Object.values(split).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })

  it('leaves a turn with no recognised call UNATTRIBUTED rather than guessing', () => {
    expect(turnPhases([])).toEqual({ unattributed: 1 })
    expect(turnPhases([bash('git status')])).toEqual({ unattributed: 1 })
  })

  it('lets plumbing beside real evidence not dilute the real evidence', () => {
    expect(turnPhases([bash('git status'), bash('npm run lint')])).toEqual({ gates: 1 })
  })
})

describe('phaseSplits carry-forward', () => {
  const turn = (at, tools = []) => ({ at, session: 's', tools })

  it('fills an evidence-free turn from the turn before it', () => {
    const turns = [turn(NOW, [bash('npm run build')]), turn(NOW + MIN)]
    expect(phaseSplits(turns).get(turns[1])).toEqual({ gates: 1 })
  })

  it('fills from the turn AFTER when nothing precedes it', () => {
    const turns = [turn(NOW), turn(NOW + MIN, [bash('node scripts/verify/place.mjs')])]
    expect(phaseSplits(turns).get(turns[0])).toEqual({ verification: 1 })
  })

  it('never carries across an idle gap — the next stretch is a new episode', () => {
    const turns = [turn(NOW, [bash('npm run build')]), turn(NOW + IDLE_GAP_MS + MIN)]
    expect(phaseSplits(turns).get(turns[1])).toEqual({ unattributed: 1 })
  })

  it('never overwrites a turn that has its own evidence', () => {
    const turns = [turn(NOW, [bash('npm run build')]), turn(NOW + MIN, [bash('git merge x')])]
    expect(phaseSplits(turns).get(turns[1])).toEqual({ merge: 1 })
  })

  it('does not leak a phase from one session into another', () => {
    const a = { at: NOW, session: 'a', tools: [bash('npm run build')] }
    const b = { at: NOW + MIN, session: 'b', tools: [] }
    expect(phaseSplits([a, b]).get(b)).toEqual({ unattributed: 1 })
  })

  it('carry:false is the strict floor and leaves the residue standing', () => {
    const turns = [turn(NOW, [bash('npm run build')]), turn(NOW + MIN)]
    expect(phaseSplits(turns, { carry: false }).get(turns[1])).toEqual({ unattributed: 1 })
  })
})

describe('foldResponseLines', () => {
  // THE DEFECT THIS PINS: one response is written to several transcript lines, one per
  // content block, every line repeating the same usage. The earlier reading deduplicated
  // by message id and kept the FIRST line — the thinking block — so the tool call on the
  // second line was never seen, and the classifier reported the response as evidence-free.
  const line = (over) => ({ id: 'msg_1', at: NOW, usage: usage(), session: 's', scope: 'subagent', branch: 'feat/572-x', file: 'a.jsonl', tools: [], ...over })

  it('SEES a tool call that sits on the second line of one response', () => {
    const folded = foldResponseLines([
      line({ tools: [] }), // thinking
      line({ at: NOW + 500, tools: [{ id: 'toolu_1', name: 'Bash', input: { command: 'npm run build' } }] }),
    ])
    expect(folded).toHaveLength(1)
    expect(folded[0].tools.map((t) => t.name)).toEqual(['Bash'])
    expect(turnPhases(folded[0].tools)).toEqual({ gates: 1 })
  })

  it('counts the usage of a multi-line response ONCE — the token sums must not move', () => {
    const folded = foldResponseLines([line({}), line({}), line({ tools: [{ id: 't', name: 'Read', input: { file_path: 'src/App.tsx' } }] })])
    expect(folded).toHaveLength(1)
    expect(folded[0].usage).toEqual(usage())
    expect(folded[0].at).toBe(NOW)
  })

  // THE SECOND HALF OF THE DEFECT (four-eyes review, 09.08.2026): the lines do NOT all
  // repeat the same usage — `output_tokens` is a rising streamed snapshot, and taking the
  // first line halved the measured output. The fold must take the per-counter MAXIMUM.
  it('takes the MAXIMUM output of a response whose output_tokens RISES across its lines', () => {
    const folded = foldResponseLines([
      line({ usage: usage({ output_tokens: 5 }) }),
      line({ usage: usage({ output_tokens: 234 }), tools: [{ id: 'a', name: 'Bash', input: { command: 'npm run build' } }] }),
      line({ usage: usage({ output_tokens: 234 }) }),
    ])
    expect(folded).toHaveLength(1)
    expect(folded[0].usage.output_tokens).toBe(234)
    // and the counters that DO repeat are still counted once, not summed
    expect(folded[0].usage.cache_read_input_tokens).toBe(100_000)
  })

  it('carries the corrected output into the weighted attribution, not the first line', () => {
    const rows = [
      { id: 'msg_1', at: NOW, usage: usage({ cache_read_input_tokens: 0, output_tokens: 10 }), session: 's', scope: 'subagent', branch: 'feat/572-x', file: 'a.jsonl', tools: [] },
      { id: 'msg_1', at: NOW + 400, usage: usage({ cache_read_input_tokens: 0, output_tokens: 1000 }), session: 's', scope: 'subagent', branch: 'feat/572-x', file: 'a.jsonl', tools: [{ id: 'a', name: 'Bash', input: { command: 'npm run build' } }] },
    ]
    const { phases } = attribute({ turns: foldResponseLines(rows) })
    expect(phases.gates.output).toBe(1000)
    expect(phases.gates.weighted).toBe(5000) // 1000 output × 5, not 10 × 5
  })

  it('unions SEVERAL tool calls of one response, so a batched turn is visible as batched', () => {
    const folded = foldResponseLines([
      line({ tools: [] }),
      line({ tools: [{ id: 'a', name: 'Bash', input: { command: 'npm run lint' } }] }),
      line({ tools: [{ id: 'b', name: 'Bash', input: { command: 'node scripts/verify/world.mjs' } }] }),
    ])
    expect(folded[0].tools).toHaveLength(2)
    expect(turnPhases(folded[0].tools)).toEqual({ gates: 0.5, verification: 0.5 })
  })

  it('does not count a repeated block twice, and keeps distinct responses apart', () => {
    const repeated = { id: 'a', name: 'Bash', input: { command: 'npm run build' } }
    const folded = foldResponseLines([line({ tools: [repeated] }), line({ tools: [repeated] }), line({ id: 'msg_2', at: NOW + MIN })])
    expect(folded).toHaveLength(2)
    expect(folded[0].tools).toHaveLength(1)
    expect(folded[1].tools).toEqual([])
  })

  it('falls back to a per-line key where a line carries no message id', () => {
    expect(foldResponseLines([line({ id: undefined }), line({ id: undefined, at: NOW + 1 })])).toHaveLength(2)
  })
})

describe('taskOfBranch / assignTasks / dominantTaskPerFile', () => {
  it('reads the point number off a feature branch only', () => {
    expect(taskOfBranch('feat/572-throughput-baseline')).toBe(572)
    expect(taskOfBranch('main')).toBeNull()
    expect(taskOfBranch('worktree-agent-a1')).toBeNull()
    expect(taskOfBranch('feat/no-number')).toBeNull()
  })

  it('prefers the turn own branch and falls back to the transcript, recording which', () => {
    const rows = [
      { file: 'x/subagents/a.jsonl', scope: 'subagent', branch: 'feat/572-x' },
      { file: 'x/subagents/a.jsonl', scope: 'subagent', branch: 'feat/572-x' },
      { file: 'x/subagents/a.jsonl', scope: 'subagent', branch: 'feat/900-y' },
    ]
    const fileTasks = dominantTaskPerFile(rows)
    expect(fileTasks.get('x/subagents/a.jsonl')).toBe(572)
    const out = assignTasks(
      [
        { at: NOW, branch: 'feat/900-y', file: 'x/subagents/a.jsonl' },
        { at: NOW, branch: 'main', file: 'x/subagents/a.jsonl' },
        { at: NOW, branch: 'main', file: 'top.jsonl' },
      ],
      fileTasks,
    )
    expect(out.map((t) => [t.task, t.taskSource])).toEqual([
      [900, 'branch'],
      [572, 'transcript'],
      [null, null],
    ])
  })

  it('never derives a task from a TOP-LEVEL transcript, which spans many points', () => {
    expect(dominantTaskPerFile([{ file: 'top.jsonl', scope: 'top-level', branch: 'feat/572-x' }]).size).toBe(0)
  })
})

describe('turnDurations', () => {
  it('sums to exactly the active hours the older tool reports', () => {
    const turns = [
      { at: NOW, session: 's' },
      { at: NOW + 5 * MIN, session: 's' },
      { at: NOW + 5 * MIN + IDLE_GAP_MS + MIN, session: 's' },
      { at: NOW + 5 * MIN + IDLE_GAP_MS + 3 * MIN, session: 's' },
    ]
    const total = [...turnDurations(turns).values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(activeMs(turns.map((t) => t.at)))
  })

  it('gives a session first turn no duration and keeps sessions apart', () => {
    const a = { at: NOW, session: 'a' }
    const b = { at: NOW + MIN, session: 'b' }
    const d = turnDurations([a, b])
    expect(d.get(a)).toBe(0)
    expect(d.get(b)).toBe(0)
  })
})

describe('attribute', () => {
  const turns = [
    { at: NOW, usage: usage(), session: 's', scope: 'subagent', task: 572, taskSource: 'branch', tools: [bash('npm run build')] },
    { at: NOW + MIN, usage: usage(), session: 's', scope: 'subagent', task: 572, taskSource: 'branch', tools: [] },
    { at: NOW + 2 * MIN, usage: usage(), session: 't', scope: 'top-level', task: null, taskSource: null, tools: [bash('node scripts/board-publish.mjs')] },
  ]

  it('attributes each turn once — the phase totals equal the whole', () => {
    const r = attribute({ turns })
    const sum = PHASES.reduce((a, p) => a + r.phases[p].weighted, 0)
    expect(sum).toBe(r.evidence.weighted)
  })

  it('carries the filled turn into its neighbour phase and reports the evidence band', () => {
    const filled = attribute({ turns })
    const strict = attribute({ turns, carry: false })
    expect(filled.phases.gates.turns).toBe(2)
    expect(strict.phases.gates.turns).toBe(1)
    expect(strict.evidence.unattributedShare).toBeGreaterThan(0)
    expect(filled.evidence.unattributedShare).toBe(0)
  })

  it('keeps the scopes and the tasks separate', () => {
    const r = attribute({ turns })
    expect(r.byScope.subagent.gates.turns).toBe(2)
    expect(r.byScope['top-level'].bookkeeping.turns).toBe(1)
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].task).toBe(572)
    expect(r.tasks[0].phases.gates.turns).toBe(2)
    expect(r.evidence.noTaskShare).toBeCloseTo(1 / 3, 2)
  })

  it('carries the billed counters, so cache reads can be told from output', () => {
    const r = attribute({ turns })
    expect(r.phases.gates.cacheRead).toBe(200_000)
    expect(r.phases.gates.output).toBe(2000)
  })

  it('returns an empty, non-throwing shape for no turns at all', () => {
    const r = attribute({ turns: [] })
    expect(r.evidence.weighted).toBe(0)
    expect(r.tasks).toEqual([])
    expect(r.phases.verification.weighted).toBe(0)
  })
})

describe('quantiles / taskSpread', () => {
  it('reports the tail, not only the average', () => {
    const q = quantiles([1, 1, 1, 1, 100])
    expect(q.median).toBe(1)
    expect(q.max).toBe(100)
    expect(q.mean).toBe(20.8)
  })

  it('drops the fragments below the floor rather than letting them set the median', () => {
    const tasks = [
      { total: { weighted: 10 }, phases: {} },
      { total: { weighted: 1000 }, phases: {} },
      { total: { weighted: 3000 }, phases: {} },
    ]
    expect(taskSpread(tasks, { minWeighted: 500 }).tasks).toBe(2)
    expect(taskSpread(tasks, { minWeighted: 500 }).median).toBe(3000)
  })

  it('says n/a rather than 0 for an empty set', () => {
    expect(quantiles([])).toMatchObject({ n: 0, median: null, p90: null })
  })
})

describe('mergeSpans', () => {
  it('measures the calendar span and reads the point out of the subject when the branch is gone', () => {
    const s = mergeSpans([
      { sha: 'a', subject: "Merge branch 'feat/571-webgpu-everyday-lane'", mergedAt: NOW + 3_600_000, firstBranchCommitAt: NOW, branchCommits: 4, mainCommitsAfter: 2 },
      { sha: 'b', subject: 'Merge the thing', mergedAt: NOW + 7_200_000, firstBranchCommitAt: NOW, branchCommits: 2, mainCommitsAfter: 0 },
    ])
    expect(s.merges).toBe(2)
    expect(s.rows[0]).toMatchObject({ task: 571, hours: 1 })
    expect(s.rows[1].task).toBeNull()
    expect(s.hours.median).toBe(2)
  })

  it('drops a merge whose branch commits could not be reached instead of inventing a span', () => {
    expect(mergeSpans([{ sha: 'a', mergedAt: NOW, firstBranchCommitAt: null }]).merges).toBe(0)
  })
})

// THE VERIFICATION SPLIT (point 654) decides whether routing read-only work to another
// vendor is worth building further, so its two failure modes are pinned here: calling a
// suite RUN "text" because the command also pipes into `tail` — which would report a
// routable half far larger than it is — and losing cost between the phase table and this
// split, since a figure that cannot be compared with the phase table means nothing.
describe('verification split', () => {
  it('names a note for every half, and routes only the text one', () => {
    expect(VERIFICATION_KINDS.at(-1)).toBe('unclear')
    for (const kind of VERIFICATION_KINDS) expect(VERIFICATION_KIND_NOTES[kind]).toBeTruthy()
    expect(ROUTABLE_VERIFICATION_KINDS).toEqual(['text'])
    for (const kind of ROUTABLE_VERIFICATION_KINDS) expect(VERIFICATION_KINDS).toContain(kind)
  })

  it('calls a suite RUN harness even where it pipes into a reader', () => {
    expect(classifyVerificationBash('npm test 2>&1 | tail -40')).toBe('harness')
    expect(classifyVerificationBash('VERIFY_GL=webgpu node scripts/verify/place.mjs | grep FAIL')).toBe('harness')
    expect(classifyVerificationBash('node scripts/picture-stability.mjs polish')).toBe('harness')
    expect(classifyVerificationBash('npm run preview')).toBe('harness')
  })

  it('calls a pure read of what a run left behind text, and settles nothing else', () => {
    expect(classifyVerificationBash('tail -40 verification/out.log')).toBe('text')
    expect(classifyVerificationBash('grep -n FAIL scripts/verify/place.mjs')).toBe('text')
    expect(classifyVerificationBash('rm -rf verification/tmp')).toBeNull()
  })

  it('reads a frame as EYES, a verify text as TEXT and an edit as AUTHORING', () => {
    const kind = (name, file_path) => classifyVerificationToolCall({ name, input: { file_path } })
    expect(kind('Read', 'verification/480-village.png')).toBe('eyes')
    expect(kind('Read', '/workspace/hoa/.claude/worktrees/agent-a1/verification/x.PNG')).toBe('eyes')
    expect(kind('Read', 'scripts/verify/place.mjs')).toBe('text')
    expect(kind('Edit', 'scripts/verify/place.mjs')).toBe('authoring')
  })

  it('gives a call that is not verification at all no vote here', () => {
    expect(classifyVerificationToolCall({ name: 'Bash', input: { command: 'npm run build' } })).toBeNull()
    expect(classifyVerificationToolCall({ name: 'Read', input: { file_path: 'src/App.tsx' } })).toBeNull()
    expect(classifyVerificationToolCall({ name: 'Agent', input: {} })).toBeNull()
  })

  it('marks a verification call whose half nothing settles UNCLEAR rather than guessing', () => {
    expect(classifyVerificationToolCall({ name: 'Bash', input: { command: 'rm -rf verification/tmp' } })).toBe('unclear')
    expect(turnVerificationKinds([])).toEqual({ unclear: 1 })
    expect(turnVerificationKinds([bash('rm -rf verification/tmp')])).toEqual({ unclear: 1 })
  })

  // Cross-vendor review, 12.08.2026: dropping the unclear votes made a turn that read one
  // log and did one unplaceable thing read as 100 % routable text — overstating the very
  // number this split exists to report.
  it('lets an UNCLEAR call vote beside a clear one instead of vanishing', () => {
    const split = turnVerificationKinds([bash('tail -50 verification/out.log'), bash('rm -rf verification/tmp')])
    expect(split.text).toBeCloseTo(0.5, 6)
    expect(split.unclear).toBeCloseTo(0.5, 6)
  })

  it('does not overwrite a PARTLY unclear turn with its neighbour’s split', () => {
    const turns = [
      { at: NOW, usage: usage(), session: 's', tools: [bash('npm test')] },
      { at: NOW + MIN, usage: usage(), session: 's', tools: [bash('tail -5 verification/out.log'), bash('rm -rf verification/tmp')] },
    ]
    const splits = verificationSplits(turns)
    expect(splits.get(turns[1]).text).toBeCloseTo(0.5, 6)
    expect(splits.get(turns[1]).harness).toBeUndefined()
  })

  // Same review: the runner's `node …` form swallowed a command that only PARSES a verify
  // script, which starts no browser and is plain text work.
  it('calls `node --check` on a verify script text, not a suite run', () => {
    expect(classifyVerificationBash('node --check scripts/verify/place.mjs')).toBe('text')
  })

  // Second round: the exception was asked of the WHOLE line, so a line that checks a file
  // AND runs the suite read as text. Each segment votes now, and a run always wins.
  it('still calls a line HARNESS when any of its segments starts a run', () => {
    expect(classifyVerificationBash('node --check scripts/verify/place.mjs && npm test')).toBe('harness')
    expect(classifyVerificationBash('tail -5 verification/out.log; VERIFY_GL=webgpu npm run test:small')).toBe('harness')
    expect(classifyVerificationBash('node --check scripts/verify/place.mjs && node --check scripts/verify/port.mjs')).toBe('text')
  })

  // Second round: a frame is a picture whatever its format, and counting a JPEG as text
  // inflated the very share this split reports.
  it('reads EVERY picture format as eyes, not only PNG', () => {
    const kind = (file_path) => classifyVerificationToolCall({ name: 'Read', input: { file_path } })
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg']) {
      expect(kind(`verification/480-village.${ext}`), ext).toBe('eyes')
    }
    expect(kind('verification/report.json')).toBe('text')
  })

  it('splits a turn in proportion to the halves its calls vote for', () => {
    const split = turnVerificationKinds([
      bash('npm test'),
      { name: 'Read', input: { file_path: 'verification/a.png' } },
      { name: 'Read', input: { file_path: 'verification/b.png' } },
      bash('git status'),
    ])
    expect(split.eyes).toBeCloseTo(2 / 3, 6)
    expect(split.harness).toBeCloseTo(1 / 3, 6)
  })

  it('carries the half across evidence-free turns of the same session, never across an idle night', () => {
    const turns = [
      { at: NOW, usage: usage(), session: 's', tools: [bash('npm test')] },
      { at: NOW + MIN, usage: usage(), session: 's', tools: [] },
      { at: NOW + IDLE_GAP_MS + 10 * MIN, usage: usage(), session: 's', tools: [] },
    ]
    const splits = verificationSplits(turns)
    expect(splits.get(turns[1])).toEqual({ harness: 1 })
    expect(splits.get(turns[2])).toEqual({ unclear: 1 })
    expect(verificationSplits(turns, { carry: false }).get(turns[1])).toEqual({ unclear: 1 })
  })

  it('sums to exactly the verification phase of the phase table', () => {
    const turns = [
      { at: NOW, usage: usage(), session: 's', scope: 'subagent', tools: [bash('npm test')] },
      { at: NOW + MIN, usage: usage(), session: 's', scope: 'subagent', tools: [{ name: 'Read', input: { file_path: 'verification/a.png' } }] },
      { at: NOW + 2 * MIN, usage: usage(), session: 's', scope: 'subagent', tools: [bash('tail -50 verification/out.log')] },
      { at: NOW + 3 * MIN, usage: usage(), session: 's', scope: 'subagent', tools: [bash('npm run build')] },
      { at: NOW + 4 * MIN, usage: usage(), session: 's2', scope: 'top-level', tools: [{ name: 'Edit', input: { file_path: 'scripts/verify/place.mjs' } }] },
    ]
    const phase = attribute({ turns }).phases.verification.weighted
    const split = verificationBreakdown({ turns })
    const sum = VERIFICATION_KINDS.reduce((a, kind) => a + split.kinds[kind].weighted, 0)
    expect(split.weighted).toBe(phase)
    expect(Math.abs(sum - phase)).toBeLessThanOrEqual(VERIFICATION_KINDS.length)
    expect(split.kinds.harness.weighted).toBeGreaterThan(0)
    expect(split.kinds.eyes.weighted).toBeGreaterThan(0)
    expect(split.kinds.text.weighted).toBeGreaterThan(0)
    expect(split.byScope['top-level'].authoring.weighted).toBeGreaterThan(0)
    expect(split.byScope.subagent.authoring.weighted).toBe(0)
  })

  it('reports the routable half as a share of the verification phase, and null on nothing', () => {
    const turns = [
      { at: NOW, usage: usage(), session: 's', tools: [bash('tail -50 verification/out.log')] },
      { at: NOW + MIN, usage: usage(), session: 's', tools: [bash('npm test')] },
    ]
    expect(verificationBreakdown({ turns }).routableShare).toBeCloseTo(0.5, 2)
    expect(verificationBreakdown({ turns: [] }).routableShare).toBeNull()
  })
})
