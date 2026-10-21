// DEV-ONLY: the forced figures of the dress lineup (dressLineup.tsx) — an
// explicit outfit, build and clip per figure, for the garment pictures of the
// garment rebuild (docs/garment-merge-r9-1347.md, "Picture acceptance").
// Pure, so the outfit resolution is unit-tested.

import { CAST_DRESS, LAYER_SLOTS, PEOPLE_DRESS, type AgeGroup, type DressLayer, type DressWear, type LayerForm, type Sex } from '../../systems/appearance'

/** A garment as `appearanceFor` names it: its form and how it is worn. */
export interface LineupGarment {
  form: LayerForm
  wear: DressWear
}

export type LineupClip = 'idle' | 'walk' | 'run' | 'dig'

/**
 * Where the clip is held when the lineup freezes life: a phase of the clip in
 * [0, 1), a frame of its keys (`{ frame }`), or a walk's leg crossing, the
 * middle of that foot's swing (`cross-L`, `cross-R`).
 */
export type LineupAt = number | { frame: number } | 'cross-L' | 'cross-R'

/** One forced figure of the lineup. */
export interface LineupFigure {
  sex: Sex
  age: AgeGroup
  /** −1 slight .. +1 stout (the generated figures use −0.6, 0, +0.6). */
  build?: number
  /** The whole outfit, as `{form, wear}` or `'form-wear'`; absent: the people's own dress. */
  garments?: ReadonlyArray<LineupGarment | string>
  clip?: LineupClip
  at?: LineupAt
  /** Head turned off the heading (rad, + to the figure's left), standing only. */
  headYaw?: number
}

/** Ground speed of each clip in figure units per second (scaled by the figure's
 *  own scale): the walk under the jog band, the run inside the jog
 *  (VILLAGER_GLTF.jogThreshold 1.8 ± 0.35 per unit of leg). */
export const LINEUP_CLIP_SPEED: Record<LineupClip, number> = { idle: 0, walk: 1.2, run: 3.0, dig: 0 }

/** `'trousers-waist'` → `{form: 'trousers', wear: 'waist'}`. */
export function parseGarment(g: LineupGarment | string): LineupGarment {
  if (typeof g !== 'string') return g
  const cut = g.indexOf('-')
  if (cut <= 0) throw new Error(`dress lineup: garment '${g}' is not 'form-wear'`)
  return { form: g.slice(0, cut) as LayerForm, wear: g.slice(cut + 1) as DressWear }
}

/**
 * The dress layers of a forced outfit: each (form, wear) takes its material,
 * colour and pattern from the first figure of the record wearing it — this
 * settlement's people first, then the whole table in its order — with the
 * 'cloth' token resolved to the figure's cloth, in slot order as
 * `appearanceFor` returns them. A pair nobody wears throws: it has no garment.
 */
export function resolveOutfit(garments: ReadonlyArray<LineupGarment | string>, peopleId: string | null, cloth: string): DressLayer[] {
  const tables = [
    ...(peopleId ? [PEOPLE_DRESS[peopleId] ?? CAST_DRESS[peopleId as keyof typeof CAST_DRESS]].filter(Boolean) : []),
    ...Object.values(PEOPLE_DRESS),
    ...Object.values(CAST_DRESS),
  ]
  const out = garments.map((raw) => {
    const g = parseGarment(raw)
    for (const t of tables)
      for (const sex of ['female', 'male'] as const)
        for (const age of ['adult', 'youth', 'elder', 'child'] as const) {
          const hit = t[sex][age].find((l) => l.form === g.form && l.wear === g.wear)
          if (hit) return { ...hit, colour: hit.colour === 'cloth' ? cloth : hit.colour }
        }
    throw new Error(`dress lineup: no garment ${g.form}-${g.wear} in the dress record`)
  })
  return out.sort((a, b) => LAYER_SLOTS.indexOf(a.slot) - LAYER_SLOTS.indexOf(b.slot))
}

/** The middle of a foot's swing, from its stance [lands, lifts) (lift may lie past 1). */
export function midSwing(stance: readonly [number, number]): number {
  const [on, off] = stance
  const mid = (off + on + 1) / 2
  return ((mid % 1) + 1) % 1
}

/** Whether a looping phase passed `target` going from `prev` to `now` (forward, under one loop). */
export function crossedPhase(prev: number, now: number, target: number): boolean {
  const span = (((now - prev) % 1) + 1) % 1
  const to = (((target - prev) % 1) + 1) % 1
  return span > 0 && to > 0 && to <= span
}
