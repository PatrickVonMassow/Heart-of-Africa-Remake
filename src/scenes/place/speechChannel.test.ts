// The channel between a speaking figure and its overhead label (design.md
// §13.4, work-order point 485): the label rides on the SPEAKER's object, it is
// gone when its time is up, and it goes with the figure when that leaves the
// scene. The lifetime rules themselves are pinned in
// src/communication/speechLabel.test.ts.
import { SHIPPED_VOCABULARY } from '../../communication/vocabulary'
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three/webgpu'
import type { Object3D } from 'three/webgpu'
import { utteranceOf } from '../../communication/lexicon'
import { speechLabelHeight } from '../../communication/speechLabel'
import { markActor } from '../actorLabelSource'
import {
  clearSpeechLabels,
  forgetSpeechLabel,
  placeSpeechNote,
  pruneSpeechLabels,
  speakOverhead,
  speechAnchor,
  speechClock,
  speechLabelState,
  speechTargetLabel,
  speechTipWorld,
  speechUseCandidate,
  subscribeSpeechLabels,
  updateSpeechTarget,
} from './speechChannel'

const RIVER_UTTERANCE = utteranceOf('RIVER', SHIPPED_VOCABULARY)
const DIG = utteranceOf('DIG', SHIPPED_VOCABULARY)

/** A stand-in for the figure the label rides on; `parent: null` = unmounted. */
function figure(parent: unknown = {}): Object3D {
  return { parent } as unknown as Object3D
}

beforeEach(() => {
  clearSpeechLabels()
})

describe('speaking over a figure (design.md §13.4)', () => {
  it("attaches the label to the speaker's own object", () => {
    const kid = figure()
    speakOverhead('kid-1', [RIVER_UTTERANCE], kid, { now: 0 })
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    expect(speechAnchor('kid-1')).toBe(kid)
  })

  it('knows no anchor for a speaker that never spoke', () => {
    expect(speechAnchor('kid-9')).toBeNull()
  })

  it('re-speaking moves the label to the figure that speaks now', () => {
    const first = figure()
    const second = figure()
    speakOverhead('kid-1', [RIVER_UTTERANCE], first, { now: 0 })
    speakOverhead('kid-1', [DIG], second, { now: 1 })
    expect(speechLabelState().labels).toHaveLength(1)
    expect(speechAnchor('kid-1')).toBe(second)
  })

  it('notifies subscribers, and stops once unsubscribed', () => {
    let seen = 0
    const stop = subscribeSpeechLabels(() => (seen += 1))
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure(), { now: 0 })
    expect(seen).toBe(1)
    stop()
    speakOverhead('kid-2', [DIG], figure(), { now: 0 })
    expect(seen).toBe(1)
  })

  it('an empty phrase changes nothing and notifies nobody', () => {
    let seen = 0
    const stop = subscribeSpeechLabels(() => (seen += 1))
    speakOverhead('kid-1', [], figure(), { now: 0 })
    expect(speechLabelState().labels).toHaveLength(0)
    expect(seen).toBe(0)
    stop()
  })

  it('uses the wall clock when the caller names no time', () => {
    const before = speechClock()
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure())
    const label = speechLabelState().labels[0]
    expect(label.shownAt).toBeGreaterThanOrEqual(before)
    expect(label.hideAt).toBeGreaterThan(label.shownAt)
  })
})

describe('the scene never accumulates standing text (design.md §13.4)', () => {
  it('prunes a label whose time is up, and forgets its anchor with it', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure(), { now: 0, seconds: 2 })
    pruneSpeechLabels(1)
    expect(speechLabelState().labels).toHaveLength(1)
    pruneSpeechLabels(2)
    expect(speechLabelState().labels).toHaveLength(0)
    expect(speechAnchor('kid-1')).toBeNull()
  })

  it('drops the label of a figure that left the scene graph', () => {
    const kid = figure()
    speakOverhead('kid-1', [RIVER_UTTERANCE], kid, { now: 0, seconds: 100 })
    ;(kid as unknown as { parent: unknown }).parent = null
    pruneSpeechLabels(1)
    expect(speechLabelState().labels).toHaveLength(0)
  })

  it('keeps the label of a figure that is still drawn', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure(), { now: 0, seconds: 100 })
    pruneSpeechLabels(1)
    expect(speechLabelState().labels).toHaveLength(1)
  })

  it('pruning with nothing to prune notifies nobody', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure(), { now: 0, seconds: 100 })
    let seen = 0
    const stop = subscribeSpeechLabels(() => (seen += 1))
    pruneSpeechLabels(1)
    expect(seen).toBe(0)
    stop()
  })

  it('speaking again sweeps out what has already run out', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure(), { now: 0, seconds: 2 })
    speakOverhead('kid-2', [DIG], figure(), { now: 5, seconds: 2 })
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-2'])
  })

  it('leaving the settlement clears every label and anchor', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], figure(), { now: 0, seconds: 100 })
    clearSpeechLabels()
    expect(speechLabelState().labels).toHaveLength(0)
    expect(speechAnchor('kid-1')).toBeNull()
  })
})

/**
 * The height the channel gives a note (work-order point 582): it is taken from
 * the SPEAKER, here, so no call site has to compute it and none can forget to.
 */
describe('the height comes from the speaker itself', () => {
  /** A figure drawn at `scale` whose actor record says how tall it stands. */
  function drawn(scale: number, height = 1.45): Object3D {
    const m = { elements: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1] }
    return {
      parent: {},
      matrixWorld: m,
      userData: markActor({ kind: 'villager', height }),
      children: [],
    } as unknown as Object3D
  }

  it('gives a child a lower note than a grown villager, each over its own head', () => {
    speakOverhead('villager-1', [RIVER_UTTERANCE], drawn(1), { now: 0 })
    speakOverhead('kid-1', [RIVER_UTTERANCE], drawn(0.55), { now: 0 })
    const at = (id: string) => speechLabelState().labels.find((l) => l.speakerId === id)!.height
    expect(at('villager-1')).toBeCloseTo(speechLabelHeight(1.45))
    expect(at('kid-1')).toBeCloseTo(speechLabelHeight(1.45 * 0.55))
    expect(at('kid-1')).toBeLessThan(at('villager-1'))
  })

  it('ends the tail at the DRAWN head top, not at the record over it (point 1276)', () => {
    const fig = drawn(1)
    ;(fig as unknown as { children: unknown[] }).children = [
      {
        name: 'figure-head',
        matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.18, 0, 1] },
        geometry: { parameters: { radius: 0.16 } },
      },
    ]
    speakOverhead('villager-1', [RIVER_UTTERANCE], fig, { now: 0 })
    expect(speechLabelState().labels[0].height).toBeCloseTo(1.34)
  })

  it('follows the head after the speech began: a lean, a kneel, a step (point 1276)', () => {
    const fig = drawn(1)
    const head = {
      name: 'figure-head',
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.18, 0, 1] },
      geometry: { parameters: { radius: 0.16 } },
    }
    ;(fig as unknown as { children: unknown[] }).children = [head]
    let refreshed = 0
    ;(fig as unknown as { updateWorldMatrix: () => void }).updateWorldMatrix = () => (refreshed += 1)
    speakOverhead('villager-1', [RIVER_UTTERANCE], fig, { now: 0 })
    // The matrices are refreshed before the start height is read.
    expect(refreshed).toBe(1)
    const label = speechLabelState().labels[0]
    const tip = { x: 0, y: 0, z: 0 }
    expect(speechTipWorld(label, tip)).toBe(true)
    expect([tip.x, tip.y, tip.z].map((n) => +n.toFixed(3))).toEqual([0, 1.34, 0])
    // The figure kneels and leans after speaking: the head drops and moves.
    head.matrixWorld.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.2, 0.8, -0.1, 1]
    expect(speechTipWorld(label, tip)).toBe(true)
    // Every read refreshes the matrices again (one start value, two reads).
    expect(refreshed).toBe(3)
    expect([tip.x, tip.y, tip.z].map((n) => +n.toFixed(3))).toEqual([0.2, 0.96, -0.1])
  })

  it('keeps an explicit height over the origin, and the stored height without a head', () => {
    const fig = drawn(1)
    ;(fig as unknown as { children: unknown[] }).children = [
      {
        name: 'figure-head',
        matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.18, 0, 1] },
        geometry: { parameters: { radius: 0.16 } },
      },
    ]
    speakOverhead('probe', [RIVER_UTTERANCE], fig, { now: 0, height: 9 })
    const tip = { x: 0, y: 0, z: 0 }
    expect(speechTipWorld(speechLabelState().labels[0], tip)).toBe(true)
    expect(tip.y).toBe(9)
    speakOverhead('villager-2', [RIVER_UTTERANCE], drawn(1), { now: 0 })
    const label = speechLabelState().labels.find((l) => l.speakerId === 'villager-2')!
    expect(speechTipWorld(label, tip)).toBe(true)
    expect(tip.y).toBeCloseTo(speechLabelHeight(1.45))
  })

  it('falls back to a grown figure for an object that is no marked actor', () => {
    speakOverhead('probe', [RIVER_UTTERANCE], figure(), { now: 0 })
    expect(speechLabelState().labels[0].height).toBeCloseTo(speechLabelHeight())
  })

  it('lets an explicit height win — the dev hook and the tests set their own', () => {
    speakOverhead('probe', [RIVER_UTTERANCE], drawn(1), { now: 0, height: 9 })
    expect(speechLabelState().labels[0].height).toBe(9)
  })
})

/**
 * WHICH SPEAKER A CLICK WOULD TAKE (work-order point 588). The picking rule
 * itself is pinned in src/communication/speechTarget.test.ts; what the channel
 * owes is the measurement: the nearest DRAWN label, from the player's live
 * position, and no target at all outside a settlement.
 */
describe('the speaker the use key would take (design.md §13.4)', () => {
  /** A figure standing at (x, z), mounted in the scene graph. */
  function standing(x: number, z: number): Object3D {
    return {
      parent: {},
      updateWorldMatrix() {},
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1] },
    } as unknown as Object3D
  }
  const anyLabel = () => true
  const player = (x: number, z: number) => ({ x, z, active: true })

  it('highlights the nearest speaker and follows him as he moves', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], standing(3, 0), { now: 0, seconds: 100 })
    speakOverhead('kid-2', [DIG], standing(8, 0), { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, player(0, 0))
    expect(speechLabelState().targetId).toBe('kid-1')
    expect(speechTargetLabel()?.atoms).toEqual([RIVER_UTTERANCE])
    // The player walks past kid-1 and up to kid-2.
    updateSpeechTarget(anyLabel, player(9, 0))
    expect(speechLabelState().targetId).toBe('kid-2')
  })

  it('never highlights a label the player cannot see drawn', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], standing(1, 0), { now: 0, seconds: 100 })
    speakOverhead('kid-2', [DIG], standing(4, 0), { now: 0, seconds: 100 })
    updateSpeechTarget((l) => l.speakerId !== 'kid-1', player(0, 0))
    expect(speechLabelState().targetId).toBe('kid-2')
  })

  it('holds the highlighted note against the sweep, and drops it once the pick moves', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], standing(2, 0), { now: 0, seconds: 1 })
    updateSpeechTarget(anyLabel, player(0, 0))
    pruneSpeechLabels(60)
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    // He walks out of earshot: nothing is highlighted, and the note goes.
    updateSpeechTarget(anyLabel, player(50, 0))
    pruneSpeechLabels(60)
    expect(speechLabelState().labels).toHaveLength(0)
    expect(speechTargetLabel()).toBeNull()
  })

  it('highlights nobody while the player is not in a settlement', () => {
    speakOverhead('kid-1', [RIVER_UTTERANCE], standing(1, 0), { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, { x: 0, z: 0, active: false })
    expect(speechLabelState().targetId).toBeNull()
  })

  it('offers the speaker as a use-key candidate, measured live (point 691)', () => {
    const kid = standing(3, 4)
    speakOverhead('kid-1', [RIVER_UTTERANCE], kid, { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, player(0, 0))
    const candidate = speechUseCandidate(player(0, 0))
    expect(candidate?.key).toBe('speech:kid-1')
    expect(candidate?.distance).toBeCloseTo(5, 6)
    expect(candidate?.range).toBe(10)
    expect(candidate?.payload.speakerId).toBe('kid-1')
    // The distance is taken from where the speaker stands NOW, not from the
    // frame that picked him: a step after the pick moves the candidate with it.
    expect(speechUseCandidate(player(3, 0))?.distance).toBeCloseTo(4, 6)
  })

  it('takes ONE note down at once, highlight and all (the chief arriving)', () => {
    // A targeted note is held against its own expiry so the player can reach
    // for it — which is exactly why the situation that ends it has to say so.
    speakOverhead('drummer', [RIVER_UTTERANCE], standing(1, 0), { now: 0, seconds: 1 })
    speakOverhead('kid-1', [DIG], standing(9, 0), { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, player(0, 0))
    expect(speechLabelState().targetId).toBe('drummer')
    // The same synthetic clock both labels were written on: `speechClock()` is
    // process uptime, and once it passes 40 seconds it prunes the child's label
    // too and this check fails for no reason of its own.
    pruneSpeechLabels(60)
    expect(speechLabelState().labels.map((l) => l.speakerId)).toContain('drummer')
    forgetSpeechLabel('drummer')
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    expect(speechLabelState().targetId).toBeNull()
    expect(speechUseCandidate(player(0, 0))).toBeNull()
  })

  it('offers no candidate without a highlighted speaker, or outside a settlement', () => {
    expect(speechUseCandidate(player(0, 0))).toBeNull()
    speakOverhead('kid-1', [RIVER_UTTERANCE], standing(1, 0), { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, player(0, 0))
    expect(speechUseCandidate({ x: 0, z: 0, active: false })).toBeNull()
  })

  it('takes the highlight with a figure that leaves the scene', () => {
    const kid = standing(1, 0)
    speakOverhead('kid-1', [RIVER_UTTERANCE], kid, { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, player(0, 0))
    ;(kid as unknown as { parent: unknown }).parent = null
    pruneSpeechLabels(1)
    expect(speechLabelState().targetId).toBeNull()
    expect(speechTargetLabel()).toBeNull()
  })
})


it('keeps a call label actionable from the distant spectator stand', () => {
  const anchor = { parent: {}, updateWorldMatrix() {}, matrixWorld: { elements: Array(16).fill(0) } } as unknown as Object3D
  speakOverhead('caller', [RIVER_UTTERANCE], anchor, { now: 0, reach: 34 })
  const player = { x: 22, z: 0, active: true }
  updateSpeechTarget(() => true, player)
  expect(speechTargetLabel()?.speakerId).toBe('caller')
  expect(speechUseCandidate(player)?.range).toBe(34)
  updateSpeechTarget(() => true, { ...player, x: 34.01 })
  expect(speechTargetLabel()).toBeNull()
})


it('replaces the preceding village note when the floor grants a new word', () => {
  speakOverhead('first', [DIG], figure(), { now: 0, seconds: 10, floor: true })
  speakOverhead('second', [RIVER_UTTERANCE], figure(), { now: 1, floor: true })
  expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['second'])
  expect(speechAnchor('first')).toBeNull()
})

it('leaves a note raised outside the floor standing, with its figure', () => {
  // The floor clears only labels it owns, preserving an independently raised
  // note and its anchor when another village word takes the floor.
  speakOverhead('outside-floor', [DIG], figure(), { now: 0, seconds: 10 })
  speakOverhead('villager-4', [RIVER_UTTERANCE], figure(), { now: 1, floor: true })
  speakOverhead('villager-5', [DIG], figure(), { now: 2, floor: true })
  expect(speechLabelState().labels.map((l) => l.speakerId).sort()).toEqual(['outside-floor', 'villager-5'])
  expect(speechAnchor('outside-floor')).not.toBeNull()
  expect(speechAnchor('villager-4')).toBeNull()
})

/**
 * The note's scene node, stood on its tail tip each frame (point 1276) — with
 * REAL three objects, so the matrix refresh, the head lookup and the camera
 * all run as they do in the scene. The judge is the rendered projection: the
 * node must project onto the top edge of the head's drawn outline, found by
 * projecting every vertex of the head mesh — not by the formula under test.
 */
describe('placeSpeechNote', () => {
  const H = 900
  /** A figure as placeFigure builds it: a body group, the head a sphere mesh
   *  named figure-head at 1.18 over the feet. */
  function villager(scale = 1): { root: THREE.Group; body: THREE.Group; head: THREE.Mesh } {
    const root = new THREE.Group()
    const body = new THREE.Group()
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16))
    head.name = 'figure-head'
    head.position.y = 1.18
    body.add(head)
    root.add(body)
    root.scale.setScalar(scale)
    new THREE.Scene().add(root)
    return { root, body, head }
  }
  function eye(at: [number, number, number], look: [number, number, number]) {
    const cam = new THREE.PerspectiveCamera(60, 1440 / H, 0.1, 500)
    cam.position.set(...at)
    cam.lookAt(...look)
    return cam
  }
  const screenY = (cam: THREE.Camera, p: THREE.Vector3) => ((1 - p.clone().project(cam).y) / 2) * H
  /** The head outline's top edge on screen, off the projected mesh. */
  function drawnTop(cam: THREE.Camera, head: THREE.Mesh): number {
    return outline(cam, head).top
  }
  /** The projected head mesh's top edge and its horizontal middle, in px
   *  (1440 × 900) — every vertex through the camera, not the formula. */
  function outline(cam: THREE.Camera, head: THREE.Mesh): { top: number; mid: number } {
    head.updateWorldMatrix(true, false)
    cam.updateMatrixWorld(true)
    const pos = head.geometry.getAttribute('position')
    const v = new THREE.Vector3()
    let top = Infinity
    let left = Infinity
    let right = -Infinity
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(head.matrixWorld)
      top = Math.min(top, screenY(cam, v))
      const x = ((v.project(cam).x + 1) / 2) * 1440
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
    return { top, mid: (left + right) / 2 }
  }
  const screenX = (cam: THREE.Camera, p: THREE.Vector3) => ((p.clone().project(cam).x + 1) / 2) * 1440

  it('stands the node on the top of the head as the camera draws it, near and far, level and from above', () => {
    for (const [scale, at, look] of [
      [1, [0, 1.6, 4], [0, 1.4, 0]],
      [1, [2, 1.6, 20], [0, 1.4, 0]],
      [0.55, [0, 1.6, 1], [0, 0.6, 0]],
      [1, [0.3, 1.6, 1.4], [0, 1.0, 0]],
    ] as Array<[number, [number, number, number], [number, number, number]]>) {
      clearSpeechLabels()
      const { root, head } = villager(scale)
      const cam = eye(at, look)
      speakOverhead('villager-1', [RIVER_UTTERANCE], root, { now: 0 })
      const note = new THREE.Group()
      expect(placeSpeechNote(note, speechLabelState().labels[0], cam)).toBe(true)
      // The node's WORLD matrix is published at once (drei reads it first).
      expect(new THREE.Vector3().setFromMatrixPosition(note.matrixWorld)).toEqual(note.position)
      // Within a pixel of the drawn outline's top: the mesh is a 24×16
      // polygon, the formula a true sphere.
      expect(Math.abs(screenY(cam, note.position) - drawnTop(cam, head))).toBeLessThan(1)
      // And over the head sideways, not displaced along the camera's right.
      expect(Math.abs(screenX(cam, note.position) - outline(cam, head).mid)).toBeLessThan(1)
    }
  })

  it('meets a squashed head’s outline seen from above, the head drawn as the ellipsoid it is', () => {
    // A body squashed to 0.7 with no counter-scale on the head, a metre away
    // and looked down at: a ball of the head's height missed by 9 px here.
    const { root, body, head } = villager()
    body.scale.y = 0.7
    root.updateWorldMatrix(true, true)
    const centre = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld)
    const cam = eye([0, 1.6, 1], [centre.x, centre.y, centre.z])
    speakOverhead('villager-1', [RIVER_UTTERANCE], root, { now: 0 })
    const note = new THREE.Group()
    expect(placeSpeechNote(note, speechLabelState().labels[0], cam)).toBe(true)
    expect(Math.abs(screenY(cam, note.position) - drawnTop(cam, head))).toBeLessThan(1)
  })

  it('tracks the head again once a speaker that had a fixed height speaks without one', () => {
    const { root, head } = villager()
    const cam = eye([0, 1.6, 4], [0, 1.4, 0])
    speakOverhead('villager-1', [RIVER_UTTERANCE], root, { now: 0, height: 3 })
    speakOverhead('villager-1', [RIVER_UTTERANCE], root, { now: 1 })
    const note = new THREE.Group()
    placeSpeechNote(note, speechLabelState().labels.find((l) => l.speakerId === 'villager-1')!, cam)
    expect(Math.abs(screenY(cam, note.position) - drawnTop(cam, head))).toBeLessThan(1)
  })

  it('follows the figure every frame after the speech began: a step, a lean, a kneel', () => {
    const { root, body, head } = villager()
    const cam = eye([0, 1.6, 4], [0, 1.4, 0])
    speakOverhead('villager-1', [RIVER_UTTERANCE], root, { now: 0 })
    const label = speechLabelState().labels[0]
    const note = new THREE.Group()
    placeSpeechNote(note, label, cam)
    const first = note.position.clone()
    // No matrix refresh by hand: the scene has not rendered since the move.
    root.position.set(1.5, 0, -0.5)
    body.rotation.z = 0.35
    body.scale.y = 0.7
    expect(placeSpeechNote(note, label, cam)).toBe(true)
    expect(note.position.distanceTo(first)).toBeGreaterThan(0.5)
    expect(Math.abs(screenY(cam, note.position) - drawnTop(cam, head))).toBeLessThan(1)
    // Sideways at the outline's TOPMOST point — for a leaning, squashed head
    // a tilted ellipsoid, so not over the head's centre nor the body's origin.
    // Found by densely sampling the head sphere through its world matrix.
    head.updateWorldMatrix(true, false)
    let topY = Infinity
    let topX = 0
    const v = new THREE.Vector3()
    for (let a = 0; a <= 180; a++) {
      for (let c = 0; c < 360; c++) {
        const th = (Math.PI * a) / 180
        const ph = (Math.PI * c) / 180
        v.set(0.16 * Math.sin(th) * Math.cos(ph), 0.16 * Math.cos(th), 0.16 * Math.sin(th) * Math.sin(ph)).applyMatrix4(head.matrixWorld)
        const y = screenY(cam, v)
        if (y < topY) {
          topY = y
          topX = screenX(cam, v)
        }
      }
    }
    expect(Math.abs(screenX(cam, note.position) - topX)).toBeLessThan(1)
    expect(Math.abs(screenY(cam, note.position) - topY)).toBeLessThan(0.1)
  })

  it('keeps an explicit height over the origin, and leaves the node alone once the speaker is gone', () => {
    const { root } = villager()
    root.position.set(2, 0, 0)
    const cam = eye([0, 1.6, 4], [0, 1.4, 0])
    speakOverhead('probe', [RIVER_UTTERANCE], root, { now: 0, height: 3 })
    const note = new THREE.Group()
    expect(placeSpeechNote(note, speechLabelState().labels[0], cam)).toBe(true)
    expect(note.position.toArray()).toEqual([2, 3, 0])
    const gone = { ...speechLabelState().labels[0], speakerId: 'nobody' }
    note.position.set(9, 9, 9)
    expect(placeSpeechNote(note, gone, cam)).toBe(false)
    expect(note.position.toArray()).toEqual([9, 9, 9])
  })
})
