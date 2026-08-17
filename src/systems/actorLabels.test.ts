// What the hold-Ctrl layer may name, and what it says (design.md §17.8).
//
// The rosters are swept whole rather than sampled: the layer's whole promise is
// that the LIVING and the USABLE are told apart from the backdrop, so a species
// silently added to either side must show up here.
import { describe, it, expect } from 'vitest'
import {
  ACTOR_KINDS,
  actorLabelText,
  declutterLabels,
  nearestActors,
  qualifiesAsActor,
  type ActorKind,
  type ScreenLabel,
} from './actorLabels'
import { SPECIES } from '../scenes/travel/animalBodies'
import { FLORA_SPECIES } from '../scenes/travel/floraSpecies'
import { PLACES } from '../world/geo'
import { de } from '../i18n/de'
import { en } from '../i18n/en'

describe('qualifiesAsActor — what can move, or be used', () => {
  it.each(SPECIES)('the bird\'s-eye fauna is named: %s', (sp) => {
    expect(qualifiesAsActor({ kind: sp })).toBe(true)
  })

  it('vultures, inhabitants, their animals and the usable objects are named', () => {
    const kinds = [
      'vulture',
      'elder', 'trader', 'porter', 'villager', 'child',
      'guide', 'cameleer', 'donkeyboy', 'tourist',
      'goat', 'camel', 'donkey',
      'camp', 'canoe',
    ]
    for (const kind of kinds) {
      expect(qualifiesAsActor({ kind }), kind).toBe(true)
    }
  })

  it.each(FLORA_SPECIES)('the flora and dressing stay silent: %s', (sp) => {
    expect(qualifiesAsActor({ kind: sp })).toBe(false)
  })

  it('terrain, buildings and the §2.5 horizon silhouettes stay silent', () => {
    for (const kind of ['terrain', 'water', 'hut', 'wall', 'fence', 'panorama-silhouette', 'skyline']) {
      expect(qualifiesAsActor({ kind }), kind).toBe(false)
    }
  })

  // Design weight (§17.2): the layer must never leak a name the map withholds.
  it.each(PLACES.map((p) => p.id))('a map point is never named by this layer: %s', (id) => {
    expect(qualifiesAsActor({ kind: id, mapPoint: true })).toBe(false)
  })

  it('a map point stays unnamed even when its kind reads like an actor', () => {
    // Belt and braces: the flag decides, not the string.
    expect(qualifiesAsActor({ kind: 'camp', mapPoint: true })).toBe(false)
    expect(qualifiesAsActor({ kind: 'lion', mapPoint: true })).toBe(false)
  })

  it('a concealed crocodile is not named while it is concealed (§19.16)', () => {
    expect(qualifiesAsActor({ kind: 'crocodile', concealed: true })).toBe(false)
  })

  it('the same crocodile is named once it lunges', () => {
    expect(qualifiesAsActor({ kind: 'crocodile', concealed: false })).toBe(true)
  })

  // Point 628, half one: a thing whose own name already stands in the picture
  // is not named a second time — a rule about permanent labels, so it holds
  // whichever scene draws them, and every kind obeys it.
  it.each(ACTOR_KINDS as ActorKind[])('a permanent label of its own silences this layer: %s', (kind) => {
    expect(qualifiesAsActor({ kind, permanentLabel: true })).toBe(false)
    expect(qualifiesAsActor({ kind, permanentLabel: false })).toBe(true)
  })

  // Point 628, half two: the layer says what the player is looking AT, and his
  // own boat is not that. The kind stays nameable — only this one is his.
  it('the traveller\'s own canoe is not named, a set-down one is', () => {
    expect(qualifiesAsActor({ kind: 'canoe', ownedByPlayer: true })).toBe(false)
    expect(qualifiesAsActor({ kind: 'canoe' })).toBe(true)
    expect(qualifiesAsActor({ kind: 'canoe', ownedByPlayer: false })).toBe(true)
  })
})

describe('actorLabelText — kind, age, state, in both languages', () => {
  const LANGS = [
    ['de', de],
    ['en', en],
  ] as const

  // Every kind × age × state must render a real word — never a blank, never the
  // internal id leaking into the picture.
  const AGES = [undefined, 'adult', 'young'] as const
  const STATES = [undefined, true] as const
  for (const [lang, strings] of LANGS) {
    it.each(ACTOR_KINDS as ActorKind[])(`${lang}: every age/state of %s reads as text`, (kind) => {
      for (const age of AGES) {
        for (const dead of STATES) {
          const text = actorLabelText(strings, { kind, age, dead })
          expect(text.length, `${lang}/${kind}/${age}/${dead}`).toBeGreaterThan(0)
          expect(text, `${lang}/${kind}: the id leaked into the label`).not.toBe(kind)
          expect(text[0], `${lang}/${kind}: label starts capitalized`).toBe(text[0].toUpperCase())
        }
      }
    })
  }

  // The four forms the design states verbatim (§17.8).
  it('pins the reported forms', () => {
    expect(actorLabelText(en, { kind: 'giraffe', age: 'adult' })).toBe('Adult giraffe')
    expect(actorLabelText(en, { kind: 'giraffe', age: 'young', dead: true })).toBe('Dead giraffe calf')
    expect(actorLabelText(de, { kind: 'giraffe', age: 'adult' })).toBe('Erwachsene Giraffe')
    expect(actorLabelText(de, { kind: 'giraffe', age: 'young', dead: true })).toBe('Totes Giraffen-Jungtier')
  })

  // The gender is really applied, not decoration: feminine, neuter, masculine
  // inflect the SAME qualifier differently.
  it('German inflects the qualifier by the noun\'s gender', () => {
    expect(actorLabelText(de, { kind: 'giraffe', dead: true })).toBe('Tote Giraffe')
    expect(actorLabelText(de, { kind: 'zebra', dead: true })).toBe('Totes Zebra')
    expect(actorLabelText(de, { kind: 'elephant', dead: true })).toBe('Toter Elefant')
    expect(actorLabelText(de, { kind: 'antelope', age: 'adult' })).toBe('Erwachsene Antilope')
    expect(actorLabelText(de, { kind: 'wildebeest', age: 'adult' })).toBe('Erwachsenes Gnu')
    expect(actorLabelText(de, { kind: 'elephant', age: 'adult' })).toBe('Erwachsener Elefant')
  })

  it('the adult qualifier appears only where the kind has young at all', () => {
    // A flamingo is drawn at one age, so "adult" would say nothing.
    expect(actorLabelText(en, { kind: 'flamingo', age: 'adult' })).toBe('Flamingo')
    expect(actorLabelText(de, { kind: 'flamingo', age: 'adult' })).toBe('Flamingo')
    // Neither does a person or an object carry one.
    expect(actorLabelText(en, { kind: 'villager', age: 'adult' })).toBe('Villager')
    expect(actorLabelText(de, { kind: 'camp', age: 'adult' })).toBe('Lager')
  })

  it('people read by their role and objects by their kind', () => {
    expect(actorLabelText(en, { kind: 'elder' })).toBe('Elder')
    expect(actorLabelText(de, { kind: 'elder' })).toBe('Ältester')
    expect(actorLabelText(en, { kind: 'canoe' })).toBe('Canoe')
    expect(actorLabelText(de, { kind: 'canoe' })).toBe('Kanu')
  })

  it('both languages carry the whole roster', () => {
    for (const kind of ACTOR_KINDS) {
      expect(de.actors.kinds[kind], `de misses ${kind}`).toBeTruthy()
      expect(en.actors.kinds[kind], `en misses ${kind}`).toBeTruthy()
      // A young form exists in both languages or in neither: the age the game
      // distinguishes cannot depend on which language is selected.
      expect(de.actors.kinds[kind].young === undefined, `young parity for ${kind}`).toBe(
        en.actors.kinds[kind].young === undefined,
      )
    }
    expect(Object.keys(de.actors.kinds).sort()).toEqual(Object.keys(en.actors.kinds).sort())
  })
})

describe('declutterLabels — no two boxes fuse into one (point 628)', () => {
  /** A label box of the size the game really draws (12 px text, 8 chars). */
  const box = (x: number, y: number, depth: number, width = 52): ScreenLabel => ({
    x,
    y,
    width,
    height: 18,
    depth,
  })

  it('leaves labels that do not touch exactly where they are', () => {
    const lifts = declutterLabels([box(100, 400, 10), box(400, 400, 20), box(100, 600, 30)])
    expect(lifts).toEqual([0, 0, 0])
  })

  it('lifts the FURTHER of two boxes that would overlap, and keeps both names', () => {
    // The measured defect: two villagers side by side, 40 px apart, boxes 52 px
    // wide — they printed "Villager llager".
    const lifts = declutterLabels([box(320, 447, 25), box(280, 447, 12)])
    expect(lifts[1], 'the nearer keeps its place').toBe(0)
    expect(lifts[0], 'the further rises clear of it').toBeGreaterThanOrEqual(18)
    // And it really is clear: a full box height plus the gap.
    expect(lifts[0]).toBe(21)
  })

  it('does not care in which order they arrive — depth decides', () => {
    const near = box(280, 447, 12)
    const far = box(320, 447, 25)
    expect(declutterLabels([near, far])).toEqual([0, 21])
    expect(declutterLabels([far, near])).toEqual([21, 0])
  })

  it('stacks a whole crowd into readable rows rather than one blur', () => {
    const crowd = [0, 1, 2, 3].map((i) => box(300, 450, 10 + i))
    const lifts = declutterLabels(crowd)
    expect(lifts).toEqual([0, 21, 42, 63])
  })

  it('drops the farthest label once no clear row is left', () => {
    // Five boxes in one spot: four rows fit (the box itself plus three lifts),
    // the fifth would stand a full frame above its own figure and says nothing.
    const crowd = [0, 1, 2, 3, 4].map((i) => box(300, 450, 10 + i))
    const lifts = declutterLabels(crowd)
    expect(lifts.slice(0, 4)).toEqual([0, 21, 42, 63])
    expect(lifts[4], 'the farthest yields entirely').toBeNull()
  })

  it('measures the real box, so a long name yields to a short one further away', () => {
    // "Dead giraffe calf" is far wider than "Goat": the wide box overlaps a
    // neighbour the narrow one would have cleared.
    const wide = box(300, 400, 30, 130)
    const narrow = box(380, 400, 10, 40)
    expect(declutterLabels([wide, narrow])[0]).toBeGreaterThan(0)
    const slim = box(300, 400, 30, 40)
    expect(declutterLabels([slim, narrow])[0]).toBe(0)
  })

  it('answers one lift per label, in the order it was given', () => {
    const lifts = declutterLabels([box(0, 0, 1), box(0, 0, 2), box(900, 500, 3)])
    expect(lifts).toHaveLength(3)
    expect(lifts[2]).toBe(0)
  })

  it('says nothing about an empty picture', () => {
    expect(declutterLabels([])).toEqual([])
  })
})

describe('nearestActors — the nearest survive the cap', () => {
  const at = (x: number) => ({ x, y: 0, z: 0 })

  it('keeps the nearest and drops the farthest', () => {
    const items = [at(50), at(1), at(20), at(3)]
    const kept = nearestActors(items, at(0), 2)
    expect(kept.map((k) => k.x)).toEqual([1, 3])
  })

  it('returns everything below the cap, and nothing at a cap of zero', () => {
    const items = [at(1), at(2)]
    expect(nearestActors(items, at(0), 5)).toHaveLength(2)
    expect(nearestActors(items, at(0), 0)).toHaveLength(0)
  })

  it('measures in all three axes (a bird overhead is near)', () => {
    const overhead = { x: 0, y: 30, z: 0 }
    const acrossTheValley = { x: 200, y: 0, z: 0 }
    expect(nearestActors([acrossTheValley, overhead], { x: 0, y: 0, z: 0 }, 1)).toEqual([overhead])
  })
})
