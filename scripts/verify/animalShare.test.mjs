// The lurking-crocodile criterion (point 382). The browser half — staging a
// crocodile on a river cell and photographing three frames — lives in
// enrichments.mjs; what is decidable without a browser is pinned here, above all
// the property the point demands be PROVEN rather than argued: a body that stays
// water-coloured through the strike must still turn the check red.
import { describe, it, expect } from 'vitest'
import { animalShare, readsAsAnimal, waterFloor, ANIMAL_SIGMAS } from './animalShare.mjs'

/** Build a raw RGB sample of `w`x`h` from a per-pixel colour function. */
const rect = (w, h, at) => {
  const data = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = at(x, y)
      const i = (y * w + x) * 3
      data[i] = r; data[i + 1] = g; data[i + 2] = b
    }
  }
  return { data, n: w * h, ch: 3 }
}
// A deterministic ±`amp` wobble, so "water" has its own spread like the river does.
const wobble = (x, y, amp) => (((x * 7 + y * 13) % 11) - 5) * (amp / 5)
const WATER = [18, 82, 102]
const water = (w, h, amp = 3) => rect(w, h, (x, y) => WATER.map((c) => c + wobble(x, y, amp)))
/** Water with a dark crocodile body over the left `frac` of the rect. */
const withBody = (w, h, frac, body = [60, 62, 40], amp = 3) =>
  rect(w, h, (x, y) => (x < w * frac ? body : WATER.map((c) => c + wobble(x, y, amp))))

describe('animalShare — what reads as animal rather than as water', () => {
  it('reports nothing on plain water, however much it wobbles', () => {
    expect(animalShare(water(60, 40, 3)).share).toBe(0)
    expect(animalShare(water(60, 40, 8)).share).toBe(0)
  })

  it('reports the body it can see, as a share of the rect', () => {
    const a = animalShare(withBody(100, 40, 0.3))
    expect(a.share).toBeGreaterThan(0.28)
    expect(a.share).toBeLessThan(0.32)
  })

  it('is SCALE-FREE: stretching every colour distance leaves the share untouched', () => {
    const base = withBody(100, 40, 0.3)
    // The same picture with every distance from the water colour multiplied by
    // 0.35 — a washed-out, low-contrast frame such as a hazy sky or a different
    // backend produces. An absolute channel delta would collapse by two thirds.
    const faded = rect(100, 40, (x, y) => {
      const i = (y * 100 + x) * 3
      return [0, 1, 2].map((c) => Math.round(WATER[c] + (base.data[i + c] - WATER[c]) * 0.35))
    })
    expect(animalShare(faded).share).toBeCloseTo(animalShare(base).share, 5)
  })

  it('is offset-free: brightening the whole rect leaves the share untouched', () => {
    const base = withBody(100, 40, 0.3)
    const bright = rect(100, 40, (x, y) => {
      const i = (y * 100 + x) * 3
      return [0, 1, 2].map((c) => Math.min(255, base.data[i + c] + 40))
    })
    expect(animalShare(bright).share).toBeCloseTo(animalShare(base).share, 5)
  })

  it('treats bright foam as water — and keeps it out of the reference colour', () => {
    // The old measure excluded foam from the COUNT but left it in the MEAN, so a
    // rect with foam in it reported nearly every water pixel as crocodile.
    const foamy = rect(100, 40, (x, y) => (x < 20 ? [250, 252, 255] : WATER.map((c) => c + wobble(x, y, 3))))
    expect(animalShare(foamy).share).toBe(0)
  })

  it('refuses to answer when the rect is not water enough to measure', () => {
    const mostlyFoam = rect(100, 40, (x) => (x < 60 ? [250, 252, 255] : WATER))
    expect(animalShare(mostlyFoam).share).toBeNull()
  })

  it('has no hidden dependence on the rect size', () => {
    expect(animalShare(withBody(40, 20, 0.3)).share).toBeCloseTo(animalShare(withBody(200, 100, 0.3)).share, 2)
  })

  it('needs more separation as sigmas rise, and never counts water', () => {
    expect(animalShare(water(60, 40, 3), 3).share).toBe(0)
    expect(animalShare(withBody(100, 40, 0.3), ANIMAL_SIGMAS * 2).share).toBeGreaterThan(0.28)
  })
})

describe('the criterion, and its teeth', () => {
  const floorOfCleanWater = waterFloor(0, 19873) // the measured croc-free reading

  it('passes the striking body measured in the game', () => {
    // 0.303-0.316 over twelve staged repeats on a quiet machine, WebGL 2 and
    // WebGPU alike — the extremes of that spread and one from the middle.
    for (const share of [0.30307, 0.31143, 0.31586]) {
      expect(readsAsAnimal({ share }, floorOfCleanWater)).toBe(true)
    }
  })

  it('STILL FAILS a body that stays water-coloured through the strike', () => {
    // The point-382 demand: feed the criterion the HIDDEN frame — the same
    // crocodile rendering as water — and it must say no. These are the measured
    // hidden readings, fed into the strike slot.
    for (const share of [0, 0.0002, 0.00046]) {
      expect(readsAsAnimal({ share }, floorOfCleanWater)).toBe(false)
    }
    // And the real thing end to end: the hidden FRAME, measured, then judged.
    const hidden = animalShare(water(160, 120, 4))
    expect(readsAsAnimal(hidden, waterFloor(0, hidden.kept))).toBe(false)
  })

  it('fails a strike whose body only half-emerges below the geometric floor', () => {
    expect(readsAsAnimal({ share: 0.09 }, floorOfCleanWater)).toBe(false)
    expect(readsAsAnimal({ share: 0.11 }, floorOfCleanWater)).toBe(true)
  })

  it('raises the bar with the water: a busy reference rect is not trusted', () => {
    // If the croc-free water already shows 5 % of the rect outside its own
    // population, a 31 % strike is only 6x that — not the separation the check
    // claims to have seen, so it fails loudly instead of passing on the absolute.
    expect(readsAsAnimal({ share: 0.31 }, waterFloor(0.05, 19873))).toBe(false)
    expect(readsAsAnimal({ share: 0.31 }, waterFloor(0.01, 19873))).toBe(true)
  })

  it('fails outright when a rect could not be measured at all', () => {
    expect(readsAsAnimal({ share: null }, floorOfCleanWater)).toBe(false)
    // an unmeasurable REFERENCE yields a floor no share can beat
    expect(readsAsAnimal({ share: 0.9 }, waterFloor(null, 19873))).toBe(false)
  })
})
