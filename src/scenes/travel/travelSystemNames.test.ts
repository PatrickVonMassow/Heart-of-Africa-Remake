// The F8 report attributes every mesh to its nearest NAMED ancestor
// (benchmark.ts groupKey); an unnamed system falls back to its material name
// and lumps unrelated systems together (the deposited reports showed terrain,
// sea, rivers and borders as one "(unnamed) MeshStandardNodeMaterial" row).
// This source check keeps every travel-scene system mounted under a name.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const travel = readFileSync(resolve(process.cwd(), 'src/scenes/travel/TravelScene.tsx'), 'utf8')
const rivers = readFileSync(resolve(process.cwd(), 'src/scenes/travel/Rivers.tsx'), 'utf8')

/** The JSX between `<group name="NAME">` and the next `</group>` at the scene root. */
function groupBody(src: string, name: string): string {
  const open = src.indexOf(`<group name="${name}">`)
  expect(open, `group "${name}" is mounted`).toBeGreaterThan(-1)
  return src.slice(open, src.indexOf('</group>', open))
}

describe('every travel system is mounted under a name the F8 report can attribute', () => {
  it.each([
    ['travel-terrain', ['<TerrainChunks />', '<FarTerrain />']],
    ['travel-rivers', ['<RiversAndLakes />']],
    ['travel-region-borders', ['<RegionBorders />']],
    ['travel-sea', ['<WaterPlane />']],
    ['travel-places', ['<PlaceMarker']],
    ['travel-landmarks', ['<LandmarkLabels />', '<ElephantGraveyard />', '<CulturalLandmarks />']],
  ])('%s wraps its components', (name, components) => {
    const body = groupBody(travel, name)
    for (const c of components) expect(body, `${c} inside ${name}`).toContain(c)
  })

  it('the river ribbon, lake sheets, waterfalls and springs carry their own names', () => {
    expect(rivers).toContain('name="rivers-ribbon"')
    expect(rivers).toContain('name="lake-sheet"')
    expect(rivers).toContain('name="river-waterfall"')
    expect(rivers).toContain('name="river-spring"')
  })
})
