// The verify lane's WORLD SEED (point 549).
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
// `collision.mjs` had the right idea years earlier ("?seed=42 ... so the
// collision/reachability checks are reproducible") but wrote it into its DEFAULT
// URL, which `process.env.BASE_URL ?? …` discards the moment the runner passes a
// port — so it, too, has been running unseeded under `run-all`. `withVerifySeed`
// is the shape that survives that: it seeds whatever URL the runner hands over.

/** The lane's seed. 42 is `collision.mjs`'s long-standing choice; one number for
 *  the whole lane means a layout bug reproduces across suites. */
export const VERIFY_SEED = 42

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
