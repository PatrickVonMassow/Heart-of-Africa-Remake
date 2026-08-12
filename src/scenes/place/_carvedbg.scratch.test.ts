import { describe, it } from 'vitest'
import { balance } from '../../config/balance'
import { standingClear, WALKER_RADIUS } from './collision'
import { buildLayout, builtFabric } from './layout'
import { childPlayGround, villageAdultStations } from './lifeSpots'
import { buildWedgeCarve } from './wedgeCarve'

describe('carve debug', () => {
  it('prints village points and map', () => {
    const layout = buildLayout('bambara-village', 2972259115)
    const NPC = WALKER_RADIUS
    const ground = childPlayGround(
      villageAdultStations([-3.5, 2.5]),
      Math.max(1, layout.radius - NPC * 2),
      balance.villageLife.tag.playRadius,
      balance.communication.hearingRadius,
      { free: (x, z) => standingClear(layout.colliders, x, z, NPC), fabric: builtFabric(layout) },
    )
    const carve = buildWedgeCarve(layout.colliders, NPC, ground)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const x = ground.x + Math.cos(a) * 2.4
      const z = ground.z + Math.sin(a) * 2.4
      console.log(`spawn ${i} (${x.toFixed(2)},${z.toFixed(2)}) clear=${standingClear(layout.colliders, x, z, NPC)} carve=${carve(x, z)}`)
    }
    for (const [x, z] of [[10.55,-5.7],[10.4,-5.6],[15.85,-7.75],[13.9,-14.83],[7.5,-6.3],[12.9,-12.9],[10.54,-10.54]] as const) {
      console.log(`pt (${x},${z}) clear=${standingClear(layout.colliders, x, z, NPC)} carve=${carve(x, z)}`)
    }
    const R = ground.radius
    let map = ''
    for (let gz = ground.z + R; gz >= ground.z - R; gz -= 0.35) {
      let row = ''
      for (let gx = ground.x - R; gx <= ground.x + R; gx += 0.25) {
        if (Math.hypot(gx - ground.x, gz - ground.z) > R) { row += ' '; continue }
        row += !standingClear(layout.colliders, gx, gz, NPC) ? '#' : carve(gx, gz) ? 'x' : '.'
      }
      map += row + '\n'
    }
    console.log(map)
  })
})
