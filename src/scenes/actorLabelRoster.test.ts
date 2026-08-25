// The hold-Ctrl roster, the SETTLEMENT half and the whole of it (design.md
// §17.8, point 600).
//
// The travel half sweeps its three sources in wildlifeActorSource.test.ts. This
// file sweeps the other perspective — the settlement's people, their animals
// and the usable objects, all of which reach the layer as MARKED scene nodes —
// across every state the scene puts such a node in, and then asks the question
// the reported defect really was: is every kind of the roster produced by some
// real scene at all? An ATTACKING lion was named nowhere because the state it
// entered moved it to a source nobody had registered; a kind no scene ever
// marks fails in exactly the same way, silently, and no predicate test sees it.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { markActor, pushMarkedActors, type LabelledActor, type MarkedNode } from './actorLabelSource'
import { ACTOR_KINDS, actorLabelText, qualifiesAsActor, type ActorKind } from '../systems/actorLabels'
import { SPECIES } from './travel/animalBodies'
import { GIZA_AMBIENT } from './place/gizaSite'
import { en } from '../i18n/en'
import { de } from '../i18n/de'

/** A scene node as three composes it: uniform scale on the basis, translation
 *  in the fourth column. */
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

/**
 * The kinds that reach the layer as marked nodes: everything but the streamed
 * fauna (its own sources) and the elder, who is deliberately unmarked because
 * he carries his own standing label — pinned as such further down.
 */
const MARKED_KINDS: ActorKind[] = ACTOR_KINDS.filter(
  (k) => !(SPECIES as readonly string[]).includes(k) && k !== 'vulture' && k !== 'elder',
)

/**
 * What the settlement really does to such a node. Only ONE of these may
 * silence a figure — the switched-off one, which is not being drawn; every
 * other state is a transform or a pose under the same marked group, and the
 * label must ride it.
 */
const NODE_STATES: Array<{ name: string; make: (mark: { actor: { kind: ActorKind; height: number } }) => MarkedNode }> =
  [
    { name: 'standing at its spot', make: (m) => node(4, 0, -3, { userData: m }) },
    // A walker is the same group, moved: the mark reads matrixWorld, so the
    // label stands where the figure now is rather than where it was born.
    { name: 'walking its errand', make: (m) => node(-11.5, 0, 6.25, { userData: m }) },
    // A gesture rotates limbs UNDER the marked group; the group itself does not
    // move, and the figure must stay named through the whole of it.
    {
      name: 'gesturing while it speaks',
      make: (m) => node(2, 0, 2, { userData: m, children: [node(2, 1.1, 2), node(2.3, 1.1, 2)] }),
    },
    // Kneeling squashes the group (scale y * 0.75) and lowers the body.
    { name: 'kneeling at work', make: (m) => node(0, 0, 5, { scale: 0.9, userData: m }) },
    { name: 'carrying a load on its head', make: (m) => node(7, 0.02, 1, { userData: m }) },
    { name: 'drawn small, as a youth is', make: (m) => node(-3, 0, 8, { scale: 0.55, userData: m }) },
    {
      name: 'deep under the settlement group',
      make: (m) => node(0, 0, 0, { children: [node(0, 0, 0, { children: [node(9, 0, -9, { userData: m })] })] }),
    },
  ]

describe('the settlement names every kind it draws, in every state it draws it in', () => {
  for (const kind of MARKED_KINDS) {
    it.each(NODE_STATES)(`${kind}: named while %s`, ({ make }) => {
      const mark = markActor({ kind, height: 1.6 })
      const out: LabelledActor[] = []
      pushMarkedActors(make(mark), out)
      expect(out).toHaveLength(1)
      const [actor] = out
      expect(qualifiesAsActor(actor), `${kind} in this state`).toBe(true)
      expect(actor.kind).toBe(kind)
      // It really reads as something, in BOTH languages (§17.7).
      expect(actorLabelText(en, { kind }).length).toBeGreaterThan(0)
      expect(actorLabelText(de, { kind }).length).toBeGreaterThan(0)
      // And the label floats above the figure, never at its feet.
      expect(actor.y).toBeGreaterThan(0)
    })
  }

  it('a figure the scene switched off is named nowhere — the one silence', () => {
    for (const kind of MARKED_KINDS) {
      const out: LabelledActor[] = []
      pushMarkedActors(node(1, 0, 1, { visible: false, userData: markActor({ kind, height: 1.6 }) }), out)
      expect(out, kind).toHaveLength(0)
    }
  })

  it('the label rides a walking figure rather than its birthplace', () => {
    const mark = markActor({ kind: 'villager', height: 1.45 })
    const born: LabelledActor[] = []
    const moved: LabelledActor[] = []
    pushMarkedActors(node(0, 0, 0, { userData: mark }), born)
    pushMarkedActors(node(6.5, 0, -2.25, { userData: mark }), moved)
    expect([moved[0].x, moved[0].z]).toEqual([6.5, -2.25])
    expect(moved[0].x).not.toBe(born[0].x)
  })

  // §17.2 stays untouched by this half too: the marked path has no way to say
  // "map point", so it can never leak an undiscovered name — and a settlement
  // or landmark marker in the graph is simply not an actor.
  it('no marked scene node ever produces a map point (§17.2)', () => {
    const out: LabelledActor[] = []
    for (const kind of MARKED_KINDS) pushMarkedActors(node(0, 0, 0, { userData: markActor({ kind, height: 1 }) }), out)
    expect(out.length).toBe(MARKED_KINDS.length)
    for (const a of out) expect('mapPoint' in a).toBe(false)
  })

  // §19.16 belongs to the submerged crocodile and to nothing else: no
  // settlement figure is ever concealed, so none of them may arrive flagged.
  it('nothing in a settlement is ever concealed (§19.16)', () => {
    const out: LabelledActor[] = []
    for (const kind of MARKED_KINDS) pushMarkedActors(node(0, 0, 0, { userData: markActor({ kind, height: 1 }) }), out)
    for (const a of out) expect(a.concealed).toBeUndefined()
  })
})

// --- Is every kind of the roster actually drawn by some scene? ----------------
//
// The reported defect was a kind-and-state combination no source produced. A
// kind NO source produces at all is the same failure with the state left out,
// and it is invisible from inside the pure layer: the predicate says yes, the
// text composes, and the player never sees the label because nobody ever offers
// the subject. So the roster is checked against the call sites themselves.

const SRC = resolve(process.cwd(), 'src')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path)
  }
  return out
}

const SOURCES = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

/** Every `markActor({ kind: 'x' … })` written in the game code. */
function markedLiterals(): Set<string> {
  const kinds = new Set<string>()
  for (const { text } of SOURCES) {
    for (const m of text.matchAll(/markActor\(\{\s*kind:\s*'([a-zA-Z]+)'/g)) kinds.add(m[1])
  }
  return kinds
}

/** Every `role="x"` a scene hands a marked figure. */
function roleLiterals(): Set<string> {
  const kinds = new Set<string>()
  for (const { text } of SOURCES) {
    for (const m of text.matchAll(/\brole="([a-zA-Z]+)"/g)) kinds.add(m[1])
  }
  return kinds
}

describe('every kind the roster can name is really drawn by some scene', () => {
  it('leaves no kind unreachable — except the elder, whose own label stands instead', () => {
    const reachable = new Set<string>([
      // The streamed herds and the scavenging flocks (wildlifeActorSource.ts).
      ...SPECIES,
      'vulture',
      // The marked nodes: literal kinds at their call sites …
      ...markedLiterals(),
      // … the roles a scene passes to PlaceLife's Figure, whose default is the
      // plain villager …
      ...roleLiterals(),
      'villager',
      // … and the Giza plateau's crowd, whose ROLES are its kinds — taken from
      // the anchor data the scene really draws, so a role dropped from the
      // roster shows up here as an unreachable kind.
      ...GIZA_AMBIENT.map((a) => a.role),
    ])
    const unreachable = ACTOR_KINDS.filter((k) => !reachable.has(k))
    expect(unreachable).toEqual(['elder'])
  })

  it('the elder is unmarked ON PURPOSE, and the reason stands at the figure', () => {
    const villager = SOURCES.find((s) => s.path.endsWith('PlaceScene.tsx'))
    expect(villager).toBeDefined()
    expect(villager!.text).toContain('NOT marked for the §17.8 Ctrl layer')
  })

  it('marks no kind the roster does not know', () => {
    const known = new Set<string>(ACTOR_KINDS)
    for (const kind of markedLiterals()) expect(known.has(kind), `markActor kind ${kind}`).toBe(true)
  })

  // --- Named ONCE, and never the player's own boat (point 628) ---------------
  //
  // Both halves are about what the layer PROMISES, so both are asked of the
  // real call sites as well as of the rule: a flag dropped at the figure is
  // exactly how the doubling came back.

  const travelSource = () => {
    const travel = SOURCES.find((s) => s.path.endsWith('TravelScene.tsx'))
    expect(travel, 'TravelScene.tsx').toBeDefined()
    return travel!.text
  }

  it('a pitched camp offers exactly one label — the permanent one it draws itself', () => {
    const out: LabelledActor[] = []
    pushMarkedActors(node(3, 0, -4, { userData: markActor({ kind: 'camp', height: 2.2, permanentLabel: true }) }), out)
    // Still a candidate — the camp stays in the roster (point 342) …
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('camp')
    // … it is simply not named a SECOND time over the name already standing.
    expect(qualifiesAsActor(out[0])).toBe(false)
  })

  it('the travel scene really flags the camp whose name it already draws', () => {
    const text = travelSource()
    const camp = /markActor\(\{[^}]*kind: 'camp'[^}]*\}\)/.exec(text)
    expect(camp?.[0]).toContain('permanentLabel: true')
    expect(text, 'the permanent camp label the flag refers to').toContain('{t.labels.camp}')
  })

  it('the canoe the traveller rides or drags is not named at all', () => {
    for (const height of [0.9, 0.7]) {
      const out: LabelledActor[] = []
      pushMarkedActors(node(0, 0, 0, { userData: markActor({ kind: 'canoe', height, ownedByPlayer: true }) }), out)
      expect(out).toHaveLength(1)
      expect(qualifiesAsActor(out[0]), `canoe at height ${height}`).toBe(false)
    }
  })

  it('a canoe set down in the world keeps its own name', () => {
    const out: LabelledActor[] = []
    pushMarkedActors(node(2, 0, 2, { userData: markActor({ kind: 'canoe', height: 0.7 }) }), out)
    expect(out).toHaveLength(1)
    expect(qualifiesAsActor(out[0])).toBe(true)
    expect(actorLabelText(en, { kind: 'canoe' })).toBe('Canoe')
    expect(actorLabelText(de, { kind: 'canoe' })).toBe('Kanu')
  })

  it('both canoes the travel scene draws are flagged as the player\'s own', () => {
    const canoes = [...travelSource().matchAll(/markActor\(\{[^}]*kind: 'canoe'[^}]*\}\)/g)].map((m) => m[0])
    // The ridden hull and the dragged trailer — both are his.
    expect(canoes).toHaveLength(2)
    for (const canoe of canoes) expect(canoe).toContain('ownedByPlayer: true')
  })

  it('the Giza plateau really draws all six of the kinds it can name', () => {
    expect(new Set(GIZA_AMBIENT.map((a) => a.role))).toEqual(
      new Set(['guide', 'cameleer', 'donkeyboy', 'tourist', 'camel', 'donkey']),
    )
  })
})
