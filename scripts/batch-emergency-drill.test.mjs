import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('the total-wedge chaos drill', () => {
  it('recovers a busy owner wedge through the real emergency lane without a human', () => {
    const run = spawnSync(process.execPath, [join(HERE, 'batch-emergency-drill.mjs')], {
      encoding: 'utf8', windowsHide: true, timeout: 30_000,
    })
    expect(run.status, run.stderr).toBe(0)
    const result = JSON.parse(run.stdout)
    expect(result).toMatchObject({
      softAction: 'soft-recover',
      hardAction: 'hard-recover',
      ownerTerminated: true,
      restartAttempts: 2,
      strikeRecords: 4,
      busyActivityIgnored: true,
      liveVerificationProbe: true,
      restoredWithoutHuman: true,
    })
    expect(result.measuredMs).toBeGreaterThanOrEqual(0)
  })
})
