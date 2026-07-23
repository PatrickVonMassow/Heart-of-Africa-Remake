// State dump for bug reports (design.md §21.1, F6): serialises the COMPLETE
// game state to pretty-printed JSON — every data field of the useGame store
// (unlike the §18 port snapshot, which captures only the checkpoint fields),
// the full balance object (so every debug override is visible), the transient
// UI state, and a self-describing header (app/build marker + generation date).
// Pure: deterministic given a state and an injected date; store actions and
// any other function fields are stripped by the JSON replacer.

import { balance } from '../config/balance'
import type { GameState } from './store'

/** App marker making a dump self-describing without the game files at hand. */
export const DUMP_APP = 'The Heart of Africa (POC remake)'

export interface DumpOptions {
  /** ISO date of generation; injectable for deterministic tests. */
  generatedAt?: string
  /** Transient UI store state (pass the whole store — functions are stripped). */
  ui?: unknown
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
