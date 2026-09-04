import { describe, expect, it } from 'vitest'
import {
  BLOCKING_WAIT,
  isProcessPollLoop,
  judgeWaitCommand,
  searchedPatterns,
  selfMatchingPattern,
} from './wait-command-core.mjs'

// The command line measured live in the stalled session on 03.09.2026, 01:00.
const INCIDENT = 'while pgrep -f "npm exec vitest" >/dev/null; do sleep 30; done'

describe('the wait that can never return', () => {
  it('refuses the measured incident and says WHY it cannot end', () => {
    const verdict = judgeWaitCommand(INCIDENT)
    expect(verdict.allowed).toBe(false)
    expect(verdict.kind).toBe('self-matching-poll-loop')
    expect(verdict.pattern).toBe('npm exec vitest')
    expect(verdict.message).toContain('CAN NEVER RETURN')
    expect(verdict.message).toContain(BLOCKING_WAIT)
  })

  it('refuses an ordinary poll loop too, but as the lesser kind', () => {
    const verdict = judgeWaitCommand('until pgrep -f "playwright" >/dev/null; do sleep 10; done')
    // "playwright" IS in this command line, so this one is also self-matching —
    // which is the point: almost every hand-rolled `pgrep -f` watcher is.
    expect(verdict.kind).toBe('self-matching-poll-loop')
    const other = judgeWaitCommand('while kill -0 "$PID" 2>/dev/null; do sleep 5; done')
    expect(other.allowed).toBe(false)
    expect(other.kind).toBe('poll-loop')
    expect(other.pattern).toBe(null)
  })

  it('leaves everything that is not a process poll alone', () => {
    for (const allowed of [
      BLOCKING_WAIT,
      'npm run test:unit',
      'git status --porcelain',
      'pgrep -f "npm exec vitest"', // one probe, no loop: a measurement, not a wait
      'for f in *.png; do echo "$f"; done', // a loop, no sleep, no process probe
      'sleep 5', // a plain sleep is not a poll
      '',
      null,
      undefined,
    ]) {
      expect(judgeWaitCommand(allowed)).toMatchObject({ allowed: true, kind: 'ok' })
    }
  })

  it('recognises the loop shape without the self-match', () => {
    expect(isProcessPollLoop(INCIDENT)).toBe(true)
    expect(isProcessPollLoop('while true; do sleep 30; done')).toBe(false)
    expect(isProcessPollLoop('pgrep -f x; sleep 30')).toBe(false)
  })

  it('reads only the patterns a FULL-command-line search actually uses', () => {
    // Without -f, pgrep matches the executable NAME, which the segment's own
    // text cannot impersonate — so it is not the self-matching defect.
    expect(searchedPatterns('pgrep -f "npm exec vitest"')).toEqual(['npm exec vitest'])
    expect(searchedPatterns('pgrep "vitest"')).toEqual([])
    expect(searchedPatterns('pkill -f "stale-watcher"')).toEqual(['stale-watcher'])
    expect(selfMatchingPattern('pgrep "vitest"')).toBe(null)
  })

  it('is total — any input answers, and unparseable input is allowed', () => {
    for (const input of [null, undefined, 42, {}, [], '   ']) {
      expect(() => judgeWaitCommand(input)).not.toThrow()
      expect(judgeWaitCommand(input).allowed).toBe(true)
    }
  })
})
