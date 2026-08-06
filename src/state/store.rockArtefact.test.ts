// The end of the drum errand (work-order point 487): digging at the landmark
// boulder recovers the artefact, digging anywhere else does not, and handing it
// to the chief in his own village is what solves the puzzle. The rock's
// PLACEMENT is pinned in src/world/communicationRock.test.ts — this file pins
// the store wiring: the dig branch, the hand-over guards, the chronicle in both
// languages, and the save/load round trip.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, useGame } from '../test/store'
import { communicationRockSite } from '../world/communicationRock'
import { chiefAcknowledgePhrase } from '../communication/chiefReply'
import { hasHeard, hypothesisFor } from '../communication/heard'
import { utteranceOf } from '../communication/lexicon'
import { DRUM_MESSAGE_VILLAGE } from './store'
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

const rock = () => communicationRockSite(g().seed)
const bodyKeys = () => g().journal.map((e) => e.text.key)
const artefactEntries = () => g().journal.filter((e) => e.text.key === 'journal.rockArtefact')

/** Stand at the boulder the renderer draws, with a shovel in the pack. */
function atTheRockWithShovel(): void {
  const site = rock()
  g().debugJumpTo(site.lat, site.lon)
  g().debugAddEquipment('shovel')
}

describe('digging at the landmark boulder (point 487)', () => {
  it('a fresh expedition leaves the artefact buried', () => {
    expect(g().rockArtefact).toBe('buried')
  })

  it('digging at the spot the renderer draws recovers it, with its own entry', () => {
    atTheRockWithShovel()
    g().dig()
    expect(g().rockArtefact).toBe('carried')
    expect(bodyKeys()).toContain('journal.rockArtefact')
    expect(g().journal.at(-1)?.title.key).toBe('journal.titles.rockArtefact')
  })

  it('digging a step away from the boulder recovers nothing', () => {
    useGame.setState({ treasureSites: [] }) // no cache may answer instead
    const site = rock()
    const off = (balance.digRadius / 10) * 3
    g().debugJumpTo(site.lat + off, site.lon + off)
    g().debugAddEquipment('shovel')
    g().dig()
    expect(g().rockArtefact).toBe('buried')
    expect(g().toast).toBe(stripVoiceMarkup(getStrings().journal.digNothing))
  })

  it('without a shovel the ground keeps it', () => {
    const site = rock()
    g().debugJumpTo(site.lat, site.lon)
    g().dig()
    expect(g().rockArtefact).toBe('buried')
    expect(g().toast).toBe(getStrings().toasts.digNoShovel)
  })

  it('the ground yields it once — a second dig finds only stones', () => {
    useGame.setState({ treasureSites: [] })
    atTheRockWithShovel()
    g().dig()
    g().dig()
    expect(artefactEntries()).toHaveLength(1)
    expect(g().toast).toBe(stripVoiceMarkup(getStrings().journal.digNothing))
  })

  it('a full pack never strands the errand — the artefact is no trade good', () => {
    const capacity = balance.inventoryCapacity
    try {
      atTheRockWithShovel()
      balance.inventoryCapacity = 0 // the pack cannot hold one more thing
      g().dig()
      expect(g().rockArtefact).toBe('carried')
    } finally {
      balance.inventoryCapacity = capacity
    }
  })
})

describe('handing the artefact to the chief (point 487)', () => {
  /** Carry it into the chief's own village. */
  function carriedIntoTheVillage(): void {
    atTheRockWithShovel()
    g().dig()
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
  }

  it('the hand-over solves the puzzle and is written down', () => {
    carriedIntoTheVillage()
    g().handArtefactToChief()
    expect(g().rockArtefact).toBe('given')
    expect(bodyKeys()).toContain('journal.artefactGiven')
    expect(g().journal.at(-1)?.title.key).toBe('journal.titles.artefactGiven')
  })

  it('he acknowledges it in his OWN tongue, recorded like any speech of his', () => {
    carriedIntoTheVillage()
    g().debugSet({ day: 60 })
    g().handArtefactToChief()
    for (const atom of chiefAcknowledgePhrase()) {
      expect(hasHeard(g().communication, atom)).toBe(true)
    }
    // Nothing is translated for the player: an utterance he wrote no note for
    // stays without one.
    expect(hypothesisFor(g().communication, utteranceOf('BIG_ROCK'))).toBe('')
  })

  it('keeps the day and the note of a concept already heard in the village', () => {
    const DIG = utteranceOf('DIG')
    g().debugSet({ day: 4 })
    g().hearUtterance(DIG)
    g().setUtteranceHypothesis(DIG, 'dig')
    carriedIntoTheVillage()
    g().debugSet({ day: 55 })
    g().handArtefactToChief()
    expect(g().communication.heard[DIG].firstHeardDay).toBe(4)
    expect(hypothesisFor(g().communication, DIG)).toBe('dig')
  })

  it('cannot be handed over without having been dug up', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().handArtefactToChief()
    expect(g().rockArtefact).toBe('buried')
    expect(bodyKeys()).not.toContain('journal.artefactGiven')
  })

  it('cannot be handed to another people’s chief', () => {
    atTheRockWithShovel()
    g().dig()
    const elsewhere = 'cairo'
    expect(elsewhere).not.toBe(DRUM_MESSAGE_VILLAGE)
    g().enterPlace(elsewhere)
    g().handArtefactToChief()
    expect(g().rockArtefact).toBe('carried')
  })

  it('cannot be handed over out in the open, only in the settlement', () => {
    atTheRockWithShovel()
    g().dig()
    expect(g().mode).toBe('travel')
    g().handArtefactToChief()
    expect(g().rockArtefact).toBe('carried')
  })

  it('is given once — a second attempt writes no second page', () => {
    carriedIntoTheVillage()
    g().handArtefactToChief()
    g().handArtefactToChief()
    expect(g().journal.filter((e) => e.text.key === 'journal.artefactGiven')).toHaveLength(1)
  })
})

describe('the artefact travels with the checkpoint (point 487)', () => {
  it('a carried artefact is still carried after a load', () => {
    atTheRockWithShovel()
    g().dig()
    g().saveCheckpoint()
    g().newGame()
    expect(g().rockArtefact).toBe('buried')
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().rockArtefact).toBe('carried')
  })

  it('a snapshot from before the boulder was dug leaves it buried', () => {
    atTheRockWithShovel()
    g().dig()
    g().saveCheckpoint()
    const key = 'hoa-checkpoints-v1'
    const snaps = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<Record<string, unknown>>
    delete snaps[snaps.length - 1].rockArtefact
    localStorage.setItem(key, JSON.stringify(snaps))
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().rockArtefact).toBe('buried')
  })
})

describe('both languages carry the new chronicle texts (point 487)', () => {
  it.each(['en', 'de'] as const)('%s: both entries read as prose without their markup', (lang) => {
    const s = DICTIONARIES[lang]
    for (const key of ['journal.rockArtefact', 'journal.artefactGiven']) {
      const text = resolveText(s, { key })
      expect(text.length).toBeGreaterThan(80)
      expect(text).toMatch(/\[(awe|whisper|excited|somber|weary|fear|emph|mute|pause|breath)\]/)
      expect(stripVoiceMarkup(text)).not.toMatch(/\[|\]/)
    }
    for (const key of ['journal.titles.rockArtefact', 'journal.titles.artefactGiven']) {
      expect(resolveText(s, { key }).length).toBeGreaterThan(3)
    }
    // The audience's own hand-over strings exist in both languages too.
    expect(s.dialogs.handArtefact.length).toBeGreaterThan(3)
    expect(s.dialogs.artefactCarried.length).toBeGreaterThan(3)
    expect(s.dialogs.chiefAcknowledges.length).toBeGreaterThan(3)
  })
})
