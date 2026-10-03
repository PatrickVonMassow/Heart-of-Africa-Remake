import { SHIPPED_VOCABULARY } from '../../communication/vocabulary'
import { act, render } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import * as THREE from 'three/webgpu'
import { utteranceOf, type Phrase } from '../../communication/lexicon'
import { balance } from '../../config/balance'
import { SpeechLabels } from './SpeechLabels'
import { clearSpeechLabels, speakOverhead, speechAnchor, speechLabelState } from './speechChannel'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
const size = { width: 800, height: 600 }

// The frame callbacks are collected IN SUBSCRIPTION ORDER, as R3F keeps them:
// it subscribes in a layout effect (useFrame), so a child's callback comes
// before its parent's. A test runs the frame loop by hand.
const frames = vi.hoisted(() => [] as Array<(state: { camera: unknown }) => void>)
vi.mock('@react-three/fiber', async () => {
  const React = await import('react')
  return {
    useFrame: (cb: (state: { camera: unknown }) => void) => {
      const ref = React.useRef(cb)
      ref.current = cb
      React.useLayoutEffect(() => {
        frames.push((state) => ref.current(state))
      }, [])
    },
    useThree: (select: (state: unknown) => unknown) => select({ scene, camera, size }),
  }
})
const htmlProps = vi.hoisted(() => vi.fn())
// What drei's <Html> does in its own frame callback: project the group. The
// mock records WHEN it runs, against the placement.
const order = vi.hoisted(() => [] as string[])
// drei's non-transform <Html> draws one styled div around its children.
vi.mock('@react-three/drei', async () => {
  const React = await import('react')
  const { useFrame } = await import('@react-three/fiber')
  return {
    Html: (props: { style?: object; children?: unknown }) => {
      htmlProps(props)
      useFrame(() => {
        order.push('project')
      })
      return React.createElement('div', { style: props.style }, props.children as never)
    },
  }
})
// The frame placement itself is pinned with real three objects in
// speechChannel.test.ts; here only that the frame loop CALLS it. In jsdom the
// group ref is a DOM element, so the spy gives it the one method the frame
// callback reads afterwards.
const placeSpy = vi.hoisted(() =>
  vi.fn((node: { getWorldPosition?: (v: { set: (...a: number[]) => unknown }) => unknown }) => {
    order.push('place')
    node.getWorldPosition = (v) => v.set(0, 1.3, -4)
    return true
  }),
)
vi.mock('./speechChannel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./speechChannel')>()),
  placeSpeechNote: placeSpy,
}))

const atoms: Phrase = [utteranceOf('UPSTREAM', SHIPPED_VOCABULARY)]
const hook = () => (window as unknown as {
  __speech: { speak: (id: string, atoms: Phrase, anchor?: string, seconds?: number) => boolean }
}).__speech

beforeEach(() => {
  scene.clear()
  clearSpeechLabels()
})

it('holds a live child reading on its unnamed figure for the shutter', () => {
  const child = new THREE.Group()
  scene.add(child)
  speakOverhead('kid-1', atoms, child, { floor: true, seconds: 2 })
  const before = speechLabelState().labels[0]
  render(<SpeechLabels />)

  act(() => expect(hook().speak('kid-1', atoms, undefined, 120)).toBe(true))

  expect(speechAnchor('kid-1')).toBe(child)
  expect(speechLabelState().labels[0].atoms).toEqual(atoms)
  expect(speechLabelState().labels[0].hideAt - before.hideAt).toBeGreaterThanOrEqual(118)
  expect(speechLabelState().labels[0].floor).toBeFalsy()
})

it('still resolves named scene objects without prior speech', () => {
  const chief = new THREE.Group()
  chief.name = 'chief'
  scene.add(chief)
  render(<SpeechLabels />)
  act(() => expect(hook().speak('chief', atoms, 'chief', 120)).toBe(true))
  expect(speechAnchor('chief')).toBe(chief)
})

it('rejects an explicit nonexistent anchor even for a known child', () => {
  const child = new THREE.Group()
  scene.add(child)
  speakOverhead('kid-1', atoms, child)
  render(<SpeechLabels />)
  const before = speechLabelState()
  expect(hook().speak('kid-1', atoms, 'kid-call', 120)).toBe(false)
  expect(speechLabelState()).toBe(before)
})

it('rejects an unknown speaker without creating a label', () => {
  render(<SpeechLabels />)
  expect(hook().speak('kid-1', atoms, undefined, 120)).toBe(false)
  expect(speechLabelState().labels).toEqual([])
})

it('rejects a remembered child anchor that has left the scene', () => {
  const child = new THREE.Group()
  scene.add(child)
  speakOverhead('kid-1', atoms, child)
  render(<SpeechLabels />)
  scene.remove(child)
  const before = speechLabelState()
  expect(hook().speak('kid-1', atoms, undefined, 120)).toBe(false)
  expect(speechLabelState()).toBe(before)
})

it('keeps speech notes off drei\'s unbounded distance factor and below the HUD (the clamped scale is speechBubbleScale, point 1271)', async () => {
  const { useGame } = await import('../../state/store')
  const child = new THREE.Group()
  scene.add(child)
  useGame.getState().hearUtterance(atoms[0])
  speakOverhead('kid-close', atoms, child)
  htmlProps.mockClear()
  render(<SpeechLabels />)
  expect(htmlProps).toHaveBeenCalled()
  for (const [props] of htmlProps.mock.calls) {
    expect(props.distanceFactor).toBeUndefined()
    expect(props.zIndexRange).toEqual([20, 10])
  }
})

it('stands each note on its tail tip and hands the older of two notes the receded look (point 1238)', async () => {
  const { useGame } = await import('../../state/store')
  const elder = new THREE.Group()
  const youth = new THREE.Group()
  scene.add(elder, youth)
  useGame.getState().hearUtterance(atoms[0])
  speakOverhead('elder', atoms, elder, { now: 10 })
  speakOverhead('youth', atoms, youth, { now: 11 })
  htmlProps.mockClear()
  render(<SpeechLabels />)
  const calls = htmlProps.mock.calls.map(([props]) => props as {
    center?: boolean
    style?: { transform?: string }
    // The card sits in the `.speech-distance` wrapper (point 1271).
    children: { props: { className: string; children: { props: { speakerId: string; receded: boolean } } } }
  })
  expect(calls.length).toBeGreaterThanOrEqual(2)
  for (const props of calls) {
    expect(props.center).toBeFalsy()
    // The tip stands on the head-top anchor, lifted by the calibrated screen
    // gap (point 1276).
    expect(props.style?.transform).toBe('translate3d(-50%,calc(-100% - var(--speech-tip-gap, 0px)),0)')
  }
  for (const props of calls) expect(props.children.props.className).toBe('speech-distance')
  const cards = calls.map((p) => p.children.props.children.props)
  const receded = Object.fromEntries(cards.map((c) => [c.speakerId, c.receded]))
  expect(receded).toEqual({ elder: true, youth: false })
})

it('places every note from the frame loop and keeps its tip gap live with the calibration (point 1276)', async () => {
  const { useGame } = await import('../../state/store')
  const fig = new THREE.Group()
  scene.add(fig)
  useGame.getState().hearUtterance(atoms[0])
  speakOverhead('elder', atoms, fig, { now: 10 })
  frames.length = 0
  order.length = 0
  placeSpy.mockClear()
  const { container } = render(<SpeechLabels />)
  expect(frames.length).toBeGreaterThan(0)
  const runFrames = () => act(() => frames.forEach((f) => f({ camera })))
  runFrames()
  // The frame loop stands the note on its speaker's head for THIS camera —
  // and BEFORE drei projects it, or the note trails a moving speaker a frame.
  expect(placeSpy).toHaveBeenCalledWith(expect.anything(), speechLabelState().labels[0], camera)
  expect(order).toEqual(['place', 'project'])
  const wrap = container.querySelector('.speech-distance')!.parentElement!
  const gap = balance.communication.labelTipGap.px
  expect(wrap.style.getPropertyValue('--speech-tip-gap')).toBe(`${gap}px`)
  // The debug menu moves the calibration: the note already shown follows.
  try {
    balance.communication.labelTipGap.px = gap + 6
    runFrames()
    expect(wrap.style.getPropertyValue('--speech-tip-gap')).toBe(`${gap + 6}px`)
  } finally {
    balance.communication.labelTipGap.px = gap
  }
})

it('sizes each note by its distance through the curve, and caps a close-up one to the viewport (point 1278)', async () => {
  const { useGame } = await import('../../state/store')
  const fig = new THREE.Group()
  scene.add(fig)
  useGame.getState().hearUtterance(atoms[0])
  speakOverhead('elder', atoms, fig, { now: 10 })
  frames.length = 0
  const { container } = render(<SpeechLabels />)
  const sizer = container.querySelector('.speech-distance') as HTMLElement
  const scaleAt = (x: number, y: number, z: number, layout: { w: number; h: number }) => {
    placeSpy.mockImplementation((node: { getWorldPosition?: (v: { set: (...a: number[]) => unknown }) => unknown }) => {
      node.getWorldPosition = (v) => v.set(x, y, z)
      return true
    })
    Object.defineProperty(sizer, 'offsetWidth', { configurable: true, value: layout.w })
    Object.defineProperty(sizer, 'offsetHeight', { configurable: true, value: layout.h })
    act(() => frames.forEach((f) => f({ camera })))
    return Number(sizer.style.getPropertyValue('--speech-distance-scale'))
  }
  try {
    // The camera stands at the origin. 10 m off: 1.4 · 3.04 · (3/10)^0.8144, by hand.
    expect(scaleAt(0, 0, -10, { w: 0, h: 0 })).toBeCloseTo(1.596, 3)
    // 22 m off: the far size, 1.4 · 0.60.
    expect(scaleAt(0, 0, -22, { w: 0, h: 0 })).toBeCloseTo(0.84, 3)
    // Half a metre off, a 300 px wide note: capped at 35 % of the viewport.
    const capped = scaleAt(0, 0, -0.5, { w: 300, h: 40 })
    expect(capped).toBeCloseTo((0.35 * window.innerWidth) / 300, 2)
    expect(capped).toBeLessThan(5.6)
  } finally {
    placeSpy.mockImplementation((node: { getWorldPosition?: (v: { set: (...a: number[]) => unknown }) => unknown }) => {
      order.push('place')
      node.getWorldPosition = (v) => v.set(0, 1.3, -4)
      return true
    })
  }
})
