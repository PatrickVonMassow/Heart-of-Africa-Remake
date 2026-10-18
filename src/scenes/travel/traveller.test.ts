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
import { FIGURE_STATURE } from '../../render/figureBody'
import { CANOE_HULL_CLEARANCE, CANOE_SEAT_DROP, travellerPose } from './travellerPose'

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

  it('kneels in the canoe on water, stands again on land, and drags it there', () => {
    const at = { wounds: 0, surfaceY: 1.4, refY: 0.6, bobTime: 0 }
    const riding = travellerPose({ ...at, hasCanoe: true, onWater: true })
    expect(riding).toMatchObject({ canoeing: true, carrying: false, swimming: false, kneeling: true })
    // seated on the hull floor: the boat rides the surface, the body just under it
    expect(riding.boatY).toBeCloseTo(at.surfaceY - at.refY + CANOE_HULL_CLEARANCE, 6)
    expect(riding.figureY).toBeCloseTo(riding.boatY - CANOE_SEAT_DROP, 6)
    const ashore = travellerPose({ ...at, surfaceY: 0, hasCanoe: true, onWater: false })
    expect(ashore).toMatchObject({ canoeing: false, carrying: true, swimming: false, kneeling: false, figureY: 0 })
    const walking = travellerPose({ ...at, surfaceY: 0, hasCanoe: false, onWater: false })
    expect(walking).toMatchObject({ canoeing: false, carrying: false, kneeling: false, figureY: 0 })
  })

  it('swims without a canoe: hip-deep under the surface, never on the bed, never kneeling', () => {
    const surfaceY = 2.0
    const refY = 0.4 // the bed far below the sheet, as on Lake Edward
    // the hip joint of the villager-stature body (render/figureBody.ts)
    const hipOverFeet = FIGURE_STATURE * 0.52
    for (const bobTime of [0, 0.37, 0.75, 1.5, 3.1]) {
      const p = travellerPose({ hasCanoe: false, onWater: true, wounds: 0, surfaceY, refY, bobTime })
      expect(p).toMatchObject({ swimming: true, canoeing: false, kneeling: false })
      const feet = refY + p.figureY
      expect(surfaceY - feet).toBeGreaterThan(0.5) // legs under the water
      expect(Math.abs(feet + hipOverFeet - surfaceY)).toBeLessThan(0.15) // the hips at the surface
      expect(feet + FIGURE_STATURE - surfaceY).toBeGreaterThan(0.5) // head and shoulders clear
      expect(feet - refY).toBeGreaterThan(0.5) // floating, not walking the bed
    }
  })

  it('shows the wound marks by severity: none, light on the crown, severe on crown and shoulders', () => {
    const at = { hasCanoe: false, onWater: false, surfaceY: 0, refY: 0, bobTime: 0 }
    const marks = (wounds: number) => {
      const p = travellerPose({ ...at, wounds })
      return [p.woundLight, p.woundSevere, p.woundShoulders]
    }
    expect(marks(0)).toEqual([false, false, false])
    expect(marks(1)).toEqual([true, false, false])
    expect(marks(2)).toEqual([true, true, true])
    // the marks ride the kneeling body in the canoe just the same
    expect(travellerPose({ ...at, onWater: true, hasCanoe: true, wounds: 2 })).toMatchObject({ kneeling: true, woundSevere: true })
  })

  it('the drawn traveller takes his pose from travellerPose', () => {
    expect(player).toContain('travellerPose({')
    expect(player).toContain('kneeling.current = pose.kneeling')
    expect(player).toMatch(/<SunHelmet[\s\S]*ref=\{woundLight\}[\s\S]*ref=\{woundSevere\}[\s\S]*<\/SunHelmet>/)
  })
})
