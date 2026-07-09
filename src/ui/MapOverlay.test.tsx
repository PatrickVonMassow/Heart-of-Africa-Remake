// Self-drawing exploration map (CLAUDE.md §7.1 pt. 3/17, design.md §17/§19).
// jsdom's canvas has no 2D context, so the map's draw effect early-returns and
// the drawn pixels stay Playwright's job; here we cover the overlay's DOM: the
// open/close chrome, the region-explored progress string and that the progress
// climbs as more of the region is explored.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MapOverlay } from './MapOverlay'
import { en } from '../i18n/en'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { freshGame, withWorld, g } from '../test/store'

// cellAt/regionAt in the progress computation need the real geodata index.
withWorld()

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useUi.setState({ mapOpen: false })
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.setState({ mapOpen: false })
})

describe('map overlay open/close (design.md §19)', () => {
  it('renders nothing while closed', () => {
    render(<MapOverlay />)
    expect(document.querySelector('.map-overlay')).not.toBeInTheDocument()
  })

  it('shows the titled overlay with a close button once opened', () => {
    const { rerender } = render(<MapOverlay />)
    useUi.getState().toggleMap()
    rerender(<MapOverlay />)
    const overlay = document.querySelector('.map-overlay')
    expect(overlay).toBeInTheDocument()
    expect(overlay?.textContent).toContain(en.mapOverlay.title)
    const close = [...overlay!.querySelectorAll('button')].find((b) => b.textContent === en.mapOverlay.close)
    expect(close).toBeTruthy()
  })
})

describe('exploration progress (design.md §17)', () => {
  it('renders the region-explored progress string', () => {
    useUi.getState().toggleMap()
    render(<MapOverlay />)
    const progress = document.querySelector('.map-progress')
    expect(progress).toBeInTheDocument()
    // "North: N% explored" — region name, a percentage and the word "explored".
    expect(progress?.textContent).toContain(en.regions.north)
    expect(progress?.textContent).toMatch(/\d+%/)
    expect(progress?.textContent).toContain('explored')
  })

  it('climbs as more of the region is explored', () => {
    useUi.getState().toggleMap()
    const { rerender } = render(<MapOverlay />)
    const pct = () => Number(document.querySelector('.map-progress')?.textContent?.match(/(\d+)%/)?.[1] ?? '0')
    const before = pct()
    // Drive across the northern Sahara. lat >= 17 always classifies as north
    // (regionAt), so the region under the progress string stays constant.
    for (let lat = 18; lat <= 34; lat += 2) {
      for (let lon = 2; lon <= 30; lon += 2) g().debugJumpTo(lat, lon)
    }
    rerender(<MapOverlay />)
    expect(g().region).toBe('north')
    expect(pct()).toBeGreaterThan(before)
  })
})
