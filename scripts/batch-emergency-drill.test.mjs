import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EMERGENCY_HARD_DEADLINE_MS, EMERGENCY_THRESHOLD_MS } from './batch-emergency-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

const drill = () => {
  const run = spawnSync(process.execPath, [join(HERE, 'batch-emergency-drill.mjs')], {
    encoding: 'utf8', windowsHide: true, timeout: 120_000,
  })
  expect(run.status, run.stderr).toBe(0)
  return JSON.parse(run.stdout)
}

describe('the total-wedge chaos drill (point 1048, union entry U21)', () => {
  const result = drill()

  it('walks the measured 02./03.09. wedge up the ladder and stops inside the stated bound', () => {
    expect(result.wedge).toMatchObject({
      softAction: 'soft-recover',
      hardAction: 'hard-recover',
      hardWithinStatedBound: true,
      busyActivityIgnored: true,
      liveVerificationProbe: true,
    })
    // The second strike lands after the cooldown and before the absolute
    // deadline: recovery is complete while the stated two-hour bound still has
    // room, which is the promise a reader on a phone is owed.
    expect(result.wedge.hardStalledMs).toBeGreaterThan(EMERGENCY_THRESHOLD_MS)
    expect(result.wedge.hardStalledMs).toBeLessThan(EMERGENCY_HARD_DEADLINE_MS)
  })

  it('recovers the batch, its successor and its own waits without a human', () => {
    expect(result.wedge).toMatchObject({
      ownerTerminated: true,
      restoredWithoutHuman: true,
      restartAttempts: 2,
      // The ten stacked eternal waits go with the session that owned them, and
      // the unrelated session's wait does not (union entry U8).
      waitsRetired: 10,
      strangerWaitLeftAlive: true,
    })
  })

  it('spends one recovery episode on one wedge, and ends it when the queue moves', () => {
    expect(result.wedge).toMatchObject({
      intentRecords: 1,
      outcomeRecords: 2,
      distinctStrikeIds: 1,
      queueMovedAction: 'observe',
      queueMovedReason: 'progress-within-threshold',
    })
    expect(result.wedge.measuredMs).toBeGreaterThanOrEqual(0)
  })

  it('lets the 04.09. deadlock end: a committed boundary stands the CI guard down', () => {
    expect(result.deadlock).toMatchObject({
      sealedApplicable: false,
      sealedCause: 'committed-boundary',
      // Without a boundary the guard runs on past that check, and one session's
      // boundary never speaks for another's turn end (union entry U17).
      withoutBoundarySealed: false,
      otherSessionSealed: false,
    })
  })
})
