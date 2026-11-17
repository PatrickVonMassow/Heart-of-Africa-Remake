import { describe, expect, it } from 'vitest'
import { assembleCamel, buildCamelParts, camelHeight, CAMEL_LEGS } from './camelModel'
import { QUALITY_PRESETS } from '../../config/quality'

// The Giza camel's label height (PlaceScene GizaAmbient's markActor).
const LABEL_HEIGHT = 2.4

describe('camel model builder', () => {
  const build = buildCamelParts(QUALITY_PRESETS.medium.figureBodySegments)
  const names = build.parts.map((p) => p.name)

  it('emits the named parts of a dromedary', () => {
    for (const name of ['body', 'hump', 'neck', 'head', 'muzzle', 'ear-left', 'ear-right', 'tail']) expect(names).toContain(name)
    expect(CAMEL_LEGS).toHaveLength(4)
    for (const leg of CAMEL_LEGS) for (const seg of ['upper', 'lower', 'pad']) expect(names).toContain(`leg-${leg}-${seg}`)
    expect(new Set(names).size).toBe(names.length)
  })

  it('has exactly one hump, rising above the back', () => {
    const humps = build.parts.filter((p) => p.name.includes('hump'))
    expect(humps).toHaveLength(1)
    const box = (n: string) => {
      const g = build.parts.find((p) => p.name === n)!.geometry
      g.computeBoundingBox()
      return g.boundingBox!
    }
    expect(box('hump').max.y).toBeGreaterThan(box('body').max.y + 0.2)
    // It grows out of the back: its foot is inside the barrel.
    expect(box('hump').min.y).toBeLessThan(box('body').max.y)
  })

  it('stands on its pads at a plausible height under the label', () => {
    const top = camelHeight(build)
    expect(top).toBeLessThanOrEqual(LABEL_HEIGHT)
    expect(top).toBeGreaterThanOrEqual(2.0)
    expect(top).toBeLessThanOrEqual(2.3)
    let bottom = Infinity
    for (const p of build.parts) {
      p.geometry.computeBoundingBox()
      bottom = Math.min(bottom, p.geometry.boundingBox!.min.y)
    }
    expect(bottom).toBeCloseTo(0, 3)
  })

  it('puts the head forward of the body (faces +z) and the tail behind', () => {
    const z = (n: string) => {
      const g = build.parts.find((p) => p.name === n)!.geometry
      g.computeBoundingBox()
      return g.boundingBox!
    }
    expect(z('muzzle').max.z).toBeGreaterThan(z('body').max.z)
    expect(z('tail').min.z).toBeLessThan(z('body').min.z + 0.05)
  })

  it('jointed legs: the lower segment meets the upper at the knee', () => {
    for (const leg of CAMEL_LEGS) {
      const up = build.parts.find((p) => p.name === `leg-${leg}-upper`)!.geometry
      const lo = build.parts.find((p) => p.name === `leg-${leg}-lower`)!.geometry
      up.computeBoundingBox()
      lo.computeBoundingBox()
      expect(lo.boundingBox!.max.y).toBeGreaterThan(up.boundingBox!.min.y)
      expect(lo.boundingBox!.max.y).toBeLessThan(1.0)
    }
  })

  it('assembles one geometry per pivot, with the same vertex count as the parts', () => {
    const fresh = buildCamelParts(QUALITY_PRESETS.high.figureBodySegments)
    const total = fresh.parts.reduce((s, p) => s + p.geometry.attributes.position.count, 0)
    const merged = assembleCamel(fresh)
    const sum = Object.values(merged).reduce((s, g) => s + g.attributes.position.count, 0)
    expect(sum).toBe(total)
    for (const g of Object.values(merged)) expect(g.attributes.color).toBeDefined()
  })

  it('finer at a higher detail level', () => {
    const verts = (r: number) => buildCamelParts(r).parts.reduce((s, p) => s + p.geometry.attributes.position.count, 0)
    expect(verts(QUALITY_PRESETS.high.figureBodySegments)).toBeGreaterThan(verts(QUALITY_PRESETS.medium.figureBodySegments))
  })
})
