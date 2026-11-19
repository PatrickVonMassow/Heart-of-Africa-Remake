import { describe, expect, it } from 'vitest'
import { createScatterRockMaterial } from './scatterRockMaterial'

describe('scatter rock material (point 1164)', () => {
  it('reads the vertex colour once: colorNode set, vertexColors off', () => {
    const m = createScatterRockMaterial()
    expect(m.colorNode).toBeTruthy()
    // vertexColors=true would multiply the baked grey onto the colorNode again
    // and square it into the near-black ellipses of verification/687-bank-play-rocks.png
    expect(m.vertexColors).toBe(false)
  })
})
