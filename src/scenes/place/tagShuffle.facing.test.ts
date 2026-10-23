// THE CHILDREN RUN FACING WHERE THEY RUN (user report 21.10.2026, "Die Kinder
// laufen seitwärts"), replayed at the reported seed in the bambara village,
// whose children play the bank round. When a phase starts (the gather, a run)
// the whole group's way turns at once; the body eases after it at `turnRate`,
// and a group that set off at once ran up to 175° off its body for ~2 m each.

import { describe, expect, it } from 'vitest'
import { frame, village } from './tagShuffleHarness'

describe('the children run facing where they run', () => {
  it('never runs a child far with its body more than a quarter turn off its travel', () => {
    const v = village('bambara-village', 2694999956)
    const prev = v.children.map((c) => ({ x: c.x, z: c.z }))
    const sideways = v.children.map(() => 0)
    let worst = 0
    let running = 0
    // 160 s covers the first gather (100 s) and the first run after it.
    for (let t = 0; t < 160; t += 1 / 60) {
      frame(v, 1 / 60)
      v.children.forEach((c, i) => {
        const dx = c.x - prev[i].x
        const dz = c.z - prev[i].z
        prev[i] = { x: c.x, z: c.z }
        const d = Math.hypot(dx, dz)
        const travel = Math.atan2(dx, dz)
        const off = Math.abs(Math.atan2(Math.sin(c.facing - travel), Math.cos(c.facing - travel)))
        // A run (over 2.5 m/s) with the body past a quarter turn. Judged as a
        // DISTANCE so a single-frame push of the group separation is no run.
        if (d * 60 > 2.5) running++
        if (d * 60 > 2.5 && off > Math.PI / 2) {
          sideways[i] += d
          worst = Math.max(worst, sideways[i])
        } else sideways[i] = 0
      })
    }
    expect(running).toBeGreaterThan(500)
    expect(worst).toBeLessThan(0.3)
  }, 60_000)

  // Also the walk out of a way round an obstacle that ran out on the clock
  // (point 1424, 0.303 m, the boulder climber at t 80.05 s): it eases round now.
  it('never walks a child far backwards', () => {
    // A walk (over 1 m/s) with the body past three-eighths of a turn off its
    // travel. The roam's rim reflection flipped the walk in one frame and
    // left a child walking backwards for metres.
    const v = village('bambara-village', 2694999956)
    const prev = v.children.map((c) => ({ x: c.x, z: c.z }))
    const backwards = v.children.map(() => 0)
    let worst = 0
    for (let t = 0; t < 160; t += 1 / 60) {
      frame(v, 1 / 60)
      v.children.forEach((c, i) => {
        const dx = c.x - prev[i].x
        const dz = c.z - prev[i].z
        prev[i] = { x: c.x, z: c.z }
        const d = Math.hypot(dx, dz)
        const travel = Math.atan2(dx, dz)
        const off = Math.abs(Math.atan2(Math.sin(c.facing - travel), Math.cos(c.facing - travel)))
        if (d * 60 > 1 && off > (Math.PI * 3) / 4) {
          backwards[i] += d
          worst = Math.max(worst, backwards[i])
        } else backwards[i] = 0
      })
    }
    expect(worst).toBeLessThan(0.3)
  }, 60_000)
})
