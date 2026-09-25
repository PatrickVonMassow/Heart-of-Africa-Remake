import { expect, it, vi } from 'vitest'
import { balance } from '../../src/config/balance'
import { bankCycleSeconds, followBankTeaching, bankTeachingOrder, observeBankCall } from './communicationDriver.mjs'

const bank = balance.villageLife.bankGame
const cycleSeconds = bankCycleSeconds(bank, balance.communication, balance.villageLife.tag.childCount)

it('derives the observation budget from the shipped phases, holds and number of runs', () => {
  expect(cycleSeconds).toBeGreaterThan(110)
  const longer = bankCycleSeconds({ ...bank, runSeconds: bank.runSeconds + 10 },
    balance.communication, balance.villageLife.tag.childCount)
  expect(longer - cycleSeconds).toBeCloseTo(10 * balance.villageLife.tag.childCount)
  expect(bankCycleSeconds({ ...bank, roamGuardSeconds: bank.roamGuardSeconds + 15 },
    balance.communication, balance.villageLife.tag.childCount) - cycleSeconds).toBeCloseTo(15)
  expect(bankCycleSeconds(bank, balance.communication, 6)).toBeGreaterThan(cycleSeconds)
  expect(() => bankCycleSeconds(bank, balance.communication, 1)).toThrow('two children')
})

it('follows the children through a late ROCK and gives a call 110 seconds later a fresh cycle', async () => {
  let time = 0
  const events = []
  const rock = { concept: 'ROCK', pageMs: 293800, audioSeconds: 293.8 }
  const approach = vi.fn(async () => { time += 1000 })
  const result = await followBankTeaching({
    cycleSeconds, now: () => time, approach,
    readRock: async () => time >= rock.pageMs ? rock : null,
    waitForRock: async (timeout) => { time += timeout; return time >= rock.pageMs ? rock : null },
    onRock: async (heard) => events.push(heard.concept),
    call: async (budgetMs) => {
      expect(events).toEqual(['ROCK'])
      expect(budgetMs).toBe(Math.ceil(cycleSeconds * 1000))
      expect(budgetMs).toBeGreaterThan(110000)
      time += 110000
      events.push('RIVER')
      return { shownAt: time / 1000 }
    },
  })
  expect(approach.mock.calls.length).toBeGreaterThan(10)
  expect(result.shownAt * 1000 - rock.pageMs).toBeGreaterThanOrEqual(110000)
  expect(events).toEqual(['ROCK', 'RIVER'])
})

it.each(['before following', 'during a walk'])('retains ROCK heard %s without waiting for another note', async (when) => {
  let heard = when === 'before following'
  const waitForRock = vi.fn()
  const call = vi.fn()
  await followBankTeaching({
    cycleSeconds, approach: async () => { heard = true },
    readRock: async () => heard ? { concept: 'ROCK' } : null,
    waitForRock, onRock: async () => {}, call,
  })
  expect(waitForRock).not.toHaveBeenCalled()
  expect(call).toHaveBeenCalledWith(Math.ceil(cycleSeconds * 1000))
})

it('fails after the configured cycle if ROCK never reaches the player', async () => {
  let time = 0
  const call = vi.fn()
  await expect(followBankTeaching({
    cycleSeconds, now: () => time, approach: async () => {}, readRock: async () => null,
    waitForRock: async (timeout) => { time += timeout; return null }, onRock: async () => {}, call,
  })).rejects.toThrow('No ROCK hearing within')
  expect(time).toBe(Math.ceil(cycleSeconds * 1000))
  expect(call).not.toHaveBeenCalled()
})

it('records ROCK-first evidence and rejects a missing, reversed or simultaneous first hearing', () => {
  const rock = { concept: 'ROCK', atom: 'ba', pageMs: 293800, audioSeconds: 293.8, heardBefore: [] }
  const river = { concept: 'RIVER', atom: 'BA', pageMs: 404400, audioSeconds: 404.4, heardBefore: ['ba'] }
  const call = { shownAt: 404.4 }
  expect(bankTeachingOrder([rock, river], call)).toEqual({ rock, river, callShownAt: 404.4,
    rockBeforeRiver: true, rockBeforeCall: true })
  expect(bankTeachingOrder([river], call).rockBeforeRiver).toBe(false)
  expect(bankTeachingOrder([rock], call).rockBeforeRiver).toBe(false)
  expect(bankTeachingOrder([{ ...river, heardBefore: [] }, rock], call).rockBeforeRiver).toBe(false)
  expect(bankTeachingOrder([rock, { ...river, pageMs: rock.pageMs, heardBefore: [] }], call).rockBeforeRiver).toBe(false)
  expect(bankTeachingOrder([rock, river], { shownAt: 200 }).rockBeforeCall).toBe(false)
})

it('preserves a message-first drum hearing while proving ROCK preceded the observed child call', () => {
  const river = { concept: 'RIVER', atom: 'BA', pageMs: 1000, heardBefore: [], drumMessage: 'errand' }
  const rock = { concept: 'ROCK', atom: 'ba', pageMs: 3000, heardBefore: ['BA'], drumMessage: 'errand' }
  expect(bankTeachingOrder([river, rock], { shownAt: 200 })).toEqual({
    river, rock, callShownAt: 200, rockBeforeRiver: false, rockBeforeCall: true,
  })
})

it('faces the bank before a fresh call and accepts it without turning to the note', async () => {
  let time = 0, facing = false
  const label = { speakerId: 'kid-2', shownAt: 0.25 }
  const reject = vi.fn()
  const order = []
  const result = await observeBankCall({
    budgetMs: 1000, now: () => time,
    prepare: async () => { facing = true; order.push('face') },
    sample: async () => {
      order.push('sample')
      return { pageSeconds: time / 1000, syllableSeconds: 0.2,
        candidates: time >= 250 ? [{ label, visible: facing }] : [] }
    },
    pause: async (ms) => { time += ms }, reject,
  })
  expect(result).toBe(label)
  expect(order).toEqual(['face', 'sample', 'face', 'sample'])
  expect(reject).not.toHaveBeenCalled()
  expect(time).toBe(250)
})

it('records every refused call once with speaker, time and the actual refusal', async () => {
  let time = 0, iteration = 0
  const rejected = []
  const labels = [0, 1, 2, 3].map((i) => ({ speakerId: `kid-${i}`, shownAt: i === 2 ? -2 : i / 4 }))
  const result = await observeBankCall({
    budgetMs: 1000, now: () => time,
    prepare: async () => { if (iteration === 0) throw new Error('turn failed') },
    sample: async () => ({ pageSeconds: time / 1000, syllableSeconds: 0.2, player: { yaw: 1 },
      candidates: labels.slice(0, ++iteration).map((label, i) => ({ label, visible: i !== 1 })) }),
    pause: async (ms) => { time += ms }, reject: async (data) => rejected.push(data),
  })
  expect(result).toBe(labels[3])
  expect(rejected.map(({ speaker, shownAt, reason }) => ({ speaker, shownAt, reason }))).toEqual([
    { speaker: 'kid-0', shownAt: 0, reason: 'aim error' },
    { speaker: 'kid-1', shownAt: 0.25, reason: 'off-picture' },
    { speaker: 'kid-2', shownAt: -2, reason: 'too late' },
  ])
  expect(rejected[0].aimError).toBe('turn failed')
  expect(rejected[2].ageSeconds).toBe(2.5)
  expect(rejected.every((r) => r.player.yaw === 1)).toBe(true)
})

it('charges positioning and rejected calls to the same cycle without extending it', async () => {
  let time = 0
  const reject = vi.fn()
  await expect(observeBankCall({
    budgetMs: 1000, now: () => time,
    prepare: async () => { time += 1000 },
    sample: async () => ({ pageSeconds: 1, syllableSeconds: 0.2,
      candidates: [{ label: { speakerId: 'kid-1', shownAt: 1 }, visible: true }] }),
    pause: vi.fn(), reject,
  })).rejects.toThrow('within 1s')
  expect(time).toBe(1000)
  expect(reject).toHaveBeenCalledWith(expect.objectContaining({ reason: 'too late' }))
})
