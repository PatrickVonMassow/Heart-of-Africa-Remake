// The rinderpest years as the date-dependent state they were (design.md §16/
// §19.13, point 133; research: docs/peoples-1890.md §5). The great African
// panzootic 1888-1897 IS the game's window: Maasailand enters 1890 already
// damaged by the 1883-87 bovine pleuropneumonia and is struck by rinderpest in
// 1891 (Kedong valley, March); Ethiopia sits inside the Kifu Qen famine
// 1888-92; the Sudan is one year past Sanat Sitta (1889-90) with its herds
// gone; southern Africa stays clean until the disease crosses the Zambezi
// (Bulawayo, 3 March 1896) and reaches the Zulu, Pedi and San inside a long
// playthrough. Camel peoples (Somali, Tuareg) are never struck — camels are
// immune (FAO) — and the Bemba kept no cattle at all (tsetse belt), so for
// them the plague is game depletion, a texture, not a phase.

/** Per-people plague state at a given in-game date. */
export type RinderpestPhase = 'clean' | 'preDamaged' | 'struck' | 'aftermath'

/** Peoples whose herds are camel-based — never infected, never a phase. */
const CAMEL_PEOPLES = ['somali', 'tuareg']

/** Southern peoples the plague reaches only with the Zambezi crossing of
 *  March 1896 (Bulawayo 3 March) — clean for almost the whole window. */
const SOUTHERN_PEOPLES = ['zulu', 'pedi', 'san']

/**
 * The plague phase for a people at an in-game date (month 1..12). Pure — the
 * single source for vignette choice, carrion dressing and the dev hook.
 */
export function rinderpestPhase(peopleId: string, year: number, month: number): RinderpestPhase {
  if (CAMEL_PEOPLES.includes(peopleId)) return 'clean'
  if (SOUTHERN_PEOPLES.includes(peopleId)) {
    // Clean until the Zambezi crossing; struck from March 1896. The shipped
    // calendar clamps at 31.12.1895, so this fires only if the window is
    // ever extended — modelled anyway, per the point-133 date table.
    if (year > 1896 || (year === 1896 && month >= 3)) return 'struck'
    return 'clean'
  }
  switch (peopleId) {
    case 'maasai':
      // 1890: damaged by the 1883-87 pleuropneumonia, rinderpest not yet
      // arrived. 1891-92: the emutai stack (rinderpest 1891, smallpox 1892 —
      // Baumann stood in it in March 1892). 1893+: famine aftermath.
      if (year <= 1890) return 'preDamaged'
      if (year <= 1892) return 'struck'
      return 'aftermath'
    case 'sidama':
      // The Kifu Qen ("Evil Days") famine 1888-92: the game starts inside
      // the catastrophe; from 1893 the land is in its aftermath.
      if (year <= 1892) return 'struck'
      return 'aftermath'
    case 'nubians':
      // Sanat Sitta (1889-90) took the herds before the game begins: the
      // traveller stands in the famine's wake for the whole window.
      return 'aftermath'
    default:
      return 'clean'
  }
}

/** Radius (degrees) around the Maasai village within which the struck years
 *  strew the plague's wildlife toll across the plains. */
export const CARRION_RADIUS_DEG = 2.5

/**
 * Whether rinderpest carrion dresses a spot (point 133 stage 3): only while
 * Maasailand is STRUCK, and only within its radius — Baumann recorded the
 * plague striking "nicht nur Rinder, sondern auch Büffel, Gnus und
 * Antilopen". Pure over phase and distance.
 */
export function rinderpestCarrionActive(phase: RinderpestPhase, distDeg: number, radiusDeg: number = CARRION_RADIUS_DEG): boolean {
  return phase === 'struck' && distDeg <= radiusDeg
}

/** The phase at an in-game day (the store's calendar unit): thin date glue
 *  over the pure year/month rule. */
export function rinderpestPhaseAtDay(peopleId: string, day: number, startYear: number): RinderpestPhase {
  const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
  return rinderpestPhase(peopleId, d.getUTCFullYear(), d.getUTCMonth() + 1)
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__rinderpest = { rinderpestPhase, rinderpestPhaseAtDay }
}
