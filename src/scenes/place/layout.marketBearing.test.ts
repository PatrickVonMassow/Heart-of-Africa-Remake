// The drummer points at the chief's hut (point 1272): from his seat the market
// hut must lie at a clearly different bearing, so the gesture names one hut.
import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { buildLayout } from './layout'
import { VILLAGE_SPOTS } from './lifeSpots'

function separationDeg(placeId: string, seed: number): number {
  const layout = buildLayout(placeId, seed)
  const at = (type: string) => layout.interactives.find(i => i.type === type)!.pos
  const [dx, dz] = VILLAGE_SPOTS.drummer
  const bearing = ([x, z]: readonly number[]) => Math.atan2(x - dx, z - dz)
  const off = Math.abs(bearing(at('chief')) - bearing(at('market'))) % (2 * Math.PI)
  return Math.min(off, 2 * Math.PI - off) * 180 / Math.PI
}

describe('market hut bearing from the drummer', () => {
  it('keeps the Bambara market hut off the line to the chief’s hut', () => {
    for (const seed of [1, 7, 42, 1234, 99999]) {
      expect(separationDeg('bambara-village', seed)).toBeGreaterThanOrEqual(balance.communication.marketBearingFromChief)
    }
  })

})
