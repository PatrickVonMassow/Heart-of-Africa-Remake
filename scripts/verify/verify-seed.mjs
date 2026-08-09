// The verify lane's WORLD SEED (points 549/557).
//
// A settlement layout is built from `buildLayout(placeId, seed)`, and the game's
// seed is `Math.floor(Math.random() * 0xffffffff)` unless the DEV-only `?seed=<n>`
// query parameter pins it (src/state/store.ts, `newSeed`). Every suite that opens
// the bare dev-server URL therefore walks into a DIFFERENT world on every run:
// other hut positions, another teaching stone, other ring stones, other villager
// spawn spots.
//
// That is what made `polish` unable to give the same verdict twice on this host
// (measured 07./08.08.2026, eight attempts, not one clean, no two red at the same
// check). The two reds of `zulu village hut: an open approach to walk in on` name
// their hut at {x 15.16, z 1.75} and {x 15.65, z 1.49} — the SAME check, the same
// picker (`dwellings.find(kind === 'hut')`), two different buildings. The suite's
// own retry logic read the rotation as machine load; on an idle host there was no
// load to read.
//
// So the lane pins the seed. This is not a bar being lowered: every check still
// decides on the picture the game draws — it decides on the SAME world each time,
// which is the precondition for a verdict being repeatable at all. A check that
// then fails is a defect, not a draw.
//
// ONE ROUTE, NOT PER-SUITE PLUMBING (point 557). The pin used to be applied at a
// call site — `polish.mjs` wrapped its own BASE — and `collision.mjs` had the right
// idea years earlier ("?seed=42 ... so the collision/reachability checks are
// reproducible") but wrote it into its DEFAULT URL, which `process.env.BASE_URL ?? …`
// discards the moment the runner passes a port. So it reported a determinism it did
// not have, which is worse than no pin at all: when it rotated, the log said the
// layout was fixed and the reader ruled the layout out first. The seed is therefore
// applied where the BROWSER IS OPENED (`applySeedRoute`, called from `_browser.mjs`,
// `_boot.mjs` and `crossbrowser.mjs`): every page those launchers hand out seeds
// whatever URL the runner gave it, and no suite can silently fall out of the pin
// again. A suite that CANNOT be seeded is named in `UNSEEDED_SUITES` and says so in
// its own output.
//
// THE COST OF PINNING, AND HOW IT IS COVERED. A lane pinned to one seed only ever
// photographs ONE world, so a layout defect that needs another seed goes unseen.
// The decision (point 557): the everyday gate stays pinned — a repeatable verdict is
// what the gate is for — and the other worlds are covered by an occasional SWEEP,
// `VERIFY_SEED=random npm run test:large`, which draws a seed HERE (not in the game)
// and prints it, so any red it finds is reproduced exactly with `VERIFY_SEED=<n>`.
// The accepted residual: between two sweeps, a seed-specific layout defect can sit
// unnoticed. Cadence and rationale are written down in scripts/verify/README.md.

/** The lane's default seed. 42 is `collision.mjs`'s long-standing choice; one
 *  number for the whole lane means a layout bug reproduces across suites. */
export const DEFAULT_SEED = 42

/**
 * Suites that are deliberately NOT seeded, with the reason each prints. Being
 * listed here is a claim about the suite, not a convenience: the route reads this
 * map and announces the exemption in the suite's own output, so an unseeded lane
 * is visible in the log rather than assumed away.
 */
export const UNSEEDED_SUITES = {
  preview: 'the production build reads no ?seed (the hook is DEV-only), so this suite cannot be pinned at all',
}

/**
 * Read the VERIFY_SEED environment value. Pure: `rand` is posed by the test.
 *
 * '' / undefined → the pinned default; a whole number → that seed; `random` → a
 * seed DRAWN here and reported, which is what makes a sweep reproducible. Anything
 * else THROWS: a typo'd sweep that silently ran pinned would be the same class of
 * lie this point exists to remove.
 */
export function resolveSeed(raw, rand = Math.random) {
  const v = String(raw ?? '').trim()
  if (v === '') return { seed: DEFAULT_SEED, origin: 'default' }
  if (/^\d+$/.test(v)) return { seed: Number(v) >>> 0, origin: 'pinned' }
  if (v.toLowerCase() === 'random') return { seed: Math.floor(rand() * 0xffffffff) >>> 0, origin: 'drawn' }
  throw new Error(`VERIFY_SEED: expected a whole number or "random", got ${JSON.stringify(raw)}`)
}

const RESOLVED = resolveSeed(process.env.VERIFY_SEED)

/** The seed this process pins. */
export const VERIFY_SEED = RESOLVED.seed
/** Where it came from: 'default' | 'pinned' | 'drawn'. */
export const VERIFY_SEED_ORIGIN = RESOLVED.origin

/** The suite name a script path stands for: scripts/verify/collision.mjs → 'collision'. */
export function suiteNameOf(scriptPath) {
  const base = String(scriptPath ?? '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.mjs$/, '')
}

/**
 * What this suite does about the seed, and the one line it says about it.
 * Pure — the route logs `notice` and acts on `seeded`.
 */
export function seedPlan({ suite, seed = VERIFY_SEED, origin = VERIFY_SEED_ORIGIN } = {}) {
  const reason = UNSEEDED_SUITES[suite] ?? null
  if (reason) {
    return {
      suite,
      seeded: false,
      seed: null,
      reason,
      notice: `# world seed NOT APPLIED — ${suite}: ${reason}; this suite walks a different world each run`,
    }
  }
  const tail =
    origin === 'drawn'
      ? `DRAWN for this run (VERIFY_SEED=random) — pin it with VERIFY_SEED=${seed} to reproduce anything it finds`
      : origin === 'pinned'
        ? 'pinned by VERIFY_SEED'
        : 'pinned at the launcher (point 549); VERIFY_SEED=random sweeps another world'
  return { suite, seeded: true, seed, reason: null, notice: `# world seed ${seed} — ${tail}` }
}

/** Return `base` with the dev seed parameter set, leaving an explicitly seeded URL
 *  alone (a caller pinning its own world keeps it). Falls back to the input when
 *  the URL cannot be parsed — a suite must never fail to start over its query
 *  string. */
export function withVerifySeed(base, seed = VERIFY_SEED) {
  try {
    const u = new URL(base)
    if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed))
    return u.toString()
  } catch {
    return base
  }
}

const announced = new Set()

/** Print the seed line ONCE per process (`crossbrowser` opens three browsers and
 *  the world it walks is one fact, not three). Keyed by the line itself, so a
 *  second, DIFFERENT statement — an exempt suite beside a seeded one — is never
 *  swallowed. Returns whether it printed, so a test can drive it deterministically. */
export function announceSeed(plan, { log = console.log, force = false } = {}) {
  if (announced.has(plan.notice) && !force) return false
  announced.add(plan.notice)
  log(plan.notice)
  return true
}

/**
 * THE ONE ROUTE. Wrap a freshly launched browser so every page it hands out
 * navigates to the SEEDED url, whatever URL the suite passes — and announce, in
 * the suite's own output, which world this run walks.
 *
 * Wrapping the launcher rather than the call site is the whole point: a suite
 * cannot forget it, and a new suite inherits it by opening a browser.
 */
export function applySeedRoute(browser, { suite = suiteNameOf(process.argv[1]), seed = VERIFY_SEED, log = console.log } = {}) {
  const plan = seedPlan({ suite, seed })
  announceSeed(plan, { log })
  if (!plan.seeded || !browser) return browser
  const seedPage = (page) => {
    if (!page || typeof page.goto !== 'function') return page
    const goto = page.goto.bind(page)
    page.goto = (url, options) => goto(withVerifySeed(url, plan.seed), options)
    return page
  }
  if (typeof browser.newPage === 'function') {
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => seedPage(await newPage(...args))
  }
  if (typeof browser.newContext === 'function') {
    const newContext = browser.newContext.bind(browser)
    browser.newContext = async (...args) => {
      const context = await newContext(...args)
      if (context && typeof context.newPage === 'function') {
        const contextNewPage = context.newPage.bind(context)
        context.newPage = async (...inner) => seedPage(await contextNewPage(...inner))
      }
      return context
    }
  }
  return browser
}
