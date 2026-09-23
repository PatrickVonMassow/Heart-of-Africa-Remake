// THE LAYOUT SUITES` SHARED READINGS (split out under work-order 1178).
// Test-only: nothing in the shipped game imports it, and the Vitest include
// glob (`src/**/*.test.{ts,tsx}`) does not collect it as a suite of its own.
//
// `layout.test.ts` built every settlement of the world three times over for
// each of its thirteen subjects and cost 339.7 s of a 1659 s unit layer
// (measured 22.09.2026). The subjects now sit in files of their own and read
// the same seeds, the same port/village split and the same body geometry from
// here, so splitting them changed which worker builds a layout and nothing
// about what is asserted of it.
import { buildLayout, type PlaceLayout, type Interactive, type DwellingDef } from './layout'
import { PLACES } from '../../world/geo'

/**
 * ONE BUILD PER (PLACE, SEED) IN A FILE, for the suites that ask for the same
 * one over and over.
 *
 * `buildLayout` is a pure function of its two arguments — it seeds `mulberry32`
 * from `seed ^ hash(placeId)` and reads nothing else — and it costs about
 * 111 ms a call. Measured 22.09.2026 with the function counted from inside, the
 * place suites spend nearly all their time in it: `layout.test.ts` 90.4 s of its
 * 94.5 s, `layout.wayOut.test.ts` 75.5 s of 78.7 s, `layout.fabric.test.ts`
 * 63.8 s of 65.5 s, `riverBank.test.ts` 51.2 s of 53.2 s — and most of that is
 * a REPEAT. Counted by key over a whole run of each file:
 *
 *   loom               1 100 calls /   110 worlds   90 % repeat
 *   layout.groundWork    479 /    78                84 %
 *   layout               717 /   211                71 %
 *   riverBank            882 /   294                67 %
 *   layout.wayOut        930 /   322                65 %
 *   layout.fabric        847 /   308                64 %
 *   settlementRoom       154 /    66                58 %
 *   placement             64 /    32                50 %
 *   PlaceLife.games       54 /    32                41 %
 *   bankStage             79 /    48                40 %
 *   chiefPresence         67 /    44                35 %
 *
 * NOT EVERY SUITE IS LIKE THAT, and the ones that are not must keep building:
 * `lifeStationClearance.test.ts` asks 1 869 times for 1 723 different worlds,
 * `layout.waterPath.test.ts` 482 times for 413, `roofClearance.test.ts` 100 for
 * 99. They sweep seeds rather than revisit settlements, so a cache would pay the
 * freeze below on nearly every call and save nearly nothing — for
 * `lifeStationClearance` it would cost more than it saves. Those files call
 * `buildLayout` directly, and that is a decision, not an oversight.
 *
 * WHY THE CACHE IS HERE AND NOT IN `buildLayout`: the shipped function stays
 * pure, with no cache the game pays for in memory. A player visits a handful of
 * settlements; a test file visits every one of them at three seeds.
 *
 * WHY SHARING ONE OBJECT IS SAFE — enforced, not assumed. The layout is frozen
 * through, so a reader that writes to one gets a `TypeError` where it writes
 * instead of quietly changing what the next case reads. A case that must modify
 * a layout calls `buildLayout` itself and gets its own.
 *
 * The cache lives for the MODULE, which under Vitest is the file: each test
 * file is its own worker module, so nothing leaks from one file to the next.
 */
const layoutCache = new Map<string, PlaceLayout>()

/** Deep-freeze: plain objects and arrays, which is all a layout holds. */
function freezeThrough<T>(value: T, seen = new Set<unknown>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const v of Object.values(value as Record<string, unknown>)) freezeThrough(v, seen)
  return Object.freeze(value)
}

/**
 * The layout for this (place, seed), built once per file and then shared frozen.
 * Identical to `buildLayout(placeId, seed)` in everything but who pays for it.
 */
export function sharedLayout(placeId: string, seed: number): PlaceLayout {
  const key = `${placeId}:${seed}`
  let layout = layoutCache.get(key)
  if (!layout) {
    layout = freezeThrough(buildLayout(placeId, seed))
    layoutCache.set(key, layout)
  }
  return layout
}

/** How many DIFFERENT layouts this file has built — the figure that proves the
 *  sharing is real rather than merely configured. */
export const sharedLayoutCount = () => layoutCache.size

export const SEEDS = [7, 42, 1337]
/** The world of the F6 reports behind work-order 583/584. */
export const REPORTED_SEED = 1425108822
/** The world of the "Ich hänge fest" report behind work-order 604. */
export const WEDGE_SEED = 1941555626
export const PORTS = PLACES.filter((p) => p.kind === 'port')
export const VILLAGES = PLACES.filter((p) => p.kind === 'village')

/** Circle-approximated body radius of a solid building. */
export const bodyR = (d: DwellingDef) => d.r
export const interactiveR = (it: Interactive, port: boolean) =>
  port ? 3.2 : it.type === 'market' ? 2.9 : 3.35

export interface Body {
  x: number
  z: number
  r: number
}

export function solidBodies(layout: PlaceLayout, port: boolean): Body[] {
  const bodies: Body[] = layout.dwellings.map((d) => ({ x: d.x, z: d.z, r: bodyR(d) }))
  for (const it of layout.interactives) {
    const r = interactiveR(it, port)
    if (r > 0) bodies.push({ x: it.pos[0], z: it.pos[1], r })
  }
  return bodies
}

/** Interior samples of a lane centreline (ends trimmed — lanes may END at a door). */
export function laneSamples(points: Array<[number, number]>, trim = 1.4, step = 0.6): Array<[number, number]> {
  const samples: Array<[number, number]> = []
  let total = 0
  const segs: Array<{ ax: number; az: number; dx: number; dz: number; len: number; start: number }> = []
  for (let i = 0; i + 1 < points.length; i++) {
    const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
    segs.push({
      ax: points[i][0],
      az: points[i][1],
      dx: points[i + 1][0] - points[i][0],
      dz: points[i + 1][1] - points[i][1],
      len,
      start: total,
    })
    total += len
  }
  for (let s = trim; s <= total - trim; s += step) {
    const seg = segs.find((g) => s >= g.start && s <= g.start + g.len)
    if (!seg || seg.len === 0) continue
    const t = (s - seg.start) / seg.len
    samples.push([seg.ax + seg.dx * t, seg.az + seg.dz * t])
  }
  return samples
}
