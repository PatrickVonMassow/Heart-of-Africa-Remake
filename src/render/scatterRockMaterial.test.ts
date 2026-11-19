import { describe, expect, it } from 'vitest'
import type { Node } from 'three/webgpu'
import { createScatterRockMaterial } from './scatterRockMaterial'

function countVertexColorReads(root: Node): number {
  // the tint graph reuses one node in several branches; count distinct reads
  const reads = new Set<Node>()
  root.traverse((node: Node & { isVertexColorNode?: boolean }) => {
    if (node.isVertexColorNode) reads.add(node)
  })
  return reads.size
}

describe('scatter rock material (point 1164)', () => {
  it('reads the baked vertex colour exactly once', () => {
    const m = createScatterRockMaterial()
    // the colour comes from the baked attribute, not a constant
    expect(countVertexColorReads(m.colorNode as Node)).toBe(1)
    // vertexColors=true would multiply the baked grey onto the colorNode again
    // and square it into the near-black ellipses of verification/687-bank-play-rocks.png
    expect(m.vertexColors).toBe(false)
  })
})
