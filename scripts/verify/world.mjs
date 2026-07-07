// Verification for the world model (CLAUDE.md §7.1.3): console-error-free
// rendering, data sanity checks in the Vite module graph, and screenshots of
// the bird's-eye view at characteristic locations. Dev server only.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// --- Data sanity checks inside the Vite module graph -----------------------
const checks = await page.evaluate(async () => {
  const geo = await import('/src/world/geo.ts')
  const terrain = await import('/src/world/terrain.ts')
  const idx = await import('/src/world/geoIndex.ts')
  const { LAKES } = await import('/src/world/data/lakes.ts')
  const { MOUNTAINS, WATERFALLS, ELEPHANT_GRAVEYARD } = await import('/src/world/data/landmarks.ts')

  const out = []
  const bad = (m) => out.push('FAIL ' + m)
  const ports = geo.PLACES.filter((p) => p.kind === 'port')
  const villages = geo.PLACES.filter((p) => p.kind === 'village')
  out.push(`counts: ports=${ports.length} villages=${villages.length} rivers=${geo.RIVERS.length} lakes=${LAKES.length} mountains=${MOUNTAINS.length} waterfalls=${WATERFALLS.length}`)
  if (ports.length !== 10) bad('port count')
  if (villages.length !== 22) bad('village count')
  if (geo.RIVERS.length !== 17) bad('river count')
  if (LAKES.length !== 8) bad('lake count')
  if (WATERFALLS.length !== 5) bad('waterfall count')

  for (const p of geo.PLACES) {
    const t = terrain.sampleTerrain(p.lat, p.lon, 42)
    if (t.type === 'ocean' || t.type === 'water') bad(`${p.id} at ${p.lat},${p.lon} is ${t.type}`)
    const r = geo.regionAt(p.lat, p.lon)
    if (r !== p.region) out.push(`note: ${p.id} regionAt=${r} declared=${p.region}`)
  }

  // Tributaries end at their confluence, all other rivers at the coast.
  const tributaries = ['white-nile', 'blue-nile', 'vaal', 'sankuru', 'kasai', 'ubangi', 'benue']
  for (const r of geo.RIVERS) {
    if (tributaries.includes(r.id)) continue
    const [lon, lat] = r.points[r.points.length - 1]
    const d = idx.coastDistance(lat, lon)
    if (d > 0.5) bad(`${r.id} mouth ${lat},${lon}: ${d.toFixed(2)} deg from coast`)
  }
  for (const w of WATERFALLS) {
    const d = idx.riverDistance(w.lat, w.lon)
    if (d > 0.25) bad(`${w.id}: ${d.toFixed(2)} deg from river`)
  }
  for (const l of LAKES) {
    if (idx.cellAt(l.center[1], l.center[0]) !== idx.CELL_LAKE) bad(`${l.id} center not lake`)
  }
  {
    const t = terrain.sampleTerrain(ELEPHANT_GRAVEYARD.lat, ELEPHANT_GRAVEYARD.lon, 42)
    if (t.type === 'ocean' || t.type === 'water') bad('elephant graveyard not on land')
  }
  // Grave area (store samples lat 24..27.5, lon 29..33) still mostly walkable desert.
  let ok = 0
  for (let i = 0; i < 100; i++) {
    const t = terrain.sampleTerrain(24 + (i % 10) * 0.35, 29 + Math.floor(i / 10) * 0.44, 42)
    if (t.type === 'desert' || t.type === 'savanna') ok++
  }
  out.push(`grave area walkable: ${ok}/100`)
  if (ok < 50) bad('grave area mostly unwalkable')
  // Sampling perf
  const t0 = performance.now()
  for (let i = 0; i < 20000; i++) {
    terrain.sampleTerrain(-35 + ((i * 0.003641) % 70), -18 + ((i * 0.007177) % 70), 42)
  }
  out.push(`20k samples: ${(performance.now() - t0).toFixed(0)} ms`)
  return out
})
for (const line of checks) console.log(line)

// --- Screenshots of the travel view at characteristic locations ------------
const jump = async (lat, lon, ms = 2500) => {
  await page.evaluate(([la, lo]) => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    g.debugJumpTo(la, lo)
  }, [lat, lon])
  await page.waitForTimeout(ms)
}

// Leave the starting place into travel mode first.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.setJournalOpen(false)
  if (g.mode === 'place') g.leavePlace()
})
await page.waitForTimeout(2000)

const shots = [
  [30.0, 31.3, '10-worldmodel-nile-delta-cairo'],
  [15.6, 32.6, '11-worldmodel-khartoum-confluence'],
  [-0.8, 33.0, '12-worldmodel-lake-victoria'],
  [-3.05, 37.3, '13-worldmodel-kilimanjaro'],
  [-5.9, 12.8, '14-worldmodel-congo-mouth-boma'],
  [-17.9, 25.9, '15-worldmodel-victoria-falls'],
  [-33.9, 18.6, '16-worldmodel-cape-town'],
  [13.2, 14.2, '17-worldmodel-lake-chad'],
]
for (const [lat, lon, name] of shots) {
  await jump(lat, lon)
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log('shot', name)
}

console.log('console errors:', errors.length ? errors : 'none')
await browser.close()
process.exit(errors.length || checks.some((c) => c.startsWith('FAIL')) ? 1 : 0)
