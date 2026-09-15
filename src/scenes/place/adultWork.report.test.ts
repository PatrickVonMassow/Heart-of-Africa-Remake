import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { beforeAll, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { buildLayout } from './layout'
import * as workApi from './adultWork'
import * as collision from './collision'
import * as routing from './routing'
import * as inhabitants from './inhabitantBodies'
import { insidePlace } from './boundary'

beforeAll(setupGeodata)

it('replays the reported village through the scene movement and adult work', () => {
  const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')
  const start = source.indexOf('    for (let i = 0; i < people.length; i++) {')
  const end = source.indexOf('      // THE VILLAGE HOLDS STILL FOR THE PHOTOGRAPH', start)
  const movement = ts.transpile(source.slice(start, end) + '\n}', { target: ts.ScriptTarget.ES2022 })
  const deps = { ...workApi, ...collision, ...routing, ...inhabitants, insidePlace, balance,
    NPC_RADIUS: collision.WALKER_RADIUS, WAYPOINT_RADIUS: 1.2 }
  deps.workArrivalRadius = (t) => t.standSpot && t.situation.startsWith('water-') && t.phase !== 'fetch' && t.phase !== 'fill' ? 0.3 : workApi.workArrivalRadius(t)
  const move = new Function(...Object.keys(deps), 'env', `const {people, work, idle, rand, namedPlaces, rim, colliders, radius, bank, nav, bodies, bodySet, separationWorld, yaws, dt, cfg} = env; ${movement}`)
  const seed = 1239784450, id = 'bambara-village'
  const layout = buildLayout(id, seed)
  let hash = 0
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const rand = mulberry32(((seed ^ hash) + 30011) >>> 0)
  const cfg = balance.villageLife.adultErrands
  const people = Array.from({ length: cfg.villagerCount }, (_, i) => {
    const a = i / cfg.villagerCount * Math.PI * 2
    const [x,z] = collision.nudgeToFree(layout.colliders, Math.cos(a)*7, Math.sin(a)*7, collision.WALKER_RADIUS)
    return {x,z,free:true}
  })
  const work = workApi.createAdultWork(people.length, cfg)
  const idle = {current: people.map((_,i) => ({target:null,pause:1+i*0.7,walked:0,dug:0,stuck:0,route:null,routeTo:null,replan:0}))}
  const standable = (x:number,z:number) => insidePlace(layout,x,z,collision.WALKER_RADIUS*2) && collision.standingClear(layout.colliders,x,z,collision.WALKER_RADIUS)
  const bodySet = inhabitants.createInhabitantSet()
  const bodies = inhabitants.createBodies(people.length)
  inhabitants.addBodies(bodySet,bodies)
  const view: workApi.AdultWorkView = {villagers:people, geography:{waterHead:layout.waterPath?.head ?? null,waterFoot:layout.waterPath?.foot ?? null,waterFill:layout.waterPath?.fill ?? null,waterStand:layout.waterStand,digSites:layout.digSites}, standable, childrenHear:()=>false,invitationClear:()=>true}
  const env = {people,work,idle,rand,namedPlaces:[layout.waterPath!.head,...layout.digSites],rim:layout.radius-collision.WALKER_RADIUS*2,colliders:layout.colliders,radius:layout.radius,bank:layout.bank,nav:routing.buildPlaceNavGrid(layout,layout.colliders,collision.WALKER_RADIUS),bodies,bodySet,separationWorld:{blocked:(x:number,z:number)=>!standable(x,z),nudge:(x:number,z:number)=>{const p=collision.tryNudgeToFree(layout.colliders,x,z,collision.WALKER_RADIUS);return {x:p.pos[0],z:p.pos[1],found:p.found}}},yaws:{current:people.map(()=>0)},dt:0.1,cfg}
  console.info('LAYOUT',layout.waterStand,layout.waterPath,layout.playGround)
  const words: string[] = []
  for(let tick=0;tick<9000;tick++) {
    move(...Object.values(deps),env)
    const word=workApi.stepAdultWork(work,view,env.dt,cfg,rand)
    if(word) { words.push(word.id); console.info('WORD',tick/10,word.id,word.speaker) }
    if(tick%1000===0) console.info('TASKS',tick/10,people,work.tasks,JSON.stringify(idle.current.slice(0,2)))
  }
  expect(words).toContain('water-back')
},120000)
