// Shared Vitest setup for the jsdom layer: jest-dom matchers, automatic
// React Testing Library cleanup between tests, and two browser shims.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom does not implement scrollIntoView; HUD components call it harmlessly.
// Guarded on the DOM itself: a file may opt into the `node` environment (the
// config-pinning test does, because importing a vite config drags esbuild in
// and esbuild rejects jsdom's TextEncoder), and there this shim has nothing to
// attach to.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no ResizeObserver; the inventory bar observes itself to publish its
// height (point 163). A no-op stub lets the effect mount without throwing; real
// layout measurement is a browser concern, covered by the Playwright suite.
// Guarded on the global alone, so it also installs (harmlessly) in `node` files.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

afterEach(() => {
  cleanup()
})
