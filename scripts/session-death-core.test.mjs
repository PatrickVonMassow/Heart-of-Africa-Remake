import { describe, expect, it } from 'vitest'
import { explainDeath, sessionExits } from './session-death-core.mjs'

const row = ({ at = '2026-09-05T13:14:13.085Z', ...over } = {}) => JSON.stringify({
  v: 1,
  seq: 1,
  at,
  atMs: Date.parse(at),
  event: 'process-exit',
  session: 's',
  point: null,
  pid: 3123985,
  pidStartedAt: null,
  generation: null,
  cause: 'owner-release',
  evidence: { explicit: true },
  ...over,
})

const AT = Date.parse('2026-09-05T13:14:13.085Z')

describe('sessionExits', () => {
  it('keeps only the exit-shaped rows and puts the newest first', () => {
    const journal = [
      row({ seq: 1, at: '2026-09-05T12:00:00.000Z', pid: 1 }),
      row({ seq: 2, event: 'foreground-activity', cause: 'completed-tool-call', at: '2026-09-05T12:30:00.000Z' }),
      row({ seq: 3, at: '2026-09-05T13:14:13.085Z', pid: 2 }),
    ].join('\n')
    expect(sessionExits(journal).map((e) => e.pid)).toEqual([2, 1])
  })

  it('survives a torn last line rather than throwing on it', () => {
    expect(sessionExits(`${row()}\n{"v":1,"seq":2,`)).toHaveLength(1)
  })
})

describe('explainDeath', () => {
  it('names a container restart when PID 1 is younger than the death', () => {
    const v = explainDeath({
      death: { at: '2026-09-05T13:14:13.085Z', cause: 'owner-release', explicit: true },
      containerStartedAtMs: AT + 60_000,
      oomKills: 0,
    })
    expect(v.verdict).toBe('container-restart')
  })

  it('names the machine only when the cgroup actually counted a kill', () => {
    const base = { death: { at: '2026-09-05T13:14:13.085Z', cause: 'owner-release' }, containerStartedAtMs: AT - 60_000 }
    expect(explainDeath({ ...base, oomKills: 2 }).verdict).toBe('out-of-memory')
    expect(explainDeath({ ...base, oomKills: 0 }).verdict).toBe('signalled-or-self-exit')
  })

  it('separates our own boundary from every other shutdown', () => {
    const base = { containerStartedAtMs: AT - 60_000, oomKills: 0 }
    expect(explainDeath({ ...base, death: { at: '2026-09-05T13:14:13.085Z', cause: 'context-boundary' } }).verdict)
      .toBe('our-own-boundary')
  })

  // THE CORRECTION THIS FILE EXISTS FOR: a clean SessionEnd was read as proof
  // that the session ended itself, and it is not — an external SIGTERM runs the
  // same path. The verdict must stay undecided between the two, out loud.
  it('refuses to read an explicit shutdown row as evidence of who sent the signal', () => {
    const v = explainDeath({
      death: { at: '2026-09-05T13:14:13.085Z', cause: 'owner-release', explicit: true },
      containerStartedAtMs: AT - 60_000,
      oomKills: 0,
      freeMb: 12_565,
    })
    expect(v.verdict).toBe('signalled-or-self-exit')
    expect(v.reasons.join(' ')).toContain('names the shutdown, not its sender')
    expect(v.reasons.join(' ')).toContain('12565 MB')
  })

  it('says so when there is no exit row at all', () => {
    expect(explainDeath({ death: null }).verdict).toBe('no-death-row')
  })
})
