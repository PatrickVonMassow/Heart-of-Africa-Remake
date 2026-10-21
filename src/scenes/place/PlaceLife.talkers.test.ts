import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { talkerStances } from './lifeSpots'

const source = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')

/** The Talkers component's own source, from its declaration to its closing brace. */
function talkersSource(): string {
  const start = source.indexOf('function Talkers(')
  const end = source.indexOf('\n}\n', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('conversing pair', () => {
  it('stands a metre apart, face to face', () => {
    const [a, b] = talkerStances(4.6, 5.6)
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(1, 6)
    // each one's facing (sin yaw, cos yaw) points at the other
    const towardB = Math.atan2(b.x - a.x, b.z - a.z)
    const towardA = Math.atan2(a.x - b.x, a.z - b.z)
    expect(a.yaw).toBeCloseTo(towardB, 6)
    expect(Math.abs(Math.atan2(Math.sin(b.yaw - towardA), Math.cos(b.yaw - towardA)))).toBeLessThan(1e-6)
  })

  it('keeps both roots still: no per-frame swivel or hop of the figure groups', () => {
    // The 21.10.2026 fidget was a useFrame that swung each root ±0.18 rad and
    // lifted it 3 cm in turn. The roots are placed once from the stances; only
    // the skinned body's idle clip and real gestures move the pair now.
    const body = talkersSource()
    expect(body).not.toMatch(/useFrame\s*\(/)
    expect(body).not.toMatch(/\.rotation\.y\s*=/)
    expect(body).not.toMatch(/\.position\.y\s*=/)
    expect(body).toMatch(/rotation=\{\[0, stances\[0\]\.yaw, 0\]\}/)
    expect(body).toMatch(/rotation=\{\[0, stances\[1\]\.yaw, 0\]\}/)
  })
})
