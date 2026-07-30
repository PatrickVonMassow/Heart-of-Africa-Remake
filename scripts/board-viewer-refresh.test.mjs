// THE BOARD REFRESH, FROM THE READER'S SEAT (point 441).
//
// The user reported it from the phone: "a dashboard refresh takes the focus out
// of the chat input and the scroll position away". The board content carries a
// 30-second refresher that replaces <main> whenever the published bytes differ
// from what <main> holds — and they ALWAYS differed, because the viewer injects
// the chat INTO <main> and the board's own localStorage script writes `open`
// attributes onto the cards the reader opened. Neither is in the published
// bytes. So the "only on a real change" swap ran on every single tick.
//
// The fix is a gate the viewer wraps around `window.fetch`, which is what the
// refresher captures. These cases therefore drive the REAL viewer file and the
// REAL shipped refresher source against each other — a re-implementation of
// either would prove nothing about the page the reader loads.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { BOARD_CONTENT_URL, REFRESHER_SOURCE } from './board-refresher-core.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'
import { TEST_VECTOR } from './chat-core.mjs'

const VIEWER = resolve(process.cwd(), 'public', 'board', 'index.html')
const viewerHtml = readFileSync(VIEWER, 'utf8')

/** The viewer's swap decision, extracted from its marked block and made callable. */
function swapDecision() {
  const parts = viewerHtml.split('HOA-BOARD-SWAP-BEGIN')
  expect(parts, 'the viewer must carry a marked swap-decision block').toHaveLength(2)
  const between = parts[1].split('HOA-BOARD-SWAP-END')[0]
  // Both markers sit INSIDE comments; take what lies between them.
  const block = between.slice(between.indexOf('*/') + 2, between.lastIndexOf('/*'))
  // eslint-disable-next-line no-new-func
  return new Function(`${block}\nreturn { boardSwapDecision, BOARD_HOLD_TICKS }`)()
}

const page = (marker) =>
  `<!doctype html><html><head><title>b</title></head><body>${boardHtml().replace(
    'Kurzstand.',
    marker,
  )}</body></html>`

const okResponse = (body) => ({ ok: true, status: 200, statusText: 'OK', text: async () => body })

/** Wait for a condition across microtasks and jsdom's own task queue. */
async function settle(cond, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 5))
  }
  return Boolean(cond())
}

/**
 * Load the real viewer with a board it can render, and hand back a `poll()`
 * that runs the REAL refresher through the viewer's gated `fetch` — exactly the
 * wiring the published board arms (`fetch: fetch`, resolved when its script runs
 * inside the written document, i.e. after the gate is installed).
 */
async function loadBoard({ published = page('Kurzstand.') } = {}) {
  const served = { board: published, ok: true }
  const scrolled = []
  const dom = new JSDOM(viewerHtml, {
    url: 'https://patrickvonmassow.github.io/Heart-of-Africa-Remake/board/',
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'crypto', { value: globalThis.crypto, configurable: true })
      // Paired already: the composer — not the pairing form — is what a refresh
      // must not take away.
      window.localStorage.setItem('hoa-chat-secret', TEST_VECTOR.secret)
      window.fetch = async (url) => {
        if (String(url).includes('ntfy.sh')) return okResponse('')
        if (!served.ok) return { ok: false, status: 500, statusText: 'Server Error', text: async () => '' }
        return okResponse(served.board)
      }
      // jsdom does not scroll; the offset is what matters, so record the demand.
      window.scrollTo = (x, y) => scrolled.push(y)
    },
  })
  await settle(() => dom.window.document.getElementById('hoa-chat'))
  const win = dom.window
  Object.defineProperty(win.document, 'visibilityState', { value: 'visible', configurable: true })
  // eslint-disable-next-line no-new-func
  const make = new win.Function(`${REFRESHER_SOURCE}; return createBoardRefresher;`)()
  const refresh = make({
    document: win.document,
    window: win,
    fetch: win.fetch,
    source: BOARD_CONTENT_URL,
    onSwap() {
      if (typeof win.__hoaBoardRestore === 'function') win.__hoaBoardRestore()
    },
  })
  const poll = async () => {
    const outcome = await refresh()
    await settle(() => true, 3) // let the observer and the listener run
    return outcome
  }
  return { dom, doc: win.document, win, served, scrolled, poll }
}

/** Open the chat and return its input, ready to be typed into. */
async function openChat(doc) {
  doc.querySelector('#hoa-chat .chat-toggle').click()
  await settle(() => doc.getElementById('hoa-chat-input'))
  return doc.getElementById('hoa-chat-input')
}

function type(win, input, text, { focus = true } = {}) {
  if (focus) {
    input.focus()
    input.dispatchEvent(new win.Event('focus'))
  }
  input.value = text
  input.dispatchEvent(new win.Event('input'))
  return input
}

describe('the swap decision, as a rule set', () => {
  const { boardSwapDecision, BOARD_HOLD_TICKS } = swapDecision()
  const fresh = () => ({ rendered: null, held: 0 })

  it('renders the very first board it ever sees, typing or not', () => {
    expect(boardSwapDecision(fresh(), 'a', null, false)).toBe('swap')
    expect(boardSwapDecision(fresh(), 'a', null, true)).toBe('swap')
  })

  it('does NOTHING when the fetched bytes are the ones already rendered', () => {
    const state = { rendered: null, held: 3 }
    expect(boardSwapDecision(state, 'same', 'same', false)).toBe('unchanged')
    expect(state.held, 'an unchanged poll clears the hold counter').toBe(0)
  })

  it('swaps a changed board when nobody is writing', () => {
    expect(boardSwapDecision(fresh(), 'neu', 'alt', false)).toBe('swap')
  })

  it('holds a changed board back while the reader is mid-word', () => {
    const state = fresh()
    expect(boardSwapDecision(state, 'neu', 'alt', true)).toBe('hold')
    expect(state.held).toBe(1)
  })

  it('lets go at the cap, so a field left focused cannot freeze the board', () => {
    const state = fresh()
    for (let i = 0; i < BOARD_HOLD_TICKS; i++) {
      expect(boardSwapDecision(state, 'neu', 'alt', true), `poll ${i + 1}`).toBe('hold')
    }
    expect(boardSwapDecision(state, 'neu', 'alt', true)).toBe('swap')
    expect(state.held, 'and the next typing session gets its own full grace').toBe(0)
    expect(boardSwapDecision(state, 'neuer', 'neu', true)).toBe('hold')
  })

  it('caps at two minutes of the board’s 30-second tick', () => {
    expect(BOARD_HOLD_TICKS).toBe(4)
  })
})

describe('an unchanged board is not swapped at all', () => {
  it('leaves every node where it was — same elements, not a rebuild', async () => {
    const { doc, poll, dom } = await loadBoard()
    const main = doc.querySelector('main')
    const before = Array.from(main.children)
    const chat = doc.getElementById('hoa-chat')
    expect(await poll()).toBe('unchanged')
    expect(Array.from(main.children)).toEqual(before)
    expect(doc.getElementById('hoa-chat')).toBe(chat)
    dom.window.close()
  })

  it('keeps the cards the reader opened, which the published bytes never carry', async () => {
    const { doc, poll, dom } = await loadBoard()
    const card = doc.querySelector('main details')
    card.open = true
    expect(doc.querySelector('main').innerHTML).toContain('open')
    expect(await poll()).toBe('unchanged')
    expect(card.open).toBe(true)
    dom.window.close()
  })

  it('keeps focus and caret through a tick nobody needed — the reported bug', async () => {
    const { doc, win, poll, dom } = await loadBoard()
    const input = type(win, await openChat(doc), 'mitten im Wort')
    input.setSelectionRange(6, 6)
    input.dispatchEvent(new win.Event('keyup'))
    expect(await poll()).toBe('unchanged')
    expect(doc.getElementById('hoa-chat-input')).toBe(input)
    expect(doc.activeElement).toBe(input)
    expect(input.selectionStart).toBe(6)
    dom.window.close()
  })

  it('scrolls nowhere when nothing was swapped', async () => {
    const { win, poll, scrolled, dom } = await loadBoard()
    Object.defineProperty(win, 'scrollY', { value: 240, configurable: true })
    expect(await poll()).toBe('unchanged')
    expect(scrolled).toEqual([])
    dom.window.close()
  })
})

describe('a board that DID change still lands', () => {
  it('renders the new content and brings the chat back with it', async () => {
    const { doc, served, poll, dom } = await loadBoard()
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    expect(doc.body.textContent).toContain('Neuer Stand um 03:10.')
    expect(doc.querySelectorAll('#hoa-chat')).toHaveLength(1)
    dom.window.close()
  })

  it('gives the reader their scroll offset back', async () => {
    const { win, served, poll, scrolled, dom } = await loadBoard()
    Object.defineProperty(win, 'scrollY', { value: 240, configurable: true })
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    expect(scrolled).toEqual([240])
    dom.window.close()
  })

  it('restores focus and caret into the rebuilt field', async () => {
    const { doc, win, served, poll, dom } = await loadBoard()
    const input = type(win, await openChat(doc), 'mitten im Wort')
    input.setSelectionRange(6, 6)
    input.dispatchEvent(new win.Event('keyup'))
    served.board = page('Neuer Stand um 03:10.')
    // Four polls are held back for the typist; the fifth is the one that lands.
    for (let i = 0; i < 4; i++) await poll()
    expect(await poll()).toBe('swapped')
    await settle(() => doc.getElementById('hoa-chat-input') !== input)
    const rebuilt = doc.getElementById('hoa-chat-input')
    expect(rebuilt).not.toBe(input)
    expect(doc.activeElement).toBe(rebuilt)
    expect(rebuilt.value).toBe('mitten im Wort')
    expect(rebuilt.selectionStart).toBe(6)
    dom.window.close()
  })

  it('reopens the cards BEFORE it restores the offset — the order the offset means', async () => {
    const { win, served, poll, scrolled, dom } = await loadBoard()
    const order = []
    // The board's own localStorage script exports this; the fixture has no such
    // script, so it stands in for it and records when it ran.
    win.__hoaBoardRestore = () => order.push('cards')
    win.scrollTo = (x, y) => order.push('scroll:' + y)
    Object.defineProperty(win, 'scrollY', { value: 90, configurable: true })
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    expect(order).toEqual(['cards', 'scroll:90'])
    expect(scrolled).toEqual([]) // the replaced scrollTo is the one that ran
    dom.window.close()
  })

  it('does not swap twice for one change — the second poll is quiet again', async () => {
    const { served, poll, dom } = await loadBoard()
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    expect(await poll()).toBe('unchanged')
    dom.window.close()
  })
})

describe('a message being typed is never interrupted', () => {
  it('defers the swap while the field is focused and holds a draft', async () => {
    const { doc, win, served, poll, dom } = await loadBoard()
    const input = type(win, await openChat(doc), 'halb getippt')
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('unchanged')
    expect(doc.body.textContent).not.toContain('Neuer Stand um 03:10.')
    expect(doc.getElementById('hoa-chat-input')).toBe(input)
    expect(doc.activeElement).toBe(input)
    dom.window.close()
  })

  it('gives up after the cap, so the board can never be frozen by a focused field', async () => {
    const { doc, win, served, poll, dom } = await loadBoard()
    type(win, await openChat(doc), 'halb getippt')
    served.board = page('Neuer Stand um 03:10.')
    for (let i = 0; i < 4; i++) expect(await poll(), `poll ${i + 1}`).toBe('unchanged')
    expect(await poll()).toBe('swapped')
    expect(doc.body.textContent).toContain('Neuer Stand um 03:10.')
    dom.window.close()
  })

  it('defers nothing for a field that is focused but EMPTY', async () => {
    const { doc, win, served, poll, dom } = await loadBoard()
    const input = await openChat(doc)
    type(win, input, '   ') // whitespace is not a message
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    dom.window.close()
  })

  it('defers nothing for a draft the reader left to go read the board', async () => {
    const { doc, win, served, poll, dom } = await loadBoard()
    const input = type(win, await openChat(doc), 'halb getippt')
    input.blur()
    input.dispatchEvent(new win.Event('blur'))
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    dom.window.close()
  })

  it('defers nothing when the chat was never opened — there is no field at all', async () => {
    const { doc, served, poll, dom } = await loadBoard()
    expect(doc.getElementById('hoa-chat-input')).toBeNull()
    served.board = page('Neuer Stand um 03:10.')
    expect(await poll()).toBe('swapped')
    dom.window.close()
  })
})

describe('the gate stays out of everything that is not the board', () => {
  it('passes the chat’s own traffic through untouched', async () => {
    const { win, dom } = await loadBoard()
    const res = await win.fetch('https://ntfy.sh/hoa-test/json?poll=1')
    expect(await res.text()).toBe('') // the harness' own answer, not a mirrored <main>
    dom.window.close()
  })

  it('hands a failed board fetch to the refresher as the error it is', async () => {
    const { served, poll, dom } = await loadBoard()
    // A non-ok response must still read as an error — never as "nothing
    // changed", which would leave the reader on a board that quietly stopped.
    served.ok = false
    expect(await poll()).toBe('error')
    dom.window.close()
  })
})
