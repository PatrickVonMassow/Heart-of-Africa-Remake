import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { PlaceGroundContext, usePlaceGround } from './PlaceGroundContext'
import { spoilCentre, type PlaceGround } from './placeGround'
import { placeCameraPose } from '../../systems/lookPitch'

it('shares live work with every mounted sampler without a React render between strokes', () => {
  const ground: PlaceGround = { bank: null, sites: [{ x: 5, z: -3, kind: 'patch' }], progress: [], rocks: [] }
  const samplers: Array<(x: number, z: number) => number> = []
  function Probe() { samplers.push(usePlaceGround()); return null }
  const view = render(<PlaceGroundContext.Provider value={ground}><Probe /><Probe /><Probe /></PlaceGroundContext.Provider>)
  const c = spoilCentre(ground.sites[0])
  expect(samplers.map((sample) => sample(c.x, c.z))).toEqual([0.12, 0.12, 0.12])
  ground.progress = [{ dug: 18, strikes: 12, completed: true }]
  for (const sample of samplers) {
    expect(sample(c.x, c.z)).toBeCloseTo(0.8)
    const pose = placeCameraPose(c.x, c.z, 1.7 + sample(c.x, c.z), 0, 0, 0, 0, 0)
    expect(pose.position[1]).toBeCloseTo(2.5)
    expect(sample(-20, -20)).toBe(0)
  }
  view.unmount()
})
