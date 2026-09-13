import { afterEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../config/balance'
import { resetDevAsserts } from '../systems/devAssert'
import { SpeechFloor, type FloorRequest } from './speechFloor'
import { utteranceSeconds } from './speaking'

afterEach(() => { resetDevAsserts(); vi.restoreAllMocks() })
function floor() {
  let clock = 0
  const player = { x: 0, z: 0, active: true }
  const arbiter = new SpeechFloor(() => player, () => clock)
  const ask = (name: string, x = 0, register: 'talk' | 'call' = 'talk'): FloorRequest => {
    const source = { x, z: 0, register }
    return { situation: {}, name, word: 'first', source, sources: () => [source] }
  }
  return { arbiter, ask, player, at: (t: number) => { clock = t } }
}

describe('one speech floor at the player’s ear', () => {
  it('protects a ready continuation and each consequence, then admits the next situation', () => {
    const { arbiter, ask, at } = floor()
    const dig = ask('dig pair A'), other = ask('dig pair B'), water = ask('water'), bank = ask('bank', 22, 'call')
    expect(arbiter.request(dig)).toBe(true)
    for (const foreign of [other, water, bank]) expect(arbiter.request(foreign)).toBe(false)
    at(30)
    expect(arbiter.request({ ...dig, word: 'site', ends: true })).toBe(true)
    expect(arbiter.request(other)).toBe(false)
    at(30 + utteranceSeconds(4) + balance.communication.consequenceSeconds)
    expect(arbiter.request(other)).toBe(true)
    expect(arbiter.request(water)).toBe(false)
  })

  it('keeps distant situations talking, but measures a child’s CALL beyond TALK reach', () => {
    const { arbiter, ask } = floor()
    const distant = ask('distant adults', 11)
    expect(arbiter.request(distant)).toBe(true)
    expect(arbiter.request(ask('near adults'))).toBe(true)
    expect(arbiter.request(ask('calling child', 22, 'call'))).toBe(false)
    expect(arbiter.request(ask('distant tap', 22))).toBe(true)
  })

  it('re-evaluates existing exchanges when the player moves into their reach', () => {
    const { arbiter, ask, player, at } = floor()
    const first = ask('first', 15), second = ask('second', 20)
    expect(arbiter.request(first)).toBe(true)
    expect(arbiter.request(second)).toBe(true)
    player.x = 17
    at(1)
    expect(arbiter.request({ ...second, word: 'report' })).toBe(false)
    at(10)
    expect(arbiter.request({ ...first, word: 'site', ends: true })).toBe(true)
  })

  it.each(['walking', 'hushed', 'occupied site'])('lets water and bank words past a %s dig pair after its consequence', (reason) => {
    const { arbiter, ask, at } = floor()
    const dig = ask('dig pair'), water = ask('water dispatch'), bank = ask('bank call', 22, 'call')
    const window = utteranceSeconds(4) + balance.communication.consequenceSeconds
    expect(arbiter.request(dig)).toBe(true)
    if (reason !== 'walking') expect(arbiter.request({ ...dig, word: 'site', blocked: true })).toBe(false)
    expect(arbiter.request(water)).toBe(false)
    at(window - 0.01)
    expect(arbiter.request(water)).toBe(false)
    at(window)
    expect(arbiter.request({ ...water, ends: true })).toBe(true)
    expect(arbiter.request(bank)).toBe(false)
    at(window * 2)
    expect(arbiter.request({ ...bank, ends: true })).toBe(true)
    at(window * 3)
    expect(arbiter.request({ ...dig, word: 'site', ends: true })).toBe(true)
    expect(arbiter.forcedCount).toBe(0)
  })

  it('uses live hush readiness before choosing the holder and preserves a suspended debt', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { arbiter, ask, at } = floor()
    const dig = ask('dig pair'), other = ask('other pair')
    expect(arbiter.request(dig)).toBe(true)
    expect(arbiter.request({ ...dig, word: 'site' })).toBe(false)
    at(10)
    expect(arbiter.request({ ...dig, word: 'site', blocked: true })).toBe(false)
    expect(arbiter.request({ ...other, ends: true })).toBe(true)
    at(11)
    expect(arbiter.request({ ...dig, word: 'site' })).toBe(false)
    arbiter.suspend(dig.situation, 'site')
    expect(arbiter.waiting(dig.situation)).toBe(true)
    at(20)
    expect(arbiter.request(ask('third pair'))).toBe(true)
    at(balance.communication.speechHoldSeconds)
    expect(arbiter.request({ ...dig, word: 'site', blocked: true })).toBe(true)
    expect(arbiter.forcedCount).toBe(1)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-atom-lost')
  })

  it('forces at the hold and names the overrun situation as adult-atom-lost', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { arbiter, ask, at } = floor()
    const stuck = ask('stuck dig pair'), queued = { ...ask('water dispatch'), blocked: true }
    expect(arbiter.request(stuck)).toBe(true)
    expect(arbiter.request(queued)).toBe(false)
    at(balance.communication.speechHoldSeconds - 0.01)
    expect(arbiter.request(queued)).toBe(false)
    at(balance.communication.speechHoldSeconds)
    expect(arbiter.request(queued)).toBe(true)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-atom-lost')
    expect(errors.mock.calls.flat().join(' ')).toContain('water dispatch')
  })

  it('caps a late queued word at the owning task’s remaining life', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { arbiter, ask, at } = floor()
    const queued = { ...ask('late report'), blocked: true, remaining: 0.3, step: 0.1 }
    expect(arbiter.request(queued)).toBe(false)
    at(0.1)
    expect(arbiter.request({ ...queued, remaining: 0.2 })).toBe(true)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-atom-lost')
  })

  it('names the foreign situation if the bound interrupts its active consequence', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { arbiter, ask, at } = floor()
    const dig = ask('overrunning dig pair'), queued = ask('water dispatch')
    expect(arbiter.request(dig)).toBe(true)
    expect(arbiter.request(queued)).toBe(false)
    at(balance.communication.speechHoldSeconds - 1)
    expect(arbiter.request({ ...dig, word: 'site' })).toBe(true)
    at(balance.communication.speechHoldSeconds)
    expect(arbiter.request(queued)).toBe(true)
    expect(arbiter.forcedCount).toBe(1)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-atom-lost')
    expect(errors.mock.calls.flat().join(' ')).toContain('overrun situation overrunning dig pair')
  })
})
