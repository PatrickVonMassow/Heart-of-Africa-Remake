import { expect, it } from 'vitest'
import * as THREE from 'three'
import { buildPlayRock } from '../../render/flora'
import { CHILD_FIGURE_SCALE as SCALE, FIGURE_LIMBS as L } from '../../render/figures'
import { applyFigurePose } from '../../render/figurePose'
import { gesturePose, handAt, startGesture } from '../../render/gesture'
import { buildLayout } from './layout'
import { PLAY_ROCK_SEEDS, playRockFlank, playRockYaw } from './playRockSurface'
import { rockAt, touchReach, touchStand, type BankStage } from './bankGame'

it('measures the solved hand against its scene pivots and the stone triangles', () => {
  const rows = []
  for (const id of ['nubian-village', 'bambara-village', 'mandinka-village']) {
    const rocks = buildLayout(id, 42).playRocks!
    const stage = { ...rocks, flank: playRockFlank(rocks) } as BankStage
    for (const end of ['upstream', 'downstream'] as const) {
      const stand = touchStand(stage, end)!
      const rock = rockAt(stage, end)
      const reach = touchReach(stage, end, stand)!
      const root = new THREE.Group()
      root.position.set(stand.x, 0, stand.z)
      root.rotation.y = Math.atan2(rock.x - stand.x, rock.z - stand.z)
      root.scale.setScalar(SCALE)
      const trunk = new THREE.Group()
      trunk.position.y = L.hipY
      root.add(trunk)
      const arm = new THREE.Group()
      arm.position.set(L.shoulderX, L.shoulderY - L.hipY, 0)
      arm.rotation.order = 'YXZ'
      trunk.add(arm)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(L.handRadius, 12, 8))
      hand.position.y = -L.armLength
      arm.add(hand)
      applyFigurePose({ arms: [arm], trunk }, gesturePose(startGesture('touch', { elevation: reach.elevation })))
      root.updateWorldMatrix(true, true)
      const drawn = hand.getWorldPosition(new THREE.Vector3())
      const solved = root.localToWorld(new THREE.Vector3(...handAt('left', 0, reach.elevation, 0.5, L.hipY)))
      expect(drawn.distanceTo(solved)).toBeLessThan(1e-12)
      const geometry = buildPlayRock(PLAY_ROCK_SEEDS[end === 'upstream' ? 0 : 1])
      geometry.scale(rocks.scale, rocks.scale, rocks.scale)
      geometry.rotateY(playRockYaw(rock))
      geometry.translate(rock.x, 0, rock.z)
      const p = geometry.getAttribute('position')
      const index = geometry.index
      const triangle = new THREE.Triangle()
      const closest = new THREE.Vector3()
      let distance = Infinity
      for (let k = 0; k < (index?.count ?? p.count); k += 3) {
        for (const [v, offset] of [[triangle.a, 0], [triangle.b, 1], [triangle.c, 2]] as const) {
          v.fromBufferAttribute(p, index ? index.getX(k + offset) : k + offset)
        }
        triangle.closestPointToPoint(drawn, closest)
        distance = Math.min(distance, drawn.distanceTo(closest))
      }
      rows.push({ id, end, solvedGap: reach.gap, triangleGap: distance - L.handRadius * SCALE })
      geometry.dispose()
      hand.geometry.dispose()
    }
  }
  console.table(rows)
})
