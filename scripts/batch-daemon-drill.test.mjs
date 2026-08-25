// THE PARENT-DEATH DRILL AS A REGRESSION (point 834): the scenario that
// reproduces the run lost on 21.08.2026 — the spawning session's process group
// SIGKILLed mid-authoring — must keep passing, and an unknown scenario must be
// refused rather than reported as a passed nothing.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'
import { runDrill, staleProbeRefused, STALE_REFUSAL } from './batch-daemon-drill.mjs'
import { startDaemon } from './batch-daemon.mjs'

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
  'the worker pushed a SHA that did not exist at the kill',
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
})

describe('staleProbeRefused', () => {
  // THE NEGATIVE CONTROL FOR THE TWO STALE PROBES: the judge itself must catch
  // a daemon whose enforcement was removed. Such a daemon ANSWERS the stale
  // request with ok:true — these are the replies the drill would then feed this
  // judge, and each must come back red, naming the credential it presented.
  it('fails an ACCEPTING daemon — the neutered case the probes exist to catch', () => {
    for (const [kind, credential] of [
      ['session', 'the session identity'],
      ['fence', 'the fence'],
    ]) {
      const neutered = staleProbeRefused({ ok: true, result: { answers: [] }, fence: 7 }, kind)
      expect(neutered.ok, kind).toBe(false)
      expect(neutered.why).toBe(`accepted — the daemon does not enforce ${credential}`)
    }
  })

  // THE ROUND-14 REPAIR (P1) AT ITS OWN LAYER: one credential's refusal must
  // never certify the other's probe. `validateMutation` checks the session id
  // BEFORE the fence, so a daemon that ignores session ids answers the
  // dead-session probe with the FENCE reason — which the either-refusal judge
  // accepted, passing the exact defect this drill exists to catch.
  it('refuses the OTHER credential\'s refusal — each probe proves its own', () => {
    const sessionReason = 'the lock names another session'
    const fenceReason = 'stale fence: presented 7, the lock carries 9'
    const crossed = staleProbeRefused({ ok: false, reason: fenceReason }, 'session')
    expect(crossed.ok).toBe(false)
    expect(crossed.why).toMatch(/not for the staleness of the session identity/)
    const crossedBack = staleProbeRefused({ ok: false, reason: sessionReason }, 'fence')
    expect(crossedBack.ok).toBe(false)
    expect(crossedBack.why).toMatch(/not for the staleness of the fence/)
  })

  it('refuses a kind it has no pattern for, rather than passing it', () => {
    for (const kind of ['epoch', '', undefined]) {
      const bogus = staleProbeRefused({ ok: false, reason: 'the lock names another session' }, kind)
      expect(bogus.ok, String(kind)).toBe(false)
      expect(bogus.why).toMatch(/no such staleness kind/)
    }
  })

  it('fails a probe that failed for any reason OTHER than that staleness', () => {
    // A timeout, a dead socket or an unrelated validation failure says nothing
    // about the credential; `ok !== true` alone would have passed all of them.
    for (const reason of [
      'the daemon did not answer within 2000ms',
      'no control socket: connect ECONNREFUSED',
      'the lock owner was not probed live',
      undefined,
    ]) {
      for (const kind of ['session', 'fence']) {
        const failed = staleProbeRefused({ ok: false, reason }, kind)
        expect(failed.ok, `${kind}: ${reason}`).toBe(false)
        expect(failed.why).toMatch(/not for the staleness of/)
      }
    }
  })

  it('passes exactly the staleness refusal validation produces for its own kind', () => {
    for (const [kind, reason] of [
      ['session', 'the lock names another session'],
      ['fence', 'stale fence: presented 7, the lock carries 9'],
    ]) {
      expect(STALE_REFUSAL[kind].test(reason)).toBe(true)
      const refused = staleProbeRefused({ ok: false, reason }, kind)
      expect(refused.ok, reason).toBe(true)
      expect(refused.why).toContain(reason)
    }
  })

  it('refuses a message that merely CONTAINS a staleness phrase', () => {
    // The contract beside STALE_REFUSAL says "and nothing else": a reply whose
    // text embeds one of the phrases in a larger sentence is some OTHER failure
    // — an internal error, a compensation, a wrapped reason — and proves
    // nothing. The unanchored regex accepted all of these.
    for (const reason of [
      'internal error while checking stale fence',
      'compensated: the lock names another session',
      'the lock names another session, probably',
      'stale fence',
      'not a stale fence: presented 7, the lock carries 7',
    ]) {
      for (const kind of ['session', 'fence']) {
        expect(STALE_REFUSAL[kind].test(reason), `${kind}: ${reason}`).toBe(false)
        const failed = staleProbeRefused({ ok: false, reason }, kind)
        expect(failed.ok, reason).toBe(false)
        expect(failed.why).toMatch(/not for the staleness of/)
      }
    }
  })

  // THE ROUND-14 REPAIR (P2): `$` also matches BEFORE a final line terminator,
  // so every one of these ends the reason with something the contract forbids
  // and used to pass anyway. The tail anchor is `(?![\s\S])`.
  it('refuses a refusal with anything AFTER it, a bare newline included', () => {
    for (const [kind, base] of [
      ['session', 'the lock names another session'],
      ['fence', 'stale fence: presented 7, the lock carries 9'],
    ]) {
      for (const suffix of ['\n', '\r\n', '\n ', '\nand the socket then died', ' ']) {
        const reason = base + suffix
        expect(STALE_REFUSAL[kind].test(reason), `${kind}: ${JSON.stringify(reason)}`).toBe(false)
        const failed = staleProbeRefused({ ok: false, reason }, kind)
        expect(failed.ok, JSON.stringify(reason)).toBe(false)
        expect(failed.why).toMatch(/not for the staleness of/)
      }
    }
  })
})
