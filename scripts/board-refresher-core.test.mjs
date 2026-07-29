// The refresher, run for real (point 419 b). This is the test that did not exist
// when the board moved into its Pages shell — and its absence is why the page
// stopped updating itself for a whole transport generation without a word.
//
// It evaluates the SHIPPED source string, not a re-implementation: whatever the
// board embeds is what runs here.
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { BOARD_CONTENT_URL, REFRESHER_SOURCE, refresherScript } from './board-refresher-core.mjs'

/** Build the refresher from the shipped source with injected collaborators. */
function build(env) {
  // eslint-disable-next-line no-new-func
  const make = new Function(`${REFRESHER_SOURCE}; return createBoardRefresher;`)()
  return make(env)
}

const page = (mainHtml) => `<html><head></head><body><main>${mainHtml}</main></body></html>`

function harness({ body = '<p>alt</p>', response = page('<p>neu</p>'), ok = true } = {}) {
  document.body.innerHTML = `<main>${body}</main>`
  const reload = vi.fn()
  const setItem = vi.fn()
  const fetchImpl = vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 404, text: () => Promise.resolve(response) }))
  const onSwap = vi.fn()
  const win = {
    DOMParser,
    scrollY: 120,
    sessionStorage: { setItem },
    location: { reload },
  }
  const refresh = build({ document, window: win, fetch: fetchImpl, source: BOARD_CONTENT_URL, onSwap })
  return { refresh, fetchImpl, reload, setItem, onSwap }
}

describe('the board refresher fetches the content, not the page it happens to sit on', () => {
  it('asks the content url — the exact failure of the shell move', async () => {
    const { refresh, fetchImpl } = harness()
    await refresh()
    expect(fetchImpl).toHaveBeenCalledOnce()
    const url = fetchImpl.mock.calls[0][0]
    expect(url.startsWith(BOARD_CONTENT_URL)).toBe(true)
    expect(url).not.toContain('localhost')
    expect(fetchImpl.mock.calls[0][1]).toEqual({ cache: 'no-store' })
  })

  it('swaps the main content when it changed, and reports the swap', async () => {
    const { refresh, onSwap } = harness({ body: '<p>alt</p>', response: page('<p>neu</p>') })
    expect(await refresh()).toBe('swapped')
    expect(document.querySelector('main').innerHTML).toContain('neu')
    expect(onSwap).toHaveBeenCalledOnce()
  })

  it('does nothing at all when the content is unchanged — no flicker', async () => {
    const { refresh, onSwap } = harness({ body: '<p>gleich</p>', response: page('<p>gleich</p>') })
    expect(await refresh()).toBe('unchanged')
    expect(onSwap).not.toHaveBeenCalled()
  })
})

describe('it never sits still when it cannot do its job', () => {
  // The whole defect in one case: a response with no <main> — which is exactly
  // what the SHELL returns — used to mean "return quietly" and therefore
  // "never update again".
  it('reloads when the response carries no main (the shell), instead of returning quietly', async () => {
    const shell = '<html><body><div class="note">Board wird geladen …</div></body></html>'
    const { refresh, reload, setItem } = harness({ response: shell })
    expect(await refresh()).toBe('reload')
    expect(reload).toHaveBeenCalledOnce()
    expect(setItem).toHaveBeenCalledWith('hoa-dash-y', '120')
  })

  it('reloads when the live document itself has no main', async () => {
    const { refresh, reload } = harness()
    document.body.innerHTML = '<div>kein main</div>'
    expect(await refresh()).toBe('reload')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('treats a non-ok response as an error rather than parsing its body', async () => {
    const { refresh, reload } = harness({ ok: false, response: '404: Not Found' })
    expect(await refresh()).toBe('error')
    expect(reload).not.toHaveBeenCalled()
  })

  it('after a failed fetch it degrades to a scroll-safe reload rather than going quiet', async () => {
    const { refresh, reload } = harness({ ok: false })
    await refresh()
    expect(await refresh()).toBe('reload')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('skips the poll entirely while the page is hidden', async () => {
    const { refresh, fetchImpl } = harness()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    expect(await refresh()).toBe('hidden')
    expect(fetchImpl).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
})

describe('the embedded script', () => {
  it('carries the source verbatim and arms it with the content url', () => {
    const script = refresherScript()
    expect(script).toContain(REFRESHER_SOURCE)
    expect(script).toContain(JSON.stringify(BOARD_CONTENT_URL))
    expect(script).toContain('setInterval(refresh, 30000)')
    expect(script).toContain('visibilitychange')
  })

  it('never polls the page it is written into', () => {
    expect(refresherScript()).not.toContain('location.href')
  })
})

describe('the swap must not collapse what the reader opened', () => {
  // The regression this pins: onSwap was read EAGERLY at construction, when the
  // other script block had not exported the restorer yet — so it was undefined,
  // and every refresh replaced the cards with their default (closed) state.
  it('calls the restorer that exists at SWAP time, not the one that existed at build time', async () => {
    document.body.innerHTML = '<main><p>alt</p></main>'
    const calls = []
    const win = {
      DOMParser,
      scrollY: 0,
      sessionStorage: { setItem() {} },
      location: { reload() {} },
    }
    // Exactly the wiring the embedded script uses: resolved when the swap happens.
    const env = {
      document,
      window: win,
      fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html><body><main><p>neu</p></main></body></html>') }),
      source: BOARD_CONTENT_URL,
      onSwap: () => { if (typeof win.__hoaBoardRestore === 'function') win.__hoaBoardRestore() },
    }
    // eslint-disable-next-line no-new-func
    const refresh = new Function(`${REFRESHER_SOURCE}; return createBoardRefresher;`)()(env)
    // The restorer is exported only AFTER the refresher was built — the real order.
    win.__hoaBoardRestore = () => calls.push('restored')
    expect(await refresh()).toBe('swapped')
    expect(calls).toEqual(['restored'])
  })

  it('the embedded script resolves the restorer lazily rather than capturing it', () => {
    const script = refresherScript()
    expect(script).toContain('typeof window.__hoaBoardRestore === "function"')
    expect(script).not.toMatch(/onSwap:\s*window\.__hoaBoardRestore\s*[,}]/)
  })
})
