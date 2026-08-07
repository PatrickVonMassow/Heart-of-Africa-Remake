// Decision-logic sweep of the POINT-PROOF gate (point-proof-core): the opt-in
// PROOF-line grammar, the per-commit run accounting, and the top-level
// allow/deny — including totality on malformed input, on which the wrapper's
// fail-open depends.
import { describe, it, expect } from 'vitest'
import {
  evaluate,
  formatProofVerdict,
  proofCommands,
  proofCommandsFor,
  proofSatisfied,
} from './point-proof-core.mjs'

const HEAD = 'abc123def4567890'
const OLDER = '0987654321fedcba'
const MEASURE = 'node scripts/measure-context-cost.mjs --since 2026-07-01'

/** A work order holding the given point bodies. */
const workOrder = (...bodies) => ['# TASKS', '', '## Checklist', '', ...bodies].join('\n')

const openPoint = (n, body) => `- [ ] ${n}. A point.\n${body}\n`
const tick = (n, body) => ({
  toolName: 'Edit',
  toolInput: {
    file_path: 'docs/tasks-archive.md',
    old_string: '# Archive\n',
    new_string: `# Archive\n\n- [x] ${n}. A point.\n${body}\n`,
  },
})

/** A ledger entry that satisfies point n at `commit`. */
const ranAt = (n, commit, commands = [MEASURE]) => ({
  [String(n)]: { commit, commands, evidence: 'measured 1.8k median vs 108k', atIso: '2026-08-07T00:00:00Z' },
})

describe('the PROOF-line grammar', () => {
  it('reads a line naming the command whose run must be recorded', () => {
    expect(proofCommands(`prose\nPROOF: ${MEASURE}\nmore prose`)).toEqual([MEASURE])
  })

  it('accepts the line indented and as a list item', () => {
    expect(proofCommands('  - PROOF: node scripts/x.mjs')).toEqual(['node scripts/x.mjs'])
  })

  it('strips a code span around the command', () => {
    expect(proofCommands('PROOF: `node scripts/x.mjs --status`')).toEqual(['node scripts/x.mjs --status'])
  })

  it('IGNORES a quoted occurrence — prose ABOUT the grammar is not a demand', () => {
    // The work order's own preamble documents the line as a code span, and the
    // point that defines it quotes it. Reading either as a demand would have the
    // gate judge points by a sentence about the gate.
    expect(proofCommands('`PROOF: <command>` is the grammar')).toEqual([])
    expect(proofCommands('"PROOF: node scripts/x.mjs"')).toEqual([])
  })

  it('ignores a mid-sentence mention', () => {
    expect(proofCommands('the line reads PROOF: something, which is explained below')).toEqual([])
  })

  it('collects EVERY line, so a second demand cannot be silently dropped', () => {
    expect(proofCommands('PROOF: node a.mjs\ntext\nPROOF: node b.mjs')).toEqual(['node a.mjs', 'node b.mjs'])
  })

  it('de-duplicates an identical repeat', () => {
    expect(proofCommands('PROOF: node a.mjs\nPROOF: node a.mjs')).toEqual(['node a.mjs'])
  })

  it('is total on rubbish', () => {
    expect(proofCommands(undefined)).toEqual([])
    expect(proofCommands(null)).toEqual([])
    expect(proofCommands(42)).toEqual([])
    expect(proofCommands('PROOF:')).toEqual([])
  })
})

describe('proofCommandsFor', () => {
  const text = workOrder(openPoint(437, `spec\nPROOF: ${MEASURE}`), openPoint(438, 'no condition'))

  it('finds the point block that carries the line', () => {
    expect(proofCommandsFor(437, text)).toEqual([MEASURE])
  })

  it('answers empty for a point without one', () => {
    expect(proofCommandsFor(438, text)).toEqual([])
  })

  it('answers empty for a point the texts do not know', () => {
    expect(proofCommandsFor(999, text)).toEqual([])
  })

  it('reads the FIRST text that knows the point — the tick is two edits', () => {
    // Delete-first leaves the point in neither file at the moment the archive is
    // written, so the text being WRITTEN carries the only copy of the spec.
    const written = `- [x] 437. A point.\nspec\nPROOF: ${MEASURE}\n`
    expect(proofCommandsFor(437, written, workOrder())).toEqual([MEASURE])
  })
})

describe('proofSatisfied', () => {
  it('is satisfied by a run recorded at THIS head', () => {
    expect(proofSatisfied({ runs: ranAt(437, HEAD), n: 437, commands: [MEASURE], headSha: HEAD }).ok).toBe(true)
  })

  it('is NOT satisfied with nothing recorded', () => {
    const v = proofSatisfied({ runs: {}, n: 437, commands: [MEASURE], headSha: HEAD })
    expect(v).toMatchObject({ ok: false, reason: 'none-recorded' })
  })

  it('is NOT satisfied by a run recorded at an OLDER head', () => {
    const v = proofSatisfied({ runs: ranAt(437, OLDER), n: 437, commands: [MEASURE], headSha: HEAD })
    expect(v).toMatchObject({ ok: false, reason: 'stale-commit' })
  })

  it('is NOT satisfied by a record naming a DIFFERENT command', () => {
    const v = proofSatisfied({
      runs: ranAt(437, HEAD, ['node scripts/something-else.mjs']),
      n: 437,
      commands: [MEASURE],
      headSha: HEAD,
    })
    expect(v).toMatchObject({ ok: false, reason: 'changed-demand' })
  })

  it('rejects a blank-evidence record — a run counts only with its result', () => {
    const runs = { 437: { commit: HEAD, commands: [MEASURE], evidence: '   ' } }
    expect(proofSatisfied({ runs, n: 437, commands: [MEASURE], headSha: HEAD }).ok).toBe(false)
  })

  it('is total on rubbish', () => {
    expect(proofSatisfied().ok).toBe(false)
    expect(proofSatisfied({ runs: 'nonsense', n: 1, commands: [], headSha: '' }).ok).toBe(false)
  })
})

describe('the gate', () => {
  const tasksText = workOrder(openPoint(437, `spec\nPROOF: ${MEASURE}`), openPoint(438, 'plain prose only'))

  it('BLOCKS the tick of a point with a proof line and no recorded run', () => {
    const v = evaluate({ ...tick(437, `spec\nPROOF: ${MEASURE}`), tasksText, runs: {}, headSha: HEAD })
    expect(v.block).toBe(true)
    expect(v.reason).toMatch(/point 437/)
    expect(v.reason).toContain(MEASURE)
    expect(v.reason).toMatch(/no run recorded/)
  })

  it('ALLOWS the same tick once the run is recorded at the current HEAD', () => {
    const v = evaluate({ ...tick(437, `spec\nPROOF: ${MEASURE}`), tasksText, runs: ranAt(437, HEAD), headSha: HEAD })
    expect(v.block).toBe(false)
  })

  it('BLOCKS when the run was recorded at an OLDER head', () => {
    const v = evaluate({ ...tick(437, `spec\nPROOF: ${MEASURE}`), tasksText, runs: ranAt(437, OLDER), headSha: HEAD })
    expect(v.block).toBe(true)
    expect(v.reason).toMatch(/not this HEAD/)
  })

  it('leaves a point WITHOUT a proof line untouched', () => {
    const v = evaluate({ ...tick(438, 'plain prose only'), tasksText, runs: {}, headSha: HEAD })
    expect(v.block).toBe(false)
  })

  it('ALLOWS everything while the ledger is UNREADABLE (fail-open)', () => {
    const v = evaluate({
      ...tick(437, `spec\nPROOF: ${MEASURE}`),
      tasksText,
      runs: {},
      ledgerReadable: false,
      headSha: HEAD,
    })
    expect(v.block).toBe(false)
  })

  it('ignores a call that ticks nothing', () => {
    const v = evaluate({
      toolName: 'Edit',
      toolInput: { file_path: 'src/App.tsx', old_string: 'a', new_string: 'b' },
      tasksText,
      runs: {},
      headSha: HEAD,
    })
    expect(v.block).toBe(false)
  })

  it('ignores a RE-write of a tick the work order already records', () => {
    const already = workOrder(`- [x] 437. A point.\nspec\nPROOF: ${MEASURE}\n`)
    const v = evaluate({ ...tick(437, `spec\nPROOF: ${MEASURE}`), tasksText: already, runs: {}, headSha: HEAD })
    expect(v.block).toBe(false)
  })

  it('judges a tick written through the shell too', () => {
    const v = evaluate({
      toolName: 'Bash',
      toolInput: { command: `sed -i 's/- \\[ \\] 437./- [x] 437./' docs/tasks-archive.md` },
      tasksText,
      runs: {},
      headSha: HEAD,
    })
    expect(v.block).toBe(true)
  })

  it('does NOT read a COMMIT MESSAGE quoting a tick as a tick', () => {
    const v = evaluate({
      toolName: 'Bash',
      toolInput: { command: 'git commit -m "record the tick - [x] 437. in TASKS.md"' },
      tasksText,
      runs: {},
      headSha: HEAD,
    })
    expect(v.block).toBe(false)
  })

  it('names every offender when several are ticked at once', () => {
    const two = workOrder(
      openPoint(437, `spec\nPROOF: ${MEASURE}`),
      openPoint(439, 'spec\nPROOF: node scripts/other.mjs'),
    )
    const v = evaluate({
      toolName: 'Write',
      toolInput: {
        file_path: 'docs/tasks-archive.md',
        content: `- [x] 437. A point.\nPROOF: ${MEASURE}\n- [x] 439. A point.\nPROOF: node scripts/other.mjs\n`,
      },
      tasksText: two,
      runs: {},
      headSha: HEAD,
    })
    expect(v.block).toBe(true)
    expect(v.findings.map((f) => f.point)).toEqual([437, 439])
  })

  it('is total on rubbish', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ toolName: 'Edit', toolInput: null, tasksText: null, runs: null }).block).toBe(false)
  })
})

describe('formatProofVerdict', () => {
  it('is empty with no findings', () => {
    expect(formatProofVerdict([])).toBe('')
  })

  it('names the recording command so the block has a way out', () => {
    const text = formatProofVerdict([{ point: 437, commands: [MEASURE], reason: 'none-recorded' }], HEAD)
    expect(text).toMatch(/point-proof-guard\.mjs --ran <N> --evidence/)
    expect(text).toContain(HEAD.slice(0, 12))
  })
})
