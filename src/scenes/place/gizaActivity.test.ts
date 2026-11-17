// The Giza plateau's people at work (gizaActivity.ts, docs/giza-1890.md §4):
// every figure belongs to one party, moves over time, stops and looks, keeps
// off the monuments and inside the site, and a mount stays beside its handler.

import { describe, expect, it } from 'vitest'
import { GIZA_ACTIVITY } from '../../config/balance'
import { standingClear } from './collision'
import { GIZA_AMBIENT, GIZA_SITE_RADIUS, gizaColliders } from './gizaSite'
import { GIZA_PARTIES, gizaActivityAt, gizaBodyRadius, partyCycle, startGizaActivity, stepGizaActivity, turnToward, type GizaPose } from './gizaActivity'

const colliders = gizaColliders()
const longest = Math.max(...GIZA_PARTIES.map((p) => partyCycle(p).period))
/** Two whole cycles of the slowest party, every quarter second. */
const times = Array.from({ length: Math.ceil((2 * longest) / 0.25) }, (_, i) => i * 0.25)

/** The live plateau stepped at 10 Hz over the same two cycles. */
const DT = 0.1
const live: Array<{ t: number; poses: GizaPose[] }> = (() => {
  const state = startGizaActivity()
  const out = [{ t: 0, poses: state.poses.map((p) => ({ ...p })) }]
  for (let k = 0; k < Math.ceil((2 * longest) / DT); k++) {
    stepGizaActivity(state, DT)
    out.push({ t: state.t, poses: state.poses.map((p) => ({ ...p })) })
  }
  return out
})()
const partyOf = (i: number) => GIZA_PARTIES.find((p) => p.leader === i || p.companions.some((c) => c.index === i))!

describe('Giza activity: parties (docs/giza-1890.md §4, no new roles)', () => {
  it('puts every ambient figure in exactly one party, and no one else', () => {
    const members = GIZA_PARTIES.flatMap((p) => [p.leader, ...p.companions.map((c) => c.index)]).sort((a, b) => a - b)
    expect(members).toEqual(GIZA_AMBIENT.map((_, i) => i))
  })

  it('gives every mount a handler and lets no animal lead', () => {
    for (const p of GIZA_PARTIES) {
      expect(['camel', 'donkey']).not.toContain(GIZA_AMBIENT[p.leader].role)
      for (const c of p.companions) expect(c.mount).toBe(['camel', 'donkey'].includes(GIZA_AMBIENT[c.index].role))
    }
  })

  it("starts every party's way at its leader's anchor", () => {
    for (const p of GIZA_PARTIES) {
      const a = GIZA_AMBIENT[p.leader]
      expect([p.route[0].x, p.route[0].z]).toEqual([a.x, a.z])
    }
  })
})

describe('Giza activity: movement over time', () => {
  it('moves every figure: its position changes over a cycle', () => {
    const first = live[0].poses
    const spread = first.map(() => 0)
    for (const { poses } of live) {
      poses.forEach((p, i) => {
        spread[i] = Math.max(spread[i], Math.hypot(p.x - first[i].x, p.z - first[i].z))
      })
    }
    for (const [i, d] of spread.entries()) expect(d, `${GIZA_AMBIENT[i].role} #${i}`).toBeGreaterThan(10)
  })

  it('walks at the calibrated pace, never faster', () => {
    const dt = 0.25
    for (const p of GIZA_PARTIES) {
      const pace = GIZA_ACTIVITY.pace[p.pace]
      for (const t of times) {
        const a = gizaActivityAt(t)[p.leader]
        const b = gizaActivityAt(t + dt)[p.leader]
        expect(Math.hypot(b.x - a.x, b.z - a.z) / dt).toBeLessThanOrEqual(pace + 1e-6)
      }
    }
  })

  it('never jumps a companion or mount: it walks round a corner at a bounded pace', () => {
    for (let k = 1; k < live.length; k++) {
      live[k].poses.forEach((b, i) => {
        const a = live[k - 1].poses[i]
        const cap = GIZA_ACTIVITY.pace[partyOf(i).pace] * GIZA_ACTIVITY.catchUp
        expect(Math.hypot(b.x - a.x, b.z - a.z) / DT, `#${i} at t=${live[k].t.toFixed(1)}`).toBeLessThanOrEqual(cap + 1e-6)
      })
    }
  })

  it('turns every figure at a bounded rate', () => {
    for (let k = 1; k < live.length; k++) {
      live[k].poses.forEach((b, i) => {
        const turn = Math.abs(Math.atan2(Math.sin(b.yaw - live[k - 1].poses[i].yaw), Math.cos(b.yaw - live[k - 1].poses[i].yaw)))
        expect(turn).toBeLessThanOrEqual(GIZA_ACTIVITY.turnRate * DT + 1e-9)
      })
    }
  })

  it('stops at its viewpoints: the leader stands still for the pause', () => {
    for (const p of GIZA_PARTIES) {
      const { arcAt } = partyCycle(p)
      const stopped = times.filter((t) => arcAt(t).stop !== null)
      expect(stopped.length, `party of #${p.leader}`).toBeGreaterThan(0)
      const moving = times.filter((t) => arcAt(t).stop === null)
      expect(moving.length, `party of #${p.leader}`).toBeGreaterThan(0)
      for (const t of stopped) {
        if (arcAt(t + 0.1).stop !== arcAt(t).stop) continue
        const a = gizaActivityAt(t)[p.leader]
        const b = gizaActivityAt(t + 0.1)[p.leader]
        expect(a.moving).toBe(false)
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(1e-9)
      }
    }
  })

  it('has the tourists look at the monument and the guide turn to them at a viewpoint', () => {
    let seen = 0
    for (const p of GIZA_PARTIES) {
      const { arcAt } = partyCycle(p)
      for (let k = 0; k + 1 < live.length; k++) {
        const at = arcAt(live[k].t)
        // The last frame of a viewpoint stop: everyone has had time to turn.
        if (at.stop === null || arcAt(live[k + 1].t).stop === at.stop) continue
        const look = p.route[at.stop].look
        if (p.route[at.stop].kind !== 'view' || !look) continue
        const poses = live[k].poses
        const off = (yaw: number, x: number, z: number) => Math.abs(Math.atan2(Math.sin(yaw - Math.atan2(x, z)), Math.cos(yaw - Math.atan2(x, z))))
        for (const c of p.companions.filter((m) => !m.mount)) {
          const q = poses[c.index]
          expect(off(q.yaw, look.x - q.x, look.z - q.z), `#${c.index} at t=${live[k].t.toFixed(1)}`).toBeLessThan(0.05)
        }
        const lead = poses[p.leader]
        const first = poses[p.companions[0].index]
        expect(off(lead.yaw, first.x - lead.x, first.z - lead.z), `#${p.leader} at t=${live[k].t.toFixed(1)}`).toBeLessThan(0.05)
        expect(lead.moving).toBe(false)
        seen++
      }
    }
    expect(seen).toBeGreaterThan(4)
  })
})

describe('Giza activity: free ground (settlement collision)', () => {
  it('never puts a body inside a monument footprint', () => {
    for (const { t, poses } of live) {
      poses.forEach((p, i) => {
        expect(standingClear(colliders, p.x, p.z, gizaBodyRadius(i)), `${GIZA_AMBIENT[i].role} #${i} at t=${t}: ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true)
      })
    }
  })

  it('lays every way on free sand with room to spare, not on the push-out', () => {
    // Sampled along each leg with the widest body plus the sideways offset as
    // margin: the collision push-out is a guard, not the routing.
    const margin = 0.9 + GIZA_ACTIVITY.side.companion + 0.5
    for (const p of GIZA_PARTIES) {
      p.route.forEach((a, i) => {
        const b = p.route[(i + 1) % p.route.length]
        for (let k = 0; k <= 40; k++) {
          const x = a.x + ((b.x - a.x) * k) / 40
          const z = a.z + ((b.z - a.z) * k) / 40
          expect(standingClear(colliders, x, z, margin), `party of #${p.leader}, leg ${i} at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true)
        }
      })
    }
  })

  it('stays well inside the walkable site', () => {
    for (const { poses } of live) for (const p of poses) expect(Math.hypot(p.x, p.z)).toBeLessThan(GIZA_SITE_RADIUS - 10)
  })
})

describe('Giza activity: mounts move with their handlers', () => {
  const mounts = GIZA_PARTIES.flatMap((p) => p.companions.filter((c) => c.mount).map((c) => ({ p, c })))

  it('keeps every mount beside its handler at all times, never on him', () => {
    expect(mounts.length).toBe(3)
    for (const { p, c } of mounts) {
      for (const { t, poses } of live) {
        const d = Math.hypot(poses[c.index].x - poses[p.leader].x, poses[c.index].z - poses[p.leader].z)
        expect(d, `${GIZA_AMBIENT[c.index].role} #${c.index} at t=${t.toFixed(1)}`).toBeLessThan(GIZA_ACTIVITY.lag.mount + GIZA_ACTIVITY.side.mount + 1)
        expect(d, `${GIZA_AMBIENT[c.index].role} #${c.index} at t=${t.toFixed(1)}`).toBeGreaterThan(gizaBodyRadius(c.index) + gizaBodyRadius(p.leader))
      }
    }
  })

  it('moves a mount with its handler: it walks while he walks and settles when he stands', () => {
    for (const { p, c } of mounts) {
      const { arcAt } = partyCycle(p)
      let walkedTogether = 0
      for (let k = 1; k < live.length; k++) {
        const step = (i: number) => Math.hypot(live[k].poses[i].x - live[k - 1].poses[i].x, live[k].poses[i].z - live[k - 1].poses[i].z)
        if (step(p.leader) > 0 && step(c.index) > 0) walkedTogether++
        // Three seconds into a stop the mount has caught up and stands too.
        const stop = arcAt(live[k].t).stop
        if (stop !== null && arcAt(live[k].t - 3).stop === stop) expect(step(c.index), `#${c.index} at t=${live[k].t.toFixed(1)}`).toBeLessThan(1e-6)
      }
      expect(walkedTogether).toBeGreaterThan(100)
    }
  })
})

describe('Giza activity: bodies keep clear of each other', () => {
  it('keeps every pair of bodies apart, within and across parties, over four cycles of the slowest party', () => {
    // The parties' cycles differ in length, so the plateau as a whole never
    // repeats exactly; four cycles of the slowest party pass every party
    // through many phases against the others.
    const state = startGizaActivity()
    const n = GIZA_AMBIENT.length
    const worst = new Map<string, number>()
    while (state.t < 4 * longest) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = state.poses[i]
          const b = state.poses[j]
          const clearance = Math.hypot(a.x - b.x, a.z - b.z) - gizaBodyRadius(i) - gizaBodyRadius(j)
          const key = `${GIZA_AMBIENT[i].role} #${i} / ${GIZA_AMBIENT[j].role} #${j}`
          worst.set(key, Math.min(worst.get(key) ?? Infinity, clearance))
        }
      }
      stepGizaActivity(state, DT)
    }
    expect(worst.size).toBe((n * (n - 1)) / 2)
    for (const [pair, clearance] of worst) expect(clearance, pair).toBeGreaterThanOrEqual(0)
  })
})

describe('Giza activity: frame-rate independence', () => {
  /** The plateau after `elapsed` seconds fed in frames of `frame` seconds. */
  const after = (elapsed: number, frame: number) => {
    const state = startGizaActivity()
    for (let k = 0; k < Math.round(elapsed / frame); k++) stepGizaActivity(state, frame)
    return state
  }

  it('advances the same under coarse and fine frame intervals', () => {
    for (const elapsed of [30, 120]) {
      const fine = after(elapsed, 1 / 120)
      for (const frame of [0.2, 1 / 30, GIZA_ACTIVITY.step]) {
        const other = after(elapsed, frame)
        expect(other.t, `${frame} s frames, ${elapsed} s`).toBeCloseTo(fine.t, 6)
        other.poses.forEach((p, i) => {
          const q = fine.poses[i]
          expect(Math.hypot(p.x - q.x, p.z - q.z), `#${i}, ${frame} s frames, ${elapsed} s`).toBeLessThan(1e-6)
          expect(Math.abs(Math.atan2(Math.sin(p.yaw - q.yaw), Math.cos(p.yaw - q.yaw)))).toBeLessThan(1e-6)
        })
      }
    }
  })

  it('loses no time at a sustained low frame rate', () => {
    // 5 FPS for a minute: the whole minute is simulated, not half of it.
    expect(after(60, 0.2).t).toBeCloseTo(60, 6)
  })
})

describe('Giza activity: turning', () => {
  it('turns the short way at a bounded rate', () => {
    expect(turnToward(0, 1, 0.1, 2)).toBeCloseTo(0.2, 9)
    expect(turnToward(0, 0.05, 0.1, 2)).toBeCloseTo(0.05, 9)
    expect(turnToward(3, -3, 1, 10)).toBeGreaterThan(3)
  })
})
