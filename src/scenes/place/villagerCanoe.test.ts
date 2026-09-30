// THE FISHERMEN'S DUGOUT (work-order 1237, rebuilt by 1245): its lane beside
// the children's bank game, the 20 m it keeps from their stretch and from the
// adults' water work, and the two-man drift-net cycle — every word from the net
// man to the paddler, every word followed by the paddler's changed action.

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { RIVER_HALF_LENGTH, RIVER_REACH } from '../../render/placeRiver'
import { BACKDROP_INNER_OFFSET, GROUND_DISC_OVERHANG } from './backdrop'
import { bankDrawnReach, groundDiscShift, insidePlace } from './boundary'
import { sharedLayout } from './layoutHarness'
import { PLACE_RADIUS } from './layout'
import { bankFillSpot, bankWaterFoot, buildRiverBank } from './riverBank'
import { basketRingViolation, createBasketRing, type BasketRing } from './fishBaskets'
import {
  CANOE_NETMAN_FORE,
  CANOE_PHASES,
  canoeCycleSeconds,
  canoeLane,
  canoeRangeGap,
  canoeStretchGap,
  createCanoe,
  lanePoint,
  netFloats,
  netHand,
  stepCanoe,
  unloadSeconds,
  type CanoePhase,
  type CanoeState,
  type CanoeWord,
  type PaddlerAction,
} from './villagerCanoe'

beforeAll(setupGeodata)

const cfg = balance.villageLife.canoe
const RIVER_VILLAGES = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
const SEEDS = [7, 4711, 394349866, 1425108822, 1838110026]
const OBEY = 2.2

describe('the canoe lane (work-order 1245 items 9 and 10)', () => {
  it('has riverside villages to lay it at', () => {
    expect(RIVER_VILLAGES.length).toBeGreaterThanOrEqual(3)
  })

  it.each(RIVER_VILLAGES)('%s: lies 7 m out, from s = −1 to +47 m downstream of the bank normal', (id) => {
    const layout = sharedLayout(id, 4711)
    const bank = layout.bank!
    const lane = canoeLane(bank)
    const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz
    const out = (p: { x: number; z: number }) => p.x * bank.nx + p.z * bank.nz
    expect(along(lane.start)).toBeCloseTo(cfg.laneStart, 9)
    expect(along(lane.end)).toBeCloseTo(cfg.laneEnd, 9)
    expect(out(lane.start) - bank.distance).toBeCloseTo(cfg.laneOut, 9)
    expect(out(lane.end) - bank.distance).toBeCloseTo(cfg.laneOut, 9)
    expect(cfg.laneStart).toBe(-1)
    expect(cfg.laneEnd).toBe(47)
    expect(cfg.laneOut).toBe(7)
    // Downstream of the children: the lane runs WITH the current from start to end.
    expect(along(lane.end)).toBeGreaterThan(along(lane.start))
    // ... and downstream of their stretch altogether.
    expect(along(lane.start)).toBeGreaterThan(along(bank.downstream))
  })

  it.each(RIVER_VILLAGES.flatMap((id) => SEEDS.map((seed) => [id, seed] as const)))(
    '%s @%i: keeps at least 20 m from the children`s stretch AND from the adults` water work',
    (id, seed) => {
      const layout = sharedLayout(id, seed)
      const bank = layout.bank!
      const lane = canoeLane(bank)
      expect(layout.playRocks).not.toBeNull()
      expect(cfg.stretchGapMin).toBe(20)
      expect(canoeStretchGap(lane, layout.playRocks!)).toBeGreaterThanOrEqual(cfg.stretchGapMin)
      // The water work: where the path lands, where the jar is filled, and
      // the stand in the village where both of its words fall.
      const sites = [bankWaterFoot(bank), bankFillSpot(bank), ...(layout.waterStand ? [layout.waterStand] : [])]
      if (layout.waterPath) sites.push(layout.waterPath.head)
      for (const p of sites) expect(canoeRangeGap(lane, p), JSON.stringify(p)).toBeGreaterThanOrEqual(cfg.stretchGapMin)
    },
  )

  it.each(RIVER_VILLAGES)('%s: the landing, the basket and the ashore stand are walkable, drawn ground', (id) => {
    const layout = sharedLayout(id, 4711)
    const bank = layout.bank!
    const lane = canoeLane(bank)
    for (const [name, p] of [['basket', lane.basketSpot], ['ashore', lane.ashore]] as const) {
      expect(insidePlace(layout, p.x, p.z, 0.3), name).toBe(true)
    }
    // The bow on the sand lies inside the walkable lobe, at the waterline.
    const bow = {
      x: lane.berth.x - bank.nx * (cfg.hullLength / 2),
      z: lane.berth.z - bank.nz * (cfg.hullLength / 2),
    }
    expect(insidePlace(layout, bow.x, bow.z)).toBe(true)
  })

  it.each(RIVER_VILLAGES)('%s: the whole lane and the net float on drawn water, clear of the backdrop`s rim', (id) => {
    const layout = sharedLayout(id, 4711)
    const bank = layout.bank!
    const lane = canoeLane(bank)
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    const reach = bankDrawnReach(layout, discEdge)
    const half = cfg.hullLength / 2
    const onWater = (p: { x: number; z: number }, what: string, body: number) => {
      const along = p.x * bank.fx + p.z * bank.fz
      const out = p.x * bank.nx + p.z * bank.nz
      expect(along, what).toBeLessThanOrEqual(Math.max(RIVER_HALF_LENGTH, reach.down))
      expect(along, what).toBeGreaterThanOrEqual(-Math.max(RIVER_HALF_LENGTH, reach.up))
      expect(out - bank.distance, what).toBeLessThan(RIVER_REACH - 0.3)
      expect(out - bank.distance, what).toBeGreaterThan(0.5)
      const rim = layout.radius + BACKDROP_INNER_OFFSET + groundDiscShift(layout, Math.atan2(p.z, p.x))
      expect(Math.hypot(p.x, p.z) + body, what).toBeLessThan(rim)
    }
    for (let s = cfg.laneStart - half; s <= cfg.laneEnd + half; s += 0.5) onWater(lanePoint(lane, s), `s=${s}`, cfg.hullBeam)
    // The net's floats at every point of a whole cycle.
    const { states } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 1.2, { village: id })
    for (const st of states) for (const f of st.floats) onWater(f, `${st.phase} float`, 0.1)
  })
})

interface Sample {
  t: number
  phase: CanoePhase
  s: number
  x: number
  z: number
  yaw: number
  paddler: PaddlerAction
  net: number
  inHull: number
  floats: Array<{ x: number; z: number }>
}

/**
 * Runs the canoe for `seconds` at a fixed step, recording each phase entry and
 * every word. The basket ring gets its empty basket back from a stand-in
 * carrier `carrierDelay` seconds after each full one is set down.
 */
function run(
  seconds: number,
  options: {
    say?: (word: CanoeWord, t: number) => 'said' | 'held' | 'silent'
    dt?: number
    village?: string
    carrierDelay?: number
    rand?: () => number
  } = {},
) {
  const dt = options.dt ?? 0.05
  const bank = buildRiverBank(PLACES.find((p) => p.id === (options.village ?? 'bambara-village'))!, PLACE_RADIUS)!
  const lane = canoeLane(bank)
  const state = createCanoe(lane)
  const ring: BasketRing = createBasketRing(0)
  const phases: Array<{ phase: CanoePhase; t: number }> = [{ phase: state.phase, t: 0 }]
  const calls: Array<{ word: CanoeWord; t: number; phase: CanoePhase }> = []
  const drops: number[] = []
  const states: Sample[] = []
  const actions: Array<{ t: number; action: PaddlerAction }> = []
  let t = 0
  let fullSince: number | null = null
  let draws = 0
  const rand = options.rand ?? (() => [0.2, 0.9, 0.5][draws++ % 3])
  while (t < seconds) {
    const before = state.phase
    const said = stepCanoe(
      state,
      lane,
      ring,
      { say: (w) => (options.say ? options.say(w, t) : 'said'), drop: () => drops.push(t), obeyDelay: () => OBEY },
      dt,
      cfg,
      rand,
    )
    t += dt
    // The stand-in carrier: the full basket goes, an empty one comes back.
    const full = ring.baskets.find((b) => b.at === 'bank' && b.fish > 0)
    if (full && fullSince === null) fullSince = t
    if (full && fullSince !== null && t - fullSince >= (options.carrierDelay ?? 0)) {
      full.fish = 0
      fullSince = null
    }
    expect(basketRingViolation(ring)).toBeNull()
    if (said) calls.push({ word: said, t, phase: before })
    if (state.phase !== before) phases.push({ phase: state.phase, t })
    if (!actions.length || actions[actions.length - 1].action !== state.paddlerAction) actions.push({ t, action: state.paddlerAction })
    states.push({
      t,
      phase: state.phase,
      s: state.s,
      x: state.x,
      z: state.z,
      yaw: state.yaw,
      paddler: state.paddlerAction,
      net: state.net,
      inHull: state.inHull,
      floats: netFloats(state, lane),
    })
  }
  return { lane, bank, state, ring, phases, calls, drops, states, actions }
}

describe('the drift-net cycle (work-order 1245 item 1)', () => {
  it('runs up, the DOWNSTREAM word, turn, down, haul, land, unload, the UPSTREAM word, launch — and round again', () => {
    const { phases } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 3)
    const order = phases.map((p) => p.phase)
    expect(order.length).toBeGreaterThan(20)
    for (let i = 1; i < order.length; i++) {
      const prev = CANOE_PHASES.indexOf(order[i - 1])
      expect(order[i]).toBe(CANOE_PHASES[(prev + 1) % CANOE_PHASES.length])
    }
  })

  it('takes the calibrated time over every leg', () => {
    const { phases } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 2)
    const span = cfg.laneEnd - cfg.laneStart
    const lengths = new Map<CanoePhase, number[]>()
    for (let i = 0; i + 1 < phases.length; i++) {
      const list = lengths.get(phases[i].phase) ?? []
      list.push(phases[i + 1].t - phases[i].t)
      lengths.set(phases[i].phase, list)
    }
    // The first up leg starts at the lane's end, so every up leg is whole.
    for (const up of lengths.get('up')!) expect(up).toBeCloseTo(span / cfg.upstreamSpeed, 0)
    for (const turn of lengths.get('turn')!) expect(turn).toBeCloseTo(cfg.turnSeconds, 0)
    for (const down of lengths.get('down')!) expect(down).toBeCloseTo(span / cfg.downstreamSpeed, 0)
    for (const haul of lengths.get('haul')!) expect(haul).toBeCloseTo(cfg.haulSeconds, 0)
    for (const land of lengths.get('land')!) expect(land).toBeCloseTo(cfg.landSeconds, 0)
    for (const unload of lengths.get('unload')!) {
      expect(unload).toBeGreaterThanOrEqual(unloadSeconds(cfg.catchMin, cfg) - 0.1)
      expect(unload).toBeLessThanOrEqual(unloadSeconds(cfg.catchMax, cfg) + 0.1)
    }
    for (const call of [...lengths.get('callDown')!, ...lengths.get('callUp')!]) expect(call).toBeCloseTo(OBEY, 0)
    for (const launch of lengths.get('launch')!) expect(launch).toBeCloseTo(cfg.launchSeconds, 0)
    // A 49 m lane instead of 20 m (item 9), at regionally plausible paces.
    expect(span).toBe(48)
    expect(cfg.upstreamSpeed).toBeCloseTo(0.8, 9)
    expect(cfg.downstreamSpeed).toBeCloseTo(1.5, 9)
  })

  it('the net man says DOWNSTREAM at the upstream end and UPSTREAM after the landing, each once per round', () => {
    const { calls, phases } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 3)
    const downs = calls.filter((c) => c.word === 'DOWNSTREAM')
    const ups = calls.filter((c) => c.word === 'UPSTREAM')
    expect(downs.length).toBeGreaterThanOrEqual(3)
    expect(ups.length).toBeGreaterThanOrEqual(2)
    expect(downs.every((c) => c.phase === 'callDown')).toBe(true)
    expect(ups.every((c) => c.phase === 'callUp')).toBe(true)
    // Exactly one word per call phase.
    for (const p of phases.filter((q) => q.phase === 'callDown' || q.phase === 'callUp')) {
      const next = phases.find((q) => q.t > p.t)
      if (!next) continue
      expect(calls.filter((c) => c.t > p.t && c.t <= next.t)).toHaveLength(1)
    }
    // Nothing is said anywhere else in the cycle.
    expect(calls.every((c) => c.phase === 'callDown' || c.phase === 'callUp')).toBe(true)
  })

  it('every word is followed by the paddler`s changed action, and by nothing else first', () => {
    const { calls, actions } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 3)
    const after = (t: number) => actions.find((a) => a.t > t + 1e-9 && a.action !== 'hold')
    for (const c of calls) {
      const next = after(c.t)
      if (!next) continue
      // DOWNSTREAM: he stops paddling and swings the bow out. UPSTREAM: he takes
      // up hard strokes again.
      expect(next.action).toBe(c.word === 'DOWNSTREAM' ? 'swing' : 'hard')
      // ... once the word has been said and heard out, not before.
      expect(next.t - c.t).toBeGreaterThanOrEqual(OBEY - 0.1)
      expect(next.t - c.t).toBeLessThan(OBEY + 0.2)
    }
    // And while the word is owed he only holds the boat.
    const { states } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY))
    for (let i = 1; i < states.length; i++) {
      const s = states[i]
      // (The step a phase is entered on still shows the action it ended.)
      if ((s.phase === 'callDown' || s.phase === 'callUp') && states[i - 1].phase === s.phase) expect(s.paddler).toBe('hold')
    }
    // The legs themselves: hard strokes up, steering only down, both hauling.
    for (const s of states) {
      if (s.phase === 'up') expect(s.paddler).toBe('hard')
      if (s.phase === 'down') expect(s.paddler).toBe('steer')
      if (s.phase === 'haul') expect(s.paddler).toBe('haul')
    }
  })

  it('pays the net out on the turn, holds it in the water downstream, hauls it in at the end', () => {
    const { states } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 1.5)
    for (const s of states) {
      if (s.phase === 'up' || s.phase === 'callDown' || s.phase === 'land' || s.phase === 'unload') {
        expect(s.net).toBe(0)
        expect(s.floats).toHaveLength(0)
      }
      if (s.phase === 'down') {
        expect(s.net).toBe(1)
        expect(s.floats).toHaveLength(cfg.netFloats)
      }
    }
    // Out while turning, in while hauling — within each turn and each haul.
    for (let i = 1; i < states.length; i++) {
      const [a, b] = [states[i - 1], states[i]]
      if (a.phase !== b.phase) continue
      if (b.phase === 'turn') expect(b.net).toBeGreaterThanOrEqual(a.net)
      if (b.phase === 'haul') expect(b.net).toBeLessThanOrEqual(a.net)
    }
  })

  it('draws the float line in toward the hull while hauling', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const state = createCanoe(lane)
    const ring = createBasketRing(0)
    const extents: number[] = []
    for (let i = 0; i < 40000; i++) {
      stepCanoe(state, lane, ring, { say: () => 'said', obeyDelay: () => OBEY }, 0.05, cfg, () => 0.5)
      if (state.phase === 'haul') {
        const hand = netHand(state, lane)
        const pts = netFloats(state, lane)
        extents.push(pts.length ? Math.max(...pts.map((p) => Math.hypot(p.x - hand.x, p.z - hand.z))) : 0)
      } else if (extents.length) break
    }
    expect(extents.length).toBeGreaterThan(20)
    for (let i = 1; i < extents.length; i++) expect(extents[i]).toBeLessThanOrEqual(extents[i - 1] + 1e-9)
    expect(extents[extents.length - 1]).toBeLessThan(extents[0] * 0.2)
  })

  it('completes the hand-over even when one step jumps the whole unload', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const state = createCanoe(lane)
    const ring = createBasketRing(0)
    const view = { say: () => 'said' as const, obeyDelay: () => OBEY }
    for (let i = 0; i < 40000 && state.phase !== 'unload'; i++) stepCanoe(state, lane, ring, view, 0.05, cfg, () => 0.5)
    const catchSize = state.inHull
    expect(catchSize).toBeGreaterThan(0)
    stepCanoe(state, lane, ring, view, unloadSeconds(state.catch, cfg) + 1, cfg, () => 0.5)
    stepCanoe(state, lane, ring, view, 0.05, cfg, () => 0.5)
    expect(state.inHull).toBe(0)
    expect(ring.baskets.find((b) => b.at === 'bank' && b.fish === catchSize)).toBeTruthy()
    expect(state.phase).toBe('callUp')
  })

  it('brings up a recognisable catch that lies in the hull until the landing, then fills the basket', () => {
    const { states, ring } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 1.05, { carrierDelay: 1e9 })
    const haulEnd = states.filter((s) => s.phase === 'land')[0]
    expect(haulEnd.inHull).toBeGreaterThanOrEqual(cfg.catchMin)
    expect(haulEnd.inHull).toBeLessThanOrEqual(cfg.catchMax)
    // Never vanish: from the haul's end to the unload the count stands.
    for (const s of states.filter((q) => q.phase === 'land')) expect(s.inHull).toBe(haulEnd.inHull)
    // Handed over into the basket, which stands on the bank full afterwards.
    const full = ring.baskets.find((b) => b.at === 'bank' && b.fish > 0)
    expect(full?.fish).toBe(haulEnd.inHull)
    expect(states[states.length - 1].inHull).toBe(0)
    // Fish of a hand to a forearm.
    expect(cfg.fishLengthMin).toBeGreaterThanOrEqual(0.25)
    expect(cfg.fishLengthMax).toBeLessThanOrEqual(0.4)
  })

  it('waits at the landing for an empty basket rather than conjuring one', () => {
    const { state, ring } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 2.2, { carrierDelay: 1e9 })
    // The stand-in carrier never came: one full basket on the bank, the other
    // with nobody — the boat stands at the landing with its second catch.
    expect(state.phase).toBe('unload')
    expect(state.basketWait).toBeGreaterThan(0)
    expect(state.inHull).toBeGreaterThanOrEqual(cfg.catchMin)
    expect(ring.baskets.filter((b) => b.fish > 0)).toHaveLength(1)
  })

  it('waits for the floor, and goes on unspoken when the word is held too long or may not be said', () => {
    // Held for ever: the boat waits `wordWaitSeconds`, drops the word, goes on.
    const held = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 2, { say: () => 'held' })
    expect(held.calls).toHaveLength(0)
    expect(held.drops.length).toBeGreaterThanOrEqual(3)
    const waits = held.phases.filter((p) => p.phase === 'callDown').map((p) => {
      const next = held.phases.find((q) => q.t > p.t)
      return next ? next.t - p.t : null
    }).filter((w): w is number => w !== null)
    for (const w of waits) expect(w).toBeCloseTo(cfg.wordWaitSeconds, 0)
    // Not to be said at all (ROCK not yet heard): on at once.
    const silent = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY), { say: () => 'silent' })
    expect(silent.calls).toHaveLength(0)
    const pause = silent.phases.find((p) => p.phase === 'callDown')!
    const next = silent.phases.find((q) => q.t > pause.t)!
    expect(next.t - pause.t).toBeLessThan(0.2)
    // A late grant is still one word, no more.
    let grantAfter = 0
    const late = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY), {
      say: (w, t) => {
        if (w !== 'DOWNSTREAM') return 'said'
        grantAfter ||= t + 5
        return t >= grantAfter ? 'said' : 'held'
      },
    })
    expect(late.calls.filter((c) => c.word === 'DOWNSTREAM')).toHaveLength(1)
  })

  it('never leaves its range and never despawns', () => {
    const { states, lane, bank } = run(canoeCycleSeconds(cfg, cfg.catchMax, OBEY) * 4)
    const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz
    const out = (p: { x: number; z: number }) => p.x * bank.nx + p.z * bank.nz
    for (const p of states) {
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
    const state: CanoeState = createCanoe(lane)
    const ring = createBasketRing(0)
    const seen = new Map<CanoePhase, { bx: number; bz: number }>()
    for (let i = 0; i < 8000 && seen.size < CANOE_PHASES.length; i++) {
      stepCanoe(state, lane, ring, { say: () => 'said', obeyDelay: () => OBEY }, 0.05, cfg, () => 0)
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
  })

  it('moves the net man smoothly ashore and back aboard, never jumping', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const state = createCanoe(lane)
    const ring = createBasketRing(0)
    const dt = 0.02
    let prev: { x: number; z: number } | null = null
    let worst = 0
    let ashore = false
    // Measured over every step from the landing to the first stroke upstream
    // again, so the boarding transitions themselves are inside the measure.
    let done = false
    for (let i = 0; i < 40000 && !done; i++) {
      const before = state.phase
      stepCanoe(state, lane, ring, { say: () => 'said', obeyDelay: () => OBEY }, dt, cfg, () => 0)
      const inRange = ['land', 'unload', 'callUp', 'launch'].includes(state.phase) || ['land', 'unload', 'callUp', 'launch'].includes(before)
      if (inRange) {
        if (prev) worst = Math.max(worst, Math.hypot(state.netMan.x - prev.x, state.netMan.z - prev.z))
        prev = { x: state.netMan.x, z: state.netMan.z }
        if (!state.netMan.inBoat) ashore = true
      } else prev = null
      if (ashore && before === 'launch' && state.phase === 'up') done = true
    }
    expect(ashore).toBe(true)
    expect(done).toBe(true)
    // Back aboard, on his seat forward of the hull's centre.
    expect(state.netMan.inBoat).toBe(true)
    expect(Math.hypot(state.netMan.x - (state.x + Math.sin(state.yaw) * CANOE_NETMAN_FORE), state.netMan.z - (state.z + Math.cos(state.yaw) * CANOE_NETMAN_FORE))).toBeLessThan(1e-6)
    // At most a brisk step's worth per 20 ms frame.
    expect(worst).toBeLessThan(0.1)
  })
})
