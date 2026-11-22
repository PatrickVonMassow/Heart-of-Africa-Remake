import { describe, expect, it } from 'vitest'
import { checkedHopRead, hopOwnerLines } from './hop-owners.mjs'

const hop = (n, from, to, visit, textures = 2, setup = 'medium|-') => ({ from, to, visit, setup, delta: { textures, pipelines: 0 }, grew: 'no kind', detail: `place hop ${n} ${from} -> ${to}` })

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
    expect(hopOwnerLines([hop(1, 'a', 'b', 2), hop(2, 'b', 'c', 3)], sections, { visit: 3, signature: 'place:bemba-village|medium|-' }, 'kraal-cattle')).toHaveLength(2)
    expect(hopOwnerLines([hop(1, 'a', 'b', 2)], sections, null, 'town-plan')).toEqual([])
  })

  it('keeps a watch pending when the history holds the same visit only under another setup', () => {
    // visit 3 judged at low detail, then re-settling at medium: that watch is not judged yet
    const lines = hopOwnerLines([hop(1, 'a', 'b', 3, 2, 'low|-')], sections, { visit: 3, signature: 'place:bemba-village|medium|-' }, 'kraal-cattle')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/hop PENDING: place:bemba-village\|medium\|- still settling/)
  })
})

describe('place-hop report read', () => {
  it('passes an armed read with a history, an empty one included', () => {
    const read = { armed: true, hops: [], sections: [], pending: null }
    expect(checkedHopRead(read)).toBe(read)
  })

  it('fails loud on a failed browser read instead of reporting no hops', () => {
    expect(() => checkedHopRead({ error: 'Target page, context or browser has been closed' })).toThrow(/browser read failed \(Target page/)
    expect(() => checkedHopRead(undefined)).toThrow(/browser read failed/)
  })

  it('fails loud on a missing render watcher or a missing hop history', () => {
    expect(() => checkedHopRead({ armed: false })).toThrow(/no render-leak watcher/)
    expect(() => checkedHopRead({ armed: true, hops: null, sections: [], pending: null })).toThrow(/no place-hop history/)
  })
})
