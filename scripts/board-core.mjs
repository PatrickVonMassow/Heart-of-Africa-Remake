// Pure half of the board command (point 372): the card edit, so the markup the
// board guard accepts is pinned by tests rather than by the shape of one
// regex written once. The wrapper does the I/O.
//
// The one import is the auditor's OWN name for "no estimate yet": a card this
// module writes must satisfy the audit that reads it, and spelling that value a
// second time here is how the two would drift apart. dashboard-guard-core
// imports nothing, so the direction cannot become a cycle.
import { QUEUE_STUB_META, parseNowCardPoints } from './dashboard-guard-core.mjs'

/** The flag that takes a card's text from STDIN instead of the argv (point 410). */
export const TEXT_STDIN_FLAG = '--text-stdin'

/**
 * LF, ALWAYS — applied on every write of the board (point 439).
 *
 * The board's markup anchors are matched with literal newlines
 * (`ERLEDIGT_ANCHOR` below, the section bounds here), so the line ending is not
 * cosmetic. On 30.07.2026 a now-card had to be retitled by hand because no
 * command could do it; the editor wrote the file back in Windows text mode,
 * every `\n` became `\r\n`, the following node writes left the file MIXED — and
 * `board-archive-rotate.mjs` then failed to find the Erledigt section at all, so
 * `attest` crashed with a stack trace on a board that looked perfect in the
 * browser. Normalising on the WAY OUT costs nothing and means no writer has to
 * be trusted with it.
 */
export function normaliseLineEndings(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n')
}

/** The literal markup the archive rotation locates the Erledigt section by. */
export const ERLEDIGT_ANCHOR = '<details class="sect">\n<summary><h2>Erledigt</h2></summary>'

/**
 * Where the Erledigt section starts in a board, line endings normalised first.
 * Returns -1 when the anchor is absent; the caller decides how loudly to fail.
 */
export function erledigtSectionStart(html) {
  return normaliseLineEndings(html).indexOf(ERLEDIGT_ANCHOR)
}

/**
 * A card text as the paragraphs it renders to: a BLANK LINE is a paragraph
 * boundary, a single newline is just a wrapped line (point 439).
 *
 * WHY: `board.mjs status` wrapped whatever it was given into ONE <p>, and
 * `dashboard-conciseness-guard` blocks the turn end on "one long unbroken
 * paragraph — split into paragraphs". Blank lines in the piped text were carried
 * through verbatim, so they rendered as one run-on block and the guard was right
 * to refuse it. The only way out was hand-editing the board HTML — the very act
 * that produced the CRLF damage above. So the sanctioned command can now produce
 * what the guard demands.
 */
export function cardParagraphs(text) {
  return normaliseLineEndings(text)
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

/**
 * A card body as indented `<p>` lines — one per paragraph, the stamp (when
 * given) leading the FIRST one. `escape` is opt-in because only `addVdzk`
 * escapes today, and silently escaping the others would change markup the
 * board guard's parsers already read.
 */
export function renderCardBody(text, { stamp = null, indent = '    ', escape = null } = {}) {
  const paras = cardParagraphs(text).map((p) => (escape ? escape(p) : p))
  if (!paras.length) return ''
  const lead = stamp ? `<span class="stamp">Stand ${stamp}</span> ` : ''
  return paras.map((p, i) => `${indent}<p>${i === 0 ? lead : ''}${p}</p>`).join('\n')
}

/**
 * A card's text — from the argv words, or, when `--text-stdin` stands among
 * them, from what the wrapper read on stdin as UTF-8.
 *
 * WHY THE SECOND PATH EXISTS: German prose handed to this script as a
 * command-line ARGUMENT arrives mangled on Windows, so every session had taken
 * to transliterating its umlauts by hand ("faellt weg", "kuenftig") — and the
 * board is German prose the user reads on a phone, where that reads as broken.
 * The transliteration was the workaround, not the defect; the defect is the
 * shell in the path. On stdin the shell never sees the text.
 *
 * The argument form keeps working (ASCII is safe and it is the shorter call),
 * but the two may not be mixed: a caller that passes both meant one of them,
 * and silently picking would drop the other.
 */
export function resolveCardText(words, stdinText) {
  const list = (Array.isArray(words) ? words : []).map((w) => String(w))
  // A BARE `--` ENDS THE FLAGS (point 439): everything after it is text, however
  // it starts. Without that escape the refusal below would make a card whose
  // first word is a dash unwritable.
  const sep = list.indexOf('--')
  const flagged = sep < 0 ? list : list.slice(0, sep)
  const literal = sep < 0 ? [] : list.slice(sep + 1)
  // A FLAG IS NEVER PROSE (point 439). `board-queue.mjs set` had no
  // `--text-stdin`, so a session that piped German prose into it stored the
  // literal string `--text-stdin` as the card body — six cards, three of them
  // live, showed the user a command-line flag where their explanation belonged.
  // A value that begins with `--` is therefore refused, and the refusal NAMES
  // the flag that was meant.
  const stray = flagged.find((w) => w !== TEXT_STDIN_FLAG && w.startsWith('--'))
  if (stray) {
    throw new Error(
      `board: refusing to write the flag "${stray}" into a card as prose — this command knows ` +
        `${TEXT_STDIN_FLAG} (pipe the text in). Text that really starts with a dash goes after a bare "--".`,
    )
  }
  const argvWords = [...flagged.filter((w) => w !== TEXT_STDIN_FLAG), ...literal]
  if (!flagged.includes(TEXT_STDIN_FLAG)) return argvWords.join(' ')
  if (argvWords.length) {
    throw new Error(`board: ${TEXT_STDIN_FLAG} takes the WHOLE text — drop the argument text ("${argvWords.join(' ')}")`)
  }
  // Normalise the line ending a Windows pipe adds and the trailing newline every
  // heredoc carries; the text itself — BLANK LINES INCLUDED, they are what
  // `cardParagraphs` turns into <p> boundaries — is passed through untouched.
  const text = normaliseLineEndings(typeof stdinText === 'string' ? stdinText : '').trim()
  if (!text) throw new Error(`board: ${TEXT_STDIN_FLAG} was given but nothing arrived on stdin`)
  return text
}

/** Berlin wall clock — the stamp every status carries (point 371). */
export function berlinStamp(now = new Date()) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)
}

/** Berlin date and wall clock — "27.07.2026, 16:32", the footer's own notation. */
export function berlinDateStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const at = (type) => parts.find((p) => p.type === type)?.value
  return `${at('day')}.${at('month')}.${at('year')}, ${at('hour')}:${at('minute')}`
}

/** What the footer says when the board carries no statement of its own. */
const FOOTER_TAIL = 'lädt sich alle 30 s selbst neu.'

/**
 * Rewrite the footer's date and open-point count, keeping every other segment
 * the board states for itself (the tag line). The count is not a statement but
 * a fact the repository holds, and leaving it to the hand made every tick
 * produce a stale board that the audit then refused — the figure is derived
 * here instead, from the same parse the audit compares against.
 */
export function refreshFooter(html, { openCount, now = new Date() } = {}) {
  const m = String(html ?? '').match(/<footer>([\s\S]*?)<\/footer>/)
  if (!m) throw new Error('board: no footer to refresh')
  if (!Number.isInteger(openCount) || openCount < 0) {
    throw new Error(`board: not an open-point count: ${openCount}`)
  }
  const kept = m[1]
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s && !/^Stand:/.test(s) && !/^\d+\s+offene[rn]?\s+Punkte?$/.test(s))
  const count = openCount === 1 ? '1 offener Punkt' : `${openCount} offene Punkte`
  const segments = [`Stand: ${berlinDateStamp(now)} (Europe/Berlin)`, count, ...(kept.length ? kept : [FOOTER_TAIL])]
  return html.replace(m[0], () => `<footer>${segments.join(' · ')}</footer>`)
}

/**
 * THE NUMBERED CHIP (point 655, user 11.08.2026). Every card in "Woran ich
 * gerade arbeite" carries its point number in the SAME chip the queue cards
 * use, and its title names the SUBJECT rather than the stage of the work. The
 * board is read on a phone at a glance by someone who does not carry the work
 * order in his head, and a card titled "Abschlussarbeiten zum gerade beendeten
 * Punkt" told him neither which point nor what it was about.
 *
 * The one deliberate exception is the handover card (`NO_CURRENT_WORK_TITLE`):
 * it belongs to NO point, so it keeps its unnumbered form and names the
 * successor's point in prose instead.
 */
const numberChip = (point) => `<span class="num">${point}</span>`

/**
 * A card TITLE as markup-safe text (four-eyes review, 12.08.2026). Every reader
 * of a title — the gate, the finders, the retitle itself — matches `[^<]*`, so a
 * raw `<` in a title made the card unreadable to all of them AND unrepairable by
 * the very command that had written it. Entity-aware, so a title carried from
 * one card to another does not gain a second `&amp;` on each move.
 */
export function escapeCardTitle(text) {
  return String(text ?? '')
    .replace(/&(?!(?:[a-z]+|#\d+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * THE DASH between a legacy title's number and its subject — em, en or plain.
 * ONE definition for every matcher (four-eyes review, 12.08.2026): the strip,
 * the upgrade, the finder and the retitle each carried their own list, and a
 * card written with the plain hyphen fell between them — refused by the gate,
 * upgraded by nothing, found by nothing, and removable by nothing.
 */
const DASH = '[—–-]'

/** Whatever stands inside a title span — bounded by its closing tag, not by `<`. */
const TITLE_TEXT = '((?:(?!</span>)[\\s\\S])*)'

/**
 * Lift every current-work card written BEFORE point 655 into the shape this
 * module now writes: the number out of the title and into the chip, the two
 * state cards marked with their kind.
 *
 * WHY A MIGRATION AND NOT A ONE-OFF FIX. The board is a single living file that
 * is never checked out fresh, so on the day this lands its cards are all in the
 * old shape — and the publish gate refuses a now-card without a chip. The only
 * repair left would be hand-editing the board HTML, which is what wrecked the
 * line endings on 30.07.2026 and stacked three idle cards on the user's phone.
 * Every `board.mjs` edit runs this on the way out instead, so the board heals
 * itself on the next command whatever that command was.
 */
export function upgradeNowCards(html) {
  let out = String(html ?? '')
  for (const [kind, title] of Object.entries(LEGACY_STATE_TITLE)) {
    out = out.replace(
      new RegExp(`<details class="now"([^>]*)>(${WITHIN_CARD}<span class="t">${title}</span>)`, 'g'),
      (_m, attrs, head) => `<details class="now"${attrs.replace(/\s*data-state="[^"]*"/, '')}${STATE_ATTR(kind)}>${head}`,
    )
  }
  return out.replace(
    new RegExp(
      `<details class="now"([^>]*)>(\\s*<summary>)<span class="t">(\\d+)\\s*${DASH}\\s*${TITLE_TEXT}</span>`,
      'g',
    ),
    (_m, attrs, head, point, title) =>
      `<details class="now"${attrs}>${head}${numberChip(point)}<span class="t">${title.trim()}</span>`,
  )
}

/**
 * The document without the current-work cards that name NEITHER a point NOR a
 * state — the shape no command could otherwise remove (four-eyes review,
 * 12.08.2026). Returns the cleaned document and, for each card removed, its
 * title AND its text: this is the ONE place the board loses content, so what it
 * loses is handed back for the caller to print. Nothing else deletes a card —
 * the state writers replace only what really is that state.
 *
 * Such a card is refused by the publish gate anyway, and every way of repairing
 * it needs a number it does not have — while a numbered card standing beside it
 * blocks the state writers. So the sanctioned edits drop it, and the board that
 * could not be published becomes publishable by the next command, whichever it
 * was.
 */
/** A card as the plain text it showed — what a removal hands back to be printed. */
const cardText = (card) => String(card).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export function dropStrayNowCards(html) {
  const dropped = []
  const doc = String(html ?? '')
  // WHERE the card stands decides whether being a state card saves it: the state
  // writers replace only inside the current-work section, so an unnumbered state
  // card that has drifted OUT of it is reachable by nothing else and would stand
  // for ever (four-eyes review, 12.08.2026). Here it is removed and reported,
  // which is the whole point of this being the one removal path.
  let inSection = () => true
  try {
    const { from, end } = sectionBounds(doc, 'now')
    inSection = (at) => at >= from && at < end
  } catch {
    /* no section — judge the fragment as it stands */
  }
  const out = doc.replace(/<details class="now"[^>]*>[\s\S]*?<\/details>\s*/g, (card, at) => {
    const summary = (card.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
    const title = (summary.match(new RegExp(`<span class="t">${TITLE_TEXT}</span>`)) ?? [])[1] ?? ''
    // A NUMBER, or the handover card's own title — nothing else is repairable:
    // a numbered card is reached by `title`/`queue`/`done`, and the handover
    // card by `none`. A marker alone does not save a card here either, or an
    // impostor wearing one would be exactly as unremovable as before.
    // OUTSIDE THE SECTION NOTHING IS REACHABLE (four-eyes review, 12.08.2026):
    // every writer and every state removal works inside the current-work section,
    // so a card that has drifted out — numbered or not — can be repaired by
    // nothing. It is swept HERE, where the removal is reported, and the
    // `now-card-outside` violation goes with it.
    if (!inSection(at)) {
      dropped.push({ title: title.trim() || '<untitled>', text: cardText(card) })
      return ''
    }
    const { chip, legacy } = summaryPoint(summary)
    if (chip || legacy) return card
    if (isStateCardTitle(title)) return card
    // A genuine state card that lost its chip is still replaceable by its own
    // command (`none`, `closing <N>`), so it is kept rather than swept.
    if (/data-state="closing"/.test(card) && looksLikeClosingTitle(title)) return card
    dropped.push({ title: title.trim() || '<untitled>', text: cardText(card) })
    return ''
  })
  return { html: out, dropped }
}

/**
 * The point a SUMMARY names, and where it names it: `{ chip, legacy }`.
 *
 * HEAD-ANCHORED, because that is what the point commands can find (four-eyes
 * review, 12.08.2026). A chip buried behind another span passed the publish gate
 * while `title`, `status`, `queue` and `done` all missed it — a card accepted as
 * numbered that no numbered command could reach. One definition, so the gate and
 * the finders cannot disagree about what "numbered" means.
 */
export function summaryPoint(summary) {
  const text = String(summary ?? '')
  const chip = text.match(/^\s*<span class="num">\s*(\d+)\s*<\/span>\s*<span class="t">/)
  if (chip) return { chip: chip[1], legacy: null }
  const legacy = text.match(new RegExp(`^\\s*<span class="t">\\s*(\\d+)\\s*${DASH}`))
  return { chip: null, legacy: legacy ? legacy[1] : null }
}

/** A title without the leading "651 — " a card written before the chip carried. */
export function stripPointPrefix(title, point) {
  return String(title ?? '')
    .replace(new RegExp(`^\\s*${point}\\s*${DASH}\\s*`), '')
    .trim()
}

/** The queue card for `point`, or null. Exported so the caller can check first. */
export function queueCard(html, point) {
  const re = new RegExp(`<details>\\s*<summary><span class="num">${point}</span>[\\s\\S]*?</details>\\s*`)
  const m = String(html ?? '').match(re)
  return m ? m[0] : null
}

/**
 * Move a point's card out of the queue and into the current-work section as a
 * `now` card with the given title, times and stamped status.
 *
 * This exists because hand-rolling the regex per move kept failing on shell
 * escaping — three times in one day — and a board edit that silently matches
 * nothing is exactly the class of failure the guards were built for.
 */
export function promoteToNow(html, point, { title, times, status, stamp = berlinStamp() }) {
  const card = queueCard(html, point)
  if (!card) throw new Error(`board: no queue card for point ${point}`)
  if (!title || !status) throw new Error('board: promote needs a title and a status')
  // THE QUEUE TITLE IS THE NOW-CARD'S TITLE, so the rule that governs one governs
  // the other (four-eyes review, 12.08.2026): promoting a card titled
  // "Vorbereitung" would write exactly the card the publish gate refuses.
  const subject = stripPointPrefix(title, point)
  if (stageOnlyTitle(subject) || looksLikeClosingTitle(subject)) {
    throw new Error(
      `board: the queue card for point ${point} is titled "${title}", which names a STAGE rather ` +
        'than a subject — the promoted card would say nothing about the point, or claim to be the ' +
        `closing card. Give it a subject first: node scripts/board-queue.mjs set ${point} --title "<Betreff>"`,
    )
  }
  const now =
    `<details class="now">\n  <summary>${numberChip(point)}<span class="t">${escapeCardTitle(stripPointPrefix(title, point))}</span>` +
    `<span class="right"><span class="meta">${times ?? stamp}</span></span></summary>\n` +
    `  <div class="body">\n${renderCardBody(status, { stamp })}\n  </div>\n</details>\n`
  // Both state cards go with it (points 470/544): the moment a point is current
  // work, "nothing is running" is false and "only closing duties are left" is
  // false, and leaving one standing is how the board came to say two things at
  // once.
  return insertAsFirstNowCard(stripStateCards(html.replace(card, '')), now)
}

/**
 * Put a rendered card at the TOP of the current-work section — not the bottom:
 * the focus guard reads the FIRST now-card, so the point just taken up must
 * lead, or declaring focus on it immediately contradicts the board.
 */
function insertAsFirstNowCard(html, card) {
  const head = '<summary><h2>Woran ich gerade arbeite</h2></summary>'
  const at = html.indexOf(head)
  if (at < 0) throw new Error('board: current-work section not found')
  const from = at + head.length
  return `${html.slice(0, from)}\n${card}${html.slice(from).replace(/^\n/, '')}`
}

/** The four section headings, in the order the board fixes them. */
const HEAD = {
  now: '<summary><h2>Woran ich gerade arbeite</h2></summary>',
  vdzk: '<summary><h2>Von dir zu klären</h2></summary>',
  queue: '<summary><h2>Warteschlange</h2></summary>',
  done: '<summary><h2>Erledigt</h2></summary>',
}

/** Where a section's content begins and ends. Throws rather than guessing. */
function sectionBounds(html, key) {
  const head = HEAD[key]
  const at = String(html ?? '').indexOf(head)
  if (at < 0) throw new Error(`board: section not found: ${key}`)
  const from = at + head.length
  const nextSect = html.indexOf('<details class="sect">', from)
  const end = nextSect < 0 ? html.length : html.lastIndexOf('\n</details>', nextSect)
  return { from, end: end < from ? html.length : end }
}

/**
 * A current-work card's summary head for `point`, in BOTH shapes: the numbered
 * chip it carries since point 655, and the leading title number of a card
 * written before that. One source for every matcher, so the writer and the
 * finders cannot drift apart — the drift that made `CLOSING_WORK_TITLE`
 * unreplaceable in the first place.
 */
const NOW_HEAD = (point) =>
  `<details class="now"[^>]*>\\s*<summary>\\s*(?:<span class="num">\\s*${point}\\s*</span>|<span class="t">\\s*${point}\\s*${DASH})`

/** The current-work card for `point`, or null. Searched in its own section. */
export function nowCard(html, point) {
  const re = new RegExp(`${NOW_HEAD(point)}[\\s\\S]*?</details>\\s*`)
  const m = nowSectionSlice(html).text.match(re)
  return m ? m[0] : null
}

/**
 * The current-work SECTION as `{ from, end, text }` — the whole document when
 * the section cannot be found, which is what a fragment gives a caller.
 */
function nowSectionSlice(html) {
  const text = String(html ?? '')
  try {
    const { from, end } = sectionBounds(text, 'now')
    return { from, end, text: text.slice(from, end) }
  } catch {
    return { from: 0, end: text.length, text }
  }
}

/** Every complete current-work card in section order, with its exact bytes. */
function projectedNowCards(html) {
  const section = nowSectionSlice(html).text
  return [...section.matchAll(/<details class="now"[^>]*>[\s\S]*?<\/details>\s*/g)].map((match) => {
    const summary = (match[0].match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
    const { chip, legacy } = summaryPoint(summary)
    const rawPoint = chip ?? legacy
    return { point: rawPoint == null ? null : Number(rawPoint), html: match[0], at: match.index }
  })
}

const pointsInSection = (html, key) => {
  try {
    const { from, end } = sectionBounds(html, key)
    const section = String(html).slice(from, end)
    return [...section.matchAll(/class="(?:num|t)">\s*(\d+)/g)].map((m) => Number(m[1]))
  } catch {
    return []
  }
}

/** The parser-distinct honest zero state — deliberately not a `.now` card. */
export const NOW_EMPTY_STATE_TEXT = 'Gerade ist kein Punkt nachweisbar in Arbeit.'
export const NOW_EMPTY_STATE_MARKUP =
  `<p class="now-empty" data-state="idle">${NOW_EMPTY_STATE_TEXT}</p>`

const emptyStatePattern = () => /<p class="now-empty" data-state="idle">[\s\S]*?<\/p>\s*/g

/**
 * Compare the rendered numbered membership with the normalized active record.
 * This is shared by the fail-open Stop hook and fail-closed publish preflight.
 */
export function compareNowProjection(html, expectedPoints, { knownPoints = null } = {}) {
  try {
    const expected = Array.isArray(expectedPoints) ? expectedPoints.map(Number) : []
    if (expected.some((n) => !Number.isInteger(n) || n <= 0) || new Set(expected).size !== expected.length) {
      return { ok: false, error: 'the expected active-point set is malformed', missing: [], extra: [], duplicates: [] }
    }
    const cards = projectedNowCards(html)
    const actual = cards.filter((card) => card.point != null).map((card) => card.point)
    const counts = new Map()
    for (const point of actual) counts.set(point, (counts.get(point) ?? 0) + 1)
    const expectedSet = new Set(expected)
    const actualSet = new Set(actual)
    const missing = expected.filter((point) => !actualSet.has(point))
    const extra = [...actualSet].filter((point) => !expectedSet.has(point)).sort((a, b) => a - b)
    const duplicates = [...counts].filter(([, count]) => count > 1).map(([point]) => point).sort((a, b) => a - b)
    const known = knownPoints instanceof Set ? knownPoints : null
    const unknown = known ? [...actualSet].filter((point) => !known.has(point)).sort((a, b) => a - b) : []
    const elsewhere = new Map()
    for (const [key, label] of [['vdzk', 'Von dir zu klären'], ['queue', 'Warteschlange'], ['done', 'Erledigt']]) {
      for (const point of pointsInSection(html, key)) {
        if (!expectedSet.has(point)) continue
        if (!elsewhere.has(point)) elsewhere.set(point, [])
        if (!elsewhere.get(point).includes(label)) elsewhere.get(point).push(label)
      }
    }
    const crossSection = [...elsewhere].map(([point, sections]) => ({ point, sections }))
    const emptyStateCount = (nowSectionSlice(html).text.match(emptyStatePattern()) ?? []).length
    const unnumbered = cards.filter((card) => card.point == null)
    const unnumberedCards = unnumbered.length
    const idleCards = unnumbered.filter((card) => isTrulyStateCard(card.html, 'idle')).length
    // Verified zero has TWO honest forms (second cross-vendor review): the one
    // authored idle card carrying the written handover reason, or — when nobody
    // wrote one — exactly the one parser-distinct empty element. Never both,
    // never a stack, and never a non-idle card standing in for either.
    const emptyStateWrong = expected.length === 0
      ? (idleCards === 1
          ? emptyStateCount !== 0 || unnumberedCards !== 1
          : emptyStateCount !== 1 || unnumberedCards > 0)
      : emptyStateCount > 0
    return {
      ok: !missing.length && !extra.length && !duplicates.length && !unknown.length && !crossSection.length && !emptyStateWrong,
      missing,
      extra,
      duplicates,
      unknown,
      crossSection,
      emptyStateCount,
      unnumberedCards,
      idleCards,
    }
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error), missing: [], extra: [], duplicates: [] }
  }
}

/** A visible placeholder; its copy is explicitly not mistaken for authored prose. */
export function renderNowStub(point, { stamp = berlinStamp() } = {}) {
  return (
    `<details class="now" data-state="stub">\n  <summary>${numberChip(point)}` +
    `<span class="t">Text für diesen Punkt fehlt noch</span>` +
    `<span class="right"><span class="meta">${stamp}</span></span></summary>\n` +
    `  <div class="body">\n${renderCardBody('Diese Karte braucht noch ihren handgeschriebenen Text.', { stamp })}\n` +
    '  </div>\n</details>\n'
  )
}

/** Remove queue copies for points whose membership is now derived as active. */
function stripProjectedQueueCards(html, points) {
  const wanted = new Set(points)
  if (!wanted.size) return String(html ?? '')
  try {
    const source = String(html ?? '')
    const { from, end } = sectionBounds(source, 'queue')
    const section = source.slice(from, end).replace(/<details>\s*<summary>[\s\S]*?<\/details>\s*/g, (card) => {
      const point = Number((card.match(/class="num">\s*(\d+)/) ?? [])[1])
      return wanted.has(point) ? '' : card
    })
    return source.slice(0, from) + section + source.slice(end)
  } catch {
    return String(html ?? '')
  }
}

/**
 * Project the numbered now-card set while retaining every surviving card byte
 * for byte. `transformExisting` exists only to make the loss-prevention
 * invariant directly testable; production uses the identity transform.
 */
export function reconcileNowProjection(
  html,
  expectedPoints,
  { focusPoint = null, stamp = berlinStamp(), transformExisting = (card) => card } = {},
) {
  const source = String(html ?? '')
  const expected = Array.isArray(expectedPoints) ? expectedPoints.map(Number) : []
  if (expected.some((n) => !Number.isInteger(n) || n <= 0) || new Set(expected).size !== expected.length) {
    throw new Error('board: active-point projection is malformed')
  }
  const cards = projectedNowCards(source)
  const numbered = cards.filter((card) => card.point != null)
  const counts = new Map()
  for (const card of numbered) counts.set(card.point, (counts.get(card.point) ?? 0) + 1)
  const conflicts = [...counts].filter(([, count]) => count > 1).map(([point]) => point)
  if (conflicts.length) throw new Error(`board: conflicting current-work copies for point(s) ${conflicts.join(', ')}`)
  const unnumbered = cards.filter((card) => card.point == null)
  if (expected.length === 0 && unnumbered.some((card) => !isTrulyStateCard(card.html, 'idle'))) {
    throw new Error('board: refusing to replace an authored unnumbered non-idle card with the empty-state element')
  }

  const byPoint = new Map(numbered.map((card) => [card.point, card.html]))
  const kept = []
  for (const point of expected) {
    const original = byPoint.get(point)
    if (!original) continue
    const transformed = String(transformExisting(original, point) ?? '')
    if (transformed !== original) {
      throw new Error(`board: reconciliation would rewrite or blank authored prose for point ${point}`)
    }
    kept.push({ point, html: original })
  }

  // Focus is the only permitted reorder of surviving cards; every other
  // survivor keeps its previous relative order, independent of insertion time.
  const previous = numbered.map((card) => card.point).filter((point) => new Set(expected).has(point))
  const survivorOrder = Number.isInteger(Number(focusPoint)) && previous.includes(Number(focusPoint))
    ? [Number(focusPoint), ...previous.filter((point) => point !== Number(focusPoint))]
    : previous
  const survivorMap = new Map(kept.map((card) => [card.point, card.html]))
  const newPoints = expected.filter((point) => !survivorMap.has(point))
  const ordered = [
    ...survivorOrder.map((point) => ({ point, html: survivorMap.get(point) })),
    ...newPoints.map((point) => ({ point, html: renderNowStub(point, { stamp }) })),
  ]

  const now = nowSectionSlice(source)
  let remainder = now.text
    .replace(/<details class="now"[^>]*>[\s\S]*?<\/details>\s*/g, (card) => {
      const summary = (card.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
      const { chip, legacy } = summaryPoint(summary)
      return chip != null || legacy != null ? '' : card
    })
    .replace(emptyStatePattern(), '')
    .trim()
  // Verified zero NEVER blanks what a session wrote (second cross-vendor
  // review): the idle card `done --none` puts up carries the handover reason
  // the reader opens the board for, so it survives the render byte for byte.
  // The generic empty element is only the fallback when nobody wrote anything.
  if (expected.length === 0) remainder = remainder || NOW_EMPTY_STATE_MARKUP
  else remainder = `${ordered.map((card) => card.html).join('')}${remainder ? `\n${remainder}` : ''}`.trimEnd()
  const projected = source.slice(0, now.from) + `\n${remainder}\n` + source.slice(now.end).replace(/^\n/, '')
  return stripProjectedQueueCards(projected, expected)
}

/** Fail-closed publish preflight: source, render and exact check are one pure step. */
export function projectNowForPublish(html, activeWork, { knownPoints = null, stamp = berlinStamp() } = {}) {
  if (!activeWork || activeWork.ok !== true || !Array.isArray(activeWork.points)) {
    const why = activeWork?.errors?.join('; ') || 'the active-work source is unreadable'
    throw new Error(`active-work source unresolved: ${why}`)
  }
  const projected = reconcileNowProjection(html, activeWork.points, {
    focusPoint: activeWork.focusPoint,
    stamp,
  })
  const comparison = compareNowProjection(projected, activeWork.points, { knownPoints })
  if (!comparison.ok) {
    const facts = [
      comparison.missing?.length ? `missing ${comparison.missing.join(', ')}` : '',
      comparison.extra?.length ? `extra ${comparison.extra.join(', ')}` : '',
      comparison.duplicates?.length ? `duplicate ${comparison.duplicates.join(', ')}` : '',
      comparison.unknown?.length ? `unknown ${comparison.unknown.join(', ')}` : '',
      comparison.crossSection?.length
        ? `cross-section ${comparison.crossSection.map((item) => item.point).join(', ')}`
        : '',
    ].filter(Boolean)
    throw new Error(`now-section exact-set preflight failed: ${facts.join('; ') || comparison.error || 'state mismatch'}`)
  }
  return { html: projected, comparison }
}

/** "~2,5 h · Feature" → 2.5; anything without an hour figure → null. */
export function estimateHours(meta) {
  const m = String(meta ?? '').match(/~\s*(\d+(?:[.,]\d+)?)\s*h/)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** 2.5 → "~2,5 h" — the queue header's own notation (German decimal comma). */
export function hoursLabel(hours) {
  const rounded = Math.max(0.5, Math.round(hours * 2) / 2)
  return `~${String(rounded).replace(/\.0$/, '').replace('.', ',')} h`
}

/** "16:20" + 2.5 → "18:50", wrapping past midnight. */
export function addHours(stamp, hours) {
  const m = String(stamp ?? '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) throw new Error(`board: not a HH:MM stamp: ${stamp}`)
  const total = (Number(m[1]) * 60 + Number(m[2]) + Math.round(hours * 60) + 1440 * 2) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The difference between the two stamps of a now-card header, in hours. */
function spanHours(times) {
  const m = String(times ?? '').match(/(\d{1,2}):(\d{2})\s*·\s*~?\s*(\d{1,2}):(\d{2})/)
  if (!m) return null
  const from = Number(m[1]) * 60 + Number(m[2])
  const to = Number(m[3]) * 60 + Number(m[4])
  return ((to - from + 1440) % 1440) / 60
}

const titleOf = (card) => (card.match(new RegExp(`<span class="t">${TITLE_TEXT}</span>`)) ?? [])[1] ?? ''
const metaOf = (card) => (card.match(/<span class="meta">([^<]*)<\/span>/) ?? [])[1] ?? ''
/** The card's last status text, stamp span stripped — what a move carries over. */
const statusOf = (card) => {
  // EVERY paragraph, not only the last (point 439): once a card text may carry
  // blank-line paragraph breaks, taking the tail alone would silently drop the
  // body of a multi-paragraph status on the way to the queue or the archive.
  // Re-joined with a blank line, so the move round-trips through the same rule.
  const paras = [...card.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => p[1])
  return paras
    .map((p) => p.replace(/<span class="stamp">[^<]*<\/span>\s*/, '').trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Promote a QUEUED point into current work, deriving its title and its
 * projected end from the queue card itself. That derivation is the point: the
 * caller types a point number and a status, and the header the guard reads
 * cannot drift from the queue entry it came from.
 */
export function toNow(html, point, status, { stamp = berlinStamp() } = {}) {
  const card = queueCard(html, point)
  if (!card) throw new Error(`board: no queue card for point ${point}`)
  const hours = estimateHours(metaOf(card))
  return promoteToNow(html, point, {
    title: titleOf(card),
    times: hours == null ? stamp : `${stamp} · ~${addHours(stamp, hours)}`,
    status,
    stamp,
  })
}

/**
 * Send a current-work card back to the queue — the move that had to be done by
 * hand today, and that the board guard blocks the turn on when it is forgotten
 * (a point listed in both sections at once). The estimate is recovered from the
 * card's own start/end span unless the caller states a new one.
 *
 * A card that carries NO recoverable span falls back to the NAMED stub meta
 * rather than to no meta at all: the audit accepts "no estimate yet" only when
 * it is said in so many words, so an omitted meta is a `queue-meta` violation.
 * That is reachable in one step — a point promoted straight from a stub queue
 * card has a start time and no end, so `spanHours` is null on the way back —
 * and it turned the whole unit layer red over a board move that looked routine.
 */
export function toQueue(html, point, { text, estimate } = {}) {
  const card = nowCard(html, point)
  const renderEntry = (title, meta, body) =>
    `<details>\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
    `<span class="right"><span class="meta">${meta}</span></span>` +
    `</summary>\n  <div class="body">\n${renderCardBody(body)}\n  </div>\n</details>\n`
  // IDEMPOTENT AGAINST BOARD DRIFT (point 700, measured 17.08.2026): a board
  // that already lists the point in the Warteschlange — however it came to —
  // must not receive a SECOND card for it, because the resulting
  // `dup-in-section` turns the unit layer red and the pre-push gate then
  // refuses exactly the handover bookkeeping this move exists for. The
  // standing queue entry keeps the place; only the now-card goes. Scoped to
  // the queue SECTION, because an Erledigt card shares the bare markup shape.
  let standing = null
  try {
    const { from, end } = sectionBounds(html, 'queue')
    standing = queueCard(html.slice(from, end), point)
  } catch {
    /* no queue section — the insertion below reports it */
  }
  // A caller's UPDATE is honoured on the standing card, never swallowed
  // (Sol review of d0aebb6, finding 5): text replaces its body, estimate its
  // meta, and what was not given keeps the standing card's own value. The
  // bare handover call (`queue <n>`) leaves it untouched.
  const updateStanding = (doc) => {
    if (!text?.trim() && estimate == null) return doc
    const body = text?.trim() || statusOf(standing)
    if (!body) throw new Error('board: refusing to queue a card with an empty body')
    const meta = estimate ?? (metaOf(standing).trim() || QUEUE_STUB_META)
    return doc.replace(standing, renderEntry(stripPointPrefix(titleOf(standing), point), meta, body))
  }
  if (!card) {
    // A REPEATED move is a SUCCESS, not a typo (point 700; Sol review of
    // 534c2ba, finding 5). Of the spec's two options — legitimise the
    // handover state or demand a numbered now-card even then — this takes
    // the first: with the point already standing in the queue and no
    // now-card left, the desired end state HOLDS, and the spec says the last
    // bookkeeping of a session must not be blocked by the session ending —
    // which a throw here did, at the most expensive moment there is. The
    // no-op still honours a caller's text/estimate, exactly as the drift
    // path does. The throw is kept ONLY for a point nowhere on the board at
    // all — the typo it was always protecting against.
    if (standing) return updateStanding(html)
    throw new Error(`board: point ${point} is nowhere on the board — no current-work card and no queue card`)
  }
  if (standing) return updateStanding(html.replace(card, ''))
  const body = text?.trim() || statusOf(card)
  if (!body) throw new Error('board: refusing to queue a card with an empty body')
  const hours = spanHours(metaOf(card))
  const meta = estimate ?? (hours == null ? QUEUE_STUB_META : hoursLabel(hours))
  const entry = renderEntry(stripPointPrefix(titleOf(card), point), meta, body)
  const out = html.replace(card, '')
  const { from } = sectionBounds(out, 'queue')
  return `${out.slice(0, from)}\n${entry}${out.slice(from).replace(/^\n/, '')}`
}

/**
 * Move a current-work card into the archive, keeping its START time and adding
 * the end — the shape the Erledigt section fixes. The body carries the card's
 * last status over unless the caller writes a closing one.
 */
export function toDone(html, point, { text, end = berlinStamp() } = {}) {
  const card = nowCard(html, point)
  if (!card) throw new Error(`board: no current-work card for point ${point}`)
  const body = text?.trim() || statusOf(card)
  if (!body) throw new Error('board: refusing to archive a card with an empty body')
  const start = (metaOf(card).match(/^\s*(\d{1,2}:\d{2})/) ?? [])[1] ?? end
  const title = stripPointPrefix(titleOf(card), point)
  const out = html.replace(card, '')
  // ONE POINT, ONE ERLEDIGT CARD (user 18.08.2026, measured on point 700, which
  // stood there FOUR times). A point comes back into current work whenever a
  // session boundary or a follow-up reopens it, and every archiving appended
  // another card, so the section read as four finished points. The EARLIEST
  // start is kept — that is when the work began — the newest end and the newest
  // closing text replace the old ones.
  // The OLDEST card's start is the true one, and it is found by ORDER, not by
  // comparing clock faces: the archive is newest-first and the stamps carry no
  // date, so `21:17` from last night is EARLIER than `00:45` this morning while
  // arithmetic says the opposite (measured on point 700's four cards).
  const existing = doneCards(out, point)
  const earliest = earliestStart(existing) || start
  const entry = renderDoneEntry({ point, title, start: earliest, end, body })
  const cleaned = dropDoneCards(out, point)
  const { from } = sectionBounds(cleaned, 'done')
  return `${cleaned.slice(0, from)}\n${entry}${cleaned.slice(from).replace(/^\n/, '')}`
}

/** One Erledigt entry, the single writer of that markup. */
function renderDoneEntry({ point, title, start, end, body }) {
  return (
    `<details>\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
    `<span class="right"><span class="meta">${start} · ${end}</span></span></summary>\n` +
    `  <div class="body">\n${renderCardBody(body)}\n  </div>\n</details>\n`
  )
}

/**
 * A card with its START field replaced, whatever shape the old one had.
 *
 * The field is everything between `class="meta">` and the range separator (or
 * the closing tag when the card carries a single stamp), so a damaged start is
 * REPLACED rather than partially overwritten (review rounds 3 and 5).
 */
export function withStart(card, start) {
  return String(card ?? '').replace(/(class="meta">)([^<]*)/, (whole, lead, content) => {
    const at = content.indexOf('·')
    return at < 0 ? `${lead}${start}` : `${lead}${start} ${content.slice(at)}`
  })
}

/** Remove every Erledigt card for `point`, INSIDE the section alone. */
function dropDoneCards(html, point) {
  const source = String(html ?? '')
  const b = doneBounds(source)
  if (!b) return source
  const entries = doneEntries(source).filter((e) => e.point === String(point))
  if (!entries.length) return source
  const section = source.slice(b.from, b.end)
  let out = ''
  let cursor = 0
  for (const e of entries) {
    out += section.slice(cursor, e.at)
    cursor = e.at + e.text.length
  }
  out += section.slice(cursor)
  return `${source.slice(0, b.from)}${out}${source.slice(b.end)}`
}

/** Where the Erledigt section's cards sit, or null when there is no section. */
function doneBounds(html) {
  try {
    return sectionBounds(String(html ?? ''), 'done')
  } catch {
    return null
  }
}

/** An Erledigt card, matched inside the section alone. */
const DONE_CARD_RE = /<details>\s*<summary><span class="num">\s*(\d+)\s*<\/span>[\s\S]*?<\/details>\n?/g

/** Every Erledigt card as `{ point, text, at }`, in document order (newest first). */
export function doneEntries(html) {
  const b = doneBounds(html)
  if (!b) return []
  const section = String(html).slice(b.from, b.end)
  return [...section.matchAll(DONE_CARD_RE)].map((m) => ({ point: m[1], text: m[0], at: m.index }))
}

/** Every Erledigt card for `point`, newest first — normally none or one. */
export function doneCards(html, point) {
  return doneEntries(html)
    .filter((e) => e.point === String(point))
    .map((e) => e.text)
}

/** The FIRST Erledigt card for `point`, or null. */
export function doneCard(html, point) {
  return doneCards(html, point)[0] ?? null
}

/**
 * The start stamp an Erledigt card carries, or '' when it carries none that is
 * a real time of day.
 *
 * `99:99` used to pass and then win the comparison it took part in
 * (cross-vendor review 18.08.2026): a damaged card must not decide when the work
 * began — it must simply not answer.
 */
export function doneStart(card) {
  // The stamp must END where the markup says it does (review rounds 2 and 4):
  // a bare digit boundary still read `12:34:56` and `12:34x` as `12:34`, so a
  // damaged card could decide the merged start. What may follow is the range
  // separator or the closing tag, nothing else.
  const m = String(card ?? '').match(/class="meta">\s*(\d{1,2}):(\d{2})(?=\s*(?:·|<\/span>))/)
  if (!m) return ''
  const [, h, min] = m
  if (Number(h) > 23 || Number(min) > 59) return ''
  return `${h}:${min}`
}

/**
 * The start of the OLDEST card that carries a usable one.
 *
 * By ORDER, not by comparing clock faces: the archive is newest-first and the
 * stamps carry no date, so last night's `21:17` precedes this morning's `00:45`
 * while arithmetic says the opposite. Scanning on past a malformed card matters
 * for the same reason — one damaged stamp must not throw the answer back to the
 * newest card (same review).
 */
export function earliestStart(cards = []) {
  for (let i = cards.length - 1; i >= 0; i--) {
    const s = doneStart(cards[i])
    if (s) return s
  }
  return ''
}

/**
 * Fold every duplicate Erledigt card into one, for a board that already carries
 * them (point 700 stood there four times before `toDone` learned to merge).
 *
 * The NEWEST card keeps its POSITION and its text — the archive is ordered by
 * when a point finished — and takes the earliest start it can find. The section
 * is rebuilt from its own cards rather than string-replaced: two byte-identical
 * duplicates made `replace` delete the FIRST occurrence, which is the survivor,
 * and an identical card in another section could be deleted instead (same
 * review).
 */
export function mergeDoneDuplicates(html) {
  const source = String(html ?? '')
  const b = doneBounds(source)
  if (!b) return { html: source, merged: [] }
  const entries = doneEntries(source)
  const counts = new Map()
  for (const e of entries) counts.set(e.point, (counts.get(e.point) ?? 0) + 1)
  const merged = [...counts.entries()].filter(([, n]) => n > 1).map(([point]) => point)
  if (!merged.length) return { html: source, merged: [] }

  const section = source.slice(b.from, b.end)
  let out = ''
  let cursor = 0
  const seen = new Set()
  for (const e of entries) {
    out += section.slice(cursor, e.at)
    cursor = e.at + e.text.length
    if (seen.has(e.point)) continue // an older duplicate: dropped
    seen.add(e.point)
    if (counts.get(e.point) > 1) {
      const start = earliestStart(doneCards(source, e.point))
      // The whole START FIELD is replaced, not the digits in it (review rounds 3
      // and 5): a damaged newest stamp is not always numeric — `oops · 01:10`
      // survived untouched and `12x:34` became `21:17x:34`.
      out += start ? withStart(e.text, start) : e.text
    } else {
      out += e.text
    }
  }
  out += section.slice(cursor)
  return { html: `${source.slice(0, b.from)}${out}${source.slice(b.end)}`, merged }
}

// ═══ Point 416 — closing a point must not leave the board blank ═══
// Closing used to be two board edits — archive the finished card, promote the
// next one — and between them "Woran ich gerade arbeite" was EMPTY. The user
// reported that hole twice within one hour ("you are not working on
// anything?"), and `board-core.test.mjs` refuses to sweep a board without
// current work, so the window also turned the whole unit layer red and the
// pre-push gate blocked an otherwise green merge. The test is RIGHT; what was
// missing is a way to close a point without opening the hole. Below is that
// way: one call, one document, no observable in-between.

/** Does "Woran ich gerade arbeite" hold a card? False on a board without the section. */
export function hasCurrentWork(html) {
  try {
    const { from, end } = sectionBounds(html, 'now')
    return /<details\b/.test(html.slice(from, end))
  } catch {
    return false
  }
}

/** The title of the card that stands in for current work when there is none. */
export const NO_CURRENT_WORK_TITLE = 'Gerade keine laufende Arbeit'

/**
 * The STAGE word the closing card ends on (point 655, user 11.08.2026). Its
 * title is composed per point now — "Das Trommelbett ist eine 1,9-Sekunden-
 * Schleife: Abschlussarbeiten": the subject FIRST, the stage last.
 *
 * WHY THE TITLE IS NO LONGER A CONSTANT. It was `CLOSING_WORK_TITLE`, one fixed
 * sentence for every point, so the card named only the STAGE the session was in:
 * "Abschlussarbeiten zum gerade beendeten Punkt". On the phone that is the whole
 * screen — no number, no subject — and the reader has to go and look up what
 * just ended. Because the matcher can then no longer key on the literal text, it
 * keys on the `data-state` marker below.
 */
export const CLOSING_STAGE = 'Abschlussarbeiten'

/** The pre-655 closing title, still recognised so an older board stays readable. */
export const CLOSING_WORK_TITLE = 'Abschlussarbeiten zum gerade beendeten Punkt'

/** A subject with a `: Abschlussarbeiten` tail removed — composing twice must not stack. */
const stripClosingStage = (text) =>
  String(text ?? '')
    .replace(new RegExp(`\\s*:\\s*${CLOSING_STAGE}\\s*$`), '')
    .trim()

/**
 * Is this title the shape the CLOSING card composes — "<Betreff>: <Stage>"?
 *
 * It lives HERE, beside the composer, because both the strip below and the
 * publish gate ask it and neither may answer it differently. Only the closing
 * stage counts, not every stage word (four-eyes review, 12.08.2026): "Karten:
 * Vorbereitung" is an ordinary title with a real subject.
 */
export function looksLikeClosingTitle(title) {
  return new RegExp(`[:—–]\\s*${CLOSING_STAGE}\\s*$`, 'i').test(String(title ?? '').trim())
}

/** "<Betreff>: Abschlussarbeiten" — what `board.mjs closing <N>` composes. */
export function closingCardTitle(subject) {
  const text = stripClosingStage(subject)
  if (!text) throw new Error('board: a closing card needs the point SUBJECT for its title')
  return `${text}: ${CLOSING_STAGE}`
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

/**
 * THE MARKER THE STATE CARDS ARE FOUND BY (point 655). A state card is REPLACED,
 * never appended, so whatever writes one has to find the one standing — and
 * while the closing card's title was a constant, the pattern could be built from
 * that title. A per-point title makes that impossible, so the KIND is written
 * into the markup and every matcher keys on it. The legacy titles stay
 * recognised beside it: a board written before this point must still be read,
 * and its state card must still be replaceable.
 */
const STATE_ATTR = (kind) => ` data-state="${kind}"`

/** Any run of markup that stays INSIDE one card — never past its closing tag. */
const WITHIN_CARD = '(?:(?!</details>)[\\s\\S])*?'

/** The two state kinds: the unnumbered handover card, and the closing card. */
export const STATE_KINDS = ['idle', 'closing']

/** The pre-655 title of each state card — the fallback every matcher carries. */
const LEGACY_STATE_TITLE = { idle: NO_CURRENT_WORK_TITLE, closing: CLOSING_WORK_TITLE }

/**
 * The UNNUMBERED state-card titles. The handover card owns no point number by
 * design, so every rule written for a numbered card — the topic guard's
 * foreign-point complaint above all — has to know it by name. The closing card
 * carries a number since point 655; its legacy title stays listed so a board
 * written earlier is still exempted.
 */
export const STATE_CARD_TITLES = [NO_CURRENT_WORK_TITLE, CLOSING_WORK_TITLE]

/** Is this now-card title one of the unnumbered state cards? */
export function isStateCardTitle(title) {
  return STATE_CARD_TITLES.includes(String(title ?? '').trim())
}

/**
 * A state card's markup, matched globally: by its marker, or — for a card
 * written before point 655 — by its literal title. A fresh regex per call; a
 * shared global one carries `lastIndex` between callers.
 */
const stateCardPattern = (kind) =>
  new RegExp(
    `<details class="now"[^>]*data-state="${kind}"[^>]*>[\\s\\S]*?</details>\\s*` +
      `|<details class="now"[^>]*>${WITHIN_CARD}<span class="t">${LEGACY_STATE_TITLE[kind]}</span>[\\s\\S]*?</details>\\s*`,
    'g',
  )

/**
 * Is this card REALLY the state its marker claims (four-eyes review,
 * 12.08.2026)? A marker is hand-writable and a state card is REPLACED, so a
 * marker alone must never authorise a deletion: the idle card is unnumbered and
 * carries its constant title, the closing card carries a composed closing title.
 * Anything else keeps standing and the publish gate names it.
 */
function isTrulyStateCard(card, kind) {
  const summary = (String(card).match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
  const title = ((summary.match(new RegExp(`<span class="t">${TITLE_TEXT}</span>`)) ?? [])[1] ?? '').trim()
  const numbered = summaryPoint(summary).chip != null
  if (kind === 'idle') return title === NO_CURRENT_WORK_TITLE && !numbered
  // THE LEGACY TITLE ONLY COUNTS ON AN UNNUMBERED CARD (four-eyes review,
  // 12.08.2026). That card never had a number; a NUMBERED card wearing the old
  // sentence is a point card whose title is merely wrong, and removing it would
  // delete real work without passing the one path that reports what it removes.
  if (title === CLOSING_WORK_TITLE) return !numbered
  return looksLikeClosingTitle(title)
}

const noWorkCardPattern = () => stateCardPattern('idle')
const closingCardPattern = () => stateCardPattern('closing')

/** Every idle card standing in the document — normally none or one. */
export function noCurrentWorkCards(html) {
  return String(html ?? '').match(noWorkCardPattern()) ?? []
}

/** Every closing card standing in the document — normally none or one. */
export function closingWorkCards(html) {
  return String(html ?? '').match(closingCardPattern()) ?? []
}

/**
 * The document without any idle card. The state is REPLACED, never appended —
 * but only where the card really IS the handover card: a numbered running card
 * that somehow wears the idle marker is running work, and deleting it would cost
 * exactly what the marker was introduced to protect.
 */
export function stripNoCurrentWork(html) {
  return withinNowSection(html, (scope) =>
    scope
      .replace(noWorkCardPattern(), (card) => (isTrulyStateCard(card, 'idle') ? '' : card))
      .replace(emptyStatePattern(), ''),
  )
}

/**
 * Apply an edit to the current-work SECTION alone — never to the whole document
 * (four-eyes review, 12.08.2026). A state card that has drifted out of the
 * section is a `now-card-outside` violation the gate reports; deleting it from
 * the archive or the queue on the next state write would take that evidence away
 * silently, and the one path allowed to remove a card is the one that says so.
 * A fragment without the section is judged as it stands, like the claims are.
 */
function withinNowSection(html, edit) {
  const text = String(html ?? '')
  try {
    const { from, end } = sectionBounds(text, 'now')
    return text.slice(0, from) + edit(text.slice(from, end)) + text.slice(end)
  } catch {
    return edit(text)
  }
}

/**
 * The document without any closing card. Same rule: a state replaces.
 *
 * A MARKER ALONE IS NOT THE STATE (four-eyes review, 12.08.2026). A card that
 * wears `data-state="closing"` over an ordinary subject title is not closing
 * work, and removing it would silently delete RUNNING work — the marker is
 * hand-writable, so it must not be able to authorise a deletion on its own. Such
 * a card is left standing and the publish gate refuses it by name; it carries a
 * number, so `queue <N>`, `done <N>` and `title <N>` all reach it.
 */
export function stripClosingWork(html) {
  return withinNowSection(html, (scope) =>
    scope.replace(closingCardPattern(), (card) => (isTrulyStateCard(card, 'closing') ? '' : card)),
  )
}

/**
 * The document without ANY state card. The three kinds are mutually exclusive
 * (`board-structure-core` refuses a board carrying two), so whatever writes one
 * kind clears the others in the same edit.
 *
 * AN UNNUMBERED CARD IS A STATE CARD, whatever it says (four-eyes review,
 * 12.08.2026). Since point 655 a current-work card either names its point in the
 * chip or IS the handover card, so a card with neither chip nor legacy title
 * number can only be a state card — one written by hand, or by a version of this
 * module that had no marker yet. Without this clause nothing could remove such a
 * card: the state patterns miss it and every point command needs a number, so
 * the publish gate would refuse the board and the only repair left would be the
 * hand edit this whole module exists to make unnecessary.
 */
export function stripStateCards(html) {
  return stripClosingWork(stripNoCurrentWork(html))
}

/**
 * The points of the NUMBERED current-work cards, the state cards excluded. The
 * closing card carries a number since point 655, and counting it here would make
 * the boundary's own handover card unwritable ("651 still stands as current
 * work") right after that very card said the point was finished.
 */
function standingPointCards(html) {
  return [...parseNowCardPoints(stripStateCards(String(html ?? '')))]
}

/**
 * Does the board's current-work section CLAIM that nothing is running
 * (point 470)? This is the predicate `board-first-guard` denies on, so it is
 * scoped to the section: an idle card quoted anywhere else — in the archive, in
 * a queue entry's prose — is not the claim.
 *
 * A document without the section is answered from the whole text: a fragment is
 * all the caller has, and reading it is closer to the truth than saying "no".
 *
 * THE CLOSING CARD IS NOT THIS CLAIM (point 544). It says the opposite — work is
 * still owed on the point that just ended — so the deny must not fire under it.
 * That falls out of the marker; the tests pin it so no future widening of this
 * predicate can quietly take the other card with it.
 */
export function claimsNoCurrentWork(html) {
  return sectionStateCards(html, 'idle').length > 0 || (nowSectionSlice(html).text.match(emptyStatePattern()) ?? []).length > 0
}

/** Does the current-work section say that only closing duties are left? */
export function claimsClosingWork(html) {
  return sectionStateCards(html, 'closing').length > 0
}

/**
 * The cards in the current-work section that REALLY are the given state — the
 * marker checked against the card itself (four-eyes review, 12.08.2026).
 *
 * A numbered card wearing the idle marker is running work, not a claim to stop.
 * Trusting the marker there fired the point-470 deny on a card the strip
 * deliberately refuses to remove, and the deny's remedies (`now`, `closing`)
 * cannot reach it while the ones that can (`title`, `queue`) are themselves the
 * state-changing calls it blocks — a trap with no way out.
 */
function sectionStateCards(html, kind) {
  const text = String(html ?? '')
  let scope = text
  try {
    const { from, end } = sectionBounds(text, 'now')
    scope = text.slice(from, end)
  } catch {
    /* no section — judge the fragment as it stands */
  }
  return (scope.match(stateCardPattern(kind)) ?? []).filter((card) => isTrulyStateCard(card, kind))
}

/**
 * A current-work card that NAMES the absence of current work — the honest form
 * of an empty section, for the rare tick where nothing can be promoted (empty
 * queue, or a session boundary about to be taken). It carries no point number,
 * so it adds none of the point-per-section conflicts; declare a non-point focus
 * (`focus.mjs set - "<why>"`) alongside it.
 *
 * IT IS A STATE, NOT AN ENTRY (point 470). Writing it REPLACES any idle card
 * already standing. On 30.07.2026 three of them stood stacked on the board the
 * user reads, because the only sanctioned writer needed a point to close and the
 * session hand-edited the file instead — and a hand-edit APPENDS. Two idle cards
 * are now unreachable through this path, whatever calls it and however often.
 *
 * IT IS THE ONE UNNUMBERED CARD (point 655), so it owes the reader in prose what
 * the numbered cards give him in a chip: the reason must NAME the point the
 * successor picks up. The publish gate refuses a handover card that names none.
 *
 * AND IT MUST BE TRUE WHEN IT IS WRITTEN. A numbered card standing in the
 * section is work the board itself says is running, so the claim would
 * contradict the document it is written into — exactly the pair the user read
 * that evening ("470 läuft" above "Gerade keine laufende Arbeit"). Refused, with
 * both sanctioned ways out named.
 */
export function toNoCurrentWork(html, reason, { stamp = berlinStamp() } = {}) {
  return writeStateCard(html, {
    kind: 'idle',
    title: NO_CURRENT_WORK_TITLE,
    text: reason,
    stamp,
    emptyReason: 'board: --none needs a reason — the reader must learn WHY nothing is running',
    claim: 'that nothing is running',
    // THE WRITER REFUSES WHAT ITS OWN GATE WOULD REFUSE (four-eyes review,
    // 12.08.2026). `none "Sitzungsgrenze."` used to write a card the publish gate
    // then rejected — a sanctioned command producing an unpublishable board is
    // the worst of both, because the refusal arrives a step after the mistake.
    precondition: (text) =>
      namesFollowOnWork(text)
        ? null
        : 'board: the handover card is the one card without a number, so its reason must NAME the ' +
          'point the batch picks up next ("… der Nachfolger nimmt Punkt 656"). The publish gate ' +
          'refuses a handover card that names none.',
  })
}

/**
 * The current-work card for a session that has MERGED AND TICKED its point and
 * still owes its closing duties — the four-eyes record on the tick commit, the
 * retrospective's new problem class (point 544). It CARRIES ITS POINT since
 * point 655: the number in the chip, the point's subject in the title, the stage
 * last, and a body that says what the point was about before what is left of it.
 *
 * IT IS A STATE, like the idle card, and the two are mutually exclusive: writing
 * this one clears any idle card standing, and the boundary's `none` clears this
 * one. Refused while a NUMBERED point card stands, for the same reason the idle
 * card is: the board would contradict itself in one screen.
 *
 * IT IS NOT A CLAIM TO STOP. That is the whole point of it — `board-first-guard`
 * denies under the idle card and lets the work through under this one.
 */
export function toClosingWork(html, point, { subject, reason, stamp = berlinStamp() } = {}) {
  if (!/^\d+$/.test(String(point ?? ''))) {
    throw new Error(
      `board: closing takes the POINT it closes, got "${point}" — node scripts/board.mjs closing <N> "<Grund>"`,
    )
  }
  // The REASON is judged before the composition: the subject line this card
  // prepends would otherwise make an empty reason look like a full body.
  const duties = String(reason ?? '').trim()
  if (!duties) {
    throw new Error('board: closing needs a reason — the reader must learn WHICH duties are still owed')
  }
  const name = String(subject ?? '').trim() || pointSubject(html, point) || ''
  if (name && stageOnlyTitle(name)) {
    throw new Error(
      `board: "${name}" is a STAGE, not a subject — the card would read "${name}: ${CLOSING_STAGE}" and ` +
        'say nothing about the point. Give the point\'s own subject: node scripts/board.mjs closing ' +
        `${point} --title "<Betreff des Punktes>" "<Grund>".`,
    )
  }
  if (!name) {
    throw new Error(
      `board: no German subject for point ${point} stands anywhere on the board, so the card would ` +
        `say only "${CLOSING_STAGE}" — the very thing point 655 ended. Give it one: ` +
        `node scripts/board.mjs closing ${point} --title "<Betreff des Punktes>" "<Grund>".`,
    )
  }
  const subject_ = stripClosingStage(name)
  return writeStateCard(html, {
    kind: 'closing',
    point,
    title: closingCardTitle(subject_),
    // THE BODY SAYS WHAT THE POINT IS ABOUT BEFORE IT SAYS WHAT STAGE IT IS IN
    // (user 11.08.2026). The subject leads, the owed duties follow as their own
    // paragraph — composed here, so no caller can leave the subject out.
    text: `${subject_} — dieser Punkt ist zusammengeführt und abgehakt; die ${CLOSING_STAGE} stehen noch aus.\n\n${duties}`,
    stamp,
    emptyReason: 'board: closing needs a reason — the reader must learn WHICH duties are still owed',
    claim: 'that only closing duties are left',
  })
}

/**
 * Does this text name a FOLLOW-ON point? It lives beside the writer that owes it,
 * and the publish gate imports it, so the two cannot ask it differently.
 *
 * KNOWN LIMIT: it asks that A point is named, not that it is the RIGHT one —
 * nothing here can know which point just ended. It catches the card that names
 * none at all, which is the reported defect.
 */
export function namesFollowOnWork(text) {
  return /\b(?:punkt|point)\s*(\d{1,6})\b/i.test(String(text ?? ''))
}

/**
 * The German subject a point is known by on this board: from its numbered chip
 * (a queue, Erledigt or current-work card) or from a title still written in the
 * pre-655 "651 — …" shape. Null when the point stands nowhere.
 */
export function pointSubject(html, point) {
  const doc = String(html ?? '')
  const chip = doc.match(new RegExp(`<span class="num">${point}</span><span class="t">${TITLE_TEXT}</span>`))
  const legacy = chip ? null : doc.match(new RegExp(`<span class="t">${point}\\s*${DASH}\\s*${TITLE_TEXT}</span>`))
  const text = stripClosingStage((chip ?? legacy ?? [])[1])
  return text || null
}

/** Write one state card, replacing whichever one stands. */
function writeStateCard(html, { kind, point = null, title, text: reason, stamp, emptyReason, claim, precondition }) {
  const text = String(reason ?? '').trim()
  if (!text) throw new Error(emptyReason)
  const standing = standingPointCards(html)
  if (standing.length) {
    throw new Error(
      `board: refusing to claim ${claim} while ${standing.join(', ')} still stands as current ` +
        'work — the board would contradict itself in one screen. Close that card in the same edit ' +
        `(done ${standing[0]} --none "<reason>") or send it back (queue ${standing[0]}).`,
    )
  }
  // Judged AFTER the contradiction above, which is the more fundamental refusal:
  // a card that may not be written at all owes no advice about its wording.
  const objection = precondition ? precondition(text) : null
  if (objection) throw new Error(objection)
  const card =
    `<details class="now"${STATE_ATTR(kind)}>\n  <summary>${point == null ? '' : numberChip(point)}` +
    `<span class="t">${escapeCardTitle(title)}</span>` +
    `<span class="right"><span class="meta">${stamp}</span></span></summary>\n` +
    `  <div class="body">\n${renderCardBody(text, { stamp })}\n  </div>\n</details>\n`
  return insertAsFirstNowCard(stripStateCards(html), card)
}

/**
 * Archive `point` AND settle what current work is afterwards, in ONE document.
 * Either a successor is promoted from the queue (`next` + `nextStatus`), or the
 * absence is named (`none`), or — with parallel work — the section still holds
 * another card on its own. Anything else is REFUSED: leaving the section empty
 * is the defect, and forgetting must not be able to reach it.
 */
export function closeCard(html, point, { text, end = berlinStamp(), next = null, nextStatus, none, stamp } = {}) {
  if (next != null && none) throw new Error('board: done takes EITHER --next or --none, never both')
  const at = stamp ?? end
  const archived = toDone(html, point, { text, end })
  if (next != null) {
    const status = String(nextStatus ?? '').trim()
    if (!status) throw new Error(`board: --next ${next} needs the new card's status text`)
    return toNow(archived, next, status, { stamp: at })
  }
  if (none) return toNoCurrentWork(archived, none, { stamp: at })
  if (!hasCurrentWork(archived)) {
    throw new Error(
      `board: archiving ${point} would leave "Woran ich gerade arbeite" EMPTY, which the reader ` +
        'reads as "nothing is happening" and the unit layer reads as a failure. Say what follows in ' +
        `the SAME edit: done ${point} --next <m> "<status>" to promote the next point, or ` +
        `done ${point} --none "<reason>" when there is genuinely nothing to promote.`,
    )
  }
  return archived
}

/**
 * Split `done`'s argv into its buckets: the closing text, an optional
 * `--next <m> "<status>"` and an optional `--none "<reason>"`. Pure so the
 * flag handling is pinned by tests rather than by the shape of one `indexOf`.
 */
export function parseDoneArgs(rest) {
  const args = (Array.isArray(rest) ? rest : []).map((a) => String(a))
  const out = { point: args[0], words: [], next: null, nextWords: [], noneWords: [], hasNone: false }
  let bucket = 'words'
  for (const a of args.slice(1)) {
    if (a === '--next') {
      if (out.next != null) throw new Error('board: --next given twice')
      bucket = 'next-point'
      continue
    }
    if (a === '--none') {
      out.hasNone = true
      bucket = 'noneWords'
      continue
    }
    if (bucket === 'next-point') {
      if (!/^\d+$/.test(a)) throw new Error(`board: --next takes the successor's POINT NUMBER, got "${a}"`)
      out.next = a
      bucket = 'nextWords'
      continue
    }
    out[bucket].push(a)
  }
  if (bucket === 'next-point') throw new Error('board: --next needs a point number')
  return out
}

/**
 * Split `closing`'s argv into the point it closes, an optional `--title
 * "<Betreff>"` and the reason. Pure, so the flag handling is pinned by tests —
 * and the point is a POSITIONAL argument now (point 655), because the card must
 * name it and a caller that has to remember to write it into the text will one
 * day not.
 */
export function parseClosingArgs(rest) {
  const args = (Array.isArray(rest) ? rest : []).map((a) => String(a))
  const [point, ...tail] = args
  const out = { point: point ?? '', subject: null, words: [] }
  for (let i = 0; i < tail.length; i += 1) {
    if (tail[i] !== '--title') {
      out.words.push(tail[i])
      continue
    }
    if (out.subject != null) throw new Error('board: --title given twice')
    out.subject = String(tail[i + 1] ?? '').trim()
    if (!out.subject) throw new Error('board: --title needs the point SUBJECT as its value')
    i += 1
  }
  return out
}

/**
 * Put a question to the user as a "Von dir zu klären" card, at the TOP of the
 * section (point 421). Until now the board could only DROP such a card, so the
 * one thing the rule demands — that every decision asked of the user stands
 * there — had to be hand-edited into the HTML, and the guard's remedy could not
 * name a command. The card carries a TITLE ONLY in its collapsed header, per the
 * board's binding structure, and the body says what is to be decided.
 */
export function addVdzk(html, title, text) {
  // ESCAPED, unlike the other card builders (four-eyes review 30.07.2026): the
  // guard's remedy line hands out a literal `"<Titel der Frage>"` placeholder, so
  // a paste of it is the LIKELY first call — and an unescaped `<` produces a card
  // whose title parses as empty, i.e. an invisible open question.
  const esc = (s) => String(s ?? '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const head = esc(title)
  const body = renderCardBody(text, { escape: esc })
  if (!head) throw new Error('board: vdzk-add needs a title — the collapsed card shows nothing else')
  if (!body) throw new Error('board: vdzk-add needs the question itself as the card body')
  const { from, end } = sectionBounds(html, 'vdzk')
  const section = html.slice(from, end)
  const standing = [...section.matchAll(/<details>\s*<summary><span class="t">[\s\S]*?<\/details>\s*/g)]
    .map((card) => titleOf(card[0]))
    .find((standingTitle) => standingTitle === head)
  if (standing) {
    throw new Error(
      `board: open question "${standing}" already stands under "Von dir zu klären" — ` +
        'a genuinely new question needs a distinguishable title',
    )
  }
  const card =
    `<details>\n  <summary><span class="t">${head}</span></summary>\n` +
    `  <div class="body">\n${body}\n  </div>\n</details>\n`
  return `${html.slice(0, from)}\n${card}${html.slice(from).replace(/^\n/, '')}`
}

/**
 * Remove a "Von dir zu klären" card the user has answered, matched on a
 * fragment of its title. An ambiguous fragment throws with the candidates
 * rather than deleting the wrong question.
 */
export function removeVdzk(html, fragment) {
  if (!fragment || !String(fragment).trim()) throw new Error('board: need a title fragment')
  const { from, end } = sectionBounds(html, 'vdzk')
  const section = html.slice(from, end)
  const cards = [...section.matchAll(/<details>\s*<summary><span class="t">[\s\S]*?<\/details>\s*/g)]
  const needle = String(fragment).toLowerCase()
  const hits = cards.filter((c) => titleOf(c[0]).toLowerCase().includes(needle))
  if (hits.length === 0) throw new Error(`board: no open question matching "${fragment}"`)
  if (hits.length > 1) {
    throw new Error(`board: "${fragment}" matches ${hits.length}: ${hits.map((h) => titleOf(h[0])).join(' | ')}`)
  }
  return html.slice(0, from) + section.replace(hits[0][0], '') + html.slice(end)
}

/**
 * Replace the body of the current-work card for `point` with one stamped
 * paragraph. Throws when there is no such card — a status for a point that is
 * not shown as current work would be a status nobody can read, and silently
 * doing nothing is the failure this project keeps paying for.
 */
export function setCardStatus(html, point, text, stamp = berlinStamp()) {
  if (typeof html !== 'string' || !html) throw new Error('board: empty document')
  if (!/^\d+$/.test(String(point))) throw new Error(`board: not a point number: ${point}`)
  if (!text || !String(text).trim()) throw new Error('board: refusing to write an empty status')
  // BOUNDED TO ITS OWN CARD (four-eyes review, 12.08.2026). The run to the body
  // used to be free, so a card that had lost its body sent the rewrite into the
  // NEXT card's body — a status for one point silently overwriting another
  // point's text, with markup that still looked plausible afterwards. A card
  // without a body is now simply not found, and the refusal says so.
  const re = new RegExp(`(${NOW_HEAD(point)}${WITHIN_CARD}<div class="body">)${WITHIN_CARD}(</div>\\s*</details>)`)
  const { from, end, text: section } = nowSectionSlice(html)
  if (!re.test(section)) throw new Error(`board: no current-work card for point ${point} — add the card first`)
  const body = renderCardBody(text, { stamp })
  const rewritten = section.replace(re, (_m, head, tail) => `${head}\n${body}\n  ${tail}`)
  return html.slice(0, from) + rewritten + html.slice(end)
}

/**
 * Retitle the card for `point` — the current-work card when there is one, the
 * queue card otherwise. Times, estimate and body are left exactly as they were.
 *
 * WHY IT EXISTS (point 439): a now-card had no retitling command at ALL, so the
 * three current-work cards of 30.07.2026 had to be fixed by hand-editing the
 * board HTML — the act that then wrote the file back with CRLF and crashed
 * `attest` (see `normaliseLineEndings`). The queue side had the same gap in a
 * milder form: only `.claude/board-queue.json` could be hand-typed.
 */
export function setCardTitle(html, point, title) {
  if (typeof html !== 'string' || !html) throw new Error('board: empty document')
  if (!/^\d+$/.test(String(point))) throw new Error(`board: not a point number: ${point}`)
  const text = String(title ?? '').trim()
  if (!text) throw new Error('board: refusing to write an empty title')
  // A SANCTIONED WRITER MAY NOT PRODUCE WHAT THE PUBLISH GATE REFUSES (four-eyes
  // review, 12.08.2026): a title that says only which STAGE the work is in is
  // exactly the card point 655 ended, and writing one here would leave the board
  // unpublishable one command later.
  if (stageOnlyTitle(text)) {
    throw new Error(
      `board: "${text}" names a STAGE and no subject — a card title says what the point IS. ` +
        `For the closing card use node scripts/board.mjs closing ${point} "<Grund>", which composes ` +
        `"<Betreff>: ${CLOSING_STAGE}" itself.`,
    )
  }
  // Both sections carry the number in a chip of its own since point 655, so a
  // retitle only ever rewrites the SUBJECT — and a now-card still written in the
  // old shape ("439 — …") is lifted into the chip shape on the way.
  // ON A CLOSING CARD THE TITLE KEEPS ITS SHAPE. The marker and the composed
  // title are one statement; retitling only the subject would leave a card the
  // gate reads as a false closing marker.
  const now = nowSectionSlice(html)
  const closingMarked = new RegExp(
    `<details class="now"[^>]*data-state="closing"[^>]*>\\s*<summary>[\\s\\S]*?<span class="num">\\s*${point}\\s*</span>`,
  ).test(now.text)
  // A CLOSING SHAPE IS THE CLOSING STATE (four-eyes review, 12.08.2026). Writing
  // that title onto an ordinary card would produce the unmarked closing card the
  // gate refuses — and the command that writes the state properly is one line
  // away, so it is named rather than approximated.
  if (!closingMarked && looksLikeClosingTitle(text)) {
    throw new Error(
      `board: "${text}" is the CLOSING card's shape, and this card is not the closing card. ` +
        `Write that state with node scripts/board.mjs closing ${point} "<Grund>", which composes the ` +
        'title and sets the marker together.',
    )
  }
  const bare = escapeCardTitle(closingMarked ? closingCardTitle(stripPointPrefix(text, point)) : stripPointPrefix(text, point))
  const chipRe = new RegExp(
    `(<details class="now"[^>]*>\\s*<summary>\\s*<span class="num">\\s*${point}\\s*</span>\\s*<span class="t">)` +
      `(?:(?!</span>)[\\s\\S])*(</span>)`,
  )
  if (chipRe.test(now.text)) {
    const rewritten = now.text.replace(chipRe, (_m, head, tail) => `${head}${bare}${tail}`)
    return html.slice(0, now.from) + rewritten + html.slice(now.end)
  }
  const legacyRe = new RegExp(
    `(<details class="now"[^>]*>\\s*<summary>\\s*)<span class="t">\\s*${point}\\s*${DASH}(?:(?!</span>)[\\s\\S])*(</span>)`,
  )
  if (legacyRe.test(now.text)) {
    const rewritten = now.text.replace(
      legacyRe,
      (_m, head, tail) => `${head}${numberChip(point)}<span class="t">${bare}${tail}`,
    )
    return html.slice(0, now.from) + rewritten + html.slice(now.end)
  }
  // SCOPED TO THE QUEUE (four-eyes review, 12.08.2026): the archived cards carry
  // the very same markup, so an unscoped fallback retitled FINISHED work for a
  // point that had no card left in either live section — silently, since the
  // command reports success either way. The Erledigt section is history; a
  // retitle there is a hand edit's business, not this command's.
  const queueRe = new RegExp(
    `(<summary><span class="num">${point}</span><span class="t">)(?:(?!</span>)[\\s\\S])*(</span>)`,
  )
  try {
    const { from, end } = sectionBounds(html, 'queue')
    const section = html.slice(from, end)
    if (queueRe.test(section)) {
      const rewritten = section.replace(queueRe, (_m, head, tail) => `${head}${escapeCardTitle(text)}${tail}`)
      return html.slice(0, from) + rewritten + html.slice(end)
    }
  } catch {
    /* no queue section — the refusal below is the honest answer */
  }
  throw new Error(`board: no current-work or queue card for point ${point}`)
}

/** Hours the queue card for `point` promises, or null — what a promotion carries. */
export function queueEstimateHours(html, point) {
  const card = queueCard(html, point)
  return card ? estimateHours(metaOf(card)) : null
}

/**
 * What to TELL the caller when a point is promoted with no estimate (point 439):
 * the now-card then renders its start time alone, so the reader gets a card in
 * active work with no expected end — the invisibility this point is about. A
 * string to print, or null when the estimate is there and the header carries it.
 */
export function promotionEstimateWarning(html, point) {
  return queueEstimateHours(html, point) == null
    ? `board: point ${point} was promoted with NO estimate, so its card shows a start time and no ` +
        `expected end. Set one and re-promote: node scripts/board-queue.mjs set ${point} --estimate "~2 h"`
    : null
}
