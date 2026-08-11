// The hold-Ctrl roster in every STATE it can be in (design.md §17.8, point 600).
//
// Point 342's own tests swept the roster of KINDS and went green — and the very
// first hold in real play found an ATTACKING lion unnamed, because the state it
// was in moved it to a source nobody had registered. So the sweep here is the
// cross product: every kind, in every state the scene can put it in, must come
// out of some source AND survive the predicate. A kind that only ever passes as
// an idle grazer is not named; it is named while idle.
import { describe, it, expect } from 'vitest'
import {
  actorConcealed,
  labelRise,
  pushFlockActors,
  pushHerdActors,
  pushHuntActor,
  type LabelledAnimal,
} from './wildlifeActorSource'
import { SPECIES, type Species } from './animalBodies'
import { PREDATOR_PREY, type PredatorKind, type PreyKind } from './wildlifeBehavior'
import { qualifiesAsActor, actorLabelText } from '../../systems/actorLabels'
import type { LabelledActor } from '../actorLabelSource'
import { en } from '../../i18n/en'

const FRAME = 7

/** A body the last render pass drew, at an arbitrary but definite transform. */
const drawn = () => ({ x: 10, y: 2, z: -4, scale: 1.1, frame: FRAME })

/** One herd of exactly the animals handed in; every other species empty. */
function herdOf(sp: Species, animals: LabelledAnimal[]): Record<Species, LabelledAnimal[]> {
  const herds = {} as Record<Species, LabelledAnimal[]>
  for (const s of SPECIES) herds[s] = s === sp ? animals : []
  return herds
}

/**
 * The STATES a streamed animal can be in, as the records the scene really
 * writes. The label source reads only `drawn`/`young`/`dead`/`lunge`, and that
 * is precisely the claim under test: no other state may silence an animal, so
 * each of these carries its own drama flags alongside.
 */
const HERD_STATES: Array<{ name: string; a: LabelledAnimal }> = [
  { name: 'idle', a: { drawn: drawn() } },
  { name: 'walking', a: { drawn: drawn(), ...{ roam: 2.4 } } },
  { name: 'fleeing', a: { drawn: drawn(), ...{ flee: 1.2, spooked: true } } },
  { name: 'drinking at the bank', a: { drawn: drawn(), ...{ drink: { time: 1.5 } } } },
  { name: 'crossing water', a: { drawn: drawn(), ...{ crossing: { tx: 1, tz: 2, time: 0.5 }, inWater: 1 } } },
  { name: 'seized mid-drama', a: { drawn: drawn(), ...{ caught: 2.5 } } },
  { name: 'mired', a: { drawn: drawn(), ...{ mired: 3 } } },
  { name: 'standing vigil over a kill', a: { drawn: drawn(), ...{ vigil: { time: 4 } } } },
  { name: 'defending its calf', a: { drawn: drawn(), ...{ kick: 0.4 } } },
  { name: 'a juvenile at play', a: { drawn: drawn(), young: true, ...{ hop: 0.3 } } },
  { name: 'an orphan mourning', a: { drawn: drawn(), young: true, ...{ mourn: 12 } } },
  { name: 'dead', a: { drawn: drawn(), dead: true, ...{ dissolve: 40 } } },
  { name: 'a carcass being scavenged', a: { drawn: drawn(), dead: true, ...{ remnant: true, lionFed: true } } },
]

/** The hunt phases the scripted predator and its prey are drawn in. */
const HUNT_PHASES = ['chase', 'feed', 'leave'] as const

const group = (visible: boolean, scale = 1) => ({
  visible,
  // Column-major Matrix4: uniform scale on the basis, translation in column 4.
  matrixWorld: { elements: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 12, 3, -8, 1] },
})

describe('the herds name every species in every state it can be in', () => {
  for (const sp of SPECIES) {
    it.each(HERD_STATES)(`${sp}: named while %s`, ({ a }) => {
      const out: LabelledActor[] = []
      pushHerdActors(herdOf(sp, [a]), FRAME, out)
      expect(out).toHaveLength(1)
      const [actor] = out
      // The crocodile hidden under the surface is the ONE designed silence
      // (§19.16); it is asserted on its own below.
      const hidden = sp === 'crocodile' && a.dead !== true
      expect(qualifiesAsActor(actor), `${sp} in this state`).toBe(!hidden)
      expect(actor.dead === true).toBe(a.dead === true)
      expect(actor.age).toBe(a.young === true ? 'young' : 'adult')
      // And it really reads as something: the picture shows this text.
      expect(actorLabelText(en, { kind: sp, age: actor.age, dead: actor.dead }).length).toBeGreaterThan(0)
    })
  }

  it('an animal the last pass did not draw is not named where it is not standing', () => {
    const out: LabelledActor[] = []
    pushHerdActors(herdOf('zebra', [{ drawn: { ...drawn(), frame: FRAME - 1 } }, {}]), FRAME, out)
    expect(out).toHaveLength(0)
  })

  it('the label floats clear above the drawn body, scaled with it', () => {
    const out: LabelledActor[] = []
    pushHerdActors(herdOf('elephant', [{ drawn: drawn() }]), FRAME, out)
    expect(out[0].y).toBeCloseTo(2 + labelRise('elephant', 1.1))
    expect(out[0].y).toBeGreaterThan(2)
    // A calf drawn at half size carries its label lower than a grown bull.
    const small: LabelledActor[] = []
    pushHerdActors(herdOf('elephant', [{ drawn: { ...drawn(), scale: 0.5 }, young: true }]), FRAME, small)
    expect(small[0].y).toBeLessThan(out[0].y)
  })

  // §17.2 stays untouched by this layer: a source that ever set `mapPoint`
  // could leak an undiscovered name, so none of them may produce one.
  it('no wildlife source ever produces a map point', () => {
    const out: LabelledActor[] = []
    for (const sp of SPECIES) pushHerdActors(herdOf(sp, HERD_STATES.map((s) => s.a)), FRAME, out)
    pushHuntActor(group(true), 'lion', 1, false, out)
    pushFlockActors({ visible: true, children: [{ matrixWorld: { elements: group(true).matrixWorld.elements } }] }, out)
    expect(out.length).toBeGreaterThan(0)
    for (const a of out) expect('mapPoint' in a).toBe(false)
  })
})

describe('the scripted hunt names its own two figures — the gap point 600 found', () => {
  const PREDATORS = Object.keys(PREDATOR_PREY) as PredatorKind[]
  const PREY = [...new Set(Object.values(PREDATOR_PREY).flat())] as PreyKind[]

  for (const phase of HUNT_PHASES) {
    it.each(PREDATORS)(`a %s is named while it is drawn (${phase})`, (kind) => {
      const out: LabelledActor[] = []
      pushHuntActor(group(true), kind, 1, false, out)
      expect(out).toHaveLength(1)
      expect(qualifiesAsActor(out[0])).toBe(true)
      expect(out[0].kind).toBe(kind)
      expect(out[0].dead).toBe(false)
      expect(actorLabelText(en, { kind, age: 'adult' }).toLowerCase()).toContain(
        en.actors.kinds[kind].noun.toLowerCase(),
      )
    })
  }

  it.each(PREY)('the hunted %s is named as it runs, and as the carcass it becomes', (kind) => {
    const running: LabelledActor[] = []
    pushHuntActor(group(true), kind, 1, false, running)
    expect(running).toHaveLength(1)
    expect(qualifiesAsActor(running[0])).toBe(true)
    expect(running[0].dead).toBe(false)
    const eaten: LabelledActor[] = []
    pushHuntActor(group(true, 0.2), kind, 1, true, eaten)
    expect(qualifiesAsActor(eaten[0])).toBe(true)
    expect(eaten[0].dead).toBe(true)
    // The carcass shrinks as it is eaten, and its label comes down with it.
    expect(eaten[0].y).toBeLessThan(running[0].y)
  })

  it('a hunt that is not running names nobody', () => {
    const out: LabelledActor[] = []
    pushHuntActor(group(false), 'lion', 1, false, out)
    pushHuntActor(null, 'lion', 1, false, out)
    expect(out).toHaveLength(0)
  })
})

describe('the vulture flocks', () => {
  const bird = (x: number) => ({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 5, 0, 1] } })

  it('names every bird of a flock that is up', () => {
    const out: LabelledActor[] = []
    pushFlockActors({ visible: true, children: [bird(1), bird(2), bird(3)] }, out)
    expect(out.map((a) => a.kind)).toEqual(['vulture', 'vulture', 'vulture'])
    for (const a of out) expect(qualifiesAsActor(a)).toBe(true)
  })

  it('names nobody while the flock is not drawn', () => {
    const out: LabelledActor[] = []
    pushFlockActors({ visible: false, children: [bird(1)] }, out)
    pushFlockActors(null, out)
    expect(out).toHaveLength(0)
  })
})

describe('concealment is the crocodile ambush and nothing else (§19.16)', () => {
  it('only the hidden, living crocodile is concealed — no other kind, in any state', () => {
    for (const sp of SPECIES) {
      for (const { name, a } of HERD_STATES) {
        const expected = sp === 'crocodile' && a.dead !== true
        expect(actorConcealed(sp, a), `${sp} while ${name}`).toBe(expected)
      }
    }
  })

  it('the crocodile is named the moment it breaks cover, and stays named through the ambush', () => {
    const ambush = [
      { name: 'lunging', lunge: { victim: null, timer: 0.2, homeX: 0, homeZ: 0, gripped: false } },
      { name: 'dragging its catch to the water', lunge: { gripped: false, dragging: true } },
      { name: 'gripping and feeding', lunge: { gripped: true } },
      { name: 'slinking back after a miss', lunge: { retreat: true } },
    ]
    for (const { name, lunge } of ambush) {
      expect(actorConcealed('crocodile', { drawn: drawn(), lunge }), name).toBe(false)
    }
    // A carcass hides nothing.
    expect(actorConcealed('crocodile', { drawn: drawn(), dead: true })).toBe(false)
    // And back under water, it falls silent again.
    expect(actorConcealed('crocodile', { drawn: drawn() })).toBe(true)
  })

  it('an attacking predator is never treated as concealed', () => {
    // The second candidate cause point 600 had to rule out: the ambush rule
    // reaching a predator that is not hidden at all.
    for (const kind of ['lion', 'cheetah', 'leopard', 'hyena'] as const) {
      expect(actorConcealed(kind, { drawn: drawn() })).toBe(false)
      const out: LabelledActor[] = []
      pushHerdActors(herdOf(kind, [{ drawn: drawn() }]), FRAME, out)
      expect(out[0].concealed).toBe(false)
      expect(qualifiesAsActor(out[0])).toBe(true)
    }
  })
})
