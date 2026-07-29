// THE WRITER HALF — and the one distinction inside it.
//
// Not everything the machine posts to the phone is an ANSWER. `sendReply` is an
// agent answering, and it leaves the receipt the watcher reads as evidence that
// the user's message was dealt with. `postOutbox` is the bare post, used by the
// launcher's inbox tick for a DROP NOTICE — a receipt for one of those would tell
// the watcher a message had been answered when nobody had answered it, and the
// message would be marked consumed and lost (see `ackPlan`).
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { postOutbox, readReplyReceipt, sendReply } from './chat-reply.mjs'
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

  it('writes NO receipt — it is not evidence that anybody answered', async () => {
    const path = join(tmp(), 'receipt.json')
    const { fetchImpl } = recorder()
    await postOutbox({ secret, text: 'Zustellung fehlgeschlagen: …', id: 'n1', ts: NOW, fetchImpl })
    expect(existsSync(path)).toBe(false)
    expect(readReplyReceipt(path)).toBeNull()
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
