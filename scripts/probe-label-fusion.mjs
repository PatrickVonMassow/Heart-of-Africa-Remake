// DOES THE DRAWN LABEL MATCH THE DECLUTTER'S MODEL? (point 1067)
//
//   node scripts/probe-label-fusion.mjs [--backend webgl|webgpu]
//                                       [--frames 900] [--shutter <n>] [--window 45]
//
// The `ctrl-actor-labels` fusion bar reds on DEPTH — a pair overlapping a full
// line height — while its count stays inside the allowance. The bar's own
// reasoning blames the layer's 10 Hz cadence: boxes drifting between refreshes.
// That explanation is testable, because the candidate causes leave different
// traces in the picture:
//
//   DRIFT      — the boxes MOVE between refreshes and slide into each other;
//                the fusion is short, and the rects differ frame to frame.
//   DECLUTTER  — the layer PLACED them overlapping; the fusion stands for the
//                whole refresh interval and the rects do not move within it.
//   SHUTTER    — the fusion lives only in the frames right after a capture
//                stalls the page, which is where and only where the check's
//                bracketed windows look.
//
// And if it is the declutter, one more question decides where the defect sits:
// does the box the player SEES have the size the declutter laid out with?
// `labelBox()` measures each text once, through a probe div, and caches it — a
// measurement taken before the font is ready would under-size every box for the
// rest of the session, and the declutter would pack boxes that really overlap.
//
// So this probe samples the village crowd frame by frame and reports the
// readings that tell those apart. It closes no red (CLAUDE.md §7.2): it names a
// cause or rules one out.
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
// THE CHECK'S OWN SHAPE, not a long free window: `ctrl-actor-labels` samples 45
// frames, opens the shutter, and samples 45 more. A screenshot stalls the page
// for far longer than the layer's 100 ms refresh, so the frames right after it
// are the ones no free-running window ever visits. `--shutter <n>` repeats that
// bracket n times and attributes every fusion to the window it stood in.
const SHUTTER = Number(flag('shutter', 0))
const WINDOW_FRAMES = Number(flag('window', 45))
process.env.VERIFY_GL = BACKEND

/** The page-side sampler, as a source string: it reads the same rectangles the
 *  suite's own sampler reads, and additionally keeps each frame's geometry
 *  fingerprint, so a fusion can be told apart from the frame that moved. */
const SAMPLER = (count) =>
  new Promise((res) => {
    const TOLERANCE = 6
    const frames = []
    let n = 0
    const step = () => {
      const boxes = [...document.querySelectorAll('.actor-label')]
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { text: (el.textContent ?? '').trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        })
        .filter((b) => b.right > b.left && b.bottom > b.top)
      let worst = null
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (across > TOLERANCE && down > TOLERANCE) {
            const depth = Math.min(across, down)
            if (!worst || depth > worst.depth) {
              worst = {
                depth,
                across,
                down,
                pair: `"${a.text}"\u00d7"${b.text}"`,
                a: { l: a.left, t: a.top, w: a.right - a.left, h: a.bottom - a.top },
                b: { l: b.left, t: b.top, w: b.right - b.left, h: b.bottom - b.top },
              }
            }
          }
        }
      }
      // The geometry fingerprint: identical from one frame to the next means the
      // layer did NOT move a box \u2014 so any fusion in it was PLACED, not drifted into.
      const fingerprint = boxes.map((b) => `${b.text}@${b.left.toFixed(1)},${b.top.toFixed(1)}`).join('|')
      frames.push({ t: performance.now(), count: boxes.length, worst, fingerprint })
      if (++n >= count) return res(frames)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })

/** Everything the readings below are derived from, for one sampled window. */
function summarize(frames) {
  const fused = frames.filter((f) => f.worst)
  const deep = frames.filter((f) => f.worst && f.worst.depth >= 18)
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0
  const fps = span > 0 ? (frames.length - 1) / (span / 1000) : 0
  const runs = []
  let run = null
  frames.forEach((f, i) => {
    if (f.worst) {
      if (!run) run = { from: i, frames: 0, t0: f.t, t1: f.t, depth: 0, pair: f.worst.pair, frozen: 0 }
      run.frames++
      run.t1 = f.t
      if (f.worst.depth > run.depth) { run.depth = f.worst.depth; run.pair = f.worst.pair }
      if (i > 0 && frames[i - 1].fingerprint === f.fingerprint) run.frozen++
    } else if (run) { runs.push(run); run = null }
  })
  if (run) runs.push(run)
  return {
    samples: frames.length,
    fused: fused.length,
    deep: deep.length,
    fps,
    span,
    countMin: Math.min(...frames.map((f) => f.count)),
    countMax: Math.max(...frames.map((f) => f.count)),
    distinctPrints: new Set(frames.map((f) => f.fingerprint)).size,
    depths: fused.map((f) => f.worst.depth).sort((a, b) => b - a),
    runs,
  }
}

let server = null
try {
  // OWN SERVER, never a port that happened to be listening (point 1044): a probe
  // that attaches to a stranger measures a stranger's code.
  server = await launchServer('npm run dev', 'label-fusion probe', process.cwd())
  process.env.BASE_URL = server.base
  // IMPORTED AFTER THE PORT IS KNOWN: `_boot.mjs` reads BASE_URL into a module
  // constant at import time, so a static import here would send the probe to the
  // default :5173 and measure whatever happened to be listening there — measured
  // 07.09.2026: ERR_CONNECTION_REFUSED against :5173 while the probe's own server
  // held :43401.
  const { bootGame } = await import('./verify/_boot.mjs')
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
  // THE CROWD MUST HAVE ARRIVED, not merely begun: the labels reach the DOM
  // roughly one per frame, so a window opened at the first of them samples the
  // ramp-up rather than the scene the check judges.
  await page
    .waitForFunction(
      () => {
        const held = window.__actorLabels?.() ?? []
        return held.length > 0 && document.querySelectorAll('.actor-label').length === held.length
      },
      null,
      { timeout: 30000 },
    )
    .catch(() => {})

  const windows = []
  if (SHUTTER > 0) {
    for (let cycle = 0; cycle < SHUTTER; cycle++) {
      windows.push({ tag: `pre-${cycle + 1}`, frames: await page.evaluate(SAMPLER, WINDOW_FRAMES) })
      await page.screenshot({ type: 'png' }).catch(() => {})
      windows.push({ tag: `post-${cycle + 1}`, frames: await page.evaluate(SAMPLER, WINDOW_FRAMES) })
    }
  } else {
    windows.push({ tag: 'free', frames: await page.evaluate(SAMPLER, FRAMES) })
  }

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

  // ---- the verdict, in the readings that separate the causes ----
  console.log(`# backend ${BACKEND} — ${windows.length} window(s) of ${windows[0].frames.length} frames`)
  let totalFused = 0
  let totalDeep = 0
  let totalSamples = 0
  for (const w of windows) {
    const s = summarize(w.frames)
    totalFused += s.fused
    totalDeep += s.deep
    totalSamples += s.samples
    console.log(
      `${w.tag.padEnd(8)} ${s.samples} frames, ${s.fps.toFixed(1)} fps, ${s.countMin}–${s.countMax} labels, ` +
        `${s.distinctPrints} distinct geometries — fused ${s.fused}, at/over 18 px ${s.deep}` +
        (s.depths.length > 0 ? `, deepest ${s.depths.slice(0, 4).map((d) => d.toFixed(1)).join(', ')}` : ''),
    )
    for (const r of s.runs) {
      console.log(
        `    fusion at frame ${r.from}: ${r.frames} frame(s) / ${(r.t1 - r.t0).toFixed(0)} ms, ` +
          `deepest ${r.depth.toFixed(1)} px ${r.pair}, geometry frozen in ${r.frozen}/${r.frames} of them`,
      )
    }
  }
  console.log(`TOTAL   ${totalFused}/${totalSamples} frames fused, ${totalDeep} at/over the 18 px bar`)
  console.log('drawn box vs. a probe measured now (the size the declutter should have used):')
  for (const w of widths) {
    const off = w.drawn.w - w.probe.w
    console.log(`  ${w.text.padEnd(12)} drawn ${w.drawn.w.toFixed(1)}×${w.drawn.h.toFixed(1)}  probe ${w.probe.w.toFixed(1)}×${w.probe.h.toFixed(1)}  Δwidth ${off.toFixed(1)} px`)
  }
} finally {
  if (server) killTree(server.child)
}
