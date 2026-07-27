// Headless verification for the startup picture (point 337): the loading
// picture must never stand still longer than the calibratable balance budget
// `balance.startup.pictureFreezeBudgetMs`.
//
// WHY IT NEEDS ITS OWN SUITE. The defect it guards is invisible to every other
// gate. The scene's first frames need ~62 shader pipelines, and until point 337
// three.js linked them on the critical path: on WebGL 2 that blocked the main
// thread for 21 s inside two animation frames; on WebGPU the thread stayed
// perfectly free (worst stall 1.0 s) while no frame was PAINTED for 12.4 s.
// Neither a frame-rate check nor a plain liveness check sees both halves — so
// this suite measures BOTH and gates their maximum:
//
//   * a 20 ms setInterval TICK TRAIN, whose stalls are attributed with
//     ./liveness.mjs (point 304) into the part a blocked main thread caused and
//     the part the page spent inside its own animation-frame callbacks, and
//   * the gap between PAINTED frames.
//
// The attribution is REPORTED but never subtracted: point 304 excused a long
// animation frame because the thread stayed responsive, which is right for a
// TTS liveness question and wrong here — a 20 s frame is 20 s of frozen
// picture. Charging the frame-covered part to the budget is exactly what stops
// a busy renderer from hiding the standstill.
//
// Self-test knob: STARTUP_STALL_SELFTEST=1 restores the old blocking pipeline
// path via the dev hook `__asyncPipelinesOff`, which must turn the budget gate
// RED. That is how the gate is proven to still bite.
//
// Dev server only (dev hooks).
import { launchVerifyBrowser, assertBackend, VERIFY_GL } from './_browser.mjs'
import { attributeBlocks, maxGap, pictureSettled, SETTLE_DEFAULTS } from './liveness.mjs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
const SELFTEST = process.env.STARTUP_STALL_SELFTEST === '1'
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

// Both sample trains are armed at DOCUMENT START, before a single page script
// runs — the measured window has to contain the whole load, and the stall this
// guards happens in the first seconds. Recording is on from the first tick;
// there is nothing to wait for.
await page.addInitScript((selftest) => {
  if (selftest) window.__asyncPipelinesOff = true
  const S = { t0: performance.now(), ticks: [], frames: [], raf: [] }
  window.__startupProbe = S
  setInterval(() => S.ticks.push(performance.now()), 20)
  const nativeRaf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = function (cb) {
    return nativeRaf(function (t) {
      const start = performance.now()
      try {
        return cb(t)
      } finally {
        const end = performance.now()
        S.frames.push({ start, end })
        S.raf.push(end)
      }
    })
  }
}, SELFTEST)

await page.goto(BASE)
await page.waitForFunction(() => window.__renderer && window.__game && window.__balance, null, { timeout: 180000 })
await assertBackend(page)

// Wait for the shader program set to go WARM rather than for a wall-clock guess
// (point 200): warm means nothing is compiling and nothing is queued for its
// throttled first use. With the fix disabled (self-test) the hook returns null,
// so there is nothing to go warm and only the settle condition below applies.
const warm = SELFTEST
  ? false
  : await page
      .waitForFunction(
        () => {
          const f = window.__shaderPipelines
          if (typeof f !== 'function') return false
          const s = f()
          return s !== null && s.started > 0 && s.pending === 0 && s.queued === 0
        },
        null,
        { timeout: 180000 },
      )
      .then(() => true)
      .catch(() => false)

// Close the measured window on the PICTURE'S OWN signal, never on a wall clock
// (CLAUDE.md §7.2). The window has to contain the whole standstill and a piece
// of the live picture after it, and only the probe knows when that has happened.
// `pictureSettled` is the predicate (pure and unit-tested in liveness.test.mjs);
// it is stringified into the page because the trains live there. Strictly
// stronger than the fixed tail it replaces — a stall beginning as the last
// pipeline lands postpones the close instead of falling outside the window, and
// with the fix disabled (self-test) it waits out however long the blocking path
// really takes on this machine instead of truncating it at a guess.
const settled = await page
  .waitForFunction(
    ({ src, opts }) => {
      const S = window.__startupProbe
      if (!S) return false
      const settledFn = new Function('return ' + src)()
      return settledFn(S.ticks, S.raf, performance.now(), opts)
    },
    { src: pictureSettled.toString(), opts: SETTLE_DEFAULTS },
    { timeout: 180000, polling: 250 },
  )
  .then(() => true)
  .catch(() => false)

const probe = await page.evaluate(() => {
  const S = window.__startupProbe
  const f = window.__shaderPipelines
  return {
    ticks: S.ticks,
    frames: S.frames,
    raf: S.raf,
    t0: S.t0,
    pipelines: typeof f === 'function' ? f() : null,
    budgetMs: window.__balance.startup.pictureFreezeBudgetMs,
  }
})

const blocks = attributeBlocks(probe.ticks, probe.frames)
const rafGapMs = maxGap(probe.raf)
// The full standstill: the worst the picture stood still, whichever way it did
// — a blocked thread, a renderer stuck inside one frame, or a thread that kept
// running while nothing was painted (the WebGPU shape of this defect).
const freezeMs = Math.max(blocks.tickGapMs, rafGapMs)
const budget = probe.budgetMs

// The measurement must be trustworthy before it may accuse anything: both
// trains have to have sampled the load, and the scene's program set has to have
// been built inside the window.
check(
  'the startup liveness probe is trustworthy (both sample trains alive across the load)',
  probe.ticks.length > 50 && probe.raf.length > 30,
  `${probe.ticks.length} ticks, ${probe.raf.length} painted frames`,
)
if (!SELFTEST) {
  check(
    'the scene builds its shader pipelines off the critical path',
    warm && probe.pipelines !== null && probe.pipelines.started > 0,
    probe.pipelines ? `${probe.pipelines.started} pipelines went async, ${probe.pipelines.dropped} dropped` : 'no pipeline hook',
  )
}
check(
  `the loading picture never freezes longer than the balance budget (${budget} ms, design.md §21.2)`,
  freezeMs <= budget,
  `worst standstill ${Math.round(freezeMs)} ms — blocked thread ${Math.round(blocks.blockMs)} ms, ` +
    `inside one animation frame ${Math.round(blocks.frameBlockMs)} ms, unpainted ${Math.round(rafGapMs)} ms`,
)
console.log(
  `INFO  reported, not gated: raw tick gap ${Math.round(blocks.tickGapMs)} ms at t+${Math.round(blocks.blockAtMs - probe.t0)} ms; ` +
    `picture settled: ${settled}; backend ${VERIFY_GL}`,
)

await page.screenshot({ path: `${OUT}142-startup-picture-live.png` })
console.log('shot 142-startup-picture-live.png')

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
if (SELFTEST) {
  // Inverted run: the point of the self-test is that the budget gate FAILED.
  const bit = failures > 0
  console.log(bit ? 'SELFTEST OK — the budget gate still bites' : 'SELFTEST FAILED — the gate passed a deliberately broken startup')
  process.exit(bit ? 0 : 1)
}
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
