// THE SCHEMAS AND INVARIANTS OF THE DURABLE LANE (point 834, step 1). Every rule
// scripts/batch-schema-core.mjs states, swept without a filesystem.
//
// Two of these cases are ENUMERATING rather than exemplary, and they are the ones
// that keep working after this point lands: the daemon-pair table must have a case
// for every reading it declares, and every registered daemon command must have an
// idempotency case. A row or a command added later without one fails here instead
// of passing silently.
import { describe, it, expect } from 'vitest'
import { PID_START_TOLERANCE_MS } from './batch-singleton.mjs'
import {
  ATTEMPT_IDENTITY_FIELDS,
  ATTEMPT_STATES,
  ATTEMPT_TRANSITIONS,
  CREDENTIAL_REF,
  DAEMON_COMMANDS,
  DAEMON_PAIR_READINGS,
  MIGRATIONS,
  PROCESS_START_TOLERANCE_MS,
  PUBLISHED_ACTS,
  SCHEMA_VERSION,
  TERMINAL_ATTEMPT_STATES,
  advancedCredential,
  applyOnce,
  attemptIdentity,
  attemptStateRecord,
  attemptTransition,
  canonicalJson,
  checkSchemaVersion,
  checksumOf,
  classifyDaemonPair,
  credential,
  credentialAccepted,
  daemonPairInvariantHolds,
  fenceInForceAt,
  frameEntry,
  idempotencyKey,
  markUnverifiedTail,
  mayMintFence,
  migrateRecord,
  parseFramedLine,
  publicationPush,
  registerDaemonCommand,
  revalidateAfterWrite,
  sameAttempt,
  sameProcess,
  validateMutation,
} from './batch-schema-core.mjs'

const NOW = 1_800_000_000_000

describe('the schema version rule', () => {
  it('accepts the current version', () => {
    expect(checkSchemaVersion(SCHEMA_VERSION).verdict).toBe('accept')
  })

  it('REFUSES one version ahead rather than guessing at a shape it does not know', () => {
    const verdict = checkSchemaVersion(SCHEMA_VERSION + 1)
    expect(verdict.verdict).toBe('refuse')
    expect(verdict.reason).toMatch(/ahead/)
  })

  it('refuses an unversioned record', () => {
    expect(checkSchemaVersion(undefined).verdict).toBe('refuse')
    expect(checkSchemaVersion('1').verdict).toBe('refuse')
    expect(checkSchemaVersion(0).verdict).toBe('refuse')
  })

  it('migrates one version behind and re-reads equal', () => {
    const migrations = { 1: (r) => ({ ...r, v: 2, addedByMigration: true }) }
    const old = { v: 1, kind: 'attempt', attemptId: 'a1' }
    const migrated = migrateRecord(old, { current: 2, migrations })
    expect(migrated.ok).toBe(true)
    expect(migrated.migrated).toBe(true)
    expect(migrated.record).toEqual({ v: 2, kind: 'attempt', attemptId: 'a1', addedByMigration: true })
    // Re-reading the migrated record is a no-op: it is now current.
    const again = migrateRecord(migrated.record, { current: 2, migrations })
    expect(again.migrated).toBe(false)
    expect(again.record).toEqual(migrated.record)
  })

  it('refuses an older record when no migration is registered — which is today, on purpose', () => {
    expect(Object.keys(MIGRATIONS)).toHaveLength(0)
    const verdict = migrateRecord({ v: 1 }, { current: 2 })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/unmigratable/)
  })

  it('refuses a migration that does not leave the record at the current version', () => {
    const migrations = { 1: (r) => ({ ...r }) }
    const out = migrateRecord({ v: 1 }, { current: 2, migrations })
    expect(out.ok).toBe(false)
    expect(out.reason).toMatch(/instead of 2/)
  })
})

describe('identity — pid and pid start time, never a bare pid', () => {
  const full = {
    batchId: 'b1',
    pointId: 834,
    attemptId: 'a1',
    pid: 4711,
    pidStartedAt: NOW - 60_000,
    branch: 'feat/834-x',
    worktree: '/w/834',
    baseSha: 'abc1234',
    logPath: '/logs/a1.log',
    heartbeatPath: '/logs/a1.beat',
    lease: 'lease-a1-605',
  }

  it('names every field union M8 requires, the launcher lease included', () => {
    for (const field of ['batchId', 'pointId', 'attemptId', 'pid', 'pidStartedAt', 'branch', 'worktree', 'baseSha', 'logPath', 'heartbeatPath', 'lease']) {
      expect(ATTEMPT_IDENTITY_FIELDS, field).toContain(field)
    }
  })

  it('accepts a complete identity and refuses every incomplete one', () => {
    expect(attemptIdentity(full).ok).toBe(true)
    for (const field of ATTEMPT_IDENTITY_FIELDS) {
      const { [field]: _dropped, ...missing } = full
      const verdict = attemptIdentity(missing)
      expect(verdict.ok, `${field} must be required`).toBe(false)
      expect(verdict.missing).toEqual([field])
    }
  })

  it('refuses an empty string as an answer', () => {
    expect(attemptIdentity({ ...full, branch: '' }).ok).toBe(false)
  })

  it('a recycled pid is not the same process', () => {
    const a = { pid: 4711, pidStartedAt: NOW }
    expect(sameProcess(a, { pid: 4711, pidStartedAt: NOW + 1500 })).toBe(true)
    expect(sameProcess(a, { pid: 4711, pidStartedAt: NOW + 90_000 })).toBe(false)
    expect(sameProcess(a, { pid: 4712, pidStartedAt: NOW })).toBe(false)
    expect(sameProcess(a, null)).toBe(false)
  })

  it('carries the same tolerance the lock already uses, so the copy cannot drift', () => {
    expect(PROCESS_START_TOLERANCE_MS).toBe(PID_START_TOLERANCE_MS)
  })

  // Two absent values compare equal. None of these comparisons may read that as a match.
  it('two records that carry no pid at all are not the same process', () => {
    expect(sameProcess({ pidStartedAt: NOW }, { pidStartedAt: NOW })).toBe(false)
    expect(sameProcess({ pid: '4711', pidStartedAt: NOW }, { pid: '4711', pidStartedAt: NOW })).toBe(false)
  })

  it('a pid that no process can have is not an identity either', () => {
    expect(sameProcess({ pid: 0, pidStartedAt: NOW }, { pid: 0, pidStartedAt: NOW })).toBe(false)
    expect(sameProcess({ pid: -1, pidStartedAt: NOW }, { pid: -1, pidStartedAt: NOW })).toBe(false)
  })

  it('two records that name no attempt are not the same attempt', () => {
    const id = { batchId: 'b1', pointId: 834, attemptId: 'a1' }
    expect(sameAttempt(id, { ...id })).toBe(true)
    expect(sameAttempt({}, {})).toBe(false)
    expect(sameAttempt({ batchId: 'b1', pointId: 834 }, { batchId: 'b1', pointId: 834 })).toBe(false)
    expect(sameAttempt({ ...id, attemptId: '' }, { ...id, attemptId: '' })).toBe(false)
  })
})

describe('attempt states and transitions (union M16)', () => {
  it('every state has a transition row, and only the terminal ones are empty', () => {
    for (const state of ATTEMPT_STATES) {
      expect(ATTEMPT_TRANSITIONS[state], state).toBeDefined()
      const empty = ATTEMPT_TRANSITIONS[state].length === 0
      expect(empty, state).toBe(TERMINAL_ATTEMPT_STATES.includes(state))
    }
  })

  it('every named target is itself a state', () => {
    for (const [from, targets] of Object.entries(ATTEMPT_TRANSITIONS)) {
      for (const to of targets) expect(ATTEMPT_STATES, `${from} -> ${to}`).toContain(to)
    }
  })

  it('a terminal attempt does not resume; a retry is a new attempt id', () => {
    expect(attemptTransition('landed', 'running').ok).toBe(false)
    expect(attemptTransition('failed', 'queued').reason).toMatch(/terminal/)
    expect(attemptTransition('cancelled', 'running').ok).toBe(false)
  })

  it('a stale base returns a landing to queued rather than retrying it silently', () => {
    expect(attemptTransition('landing', 'queued').ok).toBe(true)
    expect(attemptTransition('landing', 'running').ok).toBe(false)
  })

  it('refuses states it does not know', () => {
    expect(attemptTransition('running', 'paused').ok).toBe(false)
    expect(attemptTransition('sleeping', 'running').ok).toBe(false)
  })

  it('records leave no field unanswered — and undefined is not an answer either', () => {
    const base = { actor: 'session-1', fence: 604, at: NOW, lastCommit: null, lastPushedSha: null }
    expect(attemptStateRecord({ state: 'running', ...base }).ok).toBe(true)
    const { lastPushedSha: _gone, ...withoutKey } = base
    expect(attemptStateRecord({ state: 'running', ...withoutKey }).reason).toMatch(/unanswered/)
    // The key is present and its value is undefined: absent by another spelling.
    expect(attemptStateRecord({ state: 'running', ...base, lastCommit: undefined }).reason).toMatch(/unanswered/)
    expect(attemptStateRecord({ state: 'running', ...base, actor: undefined }).reason).toMatch(/unanswered/)
    expect(attemptStateRecord({ state: 'running', ...base, fence: 0 }).ok).toBe(false)
  })

  it('refuses an empty actor and a timestamp that is not a number', () => {
    const base = { actor: 'session-1', fence: 604, at: NOW, lastCommit: null, lastPushedSha: null }
    expect(attemptStateRecord({ state: 'running', ...base, actor: '' }).ok).toBe(false)
    expect(attemptStateRecord({ state: 'running', ...base, at: 'just now' }).ok).toBe(false)
    expect(attemptStateRecord({ state: 'running', ...base, at: null }).ok).toBe(false)
  })

  it('a state that claims reviewable or landed work must name its pushed SHA', () => {
    const base = { actor: 'session-1', fence: 604, at: NOW, lastCommit: 'c0ffee', lastPushedSha: null }
    expect(attemptStateRecord({ state: 'ready-for-review', ...base }).ok).toBe(false)
    expect(attemptStateRecord({ state: 'landed', ...base }).ok).toBe(false)
    expect(attemptStateRecord({ state: 'ready-for-review', ...base, lastPushedSha: 'deadbee' }).ok).toBe(true)
  })

  it('a named failure state carries its reason (union M38)', () => {
    const base = { actor: 'daemon', fence: 604, at: NOW, lastCommit: null, lastPushedSha: null }
    expect(attemptStateRecord({ state: 'stalled', ...base }).ok).toBe(false)
    expect(attemptStateRecord({ state: 'cancelled', ...base }).ok).toBe(false)
    expect(attemptStateRecord({ state: 'failed', ...base, reason: 'heartbeat timeout' }).ok).toBe(true)
  })
})

describe('the daemon pair — record and the lock copy of it', () => {
  const record = { v: 1, pid: 900, pidStartedAt: NOW - 600_000, generation: 7, fence: 604, launchNonce: 'n1', startedAt: NOW - 600_000 }
  const copy = { pid: 900, pidStartedAt: NOW - 600_000, generation: 7 }
  const alive = { pid: 900, pidStartedAt: NOW - 600_000, live: true }
  const dead = { pid: 900, pidStartedAt: NOW - 600_000, live: false }

  // ENUMERATED OVER THE INPUTS, not over the output labels: every combination of
  // record, copy and probe this classifier can be handed, each with the reading it
  // must produce. A label-keyed table would have passed while whole input states
  // went undecided, which is exactly what the review found.
  const older = { ...copy, generation: 6, pid: 880, pidStartedAt: NOW - 900_000 }
  const inputs = [
    ['record absent, copy absent', { record: null, copy: null, probe: null }, 'no-daemon'],
    ['record absent, copy absent, probe offered', { record: null, copy: null, probe: alive }, 'no-daemon'],
    ['copy with no record', { record: null, copy, probe: null }, 'orphaned-copy'],
    ['matching copy, live record', { record, copy, probe: alive }, 'healthy'],
    ['matching copy, dead record', { record, copy, probe: dead }, 'stale-copy'],
    ['matching copy, unprobed record', { record, copy, probe: null }, 'stale-copy'],
    ['no copy, live record', { record, copy: null, probe: alive }, 'unadopted'],
    ['no copy, dead record', { record, copy: null, probe: dead }, 'cold-record'],
    ['no copy, unprobed record', { record, copy: null, probe: null }, 'cold-record'],
    ['older copy, live record', { record, copy: older, probe: alive }, 'superseded-copy'],
    ['older copy, dead record', { record, copy: older, probe: dead }, 'cold-record'],
    ['probe of another process', { record, copy, probe: { pid: 901, pidStartedAt: NOW, live: true } }, 'stale-copy'],
    ['copy newer than the record', { record, copy: { ...copy, generation: 8 }, probe: alive }, 'impossible-copy'],
    ['copy with no generation', { record, copy: { ...copy, generation: undefined }, probe: alive }, 'impossible-copy'],
    [
      'same generation, another process',
      { record, copy: { ...copy, pid: 880, pidStartedAt: NOW - 900_000 }, probe: alive },
      'impossible-copy',
    ],
    ['record with no generation', { record: { ...record, generation: undefined }, copy, probe: alive }, 'impossible-copy'],
    // A probe that found the identity and never answered is an unprobed record.
    ['probe without a verdict', { record, copy, probe: { pid: 900, pidStartedAt: NOW - 600_000 } }, 'stale-copy'],
    ['probe without a verdict, no copy', { record, copy: null, probe: { pid: 900, pidStartedAt: NOW - 600_000 } }, 'cold-record'],
  ]

  it('decides every input state, and produces every reading it declares', () => {
    const produced = new Set()
    for (const [label, input, expected] of inputs) {
      const out = classifyDaemonPair(input)
      expect(out.reading, label).toBe(expected)
      expect(out.resolution, label).toBe(DAEMON_PAIR_READINGS[expected])
      produced.add(out.reading)
    }
    expect([...produced].sort()).toEqual(Object.keys(DAEMON_PAIR_READINGS).sort())
  })

  it('an impossible reading always says what made it impossible', () => {
    for (const [label, input, expected] of inputs) {
      if (expected !== 'impossible-copy') continue
      expect(classifyDaemonPair(input).reason, label).toBeTruthy()
    }
  })

  it('the invariant predicate refuses exactly what the write orders cannot produce', () => {
    expect(daemonPairInvariantHolds({ record, copy: { ...copy, generation: 8 } })).toBe(false)
    expect(daemonPairInvariantHolds({ record, copy: { ...copy, pid: 880, pidStartedAt: NOW } })).toBe(false)
    expect(daemonPairInvariantHolds({ record, copy })).toBe(true)
    expect(daemonPairInvariantHolds({ record, copy: older })).toBe(true)
    expect(daemonPairInvariantHolds({ record, copy: null })).toBe(true)
    expect(daemonPairInvariantHolds({ record: null, copy })).toBe(true)
  })

  it('liveness is never read from the copy — only the record probes', () => {
    expect(classifyDaemonPair({ record, copy, probe: dead }).reading).toBe('stale-copy')
    expect(classifyDaemonPair({ record, copy, probe: { ...alive, live: false } }).reading).toBe('stale-copy')
  })
})

describe('the coordinator credential', () => {
  const gen = 'g-4f2a91bc'
  const current = credential({ generation: gen, fence: 604, seq: 3 }).credential

  it('is a triple, and refuses to be built from anything less', () => {
    expect(credential({ generation: 'short', fence: 1, seq: 0 }).ok).toBe(false)
    expect(credential({ generation: gen, fence: 0, seq: 0 }).ok).toBe(false)
    expect(credential({ generation: gen, fence: 1, seq: -1 }).ok).toBe(false)
    expect(credential({ generation: gen, fence: 1, seq: 0 }).ok).toBe(true)
  })

  it('refuses a publication whose credential update would be a no-op', () => {
    const push = publicationPush({ current, next: current, expectedOid: 'oid1', refs: ['main'] })
    expect(push.ok).toBe(false)
    expect(push.reason).toMatch(/no-op/)
  })

  it('refuses a credential that moves BACKWARDS, which a no-op check alone would let through', () => {
    const back = credential({ generation: gen, fence: 604, seq: 2 }).credential
    expect(publicationPush({ current, next: back, expectedOid: 'oid1', refs: ['main'] }).reason).toMatch(/backwards/)
    const olderFence = credential({ generation: gen, fence: 603, seq: 99 }).credential
    expect(publicationPush({ current, next: olderFence, expectedOid: 'oid1', refs: ['main'] }).ok).toBe(false)
    // A new fence with a restarted seq IS an advance.
    const newFence = credential({ generation: gen, fence: 605, seq: 0 }).credential
    expect(publicationPush({ current, next: newFence, expectedOid: 'oid1', refs: ['main'] }).ok).toBe(true)
  })

  it('refuses a malformed credential on either side rather than comparing undefined', () => {
    expect(publicationPush({ current, next: { generation: gen, fence: 605 }, expectedOid: 'o', refs: ['main'] }).ok).toBe(
      false,
    )
    expect(
      publicationPush({ current: { generation: gen }, next: advancedCredential(current).credential, expectedOid: 'o', refs: ['main'] })
        .ok,
    ).toBe(false)
  })

  it('returns the value that must be written into the ref, so lease and payload cannot come apart', () => {
    const next = advancedCredential(current).credential
    expect(publicationPush({ current, next, expectedOid: 'oid1', refs: ['main'] }).credential).toEqual(next)
  })

  it('builds one atomic push carrying the work and the credential under a lease', () => {
    const next = advancedCredential(current).credential
    const push = publicationPush({ current, next, expectedOid: 'oid1', refs: ['main'] })
    expect(push.ok).toBe(true)
    expect(push.args).toEqual([
      'push',
      '--atomic',
      `--force-with-lease=${CREDENTIAL_REF}:oid1`,
      'origin',
      'main',
      CREDENTIAL_REF,
    ])
  })

  it('the very first advance leases the ref ABSENCE', () => {
    const first = credential({ generation: gen, fence: 604, seq: 0 }).credential
    const push = publicationPush({ current: null, next: first, expectedOid: '', refs: ['main'] })
    expect(push.ok).toBe(true)
    expect(push.args).toContain(`--force-with-lease=${CREDENTIAL_REF}:`)
  })

  it('refuses a publication with no lease at all, and one that carries no work', () => {
    const next = advancedCredential(current).credential
    expect(publicationPush({ current, next, refs: ['main'] }).ok).toBe(false)
    expect(publicationPush({ current, next, expectedOid: 'oid1', refs: [] }).ok).toBe(false)
  })

  it('a publication never changes the generation; recovery mints one', () => {
    const foreign = credential({ generation: 'g-otherrrr', fence: 604, seq: 4 }).credential
    expect(publicationPush({ current, next: foreign, expectedOid: 'oid1', refs: ['main'] }).ok).toBe(false)
  })

  it('refuses a credential from a previous generation, a stale fence and a stale seq', () => {
    expect(credentialAccepted({ generation: 'g-oldstore', fence: 999, seq: 9 }, current).reason).toMatch(/foreign/)
    expect(credentialAccepted({ generation: gen, fence: 603, seq: 99 }, current).reason).toMatch(/stale fence/)
    expect(credentialAccepted({ generation: gen, fence: 604, seq: 2 }, current).reason).toMatch(/stale seq/)
    expect(credentialAccepted({ generation: gen, fence: 604, seq: 3 }, current).ok).toBe(true)
    expect(credentialAccepted({ generation: gen, fence: 605, seq: 0 }, current).ok).toBe(true)
  })

  it('refuses a credential that carries no numbers at all instead of comparing undefined', () => {
    expect(credentialAccepted({ generation: gen }, current).ok).toBe(false)
    expect(credentialAccepted({ generation: gen, fence: 604 }, current).ok).toBe(false)
    expect(credentialAccepted({ generation: gen, fence: '604', seq: 3 }, current).ok).toBe(false)
    expect(credentialAccepted(current, { generation: gen }).ok).toBe(false)
    expect(credentialAccepted(null, current).ok).toBe(false)
  })

  it('minting is fail-closed on the fence store AND on the journal', () => {
    const store = { generation: gen, fence: 604 }
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: 604 })).toEqual({ ok: true, next: 605 })
    expect(mayMintFence({ fenceStore: null, journalOk: true }).reason).toMatch(/missing/)
    expect(mayMintFence({ fenceStore: { fence: 604 }, journalOk: true }).reason).toMatch(/lost its generation/)
    expect(mayMintFence({ fenceStore: store, journalOk: false }).reason).toMatch(/journal/)
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: 700 }).reason).toMatch(/high water/)
  })

  it('an unreadable high water mark refuses minting instead of constraining nothing', () => {
    // `fence < NaN` answers false, so the broken evidence would ADMIT the mint.
    const store = { generation: gen, fence: 604 }
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: NaN }).reason).toMatch(/unreadable/)
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: '700' }).ok).toBe(false)
    // Journal fences start at 1, so zero and negatives are broken evidence too.
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: 0 }).ok).toBe(false)
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: -3 }).ok).toBe(false)
    // Null and undefined mean an EMPTY journal, which really does constrain nothing.
    expect(mayMintFence({ fenceStore: store, journalOk: true, journalHighWater: null }).ok).toBe(true)
  })

  it('the lease and the claimed current credential must agree about absence, in both directions', () => {
    // `current: null` beside a lease on a REAL oid skips every advance check while
    // the remote lease still matches — that push is a rollback door.
    const first = credential({ generation: gen, fence: 604, seq: 0 }).credential
    expect(publicationPush({ current: null, next: first, expectedOid: 'oid1', refs: ['main'] }).reason).toMatch(/absence/)
    const next = advancedCredential(current).credential
    expect(publicationPush({ current, next, expectedOid: '', refs: ['main'] }).reason).toMatch(/leased as absent/)
  })

  it('absence is null or undefined and nothing looser, and the lease is a primitive string', () => {
    // `current: false` is not "no credential is published", and a String OBJECT
    // passes `!== ''` while interpolating into an empty lease.
    const first = credential({ generation: gen, fence: 604, seq: 0 }).credential
    expect(publicationPush({ current: false, next: first, expectedOid: '', refs: ['main'] }).ok).toBe(false)
    const next = advancedCredential(current).credential
    expect(publicationPush({ current, next, expectedOid: new String(''), refs: ['main'] }).ok).toBe(false)
    expect(publicationPush({ current, next, expectedOid: 42, refs: ['main'] }).ok).toBe(false)
  })
})

describe('mutation validation — the fence IS the coordinator epoch', () => {
  const lock = { sessionId: 's1', fence: 604, pid: 500, pidStartedAt: NOW - 10_000, leaseUntil: NOW + 60_000 }
  const probe = { pid: 500, startedAt: NOW - 10_000, live: true }
  const presented = { sessionId: 's1', fence: 604 }

  it('accepts only when session, fence and liveness all hold at that instant', () => {
    expect(validateMutation({ presented, lock, probe, now: NOW }).ok).toBe(true)
    expect(validateMutation({ presented, lock: null, probe, now: NOW }).reason).toMatch(/no batch lock/)
    expect(validateMutation({ presented: { ...presented, sessionId: 's2' }, lock, probe, now: NOW }).ok).toBe(false)
    expect(validateMutation({ presented: { ...presented, fence: 603 }, lock, probe, now: NOW }).reason).toMatch(/stale fence/)
    expect(validateMutation({ presented, lock, probe: { ...probe, startedAt: NOW - 900_000 }, now: NOW }).ok).toBe(false)
    expect(validateMutation({ presented, lock, probe, now: NOW + 120_000 }).reason).toMatch(/lease has expired/)
  })

  it('requires an AFFIRMATIVE live verdict, not merely the absence of a dead one', () => {
    expect(validateMutation({ presented, lock, probe: { ...probe, live: false }, now: NOW }).ok).toBe(false)
    expect(validateMutation({ presented, lock, probe: null, now: NOW }).reason).toMatch(/not probed live/)
    // A probe that found the identity but never answered the question: matching pid
    // and start time, no verdict. That is a failed probe, not a live owner.
    const { live: _unanswered, ...noVerdict } = probe
    expect(validateMutation({ presented, lock, probe: noVerdict, now: NOW }).ok).toBe(false)
    expect(validateMutation({ presented, lock, probe: { ...probe, live: 'yes' }, now: NOW }).ok).toBe(false)
  })

  it('refuses a lock whose lease is missing or unreadable rather than treating it as unexpiring', () => {
    const { leaseUntil: _gone, ...noLease } = lock
    expect(validateMutation({ presented, lock: noLease, probe, now: NOW }).reason).toMatch(/no usable lease/)
    expect(validateMutation({ presented, lock: { ...lock, leaseUntil: 'soon' }, probe, now: NOW }).ok).toBe(false)
  })

  it('compensates when the lock moved under the write', () => {
    expect(revalidateAfterWrite({ validated: presented, lock }).verdict).toBe('stands')
    expect(revalidateAfterWrite({ validated: presented, lock: { ...lock, fence: 605 } }).verdict).toBe('compensate')
    expect(revalidateAfterWrite({ validated: presented, lock: null }).verdict).toBe('compensate')
  })

  it('refuses a presentation that carries no session or no usable fence — two absences compare equal', () => {
    // A lock that lost sessionId and fence beside a presentation that never had
    // them: undefined === undefined passes both equality gates without this rule.
    const degenerateLock = { pid: 500, pidStartedAt: NOW - 10_000, leaseUntil: NOW + 60_000 }
    expect(validateMutation({ presented: {}, lock: degenerateLock, probe, now: NOW }).reason).toMatch(/no session/)
    expect(validateMutation({ presented: { sessionId: 's1' }, lock: degenerateLock, probe, now: NOW }).reason).toMatch(/no usable fence/)
    expect(validateMutation({ presented: { sessionId: 's1', fence: 0 }, lock, probe, now: NOW }).ok).toBe(false)
    expect(validateMutation({ presented: { sessionId: '', fence: 604 }, lock, probe, now: NOW }).ok).toBe(false)
  })

  it('a revalidation that cannot name what it validated compensates rather than standing', () => {
    const { sessionId: _s, fence: _f, ...bareLock } = lock
    expect(revalidateAfterWrite({ validated: {}, lock: bareLock }).verdict).toBe('compensate')
    expect(revalidateAfterWrite({ validated: { sessionId: 's1' }, lock: { ...bareLock, sessionId: 's1' } }).verdict).toBe('compensate')
  })
})

describe('the daemon command table', () => {
  // One payload per registered command. The enumerating case below fails when a
  // command is added without one, so a new mutation cannot arrive unkeyed.
  const payloads = {
    'queue-job': { batchId: 'b1', pointId: 834, requestId: 'r1' },
    'start-attempt': { batchId: 'b1', pointId: 834, attemptId: 'a1' },
    'grant-lease': { batchId: 'b1', attemptId: 'a1', requestId: 'r2' },
    'request-checkpoint': { batchId: 'b1', requestId: 'r3' },
    'adopt-attempt': { batchId: 'b1', attemptId: 'a1', fence: 605 },
    'cancel-attempt': { batchId: 'b1', attemptId: 'a1', requestId: 'r4' },
    'record-state': { batchId: 'b1', attemptId: 'a1', state: 'running', at: NOW },
  }

  it('every registered command has an idempotency case, and applying it twice changes the state once', () => {
    expect(Object.keys(payloads).sort()).toEqual(Object.keys(DAEMON_COMMANDS).sort())
    for (const [name, payload] of Object.entries(payloads)) {
      const keyed = idempotencyKey(name, payload)
      expect(keyed.ok, name).toBe(true)
      const applied = new Set()
      let changes = 0
      for (const _pass of [1, 2]) {
        const out = applyOnce(applied, keyed.key, () => {
          changes += 1
        })
        expect(out.ok, name).toBe(true)
        if (out.applied) applied.add(keyed.key)
      }
      expect(changes, name).toBe(1)
    }
  })

  it('every registered command declares a compensation', () => {
    for (const [name, spec] of Object.entries(DAEMON_COMMANDS)) {
      expect(spec.compensation, name).toBeTruthy()
      expect(spec.keyFields.length, name).toBeGreaterThan(0)
    }
  })

  it('the same request keys the same twice and a different one keys differently', () => {
    const a = idempotencyKey('queue-job', payloads['queue-job']).key
    const b = idempotencyKey('queue-job', { ...payloads['queue-job'] }).key
    const c = idempotencyKey('queue-job', { ...payloads['queue-job'], requestId: 'r9' }).key
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('refuses to key a payload that cannot answer the key fields', () => {
    expect(idempotencyKey('queue-job', { batchId: 'b1' }).reason).toMatch(/missing/)
    expect(idempotencyKey('no-such-command', {}).ok).toBe(false)
  })

  it('registration refuses a command without a compensation or without a key', () => {
    expect(registerDaemonCommand(DAEMON_COMMANDS, 'prune-logs', { keyFields: ['batchId'] }).reason).toMatch(
      /no compensation/,
    )
    expect(registerDaemonCommand(DAEMON_COMMANDS, 'prune-logs', { compensation: 'restore-logs' }).reason).toMatch(
      /no idempotency key/,
    )
    const ok = registerDaemonCommand(DAEMON_COMMANDS, 'prune-logs', {
      compensation: 'restore-logs',
      keyFields: ['batchId', 'requestId'],
    })
    expect(ok.ok).toBe(true)
    expect(ok.table['prune-logs'].compensation).toBe('restore-logs')
    expect(DAEMON_COMMANDS['prune-logs']).toBeUndefined()
  })

  it('refuses to register a published act as a compensable mutation', () => {
    for (const act of PUBLISHED_ACTS) {
      const out = registerDaemonCommand(DAEMON_COMMANDS, act, { compensation: 'x', keyFields: ['batchId'] })
      expect(out.ok, act).toBe(false)
      expect(out.reason).toMatch(/published act/)
    }
  })

  it('refuses to re-register a name that is already taken', () => {
    expect(registerDaemonCommand(DAEMON_COMMANDS, 'queue-job', { compensation: 'x', keyFields: ['batchId'] }).ok).toBe(
      false,
    )
  })

  it('a value containing the old delimiter cannot collide two different payloads into one key', () => {
    // With space-joined material, { f2: 'b f3=c', f3: 'd' } and { f2: 'b', f3: 'c f3=d' }
    // hashed identically — and a collided key silently drops the second mutation.
    const { table } = registerDaemonCommand({}, 'probe-cmd', { compensation: 'x', keyFields: ['f1', 'f2', 'f3'] })
    const a = idempotencyKey('probe-cmd', { f1: 'a', f2: 'b f3=c', f3: 'd' }, { table })
    const b = idempotencyKey('probe-cmd', { f1: 'a', f2: 'b', f3: 'c f3=d' }, { table })
    expect(a.ok).toBe(true)
    expect(a.key).not.toBe(b.key)
  })

  it('an inherited property does not read as already applied', () => {
    const out = applyOnce({}, 'constructor', () => 'ran')
    expect(out.applied).toBe(true)
    expect(out.result).toBe('ran')
  })

  it('non-finite key values are refused, and inherited payload fields are not answers', () => {
    // Canonical JSON serialises NaN and Infinity both as null — two distinct
    // payloads, one key, second mutation silently dropped.
    const { table } = registerDaemonCommand({}, 'probe-cmd', { compensation: 'x', keyFields: ['f1'] })
    expect(idempotencyKey('probe-cmd', { f1: NaN }, { table }).reason).toMatch(/non-finite/)
    expect(idempotencyKey('probe-cmd', { f1: Infinity }, { table }).reason).toMatch(/non-finite/)
    const inherited = Object.create({ f1: 'from-the-prototype' })
    expect(idempotencyKey('probe-cmd', inherited, { table }).reason).toMatch(/missing/)
  })

  it('a mutation without a key cannot be applied at all', () => {
    expect(applyOnce(new Set(), '', () => {}).ok).toBe(false)
  })
})

describe('journal framing', () => {
  const entry = { seq: 12, fence: 604, kind: 'record-state', payload: { state: 'running', attemptId: 'a1' } }

  it('frames and parses back to the same entry', () => {
    const framed = frameEntry(entry)
    expect(framed.ok).toBe(true)
    expect(framed.line.endsWith('\n')).toBe(true)
    const parsed = parseFramedLine(framed.line)
    expect(parsed.ok).toBe(true)
    expect(parsed.entry).toEqual({ ...entry, v: SCHEMA_VERSION })
  })

  it('refuses an entry without seq, fence or kind', () => {
    expect(frameEntry({ ...entry, seq: undefined }).ok).toBe(false)
    expect(frameEntry({ ...entry, fence: undefined }).ok).toBe(false)
    expect(frameEntry({ ...entry, kind: undefined }).ok).toBe(false)
    expect(frameEntry(null).ok).toBe(false)
  })

  it('refuses an entry that carries the frame own checksum key, which would fail its own read-back', () => {
    expect(frameEntry({ ...entry, c: 'caller-noise' }).reason).toMatch(/checksum/)
  })

  it('validates the same fields it serialises — inherited frame fields are not an entry', () => {
    // Prototype reads would validate seq, fence and kind that `{ ...entry }` then
    // drops, framing a line the parser itself rejects.
    const inherited = Object.create(entry)
    expect(frameEntry(inherited).ok).toBe(false)
    const partlyOwn = Object.assign(Object.create(entry), { payload: { state: 'running' } })
    expect(frameEntry(partlyOwn).ok).toBe(false)
  })

  it('reads a half-written tail as TRUNCATED, not as data', () => {
    const line = frameEntry(entry).line
    const half = line.slice(0, Math.floor(line.length / 2))
    expect(parseFramedLine(half).reason).toMatch(/truncated/)
  })

  it('catches a tampered record in the middle by its checksum', () => {
    const parsedLine = JSON.parse(frameEntry(entry).line)
    parsedLine.payload.state = 'landed'
    expect(parseFramedLine(JSON.stringify(parsedLine)).reason).toMatch(/checksum/)
    const { c: _dropped, ...noChecksum } = parsedLine
    expect(parseFramedLine(JSON.stringify(noChecksum)).reason).toMatch(/no checksum/)
    expect(parseFramedLine('   ').ok).toBe(false)
  })

  it('a checksummed line that is not a frame is still refused', () => {
    // The checksum proves integrity, not validity: this line checksums perfectly
    // and still names no position and no fence, so it must not enter as data.
    const bare = { kind: 'record-state', payload: {} }
    const line = canonicalJson({ ...bare, c: checksumOf(bare) })
    expect(parseFramedLine(line).reason).toMatch(/malformed/)
    const noKind = { seq: 3, fence: 604, payload: {} }
    expect(parseFramedLine(canonicalJson({ ...noKind, c: checksumOf(noKind) })).reason).toMatch(/malformed/)
  })

  it('hashes by meaning rather than by key order', () => {
    const a = frameEntry({ seq: 1, fence: 604, kind: 'k', payload: { b: 2, a: 1 } }).line
    const b = frameEntry({ kind: 'k', payload: { a: 1, b: 2 }, fence: 604, seq: 1 }).line
    expect(a).toBe(b)
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1}')
  })
})

describe('the journal tail that cannot prove its own order', () => {
  const transitions = [
    { seq: 1, fence: 604 },
    { seq: 10, fence: 605 },
  ]
  const entries = [
    { seq: 2, fence: 604, kind: 'record-state' },
    { seq: 9, fence: 604, kind: 'record-state' },
    { seq: 11, fence: 605, kind: 'record-state' },
    { seq: 12, fence: 604, kind: 'record-state' },
  ]

  it('reads the fence in force at a position rather than the reader own fence', () => {
    expect(fenceInForceAt(transitions, 2)).toBe(604)
    expect(fenceInForceAt(transitions, 10)).toBe(605)
    expect(fenceInForceAt(transitions, 0)).toBe(null)
  })

  it('keeps confirmed predecessor history and quarantines only the entry whose fence was not in force', () => {
    const marked = markUnverifiedTail({ entries, transitions, lastConfirmedSeq: 12, currentFence: 605 })
    expect(marked.filter((e) => e.unverified)).toHaveLength(0)
    expect(marked.filter((e) => e.quarantine).map((e) => e.seq)).toEqual([12])
  })

  it('marks everything after the last confirmed position when the current credential has no transition', () => {
    const marked = markUnverifiedTail({ entries, transitions, lastConfirmedSeq: 9, currentFence: 606 })
    expect(marked.filter((e) => e.unverified).map((e) => e.seq)).toEqual([11, 12])
    expect(marked.find((e) => e.seq === 2).unverified).toBeUndefined()
  })

  it('quarantines an entry standing where no fence was in force, and one that names no position', () => {
    // "No fence was in force" is not "no rule applies": before the first transition
    // nothing authorized any write, and an entry without a seq cannot be placed.
    const marked = markUnverifiedTail({
      entries: [
        { seq: 1, fence: 604, kind: 'record-state' },
        { fence: 605, kind: 'record-state' },
      ],
      transitions: [{ seq: 2, fence: 604 }],
      lastConfirmedSeq: 5,
      currentFence: 604,
    })
    expect(marked[0].quarantine).toMatch(/no fence was in force/)
    expect(marked[1].quarantine).toMatch(/unplaceable/)
  })
})
