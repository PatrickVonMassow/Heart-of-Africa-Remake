// Localization runtime (design.md §17): German is the default game language,
// English is available, and further languages only need a new dictionary
// implementing the Strings contract. The language is switched at runtime via
// the debug menu (design.md §21).

import { create } from 'zustand'
import type { Strings } from './types'
import { de } from './de'
import { en } from './en'

export type Lang = 'de' | 'en'

export const DICTIONARIES: Record<Lang, Strings> = { de, en }
export const LANGUAGES = Object.keys(DICTIONARIES) as Lang[]

interface LocaleState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLocale = create<LocaleState>()((set) => ({
  lang: 'de',
  setLang: (lang) => set({ lang }),
}))

/** Current dictionary for non-React code (store actions, frame loops). */
export function getStrings(): Strings {
  return DICTIONARIES[useLocale.getState().lang]
}

/** Reactive dictionary for components (re-renders on language switch). */
export function useStrings(): Strings {
  return DICTIONARIES[useLocale((s) => s.lang)]
}

/**
 * Language-neutral reference to a journal text template: entries are stored
 * as key+params and rendered in the currently selected language.
 */
export interface TextRef {
  key: string
  params?: Record<string, string | number>
}

/**
 * Resolve a stored journal text. Plain strings pass through unchanged
 * (backward compatibility with checkpoints from before localization).
 */
export function resolveText(strings: Strings, ref: string | TextRef): string {
  if (typeof ref === 'string') return ref
  const node = ref.key
    .split('.')
    .reduce<unknown>((obj, k) => (obj as Record<string, unknown> | undefined)?.[k], strings)
  if (typeof node === 'function') return (node as (p: Record<string, string | number>) => string)(ref.params ?? {})
  if (typeof node === 'string') return node
  return ref.key
}

// Keep the document title and <html lang> in sync with the game language.
if (typeof document !== 'undefined') {
  const apply = (lang: Lang) => {
    document.title = DICTIONARIES[lang].overlays.title
    document.documentElement.lang = lang
  }
  apply(useLocale.getState().lang)
  useLocale.subscribe((s) => apply(s.lang))
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__setLang = (lang: Lang) =>
    useLocale.getState().setLang(lang)
}
