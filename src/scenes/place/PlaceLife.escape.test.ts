import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { createAdultWork } from './adultWork'
import { nudgeToFree, spawnPointFree, WALKER_RADIUS } from './collision'

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
