// Pure half of the board command (point 372): the card edit, so the markup the
// board guard accepts is pinned by tests rather than by the shape of one
// regex written once. The wrapper does the I/O.
//
// The one import is the auditor's OWN name for "no estimate yet": a card this
// module writes must satisfy the audit that reads it, and spelling that value a
// second time here is how the two would drift apart. dashboard-guard-core
// imports nothing, so the direction cannot become a cycle.
import { QUEUE_STUB_META } from './dashboard-guard-core.mjs'

/** The flag that takes a card's text from STDIN instead of the argv (point 410). */
export const TEXT_STDIN_FLAG = '--text-stdin'

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
  const rest = list.filter((w) => w !== TEXT_STDIN_FLAG)
  if (rest.length === list.length) return rest.join(' ')
  if (rest.length) {
    throw new Error(`board: ${TEXT_STDIN_FLAG} takes the WHOLE text — drop the argument text ("${rest.join(' ')}")`)
  }
  // Normalise the line ending a Windows pipe adds and the trailing newline every
  // heredoc carries; the text itself is passed through untouched.
  const text = (typeof stdinText === 'string' ? stdinText : '').replace(/\r\n/g, '\n').trim()
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
  return html.replace(m[0], `<footer>${segments.join(' · ')}</footer>`)
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
  let out = html.replace(card, '')
  const now =
    `<details class="now">\n  <summary><span class="t">${point} — ${title}</span>` +
    `<span class="right"><span class="meta">${times ?? stamp}</span></span></summary>\n` +
    `  <div class="body">\n    <p><span class="stamp">Stand ${stamp}</span> ${status}</p>\n  </div>\n</details>\n`
  // At the TOP of the section, not the bottom: the focus guard reads the FIRST
  // now-card, so the point just taken up must lead — otherwise declaring focus
  // on it immediately contradicts the board and blocks the turn.
  const head = '<summary><h2>Woran ich gerade arbeite</h2></summary>'
  const at = out.indexOf(head)
  if (at < 0) throw new Error('board: current-work section not found')
  const from = at + head.length
  return `${out.slice(0, from)}\n${now}${out.slice(from).replace(/^\n/, '')}`
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

/** The current-work card for `point`, or null. */
export function nowCard(html, point) {
  const re = new RegExp(
    `<details class="now">\\s*<summary><span class="t">${point} —[\\s\\S]*?</details>\\s*`,
  )
  const m = String(html ?? '').match(re)
  return m ? m[0] : null
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

const titleOf = (card) => (card.match(/<span class="t">([^<]*)<\/span>/) ?? [])[1] ?? ''
const metaOf = (card) => (card.match(/<span class="meta">([^<]*)<\/span>/) ?? [])[1] ?? ''
/** The card's last status text, stamp span stripped — what a move carries over. */
const statusOf = (card) => {
  const paras = [...card.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => p[1])
  const last = paras[paras.length - 1] ?? ''
  return last.replace(/<span class="stamp">[^<]*<\/span>\s*/, '').trim()
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
  if (!card) throw new Error(`board: no current-work card for point ${point}`)
  const body = text?.trim() || statusOf(card)
  if (!body) throw new Error('board: refusing to queue a card with an empty body')
  const hours = spanHours(metaOf(card))
  const meta = estimate ?? (hours == null ? QUEUE_STUB_META : hoursLabel(hours))
  const title = titleOf(card).replace(new RegExp(`^${point}\\s*—\\s*`), '')
  const entry =
    `<details>\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
    `<span class="right"><span class="meta">${meta}</span></span>` +
    `</summary>\n  <div class="body">\n    <p>${body}</p>\n  </div>\n</details>\n`
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
  const title = titleOf(card).replace(new RegExp(`^${point}\\s*—\\s*`), '')
  const entry =
    `<details>\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
    `<span class="right"><span class="meta">${start} · ${end}</span></span></summary>\n` +
    `  <div class="body">\n    <p>${body}</p>\n  </div>\n</details>\n`
  const out = html.replace(card, '')
  const { from } = sectionBounds(out, 'done')
  return `${out.slice(0, from)}\n${entry}${out.slice(from).replace(/^\n/, '')}`
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
  const re = new RegExp(
    `(<summary><span class="t">${point} —[\\s\\S]*?<div class="body">)[\\s\\S]*?(</div>\\s*</details>)`,
  )
  if (!re.test(html)) throw new Error(`board: no current-work card for point ${point} — add the card first`)
  const body = `    <p><span class="stamp">Stand ${stamp}</span> ${text}</p>`
  return html.replace(re, `$1\n${body}\n  $2`)
}
