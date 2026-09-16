import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it, vi } from 'vitest'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { createAdultWork } from './adultWork'
import { boxCollider, escapeToFree, nudgeToFree, spawnPointFree, WALKER_RADIUS, type Collider } from './collision'
import { buildPlaceNavGrid } from './routing'

const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')

it('keeps each resolved spawn anchor after the villager walks away', () => {
  // Exercise the production memo, including its nudge, without mounting WebGPU.
  const start = source.indexOf('    const r = mulberry32((seed + 30011) >>> 0)')
  const end = source.indexOf('\n  }, [seed, count, colliders, placeId])', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  const deps = {
    mulberry32, nudgeToFree, createAdultWork, balance, NPC_RADIUS: WALKER_RADIUS,
    useGame: { getState: () => ({ villageDigProgress: {} }) },
  }
  const spawn = new Function(...Object.keys(deps), 'seed', 'count', 'colliders', 'placeId',
    ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 }))
  const colliders = [{ x: 7, z: 0, r: 1 }]
  const { people, spawnAnchors } = spawn(...Object.values(deps), 3321422240, 4, colliders, 'bambara-village')
  const expected = people.map(({ x, z }: { x: number; z: number }) => ({ x, z }))
  expect(spawnAnchors).toEqual(expected)
  expect(spawnAnchors[0]).not.toEqual({ x: 7, z: 0 })
  for (let i = 0; i < people.length; i++) {
    expect(spawnPointFree(colliders, spawnAnchors[i].x, spawnAnchors[i].z, WALKER_RADIUS)).toBe(true)
    people[i].x += 10
    people[i].z -= 5
  }
  expect(spawnAnchors).toEqual(expected)
})

function escapeStep(actor: 'walker' | 'errand') {
  const begin = actor === 'walker'
    ? '      if (Math.hypot(s.x - oldX, s.z - oldZ) < step * 0.1) {'
    : '          if (moved < step * 0.25) {'
  const after = actor === 'walker'
    ? '\n      settleBody(i, s, !throughDoor)'
    : '\n        }\n      }\n\n      // THE BODY'
  const start = source.indexOf(begin)
  const end = source.indexOf(after, start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  const deps = { escapeToFree, balance, NPC_RADIUS: WALKER_RADIUS }
  const tick = new Function(...Object.keys(deps), 'env', `
    const {s, def, colliders, nav, oldX, oldZ, step, dt,
      me, state, moved, spawnAnchors, i, task, work, clearTask} = env;
    ${ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 })}
  `)
  return (env: object) => tick(...Object.values(deps), env)
}

const rungs: Array<{ rung: 'near' | 'wide' | 'grid' | 'home'; colliders: Collider[]; radius: number }> = [
  { rung: 'near', colliders: [{ x: 0, z: 0, r: 1 }], radius: 40 },
  { rung: 'wide', colliders: [{ x: 0, z: 0, r: 9 }], radius: 40 },
  { rung: 'grid', colliders: [boxCollider(0, 0, 20, 20, 0)], radius: 40 },
  { rung: 'home', colliders: [boxCollider(0, 0, 20, 20, 0)], radius: 10 },
]

it.each(rungs)('both steppers place the body via $rung after the configured window', ({ rung, colliders, radius }) => {
  const previous = balance.walkerUnstuckSeconds
  // A non-default value proves that the existing knob still owns the window.
  balance.walkerUnstuckSeconds = 7.5
  try {
    const nav = buildPlaceNavGrid({ radius }, colliders, WALKER_RADIUS)
    for (const actor of ['walker', 'errand-idle', 'errand-task'] as const) {
      const walker = actor === 'walker'
      const tick = escapeStep(walker ? 'walker' : 'errand')
      const s = { x: 0, z: 0, seg: 1, pinned: 7.4, stuck: 1 }
      const me = { x: 0, z: 0 }
      const target = { x: 30, z: 30 }
      const state = { stuck: 7.4, target, route: [target], routeTo: target }
      const home = [35, 0] as const
      const spawnAnchors = [{ x: 0, z: 36 }]
      const anchor = walker ? home : [0, 36] as const
      const expected = escapeToFree(colliders, 0, 0, WALKER_RADIUS, nav, anchor)
      expect(expected.rung).toBe(rung)
      const clearTask = vi.fn(() => {
        // Task retirement must observe the already-relocated body.
        expect([me.x, me.z]).toEqual(expected.pos)
      })
      const env = {
        s, me, state, def: { home: { door: home } }, colliders, nav,
        spawnAnchors, i: 0, task: actor === 'errand-task' ? {} : null,
        work: {}, clearTask, oldX: 0, oldZ: 0, step: 0.1, moved: 0, dt: 0.05,
      }
      tick(env)
      expect([s.x, s.z, me.x, me.z]).toEqual([0, 0, 0, 0])
      expect(clearTask).not.toHaveBeenCalled()
      s.pinned = balance.walkerUnstuckSeconds
      state.stuck = balance.walkerUnstuckSeconds
      tick(env)
      const body = walker ? s : me
      expect([body.x, body.z]).toEqual(expected.pos)
      expect([body.x, body.z]).not.toEqual([0, 0])
      const retire = rung === 'grid' || rung === 'home'
      if (walker) {
        expect(s.pinned).toBe(0)
        expect(s.stuck).toBe(0)
        expect(s.seg).toBe(retire ? 2 : 1)
      } else {
        expect(state.stuck).toBe(0)
        expect(state.route).toBeNull()
        expect(state.routeTo).toBeNull()
        expect(clearTask).toHaveBeenCalledTimes(retire && actor === 'errand-task' ? 1 : 0)
        expect(state.target).toBe(retire && actor === 'errand-idle' ? null : target)
      }
      expect(spawnAnchors).toEqual([{ x: 0, z: 36 }])
    }
  } finally {
    balance.walkerUnstuckSeconds = previous
  }
})
