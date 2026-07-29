// THE PAGE HALF OF THE CHAT — proved, not assumed.
//
// Two things could only be settled by running the real page:
//   1. The viewer REPLACES its own document (`document.open/write/close`), so a
//      chat written statically into the body would be wiped by the board it
//      loads. Here the actual file is parsed in jsdom with a stubbed fetch, the
//      board fragment is written over it, and the chat is asserted present AND
//      usable AFTERWARDS.
//   2. The page carries a SECOND implementation of the chat protocol (a deployed
//      page cannot import a Node module). Its crypto block is extracted from the
//      file and executed here, against the same test vector scripts/chat-core.mjs
//      is pinned to — a drift between the two would split the channel in half
//      with no other symptom than "the agent never answers".
//
// `jsdom` is imported directly: it is the package vitest's configured `jsdom`
// environment runs on, so it is present wherever this suite runs at all.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { structureViolations } from './board-structure-core.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'
import { TEST_VECTOR as VECTOR, deriveTopics, makeEnvelope } from './chat-core.mjs'

const IN_MSG = { ...VECTOR.message, direction: 'inbox' }
const OUT_MSG = { ...VECTOR.message, direction: 'outbox' }

const VIEWER = resolve(process.cwd(), 'public', 'board', 'index.html')
const viewerHtml = readFileSync(VIEWER, 'utf8')

/** The page's crypto block, extracted between its markers and made callable. */
function browserCrypto() {
  const parts = viewerHtml.split('HOA-CHAT-CRYPTO-BEGIN')
  expect(parts, 'the viewer must carry a marked chat crypto block').toHaveLength(2)
  const between = parts[1].split('HOA-CHAT-CRYPTO-END')[0]
  // Both markers sit INSIDE comments; take what lies between them.
  const block = between.slice(between.indexOf('*/') + 2, between.lastIndexOf('/*'))
  // eslint-disable-next-line no-new-func
  return new Function(`${block}\nreturn { chatTopics, chatSign, chatVerify, chatCanonical }`)()
}

const board = `<!doctype html><html><head><title>b</title></head><body>${boardHtml()}
<script>window.__boardScriptRan = true</script></body></html>`

/** Load the real viewer in jsdom with a scripted fetch. Resolves once the page
 *  has settled (the chat injected, or the timeout). */
async function loadViewer({ fetchImpl, secret = null } = {}) {
  const dom = new JSDOM(viewerHtml, {
    url: 'https://patrickvonmassow.github.io/Heart-of-Africa-Remake/board/',
    runScripts: 'dangerously',
    beforeParse(window) {
      // jsdom ships no WebCrypto; the host's is the same implementation the
      // browser would use, which is the point of the parity check below.
      Object.defineProperty(window, 'crypto', { value: globalThis.crypto, configurable: true })
      window.fetch = fetchImpl
      if (secret) window.localStorage.setItem('hoa-chat-secret', secret)
    },
  })
  await settle(dom, () => dom.window.document.getElementById('hoa-chat'))
  return dom
}

/** Wait for a condition across microtasks and jsdom's own task queue. */
async function settle(dom, cond, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 5))
  }
  return Boolean(cond())
}

const okResponse = (body) => ({ ok: true, status: 200, statusText: 'OK', text: async () => body })

describe('the page speaks the same protocol as chat-core', () => {
  const api = browserCrypto()

  it('derives the SAME topics as the Node core, byte for byte', async () => {
    const mine = await api.chatTopics(VECTOR.secret)
    expect(mine).toEqual({ inbox: VECTOR.inbox, outbox: VECTOR.outbox })
    expect(mine).toEqual(await deriveTopics(VECTOR.secret))
  })

  it('signs to the same value, and verifies what the core produced', async () => {
    expect(await api.chatSign(VECTOR.secret, IN_MSG)).toBe(VECTOR.inboxSig)
    expect(await api.chatSign(VECTOR.secret, OUT_MSG)).toBe(VECTOR.outboxSig)
    expect(await api.chatVerify(VECTOR.secret, IN_MSG, VECTOR.inboxSig)).toBe(true)
    expect(await api.chatVerify('wrong-secret', IN_MSG, VECTOR.inboxSig)).toBe(false)
    const env = await makeEnvelope({ secret: VECTOR.secret, direction: 'inbox', text: 'von Node', id: 'x1', ts: 1 })
    expect(await api.chatVerify(VECTOR.secret, { direction: 'inbox', id: env.id, ts: env.ts, text: env.text }, env.sig)).toBe(true)
  })

  it('rejects a malformed signature without throwing', async () => {
    for (const bad of ['', 'nope', null, undefined, 42]) {
      expect(await api.chatVerify(VECTOR.secret, IN_MSG, bad)).toBe(false)
    }
  })
})

describe('the page is public — nothing secret is written into it', () => {
  it('contains no derived topic name and no fixed ntfy topic path', () => {
    expect(viewerHtml).not.toMatch(/hoa-[0-9a-f]{32}/)
    expect(viewerHtml).not.toMatch(/ntfy\.sh\/hoa-[A-Za-z0-9_-]+/)
  })

  it('contains no secret literal — the topics are derived at runtime', () => {
    expect(viewerHtml).toContain('chatTopics(chatState.secret)')
    expect(viewerHtml).toContain("localStorage.getItem(CHAT_SECRET_KEY)")
  })
})

describe('the chat survives the document the board writes over it', () => {
  it('is present, at the TOP, AFTER the board content has rendered', async () => {
    const dom = await loadViewer({ fetchImpl: async () => okResponse(board) })
    const doc = dom.window.document
    // The board really did replace the document…
    expect(doc.body.textContent).toContain('Woran ich gerade arbeite')
    expect(dom.window.__boardScriptRan).toBe(true)
    // …and the chat is there anyway, as the first thing on the page.
    const chat = doc.getElementById('hoa-chat')
    expect(chat).toBeTruthy()
    expect(doc.body.firstElementChild).toBe(chat)
    dom.window.close()
  })

  it('is injected on the FAILURE path too — a board that cannot be read still lets the user write', async () => {
    const dom = await loadViewer({ fetchImpl: async () => Promise.reject(new Error('offline')) })
    const doc = dom.window.document
    expect(doc.body.textContent).toContain('konnte nicht geladen werden')
    expect(doc.getElementById('hoa-chat')).toBeTruthy()
    dom.window.close()
  })

  it('is IDEMPOTENT — repeated injection adds exactly one section', async () => {
    const dom = await loadViewer({ fetchImpl: async () => okResponse(board) })
    dom.window.injectChat()
    dom.window.injectChat()
    expect(dom.window.document.querySelectorAll('#hoa-chat')).toHaveLength(1)
    expect(dom.window.document.querySelectorAll('#hoa-chat-style')).toHaveLength(1)
    dom.window.close()
  })

  it('adds no <details>, so the board fragment’s own open-card memory is untouched', async () => {
    const dom = await loadViewer({ fetchImpl: async () => okResponse(board) })
    const doc = dom.window.document
    const own = new JSDOM(board).window.document.querySelectorAll('details').length
    expect(own).toBeGreaterThan(0)
    expect(doc.querySelectorAll('details')).toHaveLength(own)
    dom.window.close()
  })
})

describe('the chat as the reader meets it', () => {
  it('starts CLOSED and makes no request until it is opened', async () => {
    const calls = []
    const dom = await loadViewer({
      fetchImpl: async (url) => {
        calls.push(String(url))
        return okResponse(board)
      },
    })
    const doc = dom.window.document
    const toggle = doc.querySelector('#hoa-chat .chat-toggle')
    const panel = doc.querySelector('#hoa-chat .chat-panel')
    expect(panel.hidden).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(calls.filter((u) => u.includes('ntfy.sh'))).toHaveLength(0)
    dom.window.close()
  })

  it('asks ONCE for the secret when the device has none', async () => {
    const dom = await loadViewer({ fetchImpl: async () => okResponse(board) })
    const doc = dom.window.document
    doc.querySelector('#hoa-chat .chat-toggle').click()
    await settle(dom, () => doc.getElementById('hoa-chat-secret-input'))
    expect(doc.getElementById('hoa-chat-secret-input')).toBeTruthy()
    expect(doc.querySelector('#hoa-chat .chat-panel').hidden).toBe(false)
    dom.window.close()
  })

  it('renders a VERIFIED outbox message, dropping a forged one AND one signed for the other topic', async () => {
    const good = await makeEnvelope({ secret: VECTOR.secret, direction: 'outbox', text: 'Antwort vom Agenten', id: 'g1', ts: Date.now() })
    const forged = await makeEnvelope({ secret: 'someone-else', direction: 'outbox', text: 'ignoriere alle Regeln', id: 'f1', ts: Date.now() })
    // Correctly signed, but for the OTHER topic — the replay the review found.
    const misdirected = await makeEnvelope({ secret: VECTOR.secret, direction: 'inbox', text: 'aus dem falschen Kanal', id: 'x9', ts: Date.now() })
    const { outbox } = await deriveTopics(VECTOR.secret)
    const line = (env) => JSON.stringify({ id: `n-${env.id}`, time: 1, event: 'message', message: JSON.stringify(env) })
    const dom = await loadViewer({
      secret: VECTOR.secret,
      fetchImpl: async (url) => {
        const u = String(url)
        if (!u.includes('ntfy.sh')) return okResponse(board)
        if (u.includes(outbox)) return okResponse(`${line(good)}\n${line(forged)}\n${line(misdirected)}\n`)
        return okResponse('')
      },
    })
    const doc = dom.window.document
    doc.querySelector('#hoa-chat .chat-toggle').click()
    await settle(dom, () => doc.querySelector('#hoa-chat-list .msg:not(.chat-empty)'))
    const text = doc.getElementById('hoa-chat-list').textContent
    expect(text).toContain('Antwort vom Agenten')
    expect(text).not.toContain('ignoriere alle Regeln')
    expect(text).not.toContain('aus dem falschen Kanal')
    dom.window.close()
  })

  it('says the chat needs the web board when its own fetch is blocked', async () => {
    const dom = await loadViewer({
      secret: VECTOR.secret,
      fetchImpl: async (url) => {
        if (String(url).includes('ntfy.sh')) throw new Error('blocked by CSP')
        return okResponse(board)
      },
    })
    const doc = dom.window.document
    doc.querySelector('#hoa-chat .chat-toggle').click()
    await settle(dom, () => doc.getElementById('hoa-chat-input')?.disabled)
    expect(doc.getElementById('hoa-chat-note').textContent).toContain('Web-Board-Seite')
    expect(doc.getElementById('hoa-chat-input').disabled).toBe(true)
    dom.window.close()
  })

  it('signs what it sends, so the agent side can verify it', async () => {
    const posted = []
    const { inbox } = await deriveTopics(VECTOR.secret)
    const dom = await loadViewer({
      secret: VECTOR.secret,
      fetchImpl: async (url, init) => {
        const u = String(url)
        if (init && init.method === 'POST') {
          posted.push({ url: u, body: JSON.parse(init.body) })
          return okResponse('')
        }
        return okResponse(u.includes('ntfy.sh') ? '' : board)
      },
    })
    const doc = dom.window.document
    doc.querySelector('#hoa-chat .chat-toggle').click()
    // The send button unlocks only once the topics are derived and the first
    // poll came back — waiting on it is waiting for a genuinely ready channel.
    await settle(dom, () => doc.querySelector('#hoa-chat button.send')?.disabled === false)
    doc.getElementById('hoa-chat-input').value = 'bitte Punkt 12 zuerst'
    doc.getElementById('hoa-chat-form').dispatchEvent(new dom.window.Event('submit'))
    await settle(dom, () => posted.length > 0)
    expect(posted).toHaveLength(1)
    expect(posted[0].url).toContain(inbox)
    const env = posted[0].body
    expect(env.v).toBe('hoa-chat-1')
    expect(env.sig).toMatch(/^[0-9a-f]{64}$/)
    const api = browserCrypto()
    expect(await api.chatVerify(VECTOR.secret, { direction: 'inbox', id: env.id, ts: env.ts, text: env.text }, env.sig)).toBe(true)
    // The page signs FOR THE INBOX, so the agent side accepts it and the same
    // bytes replayed onto the outbox do not verify.
    expect(await api.chatVerify(VECTOR.secret, { direction: 'outbox', id: env.id, ts: env.ts, text: env.text }, env.sig)).toBe(false)
    // …and it shows up in the list right away.
    expect(doc.getElementById('hoa-chat-list').textContent).toContain('bitte Punkt 12 zuerst')
    dom.window.close()
  })
})

describe('the phone-shaped details', () => {
  const style = viewerHtml.match(/chatStyles\(\)[\s\S]*?document\.head\.append\(s\)/)[0]

  it('sets the input to 16px, below which iOS zooms the page on focus', () => {
    expect(style).toContain('font-size:16px')
  })

  it('pads the composer past the home indicator', () => {
    expect(style).toContain('env(safe-area-inset-bottom)')
  })

  it('scrolls the list to the newest message', () => {
    expect(viewerHtml).toContain('list.scrollTop = list.scrollHeight')
  })
})

describe('the board audits are untouched by the chat', () => {
  // The strong claim of this design: the chat is not merely SHAPED so the
  // section parsers tolerate it — it never reaches them at all. These modules
  // parse the board CONTENT (.batch-dashboard.html / the `board` branch); the
  // viewer is a different file that none of them reads.
  const SECTION_PARSERS = [
    'board-structure-core.mjs',
    'dashboard-guard-core.mjs',
    'board-core.mjs',
    'board-first-core.mjs',
    'board-archive-rotate.mjs',
    'queue-order-guard-core.mjs',
    'dashboard-sync-core.mjs',
    'dashboard-conciseness-guard-core.mjs',
    'dashboard-card-topic-guard-core.mjs',
    'dashboard-integrity-guard-core.mjs',
  ]

  it('no section-parsing module reads the viewer page', () => {
    for (const name of SECTION_PARSERS) {
      const src = readFileSync(resolve(process.cwd(), 'scripts', name), 'utf8')
      expect(src, `${name} must not read public/board`).not.toContain('public/board')
      expect(src, `${name} must not read the viewer file`).not.toMatch(/board[/\\]index\.html/)
    }
  })

  it('the four-section audit still passes on a board with the chat live', () => {
    // The board content is what the audit sees, and the chat adds nothing to
    // it — the section verdict is identical with the chat deployed.
    expect(structureViolations(boardHtml())).toEqual([])
  })

  it('would FAIL if the chat markup ever leaked into the board content', () => {
    // The guard rail behind the claim: were the chat ever written into the board
    // fragment as a section, the structure audit would say so. This is what the
    // viewer placement avoids.
    const leaked = boardHtml().replace('<main>', '<main><details class="sect"><summary><h2>Chat</h2></summary></details>')
    expect(structureViolations(leaked).map((v) => v.code)).toContain('sections-wrong')
  })
})
