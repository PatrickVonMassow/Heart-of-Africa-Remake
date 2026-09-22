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
import { type PlaceLayout, type Interactive, type DwellingDef } from './layout'
import { PLACES } from '../../world/geo'

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
