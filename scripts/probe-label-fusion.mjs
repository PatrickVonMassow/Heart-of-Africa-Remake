// DOES THE DRAWN LABEL MATCH THE DECLUTTER'S MODEL? (point 1067)
//
//   node scripts/probe-label-fusion.mjs [--frames 900] [--backend webgl|webgpu]
//
// The `ctrl-actor-labels` fusion bar reds on DEPTH — a pair overlapping a full
// line height — while its count stays inside the allowance. The bar's own
// reasoning blames the layer's 10 Hz cadence: boxes drifting between refreshes.
// That explanation is testable, because the two candidate causes leave
// different traces in the picture:
//
//   DRIFT      — the boxes MOVE between refreshes and slide into each other;
//                the fusion is short, and the rects differ frame to frame.
//   DECLUTTER  — the layer PLACED them overlapping; the fusion stands for the
//                whole refresh interval and the rects do not move within it.
//
// And if it is the declutter, one more question decides where the defect sits:
// does the box the player SEES have the size the declutter laid out with?
// `labelBox()` measures each text once, through a probe div, and caches it — a
// measurement taken before the font is ready would under-size every box for the
// rest of the session, and the declutter would pack boxes that really overlap.
//
// So this probe samples the village crowd frame by frame and reports the three
// readings that tell those apart. It closes no red (CLAUDE.md §7.2): it names a
// cause or rules one out.
import { bootGame } from './verify/_boot.mjs'
import { launchServer, killTree } from './verify/_server.mjs'
import { waitForSceneBuilt } from './verify/_browser.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (hit === undefined) return fallback
  if (hit.includes('=')) return hit.split('=').slice(1).join('=')
  return args[args.indexOf(hit) + 1] ?? fallback
}
const FRAMES = Number(flag('frames', 900))
const BACKEND = String(flag('backend', 'webgl')).toLowerCase() === 'webgpu' ? 'webgpu' : 'webgl'
process.env.VERIFY_GL = BACKEND

let server = null
try {
  // OWN SERVER, never a port that happened to be listening (point 1044): a probe
  // that attaches to a stranger measures a stranger's code.
  server = await launchServer('npm run dev', 'label-fusion probe', process.cwd())
  process.env.BASE_URL = server.base
  const { browser, page } = await bootGame()

  await page.evaluate(() => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    if (g.placeId) g.leavePlace()
    g.enterPlace('maasai-village')
  })
  await page.waitForFunction(
    () => window.__game.getState().placeId === 'maasai-village' && !!window.__placeLayout,
    null,
    { timeout: 60000 },
  )
  await waitForSceneBuilt(page).catch(() => {})
  // The standpoint the polish check photographs from — the same crowd, or the
  // reading says nothing about the red it is meant to explain.
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    p.x = 0
    p.z = 14
    p.pitch = 0
    p.yaw = Math.atan2(-(0 - p.x), -(0 - p.z))
  })
  await page.keyboard.down('Control')
  await page.waitForFunction(() => (window.__actorLabels?.() ?? []).length > 0, null, { timeout: 30000 })

  const reading = await page.evaluate(
    ({ FRAMES, TOLERANCE }) =>
      new Promise((res) => {
        const frames = []
        let n = 0
        const step = () => {
          const els = [...document.querySelectorAll('.actor-label')]
          const boxes = els.map((el) => {
            const r = el.getBoundingClientRect()
            return { text: (el.textContent ?? '').trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }
          }).filter((b) => b.right > b.left && b.bottom > b.top)
          let worst = null
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i], b = boxes[j]
              const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
              const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
              if (across > TOLERANCE && down > TOLERANCE) {
                const depth = Math.min(across, down)
                if (!worst || depth > worst.depth) {
                  worst = {
                    depth, across, down,
                    pair: `"${a.text}"×"${b.text}"`,
                    a: { l: a.left, t: a.top, w: a.right - a.left, h: a.bottom - a.top },
                    b: { l: b.left, t: b.top, w: b.right - b.left, h: b.bottom - b.top },
                  }
                }
              }
            }
          }
          // The geometry fingerprint: identical from one frame to the next means
          // the layer did NOT move a box — so any fusion in it was PLACED, not
          // drifted into.
          const fingerprint = boxes.map((b) => `${b.text}@${b.left.toFixed(1)},${b.top.toFixed(1)}`).join('|')
          frames.push({ t: performance.now(), count: boxes.length, worst, fingerprint })
          if (++n >= FRAMES) return res(frames)
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    { FRAMES, TOLERANCE: 6 },
  )

  // DOES THE PLAYER'S BOX HAVE THE SIZE THE DECLUTTER USED? `labelBox()` caches
  // its first measurement per text; a probe div measured NOW, with everything
  // loaded, is the width the declutter should have had.
  const widths = await page.evaluate(() => {
    const seen = new Map()
    for (const el of document.querySelectorAll('.actor-label')) {
      const text = (el.textContent ?? '').trim()
      if (seen.has(text)) continue
      const r = el.getBoundingClientRect()
      const probe = document.createElement('div')
      probe.className = 'map-label actor-label'
      probe.textContent = text
      probe.style.position = 'absolute'
      probe.style.left = '-9999px'
      probe.style.top = '0'
      probe.style.visibility = 'hidden'
      document.body.appendChild(probe)
      const p = probe.getBoundingClientRect()
      probe.remove()
      seen.set(text, { drawn: { w: r.width, h: r.height }, probe: { w: p.width, h: p.height } })
    }
    return [...seen.entries()].map(([text, v]) => ({ text, ...v }))
  })

  await page.keyboard.up('Control')
  await browser.close()

  // ---- the verdict, in the three readings that separate the causes ----
  const fused = reading.filter((f) => f.worst)
  const deep = reading.filter((f) => f.worst && f.worst.depth >= 18)
  const span = reading.length > 1 ? reading[reading.length - 1].t - reading[0].t : 0
  const fps = span > 0 ? (reading.length - 1) / (span / 1000) : 0
  let longestFused = 0, run = 0
  for (const f of reading) { run = f.worst ? run + 1 : 0; if (run > longestFused) longestFused = run }
  let longestDeep = 0; run = 0
  for (const f of reading) { run = f.worst && f.worst.depth >= 18 ? run + 1 : 0; if (run > longestDeep) longestDeep = run }
  const distinctPrints = new Set(reading.map((f) => f.fingerprint)).size

  console.log(`# backend ${BACKEND} — ${reading.length} frames over ${(span / 1000).toFixed(1)} s (${fps.toFixed(1)} fps)`)
  console.log(`# the layer redrew its geometry ${distinctPrints} time(s) in that window (refresh cadence: nominally 10 Hz)`)
  console.log(`labels per frame     : ${Math.min(...reading.map((f) => f.count))}–${Math.max(...reading.map((f) => f.count))}`)
  console.log(`frames with a fusion : ${fused.length}/${reading.length}  (longest unbroken run ${longestFused} frame(s))`)
  console.log(`frames at/over 18 px : ${deep.length}/${reading.length}  (longest unbroken run ${longestDeep} frame(s))`)
  const depths = fused.map((f) => f.worst.depth).sort((a, b) => b - a)
  console.log(`deepest overlaps     : ${depths.slice(0, 8).map((d) => d.toFixed(1)).join(', ') || 'none'}`)
  for (const f of deep.slice(0, 5)) {
    const w = f.worst
    console.log(`  DEEP ${w.pair} ${w.across.toFixed(0)}×${w.down.toFixed(0)} px — a[${w.a.l.toFixed(0)},${w.a.t.toFixed(0)} ${w.a.w.toFixed(0)}×${w.a.h.toFixed(0)}] b[${w.b.l.toFixed(0)},${w.b.t.toFixed(0)} ${w.b.w.toFixed(0)}×${w.b.h.toFixed(0)}]`)
  }
  console.log('drawn box vs. a probe measured now (the size the declutter should have used):')
  for (const w of widths) {
    const off = w.drawn.w - w.probe.w
    console.log(`  ${w.text.padEnd(12)} drawn ${w.drawn.w.toFixed(1)}×${w.drawn.h.toFixed(1)}  probe ${w.probe.w.toFixed(1)}×${w.probe.h.toFixed(1)}  Δwidth ${off.toFixed(1)} px`)
  }
} finally {
  if (server) killTree(server.child)
}
