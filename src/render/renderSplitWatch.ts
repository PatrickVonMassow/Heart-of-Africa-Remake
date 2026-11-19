// DEV: split the 'render-submit' frame work (docs/perf-1543-driving-hitches.md,
// round 3: on the real GPU the F8 driving p95 sits inside renderer.render).
// Books, as nested 'render:*' / 'gpu:*' systems of the current frame:
// - every renderer.render call by kind, EXCLUSIVE of nested renders (the scene
//   pass and shadow maps render inside the post quad): 'render:main'
//   (perspective camera), 'render:quad' (a QuadMesh: post passes),
//   'render:shadow' (other cameras);
// - the WebGPU entry points that can block or build on the main thread:
//   getCurrentTexture (waits when the GPU is frames behind), queue.submit,
//   synchronous pipeline / shader-module / bind-group creation, writeBuffer.
// Structural typing; the WebGPU prototypes are wrapped only where present.
// Imported dynamically in DEV only.

import { markFrameWork, type FrameSystem } from '../systems/longFrame'

interface RendererLike {
  render: (scene: unknown, camera: unknown) => unknown
}

type Proto = Record<string, unknown>

function wrapProto(proto: Proto | undefined, method: string, system: FrameSystem, restore: Array<() => void>): void {
  const original = proto?.[method]
  if (!proto || typeof original !== 'function') return
  const fn = original as (...a: unknown[]) => unknown
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    const t0 = performance.now()
    try {
      return fn.apply(this, args)
    } finally {
      markFrameWork(system, performance.now() - t0)
    }
  }
  proto[method] = wrapped
  restore.push(() => {
    if (proto[method] === wrapped) proto[method] = original
  })
}

/** The kind of one renderer.render call: a QuadMesh renders itself (a mesh,
 *  not a scene) — the post passes; a scene through a perspective camera is the
 *  main pass; anything else (orthographic shadow cameras) is a shadow pass. */
export function renderKind(scene: unknown, camera: unknown): 'render:main' | 'render:quad' | 'render:shadow' {
  if ((scene as { isMesh?: boolean }).isMesh) return 'render:quad'
  if ((camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera) return 'render:main'
  return 'render:shadow'
}

/** Uploads at or above this many bytes are named after their owner. */
export const NAMED_UPLOAD_BYTES = 256 * 1024

interface AttrLike {
  array?: ArrayLike<number> & { byteLength?: number }
  updateRanges?: Array<{ start: number; count: number }>
  name?: string
  data?: AttrLike
}

/** Bytes one attribute upload writes: its update ranges, else the whole array. */
export function uploadBytes(attr: AttrLike): number {
  const a = attr.data ?? attr
  const arr = a.array
  const bpe =
    arr && 'BYTES_PER_ELEMENT' in arr ? (arr as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT : 4
  const ranges = a.updateRanges ?? []
  if (ranges.length > 0) return ranges.reduce((n, r) => n + r.count * bpe, 0)
  return arr?.byteLength ?? 0
}

interface Obj3 {
  name?: string
  type?: string
  geometry?: { attributes?: Record<string, AttrLike>; index?: AttrLike | null }
  instanceMatrix?: AttrLike
  instanceColor?: AttrLike | null
  children?: Obj3[]
}

/** Name the scene object/attribute that owns `array` ('?' when none does). */
export function uploadOwner(root: Obj3 | null, array: unknown): string {
  if (!root || !array) return '?'
  const stack: Obj3[] = [root]
  while (stack.length > 0) {
    const o = stack.pop() as Obj3
    const who = o.name || o.type || 'object'
    if (o.instanceMatrix?.array === array) return `${who}.instanceMatrix`
    if (o.instanceColor?.array === array) return `${who}.instanceColor`
    const attrs = o.geometry?.attributes
    if (attrs) for (const [k, v] of Object.entries(attrs)) if ((v.data ?? v).array === array) return `${who}.${k}`
    if (o.geometry?.index?.array === array) return `${who}.index`
    if (o.children) stack.push(...o.children)
  }
  return '?'
}

/** Arm the split on `renderer`; returns the restore function. */
export function watchRenderSplit(renderer: unknown): () => void {
  const restore: Array<() => void> = []
  const r = renderer as RendererLike
  const original = r.render
  // Exclusive timing: each frame on the stack subtracts its children.
  const childMs: number[] = []
  let mainScene: Obj3 | null = null
  // Attribute uploads by owner and size (round 4: the real-GPU plateau is
  // writeBuffer time). Large ones are named: 'gpu:upload <owner> <MB>'.
  let uploadsArmed = false
  const armUploads = (): void => {
    const utils = (
      renderer as {
        backend?: {
          attributeUtils?: { updateAttribute?: (a: AttrLike) => void }
        }
      }
    ).backend?.attributeUtils
    const update = utils?.updateAttribute
    if (!utils || typeof update !== 'function') return
    uploadsArmed = true
    {
      const wrappedUpdate = function (this: unknown, attr: AttrLike): void {
        const bytes = uploadBytes(attr)
        const t0 = performance.now()
        try {
          update.call(this, attr)
        } finally {
          const ms = performance.now() - t0
          const key =
            bytes >= NAMED_UPLOAD_BYTES
              ? `gpu:upload ${uploadOwner(mainScene, (attr.data ?? attr).array)} ${(bytes / 1e6).toFixed(2)}MB`
              : 'gpu:upload small'
          markFrameWork(key as FrameSystem, ms)
        }
      }
      utils.updateAttribute = wrappedUpdate
      restore.push(() => {
        if (utils.updateAttribute === wrappedUpdate) utils.updateAttribute = update
      })
    }
  }
  const wrapped = function (this: RendererLike, scene: unknown, camera: unknown): unknown {
    if ((scene as { isScene?: boolean }).isScene) mainScene = scene as Obj3
    // The backend's attribute utils exist only after its async init.
    if (!uploadsArmed) armUploads()
    const t0 = performance.now()
    childMs.push(0)
    try {
      return original.call(this, scene, camera)
    } finally {
      const total = performance.now() - t0
      const own = total - (childMs.pop() ?? 0)
      if (childMs.length > 0) childMs[childMs.length - 1] += total
      markFrameWork(renderKind(scene, camera), own)
    }
  }
  r.render = wrapped
  restore.push(() => {
    if (r.render === wrapped) r.render = original
  })
  const g = globalThis as unknown as Record<string, { prototype?: Proto } | undefined>
  wrapProto(g.GPUCanvasContext?.prototype, 'getCurrentTexture', 'gpu:get-texture', restore)
  wrapProto(g.GPUQueue?.prototype, 'submit', 'gpu:submit', restore)
  wrapProto(g.GPUQueue?.prototype, 'writeBuffer', 'gpu:write-buffer', restore)
  wrapProto(g.GPUDevice?.prototype, 'createRenderPipeline', 'gpu:create-pipeline', restore)
  wrapProto(g.GPUDevice?.prototype, 'createComputePipeline', 'gpu:create-pipeline', restore)
  wrapProto(g.GPUDevice?.prototype, 'createShaderModule', 'gpu:create-shader', restore)
  wrapProto(g.GPUDevice?.prototype, 'createBindGroup', 'gpu:create-bindgroup', restore)
  wrapProto(g.GPUDevice?.prototype, 'createBuffer', 'gpu:create-buffer', restore)
  return () => {
    for (const undo of restore.reverse()) undo()
  }
}
