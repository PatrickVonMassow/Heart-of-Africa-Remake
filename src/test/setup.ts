// Shared Vitest setup for the jsdom layer: jest-dom matchers and automatic
// React Testing Library cleanup between tests.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom implements neither of these; HUD components call them harmlessly.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no ResizeObserver; the inventory bar observes itself to publish its
// height (point 163). A no-op stub lets the effect mount without throwing; real
// layout measurement is a browser concern, covered by the Playwright suite.
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
