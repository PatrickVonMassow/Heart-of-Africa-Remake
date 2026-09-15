import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { beforeAll, expect, it, vi } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { resetDevAsserts } from '../../systems/devAssert'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { buildLayout } from './layout'
import * as workApi from './adultWork'
import * as collision from './collision'
import * as routing from './routing'
import * as inhabitants from './inhabitantBodies'
import { insidePlace } from './boundary'

beforeAll(setupGeodata)

// Exercise the scene's actual routing, stopping, and body separation together.
// A walker that advances all the way to its goal misses this regression: the
// carrier stopped early beside the stand and blocked the sender's approach.
// Keep the production arrival function intact in both movement and task logic.
function sceneMovement() {
  const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')
  const start = source.indexOf('    for (let i = 0; i < people.length; i++) {')
  const end = source.indexOf('      // THE VILLAGE HOLDS STILL FOR THE PHOTOGRAPH', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  const movement = ts.transpile(source.slice(start, end) + '\n}', { target: ts.ScriptTarget.ES2022 })
  const deps = {
    ...workApi, ...collision, ...routing, ...inhabitants, insidePlace, balance,
    NPC_RADIUS: collision.WALKER_RADIUS, WAYPOINT_RADIUS: 1.2,
  }
  const move = new Function(...Object.keys(deps), 'env', `
    const {people, work, idle, rand, namedPlaces, rim, colliders, radius, bank,
      nav, bodies, bodySet, separationWorld, yaws, dt, cfg} = env;
    ${movement}
  `)
  return (env: object) => move(...Object.values(deps), env)
}

it.each([0.1, 1 / 30, 1 / 60, 1 / 107])('completes the first reported village water errand before expiry (dt=%s)', (dt) => {
  const move = sceneMovement()
  // Both September 15 reports: Bambara Village, production build 31f2024.
  // The dumps contain layout/behavior inputs, but no live adult task snapshot.
  const seed = 1239784450, id = 'bambara-village'
  const layout = buildLayout(id, seed)
  expect(layout.waterStand).not.toBeNull()
  expect(layout.waterPath).not.toBeNull()
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const rand = mulberry32(((seed ^ hash) + 30011) >>> 0)
  const cfg = balance.villageLife.adultErrands
  const people = Array.from({ length: cfg.villagerCount }, (_, i) => {
    const a = i / cfg.villagerCount * Math.PI * 2
    const [x, z] = collision.nudgeToFree(layout.colliders, Math.cos(a) * 7, Math.sin(a) * 7, collision.WALKER_RADIUS)
    return { x, z, free: true }
  })
  const work = workApi.createAdultWork(people.length, cfg)
  const idle = { current: people.map((_, i) => ({
    target: null, pause: 1 + i * 0.7, walked: 0, dug: 0, stuck: 0,
    route: null, routeTo: null, replan: 0,
  })) }
  const standable = (x: number, z: number) => insidePlace(layout, x, z, collision.WALKER_RADIUS * 2) &&
    collision.standingClear(layout.colliders, x, z, collision.WALKER_RADIUS)
  const bodySet = inhabitants.createInhabitantSet()
  const bodies = inhabitants.createBodies(people.length)
  inhabitants.addBodies(bodySet, bodies)
  const view: workApi.AdultWorkView = {
    villagers: people,
    geography: {
      waterHead: layout.waterPath!.head, waterFoot: layout.waterPath!.foot,
      waterFill: layout.waterPath!.fill, waterStand: layout.waterStand, digSites: layout.digSites,
    },
    standable,
    // Isolate the adults' walking from child speech holds. Separate unit cases
    // cover withholding and deadline discharge; no child can explain this stall.
    childrenHear: () => false,
    invitationClear: (x, z) => {
      const margin = balance.communication.hearingRadius + workApi.WORK_ARRIVE_RADIUS
      const ground = layout.playGround
      if (ground && Math.hypot(x - ground.x, z - ground.z) - ground.radius <= margin) return false
      return ![layout.waterPath?.foot, layout.playRocks?.upstream, layout.playRocks?.downstream]
        .some((p) => p && Math.hypot(x - p.x, z - p.z) <= margin)
    },
  }
  const env = {
    people, work, idle, rand, bodies, bodySet, dt, cfg,
    namedPlaces: [layout.waterPath!.head, ...layout.digSites],
    rim: layout.radius - collision.WALKER_RADIUS * 2,
    colliders: layout.colliders, radius: layout.radius, bank: layout.bank,
    nav: routing.buildPlaceNavGrid(layout, layout.colliders, collision.WALKER_RADIUS),
    separationWorld: {
      blocked: (x: number, z: number) => !standable(x, z),
      nudge: (x: number, z: number) => {
        const free = collision.tryNudgeToFree(layout.colliders, x, z, collision.WALKER_RADIUS)
        return { x: free.pos[0], z: free.pos[1], found: free.found }
      },
    },
    yaws: { current: people.map(() => 0) },
  }
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  resetDevAsserts()
  try {
    let firstSender: workApi.AdultTask | null = null
    let firstCarrier: workApi.AdultTask | null = null
    const phases = new Set<string>()
    const words: string[] = []
    for (let tick = 0; tick * dt < cfg.errandSeconds; tick++) {
      move(env)
      workApi.stepAdultWork(work, view, dt, cfg, rand)
      if (!firstSender) {
        firstSender = work.tasks.find((t) => t?.phase === 'send') ?? null
        firstCarrier = firstSender?.partner === null || !firstSender ? null : work.tasks[firstSender.partner]
      }
      if (firstCarrier) phases.add(`${firstCarrier.phase}:${firstCarrier.carry}`)
      for (const word of work.emitted) if (word.concept === 'RIVER') words.push(word.id)
      if (words.includes('water-back')) break
    }
    expect(firstSender, 'the water dispatcher must cast a sender').not.toBeNull()
    expect(words, 'the first pair must order, fetch, and report before its 300-second expiry').toEqual(['water-out', 'water-back'])
    expect(phases).toEqual(new Set(['wait:none', 'fetch:emptyJar', 'fill:emptyJar', 'walk:fullJar', 'walk:none']))
    expect(work.standJars).toBe(1)
    expect(work.tasks).not.toContain(firstSender)
    expect(work.tasks).not.toContain(firstCarrier)
    expect(work.floor?.forcedCount).toBe(0)
    expect(errors).not.toHaveBeenCalled()
  } finally {
    errors.mockRestore()
    resetDevAsserts()
  }
}, 120000)
