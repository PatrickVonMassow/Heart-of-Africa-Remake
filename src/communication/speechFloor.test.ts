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
  it('owns a complete situation, including its silent walk, then shows the last consequence', () => {
    const { arbiter, ask, at } = floor()
    const dig = ask('dig pair A'), other = ask('dig pair B'), water = ask('water'), bank = ask('bank', 22, 'call')
    expect(arbiter.request(dig)).toBe(true)
    for (const foreign of [other, water, bank]) expect(arbiter.request(foreign)).toBe(false)
    at(30)
    for (const foreign of [other, water, bank]) expect(arbiter.request(foreign)).toBe(false)
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
    at(10)
    expect(arbiter.request({ ...second, word: 'report' })).toBe(false)
    expect(arbiter.request({ ...first, word: 'site', ends: true })).toBe(true)
  })

  it('forces at the hold and names the overrun situation as adult-atom-lost', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { arbiter, ask, at } = floor()
    const stuck = ask('stuck dig pair'), queued = ask('water dispatch')
    expect(arbiter.request(stuck)).toBe(true)
    expect(arbiter.request(queued)).toBe(false)
    at(balance.communication.speechHoldSeconds - 0.01)
    expect(arbiter.request(queued)).toBe(false)
    at(balance.communication.speechHoldSeconds)
    expect(arbiter.request(queued)).toBe(true)
    expect(errors.mock.calls.flat().join(' ')).toContain('adult-atom-lost')
    expect(errors.mock.calls.flat().join(' ')).toContain('stuck dig pair')
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
})
