import { describe, expect, it } from 'vitest'
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
