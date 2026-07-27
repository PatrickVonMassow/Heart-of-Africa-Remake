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
  const head = '<summary><h2>Woran ich gerade arbeite</h2></summary>'
  const at = out.indexOf(head)
  if (at < 0) throw new Error('board: current-work section not found')
  const end = out.indexOf('\n</details>\n<details class="sect">', at)
  if (end < 0) throw new Error('board: current-work section has no end')
  return out.slice(0, end + 1) + now + out.slice(end + 1)
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
