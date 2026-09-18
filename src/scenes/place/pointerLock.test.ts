// Who owns the cursor in a settlement (design.md §2.3/§17.5, work-order point
// 588). The real OS lock is a browser matter; what is decided here is WHEN the
// game asks for it and when it gives it back — and that decision is what the
// headless check reads, since pointer lock is deliberately never engaged under
// automation.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPlacePointerLock, pointerLockProbe, releasePointerLock, requestPlacePointerLock, restorePointerLockAfterDialogs } from './pointerLock'
import { useUi, type Dialog } from '../../state/ui'

const canvas = () => document.querySelector('canvas') as HTMLCanvasElement

beforeEach(() => {
  document.body.innerHTML = '<canvas></canvas>'
  useUi.getState().setDialog(null)
  pointerLockProbe.grabs = 0
  pointerLockProbe.releases = 0
  pointerLockProbe.refusals = 0
  Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true })
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
})

describe('recovering a refused settlement lock', () => {
  let lock: ReturnType<typeof createPlacePointerLock>

  beforeEach(() => {
    vi.useFakeTimers()
    lock = createPlacePointerLock(canvas())
  })

  afterEach(() => {
    lock.dispose()
    vi.useRealTimers()
  })

  const errorEvent = () => document.dispatchEvent(new Event('pointerlockerror'))
  const setLock = (element: Element | null) => {
    Object.defineProperty(document, 'pointerLockElement', { value: element, configurable: true })
    document.dispatchEvent(new Event('pointerlockchange'))
  }

  it.each(['promise', 'event', 'throw'])('retries a %s refusal only once after 1.1 seconds', async (signal) => {
    const request = vi.fn(() => {
      if (signal === 'promise') return Promise.reject(new Error('Escape cooldown'))
      if (signal === 'throw') throw new Error('Escape cooldown')
    })
    canvas().requestPointerLock = request
    lock.request()
    if (signal === 'event') errorEvent()
    await Promise.resolve()
    expect(pointerLockProbe.refusals).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1099)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(2)
    if (signal === 'event') errorEvent()
    expect(pointerLockProbe.refusals).toBe(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(request).toHaveBeenCalledTimes(2)
    expect(pointerLockProbe.grabs).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['event-first', 'promise-first'])('deduplicates the event and rejected promise (%s)', async (order) => {
    const request = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    canvas().requestPointerLock = request
    lock.request()
    if (order === 'promise-first') await Promise.resolve()
    errorEvent()
    await Promise.resolve()
    errorEvent()
    expect(pointerLockProbe.refusals).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1100)
    errorEvent()
    expect(pointerLockProbe.refusals).toBe(2)
    expect(request).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['dialog', 'scene cleanup', 'lock granted', 'overlay'])('drops the retry on %s', async (reason) => {
    const request = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    canvas().requestPointerLock = request
    lock.request()
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)
    if (reason === 'dialog') {
      useUi.getState().setDialog(dialogs.trade)
      useUi.getState().setDialog(null)
    } else if (reason === 'scene cleanup') {
      lock.dispose()
      lock.request()
      errorEvent()
    } else if (reason === 'lock granted') {
      setLock(canvas())
      setLock(null)
    } else {
      document.body.insertAdjacentHTML('beforeend', '<div class="overlay"></div>')
    }
    await vi.advanceTimersByTimeAsync(1100)
    expect(request).toHaveBeenCalledTimes(1)
    expect(pointerLockProbe.refusals).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['dialog', 'scene cleanup', 'lock granted', 'overlay'])('does not arm a late rejection after %s', async (reason) => {
    const request = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    canvas().requestPointerLock = request
    lock.request()
    if (reason === 'dialog') {
      useUi.getState().setDialog(dialogs.trade)
      useUi.getState().setDialog(null)
    } else if (reason === 'scene cleanup') lock.dispose()
    else if (reason === 'lock granted') {
      setLock(canvas())
      setLock(null)
    } else document.body.insertAdjacentHTML('beforeend', '<div class="overlay"></div>')
    await Promise.resolve()
    expect(pointerLockProbe.refusals).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(1100)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps webdriver on the decision-only path even if an error event arrives', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    const request = vi.fn()
    canvas().requestPointerLock = request
    lock.request()
    errorEvent()
    await vi.advanceTimersByTimeAsync(5000)
    expect(request).not.toHaveBeenCalled()
    expect(pointerLockProbe.grabs).toBe(1)
    expect(pointerLockProbe.refusals).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves a successful first click immediate with no retry', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    canvas().requestPointerLock = request
    lock.request()
    expect(request).toHaveBeenCalledTimes(1)
    setLock(canvas())
    await vi.advanceTimersByTimeAsync(5000)
    expect(request).toHaveBeenCalledTimes(1)
    expect(pointerLockProbe.refusals).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('replaces a pending retry when another deliberate request succeeds', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('Escape cooldown')).mockResolvedValue(undefined)
    canvas().requestPointerLock = request
    lock.request()
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)
    lock.request()
    setLock(canvas())
    await vi.advanceTimersByTimeAsync(5000)
    expect(request).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('recovers a refused dialog-close request without another click', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('Escape cooldown')).mockResolvedValue(undefined)
    canvas().requestPointerLock = request
    const off = restorePointerLockAfterDialogs(canvas(), lock.request)
    try {
      useUi.getState().setDialog(dialogs.trade)
      useUi.getState().setDialog(null)
      await Promise.resolve()
      expect(pointerLockProbe.refusals).toBe(1)
      await vi.advanceTimersByTimeAsync(1100)
      expect(request).toHaveBeenCalledTimes(2)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      off()
    }
  })
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

  it('records a rejected request', async () => {
    canvas().requestPointerLock = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    requestPlacePointerLock(canvas())
    await Promise.resolve()
    expect(pointerLockProbe.refusals).toBe(1)
  })

  it('records a synchronous refusal', () => {
    canvas().requestPointerLock = vi.fn(() => { throw new Error('Unavailable') })
    expect(() => requestPlacePointerLock(canvas())).not.toThrow()
    expect(pointerLockProbe.refusals).toBe(1)
  })
})


// Exhaustive by kind: a new dialog must join this regression table.
const dialogs = {
  trade: { kind: 'trade', building: 'market' },
  bazaar: { kind: 'bazaar' },
  agency: { kind: 'agency' },
  camp: { kind: 'camp', scope: 'village', placeId: 'maasai-village' },
  drumMessage: { kind: 'drumMessage' },
  speechGuess: { kind: 'speechGuess', speakerId: 'kid-1', atoms: ['ba-ba'] },
} satisfies Record<NonNullable<Dialog>['kind'], NonNullable<Dialog>>

describe('restoring settlement steering after dialogs', () => {
  it.each([...Object.values(dialogs), { kind: 'camp', scope: 'free', campId: 1 } as const])(
    'requests exactly once when $kind closes', (dialog) => {
      Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
      const off = restorePointerLockAfterDialogs(canvas())
      try {
        useUi.getState().setDialog(dialog)
        expect(pointerLockProbe.grabs).toBe(0)
        useUi.getState().setDialog(null)
        expect(pointerLockProbe.grabs).toBe(1)
        useUi.getState().setDialog(null)
        useUi.setState({ prompt: 'unchanged lock' })
        expect(pointerLockProbe.grabs).toBe(1)
      } finally {
        off()
      }
    },
  )

  it('does not request during dialog replacement or after scene cleanup', () => {
    const off = restorePointerLockAfterDialogs(canvas())
    useUi.getState().setDialog(dialogs.trade)
    useUi.getState().setDialog(dialogs.bazaar)
    expect(pointerLockProbe.grabs).toBe(0)
    off()
    useUi.getState().setDialog(null)
    expect(pointerLockProbe.grabs).toBe(0)
  })

  it('respects full-screen overlays even when a dialog closes', () => {
    const off = restorePointerLockAfterDialogs(canvas())
    try {
      useUi.getState().setDialog(dialogs.trade)
      document.body.insertAdjacentHTML('beforeend', '<div class="overlay"></div>')
      useUi.getState().setDialog(null)
      expect(pointerLockProbe.grabs).toBe(0)
    } finally {
      off()
    }
  })

  it('tolerates a refused request and lets the next deliberate request retry', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('Escape cooldown')).mockResolvedValueOnce(undefined)
    canvas().requestPointerLock = request
    const off = restorePointerLockAfterDialogs(canvas())
    try {
      useUi.getState().setDialog(dialogs.trade)
      useUi.getState().setDialog(null)
      await Promise.resolve()
      expect(pointerLockProbe.grabs).toBe(1)
      expect(document.pointerLockElement).toBeNull()
      requestPlacePointerLock(canvas())
      expect(request).toHaveBeenCalledTimes(2)
    } finally {
      off()
    }
  })
})
