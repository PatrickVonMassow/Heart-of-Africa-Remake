// THE WRITER HALF — and the one distinction inside it.
//
// Not everything the machine posts to the phone is an ANSWER. `sendReply` is an
// agent answering, and it leaves the receipt the watcher reads as evidence that
// the user's message was dealt with. `postOutbox` is the bare post, used by the
// launcher's inbox tick for a DROP NOTICE — a receipt for one of those would tell
// the watcher a message had been answered when nobody had answered it, and the
// message would be marked consumed and lost (see `ackPlan`).
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { RECEIPT_PATH, postOutbox, readReplyReceipt, sendReply } from './chat-reply.mjs'
import { TEST_VECTOR, parseEnvelope, verifyMessage } from './chat-core.mjs'

const secret = TEST_VECTOR.secret
const NOW = 1_700_000_000_000

const dirs = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'hoa-chat-reply-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A transport that records what it was handed and answers as told. */
const recorder = (ok = true, status = 200) => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return { ok, status }
  }
  return { calls, fetchImpl }
}

describe('postOutbox — a signed envelope for the phone', () => {
  it('posts to the OUTBOX topic, signed for the outbox direction', async () => {
    const { calls, fetchImpl } = recorder()
    const r = await postOutbox({ secret, text: 'hallo', id: 'r1', ts: NOW, fetchImpl })
    expect(r).toEqual({ ok: true, status: 200, id: 'r1' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain(TEST_VECTOR.outbox)
    expect(calls[0].url).not.toContain(TEST_VECTOR.inbox)

    const parsed = parseEnvelope(calls[0].init.body)
    expect(parsed.ok).toBe(true)
    const { id, ts, text, sig } = parsed.envelope
    await expect(verifyMessage(secret, { direction: 'outbox', id, ts, text }, sig)).resolves.toBe(true)
    // And NOT for the inbox — that separation is what stops an agent message
    // being replayed as the user's own words.
    await expect(verifyMessage(secret, { direction: 'inbox', id, ts, text }, sig)).resolves.toBe(false)
  })

  it('writes NO receipt — asserted against the path that could ACTUALLY be written', async () => {
    // A temp path would be a TAUTOLOGY (four-eyes finding F2): `postOutbox` has
    // no receipt parameter, so a temp file was never a candidate, and the case
    // would still pass if a refactor made it write the REAL receipt. The real
    // one is therefore what is watched — snapshotted before and after, and left
    // exactly as it was found, present or absent.
    const existedBefore = existsSync(RECEIPT_PATH)
    const before = readReplyReceipt(RECEIPT_PATH)
    const { fetchImpl } = recorder()
    await postOutbox({ secret, text: 'Zustellung fehlgeschlagen: …', id: 'drop-notice-1', ts: NOW, fetchImpl })
    expect(existsSync(RECEIPT_PATH)).toBe(existedBefore)
    expect(readReplyReceipt(RECEIPT_PATH)).toEqual(before)
    // And whatever this machine happens to hold, it is not what was just posted.
    expect(readReplyReceipt(RECEIPT_PATH)?.id ?? null).not.toBe('drop-notice-1')
  })

  it('is the call the INBOX TICK makes — the notice never travels through sendReply', () => {
    const inbox = readFileSync(resolve(process.cwd(), 'scripts/chat-inbox.mjs'), 'utf8')
    expect(inbox).toMatch(/import \{ postOutbox \} from '\.\/chat-reply\.mjs'/)
    expect(inbox).toMatch(/\bpostOutbox\(/)
    // Prose may NAME it (the comment explains why it is not used); code may not
    // CALL it.
    expect(inbox).not.toMatch(/\bsendReply\s*\(/)
  })

  it('reports a refused post rather than throwing', async () => {
    const { fetchImpl } = recorder(false, 429)
    await expect(postOutbox({ secret, text: 'x', id: 'r2', ts: NOW, fetchImpl })).resolves.toMatchObject({
      ok: false,
      status: 429,
    })
  })
})

describe('sendReply — an answer, and the receipt that proves it', () => {
  it('records the receipt for a send the transport accepted', async () => {
    const receiptPath = join(tmp(), 'receipt.json')
    const { fetchImpl } = recorder()
    const r = await sendReply({ secret, text: 'kurze Antwort', id: 'a1', ts: NOW, fetchImpl, receiptPath })
    expect(r.ok).toBe(true)
    expect(readReplyReceipt(receiptPath)).toMatchObject({ id: 'a1' })
  })

  it('records NOTHING when the transport refused it — an unsent answer is no answer', async () => {
    const receiptPath = join(tmp(), 'receipt.json')
    const { fetchImpl } = recorder(false, 500)
    await sendReply({ secret, text: 'kurze Antwort', id: 'a2', ts: NOW, fetchImpl, receiptPath })
    expect(readReplyReceipt(receiptPath)).toBeNull()
  })
})
