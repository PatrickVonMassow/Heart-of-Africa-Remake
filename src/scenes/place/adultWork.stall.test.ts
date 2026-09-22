import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../../config/balance'
import { instructionDelay } from '../../communication/speaking'
import { resetDevAsserts } from '../../systems/devAssert'
import {
  clearTask, createAdultWork, goalOf, stepAdultWork,
  type AdultWorkView, type AdultWorkConfig,
} from './adultWork'

const cfg: AdultWorkConfig = { ...balance.villageLife.adultErrands, intervalSeconds: 1, intervalSpread: 0 }

function fixture(config = cfg) {
  const view: AdultWorkView = {
    villagers: [{ x: 0, z: 0, free: true }, { x: 1, z: 0, free: true }],
    geography: {
      waterStand: { x: 0, z: 5 }, waterHead: { x: 10, z: 0 },
      waterFoot: { x: 40, z: 0 }, waterFill: { x: 42, z: 0 }, digSites: [],
    },
    standable: () => true, childrenHear: () => false, invitationClear: () => true,
  }
  const state = createAdultWork(2, config)
  const step = (dt = 0.25) => stepAdultWork(state, view, dt, config, () => 0.5)
  step(config.intervalSeconds)
  const sender = state.tasks.findIndex((t) => t?.phase === 'send')
  const carrier = state.tasks[sender]!.partner!
  const pair = [...state.tasks]
  state.next = Infinity
  view.villagers.forEach((v) => { v.free = false })
  const atGoal = (i: number) => Object.assign(view.villagers[i], goalOf(state.tasks[i]!))
  const walk = (dt = 0.25) => {
    state.tasks.forEach((t, i) => {
      if (!t || t.arrived) return
      const me = view.villagers[i], goal = goalOf(t)
      const distance = Math.hypot(goal.x - me.x, goal.z - me.z)
      if (!distance) return
      const stride = Math.min(distance, config.pace * dt)
      const x = me.x + (goal.x - me.x) / distance * stride
      const z = me.z + (goal.z - me.z) / distance * stride
      if (view.standable(x, z)) Object.assign(me, { x, z })
    })
    return step(dt)
  }
  return { state, view, sender, carrier, pair, step, walk, atGoal }
}

beforeEach(resetDevAsserts)
afterEach(() => { vi.restoreAllMocks(); resetDevAsserts() })

describe('adult errand progress release', () => {
  it.each(['sender', 'carrier'] as const)('releases both men when the %s cannot reach his stand, then casts water again', (blockedRole) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fixture()
    const blocked = f[blockedRole], waiting = blocked === f.sender ? f.carrier : f.sender
    f.atGoal(waiting)
    const goal = goalOf(f.state.tasks[blocked]!)
    Object.assign(f.view.villagers[blocked], { x: goal.x + 2, z: goal.z })
    f.view.standable = (x, z) => Math.hypot(x - goal.x, z - goal.z) >= 2
    for (let elapsed = 0; elapsed < cfg.stallSeconds - 0.25; elapsed += 0.25) f.walk()
    expect(f.state.tasks).toEqual(f.pair)
    expect(f.state.tasks[waiting]!.arrived).toBe(true)
    f.walk()
    expect(f.state.tasks).toEqual([null, null])
    expect(f.pair.every((t) => t!.age < cfg.errandSeconds)).toBe(true)
    expect(f.state.emitted).toEqual([])
    expect(errors).not.toHaveBeenCalled()
    f.view.standable = () => true
    f.view.villagers.forEach((v) => { v.free = true })
    f.state.next = 0
    f.step()
    expect(f.state.staged['water-out']).toBe(2)
    expect(f.state.tasks.every((t) => t?.situation === 'water-out')).toBe(true)
    expect(f.state.tasks.some((t) => f.pair.includes(t))).toBe(false)
  })

  it('counts shuffling back and forth as stalled rather than fresh progress', () => {
    const f = fixture()
    f.atGoal(f.sender)
    const goal = goalOf(f.state.tasks[f.carrier]!)
    for (let tick = 0; tick < cfg.stallSeconds * 4; tick++) {
      Object.assign(f.view.villagers[f.carrier], { x: goal.x + 2 + tick % 2, z: goal.z })
      f.step()
    }
    expect(f.state.tasks).toEqual([null, null])
  })

  it('keeps an arrived sender while his carrier makes steady headway for longer than the stall window', () => {
    const f = fixture()
    f.atGoal(f.sender)
    const goal = goalOf(f.state.tasks[f.carrier]!)
    Object.assign(f.view.villagers[f.carrier], { x: goal.x + 60, z: goal.z })
    for (let elapsed = 0; elapsed < cfg.stallSeconds * 2; elapsed += 0.25) f.walk()
    expect(f.state.tasks).toEqual(f.pair)
    expect(f.state.tasks[f.sender]!.arrived).toBe(true)
    expect(f.state.tasks[f.carrier]!.arrived).toBe(false)
  })

  it('starts a fresh stall window after renewed headway', () => {
    const f = fixture()
    f.atGoal(f.sender)
    const goal = goalOf(f.state.tasks[f.carrier]!)
    Object.assign(f.view.villagers[f.carrier], { x: goal.x + 5, z: goal.z })
    for (let elapsed = 0; elapsed < cfg.stallSeconds - 0.25; elapsed += 0.25) f.step()
    f.view.villagers[f.carrier].x -= 1
    f.step()
    for (let elapsed = 0; elapsed < cfg.stallSeconds - 0.25; elapsed += 0.25) f.step()
    expect(f.state.tasks).toEqual(f.pair)
    f.step()
    expect(f.state.tasks).toEqual([null, null])
  })

  it('resets between legs, permits filling and completes a round trip with the sender waiting', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fixture({ ...cfg, stallSeconds: 2 })
    f.atGoal(f.sender)
    f.step(1.5)
    f.atGoal(f.carrier)
    const words: string[] = []
    let filled = false
    for (let elapsed = 0; elapsed < cfg.errandSeconds && f.state.tasks.some(Boolean); elapsed += 0.25) {
      const word = f.walk()
      if (word) words.push(word.id)
      if (f.state.tasks[f.carrier]?.phase === 'fill') filled = true
    }
    expect(words).toEqual(['water-out', 'water-back'])
    expect(filled).toBe(true)
    expect(f.state.standJars).toBe(1)
    expect(f.state.tasks).toEqual([null, null])
    expect(errors).not.toHaveBeenCalled()
  })

  it('releases a stalled return leg along with its waiting sender', () => {
    const f = fixture()
    f.atGoal(f.sender)
    f.atGoal(f.carrier)
    // The order is spoken first and obeyed a moment later (work-order 1184), so
    // the budget covers the hold between the two.
    const ticks = 4 + Math.ceil(instructionDelay('RIVER') / 0.25)
    for (let tick = 0; tick < ticks && f.state.tasks[f.carrier]!.phase !== 'fetch'; tick++) f.step()
    f.atGoal(f.carrier)
    while (f.state.tasks[f.carrier]!.situation !== 'water-back') f.step()
    for (let elapsed = 0; elapsed < cfg.stallSeconds; elapsed += 0.25) f.step()
    expect(f.state.tasks).toEqual([null, null])
    expect(f.state.standJars).toBe(0)
  })

  it('still diagnoses an ordinary cancellation of a pair that never met', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fixture()
    clearTask(f.state, f.carrier)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-pair-never-met')
  })

  it('does not excuse dropping a withheld word when a coarse step crosses the stall deadline', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fixture()
    f.view.childrenHear = () => true
    f.atGoal(f.sender)
    f.atGoal(f.carrier)
    f.step()
    f.step()
    const sender = f.state.tasks[f.sender]!, carrier = f.state.tasks[f.carrier]!
    expect(sender.withheld).toBe(true)
    const owner = sender.speechOwner!
    expect(f.state.floor!.waiting(owner)).toBe(true)
    carrier.arrived = false
    f.view.villagers[f.carrier].x += 3
    f.step(cfg.stallSeconds)
    expect(f.state.tasks).toEqual([null, null])
    expect(f.state.floor!.waiting(owner)).toBe(false)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-atom-lost')
    expect(errors.mock.calls.flat().join(' ')).not.toContain('adult-pair-never-met')
  })

  it('does not impose a stale speech deadline when a displaced partner keeps making headway', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fixture()
    f.view.childrenHear = () => true
    f.atGoal(f.sender)
    f.atGoal(f.carrier)
    f.step()
    f.step()
    expect(f.state.tasks[f.sender]!.withheld).toBe(true)
    f.state.tasks[f.carrier]!.arrived = false
    f.view.villagers[f.carrier].x += 80
    for (let elapsed = 0; elapsed < cfg.stallSeconds * 2; elapsed += 0.25) f.walk()
    expect(f.state.tasks).toEqual(f.pair)
    expect(f.state.tasks[f.sender]!.owes).toBe(true)
    expect(f.state.floor!.forcedCount).toBe(0)
    expect(errors).not.toHaveBeenCalled()
  })
})
