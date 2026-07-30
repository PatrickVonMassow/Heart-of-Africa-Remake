// Out-of-band notification channel (Fable-5 audit finding D — the design could
// detect a DEAD session but not a SICK one, and had no way to TELL anyone). A
// plain HTTPS POST to ntfy.sh reaches the user's phone with NO auth and NO
// claude.ai connection — so it works headless in `claude -p` AND from the OS
// launcher itself, which runs precisely when Claude cannot. Subscribe once on
// the phone: open https://ntfy.sh/<TOPIC> or the ntfy app → subscribe to <TOPIC>.
//
// Usage: node scripts/notify.mjs "<title>" "<message>" [priority]
//    or: import { notify } from './notify.mjs'; await notify(title, message)
// Silent no-op if disabled (delete .claude/ntfy-topic to turn off).
//
// Since point 434 every alert climbs the ESCALATION LADDER first — see notify()
// below and scripts/alert-escalation.mjs. HOA_ALERT_ESCALATION=off disables it.
import { readFileSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'

// The topic is a shared secret in the URL — anyone who knows it can read/post.
// Kept in a gitignored file so it is easy to rotate and never committed.
const TOPIC_FILE = repoPath('.claude/ntfy-topic')

export function ntfyTopic() {
  try {
    const t = readFileSync(TOPIC_FILE, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

/**
 * Send an alert — through the ESCALATION LADDER (point 434).
 *
 * A repeated IDENTICAL alert no longer repeats identically: it backs off with a
 * rising interval and a rising priority, and its last rung PAUSES the batch with
 * a board card, because an alert can be slept through and a paused batch cannot.
 * The decision is `scripts/alert-escalation-core.mjs`; the state, the pause and
 * the card are `scripts/alert-escalation.mjs`, imported LAZILY so this module
 * stays a two-import leaf for every caller — and so a test that imports `notify`
 * never drags in the batch-lock path that throws under a test runner.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.key]       an explicit ladder key; else derived from
 *                                   title+message with digit runs collapsed, so
 *                                   "stalled for 121 min" and "…151 min" are ONE
 *                                   climbing alert rather than two fresh ones.
 * @param {boolean} [opts.escalate]  false sends unthrottled — for the rare alert
 *                                   whose every repetition is genuinely news.
 * @returns {Promise<boolean>} true when the message went out. FALSE also means
 *          "held back by the ladder", not only "failed"; the ladder log
 *          (.claude/alert-escalation.log) says which of the two it was.
 */
export async function notify(title, message, priority = 'default', { key = null, escalate: useLadder = true } = {}) {
  const topic = ntfyTopic()
  if (!topic) return false // channel not configured — silent
  let effectivePriority = priority
  if (useLadder) {
    try {
      const { escalate } = await import('./alert-escalation.mjs')
      const verdict = await escalate({ title, message, key, priority })
      if (!verdict.deliver) return false
      if (verdict.priority) effectivePriority = verdict.priority
    } catch {
      // FAIL-OPEN = DELIVER: a broken ladder must never swallow an alert.
    }
  }
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: `HoA batch: ${title}`, Priority: String(effectivePriority), Tags: 'robot' },
      body: String(message).slice(0, 3500),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch {
    return false // never let a notification failure break anything
  }
}

// CLI form.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('notify.mjs')) {
  const [, , title = 'ping', message = '', priority = 'default'] = process.argv
  notify(title, message, priority).then((ok) => {
    console.log(ok ? 'notified' : 'not sent (no topic configured or send failed)')
    process.exit(0)
  })
}
