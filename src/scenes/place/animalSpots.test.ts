// The settlement animals' grazing spots and mutual separation (point 413). The
// reported picture was "wildes Durcheinanderclippen": goats standing inside one
// another and inside a tent. Both halves are pure and pinned here; the sweep
// over every real settlement lives in layout.test.ts.

import { describe, expect, it } from 'vitest'
import {
  ANIMAL_RADIUS,
  animalAnchors,
  animalBodies,
  animalScene,
  stepAnimal,
} from './animalSpots'
import { boxCollider, spawnPointFree, standingClear, type Collider } from './collision'
import { buildLayout } from './layout'

const PEN = { x: 6.8, z: 2.2, r: 3.4 }

describe('animalAnchors (point 413 — a grazing spot on free ground)', () => {
  it('is deterministic for a seed', () => {
    expect(animalAnchors(11, 4, null, [])).toEqual(animalAnchors(11, 4, null, []))
  })

  it('keeps penned animals inside their pen and free ones in the open ring', () => {
    for (const a of animalAnchors(3, 6, PEN, [])) {
      expect(Math.hypot(a.x - PEN.x, a.z - PEN.z)).toBeLessThanOrEqual(PEN.r)
      expect(a.amp).toBeCloseTo(0.6, 6)
    }
    for (const a of animalAnchors(3, 6, null, [])) {
      const r = Math.hypot(a.x, a.z)
      expect(r).toBeGreaterThanOrEqual(9)
      expect(r).toBeLessThanOrEqual(21)
      expect(a.amp).toBeCloseTo(1.5, 6)
    }
  })

  it('moves an anchor that would land inside a tent onto free ground', () => {
    const raw = animalAnchors(5, 5, null, [])
    // A tent right on the first raw anchor — the unvalidated case the report
    // showed. Every returned anchor must stand clear AND be able to leave.
    const tent: Collider[] = [boxCollider(raw[0].x, raw[0].z, 2, 2, 0.4)]
    expect(standingClear(tent, raw[0].x, raw[0].z, ANIMAL_RADIUS)).toBe(false)
    const fixed = animalAnchors(5, 5, null, tent)
    expect(fixed[0].x === raw[0].x && fixed[0].z === raw[0].z).toBe(false) // it moved
    for (const a of fixed) expect(spawnPointFree(tent, a.x, a.z, ANIMAL_RADIUS)).toBe(true)
  })

  it('leaves an already-free anchor exactly where it was', () => {
    const rock: Collider[] = [{ x: 100, z: 100, r: 2 }]
    expect(animalAnchors(9, 4, PEN, rock)).toEqual(animalAnchors(9, 4, PEN, []))
  })
})

describe('stepAnimal (point 413 — the herd is an obstacle to itself)', () => {
  const herd = (spots: Array<[number, number]>) => {
    const bodies = animalBodies(spots.map(([x, z]) => ({ x, z, phase: 0, amp: 1 })))
    return { bodies, scene: animalScene([], bodies) }
  }

  it('separates two animals released onto the same spot', () => {
    const { bodies, scene } = herd([
      [0, 0],
      [0, 0],
    ])
    // Both try to stay where they are; the second cannot stand in the first.
    stepAnimal(scene, bodies, 0, 0, 0, 0, 0)
    stepAnimal(scene, bodies, 1, 0, 0, 0, 0)
    const apart = Math.hypot(bodies[0].x - bodies[1].x, bodies[0].z - bodies[1].z)
    expect(apart).toBeGreaterThanOrEqual(2 * ANIMAL_RADIUS - 1e-6)
  })

  it('keeps a whole herd apart when every member wants the same spot', () => {
    const { bodies, scene } = herd([
      [0.05, 0],
      [0, 0.05],
      [-0.05, 0],
      [0, -0.05],
    ])
    for (let pass = 0; pass < 40; pass++) {
      for (let i = 0; i < bodies.length; i++) stepAnimal(scene, bodies, i, 0, 0, bodies[i].x, bodies[i].z)
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const d = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z)
        expect(d, `${i}/${j}`).toBeGreaterThan(2 * ANIMAL_RADIUS - 0.01)
      }
    }
  })

  it('never blocks an animal on its OWN body', () => {
    const { bodies, scene } = herd([[0, 0]])
    const [x, z] = stepAnimal(scene, bodies, 0, 2, 3, 0, 0)
    expect(x).toBeCloseTo(2, 6)
    expect(z).toBeCloseTo(3, 6)
  })

  it('restores the mover into the scene, so the next animal sees it', () => {
    const { bodies, scene } = herd([
      [0, 0],
      [5, 5],
    ])
    stepAnimal(scene, bodies, 0, 0, 0, 0, 0)
    expect(scene[scene.length - 2]).toBe(bodies[0])
    expect(scene[scene.length - 1]).toBe(bodies[1])
  })

  it('is swept, so an animal cannot cross a fence panel in one step', () => {
    const panel: Collider = { kind: 'segment', x1: -3, z1: 0, x2: 3, z2: 0, r: 0.42 }
    const bodies = animalBodies([{ x: 0, z: -2, phase: 0, amp: 1 }])
    const scene = animalScene([panel], bodies)
    const [, z] = stepAnimal(scene, bodies, 0, 0, 2, 0, -2)
    expect(z).toBeLessThan(0)
  })
})

// The reported case itself (point 413): an animal wandering at a real village's
// compound fence. The wobble target crosses to the far side every cycle — the
// old position-only resolve then simply put the animal there.
describe('an animal at a real village fence (point 413)', () => {
  it.each(['hausa-village', 'maasai-village', 'tuareg-village'] as const)('%s: never ends up on the far side', (id) => {
    const layout = buildLayout(id, 42)
    const fences = layout.fences.filter((f) => f.posts.length > 3)
    expect(fences.length).toBeGreaterThan(0)
    for (const f of fences) {
      // The ring's centre, so "outside" is well defined for this fence.
      const cx = f.posts.reduce((s, p) => s + p[0], 0) / f.posts.length
      const cz = f.posts.reduce((s, p) => s + p[1], 0) / f.posts.length
      for (let i = 0; i < f.posts.length; i += 5) {
        const a = f.posts[i]
        const b = f.posts[(i + 1) % f.posts.length]
        const mx = (a[0] + b[0]) / 2
        const mz = (a[1] + b[1]) / 2
        const nl = Math.hypot(mx - cx, mz - cz) || 1
        const nx = (mx - cx) / nl
        const nz = (mz - cz) / nl
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 2) continue // a gate
        const bodies = animalBodies([{ x: mx + nx * 1.2, z: mz + nz * 1.2, phase: 0, amp: 1 }])
        const scene = animalScene(layout.colliders, bodies)
        if (!standingClear(layout.colliders, bodies[0].x, bodies[0].z, ANIMAL_RADIUS)) continue
        // 60 frames of a wobble whose target keeps swinging through the wall.
        for (let k = 0; k < 60; k++) {
          const swing = Math.sin(k * 0.4) * 1.5
          stepAnimal(scene, bodies, 0, mx + nx * swing, mz + nz * swing, bodies[0].x, bodies[0].z)
        }
        const side = (bodies[0].x - mx) * nx + (bodies[0].z - mz) * nz
        expect(side, `${id}: ${f.kind} panel ${i} crossed (side ${side.toFixed(2)})`).toBeGreaterThan(0)
      }
    }
  })
})
