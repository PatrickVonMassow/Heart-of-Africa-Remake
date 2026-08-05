import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  UNITS_PER_DEGREE,
  worldPointOf,
  normaliseDeclaration,
  describeSubject,
  offScreenReason,
  judgeFrameSubject,
  describeFinding,
  formatFrameFailure,
  formatFramePass,
  findRawFrames,
  formatRawFrameFindings,
} from './frameSubject-core.mjs'
import { captureFrame, probeFrameSubject, sampleSceneCounts } from './frameSubject.mjs'

const lakeVictoria = () => normaliseDeclaration('12-worldmodel-lake-victoria', { world: { lat: -0.8, lon: 33 }, label: 'Lake Victoria' })

describe('normaliseDeclaration', () => {
  it('refuses a frame that declares no subject at all', () => {
    expect(() => normaliseDeclaration('99-something', undefined)).toThrow(/no subject declaration/)
    expect(() => normaliseDeclaration('99-something', {})).toThrow(/declares none of/)
  })

  it('refuses two subjects — a frame has one', () => {
    expect(() => normaliseDeclaration('99', { world: { lat: 1, lon: 2 }, element: '.hud' })).toThrow(/more than one subject/)
  })

  it('refuses a general view that does not say why', () => {
    expect(() => normaliseDeclaration('99', { general: '' })).toThrow(/without saying why/)
    expect(() => normaliseDeclaration('99', { general: 'because' })).toThrow(/without saying why/)
    expect(normaliseDeclaration('99', { general: 'the whole savanna dressing is the subject' }).kind).toBe('general')
  })

  it('takes a live scene position in world units as well as a lat/lon', () => {
    const d = normaliseDeclaration('68-lion-feeding', { world: { x: 330, z: 8 }, label: 'the feeding lion' })
    expect(d.point).toEqual({ x: 330, z: 8 })
    expect(d.world.lat).toBeCloseTo(-0.8, 6)
    expect(d.world.lon).toBeCloseTo(33, 6)
  })

  it('refuses a malformed world or settlement subject', () => {
    expect(() => normaliseDeclaration('99', { world: { lat: 1 } })).toThrow(/finite lat\/lon or x\/z/)
    expect(() => normaliseDeclaration('99', { local: { x: 3 } })).toThrow(/finite x\/z/)
    expect(() => normaliseDeclaration('99', { element: '  ' })).toThrow(/without a selector/)
  })

  it('projects a world subject to the equirectangular ground point', () => {
    expect(worldPointOf(-0.8, 33)).toEqual({ x: 33 * UNITS_PER_DEGREE, z: 0.8 * UNITS_PER_DEGREE })
    expect(lakeVictoria().point.x).toBeCloseTo(330, 6)
  })

  it('defaults the scene and the settle wait per kind, and lets a moving frame opt out', () => {
    expect(lakeVictoria().scene).toBe('travel')
    expect(lakeVictoria().settle).toBe(true)
    expect(normaliseDeclaration('9', { world: { lat: 0, lon: 0 }, settle: false }).settle).toBe(false)
    expect(normaliseDeclaration('9', { local: { x: 1, z: 2 } }).scene).toBe('place')
    expect(normaliseDeclaration('9', { local: { x: 1, z: 2 } }).local.y).toBe(1.5)
    expect(normaliseDeclaration('9', { element: '.journal-panel' }).scene).toBe(null)
  })
})

describe('judgeFrameSubject', () => {
  it('passes a world subject that projects inside the frame', () => {
    const v = judgeFrameSubject(lakeVictoria(), { mode: 'travel', onScreen: true, settled: true, ndc: { x: 0.1, y: -0.2, z: 0.9 } })
    expect(v.ok).toBe(true)
  })

  it('FAILS a world subject that is off the frame — the reported world-suite case', () => {
    const v = judgeFrameSubject(lakeVictoria(), {
      mode: 'travel',
      onScreen: false,
      settled: true,
      ndc: { x: 2.41, y: -0.13, z: 0.98 },
      player: { x: 124, z: 8 },
    })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/off the right edge/)
  })

  it('FAILS when the game is in the wrong scene, naming where it was instead', () => {
    const v = judgeFrameSubject(lakeVictoria(), { mode: 'place', placeId: 'cairo' })
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('place mode (inside cairo)')
  })

  it('FAILS — never silently passes — when the subject could not be probed at all', () => {
    const v = judgeFrameSubject(lakeVictoria(), { mode: 'travel', available: false, reason: 'window.__camera is not installed' })
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('__camera')
    expect(judgeFrameSubject(lakeVictoria(), null).ok).toBe(false)
  })

  it('judges a settlement subject by the settlement the game actually stands in', () => {
    const d = normaliseDeclaration('03-village-nubians', { place: 'nubians-village' })
    expect(d.scene).toBe('place')
    expect(judgeFrameSubject(d, { mode: 'place', placeId: 'nubians-village' }).ok).toBe(true)
    const v = judgeFrameSubject(d, { mode: 'place', placeId: 'maasai-village' })
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('stood in maasai-village')
  })

  it('judges an element subject by its visibility in the viewport', () => {
    const d = normaliseDeclaration('55-i18n-german-journal', { element: '.journal-panel' })
    expect(judgeFrameSubject(d, { visible: true }).ok).toBe(true)
    const v = judgeFrameSubject(d, { visible: false, reason: '.journal-panel is hidden (display/visibility/opacity)' })
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/hidden/)
  })

  it('passes a declared general view, and still enforces a declared scene', () => {
    const d = normaliseDeclaration('115-savanna-dry', { general: 'the whole savanna dressing is the subject', scene: 'travel' })
    expect(judgeFrameSubject(d, { mode: 'travel' }).ok).toBe(true)
    expect(judgeFrameSubject(d, { mode: 'place', placeId: 'timbuktu' }).ok).toBe(false)
  })

  it('waits for the camera to settle but does not FAIL a settled-late frame that shows its subject', () => {
    const d = lakeVictoria()
    expect(d.settle).toBe(true) // the page-side probe polls on it
    // …while the verdict turns on the picture alone: a subject in frame passes
    // even if the camera was still easing, with the note saying so. A busy
    // machine must not turn a correct frame into a red run.
    const probe = { mode: 'travel', onScreen: true, settled: false, ndc: { x: 0.2, y: 0.1, z: 0.9 } }
    expect(judgeFrameSubject(d, probe).ok).toBe(true)
    expect(formatFramePass(d, probe)).toContain('camera still easing')
  })
})

describe('offScreenReason', () => {
  it('names the edge the subject went past', () => {
    expect(offScreenReason({ x: 1.4, y: 0, z: 0.5 })).toBe('off the right edge of the frame')
    expect(offScreenReason({ x: -1.2, y: -3, z: 0.5 })).toBe('off the left and bottom edge of the frame')
    expect(offScreenReason({ x: 0, y: 0, z: 1.2 })).toMatch(/outside the depth range/)
    // The live self-test case: past the far plane AND above the frame.
    expect(offScreenReason({ x: -0.13, y: 4.25, z: 1 })).toMatch(/depth range.*, and off the top edge/)
    expect(offScreenReason(null)).toMatch(/could not be projected/)
  })
})

describe('the failure message', () => {
  const probe = {
    mode: 'travel',
    onScreen: false,
    settled: false,
    ndc: { x: 2.41, y: -0.13, z: 0.98 },
    player: { x: 124, z: 8 },
    waitedMs: 8000,
  }

  it('names the frame, what it claimed and what was found instead', () => {
    const d = lakeVictoria()
    const msg = formatFrameFailure(d, probe, judgeFrameSubject(d, probe))
    expect(msg).toContain('FAIL  frame 12-worldmodel-lake-victoria')
    expect(msg).toContain('Lake Victoria')
    expect(msg).toMatch(/ndc \(2\.41/)
    expect(msg).toMatch(/traveller stood at world/)
    expect(msg).toContain('NOT written')
  })

  it('reports the distance to the subject in degrees and the unsettled camera', () => {
    const found = describeFinding(lakeVictoria(), probe)
    expect(found).toMatch(/° from the subject/)
    expect(found).toContain('the camera had NOT settled')
    expect(found).toContain('polled for 8000 ms')
  })

  it('is total when the page told us nothing', () => {
    expect(describeFinding(lakeVictoria(), {})).toMatch(/nothing further/)
  })

  it('describes every subject kind for the log line', () => {
    expect(describeSubject(lakeVictoria())).toContain('lat -0.80, lon 33.00')
    expect(describeSubject(normaliseDeclaration('9', { local: { x: 1, z: 2 }, label: 'the mosque' }))).toContain('the mosque')
    expect(describeSubject(normaliseDeclaration('9', { element: '.map-place-plan' }))).toContain('.map-place-plan')
    expect(formatFramePass(lakeVictoria(), { ndc: { x: 0.1, y: 0.2 } })).toContain('shot 12-worldmodel-lake-victoria')
    expect(formatFramePass(normaliseDeclaration('9', { general: 'the whole savanna is the subject' }), {})).toContain('general view')
  })
})

// The in-page probe itself, run in jsdom. Only the element branch is reachable
// without a three.js camera, and that is the branch that has to judge a selector
// matching SEVERAL elements — the `.building-highlight` case of point 375, where
// a settlement carries one marker per important building.
describe('probeFrameSubject on an element subject', () => {
  const box = (el, x, y, w = 60, h = 70) => {
    el.getBoundingClientRect = () => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h })
    return el
  }
  const mount = (...els) => {
    document.body.innerHTML = ''
    for (const el of els) document.body.appendChild(el)
  }
  const marker = () => {
    const el = document.createElement('div')
    el.className = 'building-highlight'
    return el
  }
  const probe = (selector = '.building-highlight') =>
    probeFrameSubject({ ...normaliseDeclaration('93-orientation-highlight', { element: selector }), report: true })

  it('passes when ANY match is on screen, not only the first in DOM order', () => {
    // The chief's marker sits far off the right edge, the market's is in view.
    // The picture shows the subject, so the frame is evidence.
    mount(box(marker(), 19586, -5270), box(marker(), 700, 300))
    const p = probe()
    expect(p.ok).toBe(true)
    expect(p.matches).toBe(2)
    expect(p.rect.x).toBe(700) // the reader is pointed at the VISIBLE one
  })

  it('FAILS when every match is outside the viewport — the measured frame-93 case', () => {
    mount(box(marker(), 19586, -5270), box(marker(), 1837, -332))
    const p = probe()
    expect(p.ok).toBe(false)
    expect(p.matches).toBe(2)
    expect(p.reason).toMatch(/lies outside the viewport/)
  })

  it('FAILS a match that is rendered nowhere, and says so differently', () => {
    const hidden = box(marker(), 100, 100)
    hidden.style.display = 'none'
    mount(hidden)
    const p = probe()
    expect(p.ok).toBe(false)
    expect(p.reason).toMatch(/hidden/)
  })

  it('FAILS — not passes — when the selector matches nothing at all', () => {
    mount()
    const p = probe()
    expect(p.ok).toBe(false)
    expect(p.available).toBe(false)
    expect(p.matches).toBe(0)
    expect(p.reason).toMatch(/no element matches/)
  })

  it('refuses a degenerate zero-size match, and says so rather than blaming the aim', () => {
    mount(box(marker(), 700, 300, 0, 0))
    const p = probe()
    expect(p.ok).toBe(false)
    expect(p.reason).toMatch(/no rendered size/)
  })

  it('reports the match count in the failure text, so a reader need not open the page', () => {
    mount(box(marker(), 19586, -5270), box(marker(), 1837, -332))
    const d = normaliseDeclaration('93-orientation-highlight', { element: '.building-highlight' })
    const p = probeFrameSubject({ ...d, report: true })
    const message = formatFrameFailure(d, p, judgeFrameSubject(d, p))
    expect(message).toContain('2 element(s) matched .building-highlight')
    expect(message).toContain('93-orientation-highlight')
  })
})

describe('findRawFrames', () => {
  it('finds an undeclared frame write in either shape', () => {
    expect(findRawFrames('await page.screenshot({ path: `${OUT}12.png` })')).toBe(1)
    expect(findRawFrames("await page.locator('.map').screenshot({ path: f })")).toBe(1)
    expect(findRawFrames('await page.screenshot({ path: p, clip: { x: 1, y: 2, width: 3, height: 4 } })')).toBe(1)
  })

  it('leaves a pixel PROBE alone — a screenshot without a path returns a buffer to assert on', () => {
    expect(findRawFrames('const buf = await page.screenshot({ clip: { x: 1, y: 2, width: 3, height: 4 } })')).toBe(0)
    expect(findRawFrames('const buf = await page.screenshot()')).toBe(0)
  })

  it('is total on missing input', () => {
    expect(findRawFrames(null)).toBe(0)
    expect(formatRawFrameFindings([])).toBe('')
    expect(formatRawFrameFindings([{ file: 'a.mjs', count: 2 }])).toContain('a.mjs: 2')
  })
})

// The WRITE carries its own budget. Playwright's silent 30 s default is not
// enough on a host rendering through SwiftShader with no GPU: the capture that
// takes 5 s in isolation exceeds it under suite load, and the suite then dies
// far from the check it was running — a machine speed reported as a red frame.
/** A page that answers both reads the shutter makes: the subject probe and the
 *  scene sampler (point 489). `scene` is the sample buffer it hands back — the
 *  default is a settled one, so a capture that is not ABOUT the wait writes at
 *  once. */
const fakePage = (calls, { scene = settledSamples() } = {}) => ({
  evaluate: async (fn) => {
    if (fn === sampleSceneCounts) {
      calls.push({ via: 'scene-sample' })
      return typeof scene === 'function' ? scene(calls.filter((c) => c.via === 'scene-sample').length) : scene
    }
    return subjectFound
  },
  // The subject is in the picture in every case here; what these tests are about
  // is what happens between proving that and opening the shutter.
  waitForFunction: async () => ({ jsonValue: async () => subjectFound, dispose: async () => {} }),
  waitForTimeout: async (ms) => calls.push({ via: 'sleep', ms }),
  screenshot: async (options) => {
    calls.push({ via: 'page', options })
    return Buffer.alloc(0)
  },
  locator: (selector) => ({
    screenshot: async (options) => {
      calls.push({ via: 'locator', selector, options })
      return Buffer.alloc(0)
    },
  }),
})

const subjectFound = { ok: true, available: true, visible: true, onScreen: true, settled: true, mode: null }

/** A buffer of readings that stand still over the whole quiet window. */
function settledSamples(end = Date.now()) {
  return Array.from({ length: 15 }, (_, i) => ({ t: end - (14 - i) * 500, drawCalls: 458, triangles: 2676537 }))
}

describe('captureFrame waits for the picture to be drawn (point 489)', () => {
  it('opens the shutter on a world frame only once the scene stands still', async () => {
    const calls = []
    // Climbing for the first three reads, settled from the fourth: the shape the
    // container host draws while the terrain streams in.
    const scene = (n) =>
      n < 4
        ? Array.from({ length: 15 }, (_, i) => ({ t: Date.now() - (14 - i) * 500, drawCalls: 99 + i * 8, triangles: 5500 + i * 50000 }))
        : settledSamples()
    await captureFrame(fakePage(calls, { scene }), 'out/', '12-worldmodel-lake-victoria', {
      world: { lat: -0.8, lon: 33 },
      label: 'Lake Victoria',
    })
    const order = calls.map((c) => c.via)
    expect(order.filter((v) => v === 'scene-sample').length).toBe(4)
    expect(order.filter((v) => v === 'sleep').length).toBe(3)
    // The picture is written LAST — after the wait, never during it.
    expect(order[order.length - 1]).toBe('page')
  })

  it('REFUSES the frame when the scene never settles, and writes nothing', async () => {
    const calls = []
    const climbing = () =>
      Array.from({ length: 15 }, (_, i) => ({ t: Date.now() - (14 - i) * 500, drawCalls: 99 + i * 8, triangles: 5500 + i * 50000 }))
    await expect(
      captureFrame(fakePage(calls, { scene: climbing }), 'out/', '18-worldmodel-bambara-village-niger', {
        world: { lat: 12.6, lon: -8.0 },
        label: 'the Bambara village',
        // A zero budget makes the timeout path immediate; the wait itself is
        // pinned with a fake clock in sceneReady.test.mjs.
      }, { scene: { timeoutMs: 0 } }),
    ).rejects.toThrow(/never finished drawing/)
    expect(calls.some((c) => c.via === 'page' || c.via === 'locator')).toBe(false)
  })

  it('does not hold a frame taken deliberately in motion back until the scene stands still', async () => {
    // `settle: false` says the picture IS the moment (a lunge, a fire line): the
    // shutter still checks that something is drawn, but never waits it out.
    const calls = []
    const moving = () =>
      Array.from({ length: 15 }, (_, i) => ({ t: Date.now() - (14 - i) * 500, drawCalls: 300 + i * 20, triangles: 900000 + i * 80000 }))
    await captureFrame(fakePage(calls, { scene: moving }), 'out/', '131-burning-grass', {
      world: { lat: 13.5, lon: 5.0 },
      label: 'the Sahel fire line',
      settle: false,
    })
    expect(calls.filter((c) => c.via === 'scene-sample').length).toBe(1)
    expect(calls.some((c) => c.via === 'sleep')).toBe(false)
    expect(calls.some((c) => c.via === 'page')).toBe(true)
  })

  it('does not hold up a HUD element frame — its subject is DOM, not the world', async () => {
    const calls = []
    await captureFrame(fakePage(calls), 'out/', '84-movement-penalty', { element: '.movement-penalty' })
    expect(calls.some((c) => c.via === 'scene-sample')).toBe(false)
    expect(calls.some((c) => c.via === 'page')).toBe(true)
  })

  it('writes a frame on a page that has no renderer to sample at all', async () => {
    // The production preview: no dev hook, so readiness cannot be judged — and
    // waiting for one that will never appear would refuse a good frame.
    const calls = []
    await captureFrame(fakePage(calls, { scene: null }), 'out/', '09-production-build', {
      general: 'the production build renders at all — it exposes no dev hook to project a subject through',
    })
    expect(calls.filter((c) => c.via === 'scene-sample').length).toBe(1)
    expect(calls.some((c) => c.via === 'page')).toBe(true)
  })
})

describe('captureFrame budgets the picture write', () => {
  /** The write itself, whatever the shutter did before it (point 489 reads the
   *  scene counters first, so the write is no longer the only call). */
  const written = (calls) => calls.filter((c) => c.via === 'page' || c.via === 'locator')

  it('hands the full-page write an explicit timeout instead of inheriting one', async () => {
    const calls = []
    await captureFrame(fakePage(calls), 'out/', '115-savanna-dry', { general: 'the whole dressing is the subject' })
    const write = written(calls)
    expect(write).toHaveLength(1)
    expect(write[0].via).toBe('page')
    expect(write[0].options.path).toBe('out/115-savanna-dry.png')
    expect(write[0].options.timeout).toBeGreaterThan(30000)
  })

  it('budgets a clipped write and an element write the same way', async () => {
    const clipped = []
    const clip = { x: 1, y: 2, width: 3, height: 4 }
    await captureFrame(fakePage(clipped), 'out/', '115-savanna-dry', {
      general: 'the whole dressing is the subject',
      clip,
    })
    expect(written(clipped)[0].options.clip).toEqual(clip)
    expect(written(clipped)[0].options.timeout).toBeGreaterThan(30000)

    const element = []
    await captureFrame(fakePage(element), 'out/', '92-map-fog-of-war', {
      general: 'the fog of war is the subject',
      locator: '.map-overlay',
    })
    expect(written(element)[0].via).toBe('locator')
    expect(written(element)[0].selector).toBe('.map-overlay')
    expect(written(element)[0].options.timeout).toBeGreaterThan(30000)
  })
})

// THE GATE: no verify script may write a frame that declared no subject. Runs in
// the ordinary unit layer, so every regression run enforces it without any hook
// wiring — the same shape as the fixed-wait ratchet next door.
describe('the real verify suites', () => {
  const dir = resolve(process.cwd(), 'scripts/verify')
  // The shutter performs the write, and the core states the pattern it looks
  // for — scanning either would count the mechanism as a violation of itself.
  const SELF = new Set(['frameSubject.mjs', 'frameSubject-core.mjs'])

  it('declare a subject for every frame they write', () => {
    const findings = []
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs') && !SELF.has(f))) {
      const count = findRawFrames(readFileSync(resolve(dir, f), 'utf8'))
      if (count) findings.push({ file: f, count })
    }
    expect(findings, `\n${formatRawFrameFindings(findings)}\n`).toEqual([])
  })
})

// The world-unit constant is duplicated into this Node-side module because the
// verify scripts cannot import the TS source. Pin it against that source, or a
// silent divergence would aim every world subject at the wrong spot.
describe('UNITS_PER_DEGREE', () => {
  it('matches src/world/geo.ts', () => {
    const geo = readFileSync(resolve(process.cwd(), 'src/world/geo.ts'), 'utf8')
    const m = /export const UNITS_PER_DEGREE\s*=\s*(\d+(?:\.\d+)?)/.exec(geo)
    expect(m, 'UNITS_PER_DEGREE not found in src/world/geo.ts').toBeTruthy()
    expect(Number(m[1])).toBe(UNITS_PER_DEGREE)
  })
})
