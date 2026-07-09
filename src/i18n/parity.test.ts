// Deep de/en parity of the game's text (CLAUDE.md mandate: every player-visible
// text exists in BOTH languages). The existing i18n.test.ts already covers the
// leaf-path/shape parity; this file goes further where a TS `Record<string,
// string>` cannot enforce anything at compile time:
//   1. Record-map key parity: the free-string maps (places, peoples, …) must
//      hold the SAME keys in de and en, with no empty values.
//   2. Coverage vs. the source registries: every id the game can reference
//      (places, peoples, equipment, treasures, events, death causes, materials,
//      regions) must resolve to a non-empty text in both languages.
//   3. Template-function callability: every function leaf must be callable in
//      both languages and behave the same (both render a non-empty string, or
//      both throw) — a one-language-only breakage fails here.
import { describe, it, expect } from 'vitest'
import { de } from './de'
import { en } from './en'
import { PLACES, REGION_VALUES } from '../world/geo'
import { EQUIPMENT_IDS, type DeathCause } from '../state/store'
import { TREASURE_IDS } from '../systems/economy'
import { EVENT_KINDS } from '../systems/events'

/** Traverse a dotted path (e.g. "overlays.deathCauses") without `any`. */
function getAtPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj)
}

// ---------------------------------------------------------------------------
// 1. Record-map key parity + non-empty values.
// ---------------------------------------------------------------------------
// These are typed `Record<string, string>` (or narrow key records), so TS does
// not require de and en to list the same keys — a value present in only one
// language would slip through. Assert the key sets match and nothing is blank.
const MAP_PATHS = [
  'places', 'peoples', 'landmarks', 'rivers', 'equipment', 'gifts',
  'treasures', 'buildings', 'sketches', 'regions', 'animals',
  'overlays.deathCauses', 'hud.movementPenalty', 'health.states',
]

describe('record-map key parity (de vs en)', () => {
  it.each(MAP_PATHS)('%s: same keys and no empty values in both languages', (path) => {
    const deMap = getAtPath(de, path) as Record<string, unknown>
    const enMap = getAtPath(en, path) as Record<string, unknown>
    expect(deMap, `de.${path} exists`).toBeTruthy()
    expect(enMap, `en.${path} exists`).toBeTruthy()
    expect(Object.keys(deMap).sort(), `${path}: key sets differ`).toEqual(
      Object.keys(enMap).sort(),
    )
    for (const [lang, map] of [['de', deMap], ['en', enMap]] as const) {
      for (const [k, v] of Object.entries(map)) {
        expect(typeof v, `${lang}.${path}.${k} is a string`).toBe('string')
        expect((v as string).length, `${lang}.${path}.${k} is non-empty`).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Coverage vs. the source registries.
// ---------------------------------------------------------------------------
// Every id the game can look up must resolve to a non-empty text in both
// languages, so no in-game reference ever renders a raw id / blank.
const VILLAGE_PEOPLE_IDS = PLACES.map((p) => p.peopleId).filter((id): id is string => !!id)
const PLACE_IDS = PLACES.map((p) => p.id)
// Materials are the treasure ids minus the statue (TreasureId = Material | 'statue').
const MATERIAL_IDS = TREASURE_IDS.filter((id) => id !== 'statue')
// RegionId has no runtime array; the region-value matrix is keyed by it.
const REGION_IDS = Object.keys(REGION_VALUES)
// DeathCause is a bare type union with no runtime list; mirror it here (the
// `DeathCause[]` annotation flags a renamed/removed cause, not a missing one).
const DEATH_CAUSES: DeathCause[] = ['starvation', 'fever', 'dehydration', 'sunblind', 'wounds', 'eaten']

// [target dict path, ids from the source registry that must resolve there].
const COVERAGE: Array<[string, string[]]> = [
  ['places', PLACE_IDS],
  ['peoples', VILLAGE_PEOPLE_IDS],
  ['equipment', EQUIPMENT_IDS],
  ['treasures', TREASURE_IDS],
  ['debug.eventNames', EVENT_KINDS],
  ['overlays.deathCauses', DEATH_CAUSES],
  ['gifts', MATERIAL_IDS],
  ['regions', REGION_IDS],
]

describe('registry coverage (every source id has a text in both languages)', () => {
  it.each(COVERAGE)('%s covers its source registry', (path, ids) => {
    const deMap = getAtPath(de, path) as Record<string, string>
    const enMap = getAtPath(en, path) as Record<string, string>
    expect(ids.length, `${path}: registry not empty`).toBeGreaterThan(0)
    for (const id of ids) {
      expect(typeof deMap[id], `de.${path}.${id}`).toBe('string')
      expect((deMap[id] ?? '').length, `de.${path}.${id} non-empty`).toBeGreaterThan(0)
      expect(typeof enMap[id], `en.${path}.${id}`).toBe('string')
      expect((enMap[id] ?? '').length, `en.${path}.${id} non-empty`).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Template-function callability in both languages.
// ---------------------------------------------------------------------------
// A generic smoke bag for the journal templates (they take a single TextParams
// object). Values are ids/numbers the templates interpolate; correctness of the
// rendered prose is out of scope here — only that both languages render text.
const bag: Record<string, string | number> = {
  region: 'north', place: 'cairo', people: 'masai', gift: 'gold', treasure: 'gold',
  material: 'gold', amount: 1, count: 1, days: 1, money: 1, from: 'cairo', to: 'zanzibar',
  lat: 25, lon: 30, result: 'light', animal: 'lions', word: 'Oz Oz', villages: '',
  landmarks: 'kilimanjaro', people2: 'masai', direction: 'north', weeks: '2',
  cause: 'wounds', percent: 50, region2: 'east',
}

// Functions that take positional args rather than the param bag, keyed by path.
const POSITIONAL: Record<string, unknown[]> = {
  formatDate: [1, 1890],
  formatLatLon: [25, 30],
  formatDecimal: [1.25],
  'status.provisionsWeeks': ['2'],
  'health.report': ['weakened', ['fever']],
  'hud.fps': [60],
  'prompts.interact': ['Trade'],
  'mapOverlay.explored': ['North', 50],
  'toasts.bought': ['Machete'],
  'toasts.discovered': ['Kilimanjaro'],
  'toasts.sold': ['Gold', 100],
  'toasts.soldForGifts': ['Machete', 2],
  'toasts.bazaarRejected': ['Silver'],
  'toasts.positionReport': ['30 N', 'North'],
  'dialogs.priceGifts': [2],
  'dialogs.gift': ['Gold'],
  'dialogs.audienceTitle': ['Masai'],
  'dialogs.audienceIntro': ['The chief regards you.'],
  'dialogs.stock': [3],
  'dialogs.bid': ['Gold', 100],
  'dialogs.passage': ['Zanzibar', 5],
  'overlays.victoryText': [100],
  'overlays.remainsReport': ['hunger', 100],
  'overlays.deadlineExpired': [100],
}

/** Collect the dotted path of every function leaf in a dictionary. */
function collectFunctionPaths(node: unknown, prefix: string, out: string[]): void {
  if (typeof node === 'function') {
    out.push(prefix)
    return
  }
  if (Array.isArray(node)) return
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectFunctionPaths(v, prefix ? `${prefix}.${k}` : k, out)
    }
  }
}

type Fn = (...args: unknown[]) => unknown

function callSafe(fn: unknown, args: unknown[]): { threw: boolean; value: unknown } {
  try {
    return { threw: false, value: (fn as Fn)(...args) }
  } catch {
    return { threw: true, value: undefined }
  }
}

const FUNCTION_PATHS: string[] = []
collectFunctionPaths(en, '', FUNCTION_PATHS)

describe('template-function callability (de and en behave alike)', () => {
  it('finds the expected number of function leaves', () => {
    // Guards the walk itself: 24 positional + 30 journal templates. A drift
    // here means a template was added/removed and this suite should follow.
    expect(FUNCTION_PATHS.length).toBe(54)
  })

  it.each(FUNCTION_PATHS)('%s: renders in both languages (or throws in both)', (path) => {
    const args = POSITIONAL[path] ?? [bag]
    const deFn = getAtPath(de, path)
    const enFn = getAtPath(en, path)
    expect(typeof deFn, `de.${path} is a function`).toBe('function')
    expect(typeof enFn, `en.${path} is a function`).toBe('function')

    const deR = callSafe(deFn, args)
    const enR = callSafe(enFn, args)

    // A one-language-only breakage: one throws while the other does not.
    expect(enR.threw, `${path}: en threw=${enR.threw}, de threw=${deR.threw}`).toBe(deR.threw)

    if (!deR.threw) {
      for (const [lang, v] of [['de', deR.value], ['en', enR.value]] as const) {
        expect(typeof v, `${lang}.${path} returns a string`).toBe('string')
        expect((v as string).length, `${lang}.${path} returns non-empty`).toBeGreaterThan(0)
      }
    }

    // Journal templates take the param bag and must always render text.
    if (path.startsWith('journal.')) {
      expect(deR.threw, `journal.${path} must render (de)`).toBe(false)
      expect(enR.threw, `journal.${path} must render (en)`).toBe(false)
    }
  })
})
