import { describe, expect, it } from 'vitest'
import { countChangedPixels, judgeCarriedJar, MIN_JAR_PIXELS } from './carriedJar.mjs'

const probe = (over = {}) => ({
  found: true,
  shown: true,
  hiddenBy: [],
  inScene: true,
  meshes: 3,
  rect: { x: 10, y: 10, width: 40, height: 60 },
  ...over,
})

describe('countChangedPixels', () => {
  it('counts only pixels whose summed RGB difference reaches the threshold', () => {
    const a = new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 10, 10, 10, 255])
    const b = new Uint8Array([0, 0, 0, 255, 140, 100, 100, 255, 15, 15, 15, 255])
    expect(countChangedPixels(a, b, 4, 36)).toBe(1)
  })
  it('refuses buffers of different sizes', () => {
    expect(() => countChangedPixels(new Uint8Array(4), new Uint8Array(8), 4)).toThrow()
  })
})

describe('judgeCarriedJar', () => {
  it('passes a shown, projected jar whose hiding changes enough pixels', () => {
    expect(judgeCarriedJar(probe(), MIN_JAR_PIXELS).ok).toBe(true)
  })
  it('fails a jar flagged visible that changes no pixel — the reported defect', () => {
    const v = judgeCarriedJar(probe(), 0)
    expect(v.ok).toBe(false)
    expect(v.why).toMatch(/0 px/)
  })
  it('names the hidden ancestor, the detached chain, the missing projection', () => {
    expect(judgeCarriedJar(probe({ shown: false, hiddenBy: ['carried-jar-empty'] }), 999).why).toMatch(/carried-jar-empty/)
    expect(judgeCarriedJar(probe({ inScene: false }), 999).ok).toBe(false)
    expect(judgeCarriedJar(probe({ rect: null }), 999).why).toMatch(/outside the frame/)
    expect(judgeCarriedJar({ found: false, why: 'no jar' }, 999).why).toBe('no jar')
  })
})
