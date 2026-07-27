// State dump for bug reports (design.md §21.1, F6): serialises the COMPLETE
// game state to pretty-printed JSON — every data field of the useGame store
// (unlike the §18 port snapshot, which captures only the checkpoint fields),
// the full balance object (so every debug override is visible), the transient
// UI state, and a self-describing header (app/build marker + generation date).
// Pure: deterministic given a state and an injected date; store actions and
// any other function fields are stripped by the JSON replacer.

import { balance, START_YEAR } from '../config/balance'
import { regionAt, worldToLatLon, type RegionId } from '../world/geo'
import type { GameState } from './store'

/** App marker making a dump self-describing without the game files at hand. */
export const DUMP_APP = 'The Heart of Africa (POC remake)'

/**
 * The handful of fields that turn a vague report into a reproducible one: the
 * world seed plus the traveller's position, region, in-game date, pace and
 * graphics level re-stream the same scene and walk into the same animal
 * again. They all live in the full `game`/`balance` sections too — this is a
 * copy at the TOP of the dump, because a reader should not have to hunt for
 * them (user 27.07.2026, from a real bug report).
 */
export interface DumpSummary {
  seed: number
  mode: string
  placeId: string | null
  pos: { x: number; z: number }
  latLon: { lat: number; lon: number }
  region: RegionId
  /** DD.MM.YYYY, as the status bar shows it (design.md §17.1). */
  inGameDate: string
  day: number
  travelSpeed: number
  detailLevel: string
  health: number
  foodDays: number
  money: number
}

/** Environment the report was produced in — repeated verbatim in the
 *  description file, so that file alone is orientation enough. */
export interface DumpEnvironment {
  /** Vite build mode and the commit the bundle was built from. */
  build: string
  commit: string
  /** 'webgpu' or 'webgl2' — the backend the renderer actually got. */
  backend: string
  adapter: string
  language: string
  quality: string
  userAgent: string
  viewport: { width: number; height: number }
  devicePixelRatio: number
}

export interface DumpOptions {
  /** ISO date of generation; injectable for deterministic tests. */
  generatedAt?: string
  /** Transient UI store state (pass the whole store — functions are stripped). */
  ui?: unknown
  /** Environment header (design.md §21.1); omitted when unavailable. */
  env?: DumpEnvironment
  /** Graphics level for the summary, read from the UI store by the caller. */
  detailLevel?: string
}

/** DD.MM.YYYY for an in-game day count, language-neutral (design.md §17.1). */
export function inGameDate(day: number, startYear: number = START_YEAR): string {
  const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

/** The reproduction fields, lifted to the top of the dump. Pure. */
export function dumpSummary(game: GameState, detailLevel = 'unknown'): DumpSummary {
  const ll = worldToLatLon(game.pos.x, game.pos.z)
  return {
    seed: game.seed,
    mode: game.mode,
    placeId: game.placeId,
    pos: { x: game.pos.x, z: game.pos.z },
    latLon: { lat: ll.lat, lon: ll.lon },
    region: regionAt(ll.lat, ll.lon),
    inGameDate: inGameDate(game.day),
    day: game.day,
    travelSpeed: balance.travelSpeed,
    detailLevel,
    health: game.health,
    foodDays: game.foodDays,
    money: game.money,
  }
}

/** Drops function fields (store actions) so whole stores serialise cleanly. */
function dataOnly(_key: string, value: unknown): unknown {
  return typeof value === 'function' ? undefined : value
}

/**
 * The whole game state as pretty JSON. Passing `useGame.getState()` directly
 * is intended: the replacer removes the actions, everything else is plain
 * serialisable data (objects, arrays, primitives — no Maps/Sets/refs).
 */
export function dumpGameState(game: GameState, opts: DumpOptions = {}): string {
  const dump = {
    app: DUMP_APP,
    build: import.meta.env.MODE,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    // Before the bulk: what reproduces the report (see DumpSummary).
    summary: dumpSummary(game, opts.detailLevel),
    env: opts.env,
    game,
    balance,
    ui: opts.ui,
  }
  return JSON.stringify(dump, dataOnly, 2)
}

/** Download filename `hoa-state-<YYYY-MM-DD>-<seed>.json` (design.md §21.1). */
export function dumpFilename(seed: number, date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `hoa-state-${y}-${m}-${d}-${seed}.json`
}
