// The tasks-archive guard's decision core (user 26.07.2026): TASKS.md carries
// the open work, docs/tasks-archive.md the finished points. Each way the split
// can rot has its own witness here.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parsePoints,
  evaluateTasksArchive,
  formatTasksArchiveVerdict,
} from './tasks-archive-guard-core.mjs'

const OPEN = '- [ ] 12. DO THE THING (user 01.01.2026).\n  Some spec lines.\n'
const DONE = '- [x] 7. DID THE THING (user 01.01.2026).\n  Some spec lines.\n'

describe('parsePoints', () => {
  it('reads number and tick state, and ignores prose that merely looks similar', () => {
    const text = `${OPEN}${DONE}\nA sentence mentioning - [ ] not at line start.\n`
    expect(parsePoints(text)).toEqual([
      { n: 12, done: false },
      { n: 7, done: true },
    ])
  })

  it('survives empty and missing input', () => {
    expect(parsePoints('')).toEqual([])
    expect(parsePoints(undefined)).toEqual([])
  })
})

describe('evaluateTasksArchive', () => {
  it('passes the intended split', () => {
    const v = evaluateTasksArchive({ tasksText: OPEN, archiveText: DONE })
    expect(v.block).toBe(false)
    expect(v.findings).toEqual([])
  })

  it('blocks a finished point left in the work order', () => {
    const v = evaluateTasksArchive({ tasksText: `${OPEN}${DONE}`, archiveText: '' })
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('ticked-not-archived')
    expect(v.findings[0].points).toEqual([7])
  })

  it('blocks an open point stranded in the archive — the silent-forgetting case', () => {
    const v = evaluateTasksArchive({ tasksText: '', archiveText: `${DONE}${OPEN}` })
    expect(v.block).toBe(true)
    expect(v.findings.map((f) => f.rule)).toContain('open-in-archive')
  })

  it('blocks a point that exists in both files — copied instead of moved', () => {
    const both = '- [x] 7. DID THE THING.\n'
    const v = evaluateTasksArchive({ tasksText: `${OPEN}${both}`, archiveText: DONE })
    expect(v.findings.map((f) => f.rule)).toContain('duplicate-point')
    expect(v.findings.find((f) => f.rule === 'duplicate-point').points).toEqual([7])
  })

  it('reports each fault separately rather than as one lump', () => {
    const v = evaluateTasksArchive({ tasksText: DONE, archiveText: OPEN })
    expect(v.findings).toHaveLength(2)
  })

  it('treats missing input as nothing to complain about', () => {
    expect(evaluateTasksArchive({}).block).toBe(false)
    expect(evaluateTasksArchive().block).toBe(false)
  })
})

describe('formatTasksArchiveVerdict', () => {
  it('says nothing when the split is intact', () => {
    expect(formatTasksArchiveVerdict({ block: false, findings: [] })).toBe('')
  })

  it('names the offending points and the repair', () => {
    const text = formatTasksArchiveVerdict(
      evaluateTasksArchive({ tasksText: `${OPEN}${DONE}`, archiveText: '' }),
    )
    expect(text).toContain('7')
    expect(text).toContain('docs/tasks-archive.md')
  })
})

describe('the real work order', () => {
  const root = resolve(process.cwd())
  it('is split as the rule requires', () => {
    const v = evaluateTasksArchive({
      tasksText: readFileSync(resolve(root, 'TASKS.md'), 'utf8'),
      archiveText: readFileSync(resolve(root, 'docs/tasks-archive.md'), 'utf8'),
    })
    expect(formatTasksArchiveVerdict(v)).toBe('')
    expect(v.block).toBe(false)
  })
})
