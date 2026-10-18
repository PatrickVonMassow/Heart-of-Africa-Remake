// The bird's-eye traveller on the villagers' figure body (work-order "Giza
// figures and traveller"): the shared Figure at villager stature, dressed in
// the European cast's khaki, never named by the Ctrl layer, with his wound
// marks, canoe kneel and swim float wired to that body.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appearanceFor } from '../../systems/appearance'
import { markActor, pushMarkedActors, type LabelledActor } from '../actorLabelSource'
import { qualifiesAsActor } from '../../systems/actorLabels'
import { TRAVELLER_LOOK } from '../../config/balance'

const scene = readFileSync(resolve(process.cwd(), 'src/scenes/travel/TravelScene.tsx'), 'utf8')
const player = scene.slice(scene.indexOf('function Player()'), scene.indexOf('export function TravelScene()'))

describe("the traveller on the villagers' figure body", () => {
  it('is drawn through the shared Figure at villager stature, with no hand-built body', () => {
    expect(player).toMatch(/<Figure\b/)
    // no scale: he stands at FIGURE_STATURE like a villager
    expect(/<Figure[^>]*\bscale=/.test(player)).toBe(false)
    expect(player).toContain("useFigureLook(null, TRAVELLER_PALETTE, 'european')")
    // The former box torso, belt and cylinder legs are gone.
    expect(player).not.toMatch(/Torso \(khaki jacket\)|Belt \*\/|<group ref=\{legs\}>/)
  })

  it('wears the European cast’s khaki suit; the sun helmet rides his crown', () => {
    const layers = appearanceFor({ peopleId: 'european', sex: 'male', age: 'adult', drivers: { coldness: 1, harmattan: 1, karif: 1 }, year: 1890, cloth: TRAVELLER_LOOK.khaki, palette: [TRAVELLER_LOOK.khaki], pick: 0.5 })
    expect(layers.map((l) => [l.form, l.colour])).toEqual([
      ['trousers', TRAVELLER_LOOK.khaki],
      ['shirt', TRAVELLER_LOOK.khaki],
    ])
    expect(player).toMatch(/headProp=\{\s*<SunHelmet/)
  })

  it('is the player: collected but never named under Ctrl', () => {
    expect(player).toMatch(/<Figure[\s\S]*?ownedByPlayer[\s\S]*?\/>/)
    const out: LabelledActor[] = []
    pushMarkedActors({ visible: true, userData: markActor({ kind: 'villager', height: 1.45, ownedByPlayer: true }), matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } }, out)
    expect(out).toHaveLength(1)
    expect(qualifiesAsActor(out[0])).toBe(false)
  })

  it('kneels in the canoe and keeps the wound marks on crown and shoulders', () => {
    expect(player).toContain('kneeling.current = canoeing')
    // the light strap and the severe strap on the helmet, the severe soak on the shoulders
    expect(player).toMatch(/<SunHelmet[\s\S]*ref=\{woundLight\}[\s\S]*ref=\{woundSevere\}[\s\S]*<\/SunHelmet>/)
    expect(player).toContain('woundShoulders.current.visible = wounds >= 2')
  })
})
