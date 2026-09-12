import { describe, expect, it } from 'vitest'
import { HalfFloatType, PerspectiveCamera, RGBAFormat, Scene } from 'three/webgpu'
import { effectiveBloom, effectiveSsao, effectiveTraa, useUi } from '../state/ui'
import { createScenePass } from './scenePass'

describe('scene MRT sampling policy', () => {
  it('allocates every half-float attachment without MSAA before post consumers request textures', () => {
    const scenePass = createScenePass(new Scene(), new PerspectiveCamera())
    try {
      const attachments = ['output', 'normal', 'velocity']
      expect(Object.keys(scenePass.getMRT()!.outputNodes).sort()).toEqual([...attachments].sort())
      expect(scenePass.renderTarget.textures.map((texture) => texture.name)).toEqual(attachments)
      for (const name of attachments) {
        const texture = scenePass.getTexture(name)
        expect(texture.format).toBe(RGBAFormat)
        expect(texture.type).toBe(HalfFloatType)
      }
      expect(scenePass.renderTarget.textures).toHaveLength(attachments.length)
      expect(scenePass.renderTarget.depthTexture).not.toBeNull()
      expect(scenePass.renderTarget.samples).toBe(0)

      // Exercise Three's real setup: an omitted samples option can appear
      // safe at construction, then inherit the renderer's four samples.
      scenePass.setup({
        renderer: { samples: 4, getOutputBufferType: () => HalfFloatType },
      } as unknown as Parameters<typeof scenePass.setup>[0])
      expect(scenePass.renderTarget.samples).toBe(0)
      for (const texture of scenePass.renderTarget.textures) {
        expect(texture.format).toBe(RGBAFormat)
        expect(texture.type).toBe(HalfFloatType)
      }
    } finally {
      scenePass.dispose()
    }
  })

  it('LOW drops MSAA without enabling temporal AA or another post effect', () => {
    const state = {
      ...useUi.getState(), detailLevel: 'low' as const, traaEnabled: true, ssaoEnabled: true,
    }
    expect(effectiveTraa(state)).toBe(false)
    expect(effectiveSsao(state)).toBe(false)
    expect(effectiveBloom(state)).toBe(false)
    const scenePass = createScenePass(new Scene(), new PerspectiveCamera())
    try {
      expect(scenePass.renderTarget.samples).toBe(0)
      expect(scenePass.getMRT()!.outputNodes).toHaveProperty('velocity')
      expect(scenePass.renderTarget.textures.map((texture) => texture.name)).toContain('velocity')
    } finally {
      scenePass.dispose()
    }
  })
})
