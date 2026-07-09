// Pure random-event logic (CLAUDE.md §7.1 pt. 23, design.md §14/§7). Ported
// from the window.__events / window.__balance pure asserts of
// scripts/verify/events.mjs — same coverage, no browser.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { weaponProtection, eventChance, resolveEvent, rollEvent, type EventContext } from './events'

const ctx = (over: Partial<EventContext> = {}): EventContext => ({
  terrain: 'savanna',
  inWater: false,
  nearWaterfall: false,
  wetland: false,
  protectedByFriends: false,
  equipment: {},
  ...over,
})

describe('event rates (design.md §14, calibrated ÷5)', () => {
  it('the per-day base rates are the reduced calibration', () => {
    expect(balance.events.animalAttack).toBeCloseTo(0.004, 9)
    expect(balance.events.robberAttack).toBeCloseTo(0.002, 9)
    expect(balance.events.waterfallSweep).toBeCloseTo(0.024, 9)
    expect(balance.events.crocodile).toBeCloseTo(0.012, 9)
  })
})

describe('weaponProtection (possession-based, design.md §7/§14)', () => {
  it('ranks none > machete > rifle', () => {
    const none = weaponProtection(ctx({}))
    const machete = weaponProtection(ctx({ equipment: { machete: 1 } }))
    const rifle = weaponProtection(ctx({ equipment: { rifle: 1 } }))
    expect(none).toBeGreaterThan(machete)
    expect(machete).toBeGreaterThan(rifle)
  })

  it('a wet rifle is useless without the canoe, the machete still helps', () => {
    expect(weaponProtection(ctx({ equipment: { rifle: 1 }, inWater: true }))).toBe(1)
    expect(weaponProtection(ctx({ equipment: { rifle: 1, machete: 1 }, inWater: true }))).toBeLessThan(1)
  })

  it('the rifle works from the canoe even in water', () => {
    const inCanoe = weaponProtection(ctx({ equipment: { rifle: 1, canoe: 1 }, inWater: true }))
    const wetWithMachete = weaponProtection(ctx({ equipment: { rifle: 1, machete: 1 }, inWater: true }))
    expect(inCanoe).toBeLessThan(wetWithMachete)
  })
})

describe('eventChance', () => {
  it('crocodile risk falls bare > machete > rifle-in-canoe', () => {
    const bare = eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true }))
    const machete = eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true, equipment: { machete: 1 } }))
    const canoeRifle = eventChance('crocodileAttack', ctx({ terrain: 'water', inWater: true, equipment: { rifle: 1, canoe: 1 } }))
    expect(bare).toBeGreaterThan(machete)
    expect(machete).toBeGreaterThan(canoeRifle)
  })

  it('plains-predator danger rises cheetah < leopard < hyena < lion', () => {
    const c = eventChance('cheetahAttack', ctx())
    const l = eventChance('leopardAttack', ctx())
    const h = eventChance('hyenaAttack', ctx())
    const lion = eventChance('lionAttack', ctx())
    expect(c).toBeLessThan(l)
    expect(l).toBeLessThan(h)
    expect(h).toBeLessThan(lion)
  })

  it('land-only and water-only events respect their terrain gate', () => {
    expect(eventChance('lionAttack', ctx({ inWater: true }))).toBe(0)
    expect(eventChance('crocodileAttack', ctx({ terrain: 'savanna', inWater: false }))).toBe(0)
    expect(eventChance('sandstorm', ctx({ terrain: 'desert' }))).toBeGreaterThan(0)
    expect(eventChance('sandstorm', ctx({ terrain: 'savanna' }))).toBe(0)
    expect(eventChance('fever', ctx({ wetland: true }))).toBeGreaterThan(0)
  })
})

describe('resolveEvent (deterministic via injected rand)', () => {
  it('a rifle deters robbers, an unarmed traveller is robbed', () => {
    expect(resolveEvent('robberAttack', ctx({ equipment: { rifle: 1 } }), () => 0.1).result).toBe('deterred')
    const robbed = resolveEvent('robberAttack', ctx({ equipment: {} }), () => 0.6)
    expect(robbed.result).toBe('robbed')
    expect(robbed.money).toBeGreaterThan(0)
  })

  it('a weapon turns an escape into an active defense', () => {
    expect(resolveEvent('lionAttack', ctx({ equipment: { rifle: 1 } }), () => 0.1).result).toBe('defended')
    expect(resolveEvent('lionAttack', ctx({ equipment: {} }), () => 0.1).result).toBe('escaped')
  })

  it('the lion has a wider fatal band than the cheetah', () => {
    // A roll just inside the fatal window: fatal for the lion, not the cheetah.
    expect(resolveEvent('lionAttack', ctx(), () => 0.46).result).toBe('fatal')
    expect(resolveEvent('cheetahAttack', ctx(), () => 0.46).result).not.toBe('fatal')
  })

  it('friend protection caps an attack at a light injury (design.md §12)', () => {
    const rescued = resolveEvent('lionAttack', ctx({ protectedByFriends: true }), () => 0.9)
    expect(rescued.result).toBe('light')
    expect(rescued.rescued).toBe(true)
  })

  it('sandstorm costs shelter days, waterfall sweep is a sweep', () => {
    const storm = resolveEvent('sandstorm', ctx({ terrain: 'desert' }), () => 0.5)
    expect(storm.result).toBe('weather')
    expect(storm.daysLost).toBeGreaterThan(0)
    expect(resolveEvent('waterfallSweep', ctx({ inWater: true, nearWaterfall: true }), () => 0.5).result).toBe('swept')
  })
})

describe('rollEvent', () => {
  it('fires nothing when every roll is above the (tiny) per-day chance', () => {
    expect(rollEvent(ctx(), 1, () => 0.999)).toBeNull()
  })

  it('fires the first gated event when the roll lands under its chance', () => {
    // rand always 0 → first EVENT_KIND with a non-zero chance fires and resolves.
    const out = rollEvent(ctx({ terrain: 'savanna' }), 1, () => 0)
    expect(out).not.toBeNull()
  })
})

describe('weaponProtection exact factors (design.md §7/§14)', () => {
  it('rifle 0.25, machete 0.6, bare hands 1', () => {
    expect(weaponProtection(ctx({ equipment: { rifle: 1 } }))).toBe(0.25)
    expect(weaponProtection(ctx({ equipment: { machete: 1 } }))).toBe(0.6)
    expect(weaponProtection(ctx({}))).toBe(1)
  })
})

describe('resolveEvent snakeBite (design.md §14)', () => {
  it('rolls escaped < 0.4 ≤ light < 0.85 ≤ severe', () => {
    expect(resolveEvent('snakeBite', ctx(), () => 0.2).result).toBe('escaped')
    expect(resolveEvent('snakeBite', ctx(), () => 0.5).result).toBe('light')
    expect(resolveEvent('snakeBite', ctx(), () => 0.9).result).toBe('severe')
  })

  it('friend protection caps a severe bite to a light one', () => {
    const rescued = resolveEvent('snakeBite', ctx({ protectedByFriends: true }), () => 0.9)
    expect(rescued.result).toBe('light')
    expect(rescued.rescued).toBe(true)
  })
})

describe('resolveEvent findRemains (design.md §14)', () => {
  it('yields a small purse of 5..25 dollars', () => {
    const low = resolveEvent('findRemains', ctx(), () => 0)
    const high = resolveEvent('findRemains', ctx(), () => 0.999999)
    expect(low.result).toBe('find')
    expect(low.money).toBe(5)
    expect(high.money).toBe(25)
  })

  it('never turns up in the water', () => {
    expect(eventChance('findRemains', ctx({ inWater: true }))).toBe(0)
    expect(eventChance('findRemains', ctx())).toBeGreaterThan(0)
  })
})

describe('resolveEvent crocodileAttack fatal band (design.md §14)', () => {
  const water = { terrain: 'water', inWater: true } as const

  it('a mid roll is fatal only when the natives do not rescue', () => {
    expect(resolveEvent('crocodileAttack', ctx(water), () => 0.46).result).toBe('fatal')
    const rescued = resolveEvent('crocodileAttack', ctx({ ...water, protectedByFriends: true }), () => 0.46)
    expect(rescued.result).toBe('light')
    expect(rescued.rescued).toBe(true)
  })

  it('the unprotected fatal window is [0.45, 0.55) — fatalChance 0.1', () => {
    expect(resolveEvent('crocodileAttack', ctx(water), () => 0.54).result).toBe('fatal')
    expect(resolveEvent('crocodileAttack', ctx(water), () => 0.56).result).toBe('light')
  })
})

describe('eventChance terrain gates (design.md §14)', () => {
  it.each(['savanna', 'jungle', 'desert'])('a snake can strike on %s land', (terrain) => {
    expect(eventChance('snakeBite', ctx({ terrain }))).toBeGreaterThan(0)
  })

  it('a snake cannot strike in the water', () => {
    expect(eventChance('snakeBite', ctx({ terrain: 'water', inWater: true }))).toBe(0)
  })

  it('the leopard also hunts the jungle, not only the savanna', () => {
    expect(eventChance('leopardAttack', ctx({ terrain: 'jungle' }))).toBeGreaterThan(0)
    expect(eventChance('leopardAttack', ctx({ terrain: 'savanna' }))).toBeGreaterThan(0)
  })
})
