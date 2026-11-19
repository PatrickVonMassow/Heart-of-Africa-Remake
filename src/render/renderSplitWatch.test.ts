// The render-submit split (docs/perf-1543-driving-hitches.md): render kinds and
// exclusive (nested-subtracted) timing of renderer.render calls.
import { describe, expect, it, vi } from 'vitest'
import { renderKind, uploadBytes, uploadOwner, watchRenderSplit } from './renderSplitWatch'
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
      render(_scene: unknown, camera: unknown): void {
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

  it('counts upload bytes by update ranges, else the whole array', () => {
    const array = new Float32Array(1000)
    expect(uploadBytes({ array, updateRanges: [] })).toBe(4000)
    expect(uploadBytes({ array, updateRanges: [{ start: 0, count: 16 }, { start: 32, count: 4 }] })).toBe(80)
    expect(uploadBytes({ data: { array, updateRanges: [] } })).toBe(4000)
  })

  it('names the scene object and attribute that own an uploaded array', () => {
    const m = new Float32Array(16)
    const pos = new Float32Array(3)
    const root = {
      type: 'Scene',
      children: [{ name: 'flora-bush', instanceMatrix: { array: m } }, { type: 'Mesh', geometry: { attributes: { position: { array: pos } } } }],
    }
    expect(uploadOwner(root, m)).toBe('flora-bush.instanceMatrix')
    expect(uploadOwner(root, pos)).toBe('Mesh.position')
    expect(uploadOwner(root, new Float32Array(1))).toBe('?')
    expect(uploadOwner(null, m)).toBe('?')
  })

  it('arms the upload booking once the backend appears, re-arms on fresh utils, and counts', () => {
    const renderer: {
      backend?: { attributeUtils: { updateAttribute: (a: unknown) => void } }
      render: (scene?: unknown, camera?: unknown) => void
    } = {
      render() {
        renderer.backend?.attributeUtils.updateAttribute({ array: new Float32Array(4), updateRanges: [] })
      },
    }
    const g = globalThis as unknown as { __uploadBookings?: number }
    g.__uploadBookings = 0
    takeFrameLedger()
    const restore = watchRenderSplit(renderer)
    renderer.render({}, {}) // no backend yet: nothing to arm, nothing booked
    renderer.backend = { attributeUtils: { updateAttribute: () => {} } }
    renderer.render({}, {})
    renderer.render({}, {})
    expect(g.__uploadBookings).toBe(2)
    expect((takeFrameLedger() as Record<string, number>)['gpu:upload small']).toBeGreaterThanOrEqual(0)
    renderer.backend = { attributeUtils: { updateAttribute: () => {} } } // a re-initialised backend
    renderer.render({}, {})
    expect(g.__uploadBookings).toBe(3)
    restore()
  })
})
