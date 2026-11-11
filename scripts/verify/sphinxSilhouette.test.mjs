import { describe, expect, it } from 'vitest'
import { HEAD_MIN_ROWS, judgeSkylineHead, judgeTravelSphinx } from './sphinxSilhouette.mjs'

describe('face-on skyline head judgement', () => {
  it('passes a flat-topped trapezoid widening to the shoulders', () => {
    // 27 rows, crown 13 px, widening to 29 px.
    const widths = Array.from({ length: 27 }, (_, i) => Math.round(13 + (16 * i) / 26))
    const j = judgeSkylineHead(widths)
    expect(j).toMatchObject({ enough: true, flat: true, widens: true, occupied: 27 })
  })

  it('fails one occupied row followed by empty rows — empty rows are neither height nor width', () => {
    const j = judgeSkylineHead([12, ...Array(14).fill(0)])
    expect(j.enough).toBe(false)
    expect(j.flat).toBe(false)
    expect(j.widens).toBe(false)
  })

  it('fails a head with too few occupied rows, or gaps over a fifth of its span', () => {
    expect(judgeSkylineHead(Array(HEAD_MIN_ROWS - 1).fill(10)).enough).toBe(false)
    const gappy = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 0 : 10 + i))
    expect(judgeSkylineHead(gappy).enough).toBe(false)
  })

  it('fails a round-topped thumb (narrow crown) and a straight column (no widening)', () => {
    const thumb = Array.from({ length: 24 }, (_, i) => Math.round(20 * Math.sqrt(Math.min(1, (i + 1) / 8))))
    expect(judgeSkylineHead(thumb).flat).toBe(false)
    expect(judgeSkylineHead(Array(24).fill(15)).widens).toBe(false)
  })
})

describe("bird's-eye Sphinx judgement", () => {
  const ground = [200, 170, 90]
  const many = (drawn, n = 300) => Array.from({ length: n }, () => ({ drawn, hidden: ground }))

  it('passes dark stone over the yellow ground', () => {
    const t = judgeTravelSphinx(many([120, 90, 50]))
    expect(t).toMatchObject({ visible: true, noPale: true })
  })

  it('fails an invisible Sphinx: mask pixels whose drawn frame equals the ground behind', () => {
    const t = judgeTravelSphinx(many(ground))
    expect(t.visible).toBe(false)
    expect(t.noPale).toBe(false)
  })

  it('fails a pale cream patch: lighter and greyer than the ground', () => {
    const t = judgeTravelSphinx(many([235, 225, 200]))
    expect(t.visible).toBe(true)
    expect(t.noPale).toBe(false)
  })

  it('fails too few pixels to judge', () => {
    expect(judgeTravelSphinx(many([120, 90, 50], 100)).visible).toBe(false)
  })
})
