// Pure half of the board command (point 372): the card edit, so the markup the
// board guard accepts is pinned by tests rather than by the shape of one
// regex written once. The wrapper does the I/O.

/** Berlin wall clock — the stamp every status carries (point 371). */
export function berlinStamp(now = new Date()) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)
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
 */
export function toQueue(html, point, { text, estimate } = {}) {
  const card = nowCard(html, point)
  if (!card) throw new Error(`board: no current-work card for point ${point}`)
  const body = text?.trim() || statusOf(card)
  if (!body) throw new Error('board: refusing to queue a card with an empty body')
  const hours = spanHours(metaOf(card))
  const meta = estimate ?? (hours == null ? null : hoursLabel(hours))
  const title = titleOf(card).replace(new RegExp(`^${point}\\s*—\\s*`), '')
  const entry =
    `<details>\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
    (meta ? `<span class="right"><span class="meta">${meta}</span></span>` : '') +
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
