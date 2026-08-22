// THE DURABLE LANE'S SCHEMAS AND INVARIANTS — step 1 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676).
//
// Pure decision core: no filesystem, no process, no clock of its own. Everything
// this module decides, it decides from arguments, so the Vitest layer sweeps every
// rule without a container (scripts/batch-schema-core.test.mjs). The I/O that reads
// and writes these shapes arrives in step 2 (the durable state store) and step 3
// (the daemon); until then NOTHING IMPORTS THIS FILE, and that is the point.
//
// IT IS BUILT DARK, and dark is a property of the code rather than a habit: no
// caller reads these schemas yet, today's authoring path is byte-for-byte the path
// that ran before this file existed, and the activation flag that will one day let
// a daemon start REFUSES to enable while steps 8 and 9 are not green
// (scripts/durable-lane-flag-core.mjs). Advertising the lane before a successor can
// prove and land what it adopted is the one failure this staging exists to prevent.
//
// WHAT IS SETTLED HERE, and why it is settled BEFORE any process changes:
//
//   1. THE SCHEMA VERSION RULE. A record one version ahead is REFUSED, never
//      guessed at; one version behind is migrated only when a migration is actually
//      registered, and an unversioned record is refused outright. A daemon that
//      guesses at a shape it does not know writes a lie into the one record a
//      successor has to trust.
//   2. THE ATTEMPT'S IDENTITY AND ITS STATES (union M8/M16). A bare pid is not an
//      identity — this repository already learned that in scripts/batch-singleton.mjs,
//      where PID_START_TOLERANCE_MS exists so a recycled pid cannot read as a live
//      owner — so every identity here is pid AND pid start time, inside a batch,
//      point and attempt triple.
//   3. THE DAEMON PAIR. The daemon's durable identity record and the copy of it in
//      the batch lock are two files, and two files can disagree. The write orders
//      and the invariant are in mechanism 2 of the architecture; the table that
//      decides every observable combination is here, including the one combination
//      those write orders cannot produce, which is corruption and fails closed.
//   4. THE COORDINATOR CREDENTIAL. Local fence plus published credential ref. A push
//      under a previous generation is refused, a fence store that has lost its
//      generation refuses to mint rather than inventing one, and a publication whose
//      credential update would be a no-op cannot be constructed — git may leave an
//      up-to-date ref out of the transaction entirely, and then the lease it was
//      supposed to carry is never evaluated.
//   5. THE COMMAND TABLE. Every mutating daemon command declares its COMPENSATION
//      and its IDEMPOTENCY KEY, and one that declares neither cannot be registered.
//      That is a rule of this table rather than a convention, because the mutation
//      whose lock moved under it is reversed by exactly what it declared here.
//   6. THE JOURNAL FRAMING. Checksummed, canonically serialised lines, so a
//      truncated tail reads as truncated instead of as data, and every entry carries
//      the fence it was written under.
import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// 1. SCHEMA VERSION AND MIGRATION
// ---------------------------------------------------------------------------

/** The version every record this lane writes carries in `v`. */
export const SCHEMA_VERSION = 1

/** Migrations keyed by the version they migrate FROM, each a pure upgrade by one
 *  step. The map is EMPTY on purpose: version 1 is the first durable-lane shape,
 *  so nothing older exists to migrate, and inventing a fictional predecessor would
 *  make the acceptance case unfailable. The mechanism is injectable
 *  (`checkSchemaVersion(v, { migrations })`), so the case that proves it can
 *  register a real one, and the case that proves an unmigratable old record is
 *  REFUSED runs against this empty map — which is what stops a later version from
 *  quietly accepting a shape nobody upgraded. */
export const MIGRATIONS = Object.freeze({})

/** accept | migrate | refuse, with the reason a refusal is refused for. */
export function checkSchemaVersion(version, { current = SCHEMA_VERSION, migrations = MIGRATIONS } = {}) {
  if (!Number.isInteger(version) || version < 1) {
    return { verdict: 'refuse', reason: 'unversioned: a record without an integer `v` is not a record of this lane' }
  }
  if (version === current) return { verdict: 'accept', reason: 'current' }
  if (version > current) {
    return { verdict: 'refuse', reason: `ahead: record version ${version} is newer than this code's ${current}` }
  }
  const chain = migrationChain(version, current, migrations)
  if (!chain) {
    return { verdict: 'refuse', reason: `unmigratable: no registered migration reaches ${current} from ${version}` }
  }
  return { verdict: 'migrate', reason: `migratable in ${chain.length} step(s)`, chain }
}

/** The ordered list of migration steps from `from` to `to`, or null when the chain
 *  breaks anywhere along the way. */
function migrationChain(from, to, migrations) {
  const chain = []
  for (let v = from; v < to; v += 1) {
    const step = migrations[v]
    if (typeof step !== 'function') return null
    chain.push(step)
  }
  return chain
}

/** Migrate a record to `current`, or refuse. A migration that does not leave the
 *  record at the current version is a bug in the migration, not an acceptable
 *  result, so it is refused rather than returned. */
export function migrateRecord(record, { current = SCHEMA_VERSION, migrations = MIGRATIONS } = {}) {
  const verdict = checkSchemaVersion(record?.v, { current, migrations })
  if (verdict.verdict === 'accept') return { ok: true, record, migrated: false }
  if (verdict.verdict === 'refuse') return { ok: false, reason: verdict.reason }
  let out = record
  for (const step of verdict.chain) out = step(out)
  if (out?.v !== current) {
    return { ok: false, reason: `migration left the record at version ${out?.v} instead of ${current}` }
  }
  return { ok: true, record: out, migrated: true }
}

// ---------------------------------------------------------------------------
// 2. IDENTITIES (union M8) AND ATTEMPT STATES (union M16)
// ---------------------------------------------------------------------------

/** Mirrors PID_START_TOLERANCE_MS in scripts/batch-singleton.mjs. It is repeated
 *  rather than imported because that module is the lock's I/O layer and this one is
 *  pure; a test asserts the two numbers agree, so the duplicate cannot drift. */
export const PROCESS_START_TOLERANCE_MS = 2000

/** Everything a run must name before it may exist (union M8). A missing field is a
 *  refusal rather than a default: every one of these is what a SUCCESSOR reads to
 *  find work it did not start, and a defaulted branch or worktree points it at the
 *  wrong tree. */
export const ATTEMPT_IDENTITY_FIELDS = Object.freeze([
  'batchId',
  'pointId',
  'attemptId',
  'pid',
  'pidStartedAt',
  'branch',
  'worktree',
  'baseSha',
  'logPath',
  'heartbeatPath',
])

export function attemptIdentity(fields = {}) {
  const missing = ATTEMPT_IDENTITY_FIELDS.filter(
    (f) => fields[f] === undefined || fields[f] === null || fields[f] === '',
  )
  if (missing.length) return { ok: false, missing, reason: `incomplete identity: ${missing.join(', ')}` }
  const identity = {}
  for (const f of ATTEMPT_IDENTITY_FIELDS) identity[f] = fields[f]
  return { ok: true, identity: Object.freeze(identity) }
}

/** Two records describe the same attempt when the triple agrees. The process may
 *  have been restarted under a new pid; that is a different question. */
export function sameAttempt(a, b) {
  return Boolean(a && b && a.batchId === b.batchId && a.pointId === b.pointId && a.attemptId === b.attemptId)
}

/** Pid AND pid start time, within the tolerance the lock already uses. A bare pid
 *  match is the recycled-pid trap. */
export function sameProcess(a, b, { tolerance = PROCESS_START_TOLERANCE_MS } = {}) {
  if (!a || !b) return false
  if (a.pid !== b.pid) return false
  if (!Number.isFinite(a.pidStartedAt) || !Number.isFinite(b.pidStartedAt)) return false
  return Math.abs(a.pidStartedAt - b.pidStartedAt) <= tolerance
}

/** The state vocabulary of union M16, unchanged. A state outside it is not a state
 *  this lane can record; adding one is a design change, not an implementation
 *  detail, because reconciliation (step 8) decides on exactly these names. */
export const ATTEMPT_STATES = Object.freeze([
  'queued',
  'running',
  'checkpointing',
  'ready-for-review',
  'landing',
  'landed',
  'failed',
  'stalled',
  'cancelled',
])

/** Terminal for the ATTEMPT, not for the point: a failed or cancelled attempt keeps
 *  its record and its branch (union M43), and a retry is a NEW attempt id rather
 *  than a resurrection of this one. */
export const TERMINAL_ATTEMPT_STATES = Object.freeze(['landed', 'failed', 'cancelled'])

export const ATTEMPT_TRANSITIONS = Object.freeze({
  queued: Object.freeze(['running', 'cancelled', 'failed']),
  running: Object.freeze(['checkpointing', 'ready-for-review', 'stalled', 'failed', 'cancelled']),
  checkpointing: Object.freeze(['running', 'ready-for-review', 'stalled', 'failed', 'cancelled']),
  'ready-for-review': Object.freeze(['landing', 'cancelled', 'failed']),
  // A landing that finds its base stale returns the work to `queued` for rework
  // (union M36) — an explicit state, never a silent retry of the same landing.
  landing: Object.freeze(['landed', 'queued', 'failed', 'cancelled']),
  // A stall is observed, not chosen: the worker may still be alive and come back.
  stalled: Object.freeze(['running', 'failed', 'cancelled']),
  landed: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([]),
})

export function attemptTransition(from, to) {
  if (!ATTEMPT_STATES.includes(from)) return { ok: false, reason: `unknown state: ${from}` }
  if (!ATTEMPT_STATES.includes(to)) return { ok: false, reason: `unknown state: ${to}` }
  if (TERMINAL_ATTEMPT_STATES.includes(from)) {
    return { ok: false, reason: `${from} is terminal for this attempt; a retry is a new attempt id` }
  }
  if (!ATTEMPT_TRANSITIONS[from].includes(to)) return { ok: false, reason: `${from} -> ${to} is not a transition` }
  return { ok: true }
}

/** What union M16 requires beside the state itself: the actor, the coordinator
 *  epoch (the lock's fence), the timestamp, the last commit and the last pushed
 *  SHA. The pushed SHA is what makes a cancelled attempt's work findable, so the
 *  states that claim finished work must carry one. */
export const ATTEMPT_STATE_FIELDS = Object.freeze(['actor', 'fence', 'at', 'lastCommit', 'lastPushedSha'])

const STATES_REQUIRING_PUSHED_SHA = Object.freeze(['ready-for-review', 'landing', 'landed'])
const STATES_REQUIRING_REASON = Object.freeze(['failed', 'stalled', 'cancelled'])

/** Validates one recorded state change. Refusals here are what stop step 8 from
 *  reconciling against a record that cannot answer the question it is asked.
 *  `lastCommit` and `lastPushedSha` are legitimately absent before the worker has
 *  committed anything, so they must be PRESENT AS KEYS — explicitly null — rather
 *  than truthy: an absent key is an unanswered question, and a null one is an
 *  answer. */
export function attemptStateRecord({ state, reason, ...rest } = {}) {
  if (!ATTEMPT_STATES.includes(state)) return { ok: false, reason: `unknown state: ${state}` }
  const unanswered = ATTEMPT_STATE_FIELDS.filter((f) => !(f in rest))
  if (unanswered.length) return { ok: false, reason: `unanswered: ${unanswered.join(', ')}` }
  if (rest.actor === null || rest.fence === null || rest.at === null) {
    return { ok: false, reason: 'actor, fence and at are never null' }
  }
  if (!Number.isInteger(rest.fence) || rest.fence < 1) return { ok: false, reason: 'fence must be a positive integer' }
  if (STATES_REQUIRING_PUSHED_SHA.includes(state) && !rest.lastPushedSha) {
    return { ok: false, reason: `${state} claims reviewable or landed work and must name its pushed SHA` }
  }
  if (STATES_REQUIRING_REASON.includes(state) && !reason) {
    return { ok: false, reason: `${state} is a named failure state and must carry its reason (union M38)` }
  }
  return { ok: true, record: Object.freeze({ state, reason: reason ?? null, ...rest }) }
}

// ---------------------------------------------------------------------------
// 3. THE DAEMON PAIR — the record and the lock's copy of it
// ---------------------------------------------------------------------------

/** The daemon's own durable identity record, written by the daemon and by nobody
 *  else. `fence` is the fence it was started under; `launchNonce` is what makes a
 *  readiness wait immune to a previous daemon's leftover record. */
export const DAEMON_RECORD_FIELDS = Object.freeze([
  'v',
  'pid',
  'pidStartedAt',
  'generation',
  'fence',
  'launchNonce',
  'startedAt',
])

/** The copy in .claude/batch-lock.json: identity only. It exists so that "is there
 *  a daemon" and "may I work" are ONE read for the current lock owner, and for
 *  nothing else — liveness is never read from it. */
export const DAEMON_COPY_FIELDS = Object.freeze(['pid', 'pidStartedAt', 'generation'])

/** Every combination of (record, copy, probe) the write orders can produce, plus
 *  the one they cannot. The table is exported so the acceptance case can ENUMERATE
 *  it: a reading added without a case fails the test rather than passing silently. */
export const DAEMON_PAIR_READINGS = Object.freeze({
  'no-daemon': "today's path — legal and normal",
  healthy: 'record and copy agree and the process is live — nothing to do',
  unadopted: 'a handover, or a crash between the two writes — the lock owner probes the record and writes the copy',
  'cold-record': 'the daemon is gone — reconcile its workers (step 8), release the record, mint a new generation',
  'stale-copy': 'the daemon is gone and the copy still names it — as cold-record, and clear the copy',
  'superseded-copy': 'the copy is older than the record — the record wins; rewrite the copy after probing',
  'orphaned-copy': 'a copy with no record — clear it; a daemon is never concluded from the copy alone',
  'impossible-copy': 'a copy newer than the record — corruption, not a race: refuse every mutation and alert',
})

/** Decides the pair from the pair alone. `probe` answers whether the RECORD's pid
 *  is live (pid and pid start time), and is consulted for no other purpose; a null
 *  probe means "not probed", which is only ever enough where the record is absent. */
export function classifyDaemonPair({ record = null, copy = null, probe = null } = {}) {
  const reading = (name, extra = {}) => ({ reading: name, resolution: DAEMON_PAIR_READINGS[name], ...extra })

  if (copy && !record) return reading('orphaned-copy')
  if (!record) return reading('no-daemon')

  if (!Number.isFinite(record.generation)) {
    return reading('impossible-copy', { reason: 'the record carries no generation, so nothing can be compared to it' })
  }
  if (copy && Number.isFinite(copy.generation) && copy.generation > record.generation) {
    return reading('impossible-copy', {
      reason: `copy generation ${copy.generation} is newer than the record's ${record.generation}; the write orders cannot produce this`,
    })
  }

  const live = probe ? sameProcess(record, probe) && probe.live !== false : false
  const matches = Boolean(copy) && sameProcess(record, copy) && copy.generation === record.generation

  if (!copy) return live ? reading('unadopted') : reading('cold-record')
  if (!matches) {
    // The copy names a different, older daemon. It is stale bookkeeping either way;
    // whether the RECORD's process still lives decides what happens to the record.
    return live ? reading('superseded-copy') : reading('cold-record')
  }
  return live ? reading('healthy') : reading('stale-copy')
}

/** The invariant in one predicate, so a caller can assert it without re-deriving
 *  the table: the copy may be absent or older, never newer. */
export function daemonPairInvariantHolds({ record = null, copy = null } = {}) {
  return classifyDaemonPair({ record, copy, probe: null }).reading !== 'impossible-copy'
}

// ---------------------------------------------------------------------------
// 4. THE COORDINATOR CREDENTIAL — local fence, published pair
// ---------------------------------------------------------------------------

export const CREDENTIAL_REF = 'refs/hoa/coordinator'

/** The credential is (generation, fence, seq): a random generation minted when the
 *  fence store is created, the monotone fence within it, and a seq that increments
 *  on EVERY publishing act. The generation is what makes recovery safe without
 *  proving a number unique; the seq is what makes the credential ref actually move,
 *  so git cannot classify it as up to date and leave the lease unevaluated. */
export function credential({ generation, fence, seq } = {}) {
  if (typeof generation !== 'string' || generation.length < 8) {
    return { ok: false, reason: 'generation must be a minted random string' }
  }
  if (!Number.isInteger(fence) || fence < 1) return { ok: false, reason: 'fence must be a positive integer' }
  if (!Number.isInteger(seq) || seq < 0) return { ok: false, reason: 'seq must be a non-negative integer' }
  return { ok: true, credential: Object.freeze({ generation, fence, seq }) }
}

export function sameCredential(a, b) {
  return Boolean(a && b && a.generation === b.generation && a.fence === b.fence && a.seq === b.seq)
}

/** The next credential for one publishing act. Always a real change. */
export function advancedCredential(current, { fence = current?.fence } = {}) {
  if (!current) return { ok: false, reason: 'no current credential to advance' }
  return credential({ generation: current.generation, fence, seq: current.seq + 1 })
}

/** Builds the one atomic push that carries the work and the credential together.
 *  It REFUSES to construct a publication whose credential update would be a no-op:
 *  such a push has no fence at all, which is worse than a rejected one because it
 *  succeeds. `expectedOid` is the oid of the credential currently published, or the
 *  empty string for the very first advance, which leases the ref's ABSENCE. */
export function publicationPush({ current = null, next = null, expectedOid, refs = [] } = {}) {
  if (!next) return { ok: false, reason: 'no credential to publish' }
  if (current && sameCredential(current, next)) {
    return { ok: false, reason: 'a publication whose credential update is a no-op has no fence and is refused' }
  }
  if (current && next.generation !== current.generation) {
    return { ok: false, reason: 'a publication may not change the generation; recovery mints one, publication never does' }
  }
  if (expectedOid === undefined || expectedOid === null) {
    return { ok: false, reason: 'a publication without a lease on the credential ref is refused' }
  }
  if (!refs.length) return { ok: false, reason: 'a publication must carry work as well as the credential' }
  return {
    ok: true,
    args: ['push', '--atomic', `--force-with-lease=${CREDENTIAL_REF}:${expectedOid}`, 'origin', ...refs, CREDENTIAL_REF],
  }
}

/** A push under a previous generation is refused at the reader as well as at the
 *  remote: an erased-and-recreated fence store mints a fresh generation, and a
 *  credential from any earlier one matches nothing. */
export function credentialAccepted(presented, published) {
  if (!presented || !published) return { ok: false, reason: 'both credentials are required' }
  if (presented.generation !== published.generation) {
    return { ok: false, reason: 'foreign generation: this credential belongs to a fence store that no longer exists' }
  }
  if (presented.fence < published.fence) return { ok: false, reason: 'stale fence' }
  if (presented.fence === published.fence && presented.seq < published.seq) return { ok: false, reason: 'stale seq' }
  return { ok: true }
}

/** Minting is fail-closed on BOTH halves of the evidence. An old fence file beside
 *  a lost journal would otherwise hand out a number a durable record already
 *  carries — and the comparison would pass precisely BECAUSE the evidence was gone.
 *  Recovery from this state is an operator act, never an automatic one. */
export function mayMintFence({ fenceStore = null, journalOk = false, journalHighWater = null } = {}) {
  if (!fenceStore) return { ok: false, reason: 'the fence store is missing; a batch that cannot prove who owns it stops' }
  if (typeof fenceStore.generation !== 'string' || !fenceStore.generation) {
    return { ok: false, reason: 'the fence store has lost its generation and refuses to invent one' }
  }
  if (!Number.isInteger(fenceStore.fence) || fenceStore.fence < 1) {
    return { ok: false, reason: 'the fence store carries no usable fence' }
  }
  if (!journalOk) return { ok: false, reason: 'the journal is missing or fails its checksums; minting is refused' }
  if (Number.isInteger(journalHighWater) && fenceStore.fence < journalHighWater) {
    return {
      ok: false,
      reason: `the fence store (${fenceStore.fence}) is below the journal's high water mark (${journalHighWater})`,
    }
  }
  return { ok: true, next: fenceStore.fence + 1 }
}

// ---------------------------------------------------------------------------
// 5. MUTATION VALIDATION — the fence IS the coordinator epoch
// ---------------------------------------------------------------------------

/** Every daemon mutation presents (sessionId, fence). The daemon holds no cached
 *  epoch: it re-reads the lock for each mutation and accepts only when the lock
 *  names the same session, carries the same fence, and is LIVE by the test this
 *  repository already uses. */
export function validateMutation({ presented = {}, lock = null, probe = null, now = 0 } = {}) {
  if (!lock) return { ok: false, reason: 'no batch lock: a daemon with no live lock refuses every mutation' }
  if (lock.sessionId !== presented.sessionId) return { ok: false, reason: 'the lock names another session' }
  if (lock.fence !== presented.fence) {
    return { ok: false, reason: `stale fence: presented ${presented.fence}, the lock carries ${lock.fence}` }
  }
  if (!sameProcess(lock, probe ? { pid: probe.pid, pidStartedAt: probe.startedAt } : null)) {
    return { ok: false, reason: 'the lock owner does not probe live' }
  }
  if (Number.isFinite(lock.leaseUntil) && now > lock.leaseUntil) {
    return { ok: false, reason: "the lock owner's lease has expired" }
  }
  return { ok: true, fence: lock.fence }
}

/** The window this design does not close, and closes the EFFECT of instead: a
 *  release can land between validation and write. So the daemon re-reads the lock
 *  immediately after the write and compensates when it moved. */
export function revalidateAfterWrite({ validated = {}, lock = null } = {}) {
  if (!lock) return { verdict: 'compensate', reason: 'the lock is gone' }
  if (lock.sessionId !== validated.sessionId || lock.fence !== validated.fence) {
    return { verdict: 'compensate', reason: 'the lock moved under the mutation' }
  }
  return { verdict: 'stands' }
}

// ---------------------------------------------------------------------------
// 6. THE COMMAND TABLE — compensation and idempotency are registration conditions
// ---------------------------------------------------------------------------

/** The two acts that are PUBLISHED, and therefore uncompensable: a pushed merge can
 *  already have been fetched and built on, and so can a worker's checkpoint push.
 *  Neither is a row of this table — they are fenced by the credential lease at the
 *  remote, which is a check that IS the act rather than one that precedes it. */
export const PUBLISHED_ACTS = Object.freeze(['landing-push', 'checkpoint-push'])

/** Each row: the local mutation, the compensation that reverses it when the lock
 *  moved under it, and the payload fields its idempotency key is built from. */
export const DAEMON_COMMANDS = Object.freeze({
  'queue-job': Object.freeze({
    compensation: 'withdraw-job',
    keyFields: Object.freeze(['batchId', 'pointId', 'requestId']),
  }),
  'start-attempt': Object.freeze({
    compensation: 'stop-worker-preserve-branch',
    keyFields: Object.freeze(['batchId', 'pointId', 'attemptId']),
  }),
  'grant-lease': Object.freeze({
    compensation: 'revoke-lease',
    keyFields: Object.freeze(['batchId', 'attemptId', 'requestId']),
  }),
  'request-checkpoint': Object.freeze({
    compensation: 'withdraw-checkpoint-request',
    keyFields: Object.freeze(['batchId', 'requestId']),
  }),
  'adopt-attempt': Object.freeze({
    compensation: 'release-adoption',
    keyFields: Object.freeze(['batchId', 'attemptId', 'fence']),
  }),
  // Cancellation stops a process, which is local and FINAL — so its compensation is
  // not an un-cancel. It is the requeue that makes the preserved branch workable
  // again, which is the most an unauthorised cancellation can be given back.
  'cancel-attempt': Object.freeze({
    compensation: 'requeue-point',
    keyFields: Object.freeze(['batchId', 'attemptId', 'requestId']),
  }),
  'record-state': Object.freeze({
    compensation: 'record-superseding-state',
    keyFields: Object.freeze(['batchId', 'attemptId', 'state', 'at']),
  }),
})

/** Registration refuses what cannot be reversed or repeated. A command without a
 *  compensation cannot be accepted by a daemon that must reverse a mutation whose
 *  lock moved, and a command without a key cannot answer whether it already ran. */
export function registerDaemonCommand(table, name, spec) {
  if (!name || typeof name !== 'string') return { ok: false, reason: 'a command needs a name' }
  if (PUBLISHED_ACTS.includes(name)) {
    return { ok: false, reason: `${name} is a published act: it is fenced at the remote, not compensated here` }
  }
  if (name in table) return { ok: false, reason: `${name} is already registered` }
  if (!spec?.compensation) return { ok: false, reason: `${name} declares no compensation and cannot be registered` }
  if (!Array.isArray(spec?.keyFields) || !spec.keyFields.length) {
    return { ok: false, reason: `${name} declares no idempotency key and cannot be registered` }
  }
  return { ok: true, table: Object.freeze({ ...table, [name]: Object.freeze({ ...spec }) }) }
}

/** The key a retry presents. Built from the payload's declared fields only, so the
 *  same request produces the same key on a different machine, at a different time,
 *  under a different fence — except where the fence is itself part of the key. */
export function idempotencyKey(name, payload = {}, { table = DAEMON_COMMANDS } = {}) {
  const spec = table[name]
  if (!spec) return { ok: false, reason: `unknown command: ${name}` }
  const missing = spec.keyFields.filter((f) => payload[f] === undefined || payload[f] === null)
  if (missing.length) return { ok: false, reason: `cannot key ${name}: missing ${missing.join(', ')}` }
  const material = spec.keyFields.map((f) => `${f}=${String(payload[f])}`).join(' ')
  return { ok: true, key: `${name}:${createHash('sha256').update(material).digest('hex').slice(0, 16)}` }
}

/** Applying a key that has already been applied changes nothing and says so. This
 *  is the whole of "every mutating command is idempotent" as a pure function; the
 *  store that persists `applied` arrives in step 2. */
export function applyOnce(applied, key, mutate) {
  if (!key) return { ok: false, reason: 'a mutation without an idempotency key cannot be applied' }
  const seen = applied instanceof Set ? applied.has(key) : Boolean(applied?.[key])
  if (seen) return { ok: true, applied: false, reason: 'already applied' }
  return { ok: true, applied: true, result: typeof mutate === 'function' ? mutate() : undefined }
}

// ---------------------------------------------------------------------------
// 7. JOURNAL FRAMING
// ---------------------------------------------------------------------------

/** Canonical JSON: keys sorted at every depth, so the same entry always hashes to
 *  the same value regardless of who assembled the object. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
}

export function checksumOf(entry) {
  return createHash('sha256').update(canonicalJson(entry)).digest('hex').slice(0, 32)
}

/** Every entry carries the fence it was written under (so a later reader can see
 *  which regime authorised which write) and its own checksum. */
export function frameEntry(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'an entry is an object' }
  if (!Number.isInteger(entry.seq) || entry.seq < 1) return { ok: false, reason: 'an entry needs a positive seq' }
  if (!Number.isInteger(entry.fence) || entry.fence < 1) {
    return { ok: false, reason: 'an entry needs the fence it was written under' }
  }
  if (!entry.kind) return { ok: false, reason: 'an entry needs a kind' }
  const body = { ...entry, v: entry.v ?? SCHEMA_VERSION }
  return { ok: true, line: `${canonicalJson({ ...body, c: checksumOf(body) })}\n` }
}

/** A tail that was half-written reads as TRUNCATED rather than as data. That is the
 *  distinction the whole store rests on: a truncated final record is an ordinary
 *  crash, a checksum mismatch in the middle is corruption. */
export function parseFramedLine(line) {
  if (typeof line !== 'string' || !line.trim()) return { ok: false, reason: 'empty' }
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    return { ok: false, reason: 'truncated: the line is not complete JSON' }
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.c) return { ok: false, reason: 'malformed: no checksum' }
  const { c, ...body } = parsed
  if (checksumOf(body) !== c) return { ok: false, reason: 'checksum mismatch' }
  return { ok: true, entry: body }
}

/** An entry is legitimate exactly when its fence is the one in force AT ITS OWN
 *  POSITION — not merely below the reader's own fence, which would quarantine every
 *  legitimate predecessor history, transferred workers included, at every ordinary
 *  handover. */
export function fenceInForceAt(transitions, seq) {
  let inForce = null
  for (const t of transitions) {
    if (t.seq <= seq) inForce = t.fence
    else break
  }
  return inForce
}

/** The tail the daemon cannot prove the order of says so, instead of inventing one:
 *  everything after the last CONFIRMED position is marked `unverified` when the
 *  current credential has no transition in the journal. Reconciliation (step 8)
 *  quarantines exactly those, and nothing else. */
export function markUnverifiedTail({ entries = [], transitions = [], lastConfirmedSeq = 0, currentFence = null } = {}) {
  const currentHasTransition = transitions.some((t) => t.fence === currentFence)
  return entries.map((e) => {
    const inForce = fenceInForceAt(transitions, e.seq)
    if (!currentHasTransition && e.seq > lastConfirmedSeq) return { ...e, unverified: true }
    if (inForce !== null && e.fence !== inForce) return { ...e, quarantine: 'fence not in force at this position' }
    return e
  })
}
