// The hold key of the §17.8 name labels: which modifier counts as held, and
// what the rebind of work-order 601 does to a layer that is up. The label
// LAYER itself (what it names, and that it mounts on the hold) is tested in
// src/scenes/ActorLabels.test.tsx.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ctrlHeld, modifierHeld, subscribeCtrlHold } from './ctrlHold'
import { useUi } from '../state/ui'

const mods = (over: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  ctrlKey: false, shiftKey: false, altKey: false, ...over,
})

describe('modifierHeld', () => {
  it('reads the flag the chosen modifier owns, and no other', () => {
    expect(modifierHeld(mods({ ctrlKey: true }), 'ctrl')).toBe(true)
    expect(modifierHeld(mods({ shiftKey: true }), 'ctrl')).toBe(false)
    expect(modifierHeld(mods({ shiftKey: true }), 'shift')).toBe(true)
    expect(modifierHeld(mods({ ctrlKey: true }), 'shift')).toBe(false)
    expect(modifierHeld(mods({ altKey: true }), 'alt')).toBe(true)
    expect(modifierHeld(mods({ ctrlKey: true, shiftKey: true }), 'shift')).toBe(true)
  })
})

describe('the hold, through the real listeners (design.md §17.8)', () => {
  let off: (() => void) | null = null

  beforeEach(() => {
    useUi.setState({ labelModifier: 'ctrl' })
    off = subscribeCtrlHold(() => {})
  })
  afterEach(() => {
    off?.()
    off = null
    useUi.setState({ labelModifier: 'ctrl' })
  })

  const key = (type: string, init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent(type, init))

  it('follows the DEFAULT Ctrl and clears on release', () => {
    key('keydown', { key: 'Control', ctrlKey: true })
    expect(ctrlHeld()).toBe(true)
    key('keyup', { key: 'Control', ctrlKey: false })
    expect(ctrlHeld()).toBe(false)
  })

  it('follows the rebound key and ignores the old one', () => {
    useUi.getState().setLabelModifier('shift')
    key('keydown', { key: 'Control', ctrlKey: true })
    expect(ctrlHeld()).toBe(false) // Ctrl is no longer the hold key
    key('keydown', { key: 'Shift', shiftKey: true })
    expect(ctrlHeld()).toBe(true)
    key('keyup', { key: 'Shift', shiftKey: false })
    expect(ctrlHeld()).toBe(false)
  })

  it('clears a standing layer when the key is rebound under it', () => {
    key('keydown', { key: 'Control', ctrlKey: true })
    expect(ctrlHeld()).toBe(true)
    useUi.getState().setLabelModifier('alt')
    // The label may not stay up on a key nobody is holding any more.
    expect(ctrlHeld()).toBe(false)
  })

  it('clears when the window goes away, whichever key it is', () => {
    useUi.getState().setLabelModifier('alt')
    key('keydown', { key: 'Alt', altKey: true })
    expect(ctrlHeld()).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(ctrlHeld()).toBe(false)
  })
})
