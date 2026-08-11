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
//
// The one import is the board's OWN names for its two unnumbered state cards
// (point 544): which KIND a current-work card is cannot be judged from markup
// alone, and spelling those titles a second time here is how the writer and the
// gate would drift apart. board-core does not import this module, so the
// direction cannot become a cycle.
import { CLOSING_WORK_TITLE, NO_CURRENT_WORK_TITLE, looksLikeClosingTitle } from './board-core.mjs'

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
    const inside = count(m.slice(nowStart, nextStart), /<details class="now"[^>]*>/g)
    const total = count(m, /<details class="now"[^>]*>/g)
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

  // (6) ONE KIND OF CURRENT-WORK CARD (point 544). The section speaks in one of
  // three voices — numbered point cards, the idle card, or the closing card —
  // and any two of them at once make the board contradict itself in one screen:
  // "470 läuft" over "Gerade keine laufende Arbeit" is exactly what the user
  // read on 30.07.2026. Every sanctioned writer already clears the others, so a
  // mixture can only come from a hand edit — which is also how three idle cards
  // came to stand stacked. Both shapes are caught here, before the bytes leave.
  const kinds = nowCardKinds(m)
  const present = [...new Set(kinds)]
  if (present.length > 1) {
    out.push({
      code: 'now-card-kinds',
      msg: `the current-work section mixes ${present.join(' + ')} cards — it may carry only ONE of the three kinds`,
    })
  }
  for (const kind of ['idle', 'closing']) {
    const n = kinds.filter((k) => k === kind).length
    if (n > 1) {
      out.push({
        code: 'now-state-card-stacked',
        msg: `${n} ${kind} cards stand stacked — that card is a STATE, so exactly one may stand`,
      })
    }
  }

  out.push(...cardNamingViolations(html))

  return out
}

/**
 * THE STAGE WORDS a card title may not consist of (point 655, user 11.08.2026,
 * both languages). A stage says WHERE in the work the session stands, never what
 * the work IS — "Abschlussarbeiten" was the whole title of a card, and the user
 * read it on his phone without learning which point had ended or what it had
 * been about.
 */
export const STAGE_WORDS = [
  'Abschlussarbeiten',
  'Nacharbeit',
  'Nacharbeiten',
  'Vorbereitung',
  'Vorbereitungen',
  'Aufräumen',
  'Aufraeumen',
  'Aufräumarbeiten',
  'closing work',
  'closing duties',
  'closing',
  'rework',
  'preparation',
  'cleanup',
  'clean-up',
  'tidying',
]

/**
 * The words that name no subject: articles, prepositions and the words that
 * only point BACK at the point itself ("zum gerade beendeten Punkt"). They are
 * what separates the card the user complained about from a legitimate title that
 * happens to open on a stage word.
 */
const FILLER_WORDS = new Set([
  'zum', 'zur', 'zu', 'am', 'an', 'im', 'in', 'auf', 'für', 'fur', 'des', 'der', 'die', 'das', 'den', 'dem',
  'ein', 'eine', 'einen', 'einem', 'eines', 'und', 'noch', 'nur', 'gerade', 'eben', 'soeben', 'letzten',
  'letzte', 'aktuellen', 'aktuelle', 'beendeten', 'beendete', 'abgeschlossenen', 'fertigen', 'meines',
  'meiner', 'diesem', 'diesen', 'dieses', 'punkt', 'punkts', 'punktes', 'point', 'points', 'the', 'this',
  'that', 'of', 'for', 'to', 'on', 'at', 'just', 'now', 'current', 'finished', 'closed', 'my', 'work',
  'works', 'duties', 'a', 'an', 'and',
])

/**
 * Does this title say only what STAGE the work is in (point 655)?
 *
 * THE RULE, and why it is not simply "begins with a stage word" (four-eyes
 * review, GPT-5.6 Sol, 12.08.2026): the title is stripped of its number prefix,
 * of every stage word and of the FILLER above — and if NOTHING is left, it named
 * no subject. "Abschlussarbeiten zum gerade beendeten Punkt" leaves nothing and
 * is refused; "Vorbereitung der Karten", "Cleanup parser for Windows" and
 * "<Betreff>: Abschlussarbeiten" all leave a subject and pass. A refusal here
 * costs a retitle, so it must fire only where the card really says nothing.
 */
export function stageOnlyTitle(title) {
  let text = String(title ?? '')
    .replace(/^\s*\d+\s*[—–-]\s*/, '')
    .trim()
  if (!text) return true
  for (const w of STAGE_WORDS) text = text.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ')
  const rest = text
    .toLowerCase()
    .split(/[^a-zäöüß0-9-]+/i)
    .filter((t) => t && !FILLER_WORDS.has(t))
  return rest.length === 0
}

// `looksLikeClosingTitle` is imported from board-core, where the card is
// composed: the gate and the strip that removes a closing card must answer the
// same question the same way, or a card is accepted here and left standing there.
export { looksLikeClosingTitle }

/**
 * Does this handover card name the work that FOLLOWS? The one unnumbered card
 * carries no chip, so the point the successor picks up has to stand in its prose
 * — otherwise the single screen the reader has says nothing at all about what
 * happens next.
 */
export function namesFollowOnWork(bodyText) {
  // KNOWN LIMIT (four-eyes review, 12.08.2026): this asks that A point is named,
  // not that it is the RIGHT one — the gate has no way to know which point just
  // ended. It catches the card that names none at all, which is the reported
  // defect; naming the finished point instead of the next one is a mistake only
  // the author can avoid.
  return /\b(?:punkt|point)\s*(\d{1,6})\b/i.test(String(bodyText ?? ''))
}

/**
 * (7) EVERY CURRENT-WORK CARD NAMES ITS POINT AND ITS SUBJECT (point 655).
 *
 * The queue cards always did — a numbered chip and a German title — and the
 * cards a session writes at a TRANSITION did not: the now-card, the closing
 * card, the handover card. A card titled with a stage alone is, to the reader on
 * his phone, the same as no card. Refused before the bytes leave, naming the
 * card that is wrong; `scripts/board.mjs` lifts an older card into the chip
 * shape on every edit, so the repair is any board command, never a hand edit.
 */
export function cardNamingViolations(html) {
  const out = []
  const doc = markupOnly(typeof html === 'string' ? html : '')
  const bodies = [...doc.matchAll(/<details class="now"[^>]*>([\s\S]*?)<\/details>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  )
  nowCards(doc).forEach((card, i) => {
    const named = card.title ? `"${card.title.slice(0, 60)}"` : '<untitled>'
    // The remedy depends on what the card HAS: a card with no chip is a state
    // card and is replaced by writing one; only a numbered card can be retitled
    // (four-eyes review, 12.08.2026 — `setCardTitle` finds a card by its number).
    const retitle =
      card.chip == null
        ? 'node scripts/board.mjs closing <N> "<Grund>" (closing duties) or node scripts/board.mjs ' +
          'none "<Grund>" (boundary) replaces a card without a number'
        : `node scripts/board.mjs title ${card.chip} "<Betreff>"`
    if (card.kind === 'idle') {
      // The ONE deliberate exception (point 434(7)): the handover card belongs to
      // no point, so it may not carry a chip — but it owes the successor's point
      // in prose. Its SHAPE is checked all the same: the marker alone must not be
      // able to exempt an arbitrary card from every rule above.
      if (card.chip != null || card.title !== NO_CURRENT_WORK_TITLE) {
        out.push({
          code: 'handover-card-shape',
          msg:
            `the card ${named} is marked as the handover card but is not one — that card is ` +
            `unnumbered and titled "${NO_CURRENT_WORK_TITLE}". ${
              card.chip == null
                ? 'ANY board.mjs edit drops a card that names neither a point nor a state, so ' +
                  'the next command repairs this whatever else stands'
                : `Send it away — node scripts/board.mjs queue ${card.chip} — and write the ` +
                  'handover card with node scripts/board.mjs none "<Grund>"'
            }`,
        })
      }
      if (!namesFollowOnWork(bodies[i])) {
        out.push({
          code: 'handover-card-nameless',
          msg:
            `the handover card ${named} names no follow-on work — it is the one card without a ` +
            'number, so its text must say which point the batch picks up next. Rewrite it: ' +
            'node scripts/board.mjs none "<Grund, der den nächsten Punkt nennt>"',
        })
      }
      return
    }
    if (card.chip == null) {
      out.push({
        code: 'now-card-unnumbered',
        msg:
          `the current-work card ${named} carries no numbered chip — every card but the handover ` +
          'card names its point. A card without a number counts as a STATE card, so writing one ' +
          'replaces it: node scripts/board.mjs closing <N> "<Grund>" for the closing duties, ' +
          'node scripts/board.mjs none "<Grund>" at a boundary, node scripts/board.mjs now <N> ' +
          '"<Stand>" for running work',
      })
    }
    if (stageOnlyTitle(card.title)) {
      out.push({
        code: 'now-card-stage-title',
        msg:
          `the current-work card ${named} is titled with a STAGE and no subject — say what the ` +
          `point is about first, e.g. "<Betreff>: Abschlussarbeiten". ${retitle}; the closing card ` +
          'is composed by node scripts/board.mjs closing <N> "<Grund>"',
      })
    }
    // A COMPOSED CLOSING TITLE MUST CARRY THE CLOSING MARKER (four-eyes review,
    // 12.08.2026). Without it the card reads as ordinary point work, so the two
    // state writers refuse to REPLACE it and the state can never be cleared —
    // exactly the trap the marker was introduced to avoid.
    // …AND THE MARKER MUST BE TRUE (four-eyes review, 12.08.2026). The reverse
    // shape is the dangerous one: a marker over an ordinary subject makes the
    // card look like a state, and a state is REPLACED — genuine running work
    // would be deleted by the next `none`. The strip refuses to remove such a
    // card, and it is named here so it does not stand unnoticed either.
    if (card.kind === 'closing' && !looksLikeClosingTitle(card.title) && card.title !== CLOSING_WORK_TITLE) {
      out.push({
        code: 'now-card-false-closing',
        msg:
          `the current-work card ${named} is marked data-state="closing" but is titled as ordinary ` +
          `work — a state card is REPLACED, so this marker would cost real work. ${retitle} to the ` +
          'composed form "<Betreff>: Abschlussarbeiten", or write the card with ' +
          'node scripts/board.mjs closing <N> "<Grund>"',
      })
    }
    if (card.kind !== 'closing' && looksLikeClosingTitle(card.title)) {
      out.push({
        code: 'now-card-unmarked-closing',
        msg:
          `the current-work card ${named} is titled as a closing card but carries no ` +
          `data-state="closing" marker, so no state command would ever replace it. Retitle it — ` +
          `${retitle} — or send it away and write the real one: node scripts/board.mjs queue ` +
          `${card.chip ?? '<N>'}, then node scripts/board.mjs closing <N> "<Grund>"`,
      })
    }
  })
  return out
}

/**
 * The KIND of every current-work card, in document order: 'point' for a
 * numbered card, 'idle' for "Gerade keine laufende Arbeit", 'closing' for the
 * card that names the closing duties still owed (point 544).
 *
 * Scoped to the current-work section, so the same words quoted in the archive
 * are a report and not a card. Total: anything unreadable yields [].
 */
export function nowCardKinds(html) {
  return nowCards(html).map((c) => c.kind)
}

/**
 * Every current-work card as {kind, point, title}, in document order.
 *
 * The KIND comes from the `data-state` marker the writers stamp on since point
 * 655 — the closing card's title is composed per point now, so no literal text
 * can identify it — and falls back to the two legacy titles for a card written
 * before that. `point` is the numbered chip, null on the unnumbered handover
 * card. Total: anything unreadable yields [].
 */
export function nowCards(html) {
  const m = markupOnly(typeof html === 'string' ? html : '')
  const from = m.indexOf(REQUIRED_SECTIONS[0])
  if (from < 0) return []
  const to = m.indexOf(REQUIRED_SECTIONS[1], from + 1)
  const section = m.slice(from, to > from ? to : undefined)
  const cards = []
  for (const hit of section.matchAll(/<details class="now"([^>]*)>\s*<summary>([\s\S]*?)<\/summary>/g)) {
    const marked = (hit[1].match(/data-state="([^"]*)"/) ?? [])[1] ?? null
    const title = ((hit[2].match(/<span class="t">([^<]*)<\/span>/) ?? [])[1] ?? '').trim()
    const num = (hit[2].match(/<span class="num">\s*(\d+)\s*<\/span>/) ?? [])[1] ?? null
    const legacy = title === NO_CURRENT_WORK_TITLE ? 'idle' : title === CLOSING_WORK_TITLE ? 'closing' : 'point'
    cards.push({
      kind: marked === 'idle' || marked === 'closing' ? marked : legacy,
      // `chip` is the number as the READER sees it; `point` also accepts the
      // leading number of a card written before the chip, which every parser
      // outside the gate still has to understand. The gate itself asks for the
      // chip (four-eyes review, 12.08.2026) — the publish upgrades an older card
      // first, so a strict demand traps no board.
      chip: num,
      point: num ?? (title.match(/^(\d+)\s*[—–-]/) ?? [])[1] ?? null,
      title,
    })
  }
  return cards
}
