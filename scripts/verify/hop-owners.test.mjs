import { describe, expect, it } from 'vitest'
import { hopOwnerLines } from './hop-owners.mjs'

const hop = (n, from, to, visit, textures = 2) => ({ from, to, visit, delta: { textures, pipelines: 0 }, grew: 'no kind', detail: `place hop ${n} ${from} -> ${to}` })

describe('place-hop owner report', () => {
  const sections = [[1, 'town-plan'], [2, 'kraal-cattle'], [3, 'kraal-cattle']]

  it('names each hop by the section of the visit it started in', () => {
    expect(hopOwnerLines([hop(1, 'a', 'b', 2)], sections, null)).toEqual(['[kraal-cattle] hop 1 a -> b: textures 2, pipelines 0; grew: no kind'])
  })

  it('reports a last hop still settling as pending instead of omitting it', () => {
    const lines = hopOwnerLines([hop(1, 'a', 'b', 2)], sections, { visit: 3, signature: 'place:bemba-village|medium' }, 'kraal-cattle')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^\[kraal-cattle\] hop PENDING: place:bemba-village\|medium still settling/)
  })

  it('drops the pending line once that visit has its verdict, and filters by section', () => {
    expect(hopOwnerLines([hop(1, 'a', 'b', 2), hop(2, 'b', 'c', 3)], sections, { visit: 3, signature: 's' }, 'kraal-cattle')).toHaveLength(2)
    expect(hopOwnerLines([hop(1, 'a', 'b', 2)], sections, null, 'town-plan')).toEqual([])
  })
})
