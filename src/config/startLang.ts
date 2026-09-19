// A start language chosen from the URL for one load.
// design.md §17 keeps English as the default; only an explicit `?lang=<lang>`
// selects another language. This works in PRODUCTION, like `?start` and `?bench`,
// unlike the DEV-only `?seed`, so deployed pages can be tested in German.
// Pure: no store, no window. The caller passes the search string.

import { LANGUAGES, type Lang } from '../i18n/dictionaries'

export const LANG_PARAM = 'lang'

/** A supported language, or null so a mistyped link opens the ordinary game. */
export function startLangFromUrl(search: string): Lang | null {
  const value = new URLSearchParams(search).get(LANG_PARAM)
  return LANGUAGES.find((lang) => lang === value) ?? null
}
