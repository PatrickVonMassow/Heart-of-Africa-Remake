// Is the board still STRUCTURALLY intact? (28.07.2026 — three breakages in one
// evening, the third one visible on the user's phone.)
//
// WHY THIS EXISTS, and why it is not a rule anyone has to remember: the board is
// one HTML file that gets edited. Every edit that reaches for the section around
// a card — "cut from the heading to the next <h2>, reorder, paste back" — can
// move a closing tag, and the browser then nests the following cards inside the
// wrong container. That happened three times on 28.07.2026: the now-cards landed
// in the next section, an orphan `<details class="sect"><summary><h2>` was left
// behind with no content, and the "Von dir zu klären" heading lost its wrapper.
//
// The existing consistency audit DID catch each one — but only at
// `dashboard-guard --synced`, which runs AFTER the publish. So a broken board
// reached the reader and was repaired afterwards. This check therefore runs in
// `board-publish.mjs`, BEFORE the bytes leave: a malformed board can then not be
// published at all, whatever produced it and whoever forgot which editing
// technique is safe.
//
// It deliberately checks STRUCTURE only — nothing about content, freshness or
// wording, which the consistency audit already owns. Pure and total: it never
// throws, so a publish can never be blocked by this module misbehaving.

/** The four sections, in the order the user's mandate fixes them. */
export const REQUIRED_SECTIONS = [
  'Woran ich gerade arbeite',
  'Von dir zu klären',
  'Warteschlange',
  'Erledigt',
]

/** Count non-overlapping matches of a global regex. */
const count = (html, re) => (html.match(re) || []).length

/** Strip CSS/JS comments and <style>/<script> bodies — a `<h2>` mentioned in a
 *  comment is prose, not markup, and must not count as an unclosed tag. */
export function markupOnly(html) {
  if (typeof html !== 'string') return ''
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * Structural violations of one board, as [{code, msg}]. Empty = intact.
 * Total: a non-string, or anything unparseable, yields a single violation
 * rather than an exception.
 */
export function structureViolations(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    return [{ code: 'board-unreadable', msg: 'the board is empty or not a string' }]
  }
  const out = []
  const m = markupOnly(html)

  // (1) Tag balance. An unclosed <details> is exactly what re-parents the cards
  // that follow it — the visible symptom every time.
  const pairs = [
    ['details', /<details\b/g, /<\/details>/g],
    ['summary', /<summary\b/g, /<\/summary>/g],
    ['h2', /<h2\b/g, /<\/h2>/g],
  ]
  for (const [tag, openRe, closeRe] of pairs) {
    const o = count(m, openRe)
    const c = count(m, closeRe)
    if (o !== c) out.push({ code: `${tag}-unbalanced`, msg: `<${tag}> opened ${o}x, closed ${c}x` })
  }

  // (2) Exactly the four sections, in order, each wrapped so it collapses.
  const seen = []
  for (const hit of m.matchAll(/<h2\b[^>]*>([^<]*)<\/h2>/g)) seen.push(hit[1].trim())
  if (seen.length !== REQUIRED_SECTIONS.length || seen.some((t, i) => t !== REQUIRED_SECTIONS[i])) {
    out.push({
      code: 'sections-wrong',
      msg: `expected the four sections ${REQUIRED_SECTIONS.join(' | ')} - found ${seen.join(' | ') || '<none>'}`,
    })
  }
  const wrappers = count(m, /<details class="sect">/g)
  if (wrappers !== REQUIRED_SECTIONS.length) {
    out.push({
      code: 'section-wrappers',
      msg: `${wrappers} collapsible section wrapper(s), expected ${REQUIRED_SECTIONS.length}`,
    })
  }

  // (3) An orphan wrapper: a section opener whose heading is not one of the four.
  // This is the exact leftover a cut-and-paste reorder produced.
  for (const hit of m.matchAll(/<details class="sect"><summary><h2\b[^>]*>([^<]*)/g)) {
    if (!REQUIRED_SECTIONS.includes(hit[1].trim())) {
      out.push({
        code: 'orphan-section',
        msg: `a section wrapper opens on "${hit[1].trim().slice(0, 40)}", which is not one of the four`,
      })
    }
  }

  // (4) Every now-card sits inside the current-work section. When one drifts out
  // it stops being read as current work at all — the point vanishes from the
  // board while still looking present in the file.
  const nowStart = m.indexOf(REQUIRED_SECTIONS[0])
  const nextStart = m.indexOf(REQUIRED_SECTIONS[1])
  if (nowStart >= 0 && nextStart > nowStart) {
    const inside = count(m.slice(nowStart, nextStart), /<details class="now">/g)
    const total = count(m, /<details class="now">/g)
    if (inside !== total) {
      out.push({
        code: 'now-card-outside',
        msg: `${total - inside} of ${total} current-work card(s) sit outside the current-work section`,
      })
    }
  }

  // (5) The board carries its own viewport. It used to inherit one: on the
  // retired mirror the fragment WAS the document, and the host set it. The Pages shell
  // sets one too — and then `document.write` replaces the whole document with
  // this fragment and the meta goes with the old one. Chrome falls back to its
  // 980-px desktop viewport and scales the page down by roughly 2.4 on a phone,
  // which is how the board became unreadable on the device it is read on.
  // Carrying it here makes the property survive every transport.
  if (!/<meta\s[^>]*name=["']?viewport["']?[^>]*>/i.test(m)) {
    out.push({
      code: 'viewport-missing',
      msg: 'the board carries no <meta name="viewport"> — on a phone it renders at the 980-px desktop default',
    })
  }

  return out
}
