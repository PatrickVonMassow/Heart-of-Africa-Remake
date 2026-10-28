// The two kinds of browser check (point 642): the lane-skip decision of a TIMING
// check, and the gate that keeps a STATE check from comparing two round trips.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { laneSkipVerdict, findSplitComparisons } from './load-proof-core.mjs'
import { REPO_ROOT } from '../repo-paths.mjs'

describe('laneSkipVerdict — a timing check declares the throughput it needs', () => {
  it('skips below the declared rate and names the measured rate', () => {
    const v = laneSkipVerdict({ needFps: 20, measuredFps: 1.2 })
    expect(v.skip).toBe(true)
    expect(v.reason).toMatch(/1\.2 fps/)
    expect(v.reason).toMatch(/needs 20 fps/)
  })
  it('never skips on a lane that meets the rate, the boundary included', () => {
    expect(laneSkipVerdict({ needFps: 20, measuredFps: 20 }).skip).toBe(false)
    expect(laneSkipVerdict({ needFps: 20, measuredFps: 58.4 }).skip).toBe(false)
  })
  it('runs the check for real when the rate was never measured', () => {
    expect(laneSkipVerdict({ needFps: 20, measuredFps: null }).skip).toBe(false)
    expect(laneSkipVerdict({ needFps: 20, measuredFps: Number.NaN }).skip).toBe(false)
  })
  it('refuses a check that declares no positive throughput', () => {
    expect(() => laneSkipVerdict({ needFps: 0, measuredFps: 30 })).toThrow(/needFps/)
    expect(() => laneSkipVerdict({ measuredFps: 30 })).toThrow(/needFps/)
  })
})

describe('findSplitComparisons — the gate over two-round-trip comparisons', () => {
  it('refuses a comparison assembled from two consecutive evaluate reads', () => {
    const src = `
      const label = await page.evaluate(() => readLabel())
      const anchor = await page.evaluate(() => readAnchor())
      check('label sits on its anchor', Math.abs(label.x - anchor.x) < 4)
    `
    const found = findSplitComparisons(src)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ first: 'label', second: 'anchor', line: 4 })
  })
  it('passes the fixed shape: both sides read in ONE evaluation', () => {
    const src = `
      const { label, anchor } = await page.evaluate(() => ({ label: readLabel(), anchor: readAnchor() }))
      check('label sits on its anchor', Math.abs(label.x - anchor.x) < 4)
    `
    expect(findSplitComparisons(src)).toEqual([])
  })
  it('passes a before/after pair with an action between the reads', () => {
    const src = `
      const before = await page.evaluate(() => count())
      await page.keyboard.press('KeyL')
      const after = await page.evaluate(() => count())
      check('the press adds one', after === before + 1)
    `
    expect(findSplitComparisons(src)).toEqual([])
  })
  it('finds the shape inside a nested block, either operand order', () => {
    const src = `
      if (section('x')) {
        for (const p of ps) {
          const a = await page.evaluate(() => 1)
          const b = await other.evaluate(() => 2)
          check('n', b >= a)
        }
      }
    `
    expect(findSplitComparisons(src)).toHaveLength(1)
  })
})

// The sites the sweep deliberately LEFT, each with its kind. A read of a value that
// cannot change between the two round trips (a language string, a balance constant)
// is no moment at all, so load cannot skew the comparison.
const LEFT = [
  { file: 'enrichments.mjs', first: 'strings', second: 'pressed', kind: 'constant read: language-file strings' },
  { file: 'polish-speech.mjs', first: 'alongLine', second: 'minSeparation', kind: 'constant read: balance value' },
]

describe('the verify sources carry no two-round-trip comparison (point 642 gate)', () => {
  const dir = join(REPO_ROOT, 'scripts', 'verify')
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
  it('scans the suites', () => {
    expect(files.length).toBeGreaterThan(50)
  })
  it('finds none outside the named, classified exceptions', () => {
    const found = []
    for (const f of files) {
      for (const x of findSplitComparisons(readFileSync(join(dir, f), 'utf8'), f)) {
        if (!LEFT.some((l) => l.file === f && l.first === x.first && l.second === x.second)) {
          found.push(`${f}:${x.line} ${x.first}/${x.second}: ${x.text}`)
        }
      }
    }
    expect(found, 'read both sides in ONE page.evaluate (scripts/verify/load-proof-core.mjs)').toEqual([])
  })
  it('keeps no stale exception', () => {
    for (const l of LEFT) {
      const hits = findSplitComparisons(readFileSync(join(dir, l.file), 'utf8'), l.file)
      expect(hits.some((x) => x.first === l.first && x.second === l.second), `${l.file} ${l.first}/${l.second}`).toBe(true)
    }
  })
})
