import { expect, it } from 'vitest'
import { buildLayout } from './layout'
import { playRockFlank } from './playRockSurface'
import { standingClear, WALKER_RADIUS } from './collision'
import { touchStand, type BankEnd, TOUCH_GAP } from './bankGame'
import { reachFrom, solveTouch } from './rockTouch'
import { CHILD_FIGURE_SCALE } from '../../render/figures'

// A longer ground search must still satisfy the same contact tolerance.
it('recovers no reachable Bambara stand by extending the blocked search to 40 cm', () => {
  let rejectedBeyondSearch = 0
  let accepted = 0
  for (const seed of [42, 3791639114, 2972259115]) {
    const layout = buildLayout('bambara-village', seed)
    const rocks = layout.playRocks!
    const stage = { ...rocks, flank: playRockFlank(rocks) }
    const blocked = (x: number, z: number) => !standingClear(layout.colliders, x, z, WALKER_RADIUS)
    const mid = { x: (rocks.upstream.x + rocks.downstream.x) / 2, z: (rocks.upstream.z + rocks.downstream.z) / 2 }
    for (const end of ['upstream', 'downstream'] as BankEnd[]) {
      const here = rocks[end]
      const base = Math.atan2(mid.x - here.x, mid.z - here.z)
      for (let k = -6; k <= 6; k++) {
        const bearing = base + k * Math.PI / 12
        const flank = (y: number, offset: number) => stage.flank(end, bearing + offset, y)
        const solved = solveTouch(flank, CHILD_FIGURE_SCALE)!
        const at = (r: number) => ({ x: here.x + Math.sin(bearing) * r, z: here.z + Math.cos(bearing) * r })
        let free = null
        for (let mm = 0; mm <= 400; mm++) {
          const p = at(solved.stand + mm / 1000)
          if (!blocked(p.x, p.z)) { free = { mm, gap: reachFrom(solved.stand + mm / 1000, flank, CHILD_FIGURE_SCALE)!.gap }; break }
        }
        const stand = touchStand(stage, end, blocked, bearing)
        if (stand) {
          accepted++
          expect(blocked(stand.x, stand.z)).toBe(false)
        } else {
          expect(free).not.toBeNull()
          expect(Math.abs(free!.gap), JSON.stringify({ seed, end, degrees: k * 15, free })).toBeGreaterThan(TOUCH_GAP)
          if (free!.mm > 20) rejectedBeyondSearch++
        }
      }
    }
  }
  expect(accepted).toBe(27)
  expect(rejectedBeyondSearch).toBe(39)
})
