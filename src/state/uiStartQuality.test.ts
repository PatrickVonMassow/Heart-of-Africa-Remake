// The UI store seeds its graphics level from ?quality= at module load, so the
// first rendered frame is already at the linked level (design.md §21.1).
// Each case re-imports the store under a fresh URL.
import { afterEach, describe, expect, it, vi } from 'vitest'

async function storeAt(search: string) {
  window.history.replaceState(null, '', `/${search}`)
  vi.resetModules()
  return import('./ui')
}

describe('ui store start level from the URL', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('opens at low with sun shadows off', async () => {
    const { useUi, effectiveShadows } = await storeAt('?quality=low')
    expect(useUi.getState().detailLevel).toBe('low')
    expect(effectiveShadows(useUi.getState())).toBe(false)
  })

  it('opens at high with SSAO on', async () => {
    const { useUi, effectiveSsao } = await storeAt('?bench=short&quality=HIGH')
    expect(useUi.getState().detailLevel).toBe('high')
    expect(effectiveSsao(useUi.getState())).toBe(true)
  })

  it('keeps medium for an unknown or missing value', async () => {
    expect((await storeAt('?quality=ultra')).useUi.getState().detailLevel).toBe('medium')
    expect((await storeAt('')).useUi.getState().detailLevel).toBe('medium')
  })
})
