import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { balance } from '../../config/balance'
import { PLACES } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { buildLayout } from './layout'
import { climbBoulder } from './looseRocks'
import { playRockFlank } from './playRockSurface'
import { createTagGame, stepTagGame } from './tagGame'
import { createBankGame } from './bankGame'
import { PORT_TALKERS, VILLAGE_SPOTS, villageAdultStations, villageHasWell } from './lifeSpots'

// Execute the production component's composition without mounting the WebGPU
// renderer. Its memo and JSX stay real; child components remain opaque elements.
const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')
const component = source.slice(source.indexOf('export function PlaceLife(')).replace('export function', 'function').replaceAll('import.meta.env.DEV', 'true')
const devAssert = vi.fn()
const components = ['Kids', 'Porters', 'Traders', 'Talkers', 'Walkers', 'Cook', 'Loom',
  'ErrandVillagers', 'Goats', 'FireTender', 'Pounder', 'Drummer', 'Well', 'TaskWalker']
const contexts = ['ColdCloaksContext', 'LimbDetailContext', 'InhabitantBodiesContext', 'SpeechFloorContext']
const deps = {
  React: { createElement },
  ...Object.fromEntries(components.map(name => [name, name])),
  ...Object.fromEntries(contexts.map(name => [name, { Provider: name }])),
  useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => ({ current }),
  useEffect: () => {}, useFrame: () => {}, useColdCloaks: () => false,
  useUi: () => 1, effectiveFigureLimbSegments: () => 1,
  useGame: () => 0, placeById: () => null, createInhabitantSet: () => ({}),
  SpeechFloor: class {}, placePlayerPosition: {}, useUnplacedInhabitantWatch: () => {},
  balance, devAssert, climbBoulder, playRockFlank,
  villageAdultStations, villageHasWell, PORT_TALKERS, VILLAGE_SPOTS,
}
const compose = new Function(...Object.keys(deps), ts.transpile(component, {
  target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
}) + '\nreturn PlaceLife;')(...Object.values(deps))

function gamesIn(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(gamesIn)
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === 'Kids') return [element]
  return gamesIn(element.props?.children)
}

function render(id: string, kind: 'port' | 'village', seed = 7) {
  const layout = buildLayout(id, seed)
  devAssert.mockClear()
  const tree = compose({ ...layout, kind, seed, placeId: id,
    style: { cloth: ['red', 'blue'], bandColor: 'white' },
    buildings: [], homes: [], firePos: [-3.5, 2.5], onDigProgress: () => {},
  })
  expect(devAssert.mock.calls.filter(([ok]) => !ok)).toEqual([])
  return { layout, games: gamesIn(tree) }
}

// Run exactly the initialization used by Kids, not a copy of its branch rule.
const start = source.indexOf('  const round = useMemo(() => {')
const end = source.indexOf('\n  const game = round.game', start)
const roundDeps = { useMemo: (fn: () => unknown) => fn(), mulberry32, balance, createTagGame, createBankGame }
const makeRound = new Function(...Object.keys(roundDeps), 'props', `
  const { x, z, count, seed, stage } = props;
  const world = { nudge: (x, z) => ({ x, z }) };
  ${ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 })}
  return round;
`)

describe('each settlement stages exactly one children’s game', () => {
  it.each(PLACES.filter(p => p.kind === 'port' || p.kind === 'village').map(p => [p.id, p.kind] as const))('%s selects from its kind and bank', (id, kind) => {
    if (kind !== 'port' && kind !== 'village') return
    const { layout, games } = render(id, kind)
    expect(games).toHaveLength(1)
    const props = games[0].props
    expect(props.x).toBe(layout.playGround!.x)
    expect(props.z).toBe(layout.playGround!.z)
    expect(props.playRadius).toBe(layout.playGround!.radius)
    const bankGame = kind === 'village' && !!layout.bank
    expect(!!props.stage).toBe(bankGame)
    const round = makeRound(...Object.values(roundDeps), props)
    expect(!!round.bank).toBe(bankGame)
    expect(!!round.game).toBe(!bankGame)
    if (round.game) {
      const world = { centerX: props.x as number, centerZ: props.z as number, childRadius: 0.3, radius: props.playRadius as number,
        blocked: () => false, nudge: (x: number, z: number) => ({ x, z, found: true }) }
      for (let i = 0; i < 600; i++) stepTagGame(round.game, 1 / 30, balance.villageLife.tag, world)
      expect(round.game.clock).toBeGreaterThan(19)
      expect(round.game.tags).toBeGreaterThan(0)
      expect(round).not.toHaveProperty('speech')
    }
  })

  it('has coverage of ports, bank villages and bankless villages', () => {
    const cases = new Set(PLACES.filter(p => p.kind === 'port' || p.kind === 'village').map(p =>
      p.kind === 'port' ? 'port' : buildLayout(p.id, 7).bank ? 'bank' : 'bankless'))
    expect(cases).toEqual(new Set(['port', 'bank', 'bankless']))
  })

  it('removes the tag speech adapter from the live scene', () => {
    expect(source).not.toMatch(/childSituations|stepChildSpeech|speakSituation|childSteer/)
  })
})
