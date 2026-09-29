// THE VILLAGER'S DUGOUT (work-order 1237): its lane beside the children's bank
// game, the 20 m it keeps from their stretch, and the cycle it paddles.

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { RIVER_HALF_LENGTH, RIVER_REACH } from '../../render/placeRiver'
import { BACKDROP_INNER_OFFSET, GROUND_DISC_OVERHANG } from './backdrop'
import { bankDrawnReach, groundDiscShift, insidePlace } from './boundary'
import { sharedLayout } from './layoutHarness'
import { PLACE_RADIUS } from './layout'
import { buildRiverBank } from './riverBank'
import {
  CANOE_PHASES,
  CANOE_SEAT_AFT,
  canoeCycleSeconds,
  canoeLane,
  canoeStretchGap,
  createCanoe,
  lanePoint,
  stepCanoe,
  type CanoePhase,
  type CanoeWord,
} from './villagerCanoe'

beforeAll(setupGeodata)

const cfg = balance.villageLife.canoe
const RIVER_VILLAGES = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
const SEEDS = [7, 4711, 394349866, 1425108822, 1838110026]

describe('the canoe lane (work-order 1237 item 3)', () => {
  it('has riverside villages to lay it at', () => {
    expect(RIVER_VILLAGES.length).toBeGreaterThanOrEqual(3)
  })

  it.each(RIVER_VILLAGES)('%s: lies 7 m out, from s = +27 to +47 m downstream of the stretch centre', (id) => {
    const layout = sharedLayout(id, 4711)
    const bank = layout.bank!
    const lane = canoeLane(bank)
    const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz - lane.origin
    const out = (p: { x: number; z: number }) => p.x * bank.nx + p.z * bank.nz
    const mid = { x: (bank.upstream.x + bank.downstream.x) / 2, z: (bank.upstream.z + bank.downstream.z) / 2 }
    expect(along(mid)).toBeCloseTo(0, 9)
    expect(along(lane.start)).toBeCloseTo(cfg.laneStart, 9)
    expect(along(lane.end)).toBeCloseTo(cfg.laneEnd, 9)
    expect(out(lane.start) - bank.distance).toBeCloseTo(cfg.laneOut, 9)
    expect(out(lane.end) - bank.distance).toBeCloseTo(cfg.laneOut, 9)
    expect(cfg.laneStart).toBe(27)
    expect(cfg.laneEnd).toBe(47)
    expect(cfg.laneOut).toBe(7)
    // Downstream of the children: the lane runs WITH the current from start to end.
    expect(along(lane.end)).toBeGreaterThan(along(lane.start))
  })

  it.each(RIVER_VILLAGES.flatMap((id) => SEEDS.map((seed) => [id, seed] as const)))(
    '%s @%i: keeps at least 20 m from the children`s stretch',
    (id, seed) => {
      const layout = sharedLayout(id, seed)
      const lane = canoeLane(layout.bank!)
      expect(layout.playRocks).not.toBeNull()
      expect(cfg.stretchGapMin).toBe(20)
      expect(canoeStretchGap(lane, layout.playRocks!)).toBeGreaterThanOrEqual(cfg.stretchGapMin)
    },
  )

  it.each(RIVER_VILLAGES)('%s: the landing, the trap and the boat standing place are walkable, drawn ground', (id) => {
    const layout = sharedLayout(id, 4711)
    const bank = layout.bank!
    const lane = canoeLane(bank)
    const stand = {
      x: bank.nx * bank.distance + bank.fx * (lane.origin + 37),
      z: bank.nz * bank.distance + bank.fz * (lane.origin + 37),
    }
    for (const [name, p] of [['stand', stand], ['check', lane.checkStand]] as const) {
      expect(insidePlace(layout, p.x, p.z), name).toBe(true)
    }
    // The bow on the sand lies inside the extended plateau, at the waterline.
    const bow = {
      x: lane.berth.x - bank.nx * (cfg.hullLength / 2),
      z: lane.berth.z - bank.nz * (cfg.hullLength / 2),
    }
    expect(insidePlace(layout, bow.x, bow.z)).toBe(true)
  })

  it.each(RIVER_VILLAGES)('%s: the whole lane floats on drawn water, clear of the backdrop`s rim', (id) => {
    const layout = sharedLayout(id, 4711)
    const bank = layout.bank!
    const lane = canoeLane(bank)
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    const reach = bankDrawnReach(layout, discEdge)
    const half = cfg.hullLength / 2
    for (let s = cfg.laneStart - half; s <= cfg.laneEnd + half; s += 0.5) {
      const p = lanePoint(lane, s)
      const along = p.x * bank.fx + p.z * bank.fz
      expect(along).toBeLessThanOrEqual(Math.max(RIVER_HALF_LENGTH, reach.down))
      expect(lane.out - bank.distance).toBeLessThan(RIVER_REACH)
      const rim = layout.radius + BACKDROP_INNER_OFFSET + groundDiscShift(layout, Math.atan2(p.z, p.x))
      expect(Math.hypot(p.x, p.z) + cfg.hullBeam, `s=${s}`).toBeLessThan(rim)
    }
  })
})

/** Runs the canoe for `seconds` at a fixed step, recording each phase entry and every call. */
function run(seconds: number, mayCall: (word: CanoeWord, t: number) => boolean = () => true, dt = 0.05) {
  const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
  const lane = canoeLane(bank)
  const state = createCanoe(lane)
  const phases: Array<{ phase: CanoePhase; t: number }> = [{ phase: state.phase, t: 0 }]
  const calls: Array<{ word: CanoeWord; t: number; phase: CanoePhase; clock: number }> = []
  const drops: number[] = []
  const positions: Array<{ s: number; x: number; z: number; t: number; phase: CanoePhase }> = []
  let t = 0
  let draws = 0
  const rand = () => [0.2, 0.9, 0.5][draws++ % 3]
  while (t < seconds) {
    const before = state.phase
    const clock = state.clock + dt
    const said = stepCanoe(state, lane, { mayCall: (w) => mayCall(w, t), drop: () => drops.push(t) }, dt, cfg, rand)
    t += dt
    if (said) calls.push({ word: said, t, phase: before, clock })
    if (state.phase !== before) phases.push({ phase: state.phase, t })
    positions.push({ s: state.s, x: state.x, z: state.z, t, phase: state.phase })
  }
  return { lane, bank, state, phases, calls, drops, positions }
}

describe('the canoe cycle (work-order 1237 item 4)', () => {
  it('runs up, turn, down, land, trap, launch — and round again', () => {
    const { phases } = run(canoeCycleSeconds(cfg, cfg.trapMaxSeconds) * 3)
    const order = phases.map((p) => p.phase)
    expect(order.length).toBeGreaterThan(12)
    for (let i = 1; i < order.length; i++) {
      const prev = CANOE_PHASES.indexOf(order[i - 1])
      expect(order[i]).toBe(CANOE_PHASES[(prev + 1) % CANOE_PHASES.length])
    }
  })

  it('takes the calibrated time over every leg', () => {
    const { phases } = run(canoeCycleSeconds(cfg, cfg.trapMaxSeconds) * 2)
    const span = cfg.laneEnd - cfg.laneStart
    const lengths = new Map<CanoePhase, number[]>()
    for (let i = 0; i + 1 < phases.length; i++) {
      const list = lengths.get(phases[i].phase) ?? []
      list.push(phases[i + 1].t - phases[i].t)
      lengths.set(phases[i].phase, list)
    }
    for (const up of lengths.get('up')!) expect(up).toBeCloseTo(span / cfg.upstreamSpeed, 0)
    for (const turn of lengths.get('turn')!) expect(turn).toBeCloseTo(cfg.turnSeconds, 0)
    for (const down of lengths.get('down')!) expect(down).toBeCloseTo(span / cfg.downstreamSpeed, 0)
    for (const land of lengths.get('land')!) expect(land).toBeCloseTo(cfg.landSeconds, 0)
    for (const trap of lengths.get('trap')!) {
      expect(trap).toBeGreaterThanOrEqual(cfg.trapMinSeconds - 0.1)
      expect(trap).toBeLessThanOrEqual(cfg.trapMaxSeconds + 0.1)
    }
    for (const launch of lengths.get('launch')!) expect(launch).toBeCloseTo(cfg.launchSeconds, 0)
    // Regionally plausible paces: 0.8 m/s against the current, 1.5 m/s with it.
    expect(cfg.upstreamSpeed).toBeCloseTo(0.8, 9)
    expect(cfg.downstreamSpeed).toBeCloseTo(1.5, 9)
    expect(cfg.turnSeconds).toBeCloseTo(6, 9)
    expect(cfg.trapMinSeconds).toBe(20)
    expect(cfg.trapMaxSeconds).toBe(40)
  })

  it('calls the direction of each leg once, shortly after it is under way', () => {
    const { calls, phases } = run(canoeCycleSeconds(cfg, cfg.trapMaxSeconds) * 3)
    const legs = phases.filter((p) => p.phase === 'up' || p.phase === 'down')
    // Every leg that ran past its call delay called exactly once, its own word.
    let judged = 0
    for (let i = 0; i < legs.length; i++) {
      const start = legs[i].t
      const next = phases.find((p) => p.t > start)
      if (!next) continue
      const inLeg = calls.filter((c) => c.t > start && c.t <= next.t)
      expect(inLeg).toHaveLength(1)
      expect(inLeg[0].word).toBe(legs[i].phase === 'up' ? 'UPSTREAM' : 'DOWNSTREAM')
      expect(inLeg[0].t - start).toBeGreaterThanOrEqual(cfg.callDelaySeconds - 1e-6)
      expect(inLeg[0].t - start).toBeLessThan(cfg.callDelaySeconds + 0.2)
      judged++
    }
    expect(judged).toBeGreaterThanOrEqual(4)
    // Nothing else speaks: no call while turning, landing, at the trap or launching.
    expect(calls.every((c) => c.phase === 'up' || c.phase === 'down')).toBe(true)
  })

  it('waits for the floor, and gives the word up when the leg ends unspoken', () => {
    // The floor is never granted on the down leg.
    const held = run(canoeCycleSeconds(cfg, cfg.trapMaxSeconds) * 2, (w) => w === 'UPSTREAM')
    const downLegs = held.phases.filter((p) => p.phase === 'land').length
    expect(held.drops.length).toBeGreaterThanOrEqual(downLegs)
    expect(held.calls.some((c) => c.word === 'DOWNSTREAM')).toBe(false)
    // A late grant is still one call, no more.
    let grantAfter = 0
    const late = run(canoeCycleSeconds(cfg, cfg.trapMaxSeconds), (w, t) => {
      if (w !== 'UPSTREAM') return true
      grantAfter ||= t + 8
      return t >= grantAfter
    })
    const firstTurn = late.phases.find((p) => p.phase === 'turn')!.t
    const ups = late.calls.filter((c) => c.word === 'UPSTREAM' && c.t <= firstTurn)
    expect(ups).toHaveLength(1)
    expect(ups[0].clock).toBeGreaterThan(cfg.callDelaySeconds + 7)
  })

  it('never leaves its range and never despawns', () => {
    const { positions, lane, bank } = run(canoeCycleSeconds(cfg, cfg.trapMaxSeconds) * 4)
    const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz - lane.origin
    const out = (p: { x: number; z: number }) => p.x * bank.nx + p.z * bank.nz
    for (const p of positions) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true)
      expect(along(p)).toBeGreaterThanOrEqual(cfg.laneStart - 1e-6)
      expect(along(p)).toBeLessThanOrEqual(cfg.laneEnd + 1e-6)
      expect(out(p)).toBeLessThanOrEqual(lane.out + 1e-6)
      expect(out(p)).toBeGreaterThanOrEqual(out(lane.berth) - 1e-6)
    }
  })

  it('heads against the current going up and with it going down; bow to the shore at the landing', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const state = createCanoe(lane)
    const seen = new Map<CanoePhase, { bx: number; bz: number }>()
    for (let i = 0; i < 4000 && seen.size < CANOE_PHASES.length; i++) {
      stepCanoe(state, lane, { mayCall: () => true }, 0.05, cfg, () => 0)
      // Sample the middle of a phase, where the heading has settled.
      if (!seen.has(state.phase) && state.clock > 1 && (state.phase !== 'land' || state.clock >= cfg.landSeconds - 0.1)) {
        seen.set(state.phase, { bx: Math.sin(state.yaw), bz: Math.cos(state.yaw) })
      }
    }
    const up = seen.get('up')!
    const down = seen.get('down')!
    const land = seen.get('land')!
    expect(up.bx * bank.fx + up.bz * bank.fz).toBeCloseTo(-1, 6)
    expect(down.bx * bank.fx + down.bz * bank.fz).toBeCloseTo(1, 6)
    expect(land.bx * -bank.nx + land.bz * -bank.nz).toBeGreaterThan(0.99)
    // The paddler is out at the trap while he checks it, and back aboard after.
    expect(state.paddler.inBoat || state.phase === 'trap').toBe(true)
  })

  it('turns the paddler smoothly out of the seat to the trap and back aboard', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const state = createCanoe(lane)
    const dt = 0.02
    // A heading may turn, never jump: 0.1 rad per 20 ms is a full turn in ~1.3 s.
    const maxStep = 0.1
    let prev: number | null = null
    let worst = 0
    let leftSeat = false
    let sawTrap = false
    for (let i = 0; i < 20000; i++) {
      const before = state.phase
      stepCanoe(state, lane, { mayCall: () => true }, dt, cfg, () => 0)
      const inTrap = before === 'trap' || state.phase === 'trap'
      if (inTrap || before === 'land' || state.phase === 'launch') {
        if (prev !== null) {
          let d = Math.abs(state.paddler.yaw - prev) % (Math.PI * 2)
          if (d > Math.PI) d = Math.PI * 2 - d
          worst = Math.max(worst, d)
        }
        prev = state.paddler.yaw
      } else prev = null
      if (state.phase === 'trap') {
        sawTrap = true
        const seatX = state.x - Math.sin(state.yaw) * CANOE_SEAT_AFT
        const seatZ = state.z - Math.cos(state.yaw) * CANOE_SEAT_AFT
        if (!state.paddler.inBoat && Math.hypot(state.paddler.x - seatX, state.paddler.z - seatZ) > 0.5) leftSeat = true
      }
      if (sawTrap && state.phase === 'up') break
    }
    expect(sawTrap).toBe(true)
    expect(leftSeat).toBe(true)
    expect(worst).toBeLessThan(maxStep)
  })
})
