// Pure decision logic of the dashboard Stop-hook guard (dashboard-guard.mjs is
// the thin I/O wrapper). Kept side-effect-free so the Vitest layer can sweep
// every invariant without git/fs (scripts/dashboard-guard-core.test.mjs).
//
// The guard exists because reminders repeatedly failed (user mandate 21.07.2026,
// re-tightened 22.07.2026 after the now-card still said point 200 while the work
// had pivoted to point 210): every invariant here is ENFORCED at turn end, not
// suggested. Fail-open is the WRAPPER's job (any I/O error → allow); this core
// only decides on the inputs it is handed and must never throw on partial ones.

/** A focus confirmation older than this, with tool work after it, must be re-affirmed. */
export const FOCUS_FRESH_MS = 30 * 60 * 1000

/** Open/done TASKS points; DEFERRED lines are skipped (AWAITING-USER stays open). */
export function parseTasks(text) {
  const open = []
  const done = []
  if (typeof text !== 'string') return { open, done }
  for (const l of text.split('\n')) {
    let m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.push(Number(m[1]))
    m = l.match(/^- \[x\] (\d+)\./)
    if (m) done.push(Number(m[1]))
  }
  return { open, done }
}

/**
 * ALL leading point numbers of the now-SECTION card TITLES
 * (`<span class="t">210 — …`), as a Set in document order. With the
 * feature-branch + worktree workflow several TASKS points are worked in
 * parallel, so "Woran ich gerade arbeite" holds one card PER point in active
 * work (user decision 22.07.2026) — every invariant below reads this SET, not
 * a single card. Only card TITLES count, never incidental mentions in the
 * status text ("the point-200 class" falsely covered 200 once); a card whose
 * title has no leading number (non-point work) contributes nothing. Empty Set
 * on a missing section or non-string input.
 */
export function parseNowCardPoints(html) {
  const points = new Set()
  if (typeof html !== 'string') return points
  const nowStart = html.indexOf('Woran ich gerade arbeite')
  if (nowStart < 0) return points
  // Bound the search to the now-card SECTION (up to the next <h2>). A
  // NON-numeric now-card title (a closing cycle, cross-cutting work) otherwise
  // lets the scan run on into "Von dir zu klären"/Warteschlange and grab
  // numbered cards there — false now-card points (observed 22.07.2026:
  // a non-numeric now-card read the VDZK 206 card as its point).
  const nextH2 = html.indexOf('<h2>', nowStart + 1)
  const section = html.slice(nowStart, nextH2 < 0 ? undefined : nextH2)
  for (const m of section.matchAll(/class="t">\s*(\d+)/g)) points.add(Number(m[1]))
  return points
}

/**
 * Back-compat single-card view: the FIRST now-card point (document order) or
 * null. Kept for the wrapper/focus tooling; the guard invariants themselves
 * use the full parseNowCardPoints Set.
 */
export function parseNowCardPoint(html) {
  for (const n of parseNowCardPoints(html)) return n
  return null
}

/**
 * The now-section's card BODIES as one normalised string — the text the reader
 * sees, whitespace-collapsed and tag-free, or '' when the section is absent.
 * Hashed at --synced so invariant (8c) can tell a rewritten card from a merely
 * re-confirmed one (user 25.07.2026).
 */
export function nowCardText(html) {
  if (typeof html !== 'string') return ''
  const nowStart = html.indexOf('<h2>Woran ich gerade arbeite')
  if (nowStart < 0) return ''
  const nextH2 = html.indexOf('<h2>', nowStart + 1)
  const section = html.slice(nowStart, nextH2 < 0 ? undefined : nextH2)
  return [...section.matchAll(/<div class="body[^"]*">([\s\S]*?)<\/details>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .join(' | ')
}

/** Point numbers of the Warteschlange cards only (the Erledigt section also uses `.num`). */
export function parseQueuePoints(html) {
  const queued = new Set()
  if (typeof html !== 'string') return queued
  // Anchor on the SECTION HEADER, not any mention: a now-card/card that names
  // "Warteschlange" in prose otherwise steals qStart and the slice misses the
  // real queue cards (observed 22.07.2026 — all points falsely read "missing").
  const qStart = html.indexOf('<h2>Warteschlange')
  if (qStart < 0) return queued
  const qEnd = html.indexOf('<h2>', qStart + 1)
  const queueHtml = html.slice(qStart, qEnd < 0 ? undefined : qEnd)
  for (const m of queueHtml.matchAll(/class="num">\s*(\d+)/g)) queued.add(Number(m[1]))
  return queued
}

/**
 * Point numbers of the "Von dir zu klären" cards (items blocked on the user).
 * Anchored on the SECTION HEADER like parseQueuePoints, and reading only the
 * LEADING number of each card TITLE (`<span class="t">226 — …`) — the pattern
 * parseNowCardPoint uses — never every digit: cards without a leading number
 * (the ntfy subscription, the communication-system question) are not
 * point-tied and yield nothing. Empty Set on non-string input or a missing
 * section.
 */
export function parseKlaerungPoints(html) {
  const points = new Set()
  if (typeof html !== 'string') return points
  const kStart = html.indexOf('<h2>Von dir zu klären')
  if (kStart < 0) return points
  const kEnd = html.indexOf('<h2>', kStart + 1)
  const sectionHtml = html.slice(kStart, kEnd < 0 ? undefined : kEnd)
  for (const m of sectionHtml.matchAll(/class="t">\s*(\d+)/g)) points.add(Number(m[1]))
  return points
}

// ═══ Point-313 full-consistency audit (user 25.07.2026, four-eyes Opus+Fable) ═══
// The 25.07 morning audit found real gaps none of invariants 1-9 caught: newly
// ticked points with no Erledigt card (262/273/293/305), an OPEN point with an
// Erledigt card (306), a queue card whose meta was no duration, cp1252
// double-encoding damage across the file, and structure drift. auditDashboard()
// is the pure check set; evaluate() blocks on it as invariant (8b), and the
// wrapper refuses to record --synced while it fails.

/** The four binding sections, in the user's mandated order (18.07.2026). */
export const SECTION_TITLES = ['Woran ich gerade arbeite', 'Von dir zu klären', 'Warteschlange', 'Erledigt']

/** Sections whose whole body collapses behind their heading (user 26.07.2026).
 *  Erledigt is the archive: it dwarfs the board and is the least-read part, so
 *  its heading is the toggle and it starts CLOSED like every card. */
/** Every section folds behind its own heading (user 27.07.2026); only Erledigt
 *  starts closed, and the `open` ban plus the board's script handle that. */
export const COLLAPSIBLE_SECTIONS = [
  'Woran ich gerade arbeite',
  'Von dir zu klären',
  'Warteschlange',
  'Erledigt',
]

/** The board keeps only the newest finished cards; the rest live on their own
 *  published page (user 27.07.2026). Measured reason: at 214 cards the archive
 *  was three quarters of the file, so every review of the board grew with every
 *  closed point. */
export const ERLEDIGT_ON_BOARD = 20

/** The meta a generated queue card carries while nobody has estimated the point
 *  (point 400, delta C). It lives HERE, beside the rule that exempts it, so the
 *  generator and the audit can never disagree about the exact wording — and
 *  board-queue-core re-exports it rather than keeping a second copy. */
export const QUEUE_STUB_META = 'Schätzung offen'

/** The body that same generated card carries while nobody has written prose for
 *  the point. Defined here for the same reason as the meta above: the rule that
 *  COUNTS these cards must recognise the exact string the generator emits. */
export const QUEUE_STUB_BODY =
  'Noch keine Beschreibung auf dem Board — der Punkt steht im Arbeitsauftrag. ' +
  'Text setzen: node scripts/board.mjs queue <N> "<Text>".'

/** How much of the queue may be placeholder before it counts as a regression.
 *  A quarter is generous for a normal day — a handful of freshly appended points
 *  with no prose yet — and far below the 97 % the board actually reached. */
export const STUB_SHARE_CEILING = 0.25
/** …and how many may stand in a ROW. A run is what a reader hits: three stubs
 *  in sequence already reads as an empty board however good the rest is. */
export const STUB_RUN_CEILING = 3

// cp1252: byte → displayed char (the 0x80-0x9F block; every other byte shows
// its own code point). The detector uses it REVERSED.
const CP1252_HIGH = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
}
const CP1252_REVERSE = (() => {
  const rev = new Map()
  for (let b = 0; b < 0x100; b++) rev.set(String.fromCharCode(b), b)
  for (const [b, cp] of Object.entries(CP1252_HIGH)) rev.set(String.fromCharCode(cp), Number(b))
  return rev
})()

/**
 * Structural mojibake detector (Opus plan-review change 1): instead of a
 * substring blocklist, map each char back to its cp1252 byte and flag any spot
 * where a VALID UTF-8 multibyte sequence emerges — that shape only arises when
 * UTF-8 bytes were mis-read as cp1252 (the 24.07 damage hit umlauts, dashes,
 * quotes, the minus and pi signs and even the BOM). Legitimate content
 * (German text, typographic quotes, em dashes, middots, arrows, check marks,
 * emoji, a real U+FEFF BOM) never forms one: a single cp1252-mappable char is
 * never a LEAD followed by CONTINUATION-range chars.
 *
 * NOTE — no damaged sequence is written literally in this file: quoting one
 * would make the detector flag its own source (found in the 25.07 assurance
 * sweep). The test file builds its fixtures programmatically for the same
 * reason.
 */
export function looksDoubleEncoded(text) {
  const s = typeof text === 'string' ? text : ''
  const found = []
  for (let i = 0; i < s.length; i++) {
    const lead = CP1252_REVERSE.get(s[i])
    if (lead === undefined || lead < 0xc2 || lead > 0xf4) continue
    const need = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : 1
    let ok = true
    for (let k = 1; k <= need; k++) {
      const cont = CP1252_REVERSE.get(s[i + k])
      if (cont === undefined || cont < 0x80 || cont > 0xbf) {
        ok = false
        break
      }
    }
    if (!ok) continue
    found.push(s.slice(i, i + need + 1))
    i += need
  }
  return [...new Set(found)]
}

// ═══ Point 410 — the board must not lose its umlauts ═══
// The user reads the board as German prose on a phone, and "faellt weg" /
// "kuenftig" read as broken. The cause was the path the text took: `board.mjs`
// took a card's text as a command-line ARGUMENT, a Windows shell mangled the
// umlauts, and every session learned to transliterate by hand to stay safe. The
// stdin path (board-core `resolveCardText`) removes the reason; this rule
// removes the habit, because a workaround returns the moment the old path looks
// convenient again.
//
// A WORD LIST, deliberately: this is a spelling smell, not a linguistics
// problem. STEMS are matched anywhere in a word so compounds and inflections
// come along ("Ueberpruefung", "ausgefuehrt"), and every stem is long enough
// that legitimate text cannot contain it — the digraphs themselves are useless
// as a signal, since "Quelle", "Steuer" and "Aequator" all carry one. A false
// positive costs one word in this list; a false negative costs the reader.
export const TRANSLITERATION_STEMS = [
  // ae
  'faell', 'flaech', 'waehr', 'naechst', 'spaet', 'aender', 'erklaer', 'haett', 'waere', 'taeglich',
  'zusaetzlich', 'saemtlich', 'erwaehn', 'waehl', 'naeh', 'staerk', 'laeng', 'gemaess', 'raeum',
  'traeg', 'itaet', 'aehnlich', 'maessig', 'zaehl', 'erhaelt', 'behaelt',
  // ue
  'ueber', 'kuenft', 'zurueck', 'fuer', 'fuehr', 'fuehl', 'muess', 'stueck', 'gruen', 'wuerde',
  'wuensch', 'pruef', 'frueh', 'natuerlich', 'duerf', 'gueltig', 'schluessel', 'unterstuetz',
  'buend', 'kuerz', 'muend',
  // oe
  'oeffn', 'moeglich', 'koenn', 'hoech', 'groess', 'schoen', 'gehoer', 'erhoeh', 'noetig',
  'stoer', 'boes', 'oefter', 'loesch', 'loesung', 'zerstoer',
]

/**
 * Every transliterated German word in `text`, lower-cased and de-duplicated.
 * Total: a non-string yields none, so an unreadable board never throws.
 */
export function findTransliterations(text) {
  const s = typeof text === 'string' ? text : ''
  const hits = new Set()
  for (const word of s.match(/[A-Za-zÄÖÜäöüß]+/g) ?? []) {
    const lower = word.toLowerCase()
    if (TRANSLITERATION_STEMS.some((stem) => lower.includes(stem))) hits.add(lower)
  }
  return [...hits]
}

/** Slice the board into its <h2>-anchored sections: titles in document order
 *  plus each section's html (the last runs to EOF, footer included). */
export function sliceSections(html) {
  const order = []
  const sections = {}
  if (typeof html !== 'string') return { order, sections }
  const marks = []
  for (const m of html.matchAll(/<h2>([^<]*)<\/h2>/g)) marks.push({ title: m[1].trim(), at: m.index })
  for (let i = 0; i < marks.length; i++) {
    order.push(marks[i].title)
    sections[marks[i].title] = html.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : undefined)
  }
  return { order, sections }
}

/**
 * Parse one section's cards → [{open, meta, body, points}]. Point numbers come
 * from `.num` spans holding a PURE number (a "203A" sub-delivery `.num` is no
 * point) plus a leading `.t` number incl. the compound forms of the real board
 * ("287+288 —", "232·233·234 —", "71/72 —", "313: …") — Opus plan-review
 * hardening 6.
 */
export function parseCards(sectionHtml) {
  const cards = []
  if (typeof sectionHtml !== 'string') return cards
  // Split a compound point field into its numbers ("232·233·234", "92+94",
  // "71/72"); a sub-delivery marker ("203A", "CI", "✓") yields none. Bounded by
  // MAX_POINT so a date or a count in a title cannot pose as a point number.
  const MAX_POINT = 999
  const numbers = (raw) =>
    String(raw)
      .split(/[+·/\s]+/)
      .filter((n) => /^\d+$/.test(n) && Number(n) <= MAX_POINT)
      .map(Number)
  for (const part of sectionHtml.split(/<details/).slice(1)) {
    const summary = (part.match(/<summary>([\s\S]*?)<\/summary>/) ?? [])[1] ?? ''
    // A collapsible SECTION wrapper is not a card: its summary holds the <h2>
    // heading. Without this it would enter the PRECEDING section's card list as
    // a card with no point, no body and no duration meta — the slice ends AT
    // the <h2>, so the wrapper's opening tag falls just before the boundary and
    // its summary is cut open mid-tag. Hence both tests: an intact wrapper is
    // recognised by the heading, a cut one by the missing `</summary>`.
    if (/<h2[\s>]/.test(summary) || !part.includes('</summary>')) continue
    const meta = (summary.match(/class="meta">([^<]*)</) ?? [])[1] ?? null
    // The body slice must survive a container child, so take everything after
    // the body div's opening tag (the card ends at the next <details anyway).
    const body = ((part.match(/<div class="body[^"]*">([\s\S]*)$/) ?? [])[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const points = new Set()
    for (const m of summary.matchAll(/class="num">\s*([^<]*?)\s*</g)) for (const n of numbers(m[1])) points.add(n)
    // Leading title number(s), separated from the text by a dash or colon —
    // never a plain hyphen, which would read "2026-07-25 —" as point 2026.
    const t = (summary.match(/class="t">\s*([\d+·/ ]*\d)\s*[—–:]/) ?? [])[1]
    if (t) for (const n of numbers(t)) points.add(n)
    // The full title comes along so a violation can NAME the card it means; a
    // point number alone is no help on a card that has none.
    const title = ((summary.match(/class="t">([^<]*)</) ?? [])[1] ?? '').trim()
    cards.push({ meta, body, title, points: [...points] })
  }
  return cards
}

/**
 * The point-313 audit → violations [{code, msg}]; empty = consistent. `doneSeen`
 * is the baseline of done points already reviewed (persisted by the wrapper on
 * each CLEAN --synced); a non-array baseline skips the new-tick checks — the
 * wrapper seeds it on the first clean pass, so pre-guard history is
 * grandfathered exactly once.
 */
/**
 * Grace on the expected-end rule: a card is overdue only this many minutes
 * PAST its own estimate, so a board republished on the minute cannot flap.
 */
export const ETA_GRACE_MIN = 5

/**
 * HOW MUCH TIME MAY BE LEFT ON A PROMISE BEFORE IT IS FLAGGED (point 411).
 *
 * The past-due rule was one tick too late by construction: the card is already
 * WRONG when the guard speaks, and between two turn ends — half an hour while a
 * delegated agent builds — the reader sees a promise that expired long ago. The
 * user reported it three times in one night; measured then, two cards stood at
 * ~00:45 and ~00:17 while the clock read 01:52. So the comparison shifts: the
 * guard fires while the estimate still has less than this margin LEFT. Fifteen
 * minutes is the launcher's own tick width — the coarsest interval on this
 * machine at which anything happens by itself.
 */
export const ETA_MARGIN_MIN = 15

/** How often one card's estimate may be moved in a session before the guard says
 *  that the METHOD is the problem rather than the number. */
export const ETA_REVISION_LIMIT = 2

/** The rule an estimate must follow, in the words the remedy hands over. The
 *  estimates were optimistic EVERY time, which is the actual cause. */
export const ETA_RULE =
  'An estimate is the time by which the work will be VISIBLY DONE — merged, verified, board updated — ' +
  'not the time the current step might end.'

/**
 * A now-card meta → its promised end and its start, in minutes since midnight.
 * PURE, null when the meta names no `~HH:MM`.
 *
 * A card opened before midnight may legitimately estimate into the next day; an
 * end earlier than its own start is that case, not a past one, so the end wraps.
 */
export function etaMinutes(meta) {
  const end = /~\s*(\d{1,2}):(\d{2})/.exec(String(meta ?? ''))
  if (!end) return null
  const start = /(\d{1,2}):(\d{2})/.exec(String(meta ?? ''))
  let eta = Number(end[1]) * 60 + Number(end[2])
  const from = start ? Number(start[1]) * 60 + Number(start[2]) : null
  if (from !== null && eta < from) eta += 1440
  return { eta, start: from }
}

/**
 * IS THIS PROMISE STILL HONEST? PURE. Null when there is no estimate to judge.
 *
 * Returns { minutesLeft, state } with state 'ok' | 'soon' | 'past'.
 */
export function etaStatus({ meta, nowMinutes, marginMin = ETA_MARGIN_MIN, graceMin = ETA_GRACE_MIN } = {}) {
  if (!Number.isFinite(nowMinutes)) return null
  const parsed = etaMinutes(meta)
  if (!parsed) return null
  const minutesLeft = parsed.eta - nowMinutes
  if (parsed.eta + graceMin < nowMinutes) return { minutesLeft, state: 'past' }
  if (minutesLeft < marginMin) return { minutesLeft, state: 'soon' }
  return { minutesLeft, state: 'ok' }
}

/**
 * COUNT THE TIMES ONE CARD'S ESTIMATE MOVED IN THIS SESSION. PURE.
 *
 * `state` is the persisted dashboard state, `cards` the current now-cards. The
 * counter is per SESSION: a new session starts from zero, because the point of
 * the count is the estimating done in one sitting. Returns the patch to persist.
 */
export function etaRevisionPatch({ state = {}, sessionId = '', cards = [] } = {}) {
  const prior = state && typeof state.etaRevisions === 'object' && state.etaRevisions ? state.etaRevisions : {}
  const sameSession = prior.session === sessionId && sessionId !== ''
  const byPoint = sameSession && prior.byPoint && typeof prior.byPoint === 'object' ? { ...prior.byPoint } : {}
  const etas = sameSession && prior.etas && typeof prior.etas === 'object' ? { ...prior.etas } : {}
  for (const card of Array.isArray(cards) ? cards : []) {
    const parsed = etaMinutes(card?.meta)
    if (!parsed) continue
    for (const point of Array.isArray(card.points) ? card.points : []) {
      const key = String(point)
      const before = etas[key]
      if (Number.isFinite(before) && before !== parsed.eta) byPoint[key] = (Number(byPoint[key]) || 0) + 1
      etas[key] = parsed.eta
    }
  }
  return { etaRevisions: { session: sessionId, byPoint, etas } }
}

export function auditDashboard(html, input = {}) {
  const v = []
  if (typeof html !== 'string' || !html) return v
  // Totality: every list comes from JSON/parsers and may be anything.
  const { doneSeen = null, nowMinutes = null, etaRevisions = null } = input ?? {}
  const open = Array.isArray(input?.open) ? input.open : []
  const done = Array.isArray(input?.done) ? input.done : []
  const { order, sections } = sliceSections(html)

  // STRUCTURE — exactly the four binding sections, in order.
  if (order.length !== SECTION_TITLES.length || SECTION_TITLES.some((t, i) => order[i] !== t)) {
    v.push({
      code: 'structure',
      msg: `section headers are [${order.join(' | ') || '<none>'}] — the binding structure is [${SECTION_TITLES.join(' | ')}]`,
    })
  }

  // NO AUTO-OPEN — user mandate 23.07.2026 (dashboard-no-auto-open): no card
  // carries `open`; the localStorage script restores what the READER opened,
  // and a hardcoded attribute overrides that choice on every refresh.
  if (/<details[^>]*\sopen[\s>]/.test(html)) {
    v.push({
      code: 'auto-open',
      msg: 'a <details> carries the `open` attribute — all cards start closed (user mandate 23.07.2026)',
    })
  }

  // COLLAPSIBLE SECTION — user 26.07.2026: Erledigt collapses behind its own
  // heading and starts closed. The `open` ban above already covers "closed", so
  // this rule only pins that the wrapper still EXISTS: a republish that dropped
  // it would silently unfold the longest part of the board again.
  for (const title of COLLAPSIBLE_SECTIONS) {
    const wrapped = new RegExp(`<details\\b[^>]*>\\s*<summary>\\s*<h2>${title}</h2>\\s*</summary>`).test(html)
    if (!wrapped && html.includes(`<h2>${title}</h2>`)) {
      v.push({
        code: 'section-not-collapsible',
        msg: `the "${title}" heading is not wrapped in <details><summary><h2>…</h2></summary> — that section collapses behind its heading (user 26.07.2026)`,
      })
    }
  }

  // THE ARCHIVE STAYS OUT (user 27.07.2026): the board carries the newest
  // finished cards and links the rest. Both halves are checked — a board that
  // kept everything, and one that dropped the link and orphaned the archive.
  const erledigtSection = sections[SECTION_TITLES[3]] ?? ''
  const doneOnBoard = parseCards(erledigtSection).length
  if (doneOnBoard > ERLEDIGT_ON_BOARD) {
    v.push({
      code: 'erledigt-overflow',
      msg: `the Erledigt section holds ${doneOnBoard} cards — the board keeps ${ERLEDIGT_ON_BOARD}, the older ones move to the archive page`,
    })
  }
  if (doneOnBoard > 0 && !/<a\s[^>]*href="https?:\/\/[^"]+"[^>]*>/.test(erledigtSection)) {
    v.push({
      code: 'archive-link-missing',
      msg: 'the Erledigt section links no archive page — the moved cards would be unreachable',
    })
  }

  const nowCards = parseCards(sections[SECTION_TITLES[0]] ?? '')
  const vdzkCards = parseCards(sections[SECTION_TITLES[1]] ?? '')
  const queueCards = parseCards(sections[SECTION_TITLES[2]] ?? '')
  const erledigtCards = parseCards(sections[SECTION_TITLES[3]] ?? '')

  // THE STATUS CARRIES ITS DATE (user 27.07.2026): a current-work card says WHEN
  // its status was written, so a reader can tell a fresh assessment from one
  // that has stood for hours. The collapsed header keeps only start/expected
  // end; it is the status TEXT that ages, so the stamp belongs in the body.
  const undated = nowCards.filter((c) => !/\b\d{1,2}[:.]\d{2}\b/.test(c.body ?? '')).length
  if (undated) {
    v.push({
      code: 'now-card-undated',
      msg: `${undated} current-work card(s) carry no status time in the body — a status without its time cannot be judged for freshness`,
    })
  }

  // EMPTY BODY — a card must explain itself when expanded.
  const empty = [nowCards, vdzkCards, queueCards, erledigtCards].flat().filter((c) => !c.body).length
  if (empty) v.push({ code: 'empty-body', msg: `${empty} card(s) have an empty body` })

  // DUPLICATE NUMBER within one OPEN section (Erledigt is exempt — several
  // delivery cards for one point are legitimate history, e.g. point 206).
  for (const [name, cards] of [
    [SECTION_TITLES[0], nowCards],
    [SECTION_TITLES[1], vdzkCards],
    [SECTION_TITLES[2], queueCards],
  ]) {
    const seen = new Set()
    const dup = new Set()
    for (const c of cards) for (const n of c.points) (seen.has(n) ? dup : seen).add(n)
    if (dup.size) {
      v.push({ code: 'dup-in-section', msg: `point(s) ${[...dup].join(', ')} appear on more than one card in "${name}"` })
    }
  }

  // QUEUE META — every Warteschlange card names its estimated duration, or says
  // in so many words that it has none yet (point 400, delta C). The generator
  // emits a card for every open point, and a point nobody has estimated must
  // still be VISIBLE: dropping it is the staleness this whole point exists to
  // end, and blocking on it would deadlock `--synced` against a card only the
  // generator can produce. The exemption is a NAMED value, not a shape, so an
  // estimate that merely failed to parse is still a violation.
  const badQueue = queueCards.filter(
    (c) => !c.meta || (c.meta.trim() !== QUEUE_STUB_META && !/~\s*\d+([.,]\d+)?\s*h/.test(c.meta)),
  )
  if (badQueue.length) {
    v.push({
      code: 'queue-meta',
      msg: `${badQueue.length} Warteschlange card(s) lack a "~<n> h" duration meta (point(s) ${badQueue.flatMap((c) => c.points).join(', ') || '<none parseable>'})`,
    })
  }

  // A BOARD OF PLACEHOLDERS BREAKS NO OTHER RULE (point 419 d). When the queue
  // became a projection, the hand-written prose was never migrated into the data
  // file: 79 of 81 cards carried the stub body and not one an estimate — and
  // every check passed, because `queue-meta` exempts the stub by name and the
  // coverage rule only asks that each open point appear SOMEWHERE. The board was
  // formally perfect and materially empty, for hours, until the reader said so.
  // Counted rather than remembered: a share ceiling for the whole queue, and a
  // run ceiling because a reader meets consecutive cards, not an average.
  if (queueCards.length) {
    const isStub = (c) => (c.body ?? '').trim().startsWith(QUEUE_STUB_BODY.slice(0, 40))
    const stubs = queueCards.filter(isStub)
    let run = 0
    let longestRun = 0
    for (const c of queueCards) {
      run = isStub(c) ? run + 1 : 0
      if (run > longestRun) longestRun = run
    }
    const share = stubs.length / queueCards.length
    // AN ABSOLUTE FLOOR UNDER THE RATIO (second model's review of this rule).
    // A pure share fires on a SINGLE fresh point once the queue is short — 1 of
    // 3 is 33 % — and would then block every turn end over the first appended
    // point, in fully normal operation. Today's ~80 cards hide that; a shrinking
    // queue is certain. So a handful is always tolerable whatever the length,
    // and 79 of 81 is still caught on the first evaluation.
    const tooMany = stubs.length > Math.max(STUB_RUN_CEILING, Math.ceil(queueCards.length * STUB_SHARE_CEILING))
    if (tooMany || longestRun > STUB_RUN_CEILING) {
      v.push({
        code: 'queue-stubbed',
        msg:
          `${stubs.length} of ${queueCards.length} Warteschlange card(s) still carry the placeholder body ` +
          `(${Math.round(share * 100)} %, longest run ${longestRun}) — the queue reads as empty to whoever ` +
          'opens it. Write the prose: node scripts/board-queue.mjs set <N> "<Text>"',
      })
    }
  }

  // NOW META — the now-card names its start time.
  if (nowCards.length && nowCards.some((c) => !c.meta || !/\d{1,2}:\d{2}/.test(c.meta))) {
    v.push({ code: 'now-meta', msg: 'a now-card meta lacks a HH:MM time' })
  }

  // THE EXPECTED END STAYS AHEAD OF THE CLOCK (user 28.07.2026). The "~HH:MM"
  // in a current-work header is a promise to a reader who checks the board from
  // a phone; once it has passed, it is worse than no estimate, because the card
  // then reads as stalled while the work is running. Enforced rather than
  // reminded: the 388 card stood two hours past its estimate. `nowMinutes` is
  // injected (minutes since midnight, Europe/Berlin) so the rule is pure; a
  // caller that passes nothing skips it.
  // AND IT FIRES BEFORE THE PROMISE BREAKS (point 411): a card flagged only once
  // its estimate has PASSED is flagged one tick too late — it was already wrong
  // when the guard spoke, and the reader had been looking at it for half an hour.
  if (Number.isFinite(nowMinutes)) {
    const overdue = []
    const soon = []
    for (const c of nowCards) {
      const status = etaStatus({ meta: c.meta, nowMinutes })
      if (!status || status.state === 'ok') continue
      const named = c.points.length ? c.points : ['?']
      ;(status.state === 'past' ? overdue : soon).push(...named)
    }
    // A THIRD REVISION IS A SIGNAL ABOUT THE METHOD, not about the number: the
    // estimates were optimistic every single time, so the card that keeps being
    // moved gets that said with it.
    const revised = (points) => {
      const counts = (etaRevisions && etaRevisions.byPoint) || {}
      const hits = points.filter((p) => (Number(counts[String(p)]) || 0) > ETA_REVISION_LIMIT)
      return hits.length
        ? ` — the estimate for ${[...new Set(hits)].join(', ')} has been moved more than ${ETA_REVISION_LIMIT} times ` +
          'this session: the METHOD is off, not the number. Estimate the whole path to done, generously.'
        : ''
    }
    if (overdue.length) {
      v.push({
        code: 'now-eta-past',
        msg:
          `current-work card(s) ${overdue.join(', ')} promise an end time that has ALREADY PASSED — give each a ` +
          `realistic new "~HH:MM" (or move the card to Erledigt if it is done), republish, re-run --synced. ` +
          `${ETA_RULE}${revised(overdue)}`,
      })
    }
    if (soon.length) {
      v.push({
        code: 'now-eta-soon',
        msg:
          `current-work card(s) ${soon.join(', ')} promise an end time less than ${ETA_MARGIN_MIN} minutes away — ` +
          'the reader is about to be looking at a broken promise. Give each a realistic new "~HH:MM" (or move the ' +
          `card to Erledigt if it is done), republish, re-run --synced. ${ETA_RULE}${revised(soon)}`,
      })
    }
  }

  // NEWLY TICKED points need an Erledigt card, with a time meta (only vs the
  // doneSeen baseline — pre-guard history is grandfathered).
  if (Array.isArray(doneSeen)) {
    const seen = new Set(doneSeen.filter((n) => Number.isInteger(n)))
    const erledigtPoints = new Set(erledigtCards.flatMap((c) => c.points))
    const missing = done.filter((n) => !seen.has(n) && !erledigtPoints.has(n))
    if (missing.length) {
      v.push({ code: 'erledigt-missing', msg: `newly ticked point(s) ${missing.join(', ')} have NO Erledigt card` })
    }
    const newNoTime = erledigtCards.filter(
      (c) => c.points.some((n) => !seen.has(n) && done.includes(n)) && (!c.meta || !/\d{1,2}:\d{2}/.test(c.meta)),
    )
    if (newNoTime.length) {
      v.push({ code: 'erledigt-meta', msg: 'an Erledigt card for a newly ticked point lacks a time meta (start – end)' })
    }
  }

  // NO OPEN POINT IN ERLEDIGT (the 25.07 "open 306 under Erledigt" case).
  const erlSet = new Set(erledigtCards.flatMap((c) => c.points))
  const openInErl = open.filter((n) => erlSet.has(n))
  if (openInErl.length) {
    v.push({ code: 'open-in-erledigt', msg: `OPEN point(s) ${openInErl.join(', ')} have an Erledigt card` })
  }

  // ENCODING HEALTH — the 24.07 cp1252 double-encoding class.
  const moji = looksDoubleEncoded(html)
  if (moji.length) {
    v.push({
      code: 'mojibake',
      msg:
        `double-encoded sequence(s) found: ${moji.slice(0, 6).join(' ')}${moji.length > 6 ? ` … (+${moji.length - 6})` : ''} — repair the encoding. ` +
        'If a card DELIBERATELY quotes mojibake (a card about this very bug class), rephrase it ' +
        'without the literal sequence — quoting damaged bytes on the board is itself damage.',
    })
  }

  // THE UMLAUTS SURVIVE THE WAY IN (point 410). Checked over the CARDS, not the
  // raw file: the viewer's script, a URL or a CSS class is none of the reader's
  // business, and only prose can be transliterated.
  const transliterated = []
  for (const c of [nowCards, vdzkCards, queueCards, erledigtCards].flat()) {
    const hits = [...findTransliterations(c.title), ...findTransliterations(c.body)]
    if (hits.length) {
      transliterated.push(`"${c.title || c.points.join(', ') || '<untitled>'}" (${[...new Set(hits)].slice(0, 4).join(', ')})`)
    }
  }
  if (transliterated.length) {
    v.push({
      code: 'transliterated-umlaut',
      msg:
        `card(s) ${transliterated.slice(0, 4).join('; ')} spell German words with ae/ue/oe instead of ` +
        'ä/ö/ü — the reader sees that as broken text. Write the real umlauts and pass the text on ' +
        'stdin, where no shell can mangle it: node scripts/board.mjs status <N> --text-stdin',
    })
  }

  // FOOTER CURRENCY — the "N offene Punkte" figure must match TASKS.md.
  const foot = html.match(/(\d+)\s+offene Punkte/)
  if (foot && open.length && Number(foot[1]) !== open.length) {
    v.push({ code: 'footer-stale', msg: `the footer claims ${foot[1]} open points, TASKS.md has ${open.length}` })
  }

  return v
}

const block = (reason) => ({ decision: 'block', reason })
const ALLOW = { decision: 'allow' }

/**
 * Decide whether the turn may end. Inputs (all optional — missing data errs the
 * way each invariant documents):
 *   paused            .claude/batch-paused exists
 *   open, done        parsed TASKS point numbers
 *   marker            dashboard-state.json content (or null)
 *   markerFileExists  the registered dashboardPath resolves to a real file
 *   head, html        current git HEAD; registered dashboard file content
 *   repoHash          sha256 of the registered dashboard file (null: unreadable)
 *   focus             current-focus.json content (or null)
 *   pending           focus-check-pending.json content (or null)
 *   sessionId         this session's id (from the hook's stdin JSON)
 *   lastToolAt        last tool call of THIS session (0: none known)
 *   now, freshMs      clock + focus-freshness window override
 */
export function evaluate(input) {
  const {
    paused = false,
    open = [],
    done = [],
    marker = null,
    markerFileExists = false,
    head = '',
    html = null,
    repoHash = null,
    focus = null,
    pending = null,
    sessionId = '',
    lastToolAt = 0,
    now = Date.now(),
    freshMs = FOCUS_FRESH_MS,
    nowCardHash = null,
    nowMinutes = null,
  } = input ?? {}

  // Batch paused or complete: no dashboard duty in flight.
  if (paused) return ALLOW
  if (!Array.isArray(open) || open.length === 0) return ALLOW

  // (1) REGISTERED — a session without a registered, existing dashboard file
  // must set one up before it may end a turn.
  if (!marker || !marker.dashboardPath || !markerFileExists) {
    return block(
      'BATCH DASHBOARD NOT REGISTERED. Bring all four dashboard sections in line with the real ' +
        'state, publish (node scripts/dashboard-publish.mjs, then the Artifact tool), declare your ' +
        'focus (node scripts/focus.mjs set <N> "<what>"), then run: node scripts/dashboard-guard.mjs ' +
        `--synced <dashboard.html path>. Open points: ${open.join(', ')}.`,
    )
  }

  // (2) FRESHNESS — a moved HEAD means work happened since the last review.
  if (head && marker.head && head !== marker.head) {
    return block(
      `BATCH DASHBOARD OUT OF DATE: HEAD moved to ${head.slice(0, 7)} since the dashboard was ` +
        `last reviewed (${String(marker.head).slice(0, 7)}). Review ALL FOUR sections against the ` +
        'current state (now-card, queue order, Erledigt), republish (dashboard-publish.mjs + ' +
        'Artifact), then run: node scripts/dashboard-guard.mjs --synced ' + marker.dashboardPath + '.',
    )
  }

  const queued = parseQueuePoints(html)
  const nowPoints = parseNowCardPoints(html)
  const klaerung = parseKlaerungPoints(html)

  // (3) NO STALE QUEUE ITEM — a ticked point must not still sit in the Warteschlange.
  const stale = done.filter((n) => queued.has(n))
  if (stale.length) {
    return block(
      `BATCH DASHBOARD STALE: point(s) ${stale.join(', ')} are ticked done in TASKS.md but still ` +
        'listed in the dashboard Warteschlange. Move them to Erledigt, republish, then re-run --synced.',
    )
  }

  // (4) COMPLETENESS — every open point is visible: queue, one of the
  // now-cards' own titles, or a "Von dir zu klären" card (a point blocked on
  // the user lives ONLY there — see 4c).
  const missing = open.filter((n) => !nowPoints.has(n) && !queued.has(n) && !klaerung.has(n))
  if (missing.length) {
    return block(
      `BATCH DASHBOARD INCOMPLETE: open TASKS point(s) ${missing.join(', ')} appear in NEITHER the ` +
        'Warteschlange nor the now-card nor "Von dir zu klären". Add every open point to the ' +
        'dashboard (an ongoing/umbrella point still gets a queue card), republish, then re-run --synced.',
    )
  }

  // (4b) NO DOUBLE-LISTING — no now-card's own point may ALSO sit in the
  // Warteschlange. A now-card point is "current work", not a pending queue
  // item; listing it in both reads as simultaneously in-progress AND waiting.
  // Observed 22.07.2026: point 214 stood in the now-card and the queue at once
  // (user-reported inconsistency). Enforced over EVERY now-card so the
  // contradiction cannot recur under parallel work either.
  const doubled = [...nowPoints].filter((n) => queued.has(n))
  if (doubled.length) {
    return block(
      `BATCH DASHBOARD DOUBLE-LISTS point(s) ${doubled.join(', ')}: BOTH a now-card ("Woran ich ` +
        'gerade arbeite") AND a Warteschlange card. A current-work point must appear ONLY as a ' +
        'now-card — delete its Warteschlange card, republish (dashboard-publish.mjs + Artifact), then ' +
        're-run --synced.',
    )
  }

  // (4c) ONE SECTION PER POINT — a point number may appear in AT MOST ONE of
  // the three open sections (now-cards, Warteschlange, "Von dir zu klären"),
  // and a DONE point in none of them. (3) polices done∈queue and (4b)
  // now∈queue; this adds every "Von dir zu klären" overlap: a point that is
  // queued as pending work, or has a now-card of its own, or is ticked
  // done, is not (purely) "waiting on the user" — its VDZK card is stale or
  // the point is double-listed. User-reported twice for the answered-question
  // case (the card lingered after work resumed) and once for point 206
  // standing in the Warteschlange AND under "Von dir zu klären" at once.
  const klaerungOverlaps = [...klaerung]
    .map((n) => {
      const also = []
      if (queued.has(n)) also.push('Warteschlange')
      if (nowPoints.has(n)) also.push('now-card')
      if (done.includes(n)) also.push('ticked done')
      return also.length ? `${n} (also: ${also.join(' + ')})` : null
    })
    .filter(Boolean)
  if (klaerungOverlaps.length) {
    return block(
      `BATCH DASHBOARD DOUBLE-LISTS "VON DIR ZU KLÄREN" point(s) ${klaerungOverlaps.join('; ')}. ` +
        'A point belongs in exactly ONE section: blocked on the user → ONLY under "Von dir zu ' +
        'klären" (delete its Warteschlange card); being worked → the now-card (delete its VDZK ' +
        'card); done → only Erledigt. Fix the card(s), republish (dashboard-publish.mjs + ' +
        'Artifact), then re-run --synced.',
    )
  }

  // (5) FOCUS DECLARED — the machine cannot know what you are doing; you must
  // SAY it, so the card can be held against the declaration.
  if (!focus || (focus.point == null && !focus.note)) {
    return block(
      'CURRENT FOCUS NOT DECLARED. Declare what you are working on RIGHT NOW: node scripts/focus.mjs ' +
        'set <pointNumber> "<one line>" ("-" for non-point work such as a closing cycle). The dashboard ' +
        'now-card must name the same work; update + republish it first if it does not.',
    )
  }

  // (6) NOW-CARD == FOCUS — the exact 200-vs-210 slip: the declared focus
  // point must be AMONG the now-card title points (with parallel work the
  // section holds several cards; the focus names the one being driven RIGHT
  // NOW, not necessarily the first). (A null focus point — non-point work —
  // skips the membership check; the pivot ritual in (7) still applies.)
  if (focus.point != null && !nowPoints.has(focus.point)) {
    return block(
      `DASHBOARD NOW-CARD OUT OF SYNC WITH THE DECLARED FOCUS: the now-card(s) are titled point(s) ` +
        `${nowPoints.size ? [...nowPoints].join(', ') : '<none parseable>'} but the declared focus is ` +
        `${focus.point} ("${focus.note ?? ''}"). ` +
        'Reconcile NOW: if the work really moved, add/rewrite the now-card (and queue), republish ' +
        '(dashboard-publish.mjs + Artifact) and re-run --synced; if the declaration is the stale side, ' +
        'run node scripts/focus.mjs set <N> "<what>".',
    )
  }

  // (7) PIVOT RECONCILE — every user prompt may have pivoted the work (the
  // 200→210 pivot came from a user question). The UserPromptSubmit hook arms
  // this marker; the turn may not end until the focus was explicitly confirmed
  // or re-set (focus.mjs confirm/set, or a full --synced review). Only THIS
  // session's marker binds — a parallel chat window is not dragged in.
  if (pending && (!pending.sessionId || !sessionId || pending.sessionId === sessionId)) {
    return block(
      'FOCUS RECONCILE REQUIRED: a user prompt arrived this turn and may have changed what you are ' +
        'working on. Check the dashboard now-card against what you are ACTUALLY doing right now, then ' +
        'acknowledge: node scripts/focus.mjs confirm (unchanged) — or node scripts/focus.mjs set <N> ' +
        '"<what>" plus a now-card update + republish + --synced (changed). Enforced because reminders ' +
        'alone repeatedly failed.',
    )
  }

  // (8) FOCUS FRESHNESS — a long stretch of tool work with no re-affirmation
  // means the card's status may have drifted. Re-affirm at most every freshMs
  // while actually working (no nag on idle/pure-chat stretches).
  const confirmedAt = Number(focus.confirmedAt ?? focus.setAt ?? 0)
  if (lastToolAt > confirmedAt && now - confirmedAt > freshMs) {
    const min = Math.round((now - confirmedAt) / 60000)
    return block(
      `FOCUS RE-AFFIRMATION REQUIRED: ~${min} min of work since the focus/now-card was last ` +
        'confirmed. Verify the now-card still shows the live sub-state (fresh "Status (Stand HH:MM)" ' +
        'line) — refresh + republish + --synced if not — then run node scripts/focus.mjs confirm.',
    )
  }

  // (8c) NOW-CARD TEXT ACTUALLY REWRITTEN (user 25.07.2026: "the dashboard is
  // completely out of date — always write what you are doing RIGHT NOW, short and
  // high-level"). Invariant (6) only pins the card's POINT NUMBER against the
  // declared focus and (8) only asks for a re-affirmation, so a card could keep a
  // stale BODY through hours of work while every check passed — `focus.mjs
  // confirm` alone satisfied them. This one is about the prose: once real work has
  // happened since the last review, the card's body must have CHANGED (its hash
  // recorded at --synced), not merely been confirmed. It never fires on a quiet
  // stretch — only when tool work followed the last review.
  if (marker.nowCardHash && nowCardHash && marker.nowCardHash === nowCardHash) {
    const reviewedAt = Number(marker.syncedAt ?? 0)
    if (lastToolAt > reviewedAt && now - reviewedAt > freshMs) {
      const min = Math.round((now - reviewedAt) / 60000)
      return block(
        `NOW-CARD TEXT UNCHANGED THROUGH ~${min} min OF WORK: the "Woran ich gerade arbeite" body is ` +
          'byte-identical to the one reviewed last time, so it cannot be describing what you are doing ' +
          'RIGHT NOW. Rewrite it SHORT and HIGH-LEVEL — the live sub-state in one or two sentences ' +
          '("Stand HH:MM: …"), no history, no plan — then republish (dashboard-publish.mjs + Artifact) ' +
          'and re-run --synced. Confirming the focus alone does NOT satisfy this: the text itself is ' +
          'the deliverable.',
      )
    }
  }

  // (8b) FULL-CONSISTENCY AUDIT (point 313) — evaluated BEFORE the publish
  // check (fix first, publish once). A logged waiver covers exactly ONE file
  // hash: any further edit re-arms the audit.
  const violations = auditDashboard(html, {
    open,
    done,
    doneSeen: marker.doneSeen,
    nowMinutes,
    // The per-session revision count the attestation persists (point 411) — and
    // only for THIS sitting (four-eyes review 30.07.2026): a new session would
    // otherwise inherit the previous one's over-limit counts until its first
    // clean attestation, and the "your METHOD is off" sentence would be about
    // somebody else's estimating.
    etaRevisions:
      marker.etaRevisions && marker.etaRevisions.session === sessionId ? marker.etaRevisions : null,
  })
  if (violations.length) {
    const waived = marker.auditWaived && repoHash && marker.auditWaived.repoHash === repoHash
    if (!waived) {
      const shown = violations.slice(0, 5).map((x) => `[${x.code}] ${x.msg}`)
      const more = violations.length > 5 ? ` — and ${violations.length - 5} more` : ''
      return block(
        `DASHBOARD CONSISTENCY AUDIT FAILED: ${shown.join('; ')}${more}. Fix the board, republish ` +
          '(dashboard-publish.mjs + Artifact), then re-run --synced (it refuses to attest while the ' +
          'audit fails). Emergency only: node scripts/dashboard-guard.mjs --waive-audit "<reason>".',
      )
    }
  }

  // (9) PUBLISHED — "I updated the file" must not masquerade as "it is live".
  // The repo dashboard's bytes must equal the content last handed to the
  // Artifact tool (recorded automatically by the PostToolUse heartbeat), or be
  // covered by an explicit, logged deferral (headless sessions without the
  // Artifact tool). An unreadable repo file yields repoHash null → skip
  // (fail-open; invariant 1 already covers a missing file).
  if (repoHash) {
    const deferred = marker.publishDeferred
    // EITHER transport counts (point 400, delta D): the pages push is a real
    // publish of the same bytes, and it is the one every session can run.
    const covered =
      (marker.publishedHash && marker.publishedHash === repoHash) ||
      (marker.pagesPublishedHash && marker.pagesPublishedHash === repoHash) ||
      (deferred && deferred.repoHash === repoHash)
    if (!covered) {
      return block(
        'DASHBOARD EDITED BUT NOT REPUBLISHED: the repo dashboard file does not match the content ' +
          'last published to the live page or via the Artifact tool' +
          (marker.publishedHash || marker.pagesPublishedHash ? '' : ' (no publish recorded yet)') +
          '. Publishing is part of EVERY dashboard update: run node scripts/board-publish.mjs, which ' +
          'pushes the board to the live page and works in every session. The claude.ai mirror is still ' +
          'kept alongside it: node scripts/dashboard-publish.mjs, publish the synced scratchpad file ' +
          'with the Artifact tool (same artifact url), then re-run --synced. ONLY if NEITHER is ' +
          'reachable (offline): node scripts/dashboard-publish.mjs --defer "<reason>" — and publish at ' +
          'the first chance.',
      )
    }
  }

  return ALLOW
}
