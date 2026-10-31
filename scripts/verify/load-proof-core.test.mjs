// The two kinds of browser check (point 642): the lane-skip decision of a TIMING
// check, and the gate that keeps a STATE check from comparing two round trips.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { laneSkipVerdict, findSplitComparisons, laneSkips, laneFpsProbe, isWallCap } from './load-proof-core.mjs'
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

describe('laneSkips — the run summary counts what did not run', () => {
  it('counts each UNMEASURED check once, dropping the section tag of the inline copy', () => {
    const out = [
      'PASS  a — ok',
      'UNMEASURED  the return walk — lane delivered 900 of 10800 frames [--section=adult-errands]',
      'FAIL  b — red',
      'UNMEASURED  the return walk — lane delivered 900 of 10800 frames',
      'unmeasured checks: 1 (they did not run; not both-backend coverage)',
    ].join('\n')
    expect(laneSkips(out)).toEqual([{ name: 'the return walk', reason: 'lane delivered 900 of 10800 frames' }])
  })
  it('finds none in a run that answered everything', () => {
    expect(laneSkips('PASS  a — ok\nPASS  b — ok')).toEqual([])
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
  it('refuses destructured reads from two evaluations, and still passes one destructured evaluation', () => {
    const split = `
      const { x: a } = await page.evaluate(() => readPos())
      const { x: b } = await page.evaluate(() => readPos())
      check('position', a === b)
    `
    expect(findSplitComparisons(split)).toEqual([expect.objectContaining({ first: 'a', second: 'b', line: 4 })])
    const nested = `
      const [{ v: first } = {}] = await page.evaluate(() => [read()])
      const { ...rest } = await page.evaluate(() => read())
      check('n', rest.v > first)
    `
    expect(findSplitComparisons(nested)).toHaveLength(1)
    const one = `
      const { x: a, y: b } = await page.evaluate(() => ({ x: readPos(), y: readPos() }))
      const other = await page.evaluate(() => 1)
      check('position', a === b)
    `
    expect(findSplitComparisons(one)).toEqual([])
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

describe('laneFpsProbe — one hitch does not stand for the lane', () => {
  // Drives the probe with a scripted frame clock instead of a browser.
  const runWith = async (intervals) => {
    let t = 0
    let i = 0
    globalThis.requestAnimationFrame = (cb) => {
      const at = t
      t += intervals[Math.min(i++, intervals.length - 1)]
      queueMicrotask(() => cb(at))
    }
    try { return await laneFpsProbe(2000) } finally { delete globalThis.requestAnimationFrame }
  }
  it('reads the steady rate behind a 2.7 s hitch (measured 30.10.2026: 0.37 vs 17.2 fps)', async () => {
    const fps = await runWith([2700, ...Array(40).fill(58)])
    expect(fps).toBeGreaterThan(15)
  })
  it('still reads a genuinely slow lane as slow', async () => {
    expect(await runWith([2000])).toBeLessThan(1)
  })
  it('counts delivered frames over elapsed time, so an uneven qualifying lane qualifies', async () => {
    const pattern = [60, 60, 60, 16, 16]
    const fps = await runWith(Array.from({ length: 200 }, (_, i) => pattern[i % 5]))
    expect(fps).toBeCloseTo(23.6, 0)
    expect(laneSkipVerdict({ needFps: 20, measuredFps: fps }).skip).toBe(false)
  })
  it('answers by its own deadline when the frame clock stops delivering', async () => {
    let n = 0
    globalThis.requestAnimationFrame = (cb) => { if (n < 3) { const at = 16 * n++; queueMicrotask(() => cb(at)) } }
    try {
      const fps = await laneFpsProbe(20, 50)
      expect(fps).toBeLessThanOrEqual(40)
      expect(fps).toBeGreaterThan(30)
    } finally { delete globalThis.requestAnimationFrame }
    globalThis.requestAnimationFrame = () => {}
    try {
      const fps = await laneFpsProbe(20, 50)
      expect(fps).toBe(0)
      expect(laneSkipVerdict({ needFps: 10, measuredFps: fps }).skip).toBe(true)
    } finally { delete globalThis.requestAnimationFrame }
  })
  it('divides by the wall time that passed when the deadline timer fires late', async () => {
    let n = 0
    globalThis.requestAnimationFrame = (cb) => { if (n < 3) { const at = 16 * n++; queueMicrotask(() => cb(at)) } }
    const realSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (cb, ms) => realSetTimeout(cb, ms * 4)
    try {
      // 2 intervals over ~200 ms of wall time, not over the nominal 50 ms cap (40 fps).
      const fps = await laneFpsProbe(20, 50)
      expect(fps).toBeLessThanOrEqual(10.5)
      expect(fps).toBeGreaterThan(5)
    } finally {
      globalThis.setTimeout = realSetTimeout
      delete globalThis.requestAnimationFrame
    }
  })
})

describe('isWallCap — only a timeout is a lane that could not deliver', () => {
  it('classifies a Playwright timeout as wall-capped', () => {
    const e = new Error('page.waitForFunction: Timeout 30000ms exceeded.')
    e.name = 'TimeoutError'
    expect(isWallCap(e)).toBe(true)
  })
  it('keeps a throwing predicate and a serialisation error loud', () => {
    expect(isWallCap(new TypeError("Cannot read properties of undefined (reading 'getState')"))).toBe(false)
    expect(isWallCap(new Error('page.waitForFunction: ReferenceError: __moment is not defined'))).toBe(false)
    expect(isWallCap(undefined)).toBe(false)
  })
})
