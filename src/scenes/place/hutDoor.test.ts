// The doorway of a village hut shows no wall surface inside its opening: every
// line of sight from a walking player's eye to a point of the opening reaches
// the dark door panel or the dark lining first, never the mud wall.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { HUT_WALL_FOOT, HUT_WALL_SEGMENTS, cylinderArgs, hutWallParts, type HutCylinder } from './hutDoor'
import { EYE_HEIGHT, HUT_STILT_BASE } from './roofClearance'

function cylinderMesh(name: string, c: HutCylinder, side: THREE.Side): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(...cylinderArgs(c)), new THREE.MeshBasicMaterial({ side }))
  m.name = name
  m.position.set(0, c.y, 0)
  m.updateMatrixWorld()
  return m
}

/** The meshes VillageHut draws for its wall and door, built from the same parts. */
function hutMeshes(r: number, wallH: number, base: number): THREE.Mesh[] {
  const p = hutWallParts(r, wallH, base)
  const door = new THREE.Mesh(new THREE.BoxGeometry(p.door.width, p.door.height, p.door.depth), new THREE.MeshBasicMaterial())
  door.name = 'door'
  door.position.set(p.door.x, p.door.y, p.door.z)
  door.updateMatrixWorld()
  return [
    cylinderMesh('wall', p.wall, THREE.FrontSide),
    cylinderMesh('lintel', p.lintel, THREE.FrontSide),
    cylinderMesh('lining', p.lining, THREE.BackSide),
    door,
  ]
}

/** The construction this replaced: a full wall cylinder with a flat dark box
 *  laid against it. Kept to prove the check catches the bright wedge. */
function formerHutMeshes(r: number, wallH: number, base: number): THREE.Mesh[] {
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, wallH, 12), new THREE.MeshBasicMaterial())
  wall.name = 'wall'
  wall.position.set(0, base + wallH / 2, 0)
  wall.updateMatrixWorld()
  const door = new THREE.Mesh(new THREE.BoxGeometry(r * 0.55, wallH * 0.72, 0.12), new THREE.MeshBasicMaterial())
  door.name = 'door'
  door.position.set(0, base + wallH * 0.36, r * 0.99)
  door.updateMatrixWorld()
  return [wall, door]
}

/** Points spread over the opening: on the removed facet's plane, inset a hair
 *  from its edges, from threshold to lintel. */
function openingPoints(r: number, wallH: number, base: number): THREE.Vector3[] {
  const p = hutWallParts(r, wallH, base)
  const out: THREE.Vector3[] = []
  const foot = p.wall.radiusBottom
  for (let i = 0; i <= 8; i++) {
    const y = p.opening.bottom + (p.opening.top - p.opening.bottom) * (0.02 + 0.96 * (i / 8))
    const rad = foot + (r - foot) * ((y - base) / wallH)
    const halfChord = rad * Math.sin(p.opening.halfAngle)
    const z = rad * Math.cos(p.opening.halfAngle)
    for (let j = 0; j <= 6; j++) out.push(new THREE.Vector3(halfChord * 0.96 * (-1 + (2 * j) / 6), y, z))
  }
  return out
}

/** Eye positions a walking player reaches in front of the door: ground or the
 *  stilt platform's level, 1.2–8 m from the doorway, up to 80° off its axis
 *  (from further round the side the opening faces away and shows no inside). */
function eyes(r: number, base: number): THREE.Vector3[] {
  const doorwayZ = r * HUT_WALL_FOOT * Math.cos(Math.PI / HUT_WALL_SEGMENTS)
  const out: THREE.Vector3[] = []
  for (const floor of base > 0 ? [0, base] : [0])
    for (const dist of [1.2, 2.5, 5, 8])
      for (const deg of [-80, -65, -45, -20, 0, 20, 45, 65, 80]) {
        const a = (deg * Math.PI) / 180
        out.push(new THREE.Vector3(Math.sin(a) * dist, floor + EYE_HEIGHT, doorwayZ + Math.cos(a) * dist))
      }
  return out
}

/** The hut's floor (ground or stilt platform) — the threshold a steep look
 *  down through the opening lands on before reaching the door panel. */
function floorMesh(base: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial())
  m.name = 'floor'
  m.position.set(0, base, 0)
  m.updateMatrixWorld()
  return m
}

/** Every (eye, opening point) pair whose first hit is wall surface, or nothing. */
function wallInOpening(meshes: THREE.Mesh[], r: number, wallH: number, base: number): string[] {
  const ray = new THREE.Raycaster()
  const scene = [...meshes, floorMesh(base)]
  const bad: string[] = []
  for (const eye of eyes(r, base))
    for (const target of openingPoints(r, wallH, base)) {
      ray.set(eye, target.clone().sub(eye).normalize())
      const hit = ray.intersectObjects(scene, false)[0]
      if (!hit || hit.object.name === 'wall' || hit.object.name === 'lintel')
        bad.push(`${hit?.object.name ?? 'nothing'} eye(${eye.x.toFixed(2)},${eye.y.toFixed(2)},${eye.z.toFixed(2)}) → (${target.x.toFixed(2)},${target.y.toFixed(2)})`)
    }
  return bad
}

// Radii and nominal heights across the hut kinds: family huts, the market and
// chief huts, a dome's low wall (0.55·h), and the raised Congo floor.
const HUTS: ReadonlyArray<{ r: number; wallH: number; base: number }> = [
  { r: 1.4, wallH: 2.2, base: 0 },
  { r: 2, wallH: 2.5, base: 0 },
  { r: 2.6, wallH: 2.8, base: 0 },
  { r: 3, wallH: 3, base: 0 },
  { r: 2, wallH: 2.6 * 0.55, base: 0 },
  { r: 2.2, wallH: 2.4, base: HUT_STILT_BASE },
]

describe('hut doorway', () => {
  it.each(HUTS)('shows no wall inside the opening (r $r, wall $wallH, base $base)', ({ r, wallH, base }) => {
    expect(wallInOpening(hutMeshes(r, wallH, base), r, wallH, base)).toEqual([])
  })

  it.each(HUTS)('door panel stands behind the removed facet, inside the hut body (r $r)', ({ r, wallH, base }) => {
    const p = hutWallParts(r, wallH, base)
    const front = p.door.z + p.door.depth / 2
    // The removed facet's plane is nearest the axis at the top (radius r).
    expect(front).toBeLessThan(r * Math.cos(p.opening.halfAngle))
    // Its side edges stay inside the neighbouring facet at the top of the
    // opening, the tightest height: the facet from θ = half to θ = 3·half.
    const lintelFoot = p.lintel.radiusBottom
    const a = new THREE.Vector2(lintelFoot * Math.sin(p.opening.halfAngle), lintelFoot * Math.cos(p.opening.halfAngle))
    const b = new THREE.Vector2(lintelFoot * Math.sin(3 * p.opening.halfAngle), lintelFoot * Math.cos(3 * p.opening.halfAngle))
    const edge = p.door.width / 2
    const facetZ = a.y + ((b.y - a.y) * (edge - a.x)) / (b.x - a.x)
    expect(front).toBeLessThan(facetZ)
  })

  it('catches the former flat door laid against the full wall (mutation check)', () => {
    for (const { r, wallH, base } of HUTS) expect(wallInOpening(formerHutMeshes(r, wallH, base), r, wallH, base).length).toBeGreaterThan(0)
  })
})
