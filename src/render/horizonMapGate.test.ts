// The fetch gate of the horizon maps (design.md §2.7): no request at low,
// exactly one when the level rises, none again on a second rise.
import { describe, it, expect, vi } from 'vitest'
import { createHorizonMapGate } from './horizonMapGate'
import { QUALITY_PRESETS, type DetailLevel } from '../config/quality'

const wants = (level: DetailLevel) => QUALITY_PRESETS[level].horizonMaps

describe('horizon map fetch gate', () => {
  it('issues no request at low', () => {
    const load = vi.fn(() => Promise.resolve('maps'))
    const gate = createHorizonMapGate(load)
    expect(gate.update(wants('low'))).toBeNull()
    expect(gate.update(wants('low'))).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('issues exactly one request when the level rises, and none on a second rise', async () => {
    const load = vi.fn(() => Promise.resolve('maps'))
    const gate = createHorizonMapGate(load)
    gate.update(wants('low'))
    const first = gate.update(wants('medium'))
    expect(load).toHaveBeenCalledTimes(1)
    await expect(first).resolves.toBe('maps')
    gate.update(wants('high'))
    gate.update(wants('low'))
    const again = gate.update(wants('medium'))
    expect(load).toHaveBeenCalledTimes(1)
    expect(again).toBe(first)
    expect(gate.requests).toBe(1)
  })

  it('does not block the level switch: the request returns at once, unresolved', () => {
    let resolve!: (v: string) => void
    const gate = createHorizonMapGate(() => new Promise<string>((r) => (resolve = r)))
    const p = gate.update(true)
    expect(p).toBeInstanceOf(Promise)
    resolve('maps')
  })

  it('retries after a failed load on the next rise', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('maps')
    const gate = createHorizonMapGate(load)
    await expect(gate.update(true)).rejects.toThrow('offline')
    await expect(gate.update(true)).resolves.toBe('maps')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
