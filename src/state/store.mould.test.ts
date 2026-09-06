// The chief's second payment and what it opens: the clay impression he hands
// over without a word, and the socket at the talus foot it was taken from.
//
// The RULES of the form/socket lock are pinned in src/world/forms.test.ts; this
// file pins the store wiring — the hand-over that puts the form in the pack, the
// use key out on the map, the capacity and trade exemption, the chronicle in
// both languages, and the save/load round trip of a spent socket.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, useGame } from '../test/store'
import { communicationRockSite } from '../world/communicationRock'
import { FORM_SOCKETS, socketPosition, type FormSocket } from '../world/forms'
import { CHIEF_REWARD_FORM, DRUM_MESSAGE_VILLAGE, usedInventory } from './store'
import { DICTIONARIES, getStrings, resolveText } from '../i18n'
import { stripVoiceMarkup } from '../journal/voiceMarkup'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false
})
afterEach(() => {
  balance.randomEventsEnabled = true
})

const talus = FORM_SOCKETS.find((s) => s.id === 'bandiagara-talus') as FormSocket
const bodyKeys = () => g().journal.map((e) => e.text.key)

/** Dig the thing up and lay it in the chief's hands — the whole errand. */
function handedOver(): void {
  const site = communicationRockSite(g().seed)
  g().debugJumpTo(site.lat, site.lon)
  g().debugAddEquipment('shovel')
  g().dig()
  g().enterPlace(DRUM_MESSAGE_VILLAGE)
  g().handArtefactToChief()
}

/** Stand where the socket is and press the use key. */
function useAtTheTalus(): void {
  const at = socketPosition(talus)
  g().debugJumpTo(at.lat, at.lon)
  g().useCarriedForm()
}

describe('what the chief hands over besides the words', () => {
  it('a fresh expedition carries no form at all', () => {
    expect(g().carriedForms).toEqual([])
    expect(g().spentSockets).toEqual([])
  })

  it('the hand-over puts the clay impression in the pack', () => {
    handedOver()
    expect(g().carriedForms).toContain(CHIEF_REWARD_FORM)
  })

  it('is given wordlessly — the same journal entry carries the whole moment', () => {
    handedOver()
    expect(bodyKeys()).toContain('journal.artefactGiven')
    expect(g().journal.at(-1)?.title.key).toBe('journal.titles.artefactGiven')
  })

  it('handing over twice does not stack a second impression', () => {
    handedOver()
    g().handArtefactToChief()
    expect(g().carriedForms.filter((f) => f === CHIEF_REWARD_FORM)).toHaveLength(1)
  })

  it('rides OUTSIDE the pack capacity and is no trade stock', () => {
    handedOver()
    // Measured across the hand-over alone, so the shovel the errand needed does
    // not count against it.
    const before = usedInventory(g())
    useGame.setState({ carriedForms: [] })
    g().handArtefactToChief()
    expect(usedInventory(g())).toBe(before)
    // Not gear, not a gift, not a valuable: nothing a dialog can price or sell.
    expect(Object.keys(g().equipment)).not.toContain(CHIEF_REWARD_FORM)
    expect(Object.keys(g().gifts)).not.toContain(CHIEF_REWARD_FORM)
    expect(Object.keys(g().treasures)).not.toContain(CHIEF_REWARD_FORM)
  })

  it('a full pack cannot strand the errand', () => {
    useGame.setState({ treasures: { gold: balance.inventoryCapacity, silver: 0, emerald: 0, copper: 0, ivory: 0, statue: 0 } })
    handedOver()
    expect(g().carriedForms).toContain(CHIEF_REWARD_FORM)
  })
})

describe('pressing the impression against the world', () => {
  beforeEach(() => {
    handedOver()
    g().leavePlace()
  })

  it('fits at the talus foot and says the puzzle is solved', () => {
    useAtTheTalus()
    expect(g().spentSockets).toContain('bandiagara-talus')
    expect(g().toast).toBe(getStrings().toasts.pocSolved)
  })

  it('writes the moment down', () => {
    useAtTheTalus()
    expect(bodyKeys()).toContain('journal.mouldFitted')
    expect(g().journal.at(-1)?.title.key).toBe('journal.titles.mouldFitted')
  })

  it('does not spend the impression — it stays in the pack', () => {
    useAtTheTalus()
    expect(g().carriedForms).toContain(CHIEF_REWARD_FORM)
  })

  it('answers a wrong place in the traveller’s own voice, never with silence', () => {
    const at = socketPosition(talus)
    g().debugJumpTo(at.lat + (balance.digRadius / 10) * 4, at.lon)
    g().useCarriedForm()
    expect(g().toast).toBe(getStrings().toasts.formNoFit)
    expect(g().spentSockets).toEqual([])
    expect(bodyKeys()).not.toContain('journal.mouldFitted')
  })

  it('answers a SPENT socket exactly as it answers a wrong place', () => {
    useAtTheTalus()
    g().setToast(null)
    g().useCarriedForm()
    expect(g().toast).toBe(getStrings().toasts.formNoFit)
    // And no second page in the chronicle.
    expect(bodyKeys().filter((k) => k === 'journal.mouldFitted')).toHaveLength(1)
  })

  it('is a travel action: inside a settlement it does nothing', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().setToast(null)
    g().useCarriedForm()
    expect(g().toast).toBeNull()
    expect(g().spentSockets).toEqual([])
  })

  it('the spent socket is saved world state and comes back with the game', () => {
    useAtTheTalus()
    g().saveCheckpoint()
    g().newGame()
    expect(g().spentSockets).toEqual([])
    expect(g().carriedForms).toEqual([])
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().spentSockets).toContain('bandiagara-talus')
    expect(g().carriedForms).toContain(CHIEF_REWARD_FORM)
  })

  it('a save from before the forms existed loads as an untouched world', () => {
    g().saveCheckpoint()
    const key = 'hoa-checkpoints-v1'
    const snaps = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    delete snaps[snaps.length - 1].carriedForms
    delete snaps[snaps.length - 1].spentSockets
    localStorage.setItem(key, JSON.stringify(snaps))
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().carriedForms).toEqual([])
    expect(g().spentSockets).toEqual([])
  })
})

describe('carrying no form at all', () => {
  it('is a non-action, not a miss — nothing is said', () => {
    g().debugJumpTo(socketPosition(talus).lat, socketPosition(talus).lon)
    g().setToast(null)
    g().useCarriedForm()
    expect(g().toast).toBeNull()
    expect(g().spentSockets).toEqual([])
  })
})

describe('the texts of the impression (design.md §17)', () => {
  it('names the thing in both languages, and as an impression of a ROCK', () => {
    expect(DICTIONARIES.en.forms[CHIEF_REWARD_FORM]).toBe('Clay Impression of a Rock')
    expect(DICTIONARIES.de.forms[CHIEF_REWARD_FORM]).toBe('Tonabdruck eines Felsens')
  })

  it('never says "cliff" in the name or in the hand-over entry', () => {
    for (const lang of ['en', 'de'] as const) {
      const name = DICTIONARIES[lang].forms[CHIEF_REWARD_FORM]
      const entry = DICTIONARIES[lang].journal.artefactGiven
      for (const text of [name, entry]) {
        expect(text.toLowerCase()).not.toContain('cliff')
        expect(text.toLowerCase()).not.toContain('klippe')
        expect(text.toLowerCase()).not.toContain('felswand')
        expect(text.toLowerCase()).not.toContain('bandiagara')
      }
    }
  })

  it('the hand-over entry describes what the traveller sees, in both languages', () => {
    for (const lang of ['en', 'de'] as const) {
      const text = stripVoiceMarkup(DICTIONARIES[lang].journal.artefactGiven)
      expect(text.length).toBeGreaterThan(200)
      // A flat back and a hollowed face — the shape is his own observation, not
      // a translation of anything the chief said.
      const shape = lang === 'en' ? /flat at the back/i : /flach im Rücken/i
      const hollow = lang === 'en' ? /hollow/i : /ausgehöhlt|Höhlung/i
      expect(text).toMatch(shape)
      expect(text).toMatch(hollow)
    }
  })

  it('the success message exists in both languages and reads as a dummy', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(DICTIONARIES[lang].toasts.pocSolved).toBeTruthy()
      expect(DICTIONARIES[lang].toasts.formNoFit).toBeTruthy()
      expect(DICTIONARIES[lang].toasts.pocSolved.toLowerCase()).toMatch(/dummy/)
    }
  })

  it('the entry at the socket resolves in both languages', () => {
    for (const lang of ['en', 'de'] as const) {
      const strings = DICTIONARIES[lang]
      for (const key of ['journal.titles.mouldFitted', 'journal.mouldFitted']) {
        expect(resolveText(strings, { key })).toBeTruthy()
      }
      expect(stripVoiceMarkup(strings.journal.mouldFitted)).not.toMatch(/\[/)
    }
  })
})
