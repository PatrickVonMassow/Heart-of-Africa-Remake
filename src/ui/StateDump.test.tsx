// F6 bug report (design.md §21.1, §17.4/§17.5): hidden by default; F6 opens
// the top-most modal with the description field focused, the complete-state
// JSON and the report/state/copy/close controls; the typed description reaches
// the assembled archive; Esc closes without leaving focus on a control; the F6
// default is prevented (F5 was abandoned — the browser reloads before
// preventDefault can run).
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
  clicks.splice(0).forEach((c) => c.mockRestore())
})

const dump = () => document.querySelector('.state-dump')
const jsonText = () => document.querySelector('.state-dump-json')?.textContent ?? ''
const field = () => document.querySelector<HTMLTextAreaElement>('.state-dump-description')!

/** Captures what the download anchor was handed, without touching the disk. */
function captureDownload(): { blobs: Blob[]; names: string[] } {
  const blobs: Blob[] = []
  const names: string[] = []
  const createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b)
    return 'blob:test'
  })
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
  clicks.push(click)
  return { blobs, names }
}
const clicks: Array<{ mockRestore: () => void }> = []

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

  it('offers the description field with its localized label and hint', () => {
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    expect(document.querySelector('.state-dump-label')?.textContent).toBe(en.stateDump.descriptionLabel)
    expect(field().placeholder).toBe(en.stateDump.descriptionPlaceholder)
    expect(document.querySelector('.state-dump-contents')?.textContent).toBe(en.stateDump.contents)
    act(() => useLocale.getState().setLang('de'))
    expect(document.querySelector('.state-dump-label')?.textContent).toBe(de.stateDump.descriptionLabel)
    expect(field().placeholder).toBe(de.stateDump.descriptionPlaceholder)
  })

  it('renders the report, download, copy and close controls (localized, both languages)', () => {
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    expect(document.querySelector('.state-dump-report')?.textContent).toBe(en.stateDump.downloadReport)
    expect(document.querySelector('.state-dump-download')?.textContent).toBe(en.stateDump.download)
    expect(document.querySelector('.state-dump-copy')?.textContent).toBe(en.stateDump.copy)
    expect(document.querySelector('.state-dump-close')?.textContent).toBe(en.stateDump.close)
    expect(document.querySelector('.state-dump h3')?.textContent).toBe(en.stateDump.title)
    act(() => useLocale.getState().setLang('de'))
    expect(document.querySelector('.state-dump-report')?.textContent).toBe(de.stateDump.downloadReport)
    expect(document.querySelector('.state-dump-download')?.textContent).toBe(de.stateDump.download)
    expect(document.querySelector('.state-dump h3')?.textContent).toBe(de.stateDump.title)
  })

  it('hands the browser one .zip named from the state dump stem', async () => {
    const seen = captureDownload()
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    fireEvent.click(document.querySelector('.state-dump-report')!)
    expect(seen.names).toHaveLength(1)
    expect(seen.names[0]).toMatch(new RegExp(`^hoa-state-\\d{4}-\\d{2}-\\d{2}-${useGame.getState().seed}\\.zip$`))
    expect(seen.blobs[0].type).toBe('application/zip')
    expect(seen.blobs[0].size).toBeGreaterThan(200)
    // A real archive, not an empty envelope: the members carry the stem.
    const text = new TextDecoder().decode(await seen.blobs[0].arrayBuffer())
    expect(text).toContain('.json')
    expect(text).toContain('.txt')
    expect(text).toContain('-overlay.json')
  })

  it('carries the typed description into the archive', async () => {
    const seen = captureDownload()
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    fireEvent.change(field(), { target: { value: 'The Giza label is drawn twice.' } })
    fireEvent.click(document.querySelector('.state-dump-report')!)
    const text = new TextDecoder().decode(await seen.blobs[0].arrayBuffer())
    // STORE (uncompressed), so the words appear verbatim in the archive.
    expect(text).toContain('The Giza label is drawn twice.')
    expect(text).toContain(en.stateDump.report.reproduction)
  })

  it('writes the description file in the chosen language', async () => {
    const seen = captureDownload()
    render(<StateDump />)
    act(() => useLocale.getState().setLang('de'))
    act(() => useUi.getState().toggleStateDump())
    fireEvent.click(document.querySelector('.state-dump-report')!)
    const text = new TextDecoder().decode(await seen.blobs[0].arrayBuffer())
    expect(text).toContain(de.stateDump.report.environment)
    expect(text).toContain(de.stateDump.report.noDescription)
  })

  it('reports without a picture rather than not at all when the capture fails', async () => {
    // jsdom renders no canvas, so captureRenderedFrame yields nothing —
    // exactly the failed-capture path.
    const seen = captureDownload()
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    fireEvent.click(document.querySelector('.state-dump-report')!)
    const text = new TextDecoder().decode(await seen.blobs[0].arrayBuffer())
    expect(text).toContain(en.stateDump.report.pictureMissing)
    expect(text).not.toContain('.png')
  })

  it('the state-only download still saves the plain JSON', () => {
    const seen = captureDownload()
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    fireEvent.click(document.querySelector('.state-dump-download')!)
    expect(seen.names[0]).toMatch(/\.json$/)
    expect(seen.blobs[0].type).toBe('application/json')
  })

  it('puts the reproduction fields at the top of the JSON it shows', () => {
    render(<StateDump />)
    act(() => useUi.getState().toggleStateDump())
    const parsed = JSON.parse(jsonText())
    expect(parsed.summary.seed).toBe(useGame.getState().seed)
    expect(parsed.summary.pos).toEqual(useGame.getState().pos)
    expect(parsed.summary.region).toBeTruthy()
    expect(parsed.summary.inGameDate).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    expect(parsed.summary.travelSpeed).toBeGreaterThan(0)
    expect(parsed.summary.detailLevel).toBe(useUi.getState().detailLevel)
    expect(parsed.env.backend).toBeTruthy()
    expect(Object.keys(parsed).indexOf('summary')).toBeLessThan(Object.keys(parsed).indexOf('game'))
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
  it('F6 opens the report with the description field focused, and closes it again', () => {
    render(<Hud />)
    expect(dump()).toBeNull()
    fireEvent.keyDown(window, { code: 'F6' })
    expect(dump()).not.toBeNull()
    // The one deliberate exception to §17.5: the user should be able to type
    // what went wrong immediately, without hunting for the field.
    expect(document.activeElement).toBe(field())
    fireEvent.keyDown(window, { code: 'F6' })
    expect(dump()).toBeNull()
  })

  it('Esc closes an open report and leaves focus on no control', () => {
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F6' })
    expect(dump()).not.toBeNull()
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(dump()).toBeNull()
    const tag = document.activeElement?.tagName ?? 'BODY'
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']).not.toContain(tag)
  })

  it('Esc closes it from inside the description field too (game keys ignore a typing target)', () => {
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F6' })
    fireEvent.change(field(), { target: { value: 'typing…' } })
    fireEvent.keyDown(field(), { key: 'Escape', code: 'Escape' })
    expect(dump()).toBeNull()
    const tag = document.activeElement?.tagName ?? 'BODY'
    expect(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']).not.toContain(tag)
  })

  it('typing in the description field does not drive the game (no month jump on the number row)', () => {
    render(<Hud />)
    const dayBefore = useGame.getState().day
    fireEvent.keyDown(window, { code: 'F6' })
    fireEvent.keyDown(field(), { key: '5', code: 'Digit5' })
    expect(useGame.getState().day).toBe(dayBefore)
    expect(dump()).not.toBeNull()
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
