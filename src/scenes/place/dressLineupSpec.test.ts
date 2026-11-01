import { describe, expect, it } from 'vitest'
import { crossedPhase, midSwing, parseGarment, resolveOutfit } from './dressLineupSpec'

describe('dress lineup outfit override', () => {
  it('parses form-wear names', () => {
    expect(parseGarment('neckBeads-chest')).toEqual({ form: 'neckBeads', wear: 'chest' })
    expect(parseGarment({ form: 'trousers', wear: 'waist' })).toEqual({ form: 'trousers', wear: 'waist' })
    expect(() => parseGarment('trousers')).toThrow()
  })

  it('resolves every garment in slot order with the record’s cloth', () => {
    const layers = resolveOutfit(['waistBeads-waist', 'trousers-waist', 'robe-chest'], null, '#123456')
    expect(layers.map((l) => `${l.slot}:${l.form}-${l.wear}`)).toEqual(['hip:trousers-waist', 'torso:robe-chest', 'ornament:waistBeads-waist'])
    for (const l of layers) expect(l.colour).not.toBe('cloth')
  })

  it('takes the settlement people’s own garment first', () => {
    const own = resolveOutfit(['breastCloth-chest'], 'zulu', '#fff')[0]
    const other = resolveOutfit(['breastCloth-chest'], null, '#fff')[0]
    expect(own.form).toBe('breastCloth')
    expect(own.source).toBeDefined()
    expect(other.form).toBe('breastCloth')
  })

  it('resolves the chest collar and the neck beads as two garments', () => {
    const [a, b] = resolveOutfit(['neckBeads-chest', 'neckBeads-neck'], null, '#fff')
    expect([a.wear, b.wear].sort()).toEqual(['chest', 'neck'])
  })

  it('rejects a pair nobody wears', () => {
    expect(() => resolveOutfit(['trousers-face'], null, '#fff')).toThrow(/no garment/)
  })

  it('finds the leg crossing in the middle of the swing', () => {
    expect(midSwing([0, 0.6])).toBeCloseTo(0.8)
    expect(midSwing([0.5, 1.1])).toBeCloseTo(0.3)
  })

  it('detects a phase crossing across the loop seam', () => {
    expect(crossedPhase(0.9, 0.05, 0.02)).toBe(true)
    expect(crossedPhase(0.1, 0.2, 0.15)).toBe(true)
    expect(crossedPhase(0.1, 0.2, 0.25)).toBe(false)
    expect(crossedPhase(0.2, 0.2, 0.2)).toBe(false)
  })
})
