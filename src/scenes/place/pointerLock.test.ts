// Who owns the cursor in a settlement (design.md §2.3/§17.5, work-order point
// 588). The real OS lock is a browser matter; what is decided here is WHEN the
// game asks for it and when it gives it back — and that decision is what the
// headless check reads, since pointer lock is deliberately never engaged under
// automation.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pointerLockProbe, releasePointerLock, requestPlacePointerLock } from './pointerLock'
import { useUi } from '../../state/ui'

const canvas = () => document.querySelector('canvas') as HTMLCanvasElement

beforeEach(() => {
  document.body.innerHTML = '<canvas></canvas>'
  useUi.getState().setDialog(null)
  pointerLockProbe.grabs = 0
  pointerLockProbe.releases = 0
  Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true })
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
})

describe('taking and giving back the pointer (point 588)', () => {
  it('asks for the lock in a plain settlement view', () => {
    const request = vi.fn()
    canvas().requestPointerLock = request
    requestPlacePointerLock(canvas())
    expect(request).toHaveBeenCalled()
    expect(pointerLockProbe.grabs).toBe(1)
  })

  it('never takes the cursor a modal dialog needs', () => {
    const request = vi.fn()
    canvas().requestPointerLock = request
    useUi.getState().setDialog({ kind: 'speechGuess', speakerId: 'kid-1', atoms: ['ba-ba'] })
    requestPlacePointerLock(canvas())
    expect(request).not.toHaveBeenCalled()
    expect(pointerLockProbe.grabs).toBe(0)
  })

  it('never takes the cursor a full-screen overlay needs', () => {
    const request = vi.fn()
    canvas().requestPointerLock = request
    document.body.insertAdjacentHTML('beforeend', '<div class="overlay"></div>')
    requestPlacePointerLock(canvas())
    expect(request).not.toHaveBeenCalled()
  })

  it('records the decision but skips the real lock under browser automation', () => {
    const request = vi.fn()
    canvas().requestPointerLock = request
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    requestPlacePointerLock(canvas())
    expect(pointerLockProbe.grabs).toBe(1)
    expect(request).not.toHaveBeenCalled()
  })

  it('gives the cursor back when a dialog takes over', () => {
    const exit = vi.fn()
    document.exitPointerLock = exit
    Object.defineProperty(document, 'pointerLockElement', { value: canvas(), configurable: true })
    releasePointerLock()
    expect(exit).toHaveBeenCalled()
    expect(pointerLockProbe.releases).toBe(1)
  })

  it('records the release even where no lock was held — the automation lane', () => {
    const exit = vi.fn()
    document.exitPointerLock = exit
    releasePointerLock()
    expect(exit).not.toHaveBeenCalled()
    expect(pointerLockProbe.releases).toBe(1)
  })

  it('does not re-request a lock it already holds', () => {
    const request = vi.fn()
    canvas().requestPointerLock = request
    Object.defineProperty(document, 'pointerLockElement', { value: canvas(), configurable: true })
    requestPlacePointerLock(canvas())
    expect(request).not.toHaveBeenCalled()
  })
})
