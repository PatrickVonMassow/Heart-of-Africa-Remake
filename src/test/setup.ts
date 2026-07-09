// Shared Vitest setup for the jsdom layer: jest-dom matchers and automatic
// React Testing Library cleanup between tests.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom implements neither of these; HUD components call them harmlessly.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

afterEach(() => {
  cleanup()
})
