// Per-object triangle breakdown of the bird's-eye frame (point 276). Walks the
// live R3F scene graph and sums the RENDERED triangles per top-level group, so
// the doubled geometry between two builds can be attributed to a system
// (terrain / flora / wildlife / water / far sheet) instead of guessed at.
//
// Usage: BASE_URL=http://localhost:5173/ VERIFY_GL=webgpu node scripts/perf-breakdown.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const LABEL = process.env.BENCH_LABEL ?? ''
const POINTS = [
  { name: 'savanna-dense', lat: -2.5, lon: 34.0 },
  { name: 'desert-empty', lat: 23.0, lon: 15.0 },
]

async function main() {
  const backend = (process.env.VERIFY_GL ?? 'webgl').toLowerCase()
  const args = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-unsafe-webgpu', '--enable-gpu']
  const browser =
    backend === 'webgpu'
      ? await chromium.launch({ channel: 'chrome', args: ['--headless=new', ...args] })
      : await chromium.launch({ args: ['--use-angle=d3d11', ...args] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => window.__game && window.__ui && window.__renderer, null, { timeout: 60000 })
  // Capture the rendered scene by wrapping the renderer's own render call.
  await page.evaluate(() => {
    const r = window.__renderer
    const orig = r.render.bind(r)
    // The post pipeline renders its own full-screen quad scenes through the
    // same call, so keep the RICHEST scene seen — that is the game world.
    r.render = (scene, camera) => {
      const best = window.__benchScene
      if (!best || scene.children.length > best.children.length) window.__benchScene = scene
      return orig(scene, camera)
    }
  })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.__balance.randomEventsEnabled = false
    window.__game.getState().setJournalOpen(false)
    window.__game.getState().leavePlace()
  })
  await page.waitForFunction(() => window.__rivers, null, { timeout: 60000 })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
  await page.waitForTimeout(2000)

  console.log(`# perf-breakdown${LABEL ? ` [${LABEL}]` : ''} on ${backend}, zoom 0.5`)
  for (const pt of POINTS) {
    await page.evaluate((p) => window.__game.getState().debugJumpTo(p.lat, p.lon), pt)
    await page.waitForTimeout(6000)
    const rows = await page.evaluate(() => {
      // R3F v9 exposes no store on the canvas element, so take the scene from
      // the renderer itself: render(scene, camera) hands it over every frame.
      const scene = window.__benchScene
      if (!scene) return null
      const triOf = (o) => {
        const g = o.geometry
        if (!g) return 0
        const idx = g.index ? g.index.count : (g.attributes.position?.count ?? 0)
        const per = idx / 3
        return Math.round(per * (o.isInstancedMesh ? o.count : 1))
      }
      // Attribute each mesh to its nearest NAMED ancestor — the scene's own
      // group names are the system boundaries.
      const byGroup = {}
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return
        let p = o
        let name = '(unnamed)'
        while (p) {
          if (p.name) { name = p.name; break }
          p = p.parent
        }
        // Unnamed meshes are the streamed geometry (terrain chunks, river
        // ribbons, water sheets) — split them by material so the doubled
        // geometry lands on ONE system rather than in a lump.
        const key =
          name === '(unnamed)'
            ? `(unnamed) ${o.material?.name || o.material?.type || '?'}${o.isInstancedMesh ? ' [inst]' : ''}`
            : name.replace(/\d+$/, '').replace(/-?\d+,-?\d+/, '')
        byGroup[key] = byGroup[key] ?? { tris: 0, meshes: 0 }
        byGroup[key].tris += triOf(o)
        byGroup[key].meshes += 1
      })
      return Object.entries(byGroup)
        .map(([k, v]) => ({ group: k, ...v }))
        .sort((a, b) => b.tris - a.tris)
        .slice(0, 14)
    })
    console.log(`  --- ${pt.name}`)
    if (!rows) {
      console.log('    (no scene handle)')
      continue
    }
    for (const r of rows) console.log(`    ${String(r.tris).padStart(9)} tris  ${String(r.meshes).padStart(4)} mesh  ${r.group}`)
  }
  await browser.close()
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('perf-breakdown failed:', e)
    process.exit(1)
  },
)
