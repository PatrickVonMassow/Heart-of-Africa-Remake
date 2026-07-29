// THE SHARED SECRET OF THE CHAT CHANNEL — read it, or make one.
//
//   node scripts/chat-secret.mjs            # print the secret and the setup steps
//   node scripts/chat-secret.mjs --init     # create one if none exists, then print it
//   node scripts/chat-secret.mjs --rotate   # replace it (both sides must be re-paired)
//   node scripts/chat-secret.mjs --topics   # also print the derived topic names
//
// The secret lives in .claude/chat-secret, which is git-IGNORED. It is the only
// thing that stands between the public board page and a session that runs with
// permissions pre-granted, so it is never committed, never echoed into a tracked
// file, and never written into the published HTML. The derived TOPIC NAMES are
// just as sensitive — knowing one is enough to read or post — which is why they
// are printed only on request and only to this terminal.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { deriveTopics } from './chat-core.mjs'

export const SECRET_PATH = repoPath('.claude', 'chat-secret')

/** The secret, or null. Trimmed — a trailing newline from an editor is not part
 *  of it, and the browser side trims too, so both derive the same topics. */
export function readSecret(path = SECRET_PATH) {
  try {
    const s = readFileSync(path, 'utf8').trim()
    return s || null
  } catch {
    return null
  }
}

/** 160 bits, base32-ish and hyphenated: long enough to be unguessable, short
 *  enough to retype on a phone keyboard without a mistake. */
export function generateSecret(bytes = randomBytes(20)) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789' // no l/i/o/0/1 — they misread
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  return chars.replace(/(.{5})(?=.)/g, '$1-')
}

/** Create the secret if there is none. Returns { secret, created }. */
export function ensureSecret(path = SECRET_PATH) {
  const existing = readSecret(path)
  if (existing) return { secret: existing, created: false }
  const secret = generateSecret()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${secret}\n`, { encoding: 'utf8', mode: 0o600 })
  return { secret, created: true }
}

if (process.argv[1] && process.argv[1].endsWith('chat-secret.mjs')) {
  const args = process.argv.slice(2)
  if (args.includes('--rotate')) {
    writeFileSync(SECRET_PATH, `${generateSecret()}\n`, { encoding: 'utf8', mode: 0o600 })
    console.log('rotated — the phone must be re-paired with the new secret below.\n')
  }
  const { secret, created } = ensureSecret()
  if (created) console.log('created .claude/chat-secret\n')
  console.log(`chat secret: ${secret}\n`)
  if (args.includes('--topics')) {
    const t = await deriveTopics(secret)
    console.log(`inbox  (phone -> agent): ${t.inbox}`)
    console.log(`outbox (agent -> phone): ${t.outbox}`)
    console.log('KEEP THESE OFF ANY PUBLIC PAGE — the topic name IS the access.\n')
  }
  console.log('On the phone: open the board, expand "Nachricht an den Agenten",')
  console.log('paste the secret once. It stays in that browser and is never sent anywhere.')
}
