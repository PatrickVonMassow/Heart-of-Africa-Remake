import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { shownInScene } from './placeDumpRead'

describe('shownInScene', () => {
  it('rejects a visible mesh under a hidden group (the stowed paddle, work-order 1448)', () => {
    const scene = new THREE.Scene()
    const paddle = new THREE.Group()
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.025))
    paddle.add(blade)
    scene.add(paddle)
    expect(shownInScene(blade)).toBe(true)
    paddle.visible = false
    expect(blade.visible).toBe(true)
    expect(shownInScene(blade)).toBe(false)
  })
})
