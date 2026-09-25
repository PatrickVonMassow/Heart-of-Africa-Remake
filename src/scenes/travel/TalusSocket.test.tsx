import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildReliefFace, buildSocketBlock, TalusSocket } from './TalusSocket'
import { ClayImpression } from '../../ui/ClayImpression'
import { ROCK_RELIEF, ROCK_RELIEF_SVG } from '../../world/rockRelief'

it('uses every corner of the carried outline on the socket face', () => {
  const geometry = buildReliefFace()
  const p = geometry.getAttribute('position')
  for (const [x, y] of ROCK_RELIEF) {
    expect(Array.from({ length: p.count }, (_, i) => Math.hypot(p.getX(i) - x, p.getY(i) - y)).some((d) => d < 1e-6)).toBe(true)
  }
  expect(renderToStaticMarkup(<ClayImpression />)).toContain(`points="${ROCK_RELIEF_SVG}"`)
  geometry.dispose()
})
it('opens a seam and moves the relief after fitting, retaining the block', () => {
  const before = renderToStaticMarkup(<TalusSocket fitted={false} />)
  const after = renderToStaticMarkup(<TalusSocket fitted />)
  expect(before).not.toContain('opened-socket-seam')
  expect(after).toContain('opened-socket-seam')
  expect(after).toContain('0.48,-0.12,0.025')
  expect(before).toContain('bandiagara-talus-socket')
  expect(after).toContain('bandiagara-talus-socket')
})

it('keeps the entire sloping relief above the stone surface rather than buried in it', () => {
  const geometry = buildSocketBlock()
  const p = geometry.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    expect(p.getY(i)).toBeLessThanOrEqual(1.03 - (p.getZ(i) - 0.7) / Math.sqrt(3) + 1e-6)
  }
  for (const [, y] of ROCK_RELIEF) {
    const worldY = 1.05 + y * 0.5, worldZ = 0.7 - y * Math.sqrt(3) / 2
    expect(worldY - (1.03 - (worldZ - 0.7) / Math.sqrt(3))).toBeCloseTo(0.02)
  }
  geometry.dispose()
})
