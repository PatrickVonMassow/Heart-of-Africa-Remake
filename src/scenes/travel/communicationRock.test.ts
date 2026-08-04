// The erratic in the bird's-eye scene (work-order 482): what the point demands
// of it beyond its coordinate — that it stands ALONE (no other rock nearby to
// mistake it for) and that the traveller collides with the block the renderer
// draws, from the same site the dig will use in 487. Both are decided inside
// TravelScene, so they are checked against TravelScene's own functions.
import { describe, it, expect, beforeAll } from 'vitest'
import { collidableFloraNear, placedFloraChunk } from './TravelScene'
import { communicationRockSite, ROCK_DRESSING_CLEARANCE } from '../../world/communicationRock'
import { latLonToWorld } from '../../world/geo'
import { setupGeodata } from '../../test/geodata'

const SEEDS = [1, 42, 777, 2024]
const CHUNK_SIZE = 24 // TravelScene's terrain chunk size

beforeAll(async () => {
  await setupGeodata()
})

describe('the erratic stands alone and collides as it is drawn', () => {
  it.each(SEEDS)('seed %i: no dressing is placed within its clearance', (seed) => {
    const rock = communicationRockSite(seed)
    const w = latLonToWorld(rock.lat, rock.lon)
    const cx = Math.floor(w.x / CHUNK_SIZE)
    const cz = Math.floor(w.z / CHUNK_SIZE)
    let nearest = Infinity
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const p of placedFloraChunk(cx + dx, cz + dz, seed)) {
          nearest = Math.min(nearest, Math.hypot(p.x - w.x, p.z - w.z))
        }
      }
    }
    // The renderer draws nothing else inside the clearing, so nothing stands
    // beside the block to be confused with it.
    expect(nearest).toBeGreaterThanOrEqual(ROCK_DRESSING_CLEARANCE)
  })

  it.each(SEEDS)('seed %i: the traveller collides with it, at its drawn position and radius', (seed) => {
    const rock = communicationRockSite(seed)
    const w = latLonToWorld(rock.lat, rock.lon)
    // Standing right beside the block, it is among the obstacles…
    const near = collidableFloraNear(w.x + 1, w.z, seed)
    const own = near.filter(([x, z]) => Math.hypot(x - w.x, z - w.z) < 1e-9)
    expect(own).toHaveLength(1)
    expect(own[0][2]).toBeCloseTo(rock.radius, 9)
    // … and it is the only obstacle there, since the dressing is cleared.
    expect(near).toHaveLength(1)
    // Far away it is not reported at all (the query stays local).
    expect(collidableFloraNear(w.x + 120, w.z + 120, seed).some(([x, z]) => Math.hypot(x - w.x, z - w.z) < 1e-9)).toBe(false)
  })
})
