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
import { describe, it, expect, beforeAll } from 'vitest'
import sharp from 'sharp'
import { join } from 'node:path'
import {
  READ_COUNT,
  READ_GAP_FRAMES,
  READ_GAP_MS,
  SETTLE_DROP_BRIGHTEST,
  SHOT_DRIFT_BAR,
  STREAK_LINGER_MS,
  luminance,
  luminanceSamples,
  maxContaminatedReads,
  mean,
  median,
  readsNeededToSurvive,
  settleReading,
  shotDrift,
  shotReading,
} from './cropLuma.mjs'

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

/** The statistic that was tried and REJECTED — the crop's spatial median. It is
 *  kept here as the counter-example each test measures against, and nothing in
 *  the suite reads a crop with it. */
const spatialMedian = (s) => median(s)

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
  // Pinned in ABSOLUTE luminance, not only as a ratio: a fixture with the right
  // ratio but the wrong crop brightness is not the crop the frames showed, and
  // every reading below is derived from these two numbers.
  it('is the crop the saved frames measured — 102.56 clean, 114.22 with the streak', () => {
    // Against the saved frames' own numbers, not against the fixture's: both
    // sit within 0.15 of a luminance point of what the browser measured.
    expect(Math.abs(mean(samples(groundAt(1))) - 102.56)).toBeLessThan(0.2)
    expect(Math.abs(mean(samples(withStreak(groundAt(1)))) - 114.22)).toBeLessThan(0.2)
  })

  it('moves the crop mean by the measured +11.37 %', () => {
    const clean = samples(groundAt(1))
    const streaked = samples(withStreak(groundAt(1)))
    expect(mean(streaked) / mean(clean)).toBeCloseTo(MEASURED_CONTAMINATION, 3)
  })

  it('puts the streak on the share of the crop the frames showed', () => {
    expect(14 / WIDTH).toBeCloseTo(0.093, 3)
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

  it('is unmoved by the pixels a burst of streaks can still contaminate', () => {
    // The residual the bound does not cover: several SEPARATE streaks can hit
    // one pixel in three of the five reads. That is a per-pixel event, and the
    // reading is a mean over 6900 of them — so the question is not whether a
    // pixel survives contaminated but what a share of them does to the number.
    // A pixel needs THREE of the five, and one streak now reaches only ONE
    // read, so it needs THREE separate crossings inside the ~7 s a shot spans,
    // all three over that same pixel. At the measured 30 crossings per 150 s a
    // read is contaminated ~28 % of the time and the streak covers ~7 % of the
    // crop, so a pixel is hit with p = 0.02 and three times with p = 1e-4:
    // ~1 pixel of the 6900. Half a percent of the crop is 30 times that, and
    // moves the reading 0.6 % — a quarter of the bar.
    const c = clean()
    const contaminate = (share) => {
      const reads = [0, 1, 2, 3, 4].map(() => Float64Array.from(c))
      const every = Math.round(1 / share)
      for (let i = 0; i < c.length; i += every) {
        for (const r of [reads[0], reads[1], reads[2]]) r[i] = 227 // three of five: it survives
      }
      return shotReading(reads)
    }
    const clean5 = shotReading([c, c, c, c, c])
    expect(Math.abs(contaminate(0.005) / clean5 - 1)).toBeLessThan(0.01)
    // AND WHERE IT WOULD STOP HOLDING, recorded rather than left to be found:
    // the residual reaches the bar at about 2 % of the crop's pixels, fifteen
    // times the expected share. A browser run that ever reddens here should be
    // measured against this number first.
    expect(Math.abs(contaminate(0.02) / clean5 - 1)).toBeLessThan(OUTSIDE_BAR)
    expect(Math.abs(contaminate(0.03) / clean5 - 1)).toBeGreaterThan(OUTSIDE_BAR)
  })

  it('reads back null rather than a number when the reads cannot be combined', () => {
    expect(shotReading([])).toBeNull()
    expect(shotReading(null)).toBeNull()
    expect(shotReading([new Float64Array(0)])).toBeNull()
    expect(shotReading([new Float64Array(3), new Float64Array(4)])).toBeNull()
  })
})

describe('settleReading — when the crop has stopped moving', () => {
  const clean = () => samples(groundAt(1))

  it('drops the bright end, so a rain streak cannot end the wait early', () => {
    const c = clean()
    for (const [pixels, bar] of [[14, 0.005], [25, 0.01]]) {
      const streaked = samples(withStreak(groundAt(1), pixels))
      expect(Math.abs(settleReading(streaked) / settleReading(c) - 1)).toBeLessThan(bar)
    }
  })

  it('SEES a leak arriving in part of the crop, which is what holds the wait open', () => {
    // The blindness a spatial median would have put in the settle loop: it would
    // call the crop settled while the leak was still arriving, and the reads
    // taken afterwards could then contain the finished leak in a minority.
    const c = clean()
    const leaked = samples(withLeak(groundAt(1), 8))
    expect(1 - settleReading(leaked) / settleReading(c)).toBeGreaterThan(0.025)
    expect(spatialMedian(leaked) / spatialMedian(c)).toBeCloseTo(1, 4)
  })

  it('is blind to a BRIGHTENING defect, which the measurement then still reports', () => {
    // The bounded cost of the one-sided trim, named and pinned rather than left
    // to be discovered: a defect that brightens a fifth of the crop or less can
    // hide from the settle reading. It cannot hide from the check, whose bar is
    // two-sided — so the loop may read a few frames early and the red still
    // comes out.
    const c = clean()
    const brightened = samples((x, y) => (y >= HEIGHT - 8 ? groundAt(1)(x, y) * 1.18 : groundAt(1)(x, y)))
    expect(Math.abs(settleReading(brightened) / settleReading(c) - 1)).toBeLessThan(0.005) // hidden here
    const seen = shotReading([brightened, brightened, brightened, brightened, brightened]) / shotReading([c, c, c, c, c])
    expect(seen - 1).toBeGreaterThan(OUTSIDE_BAR) // and reported there
  })

  it('trims the bright end only, so it cannot be a MEASUREMENT of the band', () => {
    // It is deliberately not the reading the check judges: the trim biases it.
    // This pins that nobody may quietly promote it to one.
    const c = clean()
    expect(settleReading(c)).toBeLessThan(mean(c))
    expect(SETTLE_DROP_BRIGHTEST).toBeGreaterThan(25 / 150) // clears the widest streak seen
  })
})

describe('the reads are spaced so a streak cannot reach the median', () => {
  // What stops a later edit from taking the reads back to three or closing the
  // gap: both would leave every test above green while making the statistic
  // fail on the very transient it was built for.
  it('one streak can reach fewer reads than the median needs', () => {
    expect(maxContaminatedReads()).toBeLessThan(readsNeededToSurvive())
  })

  it('the recorded constants are the ones that satisfy it', () => {
    expect(READ_COUNT).toBe(5)
    expect(READ_GAP_MS).toBe(600)
    expect(READ_GAP_FRAMES).toBe(12)
    expect(STREAK_LINGER_MS).toBe(270)
    expect(maxContaminatedReads()).toBe(1)
    expect(readsNeededToSurvive()).toBe(3)
  })

  it('fails for the edits that would silently break it', () => {
    // No gap at all: one streak spans every read.
    expect(maxContaminatedReads(STREAK_LINGER_MS, 0)).toBe(Infinity)
    // A gap under half the streak's life lets it reach three of five, whatever
    // that life turns out to be — the inequality, not today's numbers.
    expect(maxContaminatedReads(700, 300)).not.toBeLessThan(readsNeededToSurvive())
    // Three reads with a streak that outlives the gap: two ARE the median.
    expect(maxContaminatedReads(700, 600)).not.toBeLessThan(readsNeededToSurvive(3))
  })

  it('holds with margin at the measured bound, not just barely', () => {
    // The gap outlasts the streak twice over. The bound itself is 2x the
    // sampler's interval — what the measurement actually proves — so this margin
    // is on top of an already conservative number.
    expect(READ_GAP_MS / STREAK_LINGER_MS).toBeGreaterThan(2)
  })
})


// THE REAL CROPS, not a fixture built to argue (work-order 641). Two 150x46
// frames captured at giza in the rains by local/streak-probe.mjs: the cleanest
// and the most contaminated read of a 120 s series, same camera, same scene, one
// with a §19.13 streak falling through it. Everything above reasons on a
// generated crop, which is what makes the cases placeable; this block puts the
// same statistics on pixels nobody chose.
describe('the captured frames', () => {
  const load = async (name) => {
    // From the project root: under jsdom `import.meta.url` is not a file URL.
    const path = join(process.cwd(), 'scripts', 'verify', 'fixtures', `${name}.png`)
    const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true })
    return luminanceSamples(data, info)
  }
  let clean
  let streaked
  beforeAll(async () => {
    clean = await load('edge-crop-clean')
    streaked = await load('edge-crop-streaked')
  })

  it('is the crop the suite measures, at the luminance the frames showed', () => {
    expect(clean.length).toBe(WIDTH * HEIGHT)
    expect(mean(clean)).toBeCloseTo(102.68, 1)
    expect(mean(streaked)).toBeCloseTo(110.34, 1)
  })

  it('carries a streak over a MINORITY of the crop, which is the whole premise', () => {
    let lifted = 0
    for (let i = 0; i < clean.length; i++) if (streaked[i] - clean[i] > 20) lifted++
    expect(lifted / clean.length).toBeGreaterThan(0.02)
    expect(lifted / clean.length).toBeLessThan(0.5)
  })

  it('REDS the old single-picture mean, on real pixels', () => {
    // What the check reported before this point: the streak in one shot of the
    // on/off/on triple, on ground the band cannot reach.
    expect(1 - ratio(mean(clean), mean(streaked), mean(clean))).toBeGreaterThan(OUTSIDE_BAR)
    expect(ratio(mean(streaked), mean(clean), mean(clean)) - 1).toBeGreaterThan(OUTSIDE_BAR)
  })

  it('leaves the repaired statistic at the clean reading exactly', () => {
    const clean5 = shotReading([clean, clean, clean, clean, clean])
    expect(clean5).toBeCloseTo(mean(clean), 10)
    for (const reads of [
      [streaked, clean, clean, clean, clean],
      [clean, clean, streaked, clean, clean],
      [clean, clean, clean, clean, streaked],
      [streaked, streaked, clean, clean, clean], // two of five, the measured bound
    ]) {
      expect(shotReading(reads)).toBeCloseTo(clean5, 10)
    }
  })

  it('barely moves the settle reading, so the wait is not restarted by rain', () => {
    expect(settleReading(streaked) / settleReading(clean) - 1).toBeLessThan(0.005)
  })

  it('is what the generated fixture stands in for', () => {
    // The generated crop must be the same ground, or the placeable cases above
    // are arguing about a different picture.
    expect(Math.abs(mean(samples(groundAt(1))) - mean(clean))).toBeLessThan(0.5)
  })
})


// THE SEQUENCE THE MEDIAN WOULD ERASE, and the guard that refuses it. A defect
// arriving AFTER the settle and lasting only the last reads is dropped by
// shotReading exactly as the rain is — and the settle loop cannot be the
// backstop for a BRIGHTENING one, because its trim is one-sided by design.
describe('shotDrift — the scene must not move while the shot is taken', () => {
  const clean = () => samples(groundAt(1))
  const streaked = () => samples(withStreak(groundAt(1)))
  // A defect over the near rows, in both signs: the leak the band can spring,
  // and the brightening the settle reading is blind to.
  const darker = () => samples(withLeak(groundAt(1), 8))
  const brighter = () => samples((x, y) => (y >= HEIGHT - 8 ? groundAt(1)(x, y) * 1.18 : groundAt(1)(x, y)))

  it('is zero on a scene that stood still', () => {
    const c = clean()
    expect(shotDrift([c, c, c, c, c])).toBeCloseTo(0, 12)
  })

  it('is unmoved by the rain, which is what lets it be a bar at all', () => {
    const c = clean()
    const s = streaked()
    for (const reads of [
      [s, c, c, c, c],
      [c, c, s, c, c],
      [c, c, c, c, s],
      [s, c, c, c, s],
    ]) {
      expect(shotDrift(reads)).toBeLessThan(SHOT_DRIFT_BAR)
    }
  })

  it('CATCHES a defect arriving in the last two reads, in either sign', () => {
    const c = clean()
    for (const late of [brighter(), darker()]) {
      const reads = [c, c, c, late, late]
      // The reading alone cannot see it — that is precisely the hole.
      expect(shotReading(reads)).toBeCloseTo(shotReading([c, c, c, c, c]), 10)
      // The drift does, and the shot is refused rather than measured.
      expect(shotDrift(reads)).toBeGreaterThan(SHOT_DRIFT_BAR)
    }
  })

  it('catches it arriving mid-shot as well as at the end', () => {
    const c = clean()
    const late = brighter()
    expect(shotDrift([c, c, late, late, late])).toBeGreaterThan(SHOT_DRIFT_BAR)
  })

  it('does not fire on a defect that was there for the whole shot', () => {
    // Present throughout is not drift — it is the measurement, and it must
    // reach the criterion rather than be thrown away as an unstable shot.
    const leaked = darker()
    expect(shotDrift([leaked, leaked, leaked, leaked, leaked])).toBeCloseTo(0, 12)
  })

  it('sits well clear of what a settled scene actually does', () => {
    // Measured over 54 shots of a full run: median 0.007 %, maximum 0.111 %.
    expect(SHOT_DRIFT_BAR).toBeGreaterThan(0.00111 * 5)
    expect(SHOT_DRIFT_BAR).toBeLessThan(OUTSIDE_BAR)
  })

  it('reads back null rather than a number when it cannot be computed', () => {
    expect(shotDrift([])).toBeNull()
    expect(shotDrift(null)).toBeNull()
    expect(shotDrift([new Float64Array(3), new Float64Array(3)])).toBeNull()
  })
})
