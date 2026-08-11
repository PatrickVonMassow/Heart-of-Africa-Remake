// The blind-merge command as it is actually run — SPAWNED, with its exit code
// read (four-eyes finding on point 634: the accounting was covered, the command
// around it was not, and its exit code is the only thing a caller sees).
//
// The fixtures are written to a temp dir; nothing here touches the repository.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'blind-merge.mjs')

let dir = ''
const p = (name) => join(dir, name)
const write = (name, value) => {
  writeFileSync(p(name), typeof value === 'string' ? value : JSON.stringify(value))
  return p(name)
}

/** Run the command; never throws — the exit code is what is under test. */
const run = (...args) => {
  try {
    return {
      status: 0,
      out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', windowsHide: true }),
    }
  } catch (e) {
    return { status: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-blind-merge-'))
  write('A.json', {
    model: 'Opus 5',
    entries: [
      { id: 'A1', file: 'src/world/river.ts', defect: 'the ribbon tears at the delta' },
      { id: 'A2', file: 'src/ui/hud.tsx', defect: 'the health badge overlaps the date' },
    ],
  })
  write('B.txt', ['- B1 | src/ui/hud.tsx | the affliction badge sits on the date', 'VERDICT: merge'].join('\n'))
  write('U.json', {
    mergedBy: 'Fable 5',
    entries: [
      { id: 'U1', from: ['A1'] },
      { id: 'U2', from: ['A2', 'B1'], defect: 'the badge overlaps the date' },
    ],
  })
  write('U-dropped.json', { mergedBy: 'Fable 5', entries: [{ id: 'U1', from: ['A1'] }] })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('the command', () => {
  it('exits 0 on a union that accounts for every entry, and prints the record command', () => {
    const r = run('--a', p('A.json'), '--b', p('B.txt'), '--union', p('U.json'), '--merged-by', 'Fable 5')
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/every input entry accounted for/)
    expect(r.out).toMatch(/--merged-by "Fable 5"/)
    expect(r.out).toMatch(/--accounting "2 A \+ 1 B entries/)
  })

  it('takes the merger from the union file when the flag is absent — and echoes THAT name', () => {
    // It used to validate the union's name and then print --merged-by "".
    const r = run('--a', p('A.json'), '--b', p('B.txt'), '--union', p('U.json'))
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/--merged-by "Fable 5"/)
    expect(r.out).not.toMatch(/--merged-by ""/)
  })

  it('EXITS 1 AND NAMES THE DROPPED ENTRY', () => {
    const r = run('--a', p('A.json'), '--b', p('B.txt'), '--union', p('U-dropped.json'), '--merged-by', 'Fable 5')
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/A2 .*is in NO union entry/)
    expect(r.out).toMatch(/B1 .*is in NO union entry/)
    expect(r.out).not.toMatch(/record it:/)
  })

  it('exits 1 when the merger wrote one of the lists', () => {
    const r = run('--a', p('A.json'), '--b', p('B.txt'), '--union', p('U.json'), '--merged-by', 'Opus 5')
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/may not merge them/)
  })

  it('carries the two-model fallback into the printed record command', () => {
    const r = run(
      '--a',
      p('A.json'),
      '--b',
      p('B.txt'),
      '--union',
      p('U.json'),
      '--merged-by',
      'Opus 5',
      '--fallback',
      'GPT-5.6 Sol was unreachable in this session',
    )
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/TWO-MODEL fallback/)
    expect(r.out).toMatch(/--merge-fallback "GPT-5.6 Sol was unreachable/)
  })

  it('lists the pairs to decide when no union is given, and says the ranking is not the merge', () => {
    const r = run('--a', p('A.json'), '--b', p('B.txt'))
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/CANDIDATE PAIRS/)
    expect(r.out).toMatch(/A2 ↔ B1/)
    expect(r.out).toMatch(/RANKING, not the merge/)
  })

  it('refuses an unknown flag and a missing list rather than guessing', () => {
    expect(run('--a', p('A.json'), '--b', p('B.txt'), '--wibble', 'x').status).toBe(2)
    expect(run('--a', p('A.json')).status).toBe(2)
  })

  it('refuses a list whose entries cannot be counted', () => {
    const bad = write('bad.json', [{ file: 'x.ts', defect: 'no id on this one' }])
    const r = run('--a', bad, '--b', p('B.txt'))
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/no id/)
  })

  it('names the file it could not read instead of failing obscurely', () => {
    const r = run('--a', p('nope.json'), '--b', p('B.txt'))
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/cannot read .*nope\.json/)
  })
})
