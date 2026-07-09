// HUD inventory + overlays (CLAUDE.md §7.1 pt. 4/9/22, design.md §17/§15).
// Ports the InventoryBar .inv-active glow asserts (enrichments.mjs) and the
// defeat-overlay render (health.mjs) into React Testing Library checks. The
// InventoryBar/overlays are internal to Hud, so the whole HUD is rendered
// (three-free; the R3F scene is never mounted here).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { Hud } from './Hud'
import { en } from '../i18n/en'
import { useLocale } from '../i18n'
import { useGame } from '../state/store'
import { freshGame, withWorld, jumpTo, terrainAt, g, COORD } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
})
afterEach(() => {
  useLocale.getState().setLang('en')
})

const invClass = (eq: string) => document.querySelector(`[data-eq="${eq}"]`)?.className ?? ''

describe('InventoryBar .inv-active glow (design.md §17)', () => {
  it('a canoe on water glows while an idle item does not', () => {
    jumpTo(...COORD.water)
    expect(terrainAt(...COORD.water)).toBe('water')
    g().debugAddEquipment('canoe')
    g().debugAddEquipment('shovel')
    render(<Hud />)
    expect(invClass('canoe')).toContain('inv-active')
    expect(invClass('shovel')).not.toContain('inv-active')
  })

  it('the canoe does not glow on land (idle possession)', () => {
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('canoe')
    render(<Hud />)
    expect(invClass('canoe')).not.toContain('inv-active')
  })

  it('medicine glows while a curable affliction is active', () => {
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('medicine')
    render(<Hud />)
    expect(invClass('medicine')).not.toContain('inv-active')
    g().debugSetAffliction('fever', true)
    render(<Hud />)
    expect(invClass('medicine')).toContain('inv-active')
  })
})

describe('defeat overlay (design.md §15)', () => {
  it('shows the remains report and a successor button on death', () => {
    useGame.setState({ defeat: 'death', deathCause: 'wounds', hasCheckpoint: true })
    render(<Hud />)
    const overlay = document.querySelector('.overlay.defeat')
    expect(overlay).toBeInTheDocument()
    expect(overlay?.textContent).toContain(en.overlays.successor)
  })
})
