// Only Bambara's door records the chief's walk; the drums carry his message (§13.4).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PLACES } from '../world/geo'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, useGame } from '../test/store'
import { DICTIONARIES, resolveText, useLocale } from '../i18n'
import { stripVoiceMarkup } from '../journal/voiceMarkup'
import { chiefWalkState, resetChiefWalk } from '../scenes/place/chiefPresence'
import { DRUM_MESSAGE_VILLAGE } from './store'

withWorld()
beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false
})
afterEach(() => {
  balance.randomEventsEnabled = true
  useLocale.getState().setLang('en')
})

const REGIONS = ['north', 'west', 'central', 'east', 'south'] as const

describe('knowing people (design.md §13.3)', () => {
  it('keeps exactly one knowing village within each region', () => {
    expect(Object.keys(g().knowingVillages).sort()).toEqual([...REGIONS].sort())
    for (const region of REGIONS) {
      expect(PLACES.find((p) => p.id === g().knowingVillages[region])?.region).toBe(region)
    }
  })
})

describe('the first door press', () => {
  it.each(['en', 'de'] as const)('%s: writes the walk entry only in Bambara', (lang) => {
    useLocale.getState().setLang(lang)
    for (const village of PLACES.filter((p) => p.kind === 'village')) {
      g().enterPlace(village.id)
      const before = g().journal.length
      g().callChiefOut()
      const added = g().journal.slice(before)
      expect(g().orientationGiven[village.id]).toBe(true)
      if (village.id !== DRUM_MESSAGE_VILLAGE) {
        expect(added, village.id).toHaveLength(0)
        expect(g().toast).toBe(DICTIONARIES[lang].toasts.chiefNoMessage)
        expect(chiefWalkState().phase).toBe('in-hut')
        g().leavePlace()
        continue
      }
      expect(added, village.id).toHaveLength(1)
      expect(added[0]).toMatchObject({
        title: { key: 'journal.titles.chiefWalk' },
        text: { key: 'journal.chiefWalk' },
        kind: 'event',
      })
      expect(added[0].text.params).toBeUndefined()
      const text = resolveText(DICTIONARIES[lang], added[0].text)
      expect(text).toBe(DICTIONARIES[lang].journal.chiefWalk)
      expect(text).toMatch(/\[awe\].+\[\/awe\]/)
      expect(stripVoiceMarkup(text)).toMatch(lang === 'en' ? /hut.*drummer.*follow/s : /Hütte.*Trommler.*folgen/s)
      expect(text).not.toMatch(/decipher|latitude|longitude|degrees|entschlüssel|Breite|Länge|Grad|\d/i)
      expect(chiefWalkState().phase).toBe('walking-out')
      g().leavePlace()
    }
  })

  it('later presses do nothing outside, then call him out again without another entry', () => {
    const village = DRUM_MESSAGE_VILLAGE
    g().enterPlace(village)
    g().callChiefOut()
    const journal = g().journal
    const walk = chiefWalkState()
    g().setToast(null)
    g().callChiefOut()
    expect(g().journal).toBe(journal)
    expect(g().toast).toBeNull()
    expect(chiefWalkState()).toBe(walk)
    // The scene finishes the round trip and puts him indoors.
    resetChiefWalk()
    useGame.setState({ chiefOutside: {} })
    g().callChiefOut()
    expect(chiefWalkState().phase).toBe('walking-out')
    expect(g().journal).toBe(journal)
    g().leavePlace()
    g().enterPlace(village)
    const before = g().journal.length
    g().callChiefOut()
    expect(g().journal).toHaveLength(before)
  })

  it('checkpoint reload preserves the first meeting without saving hint state', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    g().saveCheckpoint()
    const saved = JSON.parse(localStorage.getItem('hoa-checkpoints-v1')!)[0]
    expect(saved).not.toHaveProperty('hintsGiven')
    expect(saved).not.toHaveProperty('decodedGiven')
    g().newGame()
    expect(g().loadCheckpoint()).toBe(true)
    const before = g().journal.length
    g().callChiefOut()
    expect(g().journal).toHaveLength(before)
    expect(chiefWalkState().phase).toBe('walking-out')
  })

  it('does not write a chief entry outside a village', () => {
    g().enterPlace('cairo')
    const before = g().journal.length
    g().callChiefOut()
    expect(g().journal).toHaveLength(before)
    g().leavePlace()
    g().callChiefOut()
    expect(g().journal).toHaveLength(before)
  })

  it('removes the spoken hint actions, state and both dictionaries’ keys', () => {
    for (const key of ['tellChiefHint', 'revealDecoded', 'hintsGiven', 'decodedGiven']) {
      expect(g()).not.toHaveProperty(key)
    }
    for (const strings of Object.values(DICTIONARIES)) {
      for (const key of ['hintRaw', 'hintDecoded', 'titles.chiefHint', 'titles.decoded']) {
        expect(strings.journal).not.toHaveProperty(key)
      }
    }
  })
})
