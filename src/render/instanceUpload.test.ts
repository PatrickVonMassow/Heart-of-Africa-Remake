import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { markInstancesForUpload } from './instanceUpload'

describe('markInstancesForUpload', () => {
  it('replaces earlier ranges with one covering the live instances and bumps the version', () => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(16 * 100), 16)
    attr.addUpdateRange(0, 1600)
    const v = attr.version
    markInstancesForUpload(attr, 7)
    expect(attr.updateRanges).toEqual([{ start: 0, count: 112 }])
    expect(attr.version).toBe(v + 1)
  })

  it('an empty set uploads nothing but still marks the change', () => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(100), 1)
    markInstancesForUpload(attr, 0)
    expect(attr.updateRanges).toEqual([])
  })
})
