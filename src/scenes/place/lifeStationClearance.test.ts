import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { standingClear, WALKER_RADIUS } from './collision'
import { buildLayout, fenceColliders, VILLAGE_FIRE } from './layout'
import { LOOM_SPOT, VILLAGE_SPOTS, villageHasWell } from './lifeSpots'

beforeAll(setupGeodata)

// The renderer's prop radii and figure offsets, independently of placement.
// The well and its water-carrier only exist where the village has a well
// (point 1092); elsewhere that ground is the settlement's to build on.
function stationBodies(id: string) {
  const fire = VILLAGE_FIRE
  const loom = LOOM_SPOT
  const inward = (p: readonly number[], offset: number) => {
    const distance = Math.hypot(p[0], p[1])
    return { x: p[0] - p[0] / distance * offset, z: p[1] - p[1] / distance * offset, r: WALKER_RADIUS }
  }
  const hasWell = villageHasWell(id)
  return [
    { x: loom[0], z: loom[1], r: 1 },
    inward(loom, 0.55),
    ...Object.entries(VILLAGE_SPOTS)
      .filter(([name]) => name !== 'well' || hasWell)
      .map(([name, p]) => ({
        x: p[0], z: p[1], r: { talkers: 0.85, pounder: 0.55, drummer: 0.8, well: 0.75 }[name as keyof typeof VILLAGE_SPOTS],
      })),
    ...[-0.5, 0.5].map(dx => ({ x: VILLAGE_SPOTS.talkers[0] + dx, z: VILLAGE_SPOTS.talkers[1], r: WALKER_RADIUS })),
    inward(VILLAGE_SPOTS.pounder, -0.55),
    { x: VILLAGE_SPOTS.drummer[0], z: VILLAGE_SPOTS.drummer[1], r: WALKER_RADIUS },
    ...(hasWell ? [{ x: VILLAGE_SPOTS.well[0] - 1.1, z: VILLAGE_SPOTS.well[1], r: WALKER_RADIUS }] : []),
    { x: fire[0], z: fire[1], r: 1.3 },
    ...[[1.2, 1], [-1.3, -0.7], [0.7, 1.8]].map(([dx, dz]) => ({ x: fire[0] + dx, z: fire[1] + dz, r: WALKER_RADIUS })),
  ]
}

function violations(id: string, seed: number) {
  const layout = buildLayout(id, seed)
  const buildings = layout.colliders.slice(0, layout.interactives.length + layout.dwellings.length)
  const obstacles = [...buildings, ...layout.fences.flatMap(fenceColliders)]
  return stationBodies(id).filter(body => !standingClear(obstacles, body.x, body.z, body.r + 2 * WALKER_RADIUS))
    .map(body => `${id}/${seed}: station (${body.x.toFixed(2)}, ${body.z.toFixed(2)}), r=${body.r}`)
}

describe('fixed village stations leave a walker-wide gap to buildings and fences', () => {
  it('clears the reported weaver and every other station', () => {
    expect(violations('bambara-village', 1838110026)).toEqual([])
  })

  it.each(['bambara-village', 'maasai-village', 'swahili-village'])('%s: seeds 1 through 300', id => {
    const failed: string[] = []
    for (let seed = 1; seed <= 300; seed++) failed.push(...violations(id, seed))
    expect(failed.slice(0, 20), `${failed.length} station violations`).toEqual([])
  }, 120_000)

  // EVERY VILLAGE SHIPS, so every village carries the guarantee (work-order
  // 1093). Four fixed seeds per plan could not see it: the exposed stations —
  // the talking pair at r 7.2, the pounder at r 7.1, the weaver at (-8.5, -7) —
  // are reached by a COMPOUND band drawn at cr 13.5-17.5, and where that band
  // falls is a draw of the seed, not of the plan. So the plan sweep runs a seed
  // SPREAD as well; the three villages above keep the deeper 300.
  // Measured 20.09.2026 before this widening: all 22 villages over seeds 1-300
  // — 6600 layouts — held the gap with no violation, so 40 seeds here pin a
  // guarantee that was already whole rather than papering over a known hole.
  it.each(PLACES.filter(p => p.kind === 'village').map(p => p.id))('%s: all village plans', id => {
    const failed: string[] = []
    for (const seed of [7, 42, 1337, 1838110026]) failed.push(...violations(id, seed))
    for (let seed = 1; seed <= 40; seed++) failed.push(...violations(id, seed))
    expect(failed.slice(0, 20), `${failed.length} station violations`).toEqual([])
  }, 60_000)
})
