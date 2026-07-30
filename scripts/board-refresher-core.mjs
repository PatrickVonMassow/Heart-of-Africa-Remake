// The board's self-refresh, as VERSIONED source (point 419 b).
//
// WHY IT LIVES HERE. The refresher used to sit only inside `.batch-dashboard.html`,
// which is git-ignored — so no test could see it, and when point 400 moved the
// board off the retired mirror (where the fragment WAS the whole document) into
// a Pages shell, the script kept polling `location.href`. That is the shell now, and the
// shell has no `<main>`: the swap was skipped, silently, every 30 seconds, for
// ever. The built-in fallback could not catch it either — it needs a FAILED
// fetch, and fetching the shell returns 200. A reader saw hours-old work while
// the page dutifully polled.
//
// The source is therefore a string in a TRACKED module. The board embeds it
// verbatim, `structureViolations` refuses to publish a board that does not carry
// it, and the Vitest layer runs it in jsdom against both shapes. A transport
// change can still break the refresher — but not silently.

/** Where the published board content lives. The shell knows this URL too; the
 *  fragment must carry its own copy because it is written INTO that shell and
 *  cannot read the shell's constants. */
export const BOARD_CONTENT_URL =
  'https://raw.githubusercontent.com/PatrickVonMassow/Heart-of-Africa-Remake/board/board.html'

/**
 * The signal the refresher raises on `window` after a successful swap
 * (point 423).
 *
 * WHY A SIGNAL AND NOT MARKUP: the message channel is INJECTED by the viewer
 * into the rendered board, because nothing about the chat may enter the board
 * CONTENT. Since the chat moved under the board's heading it sits inside
 * `<main>` — and the swap replaces `<main>` wholesale, so every successful
 * refresh deleted the channel while the reader was looking at it (returning to
 * the browser makes the page visible, which fires the poll at once). The
 * refresher is versioned source and the injection lives in the viewer, so the
 * seam between them is this documented event rather than a shared variable.
 */
export const BOARD_SWAP_EVENT = 'hoa-board-swapped'

/**
 * The refresher, as the text the board embeds. It is a function DECLARATION
 * rather than an IIFE so the test can call it with injected collaborators; the
 * board appends the one line that starts it with the real ones.
 */
export const REFRESHER_SOURCE = String.raw`
function createBoardRefresher(env) {
  var doc = env.document, win = env.window, source = env.source, fetchImpl = env.fetch;
  var canFetch = true;
  function scrollSafeReload() {
    try { win.sessionStorage.setItem('hoa-dash-y', String(win.scrollY)); } catch (e) {}
    win.location.reload();
  }
  function refresh() {
    if (doc.visibilityState !== 'visible') return Promise.resolve('hidden');
    if (!canFetch) { scrollSafeReload(); return Promise.resolve('reload'); }
    // THE CONTENT, NOT THE LOCATION: under the Pages shell the location is the
    // shell, which has no <main> — the swap then never happens and nothing says so.
    return fetchImpl(source + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var parsed = new win.DOMParser().parseFromString(html, 'text/html');
        var fresh = parsed.querySelector('main'), cur = doc.querySelector('main');
        // NEVER SIT STILL: with nothing to swap into, this poll cannot do its job.
        // Returning quietly is what hid the breakage for a whole transport change.
        if (!fresh || !cur) { scrollSafeReload(); return 'reload'; }
        if (fresh.innerHTML === cur.innerHTML) return 'unchanged';
        cur.innerHTML = fresh.innerHTML;
        if (typeof env.onSwap === 'function') env.onSwap();
        // THE SWAP ANNOUNCES ITSELF (point 423). Whatever the viewer injected
        // into the replaced content — the message channel — is gone now and has
        // to be put back. Guarded on both sides: the test harness hands in a
        // plain object as its window, and a missing Event constructor must never
        // turn a working refresh into a caught error.
        try {
          if (typeof win.dispatchEvent === 'function' && typeof win.Event === 'function') {
            win.dispatchEvent(new win.Event('${BOARD_SWAP_EVENT}'));
          }
        } catch (e) {}
        return 'swapped';
      })
      .catch(function () { canFetch = false; return 'error'; });
  }
  return refresh;
}
`.trim()

/** The `<script>` block the board carries, refresher plus the line that arms it. */
export function refresherScript(source = BOARD_CONTENT_URL) {
  return [
    '<script>',
    REFRESHER_SOURCE,
    '(function(){',
    // onSwap is resolved at CALL time, not here: the swap replaces the cards, so
    // whatever restores the reader's opened sections must run right after it. Read
    // eagerly, this was `undefined` (the other block had not exported it yet) and
    // every refresh silently collapsed the board the reader had opened.
    '  var refresh = createBoardRefresher({ document: document, window: window, fetch: fetch,',
    `    source: ${JSON.stringify(source)},`,
    '    onSwap: function(){ if (typeof window.__hoaBoardRestore === "function") window.__hoaBoardRestore(); } });',
    '  setInterval(refresh, 30000);',
    "  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') refresh(); });",
    '})();',
    '</script>',
  ].join('\n')
}
