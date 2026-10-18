import { readFileSync } from 'node:fs'
import { Group } from 'three/webgpu'
import { expect, it, vi } from 'vitest'

const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')
const start = source.indexOf('    w.__placeWalkers = {')
const end = source.indexOf('\n    return () => {', start)
if (start < 0 || end < 0) throw new Error('Walker probe missing')
const install = new Function('w', 'states', 'defs', 'refs', 'groundHeight', 'heldWalker',
  source.slice(start, end).replaceAll(': number | null', '').replaceAll(': number', ''))

it('reports the real body transform separately from live ground and holds only the chosen walker', () => {
  const body = new Group()
  body.position.set(4, 0.43, 6)
  const states = { current: [{ x: 4, z: 6, mode: 'walk', pause: 0 }] }
  const height = vi.fn(() => 0.4)
  const held = { current: null as number | null }
  const w = {} as { __placeWalkers: {
    states: unknown
    speeds: number[]
    sample: (who: number) => unknown
    hold: (who: number | null) => void
  } }
  install(w, states, [{ home: { x: 0, z: 0 }, speed: 1.3 }], { current: [body] }, height, held)
  expect(w.__placeWalkers.states).toBe(states.current)
  expect(w.__placeWalkers.speeds).toEqual([1.3])
  expect(w.__placeWalkers.sample(0)).toEqual({ x: 4, z: 6, mode: 'walk', pause: 0,
    groundHeight: 0.4, drawn: { x: 4, y: 0.43, z: 6, visible: true }, held: false })
  expect(height).toHaveBeenCalledWith(4, 6)
  body.position.y = 0
  expect(w.__placeWalkers.sample(0)).toMatchObject({ groundHeight: 0.4, drawn: { y: 0 } })
  w.__placeWalkers.hold(0)
  expect(held.current).toBe(0)
  expect(w.__placeWalkers.sample(0)).toMatchObject({ held: true })
  expect(w.__placeWalkers.sample(1)).toBeNull()
  w.__placeWalkers.hold(null)
  expect(held.current).toBeNull()
})

it('stops the held actor before movement or a transform write, only in dev', () => {
  const begin = source.indexOf('      const s = states.current[i]', end)
  const stop = source.indexOf("\n      if (s.mode === 'inside')", begin)
  if (begin < 0 || stop < 0) throw new Error('Walker hold branch missing')
  const tick = new Function('states', 'refs', 'heldWalker', 'i', 'dev',
    source.slice(begin, stop).replace('import.meta.env.DEV', 'dev') + '\nreturn "advance"')
  const args = [{ current: [{}, {}] }, { current: [new Group(), new Group()] }, { current: 0 }]
  expect(tick(...args, 0, true)).toBeUndefined()
  expect(tick(...args, 1, true)).toBe('advance')
  expect(tick(...args, 0, false)).toBe('advance')
})

it('names one walker by one index: carries[k] and group(k) are the same walker', () => {
  const bodies = [new Group(), new Group(), new Group()]
  const defs = [false, true, false].map((carries, k) => ({ home: { x: k, z: 0 }, speed: 1 + k, carries }))
  const w = {} as { __placeWalkers: { carries: boolean[]; homes: unknown[]; group: (k: number) => Group | null } }
  install(w, { current: [] }, defs, { current: bodies }, () => 0, { current: null })
  defs.forEach((d, k) => {
    expect(w.__placeWalkers.carries[k]).toBe(d.carries)
    expect(w.__placeWalkers.homes[k]).toBe(d.home)
    expect(w.__placeWalkers.group(k)).toBe(bodies[k])
  })
  // and the drawn group k is the one that renders def k's head load
  const draw = source.slice(source.indexOf('{defs.map((def, i) => (', end), source.indexOf('\n      ))}', end))
  expect(draw).toMatch(/refs\.current\[i\] = el/)
  expect(draw).toMatch(/def\.carries \? \(/)
})
