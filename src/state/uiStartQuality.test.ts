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

describe('first-start adapter pick (point 1562)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('picks low for a weak adapter on a plain first start', async () => {
    const { useUi } = await storeAt('')
    useUi.getState().pickStartDetailLevel('amd rdna-2', 1.75)
    expect(useUi.getState().detailLevel).toBe('low')
    expect(useUi.getState().detailLevelSource).toBe('auto')
  })

  it('keeps medium for a strong adapter', async () => {
    const { useUi } = await storeAt('')
    useUi.getState().pickStartDetailLevel('nvidia lovelace', 1)
    expect(useUi.getState().detailLevel).toBe('medium')
  })

  it('never overrides a URL-given level', async () => {
    const { useUi } = await storeAt('?quality=high')
    useUi.getState().pickStartDetailLevel('intel gen-8', 1)
    expect(useUi.getState().detailLevel).toBe('high')
    expect(useUi.getState().detailLevelSource).toBe('url')
  })

  it("never overrides the player's choice, before or after the pick", async () => {
    const { useUi } = await storeAt('')
    useUi.getState().setDetailLevel('high')
    useUi.getState().pickStartDetailLevel('intel gen-8', 1)
    expect(useUi.getState().detailLevel).toBe('high')

    const second = (await storeAt('')).useUi
    second.getState().pickStartDetailLevel('intel gen-8', 1)
    second.getState().cycleDetailLevel() // low -> high
    second.getState().pickStartDetailLevel('intel gen-8', 1) // a renderer remount
    expect(second.getState().detailLevel).toBe('high')
    expect(second.getState().detailLevelSource).toBe('player')
  })

  it('leaves an unreadable adapter undecided for a later remount', async () => {
    const { useUi } = await storeAt('')
    useUi.getState().pickStartDetailLevel('unknown', 2)
    expect(useUi.getState().detailLevelSource).toBe('default')
    useUi.getState().pickStartDetailLevel('intel gen-8', 1)
    expect(useUi.getState().detailLevel).toBe('low')
  })

  it('picks only once, so a remount does not re-decide', async () => {
    const { useUi } = await storeAt('')
    useUi.getState().pickStartDetailLevel('nvidia lovelace', 1)
    useUi.getState().pickStartDetailLevel('intel gen-8', 1)
    expect(useUi.getState().detailLevel).toBe('medium')
  })
})
