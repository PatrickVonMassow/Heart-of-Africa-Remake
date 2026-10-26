// How a place vignette hands its live runtime to the bug-report dump
// (src/systems/placeDump.ts): reads a drawn figure or object off the scene
// graph — world position, yaw, squat, kneel, lean, crown — and registers the
// vignette's provider while it is mounted. Read-only, and only on an F6 press.
//
// A vignette with a runtime of its own (phases, clocks, holders) registers a
// provider through `usePlaceDumpProvider` and describes its figures itself;
// one without wraps its subtree in `<PlaceDumpGroup>` (PlaceDumpGroup.tsx),
// which lists every figure and every named load under it.

import { useEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import {
  registerPlaceDumpProvider,
  type PlaceFigureSnapshot,
  type PlaceObjectSnapshot,
  type PlaceVec3,
  type PlaceVignetteSnapshot,
} from '../../systems/placeDump'
import { crownIn } from './placeFigureContext'

/** The name every drawn figure's outer group carries (placeFigure, skinnedFigure). */
const FIGURE_NAME = 'inhabitant'

/** Named meshes and groups that are a carried or set-down load. */
export const PLACE_DUMP_LOADS: readonly string[] = [
  'carried-jar-full',
  'carried-jar-empty',
  'task-walker-load',
  'village-loom-carried-bundle',
  'digging-tool',
  'shovel',
  'stand-jar',
  'stand-jar-empty',
  'fish-basket',
  'head-basket',
  'porter-crate',
]

const _v = new THREE.Vector3()
const _s = new THREE.Vector3()
const _d = new THREE.Vector3()

function vec(v: THREE.Vector3): PlaceVec3 {
  return { x: v.x, y: v.y, z: v.z }
}

/** The figure's own outer group: `node` itself, or the first one under it. */
function figureIn(node: THREE.Object3D): THREE.Object3D {
  return node.name === FIGURE_NAME ? node : node.getObjectByName(FIGURE_NAME) ?? node
}

/** Whether `node` and every ancestor are visible. */
export function shownInScene(node: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = node; o; o = o.parent) if (!o.visible) return false
  return true
}

/** World position of any node. */
export function worldPosOf(node: THREE.Object3D): PlaceVec3 {
  node.updateWorldMatrix(true, false)
  return vec(node.getWorldPosition(_v))
}

export interface FigureMeta {
  id: string
  role?: string
  phase?: string | null
  action?: string | null
  /** Overrides for pose values the vignette knows better than the drawn group. */
  lean?: number | null
  squat?: number | null
  kneel?: number | null
  extra?: Record<string, unknown>
}

/** One figure as drawn: `node` is its outer group or a wrapper around it. */
export function figureSnapshot(node: THREE.Object3D, meta: FigureMeta): PlaceFigureSnapshot {
  const fig = figureIn(node)
  fig.updateWorldMatrix(true, true)
  const pos = vec(fig.getWorldPosition(_v))
  fig.getWorldDirection(_d)
  fig.getWorldScale(_s)
  const head = crownIn(fig, null, _v) ? vec(_v) : null
  const ud = fig.userData as { dumpKneel?: number; dumpLean?: number | null; actor?: { kind?: string } }
  return {
    id: meta.id,
    role: meta.role ?? ud.actor?.kind ?? 'figure',
    pos,
    yaw: Math.atan2(_d.x, _d.z),
    phase: meta.phase ?? null,
    action: meta.action ?? null,
    pose: {
      lean: meta.lean !== undefined ? meta.lean : ud.dumpLean ?? null,
      squat: meta.squat !== undefined ? meta.squat : _s.x > 1e-6 ? _s.y / _s.x : null,
      kneel: meta.kneel !== undefined ? meta.kneel : ud.dumpKneel ?? null,
    },
    head,
    visible: shownInScene(fig),
    ...(meta.extra ? { extra: meta.extra } : {}),
  }
}

/** One object as drawn. */
export function objectSnapshot(node: THREE.Object3D, meta: { id: string; kind?: string; holder: string; extra?: Record<string, unknown> }): PlaceObjectSnapshot {
  return {
    id: meta.id,
    kind: meta.kind ?? node.name,
    holder: meta.holder,
    pos: worldPosOf(node),
    ...(meta.extra ? { extra: meta.extra } : {}),
  }
}

/** The figure node holding `node`: its nearest ancestor figure, or a figure
 *  that is a direct child of an ancestor (a load beside the body in its
 *  wrapper). Null when it stands free. */
function holderOf(node: THREE.Object3D, root: THREE.Object3D): THREE.Object3D | null {
  for (let o = node.parent; o && o !== root.parent; o = o.parent) {
    if (o.name === FIGURE_NAME) return o
    const child = o.children.find((c) => c.name === FIGURE_NAME)
    if (child) return child
    if (o === root) break
  }
  return null
}

/**
 * Every figure and every visible named load under `root`, in scene-graph
 * order: figures `<prefix>/<i>`, loads `<prefix>/<name>/<j>` held by the
 * figure they hang from, or `ground`. `describe` adds what the vignette knows
 * about figure `i` (its phase, action, extras).
 */
export function scanVignette(
  root: THREE.Object3D,
  prefix: string,
  describe?: (index: number, figure: THREE.Object3D) => Partial<FigureMeta> | null,
): Pick<PlaceVignetteSnapshot, 'figures' | 'objects'> {
  const figures: THREE.Object3D[] = []
  const loads: THREE.Object3D[] = []
  root.updateWorldMatrix(true, true)
  root.traverse((o) => {
    if (o.name === FIGURE_NAME) figures.push(o)
    else if (PLACE_DUMP_LOADS.includes(o.name) && shownInScene(o)) loads.push(o)
  })
  const idOf = new Map<THREE.Object3D, string>()
  const figureEntries = figures.map((f, i) => {
    const id = `${prefix}/${i}`
    idOf.set(f, id)
    return figureSnapshot(f, { ...describe?.(i, f), id })
  })
  const perName = new Map<string, number>()
  const objectEntries = loads.map((o) => {
    const j = perName.get(o.name) ?? 0
    perName.set(o.name, j + 1)
    const h = holderOf(o, root)
    return objectSnapshot(o, { id: `${prefix}/${o.name}/${j}`, holder: (h && idOf.get(h)) ?? 'ground' })
  })
  return { figures: figureEntries, objects: objectEntries }
}

/** Every visible named load under one figure's node, held by `holder`;
 *  ids `<holder>/<name>/<j>`. */
export function loadsUnder(node: THREE.Object3D, holder: string): PlaceObjectSnapshot[] {
  const out: PlaceObjectSnapshot[] = []
  const perName = new Map<string, number>()
  node.updateWorldMatrix(true, true)
  node.traverse((o) => {
    if (!PLACE_DUMP_LOADS.includes(o.name) || !shownInScene(o)) return
    const j = perName.get(o.name) ?? 0
    perName.set(o.name, j + 1)
    out.push(objectSnapshot(o, { id: `${holder}/${o.name}/${j}`, holder }))
  })
  return out
}

/** Registers `fn` as the dump provider `id` while the calling component is
 *  mounted; always reads the latest `fn`. */
export function usePlaceDumpProvider(id: string, fn: () => PlaceVignetteSnapshot): void {
  const latest = useRef(fn)
  useEffect(() => {
    latest.current = fn
  })
  useEffect(() => registerPlaceDumpProvider(id, () => latest.current()), [id])
}
