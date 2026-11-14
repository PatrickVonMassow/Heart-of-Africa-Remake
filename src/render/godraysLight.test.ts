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

  it('restores the shadow map the place scene nulled on a resolution change', () => {
    const { light, map } = sunWithMap()
    publishGodraysLight(light)
    expect(readyGodraysLight()).toBe(light)
    light.shadow.map = null as unknown as typeof light.shadow.map
    expect(readyGodraysLight()).toBe(light)
    expect(light.shadow.map).toBe(map)
  })

  it('never returns a light whose map was never seen', () => {
    const { light } = sunWithMap()
    light.shadow.map = null as unknown as typeof light.shadow.map
    publishGodraysLight(light)
    expect(readyGodraysLight()).toBeNull()
  })
})
