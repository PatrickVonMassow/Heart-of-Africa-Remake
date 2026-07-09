// Localization + journal voice-markup integrity (CLAUDE.md §7.1 pt. 17/19,
// design.md §15/§17). Ports the static tag scan of scripts/verify/voice.mjs and
// the text-function/placeholder coverage of scripts/verify/i18n.mjs into fast,
// deterministic checks. The rendered/screenshot and read-aloud proofs stay in
// Playwright.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { de } from './de'
import { en } from './en'
import { resolveText, getStrings, useLocale, DICTIONARIES, LANGUAGES } from './index'
import { stripVoiceMarkup } from '../journal/voiceMarkup'

const TAGS = ['awe', 'whisper', 'excited', 'somber', 'weary', 'fear', 'emph', 'mute', 'pause', 'breath']
const SPAN_TAGS = TAGS.filter((t) => t !== 'pause' && t !== 'breath')

describe('resolveText (language-neutral journal entries)', () => {
  it('resolves a plain string key', () => {
    expect(resolveText(en, { key: 'journal.titles.departure' })).toBe('Departure')
    expect(resolveText(de, { key: 'journal.titles.departure' })).toBe('Aufbruch')
  })

  it('resolves a template function with placeholder params', () => {
    const out = resolveText(en, { key: 'journal.titles.region', params: { region: 'north' } })
    expect(out).toContain(en.regions.north)
  })

  it('falls back to the key for an unknown path', () => {
    expect(resolveText(en, { key: 'journal.titles.doesNotExist' })).toBe('journal.titles.doesNotExist')
    expect(resolveText(en, { key: 'nope' })).toBe('nope')
  })
})

describe('language runtime (design.md §17)', () => {
  it('defaults to English and exposes both dictionaries', () => {
    expect(useLocale.getState().lang).toBe('en')
    expect(getStrings()).toBe(en)
    expect(LANGUAGES.sort()).toEqual(['de', 'en'])
    expect(DICTIONARIES.de).toBe(de)
  })

  it('switches the active dictionary at runtime', () => {
    try {
      useLocale.getState().setLang('de')
      expect(getStrings()).toBe(de)
    } finally {
      useLocale.getState().setLang('en')
    }
  })

  it('formats dates and decimals per locale', () => {
    expect(en.formatDate(0, 1890)).toContain('1890')
    expect(de.formatDate(0, 1890)).toContain('1890')
    expect(en.formatDecimal(1.25)).toMatch(/1[.,]\d/)
  })
})

// Collect every plain-string journal value from a dictionary (functions carry
// their markup in source and are covered by the source scan below).
function collectStrings(node: unknown, out: string[]): void {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) collectStrings(v, out)
}

describe('journal voice markup (design.md §15)', () => {
  it.each(['de', 'en'] as const)('%s.ts: only known, balanced tags and enough moods', (lang) => {
    const src = readFileSync(resolve(process.cwd(), 'src/i18n', `${lang}.ts`), 'utf8')
    const found = [...src.matchAll(/\[(\/?)([a-z]+)\]/g)]
    const unknown = found.filter((m) => !TAGS.includes(m[2]))
    expect(unknown.map((m) => m[0]), 'unknown tags').toEqual([])
    for (const tag of SPAN_TAGS) {
      const open = found.filter((m) => m[2] === tag && m[1] === '').length
      const close = found.filter((m) => m[2] === tag && m[1] === '/').length
      expect(open, `[${tag}] open/close`).toBe(close)
    }
    const moodUse = found.filter((m) => SPAN_TAGS.includes(m[2])).length
    expect(moodUse, 'span-tag moods').toBeGreaterThanOrEqual(30)
  })

  it.each(['de', 'en'] as const)('%s: stripping every journal string leaves clean prose', (lang) => {
    const strings: string[] = []
    collectStrings(DICTIONARIES[lang].journal, strings)
    for (const s of strings) {
      const stripped = stripVoiceMarkup(s)
      expect(stripped, `leftover markup in "${s.slice(0, 40)}"`).not.toMatch(/\[\/?[a-z]+\]/)
    }
  })
})
