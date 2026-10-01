// THE SHARED HALF OF THE POLISH THEME SUITES: one browser boot and the helpers
// every theme uses. `polish.mjs` (CLAUDE.md §7.1.31 and neighbours) was split by
// THEME into polish-panorama, polish-speech, polish-settlement, polish-children
// and polish-villagers, so a red costs only its own theme's pass. A theme file
// imports this module (its top-level await boots the page) and calls
// `finishPolishSuite()` last. A section is a BLOCK SCOPE, so anything two themes
// use lives HERE, never inside one of them (scripts/verify/README.md).
// The section gate reads the RUNNING theme file (process.argv[1]), so
// `--section=<slug>` resolves against that theme's own declarations.
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { installColliderProbe } from './colliderProbe.mjs'
import { sectionGate } from './sections.mjs'
import { fileURLToPath } from 'node:url'

// The seed is applied by the launcher (verify-seed.mjs), so this is the plain URL.
export const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
export const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
// SECTIONS (point 566). Every block of a theme suite is a named block that owns
// the settlement it works in: `if (section('<slug>')) { … }`. Without a request
// every one runs, in file order; `--section=<slug>` (VERIFY_SECTION) runs ONE of
// them, which is how repairing a single check stops costing the theme's whole
// pass. The names are read out of the RUNNING theme file (process.argv[1]) by
// scripts/verify/sections.mjs, so an unknown one is refused with the list of the
// real ones — and the run is stamped PARTIAL, never counted as suite coverage.
export const sections = sectionGate()
export const { section } = sections
if (sections.banner()) console.log(sections.banner())

let failures = 0
// `coverage` is a SUBJECT-DEPENDENT check's own sample count beside its named
// minimum (work-order 1136): `{ subjects, minimum, what }`. Below the minimum
// the line reads NOT-COVERING instead of green — the check saw too little to
// answer, which is neither a defect nor an all-clear.
export const check = (name, ok, detail, coverage = null) => {
  // The section tag goes AFTER the ' — ' separator: the check's NAME is its
  // identity for the red ledger and the baseline classifier and must not change.
  const tail = [detail, sections.tag().trim()].filter(Boolean).join('  ')
  const { status, failed, note } = sections.checkResult(name, ok, coverage)
  console.log(`${status}  ${name}${tail ? ' — ' + tail : ''}${note}`)
  if (failed) failures++
}

/**
 * Point 181: do the §2.5 panorama silhouettes stand on ground the frame really
 * DRAWS under them, or hang in the sky?
 *
 * The old gate compared each silhouette's y with the EYE_HEIGHT constant it had
 * just been placed at, so it passed for years while the picture showed animals
 * dangling over the captured band (the user's Cairo pyramid screenshot). This
 * one asks the rendered scene instead: stand the player on the silhouette's own
 * bearing, then ray-probe its feet — the first surface behind them must be no
 * further than the feet themselves. A floating silhouette finds nothing until
 * the panorama band or the sky dome, far beyond, and fails loudly.
 */
export const probeSilhouetteFooting = async (page, check, label) => {
  const count = await page.evaluate(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length)
  const rows = []
  // The probe BORROWS the camera — it walks the player onto every silhouette's
  // bearing — so it hands the pose back exactly as it found it. It used to reset
  // only x/z and leave the yaw on the last silhouette, and every frame taken
  // afterwards inherited that arbitrary aim: `93-orientation-highlight` was then
  // photographed from a camera facing a panorama animal, and whether a building
  // marker happened to be in the picture was luck (point 375 caught it).
  const pose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  for (let i = 0; i < count; i++) {
    const stood = await page.evaluate((idx) => {
      const it = (window.__placePanoramaWildlifeInfo ?? {})[idx]
      if (!it || !it.visible) return false
      const p = window.__placePlayer
      const r = (window.__placeLayout?.radius ?? 40) * 0.9
      const d = Math.hypot(it.x, it.z) || 1
      p.x = (it.x / d) * r
      p.z = (it.z / d) * r
      p.pitch = 0
      p.yaw = Math.atan2(-(it.x - p.x), -(it.z - p.z))
      return true
    }, i)
    if (!stood) continue
    // Let the camera follow the teleport before probing from it.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const row = await page.evaluate((idx) => {
      const it = (window.__placePanoramaWildlifeInfo ?? {})[idx]
      if (!it || !it.visible || !window.__placeRayHit) return null
      const hit = window.__placeRayHit(it.x, it.y, it.z)
      return {
        ratio: hit.hitDistance == null ? Infinity : hit.hitDistance / hit.targetDistance,
        name: hit.hitName ?? 'sky',
      }
    }, i)
    if (row) rows.push(row)
  }
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    // `pitch` is part of the pose since point 392 (the view looks up and down),
    // so restoring it restores the aim the caller had.
    p.pitch = saved.pitch
  }, pose)
  check(
    `${label}: every panorama silhouette's feet meet drawn ground (point 181)`,
    rows.length >= 2 && rows.every((r) => r.ratio <= 1.05),
    `surface behind the feet [${rows.map((r) => `${r.ratio.toFixed(2)}×@${r.name}`).join(', ')}]`,
  )
}

export const browser = await launchVerifyBrowser()
export const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Point 375: every frame below states the subject it must show — the settlement
// it stands in, the building it is aimed at, the overlay it documents — and the
// shutter proves that subject is in the picture before the file is written.
export const frame = frameShutter(page, OUT)
// The collider geometry the wedged-adults and village sections read with (scripts/verify/colliderProbe.mjs).
await installColliderProbe(page)
export const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page) // point 204: fail loud if the requested backend silently fell back
await page.waitForTimeout(4000)
await page.evaluate(() => {
  window.__balance.randomEventsEnabled = false
  window.__game.getState().setJournalOpen(false)
})

// SHARED STAGING (point 566). A section is a BLOCK SCOPE, so anything two of
// them use lives HERE, above them, never inside one of them — the shape
// scripts/verify/scope.test.mjs fails in the fast layer.

// Advance the scene by RENDERED frames. The headless frame time here swings
// between ~20 ms and well over a second, so every motion measurement below
// counts frames DRAWN rather than milliseconds elapsed: a fixed wall wait that
// happens to span a stall reads the same pose twice and reports the whole
// panorama as motionless, and one that spans a fast stretch moves a walker too
// little to measure. Both were seen turning green checks red on this suite.
export const nextFrames = (n) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let left = count
        const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve())
        requestAnimationFrame(tick)
      }),
    n,
  )
/** Step frames until the page arrow `ready(arg)` reads true, capped. Returns
 *  whether it ever did — the caller ASSERTS on that, so a scene that never gets
 *  there fails loudly instead of quietly measuring nothing. */
export const stepUntil = async (ready, arg = null, capFrames = 240) => {
  if (await page.evaluate(ready, arg)) return true
  for (let f = 0; f < capFrames; f++) {
    await nextFrames(1)
    if (await page.evaluate(ready, arg)) return true
  }
  return false
}

/**
 * Stand in `id` by a DIRECT place->place enter (no travel scene, so no panorama
 * capture — that is what the capture section's fallback check reads). It is the
 * setup the sections that work "wherever the suite happens to stand" own for
 * themselves; a no-op once the place is already the one asked for, so a whole
 * run walks exactly the path it always did.
 */
export const goToPlace = async (id) => {
  if ((await page.evaluate(() => window.__game.getState().placeId)) === id) return
  await page.evaluate((want) => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
    g.enterPlace(want)
  }, id)
  await page
    .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, id, { timeout: 40000 })
    .catch(() => {})
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
}

/**
 * The END of every polish theme suite, called as its last statement: the
 * unrun-section failure, the open questions, the console-error gate and the
 * exit code. One copy, so no theme can drop a gate the others keep.
 */
export async function finishPolishSuite() {
  // A selected section that never executed is a FAILURE, not a quiet pass: it is
  // the one way a --section run could report green having verified nothing.
  const unrun = sections.unrun()
  if (unrun) check('the selected section actually ran', false, unrun)

  // WHAT THIS RUN COULD NOT ANSWER (work-order 1136). A check that saw too few
  // subjects is neither red nor green, so its exit code says nothing about it —
  // which is why the open questions are named again beside the verdict, where a
  // reader of the summary cannot walk past them.
  for (const n of sections.notCovering()) {
    console.log(
      `NOT-COVERING  ${n.check} — ${n.seen} of a needed ${n.minimum} ${n.what} seen` +
        `${n.section ? `  [section: ${n.section}]` : ''}`,
    )
  }

  console.log('console errors:', errors.length)
  for (const e of errors) console.log('ERR:', e.slice(0, 300))
  // Said again where the verdict is read: a green one-section run is not a green
  // suite, and nothing downstream may quote it as one.
  if (sections.banner()) console.log(sections.banner())
  await browser.close()
  process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
}
