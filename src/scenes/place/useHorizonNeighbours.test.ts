import { describe, expect, it, vi } from 'vitest'

const built: string[] = []
vi.mock('./layout', () => ({
  buildLayout: (id: string) => {
    built.push(id)
    return { dwellings: [] }
  },
}))

const { dwellingsFor } = await import('./useHorizonNeighbours')

describe('horizon neighbour dwelling cache', () => {
  it('builds a layout once per place and seed, and holds only the current balance version', () => {
    dwellingsFor(1, 0)('cairo')
    dwellingsFor(1, 0)('cairo')
    expect(built).toEqual(['cairo'])
    // A balance edit rebuilds, and the old version is gone: switching back
    // rebuilds again instead of finding a retained entry.
    dwellingsFor(1, 1)('cairo')
    dwellingsFor(1, 0)('cairo')
    expect(built).toEqual(['cairo', 'cairo', 'cairo'])
  })

  it('holds only the current world seed', () => {
    built.length = 0
    dwellingsFor(2, 0)('cairo')
    dwellingsFor(3, 0)('cairo')
    dwellingsFor(2, 0)('cairo')
    expect(built).toEqual(['cairo', 'cairo', 'cairo'])
  })
})
