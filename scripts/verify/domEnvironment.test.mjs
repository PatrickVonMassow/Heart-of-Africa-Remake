/**
 * @vitest-environment jsdom
 *
 * THE EXCEPTION ITSELF, asserted where it is used: seven files under
 * scripts/verify run browser-page code locally and carry this docblock to keep
 * jsdom. This proves the override actually resolves — the tooling project's
 * `environment: 'node'` would otherwise win and take `window` away again — and
 * that it buys a DOM WITHOUT the app project's React Testing Library setup or
 * the shared macrotask yield.
 */
import { expect, it } from 'vitest'

it('resolves a docblock-marked tooling test to jsdom', () => {
  expect(typeof window).toBe('object')
  expect(window.document).toBe(document)
  expect(document.createElement('div')).toBeInstanceOf(HTMLElement)
})

it('keeps the app project\'s DOM setup out of it', () => {
  // src/test/setup.ts is the app project's own setupFile: its matchers and its
  // ResizeObserver stub must not appear here just because the environment did.
  expect(expect.toBeInTheDocument).toBeUndefined()
  expect(globalThis.ResizeObserver).toBeUndefined()
})

let macrotaskRan = false
it('leaves native work pending at the end of a synchronous test', () => {
  setImmediate(() => { macrotaskRan = true })
  expect(macrotaskRan).toBe(false)
})

it('still runs that work between tests through the shared yield', () => {
  expect(macrotaskRan).toBe(true)
})
