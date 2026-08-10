// Guessing a meaning where it is spoken (design.md §13.4, work-order point
// 588): the dialog that opens on the speaker himself, writing the SAME note the
// journal writes. What only a browser can show — the pointer lock going and
// coming back, and real keystrokes reaching the field — stays in
// scripts/verify/polish.mjs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { Dialogs } from './Dialogs'
import { JournalPanel } from './JournalPanel'
import { hypothesisFor } from '../communication/heard'
import { utteranceOf } from '../communication/lexicon'
import { useUi } from '../state/ui'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { freshGame, g } from '../test/store'

const COME = utteranceOf('COME')
const DIG = utteranceOf('DIG')

/** Open the dialog for what one speaker just said. */
const openFor = (...atoms: string[]) =>
  useUi.getState().setDialog({ kind: 'speechGuess', speakerId: 'kid-1', atoms })

/** The field of the first (or n-th) utterance in the dialog. */
const field = (n = 0) =>
  document.querySelectorAll('.dialog.speech-guess .hypothesis')[n] as HTMLInputElement

const dialogText = () => document.querySelector('.dialog.speech-guess')?.textContent ?? ''

/** The utterances the dialog spells out, syllable by syllable as they sound. */
const spoken = () =>
  Array.from(document.querySelectorAll('.dialog.speech-guess .utterance')).map((u) =>
    Array.from(u.querySelectorAll('span'))
      .map((s) => s.textContent)
      .join('-'),
  )

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
  g().hearUtterance(COME)
  g().hearUtterance(DIG)
})
afterEach(() => {
  useUi.getState().setDialog(null)
  useLocale.getState().setLang('en')
})

describe('the guess dialog (design.md §13.4)', () => {
  it('opens for exactly the utterance that was spoken, showing its syllables', () => {
    openFor(COME)
    render(<Dialogs />)
    expect(document.querySelector('.dialog.speech-guess')).not.toBeNull()
    expect(spoken()).toEqual([COME])
  })

  it('carries a reading already written, and saving writes the store field', () => {
    g().setUtteranceHypothesis(COME, 'come')
    openFor(COME)
    render(<Dialogs />)
    expect(field().value).toBe('come')
    fireEvent.change(field(), { target: { value: 'come here' } })
    fireEvent.click(document.querySelectorAll('.dialog.speech-guess .actions .hud-button')[0])
    expect(hypothesisFor(g().communication, COME)).toBe('come here')
    expect(useUi.getState().dialog).toBeNull()
  })

  it('shows the saved reading in the journal — one note, two views', () => {
    openFor(COME)
    const dialog = render(<Dialogs />)
    fireEvent.change(field(), { target: { value: 'come here' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(hypothesisFor(g().communication, COME)).toBe('come here')
    dialog.unmount()
    g().setJournalOpen(true)
    render(<JournalPanel />)
    fireEvent.click(document.querySelectorAll('.journal .journal-tab')[1])
    // BY UTTERANCE, matched case-SENSITIVELY: the section lists every heard
    // word, and a CSS attribute selector compares an HTML attribute without
    // regard to case — which makes two utterances of the same syllables in
    // different tones one and the same.
    const written = Array.from(
      document.querySelectorAll('.observation .hypothesis'),
    ).find(
      (e) => e.getAttribute('aria-label') === en.journalPanel.hypothesisFor(COME),
    ) as HTMLInputElement
    expect(written.value).toBe('come here')
  })

  it('saves on Enter and leaves the note untouched on Escape', () => {
    g().setUtteranceHypothesis(COME, 'come')
    openFor(COME)
    const first = render(<Dialogs />)
    fireEvent.change(field(), { target: { value: 'arrive' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(hypothesisFor(g().communication, COME)).toBe('arrive')
    expect(useUi.getState().dialog).toBeNull()
    first.unmount()

    openFor(COME)
    render(<Dialogs />)
    fireEvent.change(field(), { target: { value: 'nonsense' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(hypothesisFor(g().communication, COME)).toBe('arrive')
    expect(useUi.getState().dialog).toBeNull()
  })

  it('leaves the note untouched when the guess is cancelled by button', () => {
    g().setUtteranceHypothesis(COME, 'come')
    openFor(COME)
    render(<Dialogs />)
    fireEvent.change(field(), { target: { value: 'nonsense' } })
    fireEvent.click(document.querySelectorAll('.dialog.speech-guess .actions .hud-button')[1])
    expect(hypothesisFor(g().communication, COME)).toBe('come')
    expect(useUi.getState().dialog).toBeNull()
  })

  it('keeps a space the player types inside his note', () => {
    // The store trims a reading, so a directly bound field would swallow every
    // space the moment it is typed.
    openFor(COME)
    render(<Dialogs />)
    fireEvent.change(field(), { target: { value: 'come ' } })
    expect(field().value).toBe('come ')
    fireEvent.change(field(), { target: { value: 'come here' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(hypothesisFor(g().communication, COME)).toBe('come here')
  })

  it('gives a spoken phrase one field per word, each writing its own note', () => {
    openFor(DIG, COME)
    render(<Dialogs />)
    expect(spoken()).toEqual([DIG, COME])
    fireEvent.change(field(0), { target: { value: 'dig' } })
    fireEvent.change(field(1), { target: { value: 'come here' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(hypothesisFor(g().communication, DIG)).toBe('dig')
    expect(hypothesisFor(g().communication, COME)).toBe('come here')
  })

  it('speaks both languages, and never interprets the note itself', () => {
    openFor(COME)
    const view = render(<Dialogs />)
    expect(dialogText()).toContain(en.speechGuess.title)
    expect(dialogText()).toContain(en.speechGuess.hint)
    view.unmount()
    useLocale.getState().setLang('de')
    render(<Dialogs />)
    expect(dialogText()).toContain(de.speechGuess.title)
    expect(dialogText()).toContain(de.speechGuess.save)
    // A reading the game would reject is stored exactly as written: it is the
    // player's note, unchecked (CLAUDE.md §2 — no translation aid).
    fireEvent.change(field(), { target: { value: 'utter nonsense' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(hypothesisFor(g().communication, COME)).toBe('utter nonsense')
  })
})
