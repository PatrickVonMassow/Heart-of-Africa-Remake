// The bridge the hold-Ctrl layer reads (design.md §17.8): registered sources
// and marked scene objects, both of which must report only what is drawn.
import { describe, it, expect } from 'vitest'
import {
  collectActors,
  drawnHeadRise,
  drawnHeadTop,
  markActor,
  markedActorRise,
  pushMarkedActors,
  registerActorSource,
  type LabelledActor,
  type HeadNode,
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
    // A kneeling figure is squashed in height only; its rise follows that.
    const kneeling = node(0, 0, 0, { userData: villager })
    kneeling.matrixWorld = { elements: [1, 0, 0, 0, 0, 0.75, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
    expect(markedActorRise(kneeling)).toBeCloseTo(1.45 * 0.75)
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

/**
 * WHERE THE SPEECH TAIL ENDS (work-order point 1276): at the top of the DRAWN
 * head sphere, not at the actor record 0.11 m over it.
 */
describe('drawnHeadRise', () => {
  /** A head sphere of radius `r` whose world matrix is `elements`. */
  const head = (elements: number[], r = 0.16, extra: Partial<HeadNode> = {}): HeadNode => ({
    name: 'figure-head',
    matrixWorld: { elements },
    geometry: { parameters: { radius: r } },
    ...extra,
  })
  const at = (y: number, s = 1) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, y, 0, 1]

  it('is the head centre plus its radius, measured from the anchor', () => {
    // A grown figure: head centre at bodyH + 0.18 = 1.18, radius 0.16.
    const anchor: HeadNode = { matrixWorld: { elements: at(0.5) }, children: [{ children: [head(at(1.68))] }] }
    expect(drawnHeadRise(anchor)).toBeCloseTo(1.34)
  })

  it('takes the world scale: a child at 0.55 has a 0.55 head', () => {
    const anchor: HeadNode = { matrixWorld: { elements: at(0) }, children: [head(at(1.18 * 0.55, 0.55))] }
    expect(drawnHeadRise(anchor)).toBeCloseTo(1.34 * 0.55)
  })

  it('reads the y row, so a head kept round through a squash stays round', () => {
    // Squashed figure, counter-scaled head: world y row length 1.
    const anchor: HeadNode = { matrixWorld: { elements: at(0) }, children: [head(at(0.9))] }
    expect(drawnHeadRise(anchor)).toBeCloseTo(1.06)
  })

  /** The highest point of the unit sphere of radius `r` under the column-major
   *  matrix `e`, found by brute force over the sphere's surface — independent
   *  of the closed form drawnHeadTop uses. */
  function sampledTop(e: number[], r: number): [number, number, number] {
    let best: [number, number, number] = [0, -Infinity, 0]
    const n = 720
    for (let i = 0; i <= n; i++) {
      const theta = (Math.PI * i) / n
      for (let j = 0; j < 2 * n; j++) {
        const phi = (Math.PI * j) / n
        const u = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]
        const p: [number, number, number] = [0, 1, 2].map(
          (k) => e[12 + k] + r * (e[k] * u[0] + e[4 + k] * u[1] + e[8 + k] * u[2]),
        ) as [number, number, number]
        if (p[1] > best[1]) best = p
      }
    }
    return best
  }

  it('reads the WORLD y row under a rotated, non-uniformly scaled head', () => {
    // Rz(30°)·diag(2, 0.5, 1): world y row (1, 0.433, 0), length 1.0897 —
    // neither elements[5] (0.433) nor the y column's length (0.5).
    const c = Math.cos(Math.PI / 6)
    const sn = Math.sin(Math.PI / 6)
    const e = [c * 2, sn * 2, 0, 0, -sn * 0.5, c * 0.5, 0, 0, 0, 0, 1, 0, 0.2, 1.1, -0.1, 1]
    expect(Math.abs(e[5] - Math.hypot(e[1], e[5], e[9]))).toBeGreaterThan(0.5)
    expect(Math.abs(Math.hypot(e[4], e[5], e[6]) - Math.hypot(e[1], e[5], e[9]))).toBeGreaterThan(0.5)
    const anchor: HeadNode = { matrixWorld: { elements: at(0) }, children: [head(e)] }
    const want = sampledTop(e, 0.16)
    expect(want[1]).toBeCloseTo(1.1 + 0.16 * Math.sqrt(1 + 0.1875), 4)
    const got = drawnHeadTop(anchor)!
    expect(got[1]).toBeCloseTo(want[1], 4)
    // The top of the tilted ellipsoid is off the centre sideways too.
    expect(got[0]).toBeCloseTo(want[0], 2)
    expect(got[2]).toBeCloseTo(want[2], 2)
    expect(drawnHeadRise(anchor)).toBeCloseTo(want[1], 4)
  })

  it('keeps a displaced head’s full position, not only its rise', () => {
    // A figure at (3, 0.5, 4) whose head leans 0.12 m to +x and 0.08 m to -z.
    const root = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0.5, 4, 1]
    const h = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.12, 1.68, 3.92, 1]
    const anchor: HeadNode = { matrixWorld: { elements: root }, children: [head(h)] }
    const top = drawnHeadTop(anchor)!
    expect(top[0]).toBeCloseTo(0.12)
    expect(top[1]).toBeCloseTo(1.34)
    expect(top[2]).toBeCloseTo(-0.08)
  })

  it('is null without a visible head, so the record takes over', () => {
    expect(drawnHeadRise({ matrixWorld: { elements: at(0) }, children: [] })).toBeNull()
    expect(drawnHeadRise({ matrixWorld: { elements: at(0) }, children: [head(at(1), 0.16, { visible: false })] })).toBeNull()
    expect(drawnHeadRise(null)).toBeNull()
  })
})
