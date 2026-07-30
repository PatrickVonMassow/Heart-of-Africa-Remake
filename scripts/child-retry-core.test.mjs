// Layer 5 (point 434 part 3) — the retry decision core.
//
// EVERY CASE NAMES THE INCIDENT IT WOULD HAVE PREVENTED (docs/batch-resilience.md
// §8), because a resilience test that only proves an if-statement proves nothing
// about the night it was written for.
import { describe, it, expect } from 'vitest'
import {
  MAX_RETRIES,
  OUTAGE_WINDOW_MS,
  POINT_TOKEN_CAP,
  RETRY_BACKOFF_MS,
  classifyDeath,
  childKey,
  describeDecision,
  emptyState,
  outagePauseReason,
  outageWitnesses,
  pointRecord,
  promptHint,
  recordCompletion,
  recordDeath,
  recordRetry,
  retryDecision,
} from './child-retry-core.mjs'

const NOW = Date.UTC(2026, 6, 30, 2, 0, 0)
const base = { point: 421, branch: 'feat/421-x', briefRevision: 'abc123', childId: 'agent-1', now: NOW }

describe('classifyDeath — transience is an allowlist, never a guess', () => {
  it('reads the harness API-error death of 29./30.07.2026 as transient', () => {
    // THE NIGHT: both agents died on `API Error: 500 {"type":"error",…}`.
    const c = classifyDeath('API Error: 500 {"type":"error","error":{"type":"api_error"}}')
    expect(c.transient).toBe(true)
    expect(c.signature).toBe('http-500')
  })

  it.each([
    ['HTTP 429 Too Many Requests', 'http-429'],
    ['status 503 Service Unavailable', 'http-503'],
    ['Error: 529 overloaded_error', 'http-529'],
    ['Overloaded', 'http-529'],
    ['read ECONNRESET', 'econnreset'],
    ['connect ETIMEDOUT 160.79.104.10:443', 'etimedout'],
    ['API Error (no status attached)', 'api-error'],
  ])('allowlists %s as %s', (text, signature) => {
    const c = classifyDeath(text)
    expect(c.transient).toBe(true)
    expect(c.signature).toBe(signature)
  })

  it('normalises Overloaded and 529 to ONE signature, so the outage detector sees one cause', () => {
    // Would have prevented: the same outage printing two spellings looks like two
    // unrelated accidents and never trips the two-children threshold.
    expect(classifyDeath('Overloaded').signature).toBe(classifyDeath('Error: 529').signature)
  })

  it.each([
    ['the regression gate is red: 3 tests failed', 'gate-red'],
    ['npm run build failed', 'gate-red'],
    ['render-verify-guard blocked the turn end', 'guard-block'],
    ['PreToolUse hook denied the call', 'guard-block'],
    ['the agent escalated: the brief is insufficient', 'brief-escalated'],
    ['CONFLICT (content): merge conflict in src/App.tsx', 'merge-conflict'],
  ])('refuses %s as non-transient', (text, label) => {
    const c = classifyDeath(text)
    expect(c.transient).toBe(false)
    expect(c.signature).toBe(label)
  })

  it('does NOT read a red gate that happens to print 500 as an HTTP 500', () => {
    // Would have prevented: retrying a deterministic red regression twice because
    // its output contained a three-digit number. The non-transient markers win.
    const c = classifyDeath('vitest failed: 500 assertions, 2 red')
    expect(c.transient).toBe(false)
  })

  it('treats an unrecognised death as NOT transient (the default is no retry)', () => {
    expect(classifyDeath('the agent simply stopped').transient).toBe(false)
    expect(classifyDeath('').transient).toBe(false)
    expect(classifyDeath(undefined).signature).toBe('unknown')
  })

  it('passes an already-normalised signature straight through', () => {
    expect(classifyDeath('http-503')).toEqual({ transient: true, signature: 'http-503', label: 'transient: http-503' })
  })
})

describe('retryDecision — a transient death retries with backoff, up to the cap', () => {
  it('grants the first retry with the first backoff', () => {
    // Would have prevented: a point three commits from done abandoned for the night
    // because one upstream blip killed its agent at 02:00.
    const d = retryDecision({ ...base, death: 'API Error: 500' })
    expect(d.verdict).toBe('retry')
    expect(d.attempt).toBe(1)
    expect(d.backoffMs).toBe(RETRY_BACKOFF_MS[0])
    expect(d.retryAt).toBe(NOW + RETRY_BACKOFF_MS[0])
  })

  it('raises the backoff on the second retry and refuses the third', () => {
    const one = retryDecision({ ...base, death: 'API Error: 500', state: { deaths: [], points: { 421: { retries: 1 } } } })
    expect(one.verdict).toBe('retry')
    expect(one.backoffMs).toBe(RETRY_BACKOFF_MS[1])
    expect(one.backoffMs).toBeGreaterThan(RETRY_BACKOFF_MS[0])

    const two = retryDecision({ ...base, death: 'API Error: 500', state: { deaths: [], points: { 421: { retries: MAX_RETRIES } } } })
    expect(two.verdict).toBe('no-retry')
    expect(two.reason).toMatch(/retries already spent/)
  })

  it('retries on the SAME branch and the SAME brief revision', () => {
    const d = retryDecision({ ...base, death: 'ECONNRESET', state: { deaths: [], points: { 421: { retries: 0, branch: 'feat/421-x', briefRevision: 'abc123' } } } })
    expect(d.verdict).toBe('retry')
    expect(d.branch).toBe('feat/421-x')
    expect(d.promptHint).toContain('feat/421-x')
    expect(d.promptHint).toContain('abc123')
  })

  it('refuses when the branch moved since the first spawn — that is a new spawn', () => {
    const d = retryDecision({ ...base, branch: 'feat/421-y', death: 'ECONNRESET', state: { deaths: [], points: { 421: { retries: 0, branch: 'feat/421-x' } } } })
    expect(d.verdict).toBe('no-retry')
    expect(d.reason).toMatch(/branch changed/)
  })

  it('refuses when the brief was re-cut since the first spawn', () => {
    // Would have prevented: a retry replaying a brief that no longer describes the
    // point, producing work nobody asked for.
    const d = retryDecision({ ...base, briefRevision: 'def456', death: 'ECONNRESET', state: { deaths: [], points: { 421: { retries: 0, briefRevision: 'abc123' } } } })
    expect(d.verdict).toBe('no-retry')
    expect(d.reason).toMatch(/brief revision changed/)
  })
})

describe('retryDecision — CONTINUE rather than repeat when the child committed', () => {
  it('says CONTINUE when the child committed since its spawn', () => {
    // Would have prevented the 30.07. layer-5b incident from the other side: a
    // successor that rebuilt two points the original had already finished.
    const d = retryDecision({ ...base, death: 'API Error: 500', committedSinceSpawn: true })
    expect(d.promptMode).toBe('continue')
    expect(d.promptHint).toMatch(/CONTINUE, do not repeat/)
    expect(d.promptHint).toMatch(/git log/)
  })

  it('says REPEAT when nothing was committed', () => {
    const d = retryDecision({ ...base, death: 'API Error: 500', committedSinceSpawn: false })
    expect(d.promptMode).toBe('repeat')
    expect(d.promptHint).toMatch(/^REPEAT/)
  })
})

describe('retryDecision — a non-transient death is never retried', () => {
  it('refuses a red gate', () => {
    const d = retryDecision({ ...base, death: 'the regression gate is red: 3 tests failed' })
    expect(d.verdict).toBe('no-retry')
    expect(d.reason).toMatch(/gate-red/)
  })

  it('refuses a guard block', () => {
    expect(retryDecision({ ...base, death: 'board-first-guard blocked the call' }).verdict).toBe('no-retry')
  })

  it('refuses an escalated brief', () => {
    // Would have prevented: an agent that asked a question being answered with the
    // same question, twice.
    expect(retryDecision({ ...base, death: 'escalated: the brief does not name the file' }).verdict).toBe('no-retry')
  })

  it('refuses a death it does not recognise', () => {
    expect(retryDecision({ ...base, death: 'agent exited' }).verdict).toBe('no-retry')
  })
})

describe('retryDecision — two children, one signature, one window = OUTAGE', () => {
  it('pauses instead of retrying when a second child dies of the same thing', () => {
    // THE NIGHT OF 29./30.07.2026: both agents died on one 500. Two retries each
    // would have bought four more deaths.
    const state = { deaths: [{ key: 'agent-2', signature: 'http-500', at: NOW - 3 * 60 * 1000 }], points: {} }
    const d = retryDecision({ ...base, death: 'API Error: 500', state })
    expect(d.verdict).toBe('outage-pause')
    expect(d.witnesses).toHaveLength(2)
    expect(d.reason).toMatch(/environment outage/)
  })

  it('does NOT call it an outage when the same child dies twice', () => {
    // A single flaky child is the retry cap's business, not the pause lever's.
    const state = { deaths: [{ key: 'agent-1', signature: 'http-500', at: NOW - 60 * 1000 }], points: {} }
    const d = retryDecision({ ...base, death: 'API Error: 500', state })
    expect(d.verdict).toBe('retry')
  })

  it('does NOT call it an outage when the signatures differ', () => {
    const state = { deaths: [{ key: 'agent-2', signature: 'econnreset', at: NOW - 60 * 1000 }], points: {} }
    expect(retryDecision({ ...base, death: 'API Error: 500', state }).verdict).toBe('retry')
  })

  it('does NOT call it an outage when the other death is outside the window', () => {
    const state = { deaths: [{ key: 'agent-2', signature: 'http-500', at: NOW - OUTAGE_WINDOW_MS - 1000 }], points: {} }
    expect(retryDecision({ ...base, death: 'API Error: 500', state }).verdict).toBe('retry')
  })

  it('outranks the retry budget — an outage pauses even on the first death of a point', () => {
    const state = { deaths: [{ key: 'agent-9', signature: 'http-529', at: NOW - 1000 }], points: {} }
    expect(retryDecision({ ...base, death: 'Overloaded', state }).verdict).toBe('outage-pause')
  })

  it('writes the pause reason in the morning reader’s language, naming the cause and the way out', () => {
    const state = { deaths: [{ key: 'agent-2', signature: 'http-500', at: NOW - 1000 }], points: {} }
    const d = retryDecision({ ...base, death: 'API Error: 500', state })
    const reason = outagePauseReason(d, '30.07.2026, 04:00')
    expect(reason).toMatch(/Umgebungsausfall/)
    expect(reason).toMatch(/http-500/)
    expect(reason).toMatch(/batch-paused/)
  })
})

describe('retryDecision — a child that reported a step complete is never retried', () => {
  it('refuses when the caller reports completion', () => {
    // Would have prevented the 30.07. incident in docs/batch-resilience.md §Layer 5b:
    // a successor rebuilding two finished points.
    const d = retryDecision({ ...base, death: 'API Error: 500', reportedComplete: true })
    expect(d.verdict).toBe('no-retry')
    expect(d.reason).toMatch(/reported a step complete/)
  })

  it('refuses on a LATER death too, because the completion is remembered in the state', () => {
    const state = recordCompletion(emptyState(), { point: 421 })
    expect(retryDecision({ ...base, death: 'API Error: 500', state }).verdict).toBe('no-retry')
  })
})

describe('retryDecision — the token cap bounds one point', () => {
  it('refuses once the point has eaten its budget', () => {
    // Would have prevented: one stubborn point converting a night's token budget
    // into three identical failed builds.
    const d = retryDecision({ ...base, death: 'API Error: 500', tokensUsed: POINT_TOKEN_CAP })
    expect(d.verdict).toBe('no-retry')
    expect(d.reason).toMatch(/cap/)
  })

  it('reads the accumulated tokens from the state when the caller reports none', () => {
    const state = { deaths: [], points: { 421: { retries: 0, tokens: POINT_TOKEN_CAP + 1 } } }
    expect(retryDecision({ ...base, death: 'API Error: 500', state }).verdict).toBe('no-retry')
  })

  it('allows the retry below the cap', () => {
    expect(retryDecision({ ...base, death: 'API Error: 500', tokensUsed: 1000 }).verdict).toBe('retry')
  })
})

describe('retryDecision — stand-down', () => {
  it('stands down for a paused batch', () => {
    const d = retryDecision({ ...base, death: 'API Error: 500', paused: true })
    expect(d.verdict).toBe('stand-down')
    expect(d.reason).toMatch(/paused/)
  })

  it('stands down for a session that does not own the batch lock', () => {
    // Would have prevented: a subagent or a second window deciding to spawn
    // children on the owner's behalf.
    const d = retryDecision({ ...base, death: 'API Error: 500', ownsLock: false })
    expect(d.verdict).toBe('stand-down')
  })

  it('never spawns a spawner: no verdict but retry carries a prompt hint', () => {
    for (const d of [
      retryDecision({ ...base, death: 'gate red: build failed' }),
      retryDecision({ ...base, death: 'API Error: 500', paused: true }),
      retryDecision({ ...base, death: 'API Error: 500', state: { deaths: [{ key: 'x', signature: 'http-500', at: NOW }], points: {} } }),
    ]) {
      expect(d.promptHint).toBeNull()
    }
  })
})

describe('INDEPENDENCE — layer 5 acts while the other layers are missing or stale', () => {
  it('decides with NO state file at all (layers 1-4 wrote nothing)', () => {
    // Would have prevented: a rescue layer that needs the lease, the launcher log
    // and the in-flight declaration to be present before it can answer at all —
    // on the night in question the launcher log simply ENDED.
    const d = retryDecision({ point: 500, branch: 'feat/500-y', death: 'API Error: 503', now: NOW })
    expect(d.verdict).toBe('retry')
    expect(d.attempt).toBe(1)
  })

  it('ignores a corrupt or half-written state document rather than throwing', () => {
    const d = retryDecision({ ...base, death: 'API Error: 500', state: { deaths: null, points: 'nonsense' } })
    expect(d.verdict).toBe('retry')
  })

  it('ignores STALE death records — an old outage does not paralyse tonight', () => {
    const stale = { deaths: [{ key: 'agent-2', signature: 'http-500', at: NOW - 5 * 60 * 60 * 1000 }], points: {} }
    expect(retryDecision({ ...base, death: 'API Error: 500', state: stale }).verdict).toBe('retry')
  })

  it('ignores a death record from the FUTURE (a clock jump) instead of trusting it', () => {
    const skewed = { deaths: [{ key: 'agent-2', signature: 'http-500', at: NOW + 60 * 60 * 1000 }], points: {} }
    expect(retryDecision({ ...base, death: 'API Error: 500', state: skewed }).verdict).toBe('retry')
  })
})

describe('state transitions are pure', () => {
  it('recordDeath appends and prunes what aged out, without mutating the input', () => {
    const start = { deaths: [{ key: 'old', signature: 'http-500', at: NOW - 7 * 60 * 60 * 1000 }], points: {} }
    const next = recordDeath(start, { point: 421, branch: 'feat/421-x', childId: 'agent-1', signature: 'http-500', verdict: 'retry', at: NOW })
    expect(start.deaths).toHaveLength(1)
    expect(next.deaths).toHaveLength(1)
    expect(next.deaths[0].key).toBe('agent-1')
  })

  it('recordRetry books the attempt against the point and pins branch + brief revision', () => {
    const next = recordRetry(emptyState(), { point: 421, branch: 'feat/421-x', briefRevision: 'abc123', tokensUsed: 42 })
    expect(pointRecord(next, 421)).toEqual({ retries: 1, tokens: 42, branch: 'feat/421-x', briefRevision: 'abc123', completedSteps: 0 })
  })

  it('childKey falls back to point:branch when no child id is known', () => {
    expect(childKey({ point: 7, branch: 'b' })).toBe('7:b')
    expect(childKey({ childId: 'a', point: 7 })).toBe('a')
  })

  it('outageWitnesses counts the current child even before its death is recorded', () => {
    expect(outageWitnesses({ deaths: [], signature: 'http-500', key: 'agent-1', now: NOW })).toEqual(['agent-1'])
  })

  it('describeDecision prints the wait and the prompt hint for a retry only', () => {
    const retry = retryDecision({ ...base, death: 'API Error: 500' })
    expect(describeDecision(retry)).toMatch(/RETRY —/)
    expect(describeDecision(retry)).toMatch(/re-spawn/)
    expect(describeDecision(retryDecision({ ...base, death: 'gate red: tests failed' }))).not.toMatch(/re-spawn/)
  })

  it('promptHint names the branch even when the caller passes none', () => {
    expect(promptHint({ promptMode: 'repeat', branch: null, briefRevision: null, point: 9 })).toMatch(/the same branch/)
  })
})
