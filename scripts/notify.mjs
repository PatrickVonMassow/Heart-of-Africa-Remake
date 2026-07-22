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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The topic is a shared secret in the URL — anyone who knows it can read/post.
// Kept in a gitignored file so it is easy to rotate and never committed.
const TOPIC_FILE = fileURLToPath(new URL('../.claude/ntfy-topic', import.meta.url))

export function ntfyTopic() {
  try {
    const t = readFileSync(TOPIC_FILE, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

export async function notify(title, message, priority = 'default') {
  const topic = ntfyTopic()
  if (!topic) return false // channel not configured — silent
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: `HoA batch: ${title}`, Priority: String(priority), Tags: 'robot' },
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
