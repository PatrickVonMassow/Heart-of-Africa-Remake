// Trade, bazaar, ferry and camp dialogs (CLAUDE.md §7.1 pt. 5/6/7/26,
// design.md §9/§10/§6). Ports the render-side dialog asserts of i18n.mjs /
// economy.mjs into React Testing Library checks: the trade dialog lays goods
// out as a name/price table, and villages price in gifts, not money.
// Pixel-perfect column alignment (getBoundingClientRect) stays in Playwright —
// jsdom has no layout.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { Dialogs } from './Dialogs'
import { en } from '../i18n/en'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { freshGame, g, useGame } from '../test/store'
import { PLACES } from '../world/geo'

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
})

describe('trade dialog (design.md §9)', () => {
  it('lays goods out as a name/price table with buy actions, priced in $ in a port', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'trade', building: 'shop' })
    render(<Dialogs />)
    expect(document.querySelector('.dialog')).toBeInTheDocument()
    const rows = document.querySelectorAll('.trade-grid .trade-row')
    expect(rows.length).toBeGreaterThan(0)
    // Every row carries a name cell and a price cell (the column).
    for (const row of rows) {
      expect(row.querySelector('.trade-name')).toBeInTheDocument()
      expect(row.querySelector('.price')).toBeInTheDocument()
    }
    expect(document.querySelector('.dialog')?.textContent).toContain('$')
  })

  it('prices village goods in gifts, not money (design.md §10)', () => {
    g().enterPlace('nubian-village') // north village → currency is gifts
    useUi.getState().setDialog({ kind: 'trade', building: 'market' })
    render(<Dialogs />)
    const txt = document.querySelector('.dialog')?.textContent ?? ''
    expect(txt).toMatch(/gifts|Gaben/i)
    expect(txt).not.toContain('$')
  })

  it('no longer offers the map as a shop good (point 93)', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'trade', building: 'shop' })
    render(<Dialogs />)
    const names = [...document.querySelectorAll('.buy-grid .trade-name')].map((e) => e.textContent)
    expect(names.length).toBeGreaterThan(0)
    expect(names).not.toContain('Map')
    expect(names).not.toContain('Karte')
  })

  it('lays the gear buy-back (sell) list out in the same aligned grid (point 95)', () => {
    g().enterPlace('cairo')
    g().debugAddEquipment('shovel')
    g().debugAddEquipment('rope')
    useUi.getState().setDialog({ kind: 'trade', building: 'shop' })
    render(<Dialogs />)
    const sellRows = document.querySelectorAll('.sell-grid .trade-row')
    expect(sellRows.length).toBeGreaterThan(0) // owned gear is sellable
    for (const row of sellRows) {
      expect(row.querySelector('.trade-name')).toBeInTheDocument()
      expect(row.querySelector('.price')).toBeInTheDocument()
    }
  })
})

describe('bazaar dialog (design.md §10)', () => {
  it('prices the treasure buy list in $ and offers an owned treasure', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'bazaar' })
    const { rerender } = render(<Dialogs />)
    // The buy list is priced in dollars (a column of .price cells).
    expect(document.querySelector('.dialog')?.textContent).toContain('$')
    expect(document.querySelectorAll('.dialog .price').length).toBeGreaterThan(0)
    // No offer button until a treasure is carried.
    const offerBtns = () => [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.offer)
    expect(offerBtns().length).toBe(0)
    // Gold is revered in the North, so Cairo's bazaar trades it.
    g().debugAddTreasure('gold')
    rerender(<Dialogs />)
    expect(offerBtns().length).toBeGreaterThan(0)
  })

  it('lays the buy and offer lists out in aligned grids, not ragged rows (point 95)', () => {
    g().enterPlace('cairo')
    g().debugAddTreasure('gold')
    useUi.getState().setDialog({ kind: 'bazaar' })
    render(<Dialogs />)
    // Buy list: name / price / action columns.
    const buyRows = document.querySelectorAll('.buy-grid .trade-row')
    expect(buyRows.length).toBeGreaterThan(0)
    for (const row of buyRows) {
      expect(row.querySelector('.trade-name')).toBeInTheDocument()
      expect(row.querySelector('.price')).toBeInTheDocument()
    }
    // Offer (sell) list: name / action columns (no price cell until a bid).
    const offerRows = document.querySelectorAll('.offer-grid .trade-row')
    expect(offerRows.length).toBeGreaterThan(0)
    for (const row of offerRows) {
      expect(row.querySelector('.trade-name')).toBeInTheDocument()
    }
    // The treasure lists no longer use the ragged flex .row layout — only the
    // single cash header row remains a plain .row (no bid active here).
    expect(document.querySelectorAll('.dialog .row').length).toBe(1)
  })

  it('shows an accept/decline bid row after offering a treasure', () => {
    g().enterPlace('cairo')
    g().debugAddTreasure('gold')
    useUi.getState().setDialog({ kind: 'bazaar' })
    const { rerender } = render(<Dialogs />)
    g().offerTreasure('gold')
    rerender(<Dialogs />)
    const bidRow = document.querySelector('.bazaar-bid')
    expect(bidRow).toBeInTheDocument()
    const btnTexts = [...bidRow!.querySelectorAll('button')].map((b) => b.textContent)
    expect(btnTexts).toContain(en.dialogs.accept)
    expect(btnTexts).toContain(en.dialogs.decline)
  })
})

describe('travel agency dialog (design.md §10)', () => {
  it('lists a passage to every other port with a fare and a duration', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'agency' })
    render(<Dialogs />)
    const bookBtns = [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.book)
    const otherPorts = PLACES.filter((p) => p.kind === 'port' && p.id !== 'cairo').length
    expect(bookBtns.length).toBe(otherPorts)
    // Each passage row carries a $ fare and a day count.
    const text = document.querySelector('.dialog')?.textContent ?? ''
    expect(text).toContain('$')
    expect(text).toMatch(/days/i)
    // Aligned grid: every passage row has a name and a price cell (point 95).
    const rows = document.querySelectorAll('.ferry-grid .trade-row')
    expect(rows.length).toBe(otherPorts)
    for (const row of rows) {
      expect(row.querySelector('.trade-name')).toBeInTheDocument()
      expect(row.querySelector('.price')).toBeInTheDocument()
    }
  })

  it('disables the book button when money is below the fare', () => {
    g().enterPlace('cairo')
    useGame.setState({ money: 0 })
    useUi.getState().setDialog({ kind: 'agency' })
    render(<Dialogs />)
    const bookBtns = [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.book)
    expect(bookBtns.length).toBeGreaterThan(0)
    for (const b of bookBtns) expect(b).toBeDisabled()
  })
})

describe('camp dialog — free camp (design.md §6)', () => {
  it('stores from the pack, showing empty-camp flavor then contents + take buttons', () => {
    // A free camp is pitched only while travelling; it opens its own dialog.
    useGame.setState({ mode: 'travel', placeId: null })
    g().debugAddEquipment('shovel')
    g().pitchOrOpenCamp()
    const { rerender } = render(<Dialogs />)
    expect(document.querySelector('.dialog h3')?.textContent).toBe(en.dialogs.campTitle)

    const storeBtns = () => [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.campStore)
    const takeBtns = () => [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.campTake)
    const text = () => document.querySelector('.dialog')?.textContent ?? ''

    // The pack has gear to store; the fresh cache is empty.
    expect(storeBtns().length).toBeGreaterThan(0)
    expect(takeBtns().length).toBe(0)
    expect(text()).toContain(en.dialogs.campEmpty)

    // Store the shovel: the cache now shows contents and a take button.
    g().campStore('equipment', 'shovel')
    rerender(<Dialogs />)
    expect(takeBtns().length).toBeGreaterThan(0)
    expect(text()).toContain(en.dialogs.campContents)
  })
})

describe('camp dialog — village cache (design.md §6/§12, point 173)', () => {
  it('renders the village-cache title and hint (only the free-camp scope was exercised before)', () => {
    g().enterPlace('nubian-village')
    useGame.setState({ honoredFriend: { north: true } })
    g().openVillageCamp()
    render(<Dialogs />)
    expect(document.querySelector('.dialog h3')?.textContent).toBe(en.dialogs.villageCampTitle)
    expect(document.querySelector('.dialog')?.textContent).toContain(en.dialogs.villageCampHint)
  })
})
