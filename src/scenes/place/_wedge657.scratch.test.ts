// SCRATCH (point 657) — never committed. Measures the bambara wedge geometry.
import { describe, it } from 'vitest'
import { balance } from '../../config/balance'
import { standingClear, WALKER_RADIUS } from './collision'
import { buildLayout, builtFabric } from './layout'
import { childPlayGround, villageAdultStations } from './lifeSpots'

const NPC_RADIUS = WALKER_RADIUS
const FIRE: [number, number] = [-3.5, 2.5]

describe('wedge geometry', () => {
  it('prints the bambara ground and the straddling colliders', () => {
    const layout = buildLayout('bambara-village', 2972259115)
    const colliders = layout.colliders
    const ground = childPlayGround(
      villageAdultStations(FIRE),
      Math.max(1, layout.radius - NPC_RADIUS * 2),
      balance.villageLife.tag.playRadius,
      balance.communication.hearingRadius,
      { free: (x, z) => standingClear(colliders, x, z, NPC_RADIUS), fabric: builtFabric(layout) },
    )
    console.log('ground', JSON.stringify(ground))
    console.log('walkRadius', layout.radius, 'NPC_RADIUS', NPC_RADIUS)
    // Colliders near the ground rim
    for (const c of colliders) {
      const cc = c as unknown as Record<string, unknown>
      const cx = (cc.x ?? cc.cx) as number
      const cz = (cc.z ?? cc.cz) as number
      if (typeof cx !== 'number' || typeof cz !== 'number') {
        console.log('collider without x/z', JSON.stringify(c).slice(0, 200))
        continue
      }
      const d = Math.hypot(cx - ground.x, cz - ground.z)
      if (d < ground.radius + 4) console.log('near-ground collider', JSON.stringify(c), 'centerDist', d.toFixed(2))
    }
    // Segment colliders near the ground
    for (const c of colliders) {
      const cc = c as unknown as Record<string, number | string>
      if (cc.kind !== 'segment') continue
      const mx = ((cc.x1 as number) + (cc.x2 as number)) / 2
      const mz = ((cc.z1 as number) + (cc.z2 as number)) / 2
      const d1 = Math.hypot((cc.x1 as number) - ground.x, (cc.z1 as number) - ground.z)
      const d2 = Math.hypot((cc.x2 as number) - ground.x, (cc.z2 as number) - ground.z)
      if (Math.min(d1, d2, Math.hypot(mx - ground.x, mz - ground.z)) < ground.radius + 1)
        console.log('near-ground segment', JSON.stringify(c))
    }
    // Probe red spots from the scan and a fine grid around each
    for (const [px, pz] of [
      [10.55, -5.7],
      [13.81, -11.64],
      [13.9, -14.83],
      [6.75, -7.72],
      [15.76, -8.07],
    ] as const) {
      const inGround = Math.hypot(px - ground.x, pz - ground.z) <= ground.radius
      const clear = standingClear(colliders, px, pz, NPC_RADIUS)
      console.log(
        `probe (${px},${pz}) inGround=${inGround} rimDist=${(ground.radius - Math.hypot(px - ground.x, pz - ground.z)).toFixed(2)} standingClear=${clear}`,
      )
    }
    // ASCII map of the ground: 0.25 m cells, '#' blocked, '.' free
    const R = ground.radius
    let map = ''
    for (let gz = ground.z + R; gz >= ground.z - R; gz -= 0.35) {
      let row = ''
      for (let gx = ground.x - R; gx <= ground.x + R; gx += 0.25) {
        const inG = Math.hypot(gx - ground.x, gz - ground.z) <= R
        if (!inG) {
          row += ' '
          continue
        }
        row += standingClear(colliders, gx, gz, NPC_RADIUS) ? '.' : '#'
      }
      map += row + '\n'
    }
    console.log(`map top-left = (${(ground.x - R).toFixed(1)}, ${(ground.z + R).toFixed(1)}), +x right, +z UP\n` + map)
  })
})
