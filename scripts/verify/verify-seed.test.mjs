import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_SEED,
  UNSEEDED_SUITES,
  VERIFY_SEED,
  announceSeed,
  applySeedRoute,
  resolveSeed,
  seedPlan,
  suiteNameOf,
  withVerifySeed,
} from './verify-seed.mjs'
import { DEV_SUITES, SERVERLESS_SUITES } from './tiers.mjs'
import { repoPath } from '../repo-paths.mjs'

const suiteSource = (name) => readFileSync(repoPath('scripts/verify', `${name}.mjs`), 'utf8')

describe('withVerifySeed', () => {
  it('seeds a bare dev-server URL', () => {
    expect(withVerifySeed('http://localhost:5173/')).toBe(`http://localhost:5173/?seed=${VERIFY_SEED}`)
  })

  // The measured hole: the suite defaults carried `?seed=42`, and the runner's
  // BASE_URL (which names the port it just started) replaced the whole string.
  it('seeds the URL the runner passes, port and all', () => {
    expect(withVerifySeed('http://localhost:32845/')).toBe(`http://localhost:32845/?seed=${VERIFY_SEED}`)
  })

  it('leaves a URL that already pins its own seed alone', () => {
    expect(withVerifySeed('http://localhost:5173/?seed=7')).toBe('http://localhost:5173/?seed=7')
  })

  it('keeps other query parameters', () => {
    const out = new URL(withVerifySeed('http://localhost:5173/?lang=de'))
    expect(out.searchParams.get('lang')).toBe('de')
    expect(out.searchParams.get('seed')).toBe(String(VERIFY_SEED))
  })

  it('takes an explicit seed', () => {
    expect(withVerifySeed('http://localhost:5173/', 4711)).toBe('http://localhost:5173/?seed=4711')
  })

  it('hands an unparseable URL back rather than failing the suite', () => {
    expect(withVerifySeed('not a url')).toBe('not a url')
  })
})

describe('resolveSeed — the run says which world it walks', () => {
  it('pins the default when VERIFY_SEED is unset', () => {
    expect(resolveSeed(undefined)).toEqual({ seed: DEFAULT_SEED, origin: 'default' })
    expect(resolveSeed('')).toEqual({ seed: DEFAULT_SEED, origin: 'default' })
  })

  it('pins the number the caller names', () => {
    expect(resolveSeed('1234')).toEqual({ seed: 1234, origin: 'pinned' })
  })

  // The sweep that covers the cost of pinning: the seed is drawn HERE, so the run
  // can report it and a red is reproduced with VERIFY_SEED=<that number>.
  it('DRAWS a seed for the sweep, rather than leaving the game to randomise', () => {
    expect(resolveSeed('random', () => 0.5)).toEqual({ seed: Math.floor(0.5 * 0xffffffff), origin: 'drawn' })
  })

  it('throws on a value it does not understand instead of quietly running pinned', () => {
    expect(() => resolveSeed('radnom')).toThrow(/VERIFY_SEED/)
  })
})

describe('seedPlan — what the suite says about its world', () => {
  it('names the pinned seed', () => {
    const plan = seedPlan({ suite: 'collision', seed: 42, origin: 'default' })
    expect(plan.seeded).toBe(true)
    expect(plan.notice).toContain('42')
  })

  it('names the number to pin after a drawn sweep', () => {
    const plan = seedPlan({ suite: 'polish', seed: 991, origin: 'drawn' })
    expect(plan.notice).toContain('VERIFY_SEED=991')
  })

  // "A suite that is deliberately unseeded says so in its own output" (point 557).
  it('declares an exempt suite unseeded, with its reason', () => {
    const suite = Object.keys(UNSEEDED_SUITES)[0]
    const plan = seedPlan({ suite })
    expect(plan.seeded).toBe(false)
    expect(plan.notice).toContain('NOT APPLIED')
    expect(plan.notice).toContain(UNSEEDED_SUITES[suite])
  })

  it('every exempt suite is a real suite of the map', () => {
    for (const suite of Object.keys(UNSEEDED_SUITES)) {
      expect([...DEV_SUITES, 'preview', 'crossbrowser', 'visualsweep']).toContain(suite)
    }
  })

  it('reads a suite name off the script path', () => {
    expect(suiteNameOf('/repo/scripts/verify/collision.mjs')).toBe('collision')
    expect(suiteNameOf('C:\\repo\\scripts\\verify\\polish.mjs')).toBe('polish')
  })
})

/** A stand-in for a Playwright browser: records the URLs its pages navigate to. */
function fakeBrowser() {
  const visited = []
  const makePage = () => ({ goto: async (url) => visited.push(url) })
  return {
    visited,
    newPage: async () => makePage(),
    newContext: async () => ({ newPage: async () => makePage() }),
  }
}

describe('applySeedRoute — the seed is applied where the browser is opened', () => {
  it('seeds every page the browser hands out', async () => {
    const browser = fakeBrowser()
    applySeedRoute(browser, { suite: 'collision', seed: 42, log: () => {} })
    await (await browser.newPage()).goto('http://localhost:32845/')
    expect(browser.visited).toEqual(['http://localhost:32845/?seed=42'])
  })

  it('seeds pages opened through a context too', async () => {
    const browser = fakeBrowser()
    applySeedRoute(browser, { suite: 'world', seed: 7, log: () => {} })
    const context = await browser.newContext({ viewport: null })
    await (await context.newPage()).goto('http://localhost:5173/?lang=de')
    expect(browser.visited[0]).toContain('seed=7')
    expect(browser.visited[0]).toContain('lang=de')
  })

  it('leaves an exempt suite alone and says so', async () => {
    const said = []
    const browser = fakeBrowser()
    applySeedRoute(browser, { suite: 'preview', log: (m) => said.push(m) })
    await (await browser.newPage()).goto('http://localhost:4173/')
    expect(browser.visited).toEqual(['http://localhost:4173/'])
    expect(said.join('\n')).toContain('NOT APPLIED')
  })

  it('announces once per process, however many browsers a suite opens', () => {
    const said = []
    const plan = seedPlan({ suite: 'crossbrowser' })
    announceSeed(plan, { log: (m) => said.push(m), force: true })
    announceSeed(plan, { log: (m) => said.push(m) })
    expect(said).toHaveLength(1)
  })
})

// THE REACH CASE (point 557). The pin is worth nothing where it does not arrive,
// and worse than nothing where a suite CLAIMS it: `collision.mjs` carried
// `?seed=42` in a default URL that `BASE_URL` overwrote on every run-all run, so
// its log promised a fixed layout it never had. These cases fail on that wiring.
describe('the seed REACHES every suite the map says is seeded', () => {
  const seeded = DEV_SUITES.filter((s) => !SERVERLESS_SUITES.includes(s) && !UNSEEDED_SUITES[s])

  it('has suites to check', () => {
    expect(seeded.length).toBeGreaterThan(5)
  })

  it.each(seeded)('%s opens its browser through the seeding launcher', (suite) => {
    const src = suiteSource(suite)
    const viaLauncher = /launchVerifyBrowser\s*\(/.test(src) || /bootGame\s*\(/.test(src)
    expect(viaLauncher, `${suite}.mjs must open its browser via launchVerifyBrowser/bootGame — that is where the seed is applied`).toBe(true)
  })

  it.each(seeded)('%s carries no seed of its own that the runner can discard', (suite) => {
    const src = suiteSource(suite)
    // A `seed=` literal in a suite is the collision.mjs shape: a pin written into a
    // DEFAULT URL, discarded the moment `process.env.BASE_URL` supplies the port —
    // a claim of determinism the code does not keep.
    expect(src, `${suite}.mjs pins a seed at its own call site; the launcher route owns that`).not.toMatch(/seed=/)
  })

  it.each(['_browser.mjs', '_boot.mjs'])('%s applies the seed route to the browser it opens', (file) => {
    const src = readFileSync(repoPath('scripts/verify', file), 'utf8')
    expect(src).toMatch(/from '\.\/verify-seed\.mjs'/)
    expect(src).toMatch(/applySeedRoute\s*\(/)
  })
})
