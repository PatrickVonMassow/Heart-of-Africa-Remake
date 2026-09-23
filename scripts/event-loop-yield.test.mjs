import { expect, it, vi } from 'vitest'

// No environment override: this proves the project's actual path routing.
it('resolves tooling tests to Node without the DOM setup', () => {
  expect(typeof window).toBe('undefined')
  expect(typeof document).toBe('undefined')
  expect(typeof Element).toBe('undefined')
  expect(typeof ResizeObserver).toBe('undefined')
  expect(expect.toBeInTheDocument).toBeUndefined()
})

let macrotaskRan = false
it('leaves native work pending at the end of a synchronous tooling test', () => {
  setImmediate(() => { macrotaskRan = true })
  expect(macrotaskRan).toBe(false)
})

it('runs that work between tests through the shared yield', () => {
  expect(macrotaskRan).toBe(true)
})

it('keeps the teardown yield when a tooling test installs fake timers', () => {
  vi.useFakeTimers()
})

it('returns from the native yield even with timers still mocked', () => {
  expect(vi.isFakeTimers()).toBe(true)
  vi.useRealTimers()
})
