import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import type { DigSiteProgress } from './adultWork'

// Execute the scene's callback without mounting a renderer. This checks the
// actual ordering of live ground, durable store, and React mesh updates.
const source = readFileSync('src/scenes/place/PlaceScene.tsx', 'utf8')
const marker = 'const onDigProgress = useCallback((progress: readonly DigSiteProgress[]) => {'
const start = source.indexOf(marker)
const end = source.indexOf('\n  }, [ground, placeId, seed])', start)
if (start < 0 || end < 0) throw new Error('Dig progress callback missing')
const report = new Function('ground', 'placeId', 'seed', 'useGame', 'shownProgress', 'setDigProgress', 'progress',
  source.slice(start + marker.length, end))

it('keeps live ground current at 60 Hz and persists only strikes and completion', () => {
  const initial = [{ dug: 0, strikes: 0 }]
  const ground = { progress: initial as readonly DigSiteProgress[] }
  const shown = { current: ground.progress }
  const recordVillageDig = vi.fn()
  const setDigProgress = vi.fn()
  const useGame = { getState: () => ({ seed: 42, placeId: 'village', recordVillageDig }) }
  const tick = (progress: DigSiteProgress[]) => {
    report(ground, 'village', 42, useGame, shown, setDigProgress, progress)
    expect(ground.progress).toBe(progress)
  }
  for (let f = 1; f < 60; f++) tick([{ dug: f / 60, strikes: 0 }])
  expect(recordVillageDig).not.toHaveBeenCalled()
  expect(setDigProgress).not.toHaveBeenCalled()
  tick([{ dug: 1, strikes: 1 }])
  expect(recordVillageDig).toHaveBeenCalledExactlyOnceWith('village', ground.progress)
  expect(setDigProgress).toHaveBeenCalledExactlyOnceWith(ground.progress)
  for (let f = 61; f < 120; f++) tick([{ dug: f / 60, strikes: 1 }])
  expect(recordVillageDig).toHaveBeenCalledTimes(1)
  tick([{ dug: 2, strikes: 1, completed: true }])
  expect(recordVillageDig).toHaveBeenCalledTimes(2)
  expect(setDigProgress).toHaveBeenCalledTimes(2)
  expect(shown.current).toBe(ground.progress)
})

it('does not persist a stale callback into another visit or seed', () => {
  for (const current of [{ seed: 43, placeId: 'village' }, { seed: 42, placeId: 'elsewhere' }]) {
    const recordVillageDig = vi.fn()
    report({ progress: [] }, 'village', 42,
      { getState: () => ({ ...current, recordVillageDig }) }, { current: [] }, vi.fn(),
      [{ dug: 1, strikes: 1 }])
    expect(recordVillageDig).not.toHaveBeenCalled()
  }
})
