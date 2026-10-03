// The bridge the hold-Ctrl layer reads (design.md §17.8): registered sources
// and marked scene objects, both of which must report only what is drawn.
import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  collectActors,
  drawnHeadShape,
  drawnHeadRise,
  drawnHeadTop,
  markActor,
  markedActorRise,
  pushMarkedActors,
  registerActorSource,
  silhouetteTop,
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

/**
 * THE TOP OF THE HEAD AS THE CAMERA DRAWS IT (point 1276): the tail tip ends
 * over the head's silhouette, not over its world crown, which projects below
 * the outline when seen from above or close by.
 */
describe('silhouetteTop', () => {
  const H = 900
  type V = [number, number, number]
  /** A real three camera at `eye` looking at `look`, 900 px tall; `up` rolls it. */
  function cameraAt(eye: V, look: V, up: V = [0, 1, 0]) {
    const cam = new THREE.PerspectiveCamera(60, 1440 / H, 0.1, 500)
    cam.up.set(...up)
    cam.position.set(...eye)
    cam.lookAt(...look)
    cam.updateMatrixWorld(true)
    return cam
  }
  const ball = (r: number): [V, V, V] => [[r, 0, 0], [0, r, 0], [0, 0, r]]
  const screenY = (cam: THREE.PerspectiveCamera, p: { x: number; y: number; z: number }) =>
    ((1 - new THREE.Vector3(p.x, p.y, p.z).project(cam).y) / 2) * H
  /** The silhouette's top edge on screen by brute force: the smallest screen y
   *  over a dense sampling of the unit sphere mapped through the semi-axes —
   *  independent of the closed form. */
  function sampledTopY(cam: THREE.PerspectiveCamera, c: V, axes: [V, V, V]) {
    return sampledTop(cam, c, axes).y
  }
  /** The same sampling's topmost screen point, x and y in px (1440 × 900). */
  function sampledTop(cam: THREE.PerspectiveCamera, c: V, axes: [V, V, V]) {
    let best = Infinity
    let bestX = 0
    const n = 360
    const v = new THREE.Vector3()
    for (let i = 0; i <= n; i++) {
      const th = (Math.PI * i) / n
      for (let j = 0; j < 2 * n; j++) {
        const ph = (Math.PI * j) / n
        const u = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]
        v.set(
          ...([0, 1, 2].map((k) => c[k] + axes[0][k] * u[0] + axes[1][k] * u[1] + axes[2][k] * u[2]) as V),
        )
        v.project(cam)
        const y = ((1 - v.y) / 2) * H
        if (y < best) {
          best = y
          bestX = ((v.x + 1) / 2) * 1440
        }
      }
    }
    return { x: bestX, y: best }
  }
  const screenX = (cam: THREE.PerspectiveCamera, p: { x: number; y: number; z: number }) =>
    ((new THREE.Vector3(p.x, p.y, p.z).project(cam).x + 1) / 2) * 1440
  // A grown head (r 0.16, centre 1.18) and a child's (0.55 of it), seen from
  // the traveller's eye at 1.6 m — level, looking down from a metre, at 20 m,
  // off to the side, pitched, rolled, and a squashed head seen from above.
  const cases: Array<{ name: string; c: V; axes: [V, V, V]; eye: V; look: V; up?: V }> = [
    { name: 'grown, 4 m, level look', c: [0, 1.18, 0], axes: ball(0.16), eye: [0, 1.6, 4], look: [0, 1.6, 0] },
    { name: 'child, 1 m, looking down at it', c: [0, 0.65, 0], axes: ball(0.088), eye: [0, 1.6, 1], look: [0, 0.65, 0] },
    { name: 'grown, 20 m, off to the side', c: [3, 1.18, -2], axes: ball(0.16), eye: [-4, 1.6, 17], look: [0, 1.4, 0] },
    { name: 'grown, 1.5 m, pitched up past it', c: [0.4, 1.18, 0], axes: ball(0.16), eye: [0, 1.6, 1.5], look: [0, 2.5, -3] },
    { name: 'grown, 3 m, camera rolled 20°', c: [0.3, 1.18, 0], axes: ball(0.16), eye: [0, 1.6, 3], look: [0, 1.3, 0], up: [Math.sin(0.35), Math.cos(0.35), 0] },
    // The review's counterexample: a body squashed to 0.7 in height, no
    // counter-scale, seen from a metre above — a ball of the vertical extent
    // missed the outline by 9.4 px here.
    { name: 'squashed head, 1 m, from above', c: [0, 0.826, 0], axes: [[0.16, 0, 0], [0, 0.112, 0], [0, 0, 0.16]], eye: [0, 1.6, 1], look: [0, 0.826, 0] },
    // Tilted and non-uniform: every axis off the world grid.
    { name: 'tilted non-uniform head, 2 m', c: [0.2, 1.1, -0.1], axes: [[0.277, 0.08, 0], [-0.04, 0.069, 0.03], [0, -0.05, 0.15]], eye: [0.5, 1.6, 2], look: [0, 1.0, 0] },
  ]
  for (const k of cases) {
    it(`meets the projected outline's top edge: ${k.name}`, () => {
      const cam = cameraAt(k.eye, k.look, k.up)
      const out = { x: 0, y: 0, z: 0 }
      expect(silhouetteTop(k.c, k.axes, cam.matrixWorld.elements, out)).toBe(true)
      const want = sampledTop(cam, k.c, k.axes)
      expect(screenY(cam, out)).toBeCloseTo(want.y, 1)
      // Sideways too: the topmost point is flat along the outline, so the
      // sampled x is looser than its y, but a displacement shows at once.
      expect(Math.abs(screenX(cam, out) - want.x)).toBeLessThan(1.5)
    })
  }

  it('is not the world crown when the head is seen from above: the crown sinks into the outline', () => {
    // An implementation that returned the crown passes every level view; here
    // it is several pixels inside the outline — and silhouetteTop is not.
    const k = cases[1]
    const cam = cameraAt(k.eye, k.look)
    const crown = { x: k.c[0], y: k.c[1] + 0.088, z: k.c[2] }
    const top = sampledTopY(cam, k.c, k.axes)
    expect(screenY(cam, crown) - top).toBeGreaterThan(5)
    const out = { x: 0, y: 0, z: 0 }
    silhouetteTop(k.c, k.axes, cam.matrixWorld.elements, out)
    expect(Math.abs(screenY(cam, out) - top)).toBeLessThan(0.1)
  })

  it('stands on the outline sideways too: over the head under a rolled camera', () => {
    // A rolled camera's "up" is not the world's: the top of the outline moves
    // sideways on screen, and the tip with it.
    const k = cases[4]
    const cam = cameraAt(k.eye, k.look, k.up)
    const out = { x: 0, y: 0, z: 0 }
    silhouetteTop(k.c, k.axes, cam.matrixWorld.elements, out)
    const p = new THREE.Vector3(out.x, out.y, out.z).project(cam)
    // The sampled point of smallest screen y, its x.
    let bestY = Infinity
    let bestX = 0
    const v = new THREE.Vector3()
    for (let i = 0; i <= 360; i++) {
      for (let j = 0; j < 720; j++) {
        const th = (Math.PI * i) / 360
        const ph = (Math.PI * j) / 360
        v.set(k.c[0] + 0.16 * Math.sin(th) * Math.cos(ph), k.c[1] + 0.16 * Math.cos(th), k.c[2] + 0.16 * Math.sin(th) * Math.sin(ph)).project(cam)
        if (v.y > -bestY) {
          bestY = -v.y
          bestX = v.x
        }
      }
    }
    expect(Math.abs(p.x - bestX) * 720).toBeLessThan(1)
  })

  it('declines an ellipsoid the camera is inside or behind, writing nothing', () => {
    const cam = cameraAt([0, 1.6, 4], [0, 1.6, 0])
    const out = { x: 7, y: 7, z: 7 }
    expect(silhouetteTop([0, 1.6, 4.05], ball(0.16), cam.matrixWorld.elements, out)).toBe(false)
    expect(silhouetteTop([0, 1.6, 8], ball(0.16), cam.matrixWorld.elements, out)).toBe(false)
    expect(out).toEqual({ x: 7, y: 7, z: 7 })
    // And in front it does write: the top of a ball straight ahead, level.
    expect(silhouetteTop([0, 1.6, 0], ball(0.16), cam.matrixWorld.elements, out)).toBe(true)
    expect(out.x).toBeCloseTo(0, 6)
    expect(out.y).toBeGreaterThan(1.6 + 0.159)
    expect(Math.hypot(out.x, out.y - 1.6, out.z)).toBeCloseTo(0.16, 6)
  })
})

describe('drawnHeadShape', () => {
  it('is the visible head’s world centre and its matrix columns times the radius', () => {
    // Rotated and non-uniformly scaled, so a row/column mix-up shows.
    const c = Math.cos(Math.PI / 6)
    const sn = Math.sin(Math.PI / 6)
    const e = [c * 2, sn * 2, 0, 0, -sn * 0.5, c * 0.5, 0, 0, 0, 0, 1, 0, 2, 0.65, -1, 1]
    const anchor: HeadNode = {
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, -1, 1] },
      children: [{ name: 'figure-head', matrixWorld: { elements: e }, geometry: { parameters: { radius: 0.1 } } }],
    }
    const shape = drawnHeadShape(anchor)!
    expect(shape.center).toEqual([2, 0.65, -1])
    const round = (v: number[]) => v.map((x) => +x.toFixed(6))
    expect(shape.axes.map(round)).toEqual([round([c * 0.2, sn * 0.2, 0]), round([-sn * 0.05, c * 0.05, 0]), [0, 0, 0.1]])
  })

  it('is null under a hidden group, as the renderer draws nothing there', () => {
    const anchor: HeadNode = {
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      children: [
        {
          visible: false,
          children: [{ name: 'figure-head', matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1] } }],
        },
      ],
    }
    expect(drawnHeadShape(anchor)).toBeNull()
    // The same head, its group shown: found.
    ;(anchor.children![0] as { visible: boolean }).visible = true
    expect(drawnHeadShape(anchor)).not.toBeNull()
  })
})
