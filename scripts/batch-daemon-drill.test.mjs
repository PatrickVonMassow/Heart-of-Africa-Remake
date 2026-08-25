// THE PARENT-DEATH DRILL AS A REGRESSION (point 834): the scenario that
// reproduces the run lost on 21.08.2026 — the spawning session's process group
// SIGKILLed mid-authoring — must keep passing, and an unknown scenario must be
// refused rather than reported as a passed nothing.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'
import { runDrill, staleProbeRefused, expectedStaleRefusal } from './batch-daemon-drill.mjs'
import { startDaemon } from './batch-daemon.mjs'
import { validateMutation } from './batch-schema-core.mjs'

// THE DOCUMENTED ENTRYPOINT IS THE ONE UNDER TEST. The architecture promises
// `node scripts/batch-daemon.mjs drill --scenario parent-death`; a suite that
// calls runDrill() directly would stay green while that command is absent or
// broken (cross-vendor review of point 834, B1). Exit code and JSON come from
// the same run, so the drill itself is exercised exactly once.
const exec = promisify(execFile)
const drillCli = (...flags) =>
  exec(process.execPath, ['scripts/batch-daemon.mjs', 'drill', ...flags], { maxBuffer: 16 * 1024 * 1024, windowsHide: true }).then(
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
  'the worker pushed a SHA that did not exist when the parent died',
  'the pushing worker is the same process the daemon spawned before the kill',
  "the fresh session acquired the dead owner's lock through the real path",
  'that acquisition minted a fence strictly above the dispossessed one',
  'acquisition handed the successor no daemon identity — discovery must find it',
  'the fresh session DISCOVERED the surviving daemon in durable state',
  'discovery wrote the daemon copy from the record, through the pair resolution',
  'reconciliation read the surviving lane as running before any adoption',
  'the fresh session adopted the attempt under the new fence, after reconciliation',
  "the dead session's id is REFUSED after the takeover, under the LIVE fence",
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

  it('goes RED — at exactly the two stale probes — against a real daemon with epoch enforcement OFF', async () => {
    // THE NEGATIVE CONTROL RUNS THE REAL THING, THROUGH THE DOCUMENTED CLI.
    // Feeding a fabricated { ok: true } to staleProbeRefused proved only the
    // judge (cross-vendor review of point 834, B2); this run neuters an actual
    // daemon (the drill-only --neuter-epoch serve flag) and requires the
    // COMPLETE drill to fail, through both real control requests.
    //
    // VIA `drillCli`, not runDrill(), and that is the round-14 repair (P1 on the
    // test): the in-process call bypassed the very entrypoint the positive case
    // pins, so breaking the CLI's forwarding of --neuter-epoch would have left
    // this control green — certifying as negative a drill that had quietly
    // stopped being negative. Exit code and JSON now come from that one CLI run.
    const ran = await drillCli('--scenario', 'parent-death', '--neuter-epoch')
    expect(ran.stdout, ran.stderr).not.toBe('')
    const result = JSON.parse(ran.stdout)
    expect(result.ok).toBe(false)
    expect(ran.code, ran.stderr).toBe(1)
    const failed = (result.checks ?? []).filter((c) => !c.ok)
    expect(failed.map((c) => c.name), JSON.stringify(failed, null, 2)).toEqual([
      "the dead session's id is REFUSED after the takeover, under the LIVE fence",
      'the superseded fence is REFUSED even under the live session id',
    ])
    // …and each failure names ACCEPTANCE OF THE ONE CREDENTIAL that probe
    // presents stale, so the red is the daemon ignoring THAT credential, not
    // some unrelated malfunction of the probe — and not the other check's
    // refusal standing in for it.
    expect(failed.map((c) => c.detail)).toEqual([
      'accepted — the daemon does not enforce the session identity',
      'accepted — the daemon does not enforce the fence',
    ])
  }, 120_000)

  it('refuses to start a neutered daemon outside a drill, before reading any repository state', async () => {
    const refused = await startDaemon({ repoDir: '/nonexistent-on-purpose', batchId: 'x', drill: false, neuterEpoch: true })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/negative control/)
  })

  it('refuses `start --neuter-epoch` THROUGH THE CLI, so the interlock is not merely a function call', async () => {
    // THE FLAG MUST REACH startDaemon. The start branch parsed --neuter-epoch
    // and dropped it, so this command silently started an ORDINARY daemon:
    // startDaemon never saw the flag, serve's interlock never fired, and the
    // only coverage was the direct call above — which cannot notice the
    // omission (round-15 review). A refusal here is the evidence the CLI
    // forwards it.
    const ran = await exec(process.execPath, [
      'scripts/batch-daemon.mjs', 'start', '--repo', '/nonexistent-on-purpose', '--batch', 'x', '--neuter-epoch',
    ], { maxBuffer: 8 * 1024 * 1024, windowsHide: true }).then(
      (r) => ({ ...r, code: 0 }),
      (err) => ({ stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? -1 }),
    )
    expect(ran.code, ran.stdout).toBe(1)
    expect(`${ran.stderr}${ran.stdout}`).toMatch(/negative control/)
  }, 30_000)
})

describe('staleProbeRefused', () => {
  const SESSION = { kind: 'session' }
  const FENCE = { kind: 'fence', presented: 7, carried: 9 }

  // THE NEGATIVE CONTROL FOR THE TWO STALE PROBES: the judge itself must catch
  // a daemon whose enforcement was removed. Such a daemon ANSWERS the stale
  // request with ok:true — these are the replies the drill would then feed this
  // judge, and each must come back red, naming the credential it presented.
  it('fails an ACCEPTING daemon — the neutered case the probes exist to catch', () => {
    for (const [expectation, credential] of [
      [SESSION, 'the session identity'],
      [FENCE, 'the fence'],
    ]) {
      const neutered = staleProbeRefused({ ok: true, result: { answers: [] }, fence: 7 }, expectation)
      expect(neutered.ok, credential).toBe(false)
      expect(neutered.why).toBe(`accepted — the daemon does not enforce ${credential}`)
    }
  })

  // ONE CREDENTIAL'S REFUSAL MUST NEVER CERTIFY THE OTHER'S PROBE.
  // `validateMutation` checks the session id BEFORE the fence, so a daemon that
  // ignores session ids answers the dead-session probe with the FENCE reason —
  // which the either-refusal judge accepted, passing the exact defect this
  // drill exists to catch.
  it("refuses the OTHER credential's refusal — each probe proves its own", () => {
    const crossed = staleProbeRefused({ ok: false, reason: 'stale fence: presented 7, the lock carries 9' }, SESSION)
    expect(crossed.ok).toBe(false)
    expect(crossed.why).toMatch(/not for the staleness of the session identity/)
    const crossedBack = staleProbeRefused({ ok: false, reason: 'the lock names another session' }, FENCE)
    expect(crossedBack.ok).toBe(false)
    expect(crossedBack.why).toMatch(/not for the staleness of the fence/)
  })

  // THE FENCE REASON IS BOUND TO THE REAL NUMBERS (round-15 review). The
  // anchored pattern this replaced accepted any two integers, so a daemon
  // validating against an epoch this drill never minted could answer with a
  // stale-SHAPED reason and pass.
  it('refuses a stale-SHAPED fence reason carrying the wrong numbers', () => {
    for (const reason of [
      'stale fence: presented 8, the lock carries 9',
      'stale fence: presented 7, the lock carries 10',
      'stale fence: presented 9, the lock carries 7',
      'stale fence: presented 07, the lock carries 9',
      'stale fence: presented 7, the lock carries 9 ',
      'stale fence: presented 7, the lock carries 9\n',
    ]) {
      const failed = staleProbeRefused({ ok: false, reason }, FENCE)
      expect(failed.ok, reason).toBe(false)
      expect(failed.why).toMatch(/not for the staleness of the fence/)
    }
  })

  it('has no expected refusal where no credential is stale', () => {
    // An equal fence is a VALID presentation, which validateMutation never
    // refuses for staleness — so there is no reason to expect, and a judge that
    // invented one would certify a probe that proves nothing.
    for (const expectation of [
      { kind: 'fence', presented: 9, carried: 9 },
      { kind: 'fence', presented: 7 },
      { kind: 'fence', presented: 1.5, carried: 9 },
      { kind: 'epoch' },
      {},
      undefined,
    ]) {
      expect(expectedStaleRefusal(expectation), JSON.stringify(expectation ?? null)).toBeNull()
      const bogus = staleProbeRefused({ ok: false, reason: 'the lock names another session' }, expectation)
      expect(bogus.ok).toBe(false)
      expect(bogus.why).toMatch(/no staleness is described by/)
    }
  })

  it('fails a probe that failed for any reason OTHER than that staleness', () => {
    // A timeout, a dead socket or an unrelated validation failure says nothing
    // about the credential; `ok !== true` alone would have passed all of them.
    for (const reason of [
      'the daemon did not answer within 2000ms',
      'no control socket: connect ECONNREFUSED',
      'the lock owner was not probed live',
      'internal error while checking stale fence',
      'compensated: the lock names another session',
      'the lock names another session, probably',
      undefined,
    ]) {
      for (const expectation of [SESSION, FENCE]) {
        const failed = staleProbeRefused({ ok: false, reason }, expectation)
        expect(failed.ok, `${expectation.kind}: ${reason}`).toBe(false)
        expect(failed.why).toMatch(/not for the staleness of/)
      }
    }
  })

  // THE EXPECTATION IS DERIVED, NOT COPIED. The judge asks `validateMutation`
  // for its refusal instead of repeating it, so an arbitrary fence pair — not
  // just the one the drill happens to mint — must come back with that pair's
  // own reason. A judge that had gone back to a literal would answer the same
  // string for every pair and fail here.
  it('expects the refusal for the fence pair it was actually given', () => {
    for (const [presented, carried] of [
      [1, 2],
      [7, 9],
      [41, 40],
      [3, 300],
    ]) {
      const real = validateMutation({
        presented: { sessionId: 's', fence: presented },
        lock: { sessionId: 's', fence: carried },
        now: 1,
      })
      expect(real.ok, `${presented}/${carried}`).toBe(false)
      expect(expectedStaleRefusal({ kind: 'fence', presented, carried }), `${presented}/${carried}`).toBe(real.reason)
    }
  })

  // A FENCE BELOW 1 IS REFUSED FOR ITS SHAPE, NOT FOR STALENESS. The validator
  // answers "the mutation presents no usable fence" before it compares
  // anything, so expecting that refusal would certify a probe on evidence about
  // the wrong check entirely — the round-14 mistake in a different disguise.
  it('has no expected refusal for a fence the validator never judges stale', () => {
    for (const expectation of [
      { kind: 'fence', presented: 0, carried: 9 },
      { kind: 'fence', presented: 7, carried: 0 },
      { kind: 'fence', presented: -1, carried: 9 },
      { kind: 'fence', presented: 7, carried: -2 },
    ]) {
      expect(expectedStaleRefusal(expectation), JSON.stringify(expectation)).toBeNull()
      const bogus = staleProbeRefused({ ok: false, reason: 'the mutation presents no usable fence' }, expectation)
      expect(bogus.ok).toBe(false)
      expect(bogus.why).toMatch(/no staleness is described by/)
    }
  })

  // THE WORDING IS PINNED HERE, AND NOWHERE ELSE. The drill derives its
  // expectation from `validateMutation`, so this is the only place the two
  // wordings are compared — and it compares them by RUNNING the validator,
  // which is why believing the judge no longer requires reading both files
  // side by side (round-16 review, evidence gap). Reword a refusal and this
  // turns red, deliberately.
  it('passes exactly the refusal validation produces for its own credential', () => {
    for (const [expectation, reason] of [
      [SESSION, 'the lock names another session'],
      [FENCE, 'stale fence: presented 7, the lock carries 9'],
    ]) {
      expect(expectedStaleRefusal(expectation)).toBe(reason)
      const refused = staleProbeRefused({ ok: false, reason }, expectation)
      expect(refused.ok, reason).toBe(true)
      expect(refused.why).toContain(reason)
    }
  })
})
