// THE DETERMINISTIC REPRODUCTION of the `giza (wet)` red (work-order 641), and
// the proof that the repaired statistic does not have it.
//
// The red itself was a rain streak crossing a measurement crop in ONE of the
// three shots a band ratio takes (see cropLuma.mjs for the measurement that
// found it: +11.4 % on the crop's mean, eleven times in 150 s, on a scene whose
// light never moved). A browser cannot be asked to put a streak in a chosen shot
// on demand — so the reproduction is done HERE, where the contamination is
// placed exactly and the arithmetic is the suite's own: build the crop the
// camera sees, add the streak the frames showed, and run the ratio the check
// judges. With the mean it reproduces the recorded reds (×1.057 and ×0.90) every
// time; with the median it is gone.
import { describe, it, expect } from 'vitest'
import { cropLuminance, luminance, luminanceSamples, median, shotReading } from './cropLuma.mjs'

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
  return { data, info: { width: WIDTH, height: HEIGHT, channels: 3 } }
}

/** The open desert ground outside giza as the crop measured it: ~102 with the
 *  distance gradient across the crop and a fixed, deterministic mottle. */
const groundAt = (scale = 1) => (x, y) =>
  (102.5 + (y - HEIGHT / 2) * 0.09 + Math.sin(x * 0.7 + y * 1.3) * 2.2) * scale

/** Add a rain streak: a bright near-vertical bar `pixels` wide, the shape the
 *  saved frames show (~14 px of the 150, luminance ~235 against ~102 ground). */
const withStreak = (base, pixels = 14, value = 235) => (x, y) =>
  x >= 68 && x < 68 + pixels ? value : base(x, y)

const meanOf = (values) => {
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}
const cropMean = ({ data, info }) => meanOf(luminanceSamples(data, info))

describe('luminance', () => {
  it('keeps the weights the settlement-edge measurement was calibrated with', () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(89.25, 6)
    expect(luminance(0, 255, 0)).toBeCloseTo(127.5, 6)
    expect(luminance(0, 0, 255)).toBeCloseTo(38.25, 6)
    // Grey in, grey out: the fixtures below rely on it.
    expect(luminance(100, 100, 100)).toBeCloseTo(100, 6)
  })
})

describe('median', () => {
  it('is the middle value, and averages the two middle ones on an even count', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  it('does not modify the array it is given', () => {
    const xs = [3, 1, 2]
    median(xs)
    expect(xs).toEqual([3, 1, 2])
  })
})

describe('cropLuminance — what the edge band does', () => {
  it('follows a whole-crop tone change exactly, which is the band\'s own effect', () => {
    const open = crop(groundAt(1))
    // The village look darkens the swept ground by tone 0.28; giza's monument
    // look by 0.18. Either way it multiplies EVERY pixel of the crop.
    for (const tone of [0.18, 0.28]) {
      const swept = crop(groundAt(1 - tone))
      const read = cropLuminance(swept.data, swept.info) / cropLuminance(open.data, open.info)
      // Within the 8-bit quantisation of the fixture's own pixels — an order of
      // magnitude under the 0.04 the check separates on.
      expect(Math.abs(read - (1 - tone))).toBeLessThan(0.01)
    }
  })

  it('reads the same crop as the mean did while nothing is in the way', () => {
    const open = crop(groundAt(1))
    expect(cropLuminance(open.data, open.info)).toBeCloseTo(cropMean(open), 0)
  })
})

describe('cropLuminance — a rain streak through the crop', () => {
  it('reproduces the measured +11 % on the MEAN and stays inside 1 %', () => {
    const clean = crop(groundAt(1))
    const streaked = crop(withStreak(groundAt(1)))
    const meanShift = cropMean(streaked) / cropMean(clean) - 1
    const medianShift = cropLuminance(streaked.data, streaked.info) / cropLuminance(clean.data, clean.info) - 1
    // The fixture is calibrated against the frames saved at giza: mean
    // 102.56 → 114.22, median 102.60 → 103.30.
    expect(meanShift).toBeGreaterThan(0.1)
    expect(Math.abs(medianShift)).toBeLessThan(0.01)
  })

  it('degrades gracefully as the streak widens, where the mean does not', () => {
    const clean = crop(groundAt(1))
    // The measured streak is ~14 px of the 150. Beyond twice that the median
    // starts to walk down the crop's own luminance spread — but it is still
    // inside the check's bar where the mean is already five times past it.
    for (const [pixels, bar] of [[8, 0.01], [14, 0.01], [25, 0.01], [50, 0.025]]) {
      const streaked = crop(withStreak(groundAt(1), pixels))
      const shift = cropLuminance(streaked.data, streaked.info) / cropLuminance(clean.data, clean.info) - 1
      expect(Math.abs(shift)).toBeLessThan(bar)
      expect(cropMean(streaked) / cropMean(clean) - 1).toBeGreaterThan(Math.abs(shift))
    }
  })
})

describe('the band ratio the check judges', () => {
  // The suite reads each crop three times per shot and takes on/off/on; the
  // "outside" half of the criterion demands |1 - ratio| < 0.025 there, because
  // the band cannot reach that ground at all.
  const OUTSIDE_BAR = 0.025
  const ratio = (on1, off, on2) => (on1 + on2) / 2 / off

  const cleanShot = () => {
    const c = crop(groundAt(1))
    return { mean: cropMean(c), median: cropLuminance(c.data, c.info) }
  }
  const streakShot = () => {
    const c = crop(withStreak(groundAt(1)))
    return { mean: cropMean(c), median: cropLuminance(c.data, c.info) }
  }

  it('REDS on the mean when a streak lands in one of the two ON shots (the ×1.057 on record)', () => {
    const clean = cleanShot()
    const streak = streakShot()
    const red = ratio(streak.mean, clean.mean, clean.mean)
    expect(red).toBeGreaterThan(1 + OUTSIDE_BAR)
    expect(red).toBeCloseTo(1.057, 1)
  })

  it('REDS on the mean when the streak lands in the OFF shot (the ×0.963/×0.980 on record)', () => {
    const clean = cleanShot()
    const streak = streakShot()
    expect(1 - ratio(clean.mean, streak.mean, clean.mean)).toBeGreaterThan(OUTSIDE_BAR)
  })

  it('is GREEN on the median wherever the streak lands', () => {
    const clean = cleanShot()
    const streak = streakShot()
    for (const r of [
      ratio(streak.median, clean.median, clean.median),
      ratio(clean.median, streak.median, clean.median),
      ratio(clean.median, clean.median, streak.median),
      ratio(streak.median, clean.median, streak.median),
    ]) {
      expect(Math.abs(1 - r)).toBeLessThan(OUTSIDE_BAR)
    }
  })

  it('still separates the swept ground from the open land after the repair', () => {
    // giza's monument tone, the weakest of the three kinds.
    const open = crop(groundAt(1))
    const swept = crop(groundAt(1 - 0.18))
    const inside = cropLuminance(swept.data, swept.info) / cropLuminance(open.data, open.info)
    expect(1 - inside).toBeGreaterThan(0.04)
  })
})

describe('shotReading', () => {
  it('drops a single read taken while a streak crossed the crop', () => {
    const clean = cropLuminance(crop(groundAt(1)).data, crop(groundAt(1)).info)
    const streaked = crop(withStreak(groundAt(1)))
    const dirty = cropLuminance(streaked.data, streaked.info)
    expect(shotReading([clean, dirty, clean])).toBe(clean)
    expect(shotReading([dirty, clean, clean])).toBe(clean)
  })

  it('reports the reading itself when the three reads agree', () => {
    expect(shotReading([102.5, 102.6, 102.55])).toBeCloseTo(102.55, 6)
  })
})
