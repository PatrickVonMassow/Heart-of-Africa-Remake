// The render-submit split (docs/perf-1543-driving-hitches.md): render kinds and
// exclusive (nested-subtracted) timing of renderer.render calls.
import { describe, expect, it, vi } from 'vitest'
import { renderKind, watchRenderSplit } from './renderSplitWatch'
import { takeFrameLedger } from '../systems/longFrame'

describe('renderSplitWatch', () => {
  it('classifies renders by scene and camera', () => {
    expect(renderKind({ isMesh: true }, { isOrthographicCamera: true })).toBe('render:quad')
    expect(renderKind({ isScene: true, children: [1] }, { isPerspectiveCamera: true })).toBe('render:main')
    expect(renderKind({ isScene: true }, { isOrthographicCamera: true })).toBe('render:shadow')
  })

  it('books each render exclusive of the renders nested inside it, and restores', () => {
    let t = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => t)
    const big = { isScene: true }
    const main = { isPerspectiveCamera: true }
    const shadowCam = { isOrthographicCamera: true }
    const renderer = {
      render(scene: unknown, camera: unknown): void {
        if (camera === main) {
          t += 2
          renderer.render(big, shadowCam) // the shadow pass nested in the main render
          t += 3
        } else {
          t += 4
        }
      },
    }
    const original = renderer.render
    takeFrameLedger()
    const restore = watchRenderSplit(renderer)
    renderer.render(big, main)
    const ledger = takeFrameLedger()
    expect(ledger['render:main']).toBe(5)
    expect(ledger['render:shadow']).toBe(4)
    restore()
    expect(renderer.render).toBe(original)
    spy.mockRestore()
  })
})
