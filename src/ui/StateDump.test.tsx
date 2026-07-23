// F6 state-dump popup (design.md §21.1, §17.4/§17.5): hidden by default; F6
// toggles the top-most modal showing the complete-state JSON with download/
// copy/close controls; Esc closes it; the F6 default is prevented (F5 was
// abandoned — the browser reloads before preventDefault can run); and
// toggling never moves focus onto a control.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { Hud } from './Hud'
import { StateDump } from './StateDump'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { useGame } from '../state/store'
import { freshGame, withWorld } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useGame.setState({ hasCheckpoint: false })
  useUi.setState({ stateDumpOpen: false, dialog: null, prompt: null, mapOpen: false, debugOpen: false })
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.setState({ stateDumpOpen: false })
})

const dump = () => document.querySelector('.state-dump')
const jsonText = () => document.querySelector('.state-dump-json')?.textContent ?? ''

describe('StateDump popup (design.md §21.1, F6)', () => {
  it('is hidden by default and shown when toggled, with the state as JSON', () => {
    render(<StateDump />)
    expect(dump()).toBeNull()
    act(() => useUi.getState().toggleStateDump())
    expect(dump()).not.toBeNull()
    const parsed = JSON.parse(jsonText())
    expect(parsed.game.seed).toBe(useGame.getState().seed)
    expect(parsed.game.mode).toBe(useGame.getState().mode)
    // The transient UI state rides along (it holds the popup flag itself).
    expect(parsed.ui.stateDumpOpen).toBe(true)
  })

  it('renders the download, copy and close controls (localized, both languages)', () => {
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    expect(document.querySelector('.state-dump-download')?.textContent).toBe(en.stateDump.download)
    expect(document.querySelector('.state-dump-copy')?.textContent).toBe(en.stateDump.copy)
    expect(document.querySelector('.state-dump-close')?.textContent).toBe(en.stateDump.close)
    expect(document.querySelector('.state-dump h3')?.textContent).toBe(en.stateDump.title)
    act(() => useLocale.getState().setLang('de'))
    expect(document.querySelector('.state-dump-download')?.textContent).toBe(de.stateDump.download)
    expect(document.querySelector('.state-dump h3')?.textContent).toBe(de.stateDump.title)
  })

  it('the close button hides the popup', () => {
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    fireEvent.click(document.querySelector('.state-dump-close')!)
    expect(dump()).toBeNull()
    expect(useUi.getState().stateDumpOpen).toBe(false)
  })

  it('the copy button writes the JSON to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    fireEvent.click(document.querySelector('.state-dump-copy')!)
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"seed"'))
  })

  it('sits on the top-most modal layer (§17.4: dialog-backdrop wrapper)', () => {
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    expect(document.querySelector('.state-dump-backdrop')?.classList.contains('dialog-backdrop')).toBe(true)
  })
})

describe('F6 wiring in the Hud (design.md §21.1)', () => {
  it('F6 toggles the popup open and closed without moving focus onto a control', () => {
    render(<Hud />)
    expect(dump()).toBeNull()
    fireEvent.keyDown(window, { code: 'F6' })
    expect(dump()).not.toBeNull()
    // §17.5: opening must not shift focus onto any control.
    const tag = document.activeElement?.tagName ?? 'BODY'
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']).not.toContain(tag)
    fireEvent.keyDown(window, { code: 'F6' })
    expect(dump()).toBeNull()
  })

  it('Esc closes an open popup', () => {
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F6' })
    expect(dump()).not.toBeNull()
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(dump()).toBeNull()
  })

  it('prevents the browser default on F6 while the game has focus', () => {
    render(<Hud />)
    const e = new KeyboardEvent('keydown', { code: 'F6', cancelable: true, bubbles: true })
    act(() => {
      window.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(true)
  })

  it('F5 stays with the browser: it neither opens the popup nor is prevented', () => {
    render(<Hud />)
    const e = new KeyboardEvent('keydown', { code: 'F5', cancelable: true, bubbles: true })
    act(() => {
      window.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(false)
    expect(dump()).toBeNull()
  })
})
