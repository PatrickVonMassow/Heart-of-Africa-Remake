// The villager's glTF body (work-order "glTF villager body"): public/models/
// villager.glb, built by scripts/villager/build.mjs from CC0 MakeHuman and
// Quaternius sources and loaded here with three's GLTFLoader — no new runtime
// dependency, and nothing of Blender at run time.
//
// The file holds one skeleton (identity rest rotations, so a bone's rest is
// only its offset), the body and every prepared garment as skinned meshes with
// the same morph targets, the clips, and in the scene's extras the joints'
// morph deltas, the feet's contact points, each clip's natural ground speed and
// the tool grip. This module turns it into plain data the figure and the pure
// pose functions read; nothing here touches the scene graph of a figure.

import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type VillagerClipKind = 'gait' | 'loop' | 'once' | 'hold'

export interface ToolGrip {
  /** The hand the tool is attached to, and where along the tool's shaft (its
   *  +y, tool units = figure units) that hand holds it. */
  hand: 'L' | 'R'
  grip: number
  /** Where the other hand holds the shaft, when both do. */
  other?: number
}

export interface VillagerClip {
  name: string
  kind: VillagerClipKind
  duration: number
  /** Natural ground speed of a gait at the basis body (figure units / s). */
  speed: number
  times: Float32Array
  /** Per bone, frames × 4 (x, y, z, w) local rotations. */
  rot: Float32Array[]
  /** Hips position per frame (frames × 3), basis body. */
  hips: Float32Array
  tool?: ToolGrip
  /** How far each hand is closed (0 … 1) through the clip. */
  grip?: { L?: number; R?: number }
}

export interface ContactPoints {
  heel: THREE.Vector3
  ball: THREE.Vector3
  tip: THREE.Vector3
  knee: THREE.Vector3
}

export interface VillagerAsset {
  bones: string[]
  /** Parent index per bone, −1 for the root (hips). Parents come before children. */
  parents: number[]
  /** Rest head of each bone (figure units, basis body), bones × 3. */
  rest: Float32Array
  /** Rest tail of each bone (basis), bones × 3. */
  tails: Float32Array
  morphs: string[]
  /** Per morph, each bone's head displacement at full influence (bones × 3). */
  jointDeltas: Record<string, Float32Array>
  /** Geometry per mesh name ('body', garments…), with all morph targets. */
  geometries: Record<string, THREE.BufferGeometry>
  /** What each mesh is: 'skin', 'garment', 'hair', 'eyes'. */
  parts: Record<string, string>
  /** Per mesh, the garment metadata the pipeline wrote (form, wear…). */
  meshExtras: Record<string, Record<string, unknown>>
  clips: Record<string, VillagerClip>
  contactPoints: { L: ContactPoints; R: ContactPoints }
  /** The tool-in-hand rotation and the fist's hole per hand (hand bone frame). */
  toolHold: { L: { rotation: THREE.Quaternion; offset: THREE.Vector3 }; R: { rotation: THREE.Quaternion; offset: THREE.Vector3 } }
  stature: number
  /** The garments of the body's cover mask, in bit order (render/villagerGarmentMask.ts); empty without one. */
  garmentMask: string[]
}

/** The bone name a glTF node carries ('.' is reserved by three's
 *  PropertyBinding, so the file writes 'upperArm_L'). */
export const boneOfNode = (node: string): string => node.replace(/_(L|R)$/, '.$1')

const v3 = (a: unknown): THREE.Vector3 => {
  const [x, y, z] = (a as number[]) ?? [0, 0, 0]
  return new THREE.Vector3(x, y, z)
}

interface Meta {
  bones: string[]
  parents: Record<string, string | null>
  morphs: string[]
  jointDeltas: Record<string, Record<string, number[]>>
  tails: Record<string, number[]>
  contactPoints: Record<'L' | 'R', Record<'heel' | 'ball' | 'tip' | 'knee', number[]>>
  clips: Record<string, { duration: number; kind: VillagerClipKind; speed?: number; tool?: ToolGrip; grip?: { L?: number; R?: number } }>
  toolHold: Record<'L' | 'R', { rotation: number[]; offset: number[] }>
  stature: number
  garmentMask?: { garments: string[] }
}

/** Turn a parsed glTF into the villager asset. */
export function villagerFromGltf(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): VillagerAsset {
  const meta = gltf.scene.userData.villager as Meta
  if (!meta) throw new Error('villager.glb: no scene extras')
  const bones = meta.bones
  const index = new Map(bones.map((b, i) => [b, i]))
  const parents = bones.map((b) => (meta.parents[b] ? index.get(meta.parents[b] as string)! : -1))
  // Rest heads: the bone nodes' accumulated offsets (rest rotations are the identity).
  const rest = new Float32Array(bones.length * 3)
  const byName = new Map<string, THREE.Object3D>()
  gltf.scene.traverse((o) => {
    if ((o as THREE.Bone).isBone || bones.includes(boneOfNode(o.name))) byName.set(boneOfNode(o.name), o)
  })
  const order = topoOrder(parents)
  for (const i of order) {
    const node = byName.get(bones[i])
    if (!node) throw new Error(`villager.glb: no bone ${bones[i]}`)
    const p = parents[i]
    rest[i * 3] = node.position.x + (p >= 0 ? rest[p * 3] : 0)
    rest[i * 3 + 1] = node.position.y + (p >= 0 ? rest[p * 3 + 1] : 0)
    rest[i * 3 + 2] = node.position.z + (p >= 0 ? rest[p * 3 + 2] : 0)
  }
  const tails = new Float32Array(bones.length * 3)
  bones.forEach((b, i) => tails.set(meta.tails[b], i * 3))
  const jointDeltas: Record<string, Float32Array> = {}
  for (const m of meta.morphs) {
    const a = new Float32Array(bones.length * 3)
    bones.forEach((b, i) => a.set(meta.jointDeltas[m][b], i * 3))
    jointDeltas[m] = a
  }
  const geometries: Record<string, THREE.BufferGeometry> = {}
  const parts: Record<string, string> = {}
  const meshExtras: Record<string, Record<string, unknown>> = {}
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    const g = mesh.geometry
    // three keeps the morph names on the mesh; carry them on the geometry.
    g.userData.targetNames = Object.keys(mesh.morphTargetDictionary ?? {}).sort((a, b) => mesh.morphTargetDictionary![a] - mesh.morphTargetDictionary![b])
    geometries[mesh.name] = g
    parts[mesh.name] = String(mesh.userData.part ?? 'garment')
    meshExtras[mesh.name] = { ...mesh.userData }
  })
  const clips: Record<string, VillagerClip> = {}
  for (const a of gltf.animations) {
    const m = meta.clips[a.name]
    if (!m) continue
    const rot: Float32Array[] = bones.map(() => new Float32Array(0))
    let times: Float32Array = new Float32Array(0)
    let hips: Float32Array = new Float32Array(0)
    for (const t of a.tracks) {
      const dot = t.name.lastIndexOf('.')
      const bone = boneOfNode(t.name.slice(0, dot))
      const prop = t.name.slice(dot + 1)
      const i = index.get(bone)
      if (i === undefined) continue
      times = t.times as Float32Array
      if (prop === 'quaternion') rot[i] = t.values as Float32Array
      else if (prop === 'position' && i === 0) hips = t.values as Float32Array
    }
    clips[a.name] = { name: a.name, kind: m.kind, duration: m.duration, speed: m.speed ?? 0, times, rot, hips, tool: m.tool, grip: m.grip }
  }
  const cp = (s: 'L' | 'R'): ContactPoints => ({
    heel: v3(meta.contactPoints[s].heel),
    ball: v3(meta.contactPoints[s].ball),
    tip: v3(meta.contactPoints[s].tip),
    knee: v3(meta.contactPoints[s].knee),
  })
  const hold = (s: 'L' | 'R') => {
    const r = meta.toolHold[s].rotation
    return { rotation: new THREE.Quaternion(r[0], r[1], r[2], r[3]), offset: v3(meta.toolHold[s].offset) }
  }
  return {
    bones,
    parents,
    rest,
    tails,
    morphs: meta.morphs,
    jointDeltas,
    geometries,
    parts,
    meshExtras,
    clips,
    contactPoints: { L: cp('L'), R: cp('R') },
    toolHold: { L: hold('L'), R: hold('R') },
    stature: meta.stature,
    garmentMask: meta.garmentMask?.garments ?? [],
  }
}

/** Bone indices with every parent before its children. */
export function topoOrder(parents: readonly number[]): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  const add = (i: number) => {
    if (seen.has(i)) return
    if (parents[i] >= 0) add(parents[i])
    seen.add(i)
    out.push(i)
  }
  parents.forEach((_, i) => add(i))
  return out
}

/** Parse the .glb bytes (tests read the committed file with this). */
export function parseVillager(data: ArrayBuffer): Promise<VillagerAsset> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, '', (gltf) => resolve(villagerFromGltf(gltf)), reject)
  })
}

let loading: Promise<VillagerAsset> | null = null
let loaded: VillagerAsset | null = null

/** Start loading the villager asset (once); the figures read it when ready. */
export function loadVillagerAsset(): Promise<VillagerAsset> {
  if (!loading) {
    const url = `${import.meta.env.BASE_URL}models/villager.glb`
    loading = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`villager.glb: HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const t0 = performance.now()
        return parseVillager(buf).then((a) => {
          // read by the verification's load-cost record (graphics-detail-levels.md)
          performance.measure?.('villager-glb-parse', { start: t0, end: performance.now(), detail: { bytes: buf.byteLength } })
          return a
        })
      })
      .then((a) => (loaded = a))
    loading.catch((e) => {
      // A missing or broken asset leaves the code-built body in place.
      console.warn('[villager] glTF body unavailable:', e)
    })
  }
  return loading
}

/** The loaded asset, or null while it is still on its way. */
export const villagerAsset = (): VillagerAsset | null => loaded
