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
import { CULTURAL_LANDMARKS, NATURAL_SITES } from '../world/data/landmarks'

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

// Shape of a dictionary node at each leaf path (string/function/array/number).
function shapePaths(node: unknown, prefix: string, out: Map<string, string>): void {
  if (Array.isArray(node)) out.set(prefix, 'array')
  else if (typeof node === 'function') out.set(prefix, 'function')
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) shapePaths(v, prefix ? `${prefix}.${k}` : k, out)
  } else out.set(prefix, typeof node)
}

describe('language parity (design.md §17: further languages only need a new file)', () => {
  it('de and en expose the exact same keys with the same shapes', () => {
    const dep = new Map<string, string>()
    const enp = new Map<string, string>()
    shapePaths(de, '', dep)
    shapePaths(en, '', enp)
    const deKeys = [...dep.keys()].sort()
    const enKeys = [...enp.keys()].sort()
    expect(deKeys, 'de vs en key set').toEqual(enKeys)
    for (const k of deKeys) expect(enp.get(k), `shape of ${k}`).toBe(dep.get(k))
  })

  it('has twelve month names in both languages', () => {
    expect(de.months).toHaveLength(12)
    expect(en.months).toHaveLength(12)
  })
})

describe('format functions (design.md §17)', () => {
  it('formatDate names the month and year and advances across the year', () => {
    const jan = en.formatDate(0, 1890)
    const dec = en.formatDate(360, 1890)
    expect(jan).toContain('1890')
    expect(jan).toContain(en.months[0])
    expect(dec).toContain(en.months[11])
    expect(de.formatDate(0, 1890)).toContain(de.months[0])
  })

  it('formatLatLon and formatDecimal produce localized strings', () => {
    expect(en.formatLatLon(30.05, 31.45)).toMatch(/30/)
    expect(en.formatLatLon(-6.16, 39.3)).toMatch(/6/)
    expect(en.formatDecimal(1.25)).toMatch(/1[.,]\d/)
    expect(de.formatDecimal(1.25)).toMatch(/1[.,]\d/)
  })

  it('provisionsWeeks weaves the passed value into both languages', () => {
    expect(en.status.provisionsWeeks('5')).toContain('5')
    expect(de.status.provisionsWeeks('5')).toContain('5')
  })
})

describe('cultural and natural landmarks i18n coverage (design.md §4.4)', () => {
  for (const lang of [en, de]) {
    describe(lang.lang, () => {
      it.each([...CULTURAL_LANDMARKS, ...NATURAL_SITES])('$id has a localized name and a dedicated discovery flavor', (c) => {
        const name = lang.landmarks[c.id]
        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
        // A dedicated flavor case exists for this kind (not the mountain fallback).
        const flavored = lang.journal.landmarkDiscovered({ landmark: c.id, kind: c.kind })
        const fallback = lang.journal.landmarkDiscovered({ landmark: c.id, kind: 'mountain' })
        expect(flavored).not.toBe(fallback)
        expect(flavored).toContain(name)
      })
    })
  }
})
