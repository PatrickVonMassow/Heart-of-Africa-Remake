// One expedition through the communication puzzle, without reseeding quest
// progress between stages. Scene movement/hearing are supplied at their store
// boundary; this proves state and DOM continuity, not navigation, sound or pixels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Hud } from './Hud'
import { balance } from '../config/balance'
import { CONCEPT_IDS, type ConceptId } from '../communication/lexicon'
import { hypothesisFor } from '../communication/heard'
import { NO_READING } from '../communication/speechLabel'
import { getStrings, useLocale } from '../i18n'
import { stripVoiceMarkup } from '../journal/voiceMarkup'
import { chiefWalkState, setChiefWalkState } from '../scenes/place/chiefPresence'
import { chiefTick } from '../scenes/place/chiefWalk'
import { DRUM_MESSAGE_VILLAGE } from '../state/store'
import { useUi } from '../state/ui'
import { freshGame, g, jumpTo, standBeforeChief, withWorld } from '../test/store'
import { communicationRockSite } from '../world/communicationRock'
import { FORM_SOCKETS, socketPosition } from '../world/forms'

withWorld()

const readings: Record<ConceptId, string> = {
  RIVER: 'water / river', UPSTREAM: 'against the current', DOWNSTREAM: 'with the current',
  ROCK: 'a rock', DIG: 'dig', CHIEF: 'head man',
}
const questEntries = [
  'journal.drumMessage', 'journal.rockArtefact', 'journal.artefactGiven',
  'journal.drumAnswer', 'journal.mouldFitted',
]
const heldEvents = balance.randomEventsEnabled

beforeEach(() => {
  freshGame(42)
  balance.randomEventsEnabled = false
  useUi.setState({ dialog: null, prompt: null, journalDnd: false, mapOpen: false })
  useUi.getState().clearDrumMessage()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  useUi.getState().setDialog(null)
  useUi.getState().clearDrumMessage()
  useLocale.getState().setLang('en')
  balance.randomEventsEnabled = heldEvents
})

function closePaper() {
  fireEvent.click(screen.getByRole('button', { name: getStrings().drumMessage.close }))
  act(() => g().setJournalOpen(false))
}

function paperReadings() {
  return [...document.querySelectorAll('.drum-concept .reading')].map((e) => e.textContent)
}

function paperAtoms() {
  return [...document.querySelectorAll('.drum-concept .utterance')].map((e) =>
    [...e.querySelectorAll('span')].map((s) => s.textContent).join('-'))
}

function journalTab(tab: 'entries' | 'observations') {
  act(() => g().setJournalOpen(true))
  fireEvent.click(screen.getByRole('tab', { name: getStrings().journalPanel[tab] }))
}

function reopen(message: 'errand' | 'answer') {
  journalTab('observations')
  fireEvent.click(screen.getByRole('button', {
    name: message === 'errand'
      ? getStrings().journalPanel.reopenDrumMessage
      : getStrings().journalPanel.reopenDrumAnswer,
  }))
  expect(useUi.getState().dialog).toEqual({ kind: 'drumMessage', message })
}

function finishPerformance(message: 'errand' | 'answer', concepts: ConceptId[]) {
  const performance = useUi.getState().drumPerformance
  expect(performance?.plan.message).toBe(message)
  expect(performance?.plan.atoms).toEqual(concepts.map((c) => g().vocabulary[c]))
  expect(g().drumMessageHeard[message]).toBe(false)
  expect(document.querySelector('.drum-message')).toBeNull()
  act(() => vi.advanceTimersByTime(performance!.plan.duration * 1000 - 50))
  expect(g().drumMessageHeard[message]).toBe(false)
  act(() => vi.advanceTimersByTime(100))
  expect(g().drumMessageHeard[message]).toBe(true)
  expect(paperAtoms()).toEqual(concepts.map((c) => g().vocabulary[c]))
}

function callAndMeetChief() {
  act(() => {
    g().callChiefOut()
    const walk = chiefWalkState()
    expect(walk.phase).toBe('walking-out')
    // The scene normally supplies path length and calls chiefTick each frame.
    const pathLength = 10
    const step = chiefTick(walk, walk.at + pathLength / balance.communication.chiefWalkSpeed + 0.01, {
      pathLength, speed: balance.communication.chiefWalkSpeed,
      staySeconds: balance.communication.chiefStaySeconds,
    })
    expect(step.beatDrums).toBe(false)
    setChiefWalkState(step.walk)
    standBeforeChief(1)
    g().setJournalOpen(false)
  })
  expect(chiefWalkState().phase).toBe('at-drummer')
}

function learnAndGuess() {
  for (const concept of CONCEPT_IDS) {
    const atom = g().vocabulary[concept]
    act(() => {
      // Hearing and selection are the scene seam. The actual editor, save and
      // journal below are mounted together for the whole expedition.
      g().hearUtterance(atom)
      useUi.getState().setDialog({ kind: 'speechGuess', speakerId: 'observed-speaker', atoms: [atom] })
    })
    const syllables = [...document.querySelectorAll('.speech-guess .utterance span')]
      .map((e) => e.textContent).join('-')
    expect(syllables).toBe(atom)
    const field = document.querySelector('.speech-guess .hypothesis')!
    fireEvent.change(field, { target: { value: readings[concept] } })
    fireEvent.click(screen.getByRole('button', { name: getStrings().speechGuess.save }))
    expect(hypothesisFor(g().communication, atom)).toBe(readings[concept])
  }
}

function expectUnfinished() {
  expect(g().spentSockets).toEqual([])
  expect(g().journal.some((e) => e.text.key === 'journal.mouldFitted')).toBe(false)
  expect(g().victory).toBe(false)
}

describe.each(['en', 'de'] as const)('continuous communication expedition (%s)', (lang) => {
  it.each(['words first', 'message first'] as const)('%s: the impression fit concludes the puzzle', (order) => {
    useLocale.getState().setLang(lang)
    // Acquire the prerequisite through trade, before entering the village.
    g().enterPlace('cairo')
    g().buy('shovel')
    expect(g().equipment.shovel).toBe(1)
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(Object.keys(g().communication.heard)).toHaveLength(0)
    expect(g().rockArtefact).toBe('buried')
    expect(g().carriedForms).toEqual([])
    expect(g().drumMessageHeard).toEqual({ errand: false, answer: false })
    render(<Hud />)
    expectUnfinished()

    if (order === 'words first') learnAndGuess()
    callAndMeetChief()
    act(() => g().requestDrumMessage())
    finishPerformance('errand', ['RIVER', 'UPSTREAM', 'ROCK', 'DIG'])
    expect(paperReadings()).toEqual(order === 'words first'
      ? [readings.RIVER, readings.UPSTREAM, readings.ROCK, readings.DIG]
      : [NO_READING, NO_READING, NO_READING, NO_READING])
    closePaper()
    if (order === 'message first') learnAndGuess()

    // A mistaken reading can be cleared and replaced in the journal; the OLD
    // message must pick up both edits without being beaten again.
    journalTab('observations')
    const river = screen.getByRole('textbox', {
      name: getStrings().journalPanel.hypothesisFor(g().vocabulary.RIVER),
    })
    fireEvent.change(river, { target: { value: 'perhaps a path' } })
    reopen('errand')
    expect(paperReadings()[0]).toBe('perhaps a path')
    closePaper()
    journalTab('observations')
    fireEvent.change(screen.getByRole('textbox', { name: getStrings().journalPanel.hypothesisFor(g().vocabulary.RIVER) }),
      { target: { value: '' } })
    reopen('errand')
    expect(paperReadings()[0]).toBe(NO_READING)
    // Paper editing writes back to the same journal memory.
    fireEvent.click(document.querySelector('.drum-concept .reading')!)
    fireEvent.change(document.querySelector('.drum-concept .hypothesis')!, { target: { value: readings.RIVER } })
    closePaper()
    journalTab('observations')
    expect(screen.getByRole('textbox', { name: getStrings().journalPanel.hypothesisFor(g().vocabulary.RIVER) }))
      .toHaveValue(readings.RIVER)

    const rock = communicationRockSite(g().seed)
    act(() => { jumpTo(rock.lat, rock.lon); g().setJournalOpen(false) })
    fireEvent.click(screen.getByRole('button', { name: getStrings().equipment.shovel }))
    expect(g().rockArtefact).toBe('carried')
    expectUnfinished()
    fireEvent.click(screen.getByRole('button', { name: getStrings().finds.rockArtefact }))
    expect(g().toast).toBe(getStrings().toasts.findNeedsChief)
    expect(g().rockArtefact).toBe('carried')

    act(() => g().enterPlace(DRUM_MESSAGE_VILLAGE))
    callAndMeetChief()
    fireEvent.click(screen.getByRole('button', { name: getStrings().finds.rockArtefact }))
    expect(g().rockArtefact).toBe('given')
    expect(document.querySelector('[data-find="rockArtefact"]')).toBeNull()
    expect(screen.getByRole('button', { name: getStrings().forms['rock-relief'] })).toBeInTheDocument()
    expectUnfinished()
    finishPerformance('answer', ['RIVER', 'DOWNSTREAM'])
    expect(paperReadings()).toEqual([readings.RIVER, readings.DOWNSTREAM])
    closePaper()
    reopen('errand')
    expect(paperReadings()).toEqual([readings.RIVER, readings.UPSTREAM, readings.ROCK, readings.DIG])
    closePaper()
    reopen('answer')
    expect(paperReadings()).toEqual([readings.RIVER, readings.DOWNSTREAM])
    closePaper()
    expectUnfinished()

    const form = () => screen.getByRole('button', { name: getStrings().forms['rock-relief'] })
    fireEvent.click(form())
    expect(g().toast).toBe(getStrings().toasts.formInSettlement)
    expectUnfinished()
    const talus = socketPosition(FORM_SOCKETS.find((s) => s.id === 'bandiagara-talus')!)
    act(() => jumpTo(talus.lat + 4 * balance.digRadius / 10, talus.lon))
    fireEvent.click(form())
    expect(g().toast).toBe(getStrings().toasts.formNoFit)
    expectUnfinished()

    act(() => jumpTo(talus.lat, talus.lon))
    fireEvent.click(form())
    expect(g().toast).toBe(getStrings().toasts.pocSolved)
    expect(g().spentSockets).toEqual(['bandiagara-talus'])
    expect(g().victory).toBe(false)
    expect(g().carriedForms).toEqual(['rock-relief'])
    expect(g().journal.filter((e) => questEntries.includes(e.text.key)).map((e) => e.text.key)).toEqual(questEntries)
    journalTab('entries')
    const lastEntry = [...document.querySelectorAll('.entries .entry')].at(-1)!
    fireEvent.click(lastEntry) // finish the player's handwriting animation
    expect(lastEntry).toHaveTextContent(getStrings().journal.titles.mouldFitted)
    expect(lastEntry).toHaveTextContent(stripVoiceMarkup(getStrings().journal.mouldFitted))
    expect(lastEntry.textContent).not.toMatch(/\[(?:awe|pause|emph|whisper)\]/)

    act(() => g().setJournalOpen(false))
    fireEvent.click(form())
    expect(g().toast).toBe(getStrings().toasts.formNoFit)
    expect(g().journal.filter((e) => e.text.key === 'journal.mouldFitted')).toHaveLength(1)
    expect(g().victory).toBe(false)
  })
})
