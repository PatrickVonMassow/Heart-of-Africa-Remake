// DEV: attribute node-program builds to the long-frame detector
// (docs/perf-1523-findings.md). three.js builds a material's node program on
// the main thread the first time a render object with a new cache key is drawn;
// that build was the walking hitch's cost. Wrapping the node manager's
// `getForRender` times every call that adds a builder-cache entry and books it
// as 'shader-programs' work in the current frame window. Structural typing:
// three.js exposes neither member publicly. Imported dynamically in DEV only.

import { markFrameWork } from '../systems/longFrame'

interface NodeManagerLike {
  getForRender: (renderObject: unknown, useAsync?: boolean) => unknown
  nodeBuilderCache: Map<unknown, unknown>
}

/** Arm the watch on `renderer`; returns the restore function, or null when the
 *  renderer has no node manager of the expected shape. */
export function watchProgramBuilds(renderer: unknown): (() => void) | null {
  const nodes = (renderer as { _nodes?: NodeManagerLike })._nodes
  if (!nodes || typeof nodes.getForRender !== 'function' || !(nodes.nodeBuilderCache instanceof Map)) return null
  const original = nodes.getForRender
  const wrapped = function (this: NodeManagerLike, renderObject: unknown, useAsync?: boolean): unknown {
    const before = nodes.nodeBuilderCache.size
    const t0 = performance.now()
    const result = original.call(this, renderObject, useAsync)
    if (nodes.nodeBuilderCache.size !== before) markFrameWork('shader-programs', performance.now() - t0)
    return result
  }
  nodes.getForRender = wrapped
  return () => {
    if (nodes.getForRender === wrapped) nodes.getForRender = original
  }
}
