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
    sample: (who: number) => unknown
    hold: (who: number | null) => void
  } }
  install(w, states, [{ home: { x: 0, z: 0 } }], { current: [body] }, height, held)
  expect(w.__placeWalkers.states).toBe(states.current)
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
