// Dev-mode long-frame detector (docs/perf-1523-findings.md): window closing,
// owner attribution and the soft (warn, never error) report.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../config/balance'
import { closeFrameWindow, frameOwner, markFrameWork, resetFrameWindow } from './longFrame'

beforeEach(() => {
  resetFrameWindow()
  delete (window as unknown as { __longFrameLog?: unknown }).__longFrameLog
})
afterEach(() => vi.restoreAllMocks())

describe('frameOwner', () => {
  it('names the system with the most work when it owns a real share', () => {
    expect(frameOwner(500, { 'shader-programs': 420, 'terrain-stream': 3 }, 0.25)).toBe('shader-programs')
  })
  it('reports unattributed when no instrumented system owns the share', () => {
    expect(frameOwner(500, { 'terrain-stream': 20 }, 0.25)).toBe('unattributed')
    expect(frameOwner(500, {}, 0.25)).toBe('unattributed')
  })
})

describe('closeFrameWindow', () => {
  it('stays silent for ordinary frames and reports a long one with its owner', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(closeFrameWindow(1000)).toBeNull() // opens the first window
    markFrameWork('flora-stream', 2)
    expect(closeFrameWindow(1016)).toBeNull()
    markFrameWork('shader-programs', 300)
    markFrameWork('terrain-stream', 4)
    const long = 1016 + balance.travelFrame.longFrameMs + 300
    const report = closeFrameWindow(long)
    expect(report?.owner).toBe('shader-programs')
    expect(report?.work['terrain-stream']).toBe(4)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('shader-programs')
    // Soft by design: a long frame never raises the assert channel.
    expect(error).not.toHaveBeenCalled()
    expect((window as unknown as { __longFrameLog: unknown[] }).__longFrameLog).toHaveLength(1)
  })
  it('clears the window work after closing it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    closeFrameWindow(0)
    markFrameWork('shader-programs', 300)
    closeFrameWindow(10)
    const report = closeFrameWindow(10 + balance.travelFrame.longFrameMs)
    expect(report?.owner).toBe('unattributed')
  })
})
