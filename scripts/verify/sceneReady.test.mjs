import { describe, it, expect } from 'vitest'
import {
  SCENE_READY_DEFAULTS,
  awaitSceneReady,
  formatSceneReadyFailure,
  formatSceneReadyPass,
  judgeSceneReady,
  needsSceneReady,
} from './sceneReady-core.mjs'

/** A sample series ending at `end`, one reading every `stepMs`, values from `fn`. */
function series({ end = 100000, stepMs = 500, count = 20, drawCalls, triangles }) {
  const out = []
  for (let i = count - 1; i >= 0; i--) {
    const t = end - i * stepMs
    const k = count - 1 - i
    out.push({
      t,
      drawCalls: typeof drawCalls === 'function' ? drawCalls(k) : drawCalls,
      triangles: typeof triangles === 'function' ? triangles(k) : triangles,
    })
  }
  return out
}

describe('needsSceneReady', () => {
  it('waits for every subject that lives in the drawn scene', () => {
    for (const kind of ['world', 'local', 'place', 'general']) expect(needsSceneReady({ kind })).toBe(true)
  })

  it('does not hold up a HUD element frame', () => {
    expect(needsSceneReady({ kind: 'element' })).toBe(false)
  })

  it('lets a frame state it either way', () => {
    expect(needsSceneReady({ kind: 'element', sceneReady: true })).toBe(true)
    expect(needsSceneReady({ kind: 'world', sceneReady: false })).toBe(false)
  })

  it('is total on missing input', () => {
    expect(needsSceneReady(null)).toBe(true)
    expect(needsSceneReady(undefined)).toBe(true)
  })
})

describe('judgeSceneReady', () => {
  const now = 100000

  it('calls a RISING count not ready — the measured blank-frame case', () => {
    // The container-host curve of point 489: 5.5k triangles climbing toward 745k.
    const v = judgeSceneReady(
      series({ end: now, count: 12, drawCalls: (k) => 99 + k * 10, triangles: (k) => 5500 + k * 60000 }),
      { now },
    )
    expect(v.ready).toBe(false)
    expect(v.reason).toMatch(/triangle count is still moving/)
  })

  it('calls a SETTLED count ready, naming what it read', () => {
    const v = judgeSceneReady(series({ end: now, count: 12, drawCalls: 458, triangles: 2676537 }), { now })
    expect(v.ready).toBe(true)
    expect(v.triangles.max).toBe(2676537)
    expect(v.drawCalls.max).toBe(458)
    expect(v.reason).toMatch(/held still/)
  })

  it('tolerates the jitter a FINISHED scene never loses', () => {
    // Measured at Victoria Falls once built: wildlife and culling move the counts
    // by a couple of per cent while nothing streams in any more.
    const v = judgeSceneReady(
      series({ end: now, count: 12, drawCalls: (k) => 348 + (k % 3), triangles: (k) => 3100000 + (k % 4) * 12000 }),
      { now },
    )
    expect(v.ready).toBe(true)
  })

  it('refuses a scene that only FELL — an unloading region is no finished picture', () => {
    const v = judgeSceneReady(
      series({ end: now, count: 12, drawCalls: (k) => 600 - k * 15, triangles: (k) => 3200000 - k * 40000 }),
      { now },
    )
    expect(v.ready).toBe(false)
    expect(v.reason).toMatch(/still moving/)
  })

  it('refuses a picture that is empty however still it stands', () => {
    const v = judgeSceneReady(series({ end: now, count: 12, drawCalls: 99, triangles: 5500 }), { now })
    expect(v.ready).toBe(false)
    expect(v.reason).toMatch(/empty paper/)
  })

  it('refuses a window shorter than the quiet time it asks for', () => {
    const v = judgeSceneReady(series({ end: now, count: 4, stepMs: 300, drawCalls: 458, triangles: 900000 }), { now })
    expect(v.ready).toBe(false)
    expect(v.reason).toMatch(/stood still for only/)
  })

  it('refuses too few readings to describe a window', () => {
    const v = judgeSceneReady(
      [
        { t: now - 6000, drawCalls: 458, triangles: 900000 },
        { t: now - 100, drawCalls: 458, triangles: 900000 },
      ],
      { now },
    )
    expect(v.ready).toBe(false)
    expect(v.samples).toBe(2)
  })

  it('only judges the trailing window — an old build-up cannot hold a settled scene back', () => {
    const old = series({ end: now - 20000, count: 10, drawCalls: (k) => k * 40, triangles: (k) => k * 200000 })
    const fresh = series({ end: now, count: 12, drawCalls: 458, triangles: 2676537 })
    expect(judgeSceneReady([...old, ...fresh], { now }).ready).toBe(true)
  })

  it('reports a page with no drawn frame at all', () => {
    expect(judgeSceneReady([], { now }).reason).toMatch(/not been sampled/)
    expect(judgeSceneReady(series({ end: now, count: 12, drawCalls: 0, triangles: 0 }), { now }).reason).toMatch(/no frame has been drawn/)
  })

  it('separates "cannot be judged" from "not ready"', () => {
    const v = judgeSceneReady(null, { now })
    expect(v.ready).toBe(false)
    expect(v.unavailable).toBe(true)
    expect(v.reason).toMatch(/__renderer/)
  })

  it('honours a caller-widened quiet window and tolerance', () => {
    const wobbly = series({ end: now, count: 12, drawCalls: 400, triangles: (k) => 1000000 + (k % 2) * 150000 })
    expect(judgeSceneReady(wobbly, { now }).ready).toBe(false)
    expect(judgeSceneReady(wobbly, { now, tolerance: 0.2 }).ready).toBe(true)
  })

  it('survives junk in the buffer', () => {
    const v = judgeSceneReady([null, { t: 'x' }, ...series({ end: now, count: 12, drawCalls: 458, triangles: 900000 })], { now })
    expect(v.ready).toBe(true)
  })
})

describe('awaitSceneReady', () => {
  /** A fake clock: `sleep` is the only thing that moves it. */
  function fakeClock(start = 0) {
    let t = start
    return { now: () => t, sleep: async (ms) => { t += ms } }
  }

  it('returns as soon as the counts settle, reporting how long it waited', async () => {
    const clock = fakeClock(100000)
    let call = 0
    const r = await awaitSceneReady({
      ...clock,
      read: () => {
        call++
        const settled = call >= 5
        return series({
          end: clock.now(),
          count: 12,
          drawCalls: settled ? 458 : (k) => 99 + k * 20,
          triangles: settled ? 2676537 : (k) => 5500 + k * 70000,
        })
      },
    })
    expect(r.ready).toBe(true)
    expect(r.timedOut).toBe(false)
    expect(r.waitedMs).toBe(4 * SCENE_READY_DEFAULTS.pollMs)
  })

  it('does not wait at all for a scene that is already standing still', async () => {
    const clock = fakeClock(100000)
    const r = await awaitSceneReady({
      ...clock,
      read: () => series({ end: clock.now(), count: 12, drawCalls: 458, triangles: 2676537 }),
    })
    expect(r.ready).toBe(true)
    expect(r.waitedMs).toBe(0)
  })

  it('TIMES OUT on a scene that never settles, and says what it last read', async () => {
    const clock = fakeClock(0)
    const r = await awaitSceneReady({
      ...clock,
      timeoutMs: 10000,
      // Every window it is handed is still climbing, however long it waits.
      read: () => series({ end: clock.now(), count: 12, drawCalls: (k) => 100 + k * 20, triangles: (k) => 5000 + k * 100000 }),
    })
    expect(r.ready).toBe(false)
    expect(r.timedOut).toBe(true)
    expect(r.waitedMs).toBeGreaterThanOrEqual(10000)
    expect(r.reason).toMatch(/still moving|empty paper|stood still for only/)
  })

  it('gives up at once when the page has no renderer to sample', async () => {
    const clock = fakeClock(0)
    const r = await awaitSceneReady({ ...clock, read: () => null })
    expect(r.unavailable).toBe(true)
    expect(r.timedOut).toBe(false)
    expect(r.waitedMs).toBe(0)
  })
})

describe('the reported verdicts', () => {
  it('refuse loudly in the shape the run triage parses, and say the frame was not written', () => {
    const v = { ...judgeSceneReady([], { now: 0 }), waitedMs: 120000 }
    const msg = formatSceneReadyFailure('18-worldmodel-bambara-village-niger', v)
    expect(msg.split('\n')[0]).toMatch(/^FAIL {2}frame 18-worldmodel-bambara-village-niger — /)
    expect(msg).toMatch(/NOT written/)
  })

  it('note the readings a passed frame was taken on', () => {
    const v = { ...judgeSceneReady(series({ end: 100000, count: 12, drawCalls: 458, triangles: 2676537 }), { now: 100000 }), waitedMs: 1500 }
    expect(formatSceneReadyPass(v)).toContain('458 draw calls / 2676537 triangles')
    expect(formatSceneReadyPass({ unavailable: true })).toMatch(/not judged/)
    expect(formatSceneReadyPass(null)).toBe('')
  })
})
