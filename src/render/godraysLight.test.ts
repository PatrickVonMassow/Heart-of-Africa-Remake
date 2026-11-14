// Live check: enrichments --section=godrays (pixels around the sun, pass on vs off vs level stepped down).
import { afterEach, describe, expect, it } from 'vitest'
import { DepthTexture, DirectionalLight, RenderTarget } from 'three/webgpu'
import { godraysShadowTexture, publishGodraysLight, readyGodraysLight } from './godraysLight'

function sunWithMap() {
  const light = new DirectionalLight()
  light.castShadow = true
  const map = new RenderTarget(4, 4)
  map.depthTexture = new DepthTexture(4, 4)
  light.shadow.map = map as typeof light.shadow.map
  return { light, map }
}

afterEach(() => publishGodraysLight(null))

describe('sun-shaft light channel', () => {
  it('is empty until a shadowed sun with a shadow map is published', () => {
    expect(readyGodraysLight()).toBeNull()
    const { light } = sunWithMap()
    light.castShadow = false
    publishGodraysLight(light)
    expect(readyGodraysLight()).toBeNull()
    light.castShadow = true
    expect(readyGodraysLight()).toBe(light)
    expect(godraysShadowTexture(light)).toBe(light.shadow.map!.depthTexture)
  })

  it('stays ready through a level change made before the shafts were ever enabled', () => {
    // The order local/godrays-cost.mjs hit: the level (and with it the shadow
    // resolution) changes BEFORE anything asked for the shafts. three's
    // ShadowNode resizes its map in place; the reference must survive it.
    const { light, map } = sunWithMap()
    publishGodraysLight(light)
    map.setSize(8, 8) // what ShadowNode.renderShadow does for a new mapSize
    expect(readyGodraysLight()).toBe(light)
    expect(godraysShadowTexture(light)).toBe(map.depthTexture)
  })

  it('the place scene never orphans the sun\'s shadow-map reference on a resolution change', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(`${process.cwd()}/src/scenes/place/PlaceScene.tsx`, 'utf8')
    expect(src).not.toMatch(/sunRef\.current!?\.shadow\.map\s*=\s*null/)
  })

  it('never returns a light without a shadow map', () => {
    const { light } = sunWithMap()
    light.shadow.map = null as unknown as typeof light.shadow.map
    publishGodraysLight(light)
    expect(readyGodraysLight()).toBeNull()
  })
})

describe('sun-shaft forward scatter', () => {
  it('is full toward the sun, falls off with the angle, and keeps the ambient share behind', async () => {
    const { shaftsPhase } = await import('./godraysLight')
    const { balance } = await import('../config/balance')
    const { forwardScatter: k, ambientShare: a } = balance.godrays
    expect(shaftsPhase(1, k, a)).toBeCloseTo(1)
    expect(shaftsPhase(Math.cos((10 * Math.PI) / 180), k, a)).toBeGreaterThan(0.6)
    // No veil: 30° off the sun (a frame edge) keeps almost nothing of the term.
    expect(shaftsPhase(Math.cos((30 * Math.PI) / 180), k, a)).toBeLessThan(0.05)
    expect(shaftsPhase(-1, k, a)).toBeCloseTo(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(0.05)
  })
})

describe('sun-shaft structure term', () => {
  it('adds nothing where the lit share is flat, and a signed deviation across shafts', async () => {
    const { shaftsStructure } = await import('./godraysLight')
    // Open frame: every ray fully lit — no veil, however much air light.
    expect(shaftsStructure(1, [1, 1, 1, 1], 0.4)).toBe(0)
    // A beam between two leaves: brighter than its neighbours.
    expect(shaftsStructure(1, [0.4, 0.5, 0.6, 0.5], 0.4)).toBeGreaterThan(0)
    // A wedge behind a leaf: darker.
    expect(shaftsStructure(0.3, [0.9, 1, 0.8, 1], 0.4)).toBeLessThan(0)
    // Uniformly shadowed air (a wall in shade) is flat too.
    expect(shaftsStructure(0.2, [0.2, 0.2, 0.2, 0.2], 0.4)).toBe(0)
  })
})
