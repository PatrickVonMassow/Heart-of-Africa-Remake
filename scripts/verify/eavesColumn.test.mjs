import { describe, expect, it } from 'vitest'
import { judgeEavesColumn, judgeShelterRoof } from './eavesColumn.mjs'

// The measurement these cases are built from (point 549, at the cairo trade
// house standpoint {x -16.23, z -0.90} over 2842 consecutive frames): 2655
// frames read `ground-disc` 1.50 m under an eye at 1.50 m, 115 read a
// `BoxGeometry` 0.23–0.28 m under it and 72 a `ConeGeometry` at 1.17–1.47 m.
// The box is the crate a porter carries past; the cone is his robe.

/** A frame of the standing scene: clear ground under the eye, open sky over it. */
const clear = (camY = 1.5) => ({ camY, drop: camY, below: 'ground-disc', roofY: null, roofName: null })

/** A frame in which a passer-by holds the column `at` metres under the eye. */
const crossed = (at, name = 'BoxGeometry', camY = 1.5) => ({
  camY,
  drop: at,
  below: name,
  roofY: null,
  roofName: null,
})

const series = (n, make) => Array.from({ length: n }, (_, i) => make(i))

describe('judgeEavesColumn — the traffic that made the check rotate', () => {
  it('reads the standing ground through a porter crossing the column', () => {
    // 4 % of the frames carried the crate, exactly as measured.
    const frames = series(100, (i) => (i >= 40 && i < 44 ? crossed(0.26) : clear()))
    const v = judgeEavesColumn(frames)
    expect(v.belowClear).toBe(true)
    expect(v.farthestDrop).toBeCloseTo(1.5)
    expect(v.belowDetail).toContain('1.50 m down to ground-disc')
    // It NAMES what crossed and where, so the next rotation is diagnosable.
    expect(v.belowDetail).toContain('BoxGeometry×4')
    expect(v.belowDetail).toContain('0.26 m')
  })

  it('names every body that actually broke the criterion, with its span', () => {
    const frames = [
      ...series(50, () => clear()),
      ...series(6, () => crossed(0.23)),
      ...series(4, () => crossed(0.28)),
      // The porter's robe, measured at 1.17–1.47 m under the eye: it is INSIDE
      // the column but well beyond the 0.5 m slack, so it never breaks the
      // criterion and is not reported as a crossing.
      ...series(3, () => crossed(1.2, 'ConeGeometry')),
    ]
    const v = judgeEavesColumn(frames)
    expect(v.belowClear).toBe(true)
    expect(v.belowCrossings.map((c) => c.name)).toEqual(['BoxGeometry'])
    const box = v.belowCrossings[0]
    expect(box.frames).toBe(10)
    expect(box.min).toBeCloseTo(0.23)
    expect(box.max).toBeCloseTo(0.28)
    expect(v.belowDetail).toContain('0.23–0.28 m')
  })

  it('the ORDER of the crossing never changes the verdict', () => {
    const clean = series(20, () => clear())
    const dirty = series(4, () => crossed(0.26))
    const a = judgeEavesColumn([...dirty, ...clean])
    const b = judgeEavesColumn([...clean, ...dirty])
    expect(a.belowClear).toBe(b.belowClear)
    expect(a.farthestDrop).toBe(b.farthestDrop)
    expect(a.belowCrossings).toEqual(b.belowCrossings)
  })
})

describe('judgeEavesColumn — the defect the check exists to catch still fails', () => {
  it('fails when the eye is inside the roof in EVERY frame', () => {
    const roof = () => ({ camY: 1.85, drop: 0.2, below: 'hut-roof', roofY: null, roofName: null })
    const v = judgeEavesColumn(series(60, roof))
    expect(v.belowClear).toBe(false)
    expect(v.belowDetail).toContain('NOTHING CLEAR in any frame')
    expect(v.belowDetail).toContain('hut-roof')
  })

  it('fails on a hut-roof under the eye however far down it is', () => {
    // The name gate is independent of the distance gate, as in point 349.
    const v = judgeEavesColumn(series(30, () => ({ camY: 1.5, drop: 1.5, below: 'hut-roof', roofY: null })))
    expect(v.belowClear).toBe(false)
  })

  it('fails when nothing at all is drawn under him', () => {
    const v = judgeEavesColumn(series(30, () => ({ camY: 1.5, drop: null, below: null, roofY: null })))
    expect(v.belowClear).toBe(false)
    expect(v.farthestDrop).toBe(null)
    expect(v.belowDetail).toContain('nothing down to nothing')
  })

  it('fails when a body holds the column for the WHOLE window, and says so', () => {
    const v = judgeEavesColumn(series(40, () => crossed(0.26)))
    expect(v.belowClear).toBe(false)
    expect(v.belowDetail).toContain('NOTHING CLEAR in any frame')
    expect(v.belowDetail).toContain('BoxGeometry×40')
  })

  it('keeps the 0.5 m slack of point 349 exactly where it was', () => {
    const atBar = judgeEavesColumn([{ camY: 1.5, drop: 1.0, below: 'ground-disc', roofY: null }])
    const underBar = judgeEavesColumn([{ camY: 1.5, drop: 0.999, below: 'ground-disc', roofY: null }])
    expect(atBar.belowClear).toBe(true)
    expect(underBar.belowClear).toBe(false)
  })
})

describe('judgeEavesColumn — the roof over his head', () => {
  it('passes on open sky and reports it', () => {
    const v = judgeEavesColumn(series(20, () => clear()))
    expect(v.roofClears).toBe(true)
    expect(v.roofDetail).toContain('open sky')
  })

  it('passes a roof at the headroom and fails one below it', () => {
    const high = series(20, () => ({ camY: 1.5, drop: 1.5, below: 'ground-disc', roofY: 2.4, roofName: 'hut-roof' }))
    const low = series(20, () => ({ camY: 1.5, drop: 1.5, below: 'ground-disc', roofY: 1.6, roofName: 'hut-roof' }))
    expect(judgeEavesColumn(high).roofClears).toBe(true)
    expect(judgeEavesColumn(low).roofClears).toBe(false)
    expect(judgeEavesColumn(low).roofDetail).toContain('hut-roof')
  })

  it('reads past a body that briefly intercepts the upward ray', () => {
    const frames = series(40, (i) =>
      i === 12 || i === 13
        ? { camY: 1.5, drop: 1.5, below: 'ground-disc', roofY: 1.7, roofName: 'BoxGeometry' }
        : { camY: 1.5, drop: 1.5, below: 'ground-disc', roofY: 2.6, roofName: 'hut-roof' },
    )
    const v = judgeEavesColumn(frames)
    expect(v.roofClears).toBe(true)
    expect(v.roofDetail).toContain('2.60 m of hut-roof')
    expect(v.roofDetail).toContain('BoxGeometry×2')
  })
})

describe('judgeEavesColumn — a series that measured nothing never passes', () => {
  it('reports an empty series as measured nothing', () => {
    for (const empty of [[], null, undefined, [null, {}]]) {
      const v = judgeEavesColumn(empty)
      expect(v.belowClear).toBe(false)
      expect(v.roofClears).toBe(false)
      expect(v.belowDetail).toContain('MEASURED NOTHING')
    }
  })

  it('survives a malformed options argument', () => {
    expect(() => judgeEavesColumn([clear()], undefined)).not.toThrow()
    expect(judgeEavesColumn([clear()], {}).belowClear).toBe(true)
  })
})

describe('judgeShelterRoof', () => {
  const under = (y = 2.4, name = 'hut-roof') => ({ camY: 1.5, drop: 1.5, below: 'ground-disc', roofY: y, roofName: name })

  it('accepts a shelter roof that reads as a surface in some frame', () => {
    const v = judgeShelterRoof(series(30, () => under()))
    expect(v.ok).toBe(true)
    expect(v.detail).toContain('2.40 m of hut-roof')
  })

  it('reads past a villager who steps between the eye and the canopy', () => {
    const frames = series(30, (i) => (i < 5 ? under(1.6, 'SphereGeometry') : under()))
    const v = judgeShelterRoof(frames)
    expect(v.ok).toBe(true)
    expect(v.detail).toContain('SphereGeometry×5')
  })

  it('fails when the canopy is open sky throughout — the point-256 defect', () => {
    const v = judgeShelterRoof(series(30, () => ({ camY: 1.5, roofY: null, roofName: null })))
    expect(v.ok).toBe(false)
    expect(v.detail).toContain('no hut-roof')
  })

  it('fails a canopy hanging below the headroom', () => {
    expect(judgeShelterRoof(series(20, () => under(1.2))).ok).toBe(false)
  })

  it('reports an empty series as measured nothing', () => {
    expect(judgeShelterRoof([]).ok).toBe(false)
    expect(judgeShelterRoof([]).detail).toContain('MEASURED NOTHING')
  })
})
