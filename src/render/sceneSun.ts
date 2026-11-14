// The ONE sun of both scenes (design.md §2.7): travel reads the traveller's
// latitude, a settlement its own; both read the in-game date and
// `balance.sun.hour`. The sky dome, the directional light with its shadow
// camera, and the baked environment light all take their direction from here,
// re-derived only when the (quantized) latitude, the day or the balance changes
// — never per frame.

import { useMemo } from 'react'
import { balance, START_YEAR } from '../config/balance'
import { useGame } from '../state/store'
import { dayOfYear } from '../systems/season'
import { sunAngles, sunWorldDirection, type SunAngles } from '../systems/sunPosition'
import { placeById } from '../world/geo'

/** Latitude step the travel sun follows: 0.25° (~28 km) is far below any
 *  visible change and keeps re-derivations rare while driving. */
const LAT_STEP = 0.25
/** Hard floor for the LIGHT (degrees): a debug hour past sunset must not light
 *  the land from below. Never binds at the default hour (min ~6.7°). */
const LIGHT_FLOOR_DEG = 2

export interface SceneSun {
  lat: number
  dayOfYear: number
  angles: SunAngles
  /** Toward the visible sun: sky disc and environment light. */
  disc: [number, number, number]
  /** Toward the shadow-casting light (disc azimuth, elevation floored). */
  light: [number, number, number]
}

export function deriveSceneSun(lat: number, day: number): SceneSun {
  const doy = Math.floor(dayOfYear(Math.floor(day), START_YEAR))
  const hour = balance.sun.hour
  const floor = Math.max(LIGHT_FLOOR_DEG, balance.sun.shadowMinElevationDeg)
  return {
    lat,
    dayOfYear: doy,
    angles: sunAngles(lat, doy, hour),
    disc: sunWorldDirection(lat, doy, hour),
    light: sunWorldDirection(lat, doy, hour, floor),
  }
}

/** Latitude the current scene's sun stands at: the settlement's own, else the traveller's. */
export function sceneSunLatitude(s: { placeId: string | null; mode: string; pos: { z: number } }): number {
  if (s.mode === 'place' && s.placeId) return placeById(s.placeId).lat
  return Math.round(-s.pos.z / 10 / LAT_STEP) * LAT_STEP
}

let current: SceneSun | null = null
/** The last derived sun, for debug readouts outside React. */
export function currentSceneSun(): SceneSun | null {
  return current
}

export function useSceneSun(): SceneSun {
  const lat = useGame(sceneSunLatitude)
  const day = useGame((s) => Math.floor(s.day))
  const rev = useGame((s) => s.balanceVersion)
  return useMemo(() => {
    current = deriveSceneSun(lat, day)
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sceneSun = current
    return current
    // rev: a debug edit of balance.sun re-derives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, day, rev])
}
