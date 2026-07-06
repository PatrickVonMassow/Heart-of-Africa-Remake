// Transient UI state (dialogs, interaction prompt, debug menu visibility).

import { create } from 'zustand'

export type BuildingType = 'shop' | 'weapons' | 'tools' | 'market' | 'chief'

export type Dialog =
  | { kind: 'trade'; building: BuildingType }
  | { kind: 'audience' }
  | null

interface UiState {
  dialog: Dialog
  /** Interaction prompt shown at the bottom of the screen, e.g. "E — Laden". */
  prompt: string | null
  debugOpen: boolean
  setDialog: (d: Dialog) => void
  setPrompt: (p: string | null) => void
  toggleDebug: () => void
}

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  prompt: null,
  debugOpen: false,
  setDialog: (dialog) => set({ dialog }),
  setPrompt: (prompt) => set({ prompt }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
}))
