// THE PARENT-DEATH DRILL AS A REGRESSION (point 834): the scenario that
// reproduces the run lost on 21.08.2026 — the spawning session's process group
// SIGKILLed mid-authoring — must keep passing, and an unknown scenario must be
// refused rather than reported as a passed nothing.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'
import { runDrill, staleProbeRefused, STALE_REFUSAL } from './batch-daemon-drill.mjs'

// THE DOCUMENTED ENTRYPOINT IS THE ONE UNDER TEST. The architecture promises
// `node scripts/batch-daemon.mjs drill --scenario parent-death`; a suite that
// calls runDrill() directly would stay green while that command is absent or
// broken (cross-vendor review of point 834, B1). Exit code and JSON come from
// the same run, so the drill itself is exercised exactly once.
const exec = promisify(execFile)
const drillCli = (...flags) =>
  exec(process.execPath, ['scripts/batch-daemon.mjs', 'drill', ...flags], { maxBuffer: 16 * 1024 * 1024 }).then(
    (r) => ({ ...r, code: 0 }),
    (err) => ({ stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? -1 }),
  )

// EVERY check the drill performs, IN ORDER — the complete takeover contract,
// not a sample of it. An earlier version pinned four names and left real
// acquisition, fence advancement, discovery, both stale refusals,
// reconciliation and adoption free to be deleted without a red test
// (cross-vendor review of point 834, H5). Deliberately exact and deliberately
// brittle: a rewrite that drops, reorders or renames a requirement must come
// here and say so.
const REQUIRED_CHECKS = [
  'parent session reached mid-authoring',
  'the parent reported the fence its acquisition minted',
  'the state store names the daemon before the kill',
  'the durable lease names the worker the daemon spawned',
  'the worker is alive under its lease identity before the kill',
  'the worker pushed while the parent lived',
  'the parent group is dead',
  'the daemon survived under its recorded pid and start time',
  'the durable record after the kill still names that same daemon',
  'the worker pushed a SHA that did not exist at the kill',
  'the pushing worker is the same process the daemon spawned before the kill',
  "the fresh session acquired the dead owner's lock through the real path",
  'that acquisition minted a fence strictly above the dispossessed one',
  'acquisition handed the successor no daemon identity — discovery must find it',
  'the fresh session DISCOVERED the surviving daemon in durable state',
  'discovery wrote the daemon copy from the record, through the pair resolution',
  'reconciliation read the surviving lane as running before any adoption',
  'the fresh session adopted the attempt under the new fence, after reconciliation',
  "the dead session's (sessionId, fence) is REFUSED after the takeover",
  'the superseded fence is REFUSED even under the live session id',
  'a new checkpoint request was ACKNOWLEDGED by that daemon',
  'the acknowledged checkpoint was pushed and clean',
  'one post-adoption lifecycle operation completed: cancellation',
  'the cancellation preserved the branch',
  'the daemon drained on request',
  'the journal replays clean after the handover shutdown',
  'the shutdown was journalled under the successor fence',
]

describe('the documented drill entrypoint', () => {
  it('refuses an unknown scenario instead of passing it silently', async () => {
    const res = await runDrill({ scenario: 'made-up' })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/unknown scenario/)
  })

  it('refuses an unknown scenario THROUGH THE CLI, with exit code 1 and the reason in its JSON', async () => {
    const ran = await drillCli('--scenario', 'made-up')
    expect(ran.code, ran.stderr).toBe(1)
    expect(JSON.parse(ran.stdout).reason).toMatch(/unknown scenario/)
  })

  it('parent-death: daemon and worker survive the killed session and a fresh session adopts them', async () => {
    const ran = await drillCli('--scenario', 'parent-death')
    expect(ran.stdout, ran.stderr).not.toBe('')
    const result = JSON.parse(ran.stdout)
    const failed = (result.checks ?? []).filter((c) => !c.ok)
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([])
    expect(result.ok).toBe(true)
    expect(ran.code, ran.stderr).toBe(0)
    // The drill's evidence is its named checks, and ALL of them are
    // load-bearing: the exact ordered list, so no rewrite can quietly drop
    // discovery, the fence mint, a stale refusal or the identity pins and
    // leave `failed` empty over a hollowed-out drill.
    expect(result.checks.map((c) => c.name)).toEqual(REQUIRED_CHECKS)
  }, 120_000)
})

describe('staleProbeRefused', () => {
  // THE NEGATIVE CONTROL FOR THE TWO STALE PROBES: the judge itself must catch
  // a daemon whose epoch enforcement was removed. Such a daemon ANSWERS the
  // stale request with ok:true — these are the replies the drill would then
  // feed this judge, and each must come back red.
  it('fails an ACCEPTING daemon — the neutered case the probes exist to catch', () => {
    const neutered = staleProbeRefused({ ok: true, result: { answers: [] }, fence: 7 })
    expect(neutered.ok).toBe(false)
    expect(neutered.why).toMatch(/does not enforce the epoch/)
  })

  it('fails a probe that failed for any reason OTHER than staleness', () => {
    // A timeout, a dead socket or an unrelated validation failure says nothing
    // about the fence; `ok !== true` alone would have passed all of them.
    for (const reason of [
      'the daemon did not answer within 2000ms',
      'no control socket: connect ECONNREFUSED',
      'the lock owner was not probed live',
      undefined,
    ]) {
      const failed = staleProbeRefused({ ok: false, reason })
      expect(failed.ok, String(reason)).toBe(false)
      expect(failed.why).toMatch(/not for staleness/)
    }
  })

  it('passes exactly the two staleness refusals validation produces', () => {
    for (const reason of ['the lock names another session', 'stale fence: presented 7, the lock carries 9']) {
      expect(STALE_REFUSAL.test(reason)).toBe(true)
      const refused = staleProbeRefused({ ok: false, reason })
      expect(refused.ok, reason).toBe(true)
      expect(refused.why).toContain(reason)
    }
  })
})
