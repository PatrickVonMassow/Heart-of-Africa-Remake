// Debug menu HUD component (CLAUDE.md §7.1 pt. 17/20, design.md §21/§17). Ports
// the DebugMenu asserts of settings.mjs, i18n.mjs and enrichments.mjs into React
// Testing Library checks (jsdom, no browser): localized field labels in both
// languages, the language selector and its switch, live edits writing through to
// the balance singleton, and the presence of the renderer row and the
// jump-to/equipment/gift dropdown selectors. The acceptance screenshots, the
// user-select computed-style checks and the in-scene effects stay in Playwright.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebugMenu } from './DebugMenu'
import { balance } from '../config/balance'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { freshGame, withWorld, useGame } from '../test/store'
import { MOUNTAINS } from '../world/data/landmarks'
import { latLonToWorld } from '../world/geo'

withWorld()

// The debug menu edits mutate the shared balance singleton; capture the
// defaults so each test restores them (deterministic, no cross-test bleed).
const DEFAULTS = {
  mouseSensitivity: balance.mouseSensitivity,
  ambienceVolume: balance.ambienceVolume,
  canoeSpeedup: balance.canoeSpeedup,
  canteenCapacity: balance.health.canteenCapacity,
}

/** The DebugMenu renders nothing until the UI store's debug flag is open. */
function openDebug(): void {
  if (!useUi.getState().debugOpen) useUi.getState().toggleDebug()
}

/** Find the numeric field whose wrapping label carries the given text. */
function numberField(labelText: string): HTMLInputElement {
  const rows = [...document.querySelectorAll('.debug-menu label')]
  const row = rows.find((r) => r.textContent?.includes(labelText))
  const input = row?.querySelector('input[type="number"]') as HTMLInputElement | null
  if (!input) throw new Error(`no numeric field for label "${labelText}"`)
  return input
}

/** The debug-menu <select> that offers an <option> with the given value. */
function selectWithOption(value: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll('.debug-menu select')].find((s) =>
    [...(s as HTMLSelectElement).options].some((o) => o.value === value),
  ) as HTMLSelectElement | undefined
}

/** The language-selector button carrying the given text (as i18n.mjs matches it). */
function languageButton(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('.debug-menu button')].find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement | undefined
}

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  openDebug()
})

afterEach(() => {
  balance.mouseSensitivity = DEFAULTS.mouseSensitivity
  balance.ambienceVolume = DEFAULTS.ambienceVolume
  balance.canoeSpeedup = DEFAULTS.canoeSpeedup
  balance.health.canteenCapacity = DEFAULTS.canteenCapacity
  useLocale.getState().setLang('en')
  useUi.getState().setTraaEnabled(true)
  useUi.getState().setWebglFallback(false)
  if (useUi.getState().debugOpen) useUi.getState().toggleDebug()
})

describe('DebugMenu localization (settings.mjs de/en label checks)', () => {
  it('renders the English field labels', () => {
    render(<DebugMenu />)
    expect(screen.getByText(en.debug.title)).toBeInTheDocument()
    expect(screen.getByText(en.debug.mouseSensitivity)).toBeInTheDocument()
    expect(screen.getByText(en.debug.ambienceVolume)).toBeInTheDocument()
    expect(screen.getByText(en.debug.travelSpeed)).toBeInTheDocument()
  })

  it('renders the German field labels after a runtime language switch', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    expect(screen.getByText(de.debug.mouseSensitivity)).toBeInTheDocument()
    expect(screen.getByText(de.debug.ambienceVolume)).toBeInTheDocument()
    // The English labels are gone once German is active.
    expect(screen.queryByText(en.debug.mouseSensitivity)).not.toBeInTheDocument()
  })
})

describe('DebugMenu language selector (i18n.mjs)', () => {
  it('shows the Sprache/Language selector with Deutsch and English buttons', () => {
    // Rendered in German so the current-language (Deutsch) button is disabled
    // and the "English" button is the actionable one — as in i18n.mjs.
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    expect(screen.getByText(de.debug.language)).toBeInTheDocument()
    expect(languageButton(de.languageName)).toBeDefined()
    expect(languageButton(en.languageName)).toBeDefined()
  })

  it('clicking the English button switches the locale back to English', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    const englishBtn = languageButton(en.languageName)
    expect(englishBtn).toBeDefined()
    fireEvent.click(englishBtn as HTMLButtonElement)
    // getStrings/useLocale now report English (i18n.mjs "English button clicked").
    expect(useLocale.getState().lang).toBe('en')
    // The menu re-renders in English ("Back to English via debug menu").
    expect(screen.getByText(en.debug.language)).toBeInTheDocument()
    expect(screen.getByText(en.debug.cash)).toBeInTheDocument()
  })
})

describe('DebugMenu editable fields write through to balance (settings.mjs fillField)', () => {
  const editable: Array<{ label: string; read: () => number; value: number }> = [
    { label: en.debug.mouseSensitivity, read: () => balance.mouseSensitivity, value: 0.002 },
    { label: en.debug.ambienceVolume, read: () => balance.ambienceVolume, value: 0.5 },
    { label: en.debug.canoeSpeedup, read: () => balance.canoeSpeedup, value: 5 },
    // Nested balance field (balance.health.canteenCapacity).
    { label: en.debug.canteenCapacity, read: () => balance.health.canteenCapacity, value: 600 },
  ]

  it.each(editable)('editing "$label" updates the balance singleton at runtime', ({ label, read, value }) => {
    render(<DebugMenu />)
    const input = numberField(label)
    fireEvent.change(input, { target: { value: String(value) } })
    expect(read()).toBe(value)
  })
})

describe('DebugMenu TRAA toggle (design.md §2.7/§21)', () => {
  it('renders the localized TRAA checkbox, default on', () => {
    render(<DebugMenu />)
    const row = screen.getByText(en.debug.traa).closest('label')
    const box = row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    expect(box).not.toBeNull()
    expect(box?.checked).toBe(true)
    expect(useUi.getState().traaEnabled).toBe(true)
  })

  it('toggling the checkbox writes through to the UI store and back', () => {
    render(<DebugMenu />)
    const row = screen.getByText(en.debug.traa).closest('label')
    const box = row?.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(box)
    expect(useUi.getState().traaEnabled).toBe(false)
    fireEvent.click(box)
    expect(useUi.getState().traaEnabled).toBe(true)
  })

  it('carries a German label after the language switch', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    expect(screen.getByText(de.debug.traa)).toBeInTheDocument()
  })
})

describe('DebugMenu renderer row and dropdown selectors (enrichments.mjs)', () => {
  it('shows the read-only renderer row with the active backend', () => {
    render(<DebugMenu />)
    expect(screen.getByText(en.debug.renderer)).toBeInTheDocument()
    // The backend value depends on the live render backend, absent in jsdom
    // (webglFallback defaults to false → WebGPU); assert the row shows one of
    // the two labels rather than a specific one.
    const rendererRow = screen.getByText(en.debug.renderer).closest('label')
    expect(rendererRow?.textContent).toMatch(/WebGPU|WebGL 2/)
  })

  it('offers at least three dropdown selectors (jump-to / equipment / gift)', () => {
    render(<DebugMenu />)
    expect(document.querySelectorAll('.debug-menu select').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(en.debug.jumpTo)).toBeInTheDocument()
    expect(screen.getByText(en.debug.addEquipment)).toBeInTheDocument()
    expect(screen.getByText(en.debug.addGift)).toBeInTheDocument()
  })

  it('the equipment and gift dropdowns list their items', () => {
    render(<DebugMenu />)
    // Equipment select carries a machete option; gift select a copper option.
    expect(selectWithOption('machete')).toBeDefined()
    expect(selectWithOption('copper')).toBeDefined()
  })
})

describe('DebugMenu jump-to covers every named map point (design.md §21.3, point 98)', () => {
  const jumpSelect = () => selectWithOption('kilimanjaro') as HTMLSelectElement
  const groupLabels = () => [...jumpSelect().querySelectorAll('optgroup')].map((g) => g.label)
  const optionsOf = (groupLabel: string) => {
    const grp = [...jumpSelect().querySelectorAll('optgroup')].find((g) => g.label === groupLabel)
    return [...(grp?.querySelectorAll('option') ?? [])].map((o) => o.textContent ?? '')
  }

  it('offers a named entry from every category plus the graveyard and grave', () => {
    render(<DebugMenu />)
    const values = [...jumpSelect().options].map((o) => o.value)
    for (const v of ['cairo', 'nubian-village', 'kilimanjaro', 'victoria-falls', 'lake-victoria', 'meroe', 'ngorongoro', '#graveyard', '#grave']) {
      expect(values, v).toContain(v)
    }
  })

  it('groups the entries into optgroups in the fixed category order', () => {
    render(<DebugMenu />)
    expect(groupLabels()).toEqual([
      en.debug.jumpGroups.ports,
      en.debug.jumpGroups.villages,
      en.debug.jumpGroups.mountains,
      en.debug.jumpGroups.waterfalls,
      en.debug.jumpGroups.lakes,
      en.debug.jumpGroups.cultural,
      en.debug.jumpGroups.natural,
      en.debug.jumpGroups.other,
    ])
  })

  it('sorts each group alphabetically by localized name in English', () => {
    render(<DebugMenu />)
    const mountains = optionsOf(en.debug.jumpGroups.mountains)
    expect(mountains.length).toBeGreaterThan(1)
    expect([...mountains].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(mountains)
  })

  it('sorts each group alphabetically by localized name in German', () => {
    useLocale.getState().setLang('de')
    render(<DebugMenu />)
    const lakes = optionsOf(de.debug.jumpGroups.lakes)
    expect(lakes.length).toBeGreaterThan(1)
    expect([...lakes].sort((a, b) => a.localeCompare(b, 'de'))).toEqual(lakes)
  })

  it('jumps to the picked point coordinates', () => {
    render(<DebugMenu />)
    fireEvent.change(jumpSelect(), { target: { value: 'kilimanjaro' } })
    const k = MOUNTAINS.find((m) => m.id === 'kilimanjaro')!
    const expected = latLonToWorld(k.lat, k.lon)
    const pos = useGame.getState().pos
    expect(pos.x).toBeCloseTo(expected.x, 4)
    expect(pos.z).toBeCloseTo(expected.z, 4)
  })
})
