// THE DURABLE STATE STORE'S DECISION CORE — step 2 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676).
//
// Pure like step 1: no filesystem, no process, no clock. This module decides what
// a journal's bytes MEAN — which lines are entries, which tail is an ordinary
// crash, which middle is corruption, what a snapshot derived from the entries must
// contain — and scripts/batch-state.mjs is the thin I/O that feeds it bytes and
// writes what it returns. Still DARK: no runtime caller imports either file until
// the daemon of step 3 exists, and the activation flag refuses to enable while
// steps 8 and 9 are not green (scripts/durable-lane-flag-core.mjs).
//
// THE ONE DISTINCTION THE STORE RESTS ON (mechanism 2): a TRUNCATED FINAL record —
// the delimiter never written, the JSON never completed — is an ordinary crash,
// dropped and reported. A CHECKSUM MISMATCH, or any defect BEFORE the final line,
// is corruption: an append-only journal with a single writer cannot legally
// contain it, so the verdict is `corrupt`, and `mayMintFence` (step 1) refuses to
// mint on that verdict — an old fence file beside a broken journal must not hand
// out a number a durable record already carries.
import { SCHEMA_VERSION, attemptStateRecord, canonicalJson, checkSchemaVersion, checksumOf, migrateRecord, parseFramedLine, sameAttempt } from './batch-schema-core.mjs'

// ---------------------------------------------------------------------------
// 1. THE ENTRY KINDS THE LANE JOURNALS
// ---------------------------------------------------------------------------

/** What the single writer may append. The vocabulary is closed per schema version:
 *  an unknown kind inside a checksummed, current-version entry is not framing
 *  damage — the bytes are exactly what was written — so it quarantines that ENTRY
 *  rather than condemning the journal, and reconciliation (step 8) reads the
 *  quarantine instead of guessing at a meaning this code does not know. */
export const JOURNAL_KINDS = Object.freeze([
  // The fence's own history: appended by the daemon when it observes the lock
  // under a credential it has not journalled yet. `fenceInForceAt` reads these.
  'fence-transition',
  // One accepted daemon mutation: name, idempotency key, payload, and after the
  // post-write re-read either `confirmed: true` or its journalled compensation.
  'command',
  // One attempt state change, in the shape attemptStateRecord validates.
  'attempt-state',
  // Intent BEFORE any publishing act: the publication id and, per ref, the exact
  // object ids expected before and left after. Exists before the push can.
  'publish-intent',
  // The push came back accepted; carries the publication id it confirms.
  'publish-confirmed',
  // Daemon start, drain and stop, with the daemon's identity record.
  'daemon-lifecycle',
])

// ---------------------------------------------------------------------------
// 2. REPLAY — bytes in, verdict out
// ---------------------------------------------------------------------------

/** Splits raw journal text into frames WITHOUT losing the one bit the parser needs:
 *  whether each line reached its delimiter. The final piece of a file that does not
 *  end in `\n` is handed on undelimited, which parseFramedLine reads as truncated. */
export function splitFrames(text) {
  if (typeof text !== 'string' || text === '') return []
  const frames = []
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      frames.push(text.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < text.length) frames.push(text.slice(start))
  return frames
}

/** The whole journal, judged. Returns:
 *    verdict        'ok' | 'corrupt'  — feeds mayMintFence's journalOk as verdict === 'ok'
 *    entries        every parsed entry, in order, quarantined ones marked in place
 *    droppedTail    the ordinary-crash tail, or null — reported, never silently eaten
 *    corruption     [{ index, reason }] — why the verdict is corrupt
 *    highWater      the highest fence any entry carries, or null for an empty journal
 *
 *  Seq must be STRICTLY INCREASING: one writer appending to one file cannot
 *  legally produce a repeat or a step backwards, so either is corruption, not a
 *  quirk. A gap is legal — quarantined entries of a prior read may have been
 *  compacted away by an operator, and a gap cannot re-order what remains. */
export function replayJournal(text) {
  const frames = splitFrames(text)
  const entries = []
  const corruption = []
  let droppedTail = null
  let lastSeq = 0
  let highWater = null
  frames.forEach((frame, index) => {
    const parsed = parseFramedLine(frame)
    if (!parsed.ok) {
      const isFinal = index === frames.length - 1
      // Only the FINAL line may be an ordinary crash, and only when its defect is
      // truncation — bytes that never finished. A mismatching checksum has all its
      // bytes and is corruption wherever it stands.
      if (isFinal && parsed.reason.startsWith('truncated')) {
        droppedTail = { index, reason: parsed.reason }
      } else {
        corruption.push({ index, reason: parsed.reason })
      }
      return
    }
    const entry = parsed.entry
    if (entry.seq <= lastSeq) {
      corruption.push({ index, reason: `seq ${entry.seq} does not advance past ${lastSeq}` })
      return
    }
    lastSeq = entry.seq
    if (Number.isInteger(entry.fence) && (highWater === null || entry.fence > highWater)) highWater = entry.fence
    if (!JOURNAL_KINDS.includes(entry.kind)) {
      entries.push({ ...entry, quarantine: `unknown kind: ${entry.kind}` })
      return
    }
    entries.push(entry)
  })
  return {
    verdict: corruption.length ? 'corrupt' : 'ok',
    entries,
    droppedTail,
    corruption,
    highWater,
  }
}

// ---------------------------------------------------------------------------
// 3. THE APPLIED-KEY SET — idempotency across restarts
// ---------------------------------------------------------------------------

/** The idempotency keys of every journalled command, rebuilt from the entries, so
 *  "already applied" survives a daemon restart: applyOnce (step 1) consults exactly
 *  this set. Quarantined entries do not contribute — a key from an entry nothing
 *  authorised must not suppress a legitimate retry as "already applied". */
export function appliedKeys(entries = []) {
  const keys = new Set()
  for (const e of entries) {
    if (e.kind === 'command' && !e.quarantine && typeof e.key === 'string' && e.key) keys.add(e.key)
  }
  return keys
}

// ---------------------------------------------------------------------------
// 4. PUBLICATION INTENTS — what reconciliation will ask the remote about
// ---------------------------------------------------------------------------

/** A publish-intent entry, validated before it may be framed: every ref move names
 *  the exact object ids expected before and left after, because recovery resolves
 *  the intent against OBJECTS, never against a counter (mechanism 2). The before
 *  oid may be null — a ref being created expects absence — but never absent. */
export function publishIntent({ publicationId, moves } = {}) {
  if (typeof publicationId !== 'string' || !publicationId) {
    return { ok: false, reason: 'a publication intent needs its unique publication id' }
  }
  if (!Array.isArray(moves) || !moves.length) return { ok: false, reason: 'a publication intent names at least one ref move' }
  for (const m of moves) {
    if (!m || typeof m.ref !== 'string' || !m.ref.startsWith('refs/')) {
      return { ok: false, reason: 'every move names a fully qualified ref' }
    }
    if (!('beforeOid' in m) || m.beforeOid === undefined || (m.beforeOid !== null && !oidLike(m.beforeOid))) {
      return { ok: false, reason: `move of ${m.ref}: beforeOid must be an object id, or null for a ref being created` }
    }
    if (!oidLike(m.afterOid)) return { ok: false, reason: `move of ${m.ref}: afterOid must be a real object id` }
  }
  return { ok: true, intent: Object.freeze({ publicationId, moves: moves.map((m) => Object.freeze({ ref: m.ref, beforeOid: m.beforeOid, afterOid: m.afterOid })) }) }
}

function oidLike(v) {
  return typeof v === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(v)
}

/** The intents no confirmation answers — what a successor must resolve against the
 *  remote before it may conclude anything about the unverified tail. Quarantined
 *  intents are STILL listed: a quarantined entry with a publishing intent may have
 *  published, which is exactly why mechanism 2 refuses to read quarantine as
 *  uniformly local. */
export function unconfirmedIntents(entries = []) {
  const confirmed = new Set()
  for (const e of entries) {
    if (e.kind === 'publish-confirmed' && typeof e.publicationId === 'string') confirmed.add(e.publicationId)
  }
  return entries.filter((e) => e.kind === 'publish-intent' && typeof e.publicationId === 'string' && !confirmed.has(e.publicationId))
}

// ---------------------------------------------------------------------------
// 5. THE DERIVED SNAPSHOT
// ---------------------------------------------------------------------------

/** Folds the journal into the resume shape: per attempt the LAST valid state
 *  record, plus the store's own cursors. Derivation never invents: an attempt-state
 *  entry that fails attemptStateRecord's own validation is quarantined here even if
 *  its frame was sound, because a snapshot must not carry a state reconciliation
 *  cannot decide on. */
export function deriveSnapshot(entries = [], { batchId = null } = {}) {
  const attempts = []
  const quarantined = []
  let lastSeq = 0
  for (const e of entries) {
    lastSeq = Math.max(lastSeq, e.seq ?? 0)
    if (e.quarantine) {
      quarantined.push({ seq: e.seq ?? null, reason: e.quarantine })
      continue
    }
    if (e.kind !== 'attempt-state') continue
    const checked = attemptStateRecord(e.record ?? {})
    if (!checked.ok) {
      quarantined.push({ seq: e.seq, reason: `attempt-state: ${checked.reason}` })
      continue
    }
    const identity = { batchId: e.batchId, pointId: e.pointId, attemptId: e.attemptId }
    if (!identity.batchId || !identity.pointId || !identity.attemptId) {
      quarantined.push({ seq: e.seq, reason: 'attempt-state: the entry names no attempt' })
      continue
    }
    const existing = attempts.find((a) => sameAttempt(a, identity))
    if (existing) {
      existing.state = checked.record
      existing.stateSeq = e.seq
    } else {
      attempts.push({ ...identity, state: checked.record, stateSeq: e.seq })
    }
  }
  return { batchId, lastSeq, attempts, quarantined, appliedKeys: [...appliedKeys(entries)], unconfirmedIntents: unconfirmedIntents(entries).map((e) => e.publicationId) }
}

// ---------------------------------------------------------------------------
// 6. THE SNAPSHOT AS A RECORD — checksummed, versioned, judged on read
// ---------------------------------------------------------------------------

/** Wraps a snapshot body for the atomic write: version stamped, checksummed with
 *  the same canonical serialisation as journal frames, so a torn or bit-flipped
 *  snapshot reads as corrupt instead of as state. */
export function sealSnapshotText(body, { v = SCHEMA_VERSION } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'a snapshot body is an object' }
  if (Object.hasOwn(body, 'c')) return { ok: false, reason: "a snapshot body may not carry `c`; that key is the seal's checksum" }
  const stamped = { ...body, v }
  return { ok: true, text: `${canonicalJson({ ...stamped, c: checksumOf(stamped) })}\n` }
}

/** Reads a snapshot back, or says exactly why not. `missing` is a legal answer —
 *  the journal alone can rebuild it — while `corrupt` is a quarantine verdict the
 *  successor must surface, never repair silently. */
export function readSnapshotText(text) {
  if (text === null || text === undefined) return { ok: false, verdict: 'missing', reason: 'no snapshot' }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, verdict: 'corrupt', reason: 'the snapshot is not complete JSON' }
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.c !== 'string') {
    return { ok: false, verdict: 'corrupt', reason: 'the snapshot carries no checksum' }
  }
  const { c, ...body } = parsed
  if (checksumOf(body) !== c) return { ok: false, verdict: 'corrupt', reason: 'snapshot checksum mismatch' }
  const version = checkSchemaVersion(body.v)
  if (version.verdict === 'refuse') return { ok: false, verdict: 'corrupt', reason: `version: ${version.reason}` }
  if (version.verdict === 'migrate') {
    const migrated = migrateRecord(body)
    if (!migrated.ok) return { ok: false, verdict: 'corrupt', reason: `version: ${migrated.reason}` }
    return { ok: true, verdict: 'ok', snapshot: migrated.record, migrated: true }
  }
  return { ok: true, verdict: 'ok', snapshot: body }
}
