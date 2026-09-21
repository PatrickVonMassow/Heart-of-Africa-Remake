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
  let keydown: (event: KeyboardEvent) => void

  beforeEach(() => {
    vi.useFakeTimers()
    const listen = vi.spyOn(window, 'addEventListener')
    lock = createPlacePointerLock(canvas())
    // jsdom cannot manufacture trusted input. Call the registered boundary with
    // a trusted event shape; separate cases dispatch real synthetic DOM events.
    keydown = listen.mock.calls.find(([type]) => String(type) === 'keydown')![1] as typeof keydown
    listen.mockRestore()
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
  const press = (overrides: Partial<KeyboardEvent> = {}) => keydown({
    code: 'KeyW', isTrusted: true, target: document.body, ...overrides,
  } as KeyboardEvent)

  it.each(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])(
    'uses fresh %s activation after timer requests are all refused', async (code) => {
      let inUserEvent = false
      const request = vi.fn(() => {
        if (!inUserEvent) return Promise.reject(new DOMException('A user gesture is required', 'NotAllowedError'))
        setLock(canvas())
        return Promise.resolve()
      })
      canvas().requestPointerLock = request
      lock.request() // one quick click
      await vi.advanceTimersByTimeAsync(5000)
      expect(document.pointerLockElement).toBeNull()
      expect(request).toHaveBeenCalledTimes(13)
      expect(vi.getTimerCount()).toBe(0)
      inUserEvent = true
      press({ code }) // the player walks; no second click
      inUserEvent = false
      expect(document.pointerLockElement).toBe(canvas())
      expect(request).toHaveBeenCalledTimes(14)
      await vi.advanceTimersByTimeAsync(5000)
      expect(request).toHaveBeenCalledTimes(14)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('uses the next movement press while a silent request is still pending', async () => {
    canvas().requestPointerLock = vi.fn().mockImplementationOnce(() => new Promise<void>(() => {}))
      .mockImplementation(() => { setLock(canvas()); return Promise.resolve() })
    lock.request()
    await vi.advanceTimersByTimeAsync(100)
    press()
    expect(document.pointerLockElement).toBe(canvas())
    expect(canvas().requestPointerLock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps recovery pending if the first real movement press is still refused', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Still cooling down'))
    canvas().requestPointerLock = request
    lock.request()
    press()
    await vi.advanceTimersByTimeAsync(5000)
    request.mockImplementation(() => { setLock(canvas()); return Promise.resolve() })
    press()
    expect(document.pointerLockElement).toBe(canvas())
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { isTrusted: false }, { repeat: true }, { defaultPrevented: true },
    { ctrlKey: true }, { altKey: true }, { metaKey: true }, { code: 'Space' },
    { code: 'KeyJ' }, { target: document.createElement('input') },
    { target: document.createElement('textarea') }, { target: document.createElement('select') },
    { target: document.createElement('button') }, { target: document.createElement('div') },
  ])('ignores input that is not a fresh gameplay activation: %j', async (event) => {
    canvas().requestPointerLock = vi.fn()
    lock.request()
    await vi.advanceTimersByTimeAsync(5000)
    press(event)
    expect(canvas().requestPointerLock).toHaveBeenCalledTimes(13)
    expect(vi.getTimerCount()).toBe(0)
    press({ shiftKey: true }) // running still qualifies
    expect(canvas().requestPointerLock).toHaveBeenCalledTimes(14)
  })

  it('ignores synthetic key events and mouse movement', async () => {
    canvas().requestPointerLock = vi.fn()
    lock.request()
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    canvas().dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(canvas().requestPointerLock).toHaveBeenCalledTimes(13)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['Escape', 'dialog', 'overlay', 'blur', 'hidden', 'HUD click', 'grant then Escape', 'scene cleanup'])(
    'cancels both timer and activation recovery on %s', async (reason) => {
      canvas().requestPointerLock = vi.fn()
      lock.request()
      if (reason === 'Escape') press({ code: 'Escape' })
      else if (reason === 'dialog') {
        useUi.getState().setDialog(dialogs.trade)
        useUi.getState().setDialog(null)
      } else if (reason === 'overlay') {
        document.body.insertAdjacentHTML('beforeend', '<div class="overlay"></div>')
        press()
        document.querySelector('.overlay')!.remove()
      } else if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      else if (reason === 'hidden') {
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
        hidden.mockRestore()
      } else if (reason === 'HUD click') {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      } else if (reason === 'grant then Escape') {
        setLock(canvas())
        setLock(null)
      } else lock.dispose()
      await vi.advanceTimersByTimeAsync(5000)
      press()
      expect(canvas().requestPointerLock).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('does not request on movement without a pending return', () => {
    canvas().requestPointerLock = vi.fn()
    press()
    expect(canvas().requestPointerLock).not.toHaveBeenCalled()
  })

  it.each(['inserted', 'class changed'])('retires expired recovery when an overlay is %s and later removed', async (kind) => {
    canvas().requestPointerLock = vi.fn()
    const overlay = document.createElement('div')
    if (kind === 'class changed') document.body.append(overlay)
    lock.request()
    await vi.advanceTimersByTimeAsync(5000)
    overlay.className = 'overlay'
    if (kind === 'inserted') document.body.append(overlay)
    await Promise.resolve() // deliver the DOM mutation while the overlay is open
    overlay.remove()
    press()
    expect(canvas().requestPointerLock).toHaveBeenCalledTimes(13)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes its input listeners on disposal', () => {
    const offWindow = vi.spyOn(window, 'removeEventListener')
    const offDocument = vi.spyOn(document, 'removeEventListener')
    lock.dispose()
    expect(offWindow).toHaveBeenCalledWith('keydown', keydown)
    expect(offWindow).toHaveBeenCalledWith('pointerdown', expect.any(Function))
    expect(offWindow).toHaveBeenCalledWith('blur', expect.any(Function))
    expect(offDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    offWindow.mockRestore()
    offDocument.mockRestore()
  })

  it.each(['promise', 'event', 'throw'])('asks again 250 ms after a %s refusal, and keeps asking', async (signal) => {
    // The event-only API returns void in older browsers, unlike the DOM typings.
    const request = vi.fn().mockImplementation(() => {
      if (signal === 'promise') return Promise.reject(new Error('Escape cooldown'))
      if (signal === 'throw') throw new Error('Escape cooldown')
    })
    canvas().requestPointerLock = request
    lock.request()
    if (signal === 'event') errorEvent()
    await Promise.resolve()
    expect(pointerLockProbe.refusals).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(249)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(2)
    if (signal === 'event') errorEvent()
    await Promise.resolve()
    expect(pointerLockProbe.refusals).toBe(2)
    expect(pointerLockProbe.grabs).toBe(2)
    // A refused retry arms the next one: one shot was what left the quick click
    // stranded inside the browser's refusal period (work-order point 1158).
    expect(vi.getTimerCount()).toBe(1)
  })

  it('returns steering on ONE click though the browser refuses for over a second', async () => {
    // The refusal period runs from the ESCAPE, not from the click, and its length
    // is the browser's to choose — 1.5 s here stands for ANY period longer than
    // one fixed retry delay. That is what stranded the quick click: a single ask
    // 1.1 s after it was refused too, and nothing asked again (point 1158).
    const clickedAt = Date.now()
    const request = vi.fn().mockImplementation(() => {
      if (Date.now() - clickedAt < 1500) return Promise.reject(new Error('Escape cooldown'))
      setLock(canvas())
      return Promise.resolve(undefined)
    })
    canvas().requestPointerLock = request
    lock.request()
    await vi.advanceTimersByTimeAsync(1600)
    expect(document.pointerLockElement).toBe(canvas())
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['void', 'pending promise', 'resolved promise'])('recovers a silent %s request without a refusal signal', async (response) => {
    const clickedAt = Date.now()
    canvas().requestPointerLock = vi.fn(() => {
      if (Date.now() - clickedAt >= 1500) setLock(canvas())
      if (response === 'pending promise') return new Promise<void>(() => {})
      if (response === 'resolved promise') return Promise.resolve()
      return undefined as unknown as Promise<void>
    })
    lock.request()
    await vi.advanceTimersByTimeAsync(1600)
    expect(document.pointerLockElement).toBe(canvas())
    expect(pointerLockProbe.refusals).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds recovery even when every request is silently dropped', async () => {
    const request = vi.fn()
    canvas().requestPointerLock = request
    lock.request()
    await vi.advanceTimersByTimeAsync(13000)
    expect(request).toHaveBeenCalledTimes(13)
    expect(pointerLockProbe.refusals).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let a stale rejection replace a newer attempt or restart recovery', async () => {
    let rejectFirst!: (reason: Error) => void
    canvas().requestPointerLock = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject }))
      .mockImplementation(() => { setLock(canvas()); return Promise.resolve() })
    lock.request()
    await vi.advanceTimersByTimeAsync(250)
    setLock(null) // Escape after the grant must leave the cursor free.
    rejectFirst(new Error('Late refusal'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(canvas().requestPointerLock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives up when the bounded recovery window runs out', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    canvas().requestPointerLock = request
    lock.request()
    // The opening ask plus one every 250 ms up to the 3 s window.
    await vi.advanceTimersByTimeAsync(3000)
    expect(request).toHaveBeenCalledTimes(13)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10000)
    expect(request).toHaveBeenCalledTimes(13)
  })

  it('drops an ask whose turn came only after the window had passed', async () => {
    // A suspended tab or a blocked event loop delivers the callback late; the
    // cursor must not be taken out of nowhere when it finally arrives.
    const request = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    canvas().requestPointerLock = request
    lock.request()
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)
    vi.setSystemTime(Date.now() + 60000) // the tab was away; no timer ran
    await vi.advanceTimersByTimeAsync(250)
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('lets an impatient second click extend the recovery rather than postpone it', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Escape cooldown'))
    canvas().requestPointerLock = request
    lock.request()
    await vi.advanceTimersByTimeAsync(100)
    expect(request).toHaveBeenCalledTimes(1)
    lock.request() // the impatient second click, before the pending ask is due
    await vi.advanceTimersByTimeAsync(250)
    // The second click did not swallow the recovery it interrupted.
    expect(request).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
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
    await vi.advanceTimersByTimeAsync(250)
    errorEvent()
    expect(pointerLockProbe.refusals).toBe(2)
    expect(request).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
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
    await vi.advanceTimersByTimeAsync(3100)
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
    await vi.advanceTimersByTimeAsync(3100)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps webdriver on the decision-only path even if an error event arrives', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    const request = vi.fn()
    canvas().requestPointerLock = request
    lock.request()
    errorEvent()
    await vi.advanceTimersByTimeAsync(5000)
    press()
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
    const request = vi.fn().mockRejectedValueOnce(new Error('Escape cooldown'))
      .mockImplementation(() => { setLock(canvas()); return Promise.resolve() })
    canvas().requestPointerLock = request
    const off = restorePointerLockAfterDialogs(canvas(), lock.request)
    try {
      useUi.getState().setDialog(dialogs.trade)
      useUi.getState().setDialog(null)
      await Promise.resolve()
      expect(pointerLockProbe.refusals).toBe(1)
      await vi.advanceTimersByTimeAsync(250)
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
  drumMessage: { kind: 'drumMessage', message: 'errand' },
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
