// The pad's button map (design.md §17.5). The POLL is browser-bound and stays
// in scripts/verify/gamepad.mjs; the MAP itself is a plain table and belongs
// here, because a missing binding is a table entry, not a timing question — and
// a missing one is what work-order 610 closes: the escape key of 604 had no pad
// route at all, so a pad-only player who was wedged still lost the expedition.
import { describe, it, expect } from 'vitest'
import { GAMEPAD_BUTTON_KEYS } from './input'
import { UNSTUCK_KEY_CODE } from './unstuck'

/** The standard-mapping button numbers design.md §17.5 spells out. */
const SPELLED_OUT: Record<number, string> = {
  0: 'Space', // A: interact / enter
  1: 'Escape', // B: close
  2: 'KeyG', // X: dig
  3: 'Tab', // Y: journal
  4: 'KeyM', // LB: map
  5: 'KeyC', // RB: camp
  8: 'KeyP', // Select: position query
  9: 'F1', // Start: debug menu
}

describe('gamepad button map (design.md §17.5)', () => {
  it('keeps every binding the design spells out', () => {
    for (const [index, code] of Object.entries(SPELLED_OUT)) {
      expect(GAMEPAD_BUTTON_KEYS[Number(index)]).toBe(code)
    }
  })

  it('binds the escape from a wedge to a button (work-order 610)', () => {
    const bound = Object.entries(GAMEPAD_BUTTON_KEYS).filter(([, code]) => code === UNSTUCK_KEY_CODE)
    expect(bound).toHaveLength(1)
    // A spare stick press: the buttons §17.5 names are all taken, and L3/R3 are
    // the two the standard mapping leaves free.
    expect([10, 11]).toContain(Number(bound[0][0]))
  })

  it('takes no button the design already spent — every binding is one key', () => {
    for (const index of Object.keys(SPELLED_OUT)) {
      expect(GAMEPAD_BUTTON_KEYS[Number(index)]).not.toBe(UNSTUCK_KEY_CODE)
    }
    const codes = Object.values(GAMEPAD_BUTTON_KEYS)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('routes every button through a real key code, never a bare letter', () => {
    // The map re-enters the KEYBOARD pipeline (dispatchSyntheticKey → a keydown
    // with this `code`), so an entry that is not a KeyboardEvent code reaches no
    // handler at all — one input path only works if the codes are the real ones.
    for (const code of Object.values(GAMEPAD_BUTTON_KEYS)) {
      expect(code).toMatch(/^(Key[A-Z]|Space|Escape|Tab|F\d+|Arrow[A-Za-z]+|Digit\d)$/)
    }
  })
})
