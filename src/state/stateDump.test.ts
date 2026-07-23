// F6 state dump (design.md §21.1, CLAUDE.md §7.1 pt. 20): the pure serialiser
// must return valid JSON capturing EVERY data field of the store (not just the
// §18 snapshot fields) plus the balance object and the self-describing header,
// drop every store action, and be deterministic given a state and a date.
import { describe, it, expect, beforeEach } from 'vitest'
import { dumpFilename, dumpGameState, DUMP_APP } from './stateDump'
import { useGame, type GameState } from './store'
import { balance } from '../config/balance'

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

describe('dumpFilename (design.md §21.1)', () => {
  it('names the file hoa-state-<YYYY-MM-DD>-<seed>.json with padded parts', () => {
    expect(dumpFilename(4711, new Date(2026, 6, 3))).toBe('hoa-state-2026-07-03-4711.json')
  })
})
