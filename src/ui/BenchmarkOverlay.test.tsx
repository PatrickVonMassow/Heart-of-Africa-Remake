// In-game render benchmark (design.md §21.1, F8): the HUD half — F8 starts the
// lazily loaded runner and suppresses the browser default, Esc aborts a run and
// closes the result, and the progress/result modal is localized in both
// languages. The measurement itself is scripts/verify/benchmark.mjs.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { Hud } from './Hud'
import { BenchmarkOverlay } from './BenchmarkOverlay'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { useGame } from '../state/store'
import { freshGame, withWorld } from '../test/store'

const startBenchmark = vi.fn(() => Promise.resolve())
vi.mock('../systems/benchmarkRun', () => ({
  startBenchmark: () => startBenchmark(),
}))

withWorld()

const progress = {
  config: 'ssao-off',
  configIndex: 3,
  configCount: 10,
  phase: 'desert-standing',
  framesDone: 900,
  framesTotal: 3000,
  remainingMs: 65000,
}

const reportFile = (aborted = false) => ({
  filename: 'hoa-bench-2026-07-24-webgpu.json',
  json: JSON.stringify({ summary: ['line one', 'line two'], rows: [] }),
  aborted,
})

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useGame.setState({ hasCheckpoint: false })
  useUi.setState({ benchProgress: null, benchReport: null, benchAbort: false, dialog: null, stateDumpOpen: false })
  startBenchmark.mockClear()
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.setState({ benchProgress: null, benchReport: null, benchAbort: false })
})

const keyDown = (code: string) => {
  const event = new KeyboardEvent('keydown', { code, cancelable: true })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

describe('F8 benchmark shortcut (design.md §21.1)', () => {
  it('starts the lazily loaded benchmark and prevents the browser default', async () => {
    render(<Hud />)
    const event = keyDown('F8')
    expect(event.defaultPrevented).toBe(true)
    // The runner is imported dynamically — let the import microtask settle.
    await act(async () => {
      await Promise.resolve()
    })
    expect(startBenchmark).toHaveBeenCalledTimes(1)
  })

  it('does not start a second run while one is in progress or its report is up', async () => {
    render(<Hud />)
    act(() => useUi.getState().setBenchProgress(progress))
    keyDown('F8')
    act(() => {
      useUi.getState().setBenchProgress(null)
      useUi.getState().setBenchReport(reportFile())
    })
    keyDown('F8')
    await act(async () => {
      await Promise.resolve()
    })
    expect(startBenchmark).not.toHaveBeenCalled()
  })

  it('Esc aborts a running benchmark, then closes the report', () => {
    render(<Hud />)
    act(() => useUi.getState().setBenchProgress(progress))
    keyDown('Escape')
    expect(useUi.getState().benchAbort).toBe(true)
    act(() => {
      useUi.getState().setBenchProgress(null)
      useUi.getState().setBenchReport(reportFile())
    })
    keyDown('Escape')
    expect(useUi.getState().benchReport).toBeNull()
  })
})

describe('benchmark overlay (design.md §21.1, §17.4)', () => {
  it('is absent while no benchmark runs', () => {
    render(<BenchmarkOverlay />)
    expect(document.querySelector('.bench-progress')).toBeNull()
    expect(document.querySelector('.bench-report')).toBeNull()
  })

  it('names the running config, the route section and the time left, in both languages', () => {
    render(<BenchmarkOverlay />)
    act(() => useUi.getState().setBenchProgress(progress))
    expect(document.querySelector('.bench-progress h3')?.textContent).toBe(en.benchmark.title)
    expect(document.querySelector('.bench-config')?.textContent).toBe(en.benchmark.config('ssao-off', 3, 10))
    expect(document.querySelector('.bench-phase')?.textContent).toBe(
      en.benchmark.phase(en.benchmark.phases.desertStanding),
    )
    expect(document.querySelector('.bench-remaining')?.textContent).toBe(en.benchmark.remaining('1:05'))
    expect(document.querySelector('.bench-abort-hint')?.textContent).toBe(en.benchmark.abortHint)
    // The progress bar tracks the fixed frame count.
    expect((document.querySelector('.bench-bar-fill') as HTMLElement).style.width).toBe('30%')
    act(() => useLocale.getState().setLang('de'))
    expect(document.querySelector('.bench-progress h3')?.textContent).toBe(de.benchmark.title)
    expect(document.querySelector('.bench-phase')?.textContent).toBe(
      de.benchmark.phase(de.benchmark.phases.desertStanding),
    )
  })

  it('labels the discarded warm-up pass instead of a config', () => {
    render(<BenchmarkOverlay />)
    act(() => useUi.getState().setBenchProgress({ ...progress, config: null }))
    expect(document.querySelector('.bench-config')?.textContent).toBe(en.benchmark.warmup)
  })

  it('shows the report digest with download, copy and close controls', () => {
    render(<BenchmarkOverlay />)
    act(() => useUi.getState().setBenchReport(reportFile()))
    expect(document.querySelector('.bench-report h3')?.textContent).toBe(en.benchmark.doneTitle)
    expect(document.querySelector('.bench-summary')?.textContent).toBe('line one\nline two')
    expect(document.querySelector('.bench-download')?.textContent).toBe(en.benchmark.download)
    expect(document.querySelector('.bench-copy')?.textContent).toBe(en.benchmark.copy)
    expect(document.querySelector('.bench-close')?.textContent).toBe(en.benchmark.close)
    expect(document.querySelector('.bench-aborted')).toBeNull()
    act(() => useUi.getState().setBenchReport(reportFile(true)))
    expect(document.querySelector('.bench-aborted')?.textContent).toBe(en.benchmark.abortedNote)
  })

  it('the close button clears the report', () => {
    render(<BenchmarkOverlay />)
    act(() => useUi.getState().setBenchReport(reportFile()))
    act(() => {
      ;(document.querySelector('.bench-close') as HTMLButtonElement).click()
    })
    expect(useUi.getState().benchReport).toBeNull()
    expect(document.querySelector('.bench-report')).toBeNull()
  })
})
