import { Matrix4, NodeFrame, NodeUpdateType, Vector2, type RenderPipeline, type WebGPURenderer } from 'three/webgpu'
import { velocity } from 'three/tsl'
import type TRAANode from 'three/addons/tsl/display/TRAANode.js'
import type { createScenePass } from './scenePass'

// r185 exposes these at runtime but omits them from its TRAANode declarations.
// Bind its jitter to the scene's projection storage, whose lifetime is longer
// than any one temporal resolve. Velocity uniforms retain this matrix by reference.
type TemporalPass = TRAANode & {
  _velocityNode: typeof velocity
  _originalProjectionMatrix: Matrix4
  setViewOffset(width: number, height: number): void
  clearViewOffset(): void
}

/** Render the scene at top-level depth, independently of the post graph.
 * Three keys render contexts by nested render-call depth as well as MRT layout.
 * Lazy consumption inside TRAA's beauty RTT otherwise moves BOTH scene and
 * shadow draws to new contexts when temporal resolve is removed.
 */
export function createSceneFrame(scenePass: ReturnType<typeof createScenePass>, renderer: WebGPURenderer) {
  const projection = new Matrix4()
  const size = new Vector2()
  const frame = new NodeFrame()
  frame.renderer = renderer
  // Texture nodes still perform PassNode.setup, but must never draw the scene
  // again from inside an RTT/AO/bloom update. This owner draws it once per frame.
  scenePass.updateBeforeType = NodeUpdateType.NONE

  return {
    bindTemporal(node: TRAANode) {
      const temporal = node as TemporalPass
      temporal._velocityNode = velocity
      temporal._originalProjectionMatrix = projection
      return temporal
    },
    render(processing: RenderPipeline, temporal: TemporalPass | null) {
      // The first scene draw precedes the post graph's initial build/setup.
      // Apply the pass's backend-dependent attachment policy before that draw.
      scenePass.setup({ renderer } as unknown as Parameters<typeof scenePass.setup>[0])
      projection.copy(scenePass.camera.projectionMatrix)
      velocity.setProjectionMatrix(projection)
      try {
        if (temporal) {
          renderer.getDrawingBufferSize(size)
          temporal.setViewOffset(size.width, size.height)
        }
        scenePass.updateBefore(frame)
        processing.render()
      } finally {
        if (temporal) temporal.clearViewOffset()
        velocity.setProjectionMatrix(null)
      }
    },
  }
}
