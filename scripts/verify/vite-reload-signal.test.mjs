import { describe, expect, it } from 'vitest'
import { isViteReloadSignal, splitConsoleErrors } from './vite-reload-signal.mjs'

const SIGNAL = 'Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)'

describe('the console-error filter sets apart only vite\'s optimize-dep reload signal', () => {
  it('reads the 504 Outdated Optimize Dep resource error as the reload signal', () => {
    expect(isViteReloadSignal(SIGNAL)).toBe(true)
  })

  it('keeps a genuine resource error, another 504 and a page error as failures', () => {
    expect(isViteReloadSignal('Failed to load resource: the server responded with a status of 404 (Not Found)')).toBe(false)
    expect(isViteReloadSignal('Failed to load resource: the server responded with a status of 504 (Gateway Timeout)')).toBe(false)
    expect(isViteReloadSignal("TypeError: Cannot read properties of null (reading 'getSupportedExtensions')")).toBe(false)
    expect(isViteReloadSignal(`${SIGNAL} and then something else`)).toBe(false)
  })

  it('splits a mixed list without dropping a failure', () => {
    const real = 'Failed to load resource: net::ERR_CONNECTION_REFUSED'
    expect(splitConsoleErrors([SIGNAL, real, SIGNAL])).toEqual({ failures: [real], reloadSignals: [SIGNAL, SIGNAL] })
  })
})
