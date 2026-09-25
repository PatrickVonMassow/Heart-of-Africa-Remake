import { Children, isValidElement, type ReactNode } from 'react'
import { expect, it } from 'vitest'
import { DigSites } from './DigSites'

function nodes(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return []
    return [{ type: child.type, props: child.props }, ...nodes(child.props.children)]
  })
}

it('renders worked rows instead of a hole and leaves real result meshes after completion', () => {
  for (const [kind, beside, result] of [
    ['pit', 'grain-baskets-and-cover', 'excavated-pit'],
    ['postHole', 'stacked-posts', 'set-post'],
    ['patch', 'seedling-tray', 'planted-rows'],
  ] as const) {
    const sites = [{ x: 0, z: 0, kind }]
    const initial = nodes(DigSites({ sites, progress: [] }))
    expect(initial.some((n) => n.props.name === beside)).toBe(true)
    expect(initial.some((n) => n.props.name === result)).toBe(false)
    expect(initial.some((n) => n.type === 'torusGeometry')).toBe(kind !== 'patch')
    const finished = nodes(DigSites({ sites, progress: [{ dug: 18, strikes: 12, completed: true }] }))
    const shown = finished.find((n) => n.props.name === result)!
    expect(shown).toBeDefined()
    expect(Children.count(shown.props.children as ReactNode)).toBeGreaterThan(0)
    if (kind === 'patch') expect(finished.find((n) => n.props.name === 'dig-furrows')).toBeDefined()
  }
})

it('leaves the pit mouth uncovered and its shadow above the uncut ground', () => {
  const tree = nodes(DigSites({ sites: [{ x: 0, z: 0, kind: 'pit' }], progress: [{ dug: 18, strikes: 12, completed: true }] }))
  const shadow = tree.find((n) => n.props.name === 'pit-shadow')!
  expect((shadow.props.position as number[])[1]).toBeGreaterThan(0)
  expect(tree.some((n) => n.props.name === 'fresh-earth-rim')).toBe(true)
  expect(tree.filter((n) => n.type === 'cylinderGeometry').every((n) => (n.props.args as unknown[])[5] === true)).toBe(true)
})
