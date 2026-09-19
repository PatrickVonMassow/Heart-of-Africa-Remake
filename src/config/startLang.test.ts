import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_PARAM, startLangFromUrl } from './startLang'
import { startPlaceFromUrl } from './startPlace'
import { LANGUAGES } from '../i18n'

describe('startLangFromUrl', () => {
  it.each(LANGUAGES)('accepts the supported language %s', (lang) => {
    expect(startLangFromUrl(`?${LANG_PARAM}=${lang}`)).toBe(lang)
  })

  it.each(['', '?bench=1', '?lang=', '?lang=fr', '?lang=DE', '?lang=En', '?lang=%20de%20'])(
    'returns null for an absent or invalid language in %s', (search) => {
      expect(startLangFromUrl(search)).toBeNull()
    },
  )

  it.each([
    '?start=bambara-village&lang=de',
    '?bench=1&lang=de&start=bambara-village&seed=7',
  ])('combines with the start place and other parameters in %s', (search) => {
    expect(startLangFromUrl(search)).toBe('de')
    expect(startPlaceFromUrl(search)).toBe('bambara-village')
  })
})

describe('URL-selected initial locale', () => {
  const originalUrl = window.location.href
  const originalTitle = document.title
  const originalLang = document.documentElement.lang

  beforeEach(() => {
    vi.resetModules()
    // The deployed build must honor the parameter without the dev hook.
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    window.history.replaceState(null, '', originalUrl)
    document.title = originalTitle
    document.documentElement.lang = originalLang
    vi.resetModules()
  })

  it.each(LANGUAGES)('initializes the store and document in %s', async (lang) => {
    window.history.replaceState(null, '', `?lang=${lang}`)
    const { useLocale, getStrings, DICTIONARIES } = await import('../i18n')
    expect(useLocale.getInitialState().lang).toBe(lang)
    expect(getStrings()).toBe(DICTIONARIES[lang])
    expect(document.documentElement.lang).toBe(lang)
    expect(document.title).toBe(DICTIONARIES[lang].overlays.title)
  })

  it.each(['', '?bench=1', '?lang=', '?lang=fr', '?lang=DE', '?lang=En'])(
    'initializes in English for an absent or invalid language in %s', async (search) => {
      window.history.replaceState(null, '', `/${search}`)
      const { useLocale } = await import('../i18n')
      expect(useLocale.getInitialState().lang).toBe('en')
    },
  )

  it('reads the URL once and allows the runtime switch to override it', async () => {
    window.history.replaceState(null, '', '?lang=de')
    const { useLocale, getStrings, DICTIONARIES } = await import('../i18n')
    window.history.replaceState(null, '', '?lang=en')
    expect(useLocale.getState().lang).toBe('de')
    window.history.replaceState(null, '', '?lang=de')
    useLocale.getState().setLang('en')
    expect(useLocale.getState().lang).toBe('en')
    expect(getStrings()).toBe(DICTIONARIES.en)
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe(DICTIONARIES.en.overlays.title)
  })

  it('initializes both stores at the Bambara village in German', async () => {
    window.history.replaceState(null, '', '?start=bambara-village&lang=de')
    const { useGame } = await import('../state/store')
    const { useLocale, getStrings, DICTIONARIES } = await import('../i18n')
    expect(useGame.getInitialState().placeId).toBe('bambara-village')
    expect(useLocale.getInitialState().lang).toBe('de')
    expect(getStrings()).toBe(DICTIONARIES.de)
  })

  it('imports without a window or document and defaults to English', async () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    const { useLocale } = await import('../i18n')
    expect(useLocale.getInitialState().lang).toBe('en')
  })
})
