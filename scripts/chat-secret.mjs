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

/** The machine-readable name of the one chat fault that must leave the machine
 *  out of band. The inbox tick puts it in its `fault` field and the launcher
 *  matches on THAT rather than on the wording of a reason string — a report the
 *  user never gets because a sentence was rephrased is the failure this whole
 *  point is about. */
export const SECRET_FAULT = 'secret-unreadable'

/**
 * ABSENT IS NOT THE SAME AS UNREADABLE. PURE — the caller does the I/O and hands
 * over what it got.
 *
 * The channel is opt-in: on a machine that never paired a phone there is simply
 * no secret file, and silence is the correct behaviour. But every OTHER way the
 * read can fail — a permission error, a directory where the file should be, a
 * file that exists and holds nothing (an interrupted write, a truncation) — is a
 * FAULT: the topics cannot be derived, so every message the user sends is dropped
 * before it is even parsed, and the two states used to be indistinguishable
 * because both answered `null`. That is a channel that fails silently in exactly
 * the shape it exists to prevent, so the reader now says which of the two it is
 * and the launcher reports the second.
 *
 * Returns { state: 'ok' | 'absent' | 'unreadable', secret, reason }.
 */
export function classifySecret({ error = null, raw = null } = {}) {
  if (error) {
    const code = error.code ?? null
    if (code === 'ENOENT') return { state: 'absent', secret: null, reason: null }
    return { state: 'unreadable', secret: null, reason: `${code ?? 'read failed'}: ${error.message ?? String(error)}` }
  }
  const secret = String(raw ?? '').trim()
  // An EXISTING but empty file is the truncated-write case, not an unpaired
  // machine: `ensureSecret` never writes an empty secret, so nothing legitimate
  // produces this state.
  if (!secret) return { state: 'unreadable', secret: null, reason: 'the secret file is empty' }
  return { state: 'ok', secret, reason: null }
}

/** `classifySecret` against the real file. TOTAL — never throws. */
export function readSecretStatus(path = SECRET_PATH) {
  try {
    return classifySecret({ raw: readFileSync(path, 'utf8') })
  } catch (e) {
    return classifySecret({ error: e })
  }
}

/** The secret, or null. Trimmed — a trailing newline from an editor is not part
 *  of it, and the browser side trims too, so both derive the same topics.
 *  Callers that must tell "not configured" from "broken" use `readSecretStatus`. */
export function readSecret(path = SECRET_PATH) {
  return readSecretStatus(path).secret
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
