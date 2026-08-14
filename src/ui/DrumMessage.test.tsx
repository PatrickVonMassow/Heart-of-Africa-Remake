// The chief's drum message on paper (work-order point 486): the display shows
// the four concepts with the player's own reading over each, every reading is
// editable in the journal as ONE note, and the message can always be
// reopened once the drums have spoken.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { DrumMessageDialog, DrumMessageWatcher } from './DrumMessage'
import { Dialogs } from './Dialogs'
import { JournalPanel } from './JournalPanel'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { freshGame, g, useGame } from '../test/store'
import { balance } from '../config/balance'
import { chiefMessagePhrase, drumMessagePlan } from '../communication/drumMessage'
import { utteranceOf } from '../communication/lexicon'
import { hypothesisFor } from '../communication/heard'
import { NO_READING } from '../communication/speechLabel'
import { DRUM_MESSAGE_VILLAGE } from '../state/store'

const DIG = utteranceOf('DIG')
const RIVER = utteranceOf('RIVER')

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
  useUi.getState().clearDrumMessage()
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
  useUi.getState().clearDrumMessage()
})

/** The journal opens on the diary; the heard utterances and the reopen button
 *  live behind its second tab (point 579). */
const openOverheardTab = () =>
  fireEvent.click(document.querySelectorAll('.journal .journal-tab')[1])

const readings = () => [...document.querySelectorAll('.drum-concept .reading')].map((e) => e.textContent)
const syllables = () =>
  [...document.querySelectorAll('.drum-concept .utterance')].map((e) =>
    [...e.querySelectorAll('span')].map((s) => s.textContent).join('-'),
  )

describe('the message display (design.md §13.4)', () => {
  it('shows the four drummed concepts in the order they were beaten', () => {
    render(<DrumMessageDialog />)
    expect(syllables()).toEqual([...chiefMessagePhrase()])
  })

  it('shows ??? over a concept the player has not read yet', () => {
    render(<DrumMessageDialog />)
    expect(readings()).toEqual(new Array(4).fill(NO_READING))
  })

  it('is localized in both languages', () => {
    const { rerender } = render(<DrumMessageDialog />)
    expect(document.querySelector('.drum-message')?.textContent).toContain(en.drumMessage.title)
    useLocale.getState().setLang('de')
    rerender(<DrumMessageDialog />)
    expect(document.querySelector('.drum-message')?.textContent).toContain(de.drumMessage.title)
  })
})

describe('a reading edited at the drums is the journal note (point 486)', () => {
  it('writes the note straight into the communication memory', () => {
    g().receiveDrumMessage()
    render(<DrumMessageDialog />)
    fireEvent.click(document.querySelectorAll('.drum-concept .reading')[3])
    const field = document.querySelector('.drum-concept .hypothesis') as HTMLInputElement
    expect(field.getAttribute('aria-label')).toBe(en.drumMessage.readingFor(DIG))
    fireEvent.change(field, { target: { value: 'dig here' } })
    expect(hypothesisFor(g().communication, DIG)).toBe('dig here')
  })

  it('reads back in the journal, and the journal note reads back here', () => {
    g().receiveDrumMessage()
    // Written at the drums …
    const drums = render(<DrumMessageDialog />)
    fireEvent.click(document.querySelectorAll('.drum-concept .reading')[0])
    fireEvent.change(document.querySelector('.drum-concept .hypothesis') as HTMLInputElement, {
      target: { value: 'water / river' },
    })
    drums.unmount()

    // … stands in the journal's observation tab.
    const journal = render(<JournalPanel />)
    openOverheardTab()
    const field = journal.getByLabelText(en.journalPanel.hypothesisFor(RIVER)) as HTMLInputElement
    expect(field.value).toBe('water / river')

    // … and a note written in the journal stands on the reopened message.
    fireEvent.change(field, { target: { value: 'the water' } })
    journal.unmount()
    render(<DrumMessageDialog />)
    expect(readings()[0]).toBe('the water')
  })

  it('keeps the space the player is typing (the store trims)', () => {
    g().receiveDrumMessage()
    render(<DrumMessageDialog />)
    fireEvent.click(document.querySelectorAll('.drum-concept .reading')[3])
    const field = document.querySelector('.drum-concept .hypothesis') as HTMLInputElement
    fireEvent.change(field, { target: { value: 'dig ' } })
    expect(field.value).toBe('dig ')
    expect(hypothesisFor(g().communication, DIG)).toBe('dig')
  })

  it('closes the field again on Enter, leaving the reading in place', () => {
    g().receiveDrumMessage()
    render(<DrumMessageDialog />)
    fireEvent.click(document.querySelectorAll('.drum-concept .reading')[3])
    const field = document.querySelector('.drum-concept .hypothesis') as HTMLInputElement
    fireEvent.change(field, { target: { value: 'dig' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(document.querySelector('.drum-concept .hypothesis')).toBeNull()
    expect(readings()[3]).toBe('dig')
  })
})

describe('the message can always be reopened (point 486)', () => {
  it('offers no reopen button before the drums have spoken', () => {
    g().hearUtterance(DIG) // the observation tab needs something to show
    render(<JournalPanel />)
    openOverheardTab()
    expect(document.querySelector('.reopen-drum-message')).toBeNull()
  })

  it('reopens the display from the journal, however often the player asks', () => {
    g().receiveDrumMessage()
    const journal = render(<JournalPanel />)
    openOverheardTab()
    const button = document.querySelector('.reopen-drum-message') as HTMLButtonElement
    expect(button.textContent).toBe(en.journalPanel.reopenDrumMessage)
    fireEvent.click(button)
    expect(useUi.getState().dialog).toEqual({ kind: 'drumMessage' })

    // Closing it does not consume it — it opens again.
    journal.unmount()
    const dialogs = render(<Dialogs />)
    fireEvent.click(dialogs.getByText(en.drumMessage.close))
    expect(useUi.getState().dialog).toBeNull()
    dialogs.unmount()
    render(<JournalPanel />)
    openOverheardTab()
    fireEvent.click(document.querySelector('.reopen-drum-message') as HTMLButtonElement)
    expect(useUi.getState().dialog).toEqual({ kind: 'drumMessage' })
  })

  it('routes the dialog to the message display', () => {
    g().receiveDrumMessage()
    useUi.getState().setDialog({ kind: 'drumMessage' })
    render(<Dialogs />)
    expect(document.querySelector('.dialog.drum-message')).toBeInTheDocument()
    expect(syllables()).toEqual([...chiefMessagePhrase()])
  })
})

describe('the drums are waited out before the message is understood', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('teaches nothing until the last beat, then opens the display', () => {
    const plan = drumMessagePlan()
    render(<DrumMessageWatcher />)
    act(() => {
      useUi.getState().startDrumMessage(plan, performance.now())
    })
    act(() => {
      vi.advanceTimersByTime(plan.duration * 1000 - 50)
    })
    expect(g().drumMessageHeard).toBe(false)
    expect(useUi.getState().dialog).toBeNull()

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(g().drumMessageHeard).toBe(true)
    expect(useUi.getState().dialog).toEqual({ kind: 'drumMessage' })
    expect(useUi.getState().drumPerformance).toBeNull()
  })

  it('never interrupts a dialog the player has opened meanwhile', () => {
    const plan = drumMessagePlan()
    render(<DrumMessageWatcher />)
    act(() => {
      useUi.getState().startDrumMessage(plan, performance.now())
      useUi.getState().setDialog({ kind: 'trade', building: 'market' })
    })
    act(() => {
      vi.advanceTimersByTime(plan.duration * 1000 + 100)
    })
    expect(g().drumMessageHeard).toBe(true)
    expect(useUi.getState().dialog).toEqual({ kind: 'trade', building: 'market' })
  })

  it('does not restart a message that is already being beaten out', () => {
    const plan = drumMessagePlan()
    const started = performance.now()
    act(() => {
      useUi.getState().startDrumMessage(plan, started)
      useUi.getState().startDrumMessage(plan, started + 5000)
    })
    expect(useUi.getState().drumPerformance?.startedAt).toBe(started)
  })
})

describe('the chief sends the message (design.md §12 gift condition)', () => {
  const ready = () => {
    useGame.setState({
      reveredGiftGiven: { [DRUM_MESSAGE_VILLAGE]: true },
      goodwill: { [DRUM_MESSAGE_VILLAGE]: balance.goodwillForHint },
    })
  }

  it('offers the drums in his village once a revered gift has earned his trust', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    ready()
    useUi.getState().setDialog({ kind: 'audience' })
    render(<Dialogs />)
    expect(document.querySelector('.dialog')?.textContent).toContain(en.dialogs.askDrums)
  })

  it('withholds them from a stranger who has brought nothing', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    useUi.getState().setDialog({ kind: 'audience' })
    render(<Dialogs />)
    const text = document.querySelector('.dialog')?.textContent ?? ''
    expect(text).toContain(en.dialogs.askDrumsLocked)
    expect(text).not.toContain(en.dialogs.askDrums)
  })

  it('is not another people\'s message: no other chief sends it', () => {
    g().enterPlace('nubian-village')
    useGame.setState({
      reveredGiftGiven: { 'nubian-village': true },
      goodwill: { 'nubian-village': balance.goodwillForHint },
    })
    useUi.getState().setDialog({ kind: 'audience' })
    render(<Dialogs />)
    const text = document.querySelector('.dialog')?.textContent ?? ''
    expect(text).not.toContain(en.dialogs.askDrums)
    expect(text).not.toContain(en.dialogs.askDrumsLocked)
  })

  it('ends the audience and sets the drums beating for the message length', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    ready()
    useUi.getState().setDialog({ kind: 'audience' })
    const view = render(<Dialogs />)
    fireEvent.click(view.getByText(en.dialogs.askDrums))
    expect(useUi.getState().dialog).toBeNull()
    const beating = useUi.getState().drumPerformance
    expect(beating).not.toBeNull()
    expect(beating!.plan).toEqual(drumMessagePlan())
    expect((beating!.endsAt - beating!.startedAt) / 1000).toBeCloseTo(drumMessagePlan().duration, 6)
    // Nothing is understood yet — the drums have only just started.
    expect(g().drumMessageHeard).toBe(false)
    expect(g().toast).toBe(en.toasts.drumsSending)
  })
})
