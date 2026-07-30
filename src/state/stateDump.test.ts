// F6 state dump (design.md §21.1, CLAUDE.md §7.1 pt. 20): the pure serialiser
// must return valid JSON capturing EVERY data field of the store (not just the
// §18 snapshot fields) plus the balance object and the self-describing header,
// drop every store action, and be deterministic given a state and a date.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  dumpFilename,
  dumpGameState,
  dumpSummary,
  inGameDate,
  wildlifeReportCounts,
  DUMP_APP,
} from './stateDump'
import { useGame, type GameState } from './store'
import { balance, START_YEAR } from '../config/balance'
import { regionAt, worldToLatLon } from '../world/geo'
import {
  setWildlifeDumpSource,
  WILDLIFE_DUMP_CAP,
  WILDLIFE_DUMP_RADIUS,
  type WildlifeAnimalLike,
  type WildlifeDump,
  type WildlifeFlockLike,
  type WildlifeSource,
} from '../systems/wildlifeDump'

beforeEach(() => {
  localStorage.clear()
  useGame.getState().newGame()
  useGame.setState({ seed: 4711 })
})

describe('dumpGameState (design.md §21.1, F6)', () => {
  it('returns valid JSON capturing the key store fields', () => {
    const s = useGame.getState()
    const parsed = JSON.parse(dumpGameState(s))
    expect(parsed.app).toBe(DUMP_APP)
    expect(parsed.build).toBeTruthy()
    expect(parsed.generatedAt).toBeTruthy()
    expect(parsed.game.seed).toBe(4711)
    expect(parsed.game.mode).toBe(s.mode)
    expect(parsed.game.placeId).toBe(s.placeId)
    expect(parsed.game.day).toBe(s.day)
    expect(parsed.game.money).toBe(s.money)
    expect(parsed.game.foodDays).toBe(s.foodDays)
    expect(parsed.game.gifts).toEqual(s.gifts)
    expect(parsed.game.equipment).toEqual(s.equipment)
    expect(parsed.game.health).toBe(s.health)
    expect(parsed.game.afflictions).toEqual(s.afflictions)
    expect(parsed.game.canteenFill).toBe(s.canteenFill)
    expect(parsed.game.pos).toEqual(s.pos)
    expect(parsed.game.graveLatLon).toEqual(s.graveLatLon)
  })

  it('captures every data field of the store and drops every action', () => {
    const s = useGame.getState()
    const parsed = JSON.parse(dumpGameState(s))
    const record = s as unknown as Record<string, unknown>
    for (const key of Object.keys(s)) {
      if (typeof record[key] === 'function') {
        // Actions must not serialise (they are not data).
        expect(parsed.game).not.toHaveProperty(key)
      } else {
        // EVERY data field rides along — the whole store, no snapshot subset.
        expect(parsed.game).toHaveProperty(key)
      }
    }
  })

  it('echoes the live balance object, so debug overrides are visible', () => {
    const parsed = JSON.parse(dumpGameState(useGame.getState()))
    expect(parsed.balance.travelSpeed).toBe(balance.travelSpeed)
    expect(parsed.balance.inventoryCapacity).toBe(balance.inventoryCapacity)
    expect(parsed.balance.health.max).toBe(balance.health.max)
  })

  it('includes a passed UI state with its functions stripped', () => {
    const parsed = JSON.parse(
      dumpGameState(useGame.getState(), {
        ui: { travelZoom: 0.5, debugOpen: false, toggleDebug: () => {} },
      }),
    )
    expect(parsed.ui.travelZoom).toBe(0.5)
    expect(parsed.ui.debugOpen).toBe(false)
    expect(parsed.ui).not.toHaveProperty('toggleDebug')
  })

  it('is deterministic given a state and an injected date', () => {
    const s = useGame.getState()
    const at = '2026-07-23T00:00:00.000Z'
    const a = dumpGameState(s, { generatedAt: at })
    const b = dumpGameState(s, { generatedAt: at })
    expect(a).toBe(b)
    expect(JSON.parse(a).generatedAt).toBe(at)
  })

  it('survives a round trip: the parsed game section equals the data fields', () => {
    const s = useGame.getState()
    const parsed = JSON.parse(dumpGameState(s)) as { game: Partial<GameState> }
    const dataFields = Object.fromEntries(
      Object.entries(s).filter(([, v]) => typeof v !== 'function'),
    )
    expect(parsed.game).toEqual(JSON.parse(JSON.stringify(dataFields)))
  })
})

// What turned a vague report into a reproducible one in the field
// (user 27.07.2026): seed, position, region, in-game date, pace, graphics
// level. They must be CAPTURED and they must sit at the TOP, not be hunted
// for somewhere inside the full store.
describe('dumpSummary: the reproduction fields (design.md §21.1)', () => {
  it('carries the seed, position, region, date, travel speed and graphics level', () => {
    useGame.setState({ pos: { x: 40, z: -120 }, day: 250.5 })
    const s = useGame.getState()
    const sum = dumpSummary(s, 'high')
    const ll = worldToLatLon(s.pos.x, s.pos.z)
    expect(sum.seed).toBe(4711)
    expect(sum.pos).toEqual({ x: 40, z: -120 })
    expect(sum.latLon.lat).toBeCloseTo(ll.lat, 6)
    expect(sum.region).toBe(regionAt(ll.lat, ll.lon))
    expect(sum.inGameDate).toBe(inGameDate(250.5))
    expect(sum.day).toBe(250.5)
    expect(sum.travelSpeed).toBe(balance.travelSpeed)
    expect(sum.detailLevel).toBe('high')
    expect(sum.mode).toBe(s.mode)
  })

  it('formats the in-game date DD.MM.YYYY from the 1890 start', () => {
    expect(inGameDate(0)).toBe('01.01.1890')
    expect(inGameDate(31)).toBe('01.02.1890')
    expect(inGameDate(365)).toBe('01.01.1891')
    expect(inGameDate(0, START_YEAR)).toBe('01.01.1890')
  })

  it('sits ABOVE the bulk in the dump, ahead of game and balance', () => {
    const json = dumpGameState(useGame.getState(), { detailLevel: 'low' })
    const keys = Object.keys(JSON.parse(json))
    expect(keys.indexOf('summary')).toBeLessThan(keys.indexOf('game'))
    expect(keys.indexOf('summary')).toBeLessThan(keys.indexOf('balance'))
    expect(JSON.parse(json).summary.detailLevel).toBe('low')
  })

  it('carries the environment header when one is passed', () => {
    const env = {
      build: 'production',
      commit: 'abc1234',
      backend: 'webgl2',
      adapter: 'llvmpipe',
      language: 'de',
      quality: 'low',
      userAgent: 'test',
      viewport: { width: 800, height: 600 },
      devicePixelRatio: 1,
    }
    const parsed = JSON.parse(dumpGameState(useGame.getState(), { env }))
    expect(parsed.env).toEqual(env)
    expect(Object.keys(parsed).indexOf('env')).toBeLessThan(Object.keys(parsed).indexOf('game'))
  })
})

// The dump used to carry the complete state, balance and UI and NOT ONE animal
// (point 454) — so a wildlife report could not be decided from its own report.
// The section is BOUNDED (radius + cap, both named in the file) and
// DETERMINISTIC like the rest of the serialiser.
describe('the wildlife section (point 454)', () => {
  afterEach(() => setWildlifeDumpSource(null))

  const at = '2026-07-30T00:00:00.000Z'

  function beast(o: Partial<WildlifeAnimalLike> & { x: number; z: number }): WildlifeAnimalLike {
    return o
  }
  function source(over: Partial<WildlifeSource> = {}): WildlifeSource {
    return { herds: {}, flocks: [], hunt: null, ...over }
  }
  /** The section as the dump ships it. */
  function section(src: WildlifeSource | null): WildlifeDump {
    if (src) setWildlifeDumpSource(() => src)
    useGame.setState({ pos: { x: 0, z: 0 } })
    return (JSON.parse(dumpGameState(useGame.getState(), { generatedAt: at })) as {
      wildlife: WildlifeDump
    }).wildlife
  }

  it('names its radius and its cap in the file, and drops what lies beyond', () => {
    const w = section(
      source({
        herds: {
          zebra: [beast({ x: 10, z: 0 }), beast({ x: WILDLIFE_DUMP_RADIUS + 20, z: 0 })],
        },
      }),
    )
    expect(w.active).toBe(true)
    expect(w.bounds.radius).toBe(WILDLIFE_DUMP_RADIUS)
    expect(w.bounds.capPerList).toBe(WILDLIFE_DUMP_CAP)
    expect(w.bounds.origin).toEqual({ x: 0, z: 0 })
    expect(w.bounds.note).toContain(String(WILDLIFE_DUMP_RADIUS))
    expect(w.bounds.note).toContain(String(WILDLIFE_DUMP_CAP))
    // Streamed counts state what the RADIUS cut, not only what is listed.
    expect(w.counts.animalsStreamed).toBe(2)
    expect(w.counts.animalsInRadius).toBe(1)
    expect(w.animals).toHaveLength(1)
    expect(w.animals[0].species).toBe('zebra')
    expect(w.animals[0].dist).toBe(10)
  })

  it('carries species, position, state and target per animal', () => {
    const calf = beast({ x: 4, z: 3, y: 1.2, young: true, herd: 7, drink: { tx: 12, tz: -4 } })
    const parent = beast({ x: 5, z: 3, herd: 7, child: calf })
    calf.parent = parent
    const w = section(source({ herds: { zebra: [parent, calf] } }))
    const young = w.animals.find((a) => a.young)
    expect(young).toBeDefined()
    expect(young?.species).toBe('zebra')
    expect(young).toMatchObject({ x: 4, z: 3, y: 1.2, dist: 5, herd: 7, state: 'drinking' })
    expect(young?.target).toEqual({ kind: 'drink', x: 12, z: -4 })
    // Herd membership travels as POSITIONS — an object reference would make
    // the parent/child pair a JSON cycle.
    expect(young?.parentAt).toEqual({ x: 5, z: 3 })
    expect(w.animals.find((a) => !a.young)?.childAt).toEqual({ x: 4, z: 3 })
  })

  it('reports a fed carcass with its remaining seconds and who feeds on it', () => {
    const carcass = beast({ x: 6, z: 0, dead: true, dissolve: 42.5 })
    const lionKill = beast({ x: 0, z: 8, dead: true, dissolve: 11, lionFed: true })
    const flock: WildlifeFlockLike = { mode: 'active', x: 6, z: 1, y: 0.4, landed: true, target: carcass }
    const w = section(
      source({
        herds: { zebra: [carcass], wildebeest: [lionKill] },
        flocks: [flock],
        hunt: {
          mode: 'feed',
          lx: 1,
          lz: 8,
          px: 0,
          pz: 8,
          predator: 'hyena',
          prey: 'wildebeest',
          victim: lionKill,
          victimHunt: true,
        },
      }),
    )
    expect(w.counts.carcassesInRadius).toBe(2)
    const scavenged = w.carcasses.find((c) => c.species === 'zebra')
    expect(scavenged?.dissolveSeconds).toBe(42.5)
    expect(scavenged?.feeders).toEqual([{ kind: 'vultureFlock', flock: 0, landed: true }])
    const eaten = w.carcasses.find((c) => c.species === 'wildebeest')
    expect(eaten?.lionFed).toBe(true)
    expect(eaten?.dissolveSeconds).toBe(11)
    expect(eaten?.feeders).toEqual([{ kind: 'predator', species: 'hyena', mode: 'feed' }])
    // The hunt names its victim by the same id the carcass list uses.
    expect(w.hunt?.victim).toBe(eaten?.id)
    expect(w.hunt).toMatchObject({ mode: 'feed', predator: 'hyena', prey: 'wildebeest' })
    // A carcass never appears among the living.
    expect(w.animals).toHaveLength(0)
  })

  it('binds each vulture flock to the carcass it owns', () => {
    const carcass = beast({ x: -9, z: 0, dead: true, dissolve: 30 })
    const w = section(
      source({
        herds: { antelope: [carcass] },
        flocks: [
          { mode: 'in', x: -30, z: 0, y: 14, landed: false, target: carcass },
          { mode: 'idle', x: 0, z: 0, y: 14, landed: false, target: null },
        ],
      }),
    )
    expect(w.counts.flocks).toBe(2)
    expect(w.flocks[0]).toMatchObject({ index: 0, mode: 'in', landed: false })
    expect(w.flocks[0].carcass).toEqual({
      id: w.carcasses[0].id,
      species: 'antelope',
      x: -9,
      z: 0,
    })
    expect(w.flocks[1].carcass).toBeNull()
  })

  it('holds the cap and says how many entries it left out — nearest first', () => {
    const many = Array.from({ length: WILDLIFE_DUMP_CAP + 25 }, (_, i) =>
      beast({ x: WILDLIFE_DUMP_RADIUS - i * 0.5, z: 0 }),
    )
    const w = section(source({ herds: { wildebeest: many } }))
    expect(w.counts.animalsInRadius).toBe(WILDLIFE_DUMP_CAP + 25)
    expect(w.animals).toHaveLength(WILDLIFE_DUMP_CAP)
    expect(w.counts.animalsListed).toBe(WILDLIFE_DUMP_CAP)
    expect(w.counts.animalsOmitted).toBe(25)
    // Nearest first, so the cap cuts off the far ones, not the ones at hand:
    // the list runs ascending and ends short of the farthest streamed animal.
    const dists = w.animals.map((a) => a.dist)
    expect(dists).toEqual([...dists].sort((a, b) => a - b))
    expect(dists[0]).toBe(WILDLIFE_DUMP_RADIUS - (WILDLIFE_DUMP_CAP + 24) * 0.5)
    expect(dists[dists.length - 1]).toBeLessThan(WILDLIFE_DUMP_RADIUS)
  })

  it('is deterministic: a reshuffled herd array dumps identically', () => {
    const herd = [
      beast({ x: 3, z: 0 }),
      beast({ x: 1, z: 0, dead: true, dissolve: 5 }),
      beast({ x: 2, z: 0 }),
      beast({ x: 9, z: 0 }),
    ]
    const first = JSON.stringify(section(source({ herds: { zebra: herd } })))
    const repeat = JSON.stringify(section(source({ herds: { zebra: herd } })))
    expect(repeat).toBe(first)
    // A hunt, a cull or a re-home reorders the herd arrays in place; the
    // section must not follow that iteration order.
    const shuffled = [herd[3], herd[1], herd[0], herd[2]]
    expect(JSON.stringify(section(source({ herds: { zebra: shuffled } })))).toBe(first)
    // Two whole dumps of one state are byte-identical, wildlife included.
    setWildlifeDumpSource(() => source({ herds: { zebra: herd } }))
    const s = useGame.getState()
    expect(dumpGameState(s, { generatedAt: at })).toBe(dumpGameState(s, { generatedAt: at }))
  })

  it('stays empty and inactive where no travel scene is mounted', () => {
    const w = section(null)
    expect(w.active).toBe(false)
    expect(w.animals).toEqual([])
    expect(w.carcasses).toEqual([])
    expect(w.flocks).toEqual([])
    expect(w.bounds.radius).toBe(WILDLIFE_DUMP_RADIUS)
  })

  it('still produces the report when the wildlife source throws', () => {
    setWildlifeDumpSource(() => {
      throw new Error('herds gone')
    })
    const w = section(null)
    expect(w.error).toBe('herds gone')
    expect(w.active).toBe(false)
    expect(w.animals).toEqual([])
  })

  it('hands the description file the counts the JSON actually holds', () => {
    setWildlifeDumpSource(() =>
      source({
        herds: { zebra: [beast({ x: 2, z: 0 }), beast({ x: 3, z: 0, dead: true, dissolve: 4 })] },
        flocks: [{ mode: 'idle', x: 0, z: 0, y: 14, landed: false, target: null }],
      }),
    )
    useGame.setState({ pos: { x: 0, z: 0 } })
    const json = dumpGameState(useGame.getState(), { generatedAt: at })
    expect(wildlifeReportCounts(json)).toEqual({
      radius: WILDLIFE_DUMP_RADIUS,
      cap: WILDLIFE_DUMP_CAP,
      animals: 1,
      carcasses: 1,
      flocks: 1,
    })
    expect(wildlifeReportCounts('{"summary":{}}')).toBeNull()
    expect(wildlifeReportCounts('not json')).toBeNull()
  })
})

describe('dumpFilename (design.md §21.1)', () => {
  it('names the file hoa-state-<YYYY-MM-DD>-<seed>.json with padded parts', () => {
    expect(dumpFilename(4711, new Date(2026, 6, 3))).toBe('hoa-state-2026-07-03-4711.json')
  })
})
