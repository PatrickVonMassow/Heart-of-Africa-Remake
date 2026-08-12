// THE DETERMINISTIC REPRODUCTION of the `giza (wet)` red (work-order 641), and
// the proof that the repaired statistic has neither that fault nor the blindness
// a plain spatial median would buy instead.
//
// The red itself was a rain streak crossing a measurement crop in one of the
// shots a band ratio takes (cropLuma.mjs carries the measurement that found it).
// A browser cannot be asked to put a streak in a chosen shot on demand — so the
// reproduction is done HERE, where the contamination is placed exactly and the
// arithmetic is the suite's own: build the crop the camera sees, contaminate it
// as the saved frames did, and run the ratio the check judges.
//
// THE FIXTURE IS CALIBRATED TO THE SAVED FRAMES, not chosen to make the repair
// look good: the streak's width is the ~14 px the frames show and its luminance
// is set so the crop's MEAN moves by the +11.37 % measured there
// (102.56 → 114.22). Every reading on record then falls out of the arithmetic to
// three decimals, which is what `reproduces the red` has to mean.
import { describe, it, expect } from 'vitest'
import { cropMedian, luminance, luminanceSamples, mean, median, shotReading } from './cropLuma.mjs'

const WIDTH = 150
const HEIGHT = 46

/** A crop of grey pixels, so a pixel's luminance IS the value asked for
 *  (0.35 + 0.5 + 0.15 = 1). `at(x, y)` gives the ground this crop draws. */
function crop(at) {
  const data = new Uint8Array(WIDTH * HEIGHT * 3)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = Math.max(0, Math.min(255, Math.round(at(x, y))))
      const i = (y * WIDTH + x) * 3
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    }
  }
  return data
}

/** The luminance samples of a crop, which is what the suite hands over. */
const samples = (at) => luminanceSamples(crop(at), { width: WIDTH, height: HEIGHT, channels: 3 })

/** The open desert ground outside giza as the crop measured it: ~102 with the
 *  distance gradient across the crop and a fixed, deterministic mottle. */
const groundAt = (scale = 1) => (x, y) =>
  (102.5 + (y - HEIGHT / 2) * 0.09 + Math.sin(x * 0.7 + y * 1.3) * 2.2) * scale

/** A rain streak: a bright near-vertical bar, the shape the saved frames show.
 *  14 px of the 150 at luminance 227 moves the crop's mean by the measured
 *  +11.37 %; `pixels` varies it to reproduce the partial hits on record. */
const withStreak = (base, pixels = 14, value = 227) => (x, y) =>
  x >= 68 && x < 68 + pixels ? value : base(x, y)

/** The band reaching into the crop's NEAR ROWS only — the genuine defect this
 *  check exists to catch, because the outside crop clears the band by 0.3 m.
 *  Rows are depth: the near rows are the bottom of the crop. */
const withLeak = (base, rows, tone = 0.18) => (x, y) =>
  y >= HEIGHT - rows ? base(x, y) * (1 - tone) : base(x, y)

/** The statistic that was tried and rejected: the crop's spatial median. Kept
 *  here as the counter-example, since `cropMedian` still serves the settle
 *  loop and nothing else. */
const spatialMedian = (s) => cropMedian(s)

/** The measured contamination of the saved frames: 114.22 / 102.56. */
const MEASURED_CONTAMINATION = 1.1137
/** The outside half of the criterion: the band cannot reach that ground at all. */
const OUTSIDE_BAR = 0.025
/** on / off / on, as the suite takes it. */
const ratio = (on1, off, on2) => (on1 + on2) / 2 / off

describe('luminance', () => {
  it('keeps the weights the settlement-edge measurement was calibrated with', () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(89.25, 6)
    expect(luminance(0, 255, 0)).toBeCloseTo(127.5, 6)
    expect(luminance(0, 0, 255)).toBeCloseTo(38.25, 6)
    // Grey in, grey out: the fixtures below rely on it.
    expect(luminance(100, 100, 100)).toBeCloseTo(100, 6)
  })
})

describe('median and mean', () => {
  it('median is the middle value, and averages the two middle ones on an even count', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('does not modify the array it is given', () => {
    const xs = [3, 1, 2]
    median(xs)
    mean(xs)
    expect(xs).toEqual([3, 1, 2])
  })

  it('mean is the arithmetic mean, and empty reads back as null', () => {
    expect(mean([1, 2, 6])).toBe(3)
    expect(mean([])).toBeNull()
  })
})

describe('the fixture reproduces the frames it is calibrated to', () => {
  it('moves the crop mean by the measured +11.37 %', () => {
    const clean = samples(groundAt(1))
    const streaked = samples(withStreak(groundAt(1)))
    expect(mean(streaked) / mean(clean)).toBeCloseTo(MEASURED_CONTAMINATION, 3)
  })
})

describe('the readings on record, from a single-picture MEAN', () => {
  // This is the OLD statistic — one picture per shot, read by its mean. Each
  // case is a reading the suite actually reported on 11.08.2026.
  const clean = () => mean(samples(groundAt(1)))
  const streaked = (pixels) => mean(samples(withStreak(groundAt(1), pixels)))

  it('gives ×1.057 when the streak lands in one of the two ON shots', () => {
    const red = ratio(streaked(14), clean(), clean())
    expect(red).toBeCloseTo(1.057, 3)
    expect(red - 1).toBeGreaterThan(OUTSIDE_BAR)
  })

  it('gives ×0.898 when the streak lands in the OFF shot', () => {
    const red = ratio(clean(), streaked(14), clean())
    expect(red).toBeCloseTo(0.898, 3)
    expect(1 - red).toBeGreaterThan(OUTSIDE_BAR)
  })

  it('brackets the ×0.963 on record with a 4–5 px sliver in the OFF shot', () => {
    // The reading that failed the run was a partial hit — the streak entering or
    // leaving the crop rather than crossing it whole.
    const four = ratio(clean(), streaked(4), clean())
    const five = ratio(clean(), streaked(5), clean())
    expect(four).toBeCloseTo(0.9686, 3)
    expect(five).toBeCloseTo(0.9607, 3)
    expect(five).toBeLessThan(0.963)
    expect(four).toBeGreaterThan(0.963)
    expect(1 - four).toBeGreaterThan(OUTSIDE_BAR) // even the narrower sliver reds
  })
})

describe('shotReading — the repaired statistic', () => {
  const clean = () => samples(groundAt(1))
  const streaked = (pixels = 14) => samples(withStreak(groundAt(1), pixels))

  it('is the crop mean itself when the reads agree, so nothing the check measures moved', () => {
    const reads = [clean(), clean(), clean(), clean(), clean()]
    expect(shotReading(reads)).toBeCloseTo(mean(clean()), 10)
  })

  it('drops a streak that crosses in a minority of the reads, wherever it sits', () => {
    const c = clean()
    const s = streaked()
    for (const reads of [
      [s, c, c, c, c],
      [c, c, s, c, c],
      [c, c, c, c, s],
      [s, s, c, c, c], // two of five: still cannot reach the middle value
      [c, s, c, s, c],
    ]) {
      expect(shotReading(reads) / mean(c) - 1).toBeCloseTo(0, 6)
    }
  })

  it('leaves the whole ratio green wherever a streak lands in the on/off/on triple', () => {
    const c = clean()
    const s = streaked()
    const cleanShot = shotReading([c, c, c, c, c])
    const dirtyShot = shotReading([c, s, c, c, c])
    for (const r of [
      ratio(dirtyShot, cleanShot, cleanShot),
      ratio(cleanShot, dirtyShot, cleanShot),
      ratio(cleanShot, cleanShot, dirtyShot),
      ratio(dirtyShot, cleanShot, dirtyShot),
    ]) {
      expect(Math.abs(1 - r)).toBeLessThan(OUTSIDE_BAR)
    }
  })

  it('still SEES a band leak over part of the crop, which a spatial median hides', () => {
    // The regression a plain spatial median would have introduced: the outside
    // crop clears the band by only 0.3 m, so a leak into the near rows is the
    // first genuine defect here — and it must read as a red, not as silence.
    const c = clean()
    for (const [rows, expected] of [[8, 0.968], [14, 0.944], [20, 0.921]]) {
      const leaked = samples(withLeak(groundAt(1), rows))
      const seen = shotReading([leaked, leaked, leaked, leaked, leaked]) / shotReading([c, c, c, c, c])
      expect(seen).toBeCloseTo(expected, 3)
      expect(1 - seen).toBeGreaterThan(OUTSIDE_BAR) // the check reds, as it must
      // The rejected statistic reports the smallest of them as untouched ground.
      if (rows === 8) expect(spatialMedian(leaked) / spatialMedian(c)).toBeCloseTo(1, 4)
    }
  })

  it('sees a leak even while a streak contaminates one of the reads', () => {
    const c = clean()
    const leaked = samples(withLeak(groundAt(1), 8))
    const leakedAndStreaked = samples(withStreak(withLeak(groundAt(1), 8)))
    const seen =
      shotReading([leaked, leakedAndStreaked, leaked, leaked, leaked]) / shotReading([c, c, c, c, c])
    expect(seen).toBeCloseTo(0.968, 3)
  })

  it('follows a whole-crop tone change exactly, which is the band\'s own effect', () => {
    const c = clean()
    // The village look darkens the swept ground by tone 0.28, giza's monument
    // look by 0.18. Either way it multiplies EVERY pixel of the crop.
    for (const tone of [0.18, 0.28]) {
      const swept = samples(groundAt(1 - tone))
      const read = shotReading([swept, swept, swept, swept, swept]) / shotReading([c, c, c, c, c])
      // Within the 8-bit quantisation of the fixture's own pixels — an order of
      // magnitude under the 0.04 the check separates on.
      expect(Math.abs(read - (1 - tone))).toBeLessThan(0.01)
    }
  })

  it('still separates the swept ground from the open land', () => {
    const c = clean()
    const swept = samples(groundAt(1 - 0.18)) // giza's tone, the weakest of the three kinds
    const inside = shotReading([swept, swept, swept, swept, swept]) / shotReading([c, c, c, c, c])
    expect(1 - inside).toBeGreaterThan(0.04)
  })

  it('reads back null rather than a number when the reads cannot be combined', () => {
    expect(shotReading([])).toBeNull()
    expect(shotReading(null)).toBeNull()
    expect(shotReading([new Float64Array(0)])).toBeNull()
    expect(shotReading([new Float64Array(3), new Float64Array(4)])).toBeNull()
  })
})

describe('cropMedian — the settle reading', () => {
  it('a streak crossing the crop barely moves it, so the settle loop is not restarted', () => {
    const clean = samples(groundAt(1))
    const streaked = samples(withStreak(groundAt(1)))
    expect(Math.abs(spatialMedian(streaked) / spatialMedian(clean) - 1)).toBeLessThan(0.01)
  })
})
