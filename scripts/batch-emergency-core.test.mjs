import { describe, expect, it } from 'vitest'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import {
  EMERGENCY_COOLDOWN_MS,
  EMERGENCY_THRESHOLD_MS,
  activeVeto,
  emergencyDecision,
  emergencyHandoffPrompt,
  latestProgressAt,
  strikeRecord,
} from './batch-emergency-core.mjs'

const NOW = Date.parse('2026-08-26T20:00:00Z')
const progressAt = NOW - 2 * EMERGENCY_THRESHOLD_MS
const report = (className = ACTIVITY_CLASSES.NO_WORKER) => ({
  window: { start: progressAt - EMERGENCY_THRESHOLD_MS, end: NOW },
  timeline: [
    { start: progressAt - 1000, end: progressAt, className: ACTIVITY_CLASSES.FOREGROUND },
    { start: progressAt, end: NOW, className },
  ],
})

describe('the independent emergency decision', () => {
  it('stands down for a pause, a clocked veto, and an empty workable queue', () => {
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], paused: true }).reason).toBe('batch-paused')
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], veto: { reason: 'operator drill', until: NOW + 1 } }).reason).toBe('clocked-veto')
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [] }).reason).toBe('no-workable-points')
    expect(activeVeto({ reason: 'expired', until: NOW - 1 }, NOW)).toBe(false)
  })

  it('does nothing while measured progress is inside the hour', () => {
    const recent = report()
    recent.timeline[0].end = NOW - EMERGENCY_THRESHOLD_MS + 1
    expect(emergencyDecision({ now: NOW, report: recent, workablePoints: [947] })).toMatchObject({
      action: 'observe', strike: false, reason: 'progress-within-threshold',
    })
  })

  it('makes the first overdue strike soft', () => {
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947] })).toMatchObject({
      action: 'soft-recover', strike: true, progressAt, workablePoints: [947],
    })
  })

  it('makes a second strike HARD only when the first recovery did not move the progress boundary', () => {
    const state = { lastStrikeAt: NOW - EMERGENCY_COOLDOWN_MS - 1, lastStrikeProgressAt: progressAt }
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], state })).toMatchObject({
      action: 'hard-recover', strike: true, reason: 'batch-still-stalled-after-recorded-recovery',
    })
    const moved = report()
    moved.timeline[0].end = progressAt + 1
    expect(emergencyDecision({ now: NOW, report: moved, workablePoints: [947], state }).action).toBe('soft-recover')
  })

  it('debounces duplicate scheduler starts and fails safe without a bounded evidence window', () => {
    const state = { lastStrikeAt: NOW - EMERGENCY_COOLDOWN_MS + 1, lastStrikeProgressAt: progressAt }
    expect(emergencyDecision({ now: NOW, report: report(), workablePoints: [947], state }).reason).toBe('strike-cooldown')
    expect(emergencyDecision({ now: NOW, report: {}, workablePoints: [947] }).reason).toBe('no-bounded-evidence-window')
  })

  it('takes the latest end of real advancing work, never owner presence', () => {
    expect(latestProgressAt(report(ACTIVITY_CLASSES.IDLE_OWNER))).toBe(progressAt)
    expect(latestProgressAt({
      window: { start: 1 },
      timeline: [
        { end: 4, className: ACTIVITY_CLASSES.FOREGROUND },
        { end: 8, className: ACTIVITY_CLASSES.VERIFICATION },
        { end: 12, className: ACTIVITY_CLASSES.IDLE_OWNER },
      ],
    })).toBe(8)
  })

  it('records the strike, evidence, outcome phase and exact veto command', () => {
    const decision = emergencyDecision({ now: NOW, report: report(), workablePoints: [947] })
    expect(strikeRecord({ id: 's1', decision, at: NOW, phase: 'intent' })).toMatchObject({
      id: 's1', phase: 'intent', action: 'soft-recover', progressAt, workablePoints: [947],
    })
    expect(strikeRecord({ id: 's1', decision, at: NOW }).veto).toMatch(/--veto.*--until/)
  })

  it('hands a hard-wedge successor to the next workable point with a recorded override', () => {
    const prompt = emergencyHandoffPrompt({
      pending: { phase: 'intent', action: 'hard-recover', workablePoints: [947, 948, 949] },
    })
    expect(prompt).toMatch(/point 947 made no progress/)
    expect(prompt).toMatch(/commission-guard\.mjs --override 948/)
    expect(prompt).toMatch(/then work point 948/)
    expect(emergencyHandoffPrompt({ lastOutcome: {} })).toBe('')
  })
})
