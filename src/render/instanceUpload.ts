// Upload only the live part of an instance buffer (docs/perf-1543-driving-hitches.md,
// round 4: the real-GPU driving p95 is queue.writeBuffer time). A bare
// `needsUpdate` re-uploads the attribute's whole capacity; with an update range
// three (WebGPU attribute utils, InstanceNode's interleaved matrices) writes
// just the first `count` instances.

import type * as THREE from 'three/webgpu'

/** Mark the first `count` instances of `attr` for upload, and only those. */
export function markInstancesForUpload(attr: THREE.BufferAttribute, count: number): void {
  attr.clearUpdateRanges()
  if (count > 0) attr.addUpdateRange(0, count * attr.itemSize)
  attr.needsUpdate = true
}
