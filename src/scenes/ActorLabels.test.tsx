// The hold-Ctrl label layer as a component (design.md §17.8): it exists while
// the key is down and not a moment longer — including when the release never
// arrives because the window went away, which is the bug the clear-on-blur rule
// exists to prevent.
//
// The scene stack is mocked away: what is under test is the layer's LIFECYCLE
// and the text it puts on screen, and neither needs a renderer. The picture
// itself (labels over the right animals, none over a plant) is checked live in
// scripts/verify/enrichments.mjs and polish.mjs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { registerActorSource, type LabelledActor } from './actorLabelSource'
import { useLocale } from '../i18n'
import { balance } from '../config/balance'

/** The frame callback the layer registered, so the test can drive it. */
let frameCallback: ((state: unknown, dt: number) => void) | null = null

// An identity camera: everything inside the unit cube in front of it is on
// screen, which keeps the projection out of this file's way (it has its own
// test in travel/frameVisibility.test.ts).
const IDENTITY = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
const camera = { projectionMatrix: IDENTITY, matrixWorldInverse: IDENTITY, position: { x: 0, y: 0, z: 0 } }
const scene = { visible: true, children: [] }

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, dt: number) => void) => {
    frameCallback = cb
  },
  useThree: (select: (state: unknown) => unknown) => select({ camera, scene }),
}))

vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const { ActorLabels } = await import('./ActorLabels')

/** One giraffe and one dead calf, in front of the identity camera. */
const HERD: LabelledActor[] = [
  { kind: 'giraffe', age: 'adult', x: 0, y: 0, z: -0.5 },
  { kind: 'giraffe', age: 'young', dead: true, x: 0.1, y: 0, z: -0.5 },
]

let unregister: (() => void) | null = null

/** Advance one refresh interval so the layer re-reads the scene. */
function tick(): void {
  act(() => {
    frameCallback?.({}, 1)
  })
}

const holdCtrl = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
  })
const releaseCtrl = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', ctrlKey: false }))
  })

beforeEach(() => {
  useLocale.getState().setLang('en')
  frameCallback = null
  unregister = registerActorSource((out) => {
    for (const actor of HERD) out.push(actor)
  })
})

afterEach(() => {
  unregister?.()
  releaseCtrl()
  useLocale.getState().setLang('en')
})

describe('ActorLabels (design.md §17.8)', () => {
  it('shows nothing — and asks the scene for nothing — while Ctrl is up', () => {
    render(<ActorLabels distanceFactor={60} />)
    expect(frameCallback, 'the layer must not even run a frame callback').toBeNull()
    expect(screen.queryByText('Adult giraffe')).toBeNull()
  })

  it('names what acts once Ctrl goes down', () => {
    render(<ActorLabels distanceFactor={60} />)
    holdCtrl()
    tick()
    expect(screen.getByText('Adult giraffe')).toBeTruthy()
    expect(screen.getByText('Dead giraffe calf')).toBeTruthy()
  })

  it('speaks the selected language', () => {
    act(() => useLocale.getState().setLang('de'))
    render(<ActorLabels distanceFactor={60} />)
    holdCtrl()
    tick()
    expect(screen.getByText('Erwachsene Giraffe')).toBeTruthy()
    expect(screen.getByText('Totes Giraffen-Jungtier')).toBeTruthy()
  })

  it('disappears on the release', () => {
    render(<ActorLabels distanceFactor={60} />)
    holdCtrl()
    tick()
    expect(screen.getByText('Adult giraffe')).toBeTruthy()
    releaseCtrl()
    expect(screen.queryByText('Adult giraffe')).toBeNull()
  })

  it('is cleared by losing the window, with no keyup at all', () => {
    render(<ActorLabels distanceFactor={60} />)
    holdCtrl()
    tick()
    expect(screen.getByText('Adult giraffe')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByText('Adult giraffe')).toBeNull()
  })

  it('is cleared when the tab is hidden', () => {
    render(<ActorLabels distanceFactor={60} />)
    holdCtrl()
    tick()
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.queryByText('Adult giraffe')).toBeNull()
  })

  it('re-syncs from the next input event when the release was missed', () => {
    render(<ActorLabels distanceFactor={60} />)
    holdCtrl()
    tick()
    // The player alt-tabbed, released the key elsewhere and clicked back in:
    // no keyup ever reached the game, but this click knows Ctrl is up.
    act(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { ctrlKey: false }))
    })
    expect(screen.queryByText('Adult giraffe')).toBeNull()
  })

  it('honours the calibratable label cap', () => {
    const previous = balance.labelOverlay.maxLabels
    balance.labelOverlay.maxLabels = 1
    try {
      render(<ActorLabels distanceFactor={60} />)
      holdCtrl()
      tick()
      // The nearest one survives; the farther one is dropped.
      expect(screen.getByText('Adult giraffe')).toBeTruthy()
      expect(screen.queryByText('Dead giraffe calf')).toBeNull()
    } finally {
      balance.labelOverlay.maxLabels = previous
    }
  })
})
