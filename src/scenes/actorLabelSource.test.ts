// The bridge the hold-Ctrl layer reads (design.md §17.8): registered sources
// and marked scene objects, both of which must report only what is drawn.
import { describe, it, expect } from 'vitest'
import {
  collectActors,
  markActor,
  markedActorRise,
  pushMarkedActors,
  registerActorSource,
  type LabelledActor,
  type MarkedNode,
} from './actorLabelSource'

/** A scene node at (x, y, z) with a uniform scale, as three would compose it. */
function node(
  x: number,
  y: number,
  z: number,
  extra: Partial<MarkedNode> & { scale?: number } = {},
): MarkedNode {
  const s = extra.scale ?? 1
  return {
    visible: extra.visible,
    userData: extra.userData,
    children: extra.children,
    matrixWorld: { elements: [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1] },
  }
}

describe('registered sources', () => {
  it('collects from every registered source and drops one that unregisters', () => {
    const offA = registerActorSource((out) => out.push({ kind: 'lion', x: 1, y: 0, z: 0 }))
    const offB = registerActorSource((out) => out.push({ kind: 'camp', x: 2, y: 0, z: 0 }))
    expect(collectActors().map((a) => a.kind).sort()).toEqual(['camp', 'lion'])
    offB()
    expect(collectActors().map((a) => a.kind)).toEqual(['lion'])
    offA()
    expect(collectActors()).toHaveLength(0)
  })

  it('reuses the array it is given rather than allocating per frame', () => {
    const off = registerActorSource((out) => out.push({ kind: 'zebra', x: 0, y: 0, z: 0 }))
    const scratch: LabelledActor[] = [{ kind: 'lion', x: 9, y: 9, z: 9 }]
    const result = collectActors(scratch)
    expect(result).toBe(scratch)
    expect(result.map((a) => a.kind)).toEqual(['zebra'])
    off()
  })
})

describe('marked scene objects', () => {
  it('reports a marked object at its world position, the label above it', () => {
    const out: LabelledActor[] = []
    pushMarkedActors(node(3, 1, -4, { userData: markActor({ kind: 'villager', height: 1.6 }) }), out)
    expect(out).toEqual([{ kind: 'villager', age: undefined, x: 3, y: 2.6, z: -4 }])
  })

  it('scales the label rise with the object\'s own world scale', () => {
    const out: LabelledActor[] = []
    pushMarkedActors(node(0, 0, 0, { scale: 0.5, userData: markActor({ kind: 'child', height: 1.6 }) }), out)
    expect(out[0].y).toBeCloseTo(0.8)
  })

  it('finds marks deep in the graph', () => {
    const goat = node(5, 0, 5, { userData: markActor({ kind: 'goat', height: 0.8 }) })
    const out: LabelledActor[] = []
    pushMarkedActors(node(0, 0, 0, { children: [node(0, 0, 0, { children: [goat] })] }), out)
    expect(out.map((a) => a.kind)).toEqual(['goat'])
  })

  it('an invisible object is not named, and takes its subtree with it', () => {
    const hidden = node(0, 0, 0, {
      visible: false,
      userData: markActor({ kind: 'canoe', height: 0.9 }),
      children: [node(1, 0, 0, { userData: markActor({ kind: 'goat', height: 0.8 }) })],
    })
    const out: LabelledActor[] = []
    pushMarkedActors(hidden, out)
    expect(out).toHaveLength(0)
  })

  it('carries the age a mark states', () => {
    const out: LabelledActor[] = []
    pushMarkedActors(node(0, 0, 0, { userData: markActor({ kind: 'elephant', age: 'young', height: 2 }) }), out)
    expect(out[0].age).toBe('young')
  })

  it('ignores an unmarked graph and a missing root', () => {
    const out: LabelledActor[] = []
    pushMarkedActors(node(0, 0, 0, { children: [node(1, 1, 1)] }), out)
    pushMarkedActors(null, out)
    expect(out).toHaveLength(0)
  })
})

/**
 * The rise the SPEECH label reads (work-order point 582): how high the figure
 * under an anchor reaches above that anchor's own origin, at the scale it is
 * drawn. One record, two readers — whatever floats over a head floats over the
 * same point whether the Ctrl layer or the speech channel put it there.
 */
describe('the marked figure’s rise above its anchor', () => {
  const villager = markActor({ kind: 'villager', height: 1.45 })

  it('reports a grown figure’s own height under an anchor at its feet', () => {
    const anchor = node(4, 0, -2, { children: [node(4, 0, -2, { userData: villager })] })
    expect(markedActorRise(anchor)).toBeCloseTo(1.45)
  })

  it('scales with the figure: a child drawn at 0.55 rises 0.55 as high', () => {
    const anchor = node(0, 0, 0, {
      children: [node(0, 0, 0, { scale: 0.55, userData: markActor({ kind: 'child', height: 1.45 }) })],
    })
    expect(markedActorRise(anchor)).toBeCloseTo(1.45 * 0.55)
  })

  it('is measured against the ANCHOR, so a figure lifted off it counts from there', () => {
    // The anchor bobs with the walk; the rise must not bob with it.
    const anchor = node(0, 1.2, 0, { children: [node(0, 1.2, 0, { userData: villager })] })
    expect(markedActorRise(anchor)).toBeCloseTo(1.45)
  })

  it('reads the mark on the anchor itself', () => {
    expect(markedActorRise(node(0, 0, 0, { scale: 0.5, userData: villager }))).toBeCloseTo(0.725)
  })

  it('finds the figure deep under the anchor', () => {
    const deep = node(0, 0, 0, {
      children: [node(0, 0, 0, { children: [node(0, 0, 0, { userData: villager })] })],
    })
    expect(markedActorRise(deep)).toBeCloseTo(1.45)
  })

  it('says nothing for an anchor that carries no figure at all', () => {
    expect(markedActorRise(node(0, 0, 0))).toBeNull()
    expect(markedActorRise(null)).toBeNull()
    expect(markedActorRise(undefined)).toBeNull()
    expect(markedActorRise({ userData: { actor: villager.actor } })).toBeNull()
  })

  it('ignores a figure that is not being drawn', () => {
    const anchor = node(0, 0, 0, {
      children: [node(0, 0, 0, { visible: false, userData: villager })],
    })
    expect(markedActorRise(anchor)).toBeNull()
  })
})
