// JournalPanel HUD component (CLAUDE.md §7.1 pt. 17/19, design.md §15/§16).
// Ports the render-side asserts of voice.mjs and i18n.mjs into React Testing
// Library checks (jsdom): the journal never shows a voice marker, prose stays
// intact, the read-aloud control is offered for English only. The actual TTS
// audio and handwriting animation stay in Playwright.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render } from '@testing-library/react'
import { JournalPanel } from './JournalPanel'
import { hypothesisFor } from '../communication/heard'
import { compareUtterances, utteranceOf } from '../communication/lexicon'
import { START_YEAR } from '../config/balance'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { freshGame, g, useGame } from '../test/store'

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  g().setJournalOpen(true)
})
afterEach(() => {
  useLocale.getState().setLang('en')
})

describe('JournalPanel display (design.md §15)', () => {
  it('renders the departure entry with no visible voice markers', () => {
    render(<JournalPanel />)
    const text = document.querySelector('.journal')?.textContent ?? ''
    expect(text).toContain(en.journalPanel.title)
    expect(text).not.toMatch(/\[\/?[a-z]+\]/) // no [awe] / [pause] etc. on screen
    // The departure prose is present (markup stripped).
    expect(text).toContain('Today my expedition begins')
  })

  it('renders the German prose without markers after a language switch', () => {
    useLocale.getState().setLang('de')
    render(<JournalPanel />)
    const text = document.querySelector('.journal')?.textContent ?? ''
    expect(text).toContain(de.journalPanel.title)
    expect(text).not.toMatch(/\[\/?[a-z]+\]/)
    expect(text).toContain('Heute beginnt meine Expedition')
  })
})

describe('bounty entry rendering (design.md §10)', () => {
  it('renders the bounty as a telegraphic transfer naming the discoveries', () => {
    g().addEntry(
      { key: 'journal.titles.bounty' },
      { key: 'journal.bounty', params: { amount: 25, count: 1, villages: '', landmarks: 'kilimanjaro' } },
    )
    render(<JournalPanel />)
    const text = document.querySelector('.journal')?.textContent ?? ''
    expect(text).toMatch(/telegraphic transfer/i)
    expect(text).toMatch(/Kilimanjaro/i)
    expect(text).not.toMatch(/\[\/?[a-z]+\]/) // markup stripped
  })
})

describe('read-aloud control (design.md §15, English only)', () => {
  it('offers a speak button in English', () => {
    render(<JournalPanel />)
    expect(document.querySelectorAll('.journal .speak').length).toBeGreaterThanOrEqual(1)
  })

  it('offers no speak button in German (no German voice yet)', () => {
    useLocale.getState().setLang('de')
    render(<JournalPanel />)
    expect(document.querySelectorAll('.journal .speak').length).toBe(0)
  })
})

describe('entry kinds, ordering and sketches (design.md §15/§16)', () => {
  it('marks a hint entry with the .hint class', () => {
    // Entries are added before render, so the handwriting animation never
    // starts (its baseline is the mounted journal length) — the text is final.
    g().addEntry({ key: 'journal.titles.chiefHint' }, { key: 'journal.foodLow' }, 'hint')
    render(<JournalPanel />)
    expect(document.querySelector('.entry.hint')).toBeInTheDocument()
  })

  it('renders multiple entries in order with the latest last', () => {
    g().addEntry({ key: 'journal.titles.foodLow' }, { key: 'journal.foodLow' })
    g().addEntry({ key: 'journal.titles.foodOut' }, { key: 'journal.foodOut' })
    render(<JournalPanel />)
    const entries = document.querySelectorAll('.entries .entry')
    // Departure + the two added entries.
    expect(entries.length).toBe(3)
    expect(entries[entries.length - 1].textContent).toContain('The last of my provisions is gone')
    expect(document.querySelector('.entries')?.textContent).toContain('My provisions are running low')
  })

  it('renders a hand-drawn sketch (inline SVG) for an entry that carries one', () => {
    // The departure entry carries the harbor sketch, drawn as three-free SVG.
    render(<JournalPanel />)
    expect(document.querySelector('.journal .sketch')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Speech observations (design.md §13.4, docs/communication-poc-spec.md): the
// section beside the entries listing what the player HEARD, each with his own
// free-text reading. The store side is pinned in store.communication.test.ts.
// ---------------------------------------------------------------------------

const COME = utteranceOf('COME')
const DIG = utteranceOf('DIG')
const HERE = utteranceOf('HERE')

/** Text of the observation section, '' when it is not rendered at all. */
const observationText = () => document.querySelector('.journal .observations')?.textContent ?? ''

/** Switch to the tab holding the heard utterances (point 579). */
const openObservationsTab = () =>
  fireEvent.click(document.querySelectorAll('.journal .journal-tab')[1])

/** The utterances listed, in the order the section renders them. */
const listedUtterances = () =>
  Array.from(document.querySelectorAll('.journal .observation .utterance')).map(
    (el) => el.textContent ?? '',
  )

/** The one hypothesis field currently rendered. */
const hypothesisField = () =>
  document.querySelector('.observation .hypothesis') as HTMLInputElement

describe('journal observation section (design.md §13.4)', () => {
  it('lists nothing while the player has heard nothing', () => {
    render(<JournalPanel />)
    openObservationsTab()
    expect(document.querySelectorAll('.journal .observation').length).toBe(0)
  })

  it('lists a heard utterance once, and never an unheard one', () => {
    g().hearUtterance(COME)
    g().hearUtterance(COME) // heard again — still one line
    render(<JournalPanel />)
    openObservationsTab()
    expect(listedUtterances()).toEqual([COME])
    expect(observationText()).not.toContain(DIG)
  })

  it('sorts the utterances by the lexicon rule, mixed lengths included', () => {
    // 'ba' before 'BA' syllable by syllable; a shorter prefix comes first.
    const short = 'ba-BA'
    for (const u of [DIG, HERE, short, COME]) g().hearUtterance(u)
    render(<JournalPanel />)
    openObservationsTab()
    const expected = [DIG, HERE, short, COME].sort(compareUtterances)
    expect(listedUtterances()).toEqual(expected)
    // The rule itself: the low-tone opening sorts ahead of the high-tone ones.
    expect(expected[0]).toBe(short)
  })

  it('keeps the section separate from the written entries', () => {
    g().hearUtterance(COME)
    render(<JournalPanel />)
    openObservationsTab()
    expect(document.querySelector('.entries .observations')).not.toBeInTheDocument()
    expect(document.querySelector('.observations .entry')).not.toBeInTheDocument()
  })

  it('writes a typed reading into the store and shows it back', () => {
    g().hearUtterance(DIG)
    render(<JournalPanel />)
    openObservationsTab()
    fireEvent.change(hypothesisField(), { target: { value: 'dig here' } })
    expect(hypothesisFor(g().communication, DIG)).toBe('dig here')
    expect(hypothesisField().value).toBe('dig here')
  })

  it('keeps a space the player types inside his note', () => {
    // The store trims; a directly bound field would swallow a trailing space
    // mid-word, so the field keeps its own draft while typing.
    g().hearUtterance(DIG)
    render(<JournalPanel />)
    openObservationsTab()
    fireEvent.change(hypothesisField(), { target: { value: 'dig ' } })
    expect(hypothesisField().value).toBe('dig ')
    fireEvent.change(hypothesisField(), { target: { value: 'dig here' } })
    expect(hypothesisField().value).toBe('dig here')
    expect(hypothesisFor(g().communication, DIG)).toBe('dig here')
  })

  it('shows a note restored from a save', () => {
    g().hearUtterance(HERE)
    g().setUtteranceHypothesis(HERE, 'this place')
    g().saveCheckpoint()
    g().newGame()
    expect(g().loadCheckpoint()).toBe(true)
    g().setJournalOpen(true)
    render(<JournalPanel />)
    openObservationsTab()
    expect(hypothesisField().value).toBe('this place')
  })

  it('labels the section in both languages', () => {
    g().hearUtterance(COME)
    const { unmount } = render(<JournalPanel />)
    openObservationsTab()
    expect(observationText()).toContain(en.journalPanel.observationsHint)
    unmount()
    useLocale.getState().setLang('de')
    render(<JournalPanel />)
    openObservationsTab()
    expect(observationText()).toContain(de.journalPanel.observationsHint)
    // No voice markup ever reaches the screen (design.md §15).
    expect(observationText()).not.toMatch(/\[\/?[a-z]+\]/)
  })
})

// ---------------------------------------------------------------------------
// The journal's two tabs and the village behind "first heard" (point 579).
// ---------------------------------------------------------------------------

const tabLabels = () =>
  Array.from(document.querySelectorAll('.journal .journal-tab')).map((el) => el.textContent ?? '')

const activeTab = () => document.querySelector('.journal .journal-tab.active')?.textContent ?? ''

/** The one first-heard line currently rendered. */
const firstHeardText = () => document.querySelector('.observation .first-heard')?.textContent ?? ''

/** Put the traveller inside a village, so a hearing records its place. */
const standIn = (placeId: string) => useGame.setState({ mode: 'place', placeId })

describe('journal tabs (point 579)', () => {
  it('offers the two tabs with their localized labels in both languages', () => {
    const { unmount } = render(<JournalPanel />)
    expect(tabLabels()).toEqual([en.journalPanel.entries, en.journalPanel.observations])
    unmount()
    useLocale.getState().setLang('de')
    render(<JournalPanel />)
    expect(tabLabels()).toEqual([de.journalPanel.entries, de.journalPanel.observations])
  })

  it('opens on the diary and switches on a click', () => {
    g().hearUtterance(COME)
    render(<JournalPanel />)
    expect(activeTab()).toBe(en.journalPanel.entries)
    openObservationsTab()
    expect(activeTab()).toBe(en.journalPanel.observations)
    fireEvent.click(document.querySelectorAll('.journal .journal-tab')[0])
    expect(activeTab()).toBe(en.journalPanel.entries)
  })

  it('switches on the keyboard shortcut too, and back again', () => {
    render(<JournalPanel />)
    fireEvent.keyDown(window, { code: 'KeyT' })
    expect(activeTab()).toBe(en.journalPanel.observations)
    fireEvent.keyDown(window, { code: 'KeyT' })
    expect(activeTab()).toBe(en.journalPanel.entries)
  })

  it('keeps only one panel in the DOM at a time', () => {
    g().hearUtterance(COME)
    render(<JournalPanel />)
    expect(document.querySelector('.journal .entries')).toBeInTheDocument()
    expect(document.querySelector('.journal .observations')).not.toBeInTheDocument()
    openObservationsTab()
    expect(document.querySelector('.journal .observations')).toBeInTheDocument()
    expect(document.querySelector('.journal .entries')).not.toBeInTheDocument()
  })

  it('lands on the diary again the next time the journal is opened', () => {
    render(<JournalPanel />)
    openObservationsTab()
    expect(activeTab()).toBe(en.journalPanel.observations)
    act(() => g().setJournalOpen(false))
    act(() => g().setJournalOpen(true))
    expect(activeTab()).toBe(en.journalPanel.entries)
  })

  it('writes no label in upper case, in the text or through the stylesheet', () => {
    g().hearUtterance(COME)
    render(<JournalPanel />)
    const labels = [...tabLabels(), firstHeardText()]
    openObservationsTab()
    labels.push(firstHeardText())
    for (const label of labels.filter((l) => l !== '')) {
      expect(label).not.toBe(label.toUpperCase())
    }
    // The stylesheet must not shout them either (the CSS never loads in jsdom,
    // so the rule blocks themselves are read).
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
    for (const selector of ['.journal-tab', '.first-heard']) {
      const blocks = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].filter(([, sel]) =>
        sel.includes(selector),
      )
      expect(blocks.length).toBeGreaterThan(0)
      for (const [, , body] of blocks) expect(body).not.toMatch(/text-transform:\s*uppercase/)
    }
  })
})

describe('first heard names its village (point 579)', () => {
  it('names the village an utterance was first heard in', () => {
    standIn('bambara-village')
    g().hearUtterance(COME)
    const { unmount } = render(<JournalPanel />)
    openObservationsTab()
    expect(firstHeardText()).toContain(en.places['bambara-village'])
    unmount()
    useLocale.getState().setLang('de')
    render(<JournalPanel />)
    openObservationsTab()
    expect(firstHeardText()).toContain(de.places['bambara-village'])
  })

  it('reads without a village, and with no placeholder, when none was recorded', () => {
    // An utterance heard out on the map — as every one recorded before the
    // village was tracked reads too.
    useGame.setState({ mode: 'travel', placeId: null })
    g().hearUtterance(COME)
    render(<JournalPanel />)
    openObservationsTab()
    const line = firstHeardText()
    expect(line).toBe(en.journalPanel.firstHeard(en.formatDate(Math.floor(g().day), START_YEAR)))
    expect(line).not.toMatch(/\?|—|unknown|\bin\s*$/i)
  })
})
