import { SHIPPED_VOCABULARY } from '../../communication/vocabulary'
import { act, render } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import * as THREE from 'three/webgpu'
import { utteranceOf, type Phrase } from '../../communication/lexicon'
import { SpeechLabels } from './SpeechLabels'
import { clearSpeechLabels, speakOverhead, speechAnchor, speechLabelState } from './speechChannel'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
const size = { width: 800, height: 600 }

vi.mock('@react-three/fiber', () => ({
  useFrame: () => {},
  useThree: (select: (state: unknown) => unknown) => select({ scene, camera, size }),
}))
const htmlProps = vi.hoisted(() => vi.fn())
vi.mock('@react-three/drei', () => ({ Html: (props: unknown) => { htmlProps(props); return null } }))

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
    expect(props.style?.transform).toBe('translate3d(-50%,-100%,0)')
  }
  for (const props of calls) expect(props.children.props.className).toBe('speech-distance')
  const cards = calls.map((p) => p.children.props.children.props)
  const receded = Object.fromEntries(cards.map((c) => [c.speakerId, c.receded]))
  expect(receded).toEqual({ elder: true, youth: false })
})
