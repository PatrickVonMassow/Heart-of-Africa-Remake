// @vitest-environment node
// The errands' frame order (PlaceLife.tsx ErrandVillagers): the children move
// first, then the adults' work steps (its hearing guard reads where the
// children stand), then the figures draw what the step left.
import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { advance, createRoot, useFrame } from '@react-three/fiber'
import { expect, it } from 'vitest'
import { FrameFirst } from './frameFirst'

/** Mounts `tree` in a manual-frameloop root, runs one frame and returns its callbacks' order. */
async function oneFrame(tree: (order: string[]) => ReactNode): Promise<string[]> {
  const order: string[] = []
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(tree(order)))
  order.length = 0
  act(() => advance(1))
  act(() => root.unmount())
  return order
}

function Tick({ name, order, priority }: { name: string; order: string[]; priority?: number }) {
  useFrame(() => order.push(name), priority)
  return null
}

it('a first-child frame runs after an earlier sibling\'s and before its own children\'s', async () => {
  function Errands({ order }: { order: string[] }) {
    return (
      <>
        <FrameFirst frame={() => order.push('step')} />
        <Tick name="figure" order={order} />
        <Tick name="figure" order={order} />
      </>
    )
  }
  const order = await oneFrame((o) => (
    <>
      <Tick name="kids" order={o} />
      <Errands order={o} />
    </>
  ))
  expect(order).toEqual(['kids', 'step', 'figure', 'figure'])
  // the frame at priority −1 instead would step before the children move
  function Early({ order }: { order: string[] }) {
    useFrame(() => order.push('step'), -1)
    return <Tick name="figure" order={order} />
  }
  expect(await oneFrame((o) => (
    <>
      <Tick name="kids" order={o} />
      <Early order={o} />
    </>
  ))).toEqual(['step', 'kids', 'figure'])
})

it('the settlement runs its errands this way: after the children, ahead of the errand figures', () => {
  const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')
  const errands = source.slice(source.indexOf('function ErrandVillagers('))
  const body = errands.slice(0, errands.indexOf('\nfunction '))
  // the errand frame is no priority subscription of the component itself ...
  expect(body).toMatch(/const errandFrame = \(rawDt: number\) => \{/)
  // ... but the first child it renders
  expect(body).toMatch(/return \(\n {4}<>\n {6}<FrameFirst frame=\{errandFrame\} \/>/)
  // and the village mounts the children's group before the errands
  const village = source.slice(source.lastIndexOf('<Kids'))
  expect(village).toContain('<ErrandVillagers')
})
