// JournalPanel HUD component (CLAUDE.md §7.1 pt. 17/19, design.md §15/§16).
// Ports the render-side asserts of voice.mjs and i18n.mjs into React Testing
// Library checks (jsdom): the journal never shows a voice marker, prose stays
// intact, the read-aloud control is offered for English only. The actual TTS
// audio and handwriting animation stay in Playwright.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { JournalPanel } from './JournalPanel'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { freshGame, g } from '../test/store'

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
