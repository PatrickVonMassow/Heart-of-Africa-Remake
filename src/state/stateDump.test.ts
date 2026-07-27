// F6 state dump (design.md §21.1, CLAUDE.md §7.1 pt. 20): the pure serialiser
// must return valid JSON capturing EVERY data field of the store (not just the
// §18 snapshot fields) plus the balance object and the self-describing header,
// drop every store action, and be deterministic given a state and a date.
import { describe, it, expect, beforeEach } from 'vitest'
import { dumpFilename, dumpGameState, dumpSummary, inGameDate, DUMP_APP } from './stateDump'
import { useGame, type GameState } from './store'
import { balance, START_YEAR } from '../config/balance'
import { regionAt, worldToLatLon } from '../world/geo'

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

describe('dumpFilename (design.md §21.1)', () => {
  it('names the file hoa-state-<YYYY-MM-DD>-<seed>.json with padded parts', () => {
    expect(dumpFilename(4711, new Date(2026, 6, 3))).toBe('hoa-state-2026-07-03-4711.json')
  })
})
