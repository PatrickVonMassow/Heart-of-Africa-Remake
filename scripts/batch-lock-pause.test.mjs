// The pause RECORD as it is actually written and read (point 445).
//
// batch-pause-core.test.mjs pins what a record MEANS; this pins the file half —
// above all `setPaused`'s new default, which every existing caller inherits without
// changing a line (scripts/alert-escalation.mjs, scripts/child-retry.mjs): a park
// now carries a clock, and it climbs the ladder that the launcher's retries counted.
//
// EVERY CASE RUNS AGAINST A TEMP PATH. Writing the real `.claude/batch-paused` from
// a test would park the machine's own batch — so the path is passed in, and the
// default is only ever asserted to BE the repo path, never exercised.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearPaused, isPaused, pauseReason, pauseState, retryAttempts, setPaused } from './batch-lock.mjs'
import { PAUSE_RETRY_LADDER_MS, classifyPause } from './batch-pause-core.mjs'

let dir
let path
let statePath
const opts = () => ({ path, statePath })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-pause-'))
  path = join(dir, 'batch-paused')
  statePath = join(dir, 'autostart-state.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('setPaused writes a clocked park by default', () => {
  it('a bare reason still parks — and now says when it may be retried', () => {
    const plan = setPaused('the API refused three agents in ten minutes', opts())
    expect(plan.clockless).toBe(false)
    expect(isPaused(opts())).toBe(true)
    const v = pauseState(Date.now(), opts())
    expect(v.state).toBe('wait')
    expect(v.reason).toBe('the API refused three agents in ten minutes')
    expect(classifyPause({ text: readFileSync(path, 'utf8'), now: Date.now() + PAUSE_RETRY_LADDER_MS[0] + 1 }).state).toBe('retry')
  })

  it('a cause on the unsafe list parks without one', () => {
    setPaused('a serving model outside the allowlist answered', { ...opts(), cause: 'serving-model' })
    const v = pauseState(Date.now(), opts())
    expect(v.state).toBe('hold')
    expect(v.cause).toBe('serving-model')
  })

  it('an explicit retryAfter beats the plan — the caller may still decide', () => {
    setPaused('held by hand', { ...opts(), retryAfter: null })
    expect(pauseState(Date.now(), opts()).state).toBe('hold')
  })

  it('the reason comes back without the metadata, and clearPaused removes the file', () => {
    setPaused('two agents died on the same signature', opts())
    expect(pauseReason(opts())).toBe('two agents died on the same signature')
    clearPaused(opts())
    expect(existsSync(path)).toBe(false)
    expect(pauseState(Date.now(), opts()).state).toBe('none')
  })
})

describe('the rung is shared, so a repeating cause reaches a human', () => {
  it('takes the launcher\'s retry count when the caller names none', () => {
    writeFileSync(statePath, JSON.stringify({ failCount: 0, pauseAttempt: 1 }))
    expect(retryAttempts(opts())).toBe(1)
    expect(setPaused('again', opts()).retryAfter).toBeGreaterThan(Date.now() + PAUSE_RETRY_LADDER_MS[0])
  })

  it('takes the rung of the record it replaces when that is higher', () => {
    setPaused('first', { ...opts(), attempt: 2 })
    expect(retryAttempts(opts())).toBe(2)
  })

  // The oscillation the four-eyes review found: without a shared rung an unanswered
  // alert or a standing outage re-parked at 20 minutes for ever and never escalated.
  it('climbs to a clockless park once the ladder is spent', () => {
    writeFileSync(statePath, JSON.stringify({ pauseAttempt: PAUSE_RETRY_LADDER_MS.length }))
    const plan = setPaused('the outage is still there', opts())
    expect(plan.clockless).toBe(true)
    expect(pauseState(Date.now(), opts()).state).toBe('hold')
  })

  it('starts at rung 0 on a machine that has never parked', () => {
    expect(retryAttempts(opts())).toBe(0)
  })
})
