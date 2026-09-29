import { describe, expect, it } from 'vitest'
import {
  authoringVenue,
  probeVerdict,
  readState,
  recordProbe,
  recordProbeFailure,
  recordUnreachable,
  statusReport,
  venueInstruction,
  writeState,
} from './cloud-switch-core.mjs'
import { isProbeRef, parseMarker } from './cloud-switch.mjs'

const NOW = Date.parse('2026-09-29T02:00:00Z')
const probe = (over = {}) => ({
  branch: 'origin/probe/1230-cloud-marker',
  remoteHost: 'cloud-runner-7',
  localHost: '66a0eaaacb4b',
  remoteMachineId: 'aaa',
  localMachineId: 'bbb',
  creditConfirmed: 'Guthaben ist gesunken',
  at: NOW,
  ...over,
})
const record = (state, p = probe()) =>
  JSON.stringify({
    state,
    reason: 'user order',
    setBy: 'Patrick',
    changedAt: NOW,
    probe: p,
  })

describe('cloud switch state', () => {
  it('reads an absent file as OFF, so today stays local', () => {
    expect(readState(null)).toMatchObject({ ok: true, state: 'off' })
  })

  it('reads a garbled file as unusable, never as ON', () => {
    expect(readState('{').ok).toBe(false)
    expect(readState(JSON.stringify({ state: 'on' })).ok).toBe(false)
  })

  it('round-trips a written record', () => {
    const written = writeState(null, 'on', {
      reason: 'user order',
      by: 'Patrick',
      now: NOW,
      probe: probe(),
    })
    expect(readState(JSON.stringify(written))).toMatchObject({
      ok: true,
      state: 'on',
      reason: 'user order',
    })
  })

  it('keeps the recorded probe across a flip', () => {
    const on = readState(record('on'))
    expect(writeState(on, 'off', { reason: 'pause', by: 'Patrick', now: NOW }).probe).toMatchObject({
      remoteHost: 'cloud-runner-7',
    })
  })
})

describe('--on needs an off-machine probe', () => {
  it('refuses without a probe', () => {
    expect(() => writeState(null, 'on', { reason: 'r', by: 'b', now: NOW })).toThrow(/no off-machine probe/)
  })

  it('refuses when the marker host is this container (remote ran locally)', () => {
    const local = probe({ remoteHost: '66a0eaaacb4b' })
    expect(probeVerdict(local).offMachine).toBe(false)
    expect(() => writeState(null, 'on', { reason: 'r', by: 'b', now: NOW, probe: local })).toThrow(/ran locally/)
  })

  it('refuses when only the machine-id matches', () => {
    expect(probeVerdict(probe({ remoteMachineId: 'bbb' })).why).toMatch(/machine-id/)
  })

  it('refuses without the user credit confirmation', () => {
    expect(probeVerdict(probe({ creditConfirmed: '' })).why).toMatch(/credit/)
  })

  it('allows OFF without any probe', () => {
    expect(writeState(null, 'off', { reason: 'r', by: 'b', now: NOW }).state).toBe('off')
  })
})

describe('the routing read', () => {
  it('ON with a passing probe → cloud', () => {
    expect(authoringVenue(readState(record('on')))).toEqual({
      venue: 'cloud',
      notice: '',
    })
  })

  it('OFF → local, silently', () => {
    expect(authoringVenue(readState(record('off')))).toEqual({
      venue: 'local',
      notice: '',
    })
  })

  it('ON but unreachable → local with a notice', () => {
    const route = authoringVenue(readState(record('on')), {
      cloudReachable: false,
    })
    expect(route.venue).toBe('local')
    expect(route.notice).toMatch(/unreachable/)
  })

  it('ON with a local-run probe → local with a notice', () => {
    const route = authoringVenue(readState(record('on', probe({ remoteHost: '66a0eaaacb4b' }))))
    expect(route).toMatchObject({ venue: 'local' })
    expect(route.notice).toMatch(/ran locally/)
  })

  it('an unusable state → local with a notice', () => {
    expect(authoringVenue(readState('{'))).toMatchObject({ venue: 'local' })
  })

  it('the cloud instruction names remote isolation and the pool slot', () => {
    expect(venueInstruction({ venue: 'cloud', notice: '' })).toMatch(/isolation: "remote".*pool slot/s)
    expect(venueInstruction({ venue: 'local', notice: '' })).toMatch(/local worktrees/)
  })
})

describe('status and marker', () => {
  it('names the credit expiry, and flags it once passed', () => {
    expect(statusReport(readState(null), { now: NOW })).toMatch(/05\.11\.2026 08:59 MEZ — revisit/)
    expect(
      statusReport(readState(null), {
        now: Date.parse('2026-11-06T00:00:00Z'),
      }),
    ).toMatch(/EXPIRED/)
  })

  it('parses the cloud marker file', () => {
    expect(parseMarker('hostname: h1\nuname -a: Linux\nmachine-id: absent\n')).toEqual({
      remoteHost: 'h1',
      remoteMachineId: '',
    })
  })
})

describe('review fixes (Astra, 235e3c2)', () => {
  it('a non-string credit confirmation is no confirmation', () => {
    for (const bad of [false, 0, {}]) {
      expect(readState(record('on', probe({ creditConfirmed: bad }))).probe).toBeNull()
    }
  })

  it('an empty hostname line is not read from the next line', () => {
    expect(parseMarker('hostname:\nuname -a: Linux\nmachine-id: absent\n').remoteHost).toBe('')
  })

  it('a failed probe recorded while ON turns the switch OFF', () => {
    const on = readState(record('on'))
    const next = readState(
      JSON.stringify(recordProbe(on, probe({ remoteHost: '66a0eaaacb4b' }), { by: 'b', now: NOW })),
    )
    expect(next.state).toBe('off')
    expect(next.reason).toMatch(/probe failed: .*ran locally/)
    expect(authoringVenue(next).venue).toBe('local')
  })

  it('a passing probe recorded while ON stays ON and clears an outage', () => {
    const on = readState(JSON.stringify({ ...JSON.parse(record('on')), unreachable: 'launch failed' }))
    expect(recordProbe(on, probe(), { by: 'b', now: NOW })).not.toHaveProperty('unreachable')
  })

  it('a recorded outage routes the real read local until a passing probe', () => {
    const on = readState(record('on'))
    const down = readState(JSON.stringify(recordUnreachable(on, 'remote launch refused', { by: 'b', now: NOW })))
    const route = authoringVenue(down)
    expect(route.venue).toBe('local')
    expect(route.notice).toMatch(/unreachable \(remote launch refused\)/)
  })
})

describe('review fixes (Astra, 2cdaaae)', () => {
  it('an unreadable probe turns ON off and drops the old passing probe', () => {
    const next = readState(
      JSON.stringify(recordProbeFailure(readState(record('on')), 'fetch failed', { by: 'b', now: NOW })),
    )
    expect(next).toMatchObject({ state: 'off', probe: null })
    expect(next.reason).toMatch(/probe failed: fetch failed/)
    expect(() => writeState(next, 'on', { reason: 'r', by: 'b', now: NOW })).toThrow(/no off-machine probe/)
  })

  it('an outage survives OFF then ON until a passing probe clears it', () => {
    const down = readState(
      JSON.stringify(recordUnreachable(readState(record('on')), 'launch refused', { by: 'b', now: NOW })),
    )
    const off = readState(JSON.stringify(writeState(down, 'off', { reason: 'r', by: 'b', now: NOW })))
    const on = readState(JSON.stringify(writeState(off, 'on', { reason: 'r', by: 'b', now: NOW })))
    expect(authoringVenue(on).venue).toBe('local')
    const cleared = readState(JSON.stringify(recordProbe(on, probe(), { by: 'b', now: NOW })))
    expect(authoringVenue(cleared).venue).toBe('cloud')
  })
})

describe('review fix (Astra, 3ba3a08)', () => {
  it('refuses option-like and malformed probe refs', () => {
    for (const bad of ['--dry-run', '-n', 'a..b', 'x:y', 'a b', '', 'x/']) expect(isProbeRef(bad)).toBe(false)
    expect(isProbeRef('probe/1230-cloud-marker')).toBe(true)
    expect(isProbeRef('origin/probe/1230-cloud-marker')).toBe(true)
  })
})
