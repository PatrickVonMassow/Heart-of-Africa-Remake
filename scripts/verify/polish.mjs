// Headless verification for CLAUDE.md §7.1.31 (settlement orientation after
// a gift and distant panorama wildlife, design.md §17/§2). Dev server only.
import { launchVerifyBrowser, waitForStable, waitForReadingStable, waitForSceneBuilt, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { judgeFootingSeries, judgePitchSeries, MIN_SLOPED_SAMPLES } from './footingSeries.mjs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
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
const probeSilhouetteFooting = async (page, check, label) => {
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
    // so restoring it restores the aim the caller had — before that it was a
    // stray field the probe itself added, and the undefined branch below is
    // what handed the object back unchanged then.
    if (saved.pitch === undefined) delete p.pitch
    else p.pitch = saved.pitch
  }, pose)
  check(
    `${label}: every panorama silhouette's feet meet drawn ground (point 181)`,
    rows.length >= 2 && rows.every((r) => r.ratio <= 1.05),
    `surface behind the feet [${rows.map((r) => `${r.ratio.toFixed(2)}×@${r.name}`).join(', ')}]`,
  )
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Point 375: every frame below states the subject it must show — the settlement
// it stands in, the building it is aimed at, the overlay it documents — and the
// shutter proves that subject is in the picture before the file is written.
const frame = frameShutter(page, OUT)
const errors = []
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

// --- Giza skyline behind Cairo (design.md §4.4, point 82) ----------------------
// The game starts inside Cairo: the great pyramids stand as the western
// skyline silhouette (point-69 pattern, like Cape Town's Table Mountain).
{
  // Point 107: the settlement scatter/fence InstancedMeshes must opt OUT of
  // frustum culling — their bounding sphere is computed at the origin, not over
  // the spread instances, so with culling ON the whole mesh (all rocks/fences)
  // vanished whenever the camera looked away from the settlement centre (user
  // report: "stones disappear at certain spots, reappear when you move").
  const culled = await page.evaluate(() => {
    const scene = window.__scenePass?.scene
    if (!scene) return { checked: 0, culled: 0 }
    let checked = 0
    let culled = 0
    scene.traverse((o) => {
      if (o.isInstancedMesh) {
        checked++
        if (o.frustumCulled) culled++
      }
    })
    return { checked, culled }
  })
  check(
    'settlement instanced meshes opt out of origin-sphere frustum culling (point 107)',
    culled.checked > 0 && culled.culled === 0,
    JSON.stringify(culled),
  )

  const sky = await page.evaluate(() => window.__placeSkyline ?? 'none')
  check('Cairo mounts the Giza pyramid skyline', sky === 'giza-pyramids', `${sky}`)
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = -(window.__placeLayout.radius - 8)
    p.z = 0
    p.yaw = Math.PI / 2
    // No tilt: this frame's composition was accepted at the horizon. (A pitch
    // written here did nothing before point 392 gave the view a vertical axis;
    // now it would aim the camera, so the stray value is gone rather than
    // quietly re-framing an acceptance shot.)
    p.pitch = 0
  })
  await page.waitForTimeout(700)
  const skyBuf = await frame('100-cairo-giza-skyline', { place: 'cairo', label: 'the Giza skyline over Cairo' })

  // Point 273: Menkaure's red-granite base casing read as a floating RED ERROR
  // BAND at this distant skyline scale, so it was removed (kept only at the
  // walkable site). Prove no strongly red-dominant pixels remain over the
  // pyramid silhouette — a red-granite stripe would light many up. The sky is
  // warm haze (r≈g≈b-ish) and the pyramids are tawny (r>g>b but not RED), so a
  // true red band (r well above BOTH g and b) is the error signature.
  {
    const { data, info } = await sharp(skyBuf).raw().toBuffer({ resolveWithObject: true })
    let redBand = 0
    let total = 0
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * info.channels]
      const g = data[i * info.channels + 1]
      const b = data[i * info.channels + 2]
      total++
      // A saturated brick-red: red clearly dominates green AND blue.
      if (r > 90 && r > g * 1.6 && r > b * 1.9) redBand++
    }
    const frac = redBand / total
    check(
      'no red granite error band on the Cairo skyline pyramids (point 273)',
      frac < 0.002,
      `red-dominant pixel fraction ${frac.toFixed(5)}`,
    )
  }

  // Point 102 (a): in Cairo no VISIBLE panorama silhouette may fall inside the
  // Giza skyline's excluded azimuth span — otherwise an animal drifts across the
  // pyramids (the user's report). Asserted on the dev state, not on pixels.
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  const gizaExcl = await page.evaluate(() => {
    const spans = window.__placeSkylineExclusion ?? []
    const info = Object.values(window.__placePanoramaWildlifeInfo ?? {})
    const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d))
    const inSpan = (az) => spans.some((s) => Math.abs(wrap(az - s.center)) <= s.half)
    const violating = info.filter((v) => v.visible !== false && inSpan(v.azimuth)).length
    return { skyline: window.__placeSkyline, spanCount: spans.length, sils: info.length, violating }
  })
  check(
    'no Cairo panorama silhouette crosses the Giza skyline span (point 102)',
    gizaExcl.skyline === 'giza-pyramids' && gizaExcl.spanCount >= 1 && gizaExcl.sils >= 3 && gizaExcl.violating === 0,
    JSON.stringify(gizaExcl),
  )
  await frame('105-cairo-panorama-giza-clear', { place: 'cairo', label: 'the Cairo panorama with the Giza skyline' })
}

// --- Panorama wildlife (design.md §2) ---------------------------------------------
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('maasai-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "maasai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
// The panorama animals stream in over the first seconds of the scene.
await page.waitForFunction(() => (window.__placePanoramaWildlife ?? 0) >= 3, null, { timeout: 20000 }).catch(() => {})
const wildlife = await page.evaluate(() => window.__placePanoramaWildlife ?? 0)
check('distant wildlife drifts through the panorama', wildlife >= 3, `${wildlife} animals`)
// Points 92/94: every silhouette stays SMALL (bounded subtended angle) and
// HAZED toward the sky (not a flat near-black blob), and its feet meet ground
// the frame draws (point 181) rather than the horizon-at-infinity constant.
await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 10000 }).catch(() => {})
const wInfo = await page.evaluate(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}))
check(
  'every panorama silhouette sits on the ground line it was placed on',
  // Point 300: the body DIPS onto whichever leg is planted (that is what puts
  // the standing foot on the ground), so the anchor may sit below the line by
  // that dip — `drop` — and never above it.
  wInfo.length >= 3 && wInfo.every((w) => w.y >= w.visibleY - w.drop - 1e-3 && w.y <= w.visibleY + 0.2),
  `y vs line [${wInfo.map((w) => `${w.y.toFixed(2)}/${w.visibleY.toFixed(2)}-${(w.drop ?? 0).toFixed(2)}`).join(', ')}]`,
)
await probeSilhouetteFooting(page, check, 'maasai-village (no capture)')
// Advance the scene by RENDERED frames. The headless frame time here swings
// between ~20 ms and well over a second, so every motion measurement below
// counts frames DRAWN rather than milliseconds elapsed: a fixed wall wait that
// happens to span a stall reads the same pose twice and reports the whole
// panorama as motionless, and one that spans a fast stretch moves a walker too
// little to measure. Both were seen turning green checks red on this suite.
const nextFrames = (n) =>
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
const stepUntil = async (ready, arg = null, capFrames = 240) => {
  if (await page.evaluate(ready, arg)) return true
  for (let f = 0; f < capFrames; f++) {
    await nextFrames(1)
    if (await page.evaluate(ready, arg)) return true
  }
  return false
}
// Point 255 (3): the silhouettes must WALK the horizon, not glide along it.
// Their stride phase rides the ground they cover on the ring, so over the same
// interval each one's phase advance divided by its (scale-normalised, point 286)
// gait speed is the SAME constant — a wall-clock bob would advance them all
// alike whatever their speed.
{
  const sample = () =>
    page.evaluate(() =>
      Object.values(window.__placePanoramaWildlifeInfo ?? {}).map((w) => ({
        gait: w.gait,
        speed: w.gaitSpeed,
        cadence: w.cadence,
      })),
    )
  const before = await sample()
  // Wait for the STRIDE to actually advance rather than for a wall clock: on a
  // stalled headless frame a fixed 1200 ms wait read the identical phase twice
  // and reported every rate as 0.000 with a NaN spread.
  const walked = await stepUntil((b) => {
    const now = Object.values(window.__placePanoramaWildlifeInfo ?? {})
    return now.some((w, i) => Math.abs(w.gait - b[i]?.gait) > 0.2)
  }, before)
  const after = await sample()
  // Point 300: each species walks at its OWN cadence (derived from its leg), so
  // the shared constant is no longer the phase per unit walked but the phase per
  // unit walked DIVIDED by that cadence — one full cycle per stride, for every
  // animal whatever its legs. A clock-driven bob would advance them all alike.
  const rates = before
    .map((b, i) => ({ d: after[i].gait - b.gait, speed: b.speed, cadence: b.cadence }))
    .filter((r) => r.speed > 0 && r.cadence > 0)
    .map((r) => r.d / (r.speed * r.cadence))
  const spread = rates.length ? (Math.max(...rates) - Math.min(...rates)) / Math.max(...rates) : 1
  check(
    'the panorama silhouettes stride with the ground they cover, not the clock (points 255/300)',
    walked && rates.length >= 3 && rates.every((r) => r > 0) && spread < 0.02,
    walked
      ? `phase per unit walked ÷ cadence [${rates.map((r) => r.toFixed(3)).join(', ')}], spread ${(spread * 100).toFixed(1)}%`
      : 'MEASURED NOTHING — no silhouette advanced its stride within the frame cap',
  )
}
// Point 286: the silhouettes must WALK FORWARD, never backward. The facing is
// derived from the ring velocity, so each visible silhouette's displacement over
// an interval must project POSITIVELY onto its facing (forward = (sin yaw,
// cos yaw)), and a moving one must actually advance. The reverted bug set the
// yaw exactly π off the tangent, so every silhouette moonwalked.
//
// Stepped by RENDERED FRAMES, never by a wall clock: this scene occasionally
// stalls for over a second headless, and a fixed 1200 ms wait that spans such a
// stall reads the SAME pose twice and reports every silhouette as motionless —
// the check then fails on "no one advanced" while the walk itself is fine (seen
// once, passing on the very next run). Waiting for the drift to actually happen
// removes the false red without touching what is asserted: a silhouette that
// still refuses to advance within the cap fails exactly as before.
{
  const snap = () =>
    page.evaluate(() => {
      const info = window.__placePanoramaWildlifeInfo ?? {}
      const out = {}
      for (const k of Object.keys(info)) out[k] = { x: info[k].x, z: info[k].z, yaw: info[k].yaw, visible: info[k].visible }
      return out
    })
  const b0 = await snap()
  for (let f = 0; f < 240; f++) {
    await nextFrames(1)
    const now = await snap()
    if (Object.keys(b0).some((k) => now[k] && Math.hypot(now[k].x - b0[k].x, now[k].z - b0[k].z) > 0.05)) break
  }
  const b1 = await snap()
  const along = []
  for (const k of Object.keys(b0)) {
    const p = b0[k]
    const q = b1[k]
    if (!q || p.visible === false || q.visible === false) continue
    const dx = q.x - p.x
    const dz = q.z - p.z
    along.push({ a: dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw), d: Math.hypot(dx, dz) })
  }
  check(
    'every panorama silhouette walks forward along its facing, never backward (point 286)',
    along.length >= 3 && along.every((r) => r.a >= -1e-3) && along.some((r) => r.d > 1e-3 && r.a > 0),
    `along-facing displacement [${along.map((r) => r.a.toFixed(3)).join(', ')}]`,
  )
}
// Point 300: the feet must be PLANTED, not skating. Sample a tracked foot's
// WORLD position across a series of frames and compare its travel with the
// body's over the same intervals, counting only the intervals in which that leg
// stayed in stance. A planted foot barely moves while the body walks on; the old
// over-driven cadence dragged it along at a large fraction of the body's speed.
{
  /**
   * Step the scene until SOME tracked animal has covered `want` of its own
   * stride, so the interval is sized in the animal's units and not in frames.
   *
   * A FIXED frame count cannot do this: a pen goat walks ~0.12 world units a
   * second and its stride is 0.82, so three frames of a fast headless run move
   * it 0.008 — under any usable floor, which is exactly why this check first
   * measured NOTHING and reported a vacuous "0 stance intervals". The same three
   * frames on a stalled run cover a whole cycle. Sizing the step by the stride
   * makes the measurement independent of the frame rate.
   */
  const stepUntilWalked = async (read, want, capFrames = 150) => {
    const from = await page.evaluate(read)
    for (let f = 0; f < capFrames; f++) {
      await nextFrames(1)
      const now = await page.evaluate(read)
      let far = 0
      for (const id of Object.keys(from)) {
        const p0 = from[id]
        const p1 = now[id]
        if (!p1 || !(p0.stride > 0)) continue
        far = Math.max(far, Math.hypot(p1.x - p0.x, p1.z - p0.z) / p0.stride)
      }
      if (far >= want) return
    }
  }
  const trackFeet = async (read, label) => {
    const samples = []
    for (let k = 0; k < 14; k++) {
      samples.push(await page.evaluate(read))
      // 5 % of a stride per interval: far above any measurement floor, far below
      // the half-stride a stance lasts.
      await stepUntilWalked(read, 0.05)
    }
    const slips = []
    let turned = 0
    for (let k = 1; k < samples.length; k++) {
      const a = samples[k - 1]
      const b = samples[k]
      for (const id of Object.keys(a)) {
        const p0 = a[id]
        const p1 = b[id]
        if (!p1 || !p0.stance || !p1.stance || !p0.foot || !p1.foot) continue
        const body = Math.hypot(p1.x - p0.x, p1.z - p0.z)
        // A standing animal proves nothing. The floor is a fraction of the
        // animal's OWN stride, not a world constant — a goat and an elephant do
        // not walk in the same units.
        if (!(p0.stride > 0) || body < 0.02 * p0.stride) continue
        // Within one stance the body covers at most half a stride, so a longer
        // interval found the SAME leg planted again a cycle on: a wrap, not a
        // skate — it proves nothing either.
        if (body > 0.4 * p0.stride) continue
        // The foot's travel is measured in the walker's own HEADING frame: the
        // promise under test is that one stride carries the body exactly as far
        // as the stance foot sweeps back through it, which is a statement about
        // the walking direction. A body that also TURNS swings its rigid legs
        // about its centre, and because a trot plants a DIAGONAL pair — the two
        // stance feet sit symmetrically about that centre — no rigid rotation
        // can hold both; only full foot-IK could, which this point explicitly
        // leaves out of scope. So the pivot is measured and REPORTED (`turn`
        // below) but not charged to the cadence, which is what the fix controls
        // and what a wrong cadence would blow up here on any path, straight or
        // curved.
        // Forward is (sin yaw, cos yaw) throughout this codebase, so local→world
        // is (lx·cos + lz·sin, −lx·sin + lz·cos) and world→local its transpose.
        const toLocal = (dx, dz, yaw) => ({
          x: dx * Math.cos(yaw) - dz * Math.sin(yaw),
          z: dx * Math.sin(yaw) + dz * Math.cos(yaw),
        })
        const y0 = p0.yaw ?? 0
        const y1 = p1.yaw ?? 0
        const f0 = toLocal(p0.foot.x - p0.x, p0.foot.z - p0.z, y0)
        const f1 = toLocal(p1.foot.x - p1.x, p1.foot.z - p1.z, y1)
        // The foot's world displacement with the rigid yaw change removed: the
        // body's own travel plus the foot's sweep through the body frame, the
        // latter carried back to world in the heading held at interval start.
        const lx = f1.x - f0.x
        const lz = f1.z - f0.z
        const sx = lx * Math.cos(y0) + lz * Math.sin(y0)
        const sz = -lx * Math.sin(y0) + lz * Math.cos(y0)
        slips.push(Math.hypot(p1.x - p0.x + sx, p1.z - p0.z + sz) / body)
        turned = Math.max(turned, Math.abs(Math.atan2(Math.sin((p1.yaw ?? 0) - (p0.yaw ?? 0)), Math.cos((p1.yaw ?? 0) - (p0.yaw ?? 0)))))
      }
    }
    // A check that measured nothing must never be able to pass, and must say so
    // rather than print the empty set's Infinity as if it were a huge slip.
    check(
      `${label}: the planted foot holds its ground spot while the body walks over it (point 300)`,
      slips.length >= 3 && Math.max(...slips) < 0.25,
      slips.length >= 3
        ? `${slips.length} stance intervals, worst foot/body travel ${Math.max(...slips).toFixed(3)}, turn up to ${turned.toFixed(3)} rad`
        : `MEASURED NOTHING — only ${slips.length} usable stance intervals (needs 3): no tracked walker was both in stance and moving`,
    )
  }
  await trackFeet(() => {
    const out = {}
    const info = window.__placePanoramaWildlifeInfo ?? {}
    for (const k of Object.keys(info)) {
      const w = info[k]
      if (w.visible === false) continue
      out[k] = { x: w.x, z: w.z, yaw: w.yaw, foot: w.foot, stance: w.stance, stride: w.stride }
    }
    return out
  }, 'panorama silhouette')
  await trackFeet(() => {
    const out = {}
    const info = window.__placeGoatGait ?? {}
    for (const k of Object.keys(info)) {
      const g = info[k]
      out[k] = { x: g.x, z: g.z, yaw: g.yaw, foot: g.foot, stance: g.stance, stride: g.stride }
    }
    return out
  }, 'settlement walker (goat)')
}
// Point 413: the settlement animals must stay OUT of the settlement's solids and
// out of one another. The report was a goat crossing a compound fence and, the
// same night, "wildes Durcheinanderclippen" — goats standing inside one another
// and inside a tent. Sampled as a SERIES over the walk, never one instant: a
// wandering animal meets a wall only now and then, and a single frame that
// happened to catch it in open ground would prove nothing.
{
  const readOverlap = () =>
    page.evaluate(() => {
      const cs = window.__placeLayout?.colliders ?? []
      const info = window.__placeGoatGait ?? {}
      const ids = Object.keys(info)
      const R = 0.3 // WALKER_RADIUS — the radius the animals move with
      const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
      // How deep a mover at (x,z) sits inside this collider; ≤ 0 is clear.
      const depth = (c, x, z) => {
        if (c.kind === 'box') {
          const sin = Math.sin(c.rot)
          const cos = Math.cos(c.rot)
          const dx = x - c.x
          const dz = z - c.z
          const lx = cos * dx - sin * dz
          const lz = sin * dx + cos * dz
          return R - Math.hypot(lx - clamp(lx, -c.hx, c.hx), lz - clamp(lz, -c.hz, c.hz))
        }
        if (c.kind === 'segment') {
          const ex = c.x2 - c.x1
          const ez = c.z2 - c.z1
          const l2 = ex * ex + ez * ez
          const t = l2 < 1e-12 ? 0 : clamp(((x - c.x1) * ex + (z - c.z1) * ez) / l2, 0, 1)
          return c.r + R - Math.hypot(x - (c.x1 + ex * t), z - (c.z1 + ez * t))
        }
        return c.r + R - Math.hypot(x - c.x, z - c.z)
      }
      let solid = -Infinity
      let pair = Infinity
      for (const id of ids) {
        const g = info[id]
        for (const c of cs) solid = Math.max(solid, depth(c, g.x, g.z))
      }
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = info[ids[i]]
          const b = info[ids[j]]
          pair = Math.min(pair, Math.hypot(a.x - b.x, a.z - b.z))
        }
      }
      return { animals: ids.length, solid, pair }
    })
  const series = []
  for (let k = 0; k < 20; k++) {
    series.push(await readOverlap())
    await nextFrames(3)
  }
  const solids = series.filter((s) => s.animals >= 1)
  const pairs = series.filter((s) => s.animals >= 2)
  const deepest = solids.length > 0 ? Math.max(...solids.map((s) => s.solid)) : 0
  const closest = pairs.length > 0 ? Math.min(...pairs.map((s) => s.pair)) : 0
  check(
    'no settlement animal stands inside a fence, hut or prop (point 413)',
    solids.length >= 10 && deepest < 0.02,
    solids.length >= 10
      ? `${solids.length} samples, deepest penetration ${deepest.toFixed(3)} m`
      : `MEASURED NOTHING — only ${solids.length} samples carried an animal`,
  )
  check(
    'no settlement animal stands inside another one (point 413)',
    pairs.length >= 10 && closest > 0.45,
    pairs.length >= 10
      ? `${pairs.length} samples, closest pair ${closest.toFixed(2)} m`
      : `MEASURED NOTHING — only ${pairs.length} samples carried two animals`,
  )
  // The picture behind the numbers. The probe borrows the camera and hands the
  // pose back exactly as it found it (the lesson of point 375).
  const aimed = await page.evaluate(() => {
    const p = window.__placePlayer
    const herd = Object.values(window.__placeGoatGait ?? {})
    if (!p || herd.length === 0) return null
    const pose = { x: p.x, z: p.z, yaw: p.yaw }
    const cx = herd.reduce((s, g) => s + g.x, 0) / herd.length
    const cz = herd.reduce((s, g) => s + g.z, 0) / herd.length
    const d = Math.hypot(cx - p.x, cz - p.z) || 1
    p.x = cx - ((cx - p.x) / d) * 7
    p.z = cz - ((cz - p.z) / d) * 7
    p.yaw = Math.atan2(-(cx - p.x), -(cz - p.z))
    return { pose, cx, cz }
  })
  if (aimed) {
    await nextFrames(2)
    // The subject is the HERD, so the shutter projects it (point 375): a frame
    // named after the goats must have the goats in it.
    await frame('143-village-goat-separation', {
      local: { x: aimed.cx, y: 0.5, z: aimed.cz },
      label: 'the goats, each on its own ground',
    })
    await page.evaluate((pose) => {
      const p = window.__placePlayer
      if (!p) return
      p.x = pose.x
      p.z = pose.z
      p.yaw = pose.yaw
    }, aimed.pose)
  }
}
// --- The hypothesis over the speaker's head (design.md §13.4, point 485) ------
// The lifetime and the note binding are pinned in the Vitest layer. What only a
// browser can answer is the ATTACHMENT: the note must ride on the FIGURE that
// speaks, not sit at a world coordinate. The delivered bug was exactly that —
// R3F keeps its objects' local matrices itself, so a group moved from a frame
// callback that does not publish the move is read at the position it was born
// with, and every label stood at the scene origin. Measured here against the
// figure's own projected anchor, in the SAME evaluate as the rendered label's
// DOM box, so no frame passes between deciding and measuring.
{
  const COME = 'BA-BA-ba-ba-ba'
  const pose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  // The figures are named for this (point 485), so they can be collected out of
  // the scene graph and their world translation read off the matrix.
  const candidates = await page.evaluate(() => {
    const scene = window.__placeScene
    if (!scene) return []
    const found = []
    scene.traverse((o) => {
      if (o.name === 'inhabitant' && found.length < 10) found.push(o)
    })
    window.__speechProbeFigures = found
    return found.map((o) => {
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      return { x: e[12], y: e[13], z: e[14] }
    })
  })
  // The picture is the evidence here, so the speaker must be one the camera can
  // SEE: a figure standing behind a hut still carries its label (drei's <Html>
  // is not depth-tested), and a frame of a note floating over a roof would prove
  // the attachment to nobody. Each candidate is stood in front of and ray-probed
  // against the rendered scene — the same instrument the silhouette footing uses.
  // The first surface drawn along the sight line must be the FIGURE ITSELF, and
  // that is what its DISTANCE says: a hut wall in front reads far too near, and a
  // ray that sails PAST a smaller figure hits the ground far beyond it. Hence the
  // ratio is bounded on BOTH sides — "nothing in front" alone accepted a miss,
  // and a frame of a note over an empty patch of village was the result.
  // Every position here is read LIVE: these figures WALK, and a probe cast at
  // the spot one was standing on when the list was built misses it entirely
  // once a loaded machine lets a second pass between. That stale target is what
  // made this selection find nobody at all on a busy run.
  const STAND_BACK = 5
  /** Stand `STAND_BACK` in front of figure `i`, on the outward bearing, and
   *  report what the frame draws at its chest. */
  const aimAt = async (i) => {
    await page.evaluate(
      ({ idx, back }) => {
        const figure = window.__speechProbeFigures?.[idx]
        const p = window.__placePlayer
        if (!figure || !p) return
        figure.updateWorldMatrix(true, false)
        const e = figure.matrixWorld.elements
        const at = { x: e[12], z: e[14] }
        // Stand between the settlement centre and the figure, looking OUTWARD:
        // the open village edge then lies behind the speaker instead of a hut
        // wall, so the note and the head under it read against the sky. Falls
        // back to the current bearing for a figure standing on the centre itself.
        const out = Math.hypot(at.x, at.z)
        const len = Math.hypot(at.x - p.x, at.z - p.z) || 1
        const ux = out > 1 ? at.x / out : (at.x - p.x) / len
        const uz = out > 1 ? at.z / out : (at.z - p.z) / len
        p.x = at.x - ux * back
        p.z = at.z - uz * back
        p.pitch = 0
        // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
        p.yaw = Math.atan2(at.x - p.x, at.z - p.z) + Math.PI
      },
      { idx: i, back: STAND_BACK },
    )
    await nextFrames(2)
    return page.evaluate((idx) => {
      const figure = window.__speechProbeFigures?.[idx]
      if (!figure || !window.__placeRayHit) return null
      figure.updateWorldMatrix(true, false)
      const e = figure.matrixWorld.elements
      // Chest height, and against the figure's position NOW — it may have
      // walked on since the pose was set.
      const h = window.__placeRayHit(e[12], e[13] + 1, e[14])
      return { ratio: h.hitDistance == null ? null : h.hitDistance / h.targetDistance, name: h.hitName }
    }, i)
  }
  let speaker = null
  let speakerIndex = -1
  const probes = []
  for (let i = 0; i < candidates.length && speakerIndex < 0; i++) {
    const hit = await aimAt(i)
    probes.push(hit ? `${hit.ratio == null ? 'sky' : hit.ratio.toFixed(2)}@${hit.name}` : 'none')
    if (hit && hit.ratio !== null && hit.ratio >= 0.85 && hit.ratio <= 1.15) {
      speaker = candidates[i]
      speakerIndex = i
    }
  }
  check(
    'the settlement offers a figure in clear view to speak over (point 485)',
    !!speaker,
    `chosen #${speakerIndex} of ${candidates.length} named figures; sight lines [${probes.join(', ')}]`,
  )
  if (speaker) {
    // Speak over THAT figure, not over whichever one the scene lists first: the
    // chosen object is given a unique name for the dev hook to resolve. The
    // channel stores the object itself, so a later React render restoring the
    // shared name cannot detach the label.
    // A label shows only over speech the player has ALREADY observed, so the
    // utterance is heard first — that gate is what the label is worth.
    const spoke = await page.evaluate(
      ({ u, idx }) => {
        window.__game.getState().hearUtterance(u)
        const figure = window.__speechProbeFigures?.[idx]
        if (!figure) return false
        figure.name = 'speech-probe-figure'
        // A long lifetime on purpose: the LIFETIME is pure-tested in Vitest, and
        // a label that expired mid-measurement would only make this check flake.
        const ok = window.__speech?.speak('probe-speaker', [u], 'speech-probe-figure', 120) === true
        figure.name = 'inhabitant'
        return ok
      },
      { u: COME, idx: speakerIndex },
    )
    check('a figure can speak over its head at all (point 485)', spoke, `spoke ${spoke}`)
    await nextFrames(3)
    // The anchor point, the figure's own body and the rendered label's DOM box
    // are read in ONE evaluate, so no frame passes between deciding where the
    // speaker is and measuring where its note landed.
    const read = () =>
      page.evaluate((idx) => {
        const pt = window.__speech?.anchorScreen('probe-speaker')
        const el = document.querySelector('.speech-label')
        const figure = window.__speechProbeFigures?.[idx]
        if (!pt || !el || !figure) return null
        figure.updateWorldMatrix(true, false)
        const e = figure.matrixWorld.elements
        const cam = window.__placeCamera
        const v = new (Object.getPrototypeOf(cam.position).constructor)(e[12], e[13] + 1, e[14])
        v.project(cam)
        const r = el.getBoundingClientRect()
        return {
          dx: r.left + r.width / 2 - pt.x,
          dy: r.top + r.height / 2 - pt.y,
          height: r.height,
          bodyX: ((v.x + 1) / 2) * window.innerWidth,
          bodyY: ((1 - v.y) / 2) * window.innerHeight,
          vw: window.innerWidth,
          vh: window.innerHeight,
          labelBottom: r.bottom,
          syllables: el.querySelector('.syllables')?.textContent ?? '',
          reading: el.querySelector('.reading')?.textContent ?? '',
        }
      }, speakerIndex)
    const samples = []
    for (let k = 0; k < 8; k++) {
      const s = await read()
      if (s) samples.push(s)
      await nextFrames(1)
    }
    // Both allowances are expressed in the LABEL'S OWN height, which drei's
    // distanceFactor scales with the distance — a screen constant would pass at
    // one range and fail at another, and this scene picks its speaker afresh
    // every run. Horizontally the label is centred on its anchor and typically
    // lands within a pixel of it; the slack is there because drei's <Html> reads
    // the world matrix in a frame callback of its OWN, so on a frame where it
    // runs first the note trails the walking figure by exactly one step (10 px
    // measured, against a body some 95 px wide at this range). Vertically the
    // CSS lifts the box by 8 px, scaled the same way. What this rejects is the
    // bug it exists for: a label left at the scene origin, hundreds of pixels
    // from its speaker or off the viewport altogether.
    const worstX = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dx) - 0.5 * s.height)) : Infinity
    const worstY = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dy) - 0.35 * s.height)) : Infinity
    check(
      'the note rides on the figure that speaks, not on a world coordinate (point 485)',
      samples.length >= 6 && worstX <= 0 && worstY <= 0,
      samples.length >= 6
        ? `worst sideways offset past half the label height ${worstX.toFixed(1)} px, worst vertical offset past the scaled lift ${worstY.toFixed(1)} px, over ${samples.length} frames`
        : `MEASURED NOTHING — only ${samples.length} frames carried both a label and its anchor`,
    )
    // And the picture must SHOW that: the speaker's own body stands inside the
    // frame, directly under its note. A label over an empty patch of village
    // would satisfy every number above and prove nothing to a human eye.
    const underNote = samples.filter(
      (s) => s.bodyX > 0 && s.bodyX < s.vw && s.bodyY > s.labelBottom && s.bodyY < s.vh,
    )
    check(
      'the speaking figure itself stands in the frame, under its note (point 485)',
      underNote.length >= 6,
      samples.length
        ? `body at (${samples[0].bodyX.toFixed(0)}, ${samples[0].bodyY.toFixed(0)}), label bottom ${samples[0].labelBottom.toFixed(0)} — ${underNote.length}/${samples.length} frames`
        : 'MEASURED NOTHING',
    )
    // Point 485 (1)/(4): the syllables stand BESIDE the reading, never instead of
    // it, and an unwritten reading reads `???`.
    const last = samples[samples.length - 1] ?? { syllables: '', reading: '' }
    check(
      'the label shows the syllables beside the reading, `???` where none is written (point 485)',
      last.syllables === COME && last.reading === '???',
      JSON.stringify(last),
    )
    // Point 485 (3): editing the note in the journal changes the label at once —
    // one source seen twice, nothing copied onto the label.
    await page.evaluate((u) => window.__game.getState().setUtteranceHypothesis(u, 'come here'), COME)
    await nextFrames(2)
    const afterEdit = await read()
    check(
      'a reading written in the journal stands over the head immediately (point 485)',
      !!afterEdit && afterEdit.reading === 'come here',
      JSON.stringify(afterEdit),
    )
    // Re-aim before the shutter: the speaker has kept walking through the
    // measurement, and the frame is the evidence that its note stands over ITS
    // head — so the camera is put back in front of it, wherever it is now.
    await aimAt(speakerIndex)
    // The subject is where the figure stands NOW — it may have walked on since
    // it was chosen — so the shutter judges the frame against the live anchor.
    const at = await page.evaluate((idx) => {
      const figure = window.__speechProbeFigures?.[idx]
      if (!figure) return null
      figure.updateWorldMatrix(true, false)
      const e = figure.matrixWorld.elements
      return { x: e[12], y: e[13], z: e[14] }
    }, speakerIndex)
    await frame('146-speech-hypothesis-label', {
      local: { x: (at ?? speaker).x, y: (at ?? speaker).y + 2.3, z: (at ?? speaker).z },
      label: 'the reading over the speaking figure',
    })
    await page.evaluate((u) => {
      window.__game.getState().setUtteranceHypothesis(u, '')
      window.__speech?.clear()
      delete window.__speechProbeFigures
    }, COME)
  }
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    if (saved.pitch !== undefined) p.pitch = saved.pitch
  }, pose)
}
// Point 300, slope footing: a silhouette on a dune must lie ON the incline —
// its body pitched over its own wheelbase, and each foot then seated on the
// ground under ITS OWN spot — so the planted foot touches the ground drawn
// under it instead of hovering above it. Measured as the vertical
// gap between the tracked foot and that ground, in units of the animal's own
// height, and specifically on the silhouettes standing on a genuinely SLOPED
// spot (front and back footing differ).
// It is measured as a SERIES, and where the slope actually is (point 412). The
// old check read ONE instant at maasai-village and passed while reporting
// `slope over the wheelbase [0.00 x4]` and `pitch [0.000 x4]`: the silhouettes
// there stand on the flat disc-horizon line, so the seating under test was a
// NO-OP in the measured frame — a verdict without its population, the same
// class as retrospective §3.47 one step on. Now many frames are sampled, the
// samples that stood on genuinely sloped ground are COUNTED, and a count of
// zero FAILS. `judgeFootingSeries` holds that decision and is pure-tested in
// scripts/verify/footingSeries.test.mjs.
{
  // The TRACKED leg is only planted for half of each cycle, and a single sampled
  // instant can catch every silhouette mid-swing. Reading the feet in the SAME
  // evaluate as the test keeps the pose from changing between deciding and
  // measuring.
  const readFeet = () =>
    page.evaluate(() =>
      Object.values(window.__placePanoramaWildlifeInfo ?? {})
        .filter((w) => w.visible !== false && w.foot && w.stance)
        .map((w) => ({
          gap: w.footGap,
          h: w.worldHeight,
          slope: Math.abs((w.frontY ?? 0) - (w.backY ?? 0)),
          pitch: w.pitch,
          stretch: w.stretch,
        })),
    )
  const sampleSeries = async (frames) => {
    const out = []
    for (let f = 0; f < frames; f++) {
      out.push(...(await readFeet()))
      await nextFrames(2)
    }
    return out
  }
  const goTo = async (id) => {
    await page.evaluate((want) => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
      g.enterPlace(want)
    }, id)
    await page
      .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, id, { timeout: 40000 })
      .catch(() => {})
    await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 25000 }).catch(() => {})
  }
  // Settlements whose backdrop relief RISES, measured: pedi-village puts every
  // stance sample on a slope (Drakensberg foothills), sidama-village and
  // capetown a smaller share. maasai-village, where this check used to run, and
  // berber-village both measure 0.000 across 150 samples — the flat disc line.
  // The first place that supplies a population is used; falling through them all
  // is itself a failure, never a quiet pass.
  const SLOPED_PLACES = ['pedi-village', 'sidama-village', 'capetown']
  let series = []
  let where = null
  for (const id of SLOPED_PLACES) {
    await goTo(id)
    series = await sampleSeries(30)
    where = id
    if (judgeFootingSeries(series).sloped >= MIN_SLOPED_SAMPLES) break
  }
  // The place goes in the DETAIL, never in the check NAME: the flake and
  // baseline classifiers match checks by name, and a name that moved with the
  // sampling place would read as a different check every run.
  const footing = judgeFootingSeries(series)
  check(
    'every planted panorama foot touches the ground drawn under it, on SLOPED ground (points 300/412)',
    footing.ok,
    `at ${where} — ${footing.detail}`,
  )
  const leaning = judgePitchSeries(series)
  check(
    'no panorama body leans past a stand-able incline, however steep the backdrop reads (points 300/412)',
    leaning.ok,
    `at ${where} — ${leaning.detail}`,
  )
  // Hand the scene back to the settlement the rest of this suite expects.
  await goTo('maasai-village')
}
check(
  'every panorama silhouette reads small (bounded subtended angle, point 94)',
  wInfo.length >= 3 && wInfo.every((w) => w.apparentDeg <= 2.6),
  `apparentDeg [${wInfo.map((w) => w.apparentDeg.toFixed(2)).join(', ')}]`,
)
check(
  'every panorama silhouette is hazed toward the sky, not flat black (point 94)',
  wInfo.length >= 3 && wInfo.every((w) => w.hazeLum > 0.42),
  `hazeLum [${wInfo.map((w) => w.hazeLum.toFixed(2)).join(', ')}]`,
)

// --- Settlement plan on the map (design.md §6.1, point 79) --------------------
// Inside a place the map opens as a plan of the town: functional buildings
// marked and named, no continental canvas.
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(400)
const plan = await page.evaluate(() => {
  const el = document.querySelector('.map-place-plan')
  const labels = [...document.querySelectorAll('.plan-building-label')].map((n) => n.textContent)
  return { present: !!el, labels, canvas: !!document.querySelector('.map-overlay canvas') }
})
await frame('98-place-plan', { element: '.map-place-plan', label: 'the town plan' })
check('inside a settlement the map shows the town plan', plan.present && !plan.canvas, JSON.stringify({ canvas: plan.canvas }))
check('the plan names the functional buildings', plan.labels.length >= 2, `labels [${plan.labels.join(', ')}]`)
await page.evaluate(() => window.__ui.getState().toggleMap())
await page.waitForTimeout(200)

// --- Orientation after a gift (design.md §17) ---------------------------------------
const before = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('no building markers before the gift', before === 0, `${before}`)
const toast = await page.evaluate(() => {
  const g = window.__game.getState()
  g.debugAddGift('emerald') // revered in the east
  g.giveGift('emerald')
  return window.__game.getState().toast
})
await page.waitForTimeout(600)
const after = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('the gift unlocks the building markers', after >= 1, `${after} markers`)
check('the orientation announces itself', !!toast && toast.length > 0, `"${toast}"`)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
// AIM the camera at a marked building before photographing its marker. The
// frame used to be shot from wherever the previous check had left the camera,
// so whether a marker was in the picture at all was chance — the shutter
// (point 375) refused the frame and that is how the missing aim was found.
// The chief's hut is the marker the shutter judges (it is the first
// `.building-highlight` in DOM order, the layout's first non-villager
// interactive), so stand back from it on its own bearing and face it.
const marked = await page.evaluate(() => {
  const it = (window.__placeLayout?.interactives ?? []).find((i) => i.type !== 'villager')
  if (!it) return null
  const p = window.__placePlayer
  const [mx, mz] = it.pos
  const d = Math.hypot(mx, mz) || 1
  // Stand 14 m from the hut on the line toward the settlement centre — the open
  // ground every layout keeps clear — and far enough back that the marker at
  // ~5.6 m sits well inside the vertical field of view (the place camera builds
  // its rotation from yaw alone, so there is no pitch to tilt up with).
  p.x = mx - (mx / d) * 14
  p.z = mz - (mz / d) * 14
  // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
  p.yaw = Math.atan2(mx - p.x, mz - p.z) + Math.PI
  return { type: it.type, x: mx, z: mz }
})
check('the settlement offers a marked building to photograph', !!marked, JSON.stringify(marked))
await page.waitForTimeout(400)
await frame('93-orientation-highlight', { element: '.building-highlight', label: `the marker over the ${marked?.type ?? 'important'} building` })

// Persistence: leaving and re-entering keeps the orientation.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
})
await page.waitForTimeout(600)
await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "maasai-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
const again = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('the orientation persists across re-entry', again >= 1, `${again} markers`)

// A settlement without a gift stays unmarked.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('swahili-village')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "swahili-village", { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(500)
const other = await page.evaluate(() => document.querySelectorAll('.building-highlight').length)
check('other settlements stay unmarked without a gift', other === 0, `${other}`)

// --- Port skyline landmarks (design.md §4.4 Part C) ---------------------------
// Cape Town: Table Mountain stands as a flat-topped massif behind the town.
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('capetown')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'capetown', { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(1200)
const skyline = await page.evaluate(() => window.__placeSkyline)
check('Cape Town mounts the Table Mountain skyline', skyline === 'table-mountain', `${skyline}`)
await page.evaluate(() => {
  window.__game.getState().setJournalOpen(false)
  const p = window.__placePlayer
  p.x = 0
  p.z = window.__placeLayout.radius - 3
  p.yaw = 0
})
await page.waitForTimeout(600)
await frame('96-capetown-table-mountain', { place: 'capetown', label: 'Cape Town under Table Mountain' })

// Timbuktu: the Djinguereber mosque stands inside the town fabric, with a
// collider (an oriented box like every rectangular building).
await page.evaluate(() => {
  const g = window.__game.getState()
  g.leavePlace()
  g.enterPlace('timbuktu')
})
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'timbuktu', { timeout: 30000 })
  .catch(() => {})
await page.waitForTimeout(1200)
const mosque = await page.evaluate(() => {
  const d = window.__placeLayout.dwellings.find((dd) => dd.kind === 'mosque')
  return d ? { x: d.x, z: d.z, door: d.door } : null
})
check('Timbuktu builds the Djinguereber mosque', !!mosque, JSON.stringify(mosque))
if (mosque) {
  await page.evaluate((m) => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    // Stand back from the door point (guaranteed free ground) facing the mosque.
    const dx = m.x - m.door[0]
    const dz = m.z - m.door[1]
    const dl = Math.hypot(dx, dz) || 1
    // Stand on the door approach (kept free by the layout rules), close
    // enough that no neighbouring house can block the view.
    p.x = m.door[0] - (dx / dl) * 5
    p.z = m.door[1] - (dz / dl) * 5
    p.pitch = 0 // level: the minaret is in frame from here (see the Cairo note)
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(m.x - p.x, m.z - p.z) + Math.PI
  }, mosque)
  await page.waitForTimeout(600)
  await frame('97-timbuktu-djinguereber', { local: { x: mosque.x, z: mosque.z, y: 4 }, label: 'the Djinguereber mosque' })
}

// --- The season inside a settlement (design.md §19.13, point 120g) ------------
// The travel scene's Climate component does not run here, so the settlement
// derives the weather from its OWN coordinates. Overcast must dim the sun AND
// gray the dome: a dimmed sun under a bright blue sky reads as a bug. The
// §19.10 fire is a fixed point light, so its glow carries further for it.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })

  // Poll until the WHOLE season reading settles — sun, sky, tint and rain, the
  // values the checks below assert — and say whether it truly did (point 499).
  // Watching only `sun` over a 6 s window measured a half-lerped state on the
  // slower container host and blamed the product for it: dry grayMix 0.146 where
  // the preset is 0, wet sun 2.348 where the rains take it to 1.44. Given the
  // time, every one of these reaches its target exactly, so the lerp was never
  // the bug — the window was.
  const settle = async (label) => {
    const r = await waitForReadingStable(page, () => window.__placeSeason(), { settleMs: 500, samples: 3, requireChange: true, timeout: 60000 })
    check(`the ${label} settlement season reading settles before it is read`, r.settled, `after ${r.waitedMs} ms`)
    return r.value
  }
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(0))
  const dry = await settle('dry')
  await frame('110-village-season-dry', { place: 'maasai-village', label: 'the settlement in the dry season' })

  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
  const wet = await settle('wet')
  await frame('111-village-season-wet', { place: 'maasai-village', label: 'the settlement in the wet season' })

  check(
    'the dry-season settlement stands under the clear preset sky',
    dry.sky.grayMix === 0 && dry.sky.cloudBoost === 0,
    JSON.stringify(dry.sky),
  )
  check(
    'the rains dim the settlement sun and sky light',
    wet.sun < dry.sun - 0.5 && wet.hemi < dry.hemi,
    JSON.stringify({ dry: { sun: dry.sun, hemi: dry.hemi }, wet: { sun: wet.sun, hemi: wet.hemi } }),
  )
  check(
    'the rains gray the settlement dome and thicken its cloud deck',
    wet.sky.grayMix > 0.5 && wet.sky.cloudBoost > 0.5,
    JSON.stringify(wet.sky),
  )
  check(
    'the fire glow carries further under the overcast sun (§19.10)',
    14 / wet.sun > 14 / dry.sun,
    `fire-to-sun ratio dry ${(14 / dry.sun).toFixed(2)} -> wet ${(14 / wet.sun).toFixed(2)}`,
  )
  // Point 143: the settlement's own rain and flora, which were MISSING — the
  // rain field lived only in the travel scene and the tint only in the travel
  // terrain, so a player stood in a village at the peak of its rains and saw
  // neither. Both must now move with the season.
  check(
    'it rains inside the settlement in the wet season, and clears in the dry',
    wet.rain > 0.5 && dry.rain === 0,
    `rain wet ${wet.rain.toFixed(2)} -> dry ${dry.rain.toFixed(2)}`,
  )
  check(
    'the settlement ground/flora tint bleaches to straw and deepens to green',
    wet.tint > 0.75 && dry.tint < 0.25,
    `tint wet ${wet.tint.toFixed(2)} -> dry ${dry.tint.toFixed(2)}`,
  )
  await frame('114-village-rain', { place: 'maasai-village', label: 'the rain inside the settlement' })
  // Leave no forced weather behind for the checks below.
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))

  // A desert PORT never rains, on the real calendar, in any month — Cairo is
  // hyper-arid and wetnessAt returns 0 there. (The debug override deliberately
  // forces a season everywhere to test the renderer, so this uses real months.)
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  let cairoMaxRain = 0
  for (let m = 1; m <= 12; m++) {
    await page.evaluate(() => { const g = window.__game.getState(); if (g.placeId) g.leavePlace() })
    await page.evaluate((mm) => window.__game.getState().debugJumpToMonth(mm), m)
    await page.evaluate(() => window.__game.getState().enterPlace('cairo'))
    await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })
    await page.waitForTimeout(200)
    cairoMaxRain = Math.max(cairoMaxRain, await page.evaluate(() => window.__placeSeason().rain))
  }
  check('Cairo stays bone dry in every month (hyper-arid, no rain)', cairoMaxRain === 0, `max rain ${cairoMaxRain.toFixed(3)}`)
  // Restore what the panorama check below expects: standing in a DIRECTLY
  // entered place (place->place, no travel scene, so no capture). Enter without
  // leaving first, and reset the calendar.
  await page.evaluate(() => {
    const g = window.__game.getState()
    g.debugJumpToMonth(1)
    g.enterPlace('maasai-village') // from cairo, a direct place->place enter
  })
  await page.waitForFunction(() => !!window.__placeLayout, null, { timeout: 30000 })
}

// --- Travel panorama capture (design.md §2.5, point 81) -----------------------
// Entering from the travel scene captures the REAL surroundings as the
// first-person horizon: at the riverside Nubian village the Nile must show in
// the north/east sectors (direction-true), while a direct place->place enter
// (no travel scene) falls back to the geometry backdrop.
{
  const before = await page.evaluate(() => window.__placePanoramaActive ?? null)
  check('a direct enter without the travel scene falls back (no capture)', before === false, `active ${before}`)
  // Point 96 gate: this leave happens AFTER several settlement visits (the
  // suite has entered masai, swahili, capetown, timbuktu, mongo and cairo by
  // now) — exactly the recipe that used to freeze the main thread 13-16 s on
  // synchronous shader re-links. With the module-singleton meshes/materials/
  // CSM the travel programs survive the place visits, so the transition must
  // stay fluid.
  const leaveMs = await page.evaluate(async () => {
    const t0 = performance.now()
    window.__game.getState().leavePlace()
    await new Promise((resolve) => {
      const poll = () => {
        if (!window.__game.getState().placeId) requestAnimationFrame(() => resolve(null))
        else setTimeout(poll, 16)
      }
      poll()
    })
    return Math.round(performance.now() - t0)
  })
  check('leaving after several settlement visits stays fluid (point 96)', leaveMs < 3000, `${leaveMs} ms`)
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 15000 })
  // Point 227: the LEAVE capture (the traveller stands inside his own place's
  // approach ring on the first travel frames) must contain the surrounding
  // TERRAIN. It used to fire before the streamed chunk meshes mounted and
  // baked a terrainless band — only water sheets and landmarks — which a
  // re-entry then drew as a hard grey horizon line over the backdrop. The
  // capture is now gated on the committed chunk set, so the band's bottom
  // quarter (near ground at an inland village) must be opaque ground.
  {
    await page.waitForFunction(() => window.__placePanorama?.placeId === 'maasai-village', null, { timeout: 45000 }).catch(() => {})
    const leaveBand = await page.evaluate(async () => {
      if (window.__placePanorama?.placeId !== 'maasai-village' || !window.__panoCaptureForDump) return null
      const url = await window.__panoCaptureForDump()
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const cnv = document.createElement('canvas')
      cnv.width = img.width
      cnv.height = img.height
      const ctx = cnv.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, Math.floor(img.height * 0.75), img.width, Math.floor(img.height * 0.25)).data
      let opaque = 0
      const total = data.length / 4
      for (let i = 0; i < total; i++) if (data[i * 4 + 3] > 200) opaque++
      return { frac: opaque / total }
    })
    check(
      'the leave capture bakes the surrounding terrain into the band (point 227)',
      !!leaveBand && leaveBand.frac > 0.7,
      leaveBand ? `bottom-quarter opaque ${leaveBand.frac.toFixed(3)}` : 'no maasai capture',
    )
  }
  // Compass probe (point 90): a magenta pillar is injected due WEST of the
  // capture point for exactly this capture — seed-independent orientation
  // proof (real water shifts with each seed's dune cover).
  await page.evaluate(() => { window.__panoProbeOffset = { dx: -8, dz: 0 } })
  await page.waitForTimeout(2500) // travel scene mounts, frame loop runs
  await page.evaluate(() => { delete window.__placePanorama }) // fresh capture signal
  await page.evaluate(() => window.__game.getState().debugJumpTo(21.8, 31.65)) // approach ring
  // Wait for the CAPTURE ITSELF (the async readback hook names the place) —
  // under full-suite load the frame loop may need many seconds for it.
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'nubian-village', null, { timeout: 45000 }).catch(() => {})
  await page.evaluate(() => window.__game.getState().enterPlace('nubian-village'))
  await page.waitForFunction(() => window.__game.getState().placeId === 'nubian-village' && !!window.__placePlayer, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(2000)
  const pano = await page.evaluate(() => ({
    active: window.__placePanoramaActive ?? false,
    fractions: window.__placePanorama?.waterFractions ?? null,
  }))
  check('entering from the travel scene shows the captured panorama', pano.active === true, JSON.stringify(pano))
  // Points 92/181: with a capture active the silhouettes must still stand on
  // DRAWN ground. Anchoring them to the band's horizon-at-infinity (a hard
  // EYE_HEIGHT constant) put nothing under their feet — the town's ground disc
  // and the backdrop relief end below that line and the band showed through the
  // gap, so the animals hung in the sky. The ray probe measures the rendered
  // scene, which the old |y − EYE_HEIGHT| comparison never could.
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  await probeSilhouetteFooting(page, check, 'nubian-village (capture active)')
  const f = pano.fractions
  // The Nile must show as a clearly DIRECTIONAL water signal: real water
  // pixels overall, concentrated in some sectors while others stay dry
  // (which way the river bends around the village depends on the run's
  // camera height over the bank dunes — the geography itself is fixed).
  const total = f ? f.reduce((a, b) => a + b, 0) : 0
  const max = f ? Math.max(...f) : 0
  const min = f ? Math.min(...f) : 1
  // Water present with a leading sector; the strict east-west proof lives in
  // the rendered-pixel check below (the band mirror made per-sector ratios a
  // weak discriminator with the low camera).
  check(
    'the Nile shows as a water signal in the band',
    !!f && total > 0.003 && max > total * 0.3 && min >= 0,
    `sectors ${f ? f.map((x) => x.toFixed(4)).join('/') : 'n/a'}`,
  )
  await page.evaluate(() => { const p = window.__placePlayer; p.x = 0; p.z = 0; p.yaw = 0; p.pitch = 0.02 })
  await page.waitForTimeout(700)
  await frame('99-travel-panorama', { place: 'nubian-village', label: 'the surroundings panorama' })

  // Magenta-pillar orientation proof: the probe stood due west of the
  // capture point, so its colour must show looking WEST and not EAST.
  const countMagenta = async () => {
    const buf = await page.screenshot()
    const crop = await sharp(buf).extract({ left: 100, top: 250, width: 1240, height: 380 }).raw().toBuffer({ resolveWithObject: true })
    const { data, info } = crop
    let hit = 0
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * info.channels]
      const g = data[i * info.channels + 1]
      const b = data[i * info.channels + 2]
      if (r > 150 && b > 150 && g < 90) hit++
    }
    return hit
  }
  // Condition-based probing: poll until the pillar shows (west) or the
  // window ends (east must stay empty) — fixed sleeps starve under load.
  const magentaPx = async (yaw, pollMs) => {
    await page.evaluate((y) => { const p = window.__placePlayer; p.x = 0; p.z = 0; p.yaw = y; p.pitch = 0.02 }, yaw)
    const deadline = Date.now() + pollMs
    let best = 0
    do {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120))))
      best = Math.max(best, await countMagenta())
      if (best > 200) break
    } while (Date.now() < deadline)
    return best
  }
  const westProbe = await magentaPx(Math.PI / 2, 20000)
  const eastProbe = await magentaPx(-Math.PI / 2, 2500)
  await page.evaluate(() => { delete window.__panoProbeOffset })
  check(
    'the band is compass-true: a probe placed due west shows west, not east',
    westProbe > 200 && eastProbe < westProbe / 10,
    `west ${westProbe}px, east ${eastProbe}px`,
  )
}

// --- Silhouette footing in Cairo, capture active (point 181) -------------------
// The REPORTED case: Cairo carries the Giza skyline and its captured band shows
// the pyramids and the Nile below the horizon line, so a silhouette anchored to
// that line hung in the sky over a pyramid flank. Re-enter Cairo out of the
// travel scene — the only way to get a live capture — and probe the footing.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  await page.evaluate(() => window.__game.getState().debugJumpTo(30.05, 31.55)) // Cairo's approach ring
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'cairo', null, { timeout: 60000 }).catch(() => {})
  await page.evaluate(() => window.__game.getState().enterPlace('cairo'))
  await page.waitForFunction(() => window.__game.getState().placeId === 'cairo' && !!window.__placePlayer, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(2500)
  const capActive = await page.evaluate(() => window.__placePanoramaActive ?? false)
  check('re-entering Cairo from the travel scene shows the captured band', capActive === true, `active ${capActive}`)
  await page.waitForFunction(() => Object.keys(window.__placePanoramaWildlifeInfo ?? {}).length >= 3, null, { timeout: 15000 }).catch(() => {})
  await probeSilhouetteFooting(page, check, 'cairo (capture active, Giza skyline)')
  // Human-viewable evidence: aim at a silhouette and shoot it against the band.
  const aimedAt = await page.evaluate(() => {
    const it = Object.values(window.__placePanoramaWildlifeInfo ?? {}).filter((w) => w.visible)[0]
    if (!it) return null
    const p = window.__placePlayer
    const r = (window.__placeLayout?.radius ?? 40) * 0.9
    const d = Math.hypot(it.x, it.z) || 1
    p.x = (it.x / d) * r
    p.z = (it.z / d) * r
    p.pitch = 0
    p.yaw = Math.atan2(-(it.x - p.x), -(it.z - p.z))
    return { x: it.x, z: it.z, y: it.y }
  })
  await page.waitForTimeout(800)
  // The silhouette itself is the subject — it stands far past the walkable disc,
  // so its own reported height is what has to be projected, not the ground.
  await frame(
    '136-cairo-silhouette-footing',
    aimedAt ? { local: aimedAt, label: 'the panorama silhouette on its ground line' } : { place: 'cairo', label: 'the Cairo panorama (no silhouette to aim at)' },
  )
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = 0
    p.z = 0
  })
}

// --- Settlement fabric per plan (design.md §2.6/§4.5) -------------------------
// Screenshot evidence of the port/village difference: the Congo street
// village's single axis (101) vs Cairo's organic lane fabric (102); the
// masai ring already shows in shot 98.
for (const [placeId, shot] of [
  ['mongo-village', '101-street-village-plan.png'],
  ['cairo', '102-cairo-lane-plan.png'],
]) {
  await page.evaluate((id) => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
    g.enterPlace(id)
  }, placeId)
  await page
    .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, placeId, { timeout: 30000 })
    .catch(() => {})
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__ui.getState().toggleMap())
  await page.waitForTimeout(400)
  const fabric = await page.evaluate(() => ({
    plan: !!document.querySelector('.map-place-plan'),
    paths: window.__placeLayout.paths.length,
    dwellings: window.__placeLayout.dwellings.length,
  }))
  await frame(shot.replace(/\.png$/, ''), { element: '.map-place-plan', label: `the ${placeId} town plan` })
  check(`${placeId}: the town plan draws the plan fabric`, fabric.plan && fabric.dwellings >= 6, JSON.stringify(fabric))
  await page.evaluate(() => window.__ui.getState().toggleMap())
  await page.waitForTimeout(200)
}

// --- Sphinx at travel scale (design.md §4.4, point 91) -------------------------
// The Giza field's Sphinx is a modelled couchant lion now; screenshot it from
// the travel camera just south of the field (the skyline-scale view is shot
// 100 above).
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    window.__ui.getState().setTravelZoom(0.25) // closest zoom, sphinx readable
    window.__game.getState().debugJumpTo(29.955, 30.67) // just south-east of the field
  })
  await page.waitForTimeout(2500) // travel scene settles, landmark chunk streams in
  const giza = await page.evaluate(() => window.__culturalLandmarks)
  check('the Giza field (with the Sphinx) is mounted at travel scale', !!giza?.ids?.includes('giza'), JSON.stringify(giza))
  // Giza's own position (the marker jumped to in the block below), not the
  // standpoint: the frame claims the field, so the field must be in the picture.
  await frame('103-giza-sphinx-travel', { world: { lat: 29.98, lon: 30.59 }, label: 'the Giza field with the Sphinx' })
  await page.evaluate(() => window.__ui.getState().setTravelZoom(0.5))
}

// --- Walkable Giza monument site (design.md §4.4, point 273) -------------------
// Jump onto the Giza marker so the "Space to enter" hint arms, confirm entry
// with the Space use key, then check that the three great pyramids and the
// sand-buried Sphinx render as collidable masses on the walkable plateau —
// with a screenshot standing back from the cluster.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  // Giza's river-cleared position (src/world/geo.ts). Jumping onto the marker
  // arms the enter hint; a Space press then confirms entry (design.md §2.3).
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.98, 30.59))
  await page.waitForFunction(() => window.__ui.getState().enterPlaceId === 'giza', null, { timeout: 15000 })
  const gizaPrompt = await page.evaluate(() => window.__ui.getState().prompt ?? '')
  check('the enter hint arms and names Giza (discovered, localized)', /Giza|Gizeh/.test(gizaPrompt), gizaPrompt)
  // Wait for the approach capture (points 227/335): the band may only be shot
  // once the terrain ring around the capture point is committed, so entering
  // before it lands would leave the monument on the geometry backdrop and make
  // the horizon check below vacuous.
  await page.waitForFunction(() => window.__placePanorama?.placeId === 'giza', null, { timeout: 60000 }).catch(() => {})
  // Re-set the live position right before the press (Space re-derives from it).
  await page.evaluate(() => window.__game.getState().debugJumpTo(29.98, 30.59))
  await page.keyboard.press('Space')
  await page.waitForFunction(
    () => window.__game.getState().placeId === 'giza' && !!window.__placeLayout && !!window.__placeMonuments,
    null,
    { timeout: 30000 },
  )
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await waitForStable(page)
  const site = await page.evaluate(() => ({
    mode: window.__game.getState().mode,
    monuments: window.__placeMonuments,
    colliders: window.__placeLayout?.colliders?.length ?? 0,
    interactives: window.__placeLayout?.interactives?.length ?? 0,
  }))
  check('Space enters the walkable Giza site', site.mode === 'place', JSON.stringify({ mode: site.mode }))
  check(
    'the three great pyramids and the buried Sphinx render',
    site.monuments?.pyramids === 3 && site.monuments?.sphinxBuried === true,
    JSON.stringify(site.monuments),
  )
  check(
    'the monuments are collidable and the site has no trade/elder',
    site.colliders >= 4 && site.interactives === 0,
    JSON.stringify({ colliders: site.colliders, interactives: site.interactives }),
  )
  // Stand at the arrival standpoint, look north over the cluster, and shoot.
  // The APPROACH distance, not the radius (point 390 widened the disc for the
  // desert; the view of the pyramid row must not widen with it).
  await page.evaluate(() => {
    const p = window.__placePlayer
    p.x = 0
    p.z = window.__placeLayout?.spawnZ ?? 50
    p.yaw = 0 // yaw 0 faces −Z (north), toward the pyramids
  })
  await page.waitForTimeout(1000)
  const siteBuf = await frame('139-giza-walkable-site', { place: 'giza', label: 'the walkable Giza plateau' })

  // Point 273: the plateau must read as warm DESERT SAND, not a pale, cool,
  // wavy parchment. Sample the near foreground (the bottom-centre strip, always
  // ground) and assert the mean is a warm sand tone: clearly warm (r > g > b, a
  // real r−b spread) and not the washed-out pale grey the old port-earth ground
  // showed on the open disc.
  {
    const meta = await sharp(siteBuf).metadata()
    const W = meta.width
    const H = meta.height
    const cw = Math.round(W * 0.4)
    const { data, info } = await sharp(siteBuf)
      .extract({
        left: Math.round(W / 2 - cw / 2),
        top: Math.round(H * 0.84),
        width: cw,
        height: Math.round(H * 0.12),
      })
      .raw()
      .toBuffer({ resolveWithObject: true })
    let rs = 0
    let gs = 0
    let bs = 0
    const n = info.width * info.height
    for (let i = 0; i < n; i++) {
      rs += data[i * info.channels]
      gs += data[i * info.channels + 1]
      bs += data[i * info.channels + 2]
    }
    const r = rs / n
    const g = gs / n
    const b = bs / n
    check(
      'the walkable Giza ground reads as warm desert sand (point 273)',
      r > g && g > b && r - b > 22 && r > 120,
      `mean ground rgb ${r.toFixed(0)}/${g.toFixed(0)}/${b.toFixed(0)}`,
    )
  }

  // Point 335: no FOREIGN flat band across the horizon. The reported picture
  // showed a long grey/silver strip along the horizon line, with the desert's
  // own dunes and ridge visible above AND below it. The monument is a late
  // third place kind, so first pin that it takes the band path at all.
  {
    const bandActive = await page.evaluate(() => window.__placePanoramaActive ?? false)
    check(
      'the monument site shows its captured travel band like any settlement (point 335)',
      bandActive === true,
      `band active ${bandActive}`,
    )

    // The gate, measured per PIXEL ROW on the artefact that carries the defect.
    //
    // What made the strip foreign was a HOLE: the capture reached 900 wu while
    // the travel scene streams terrain to ~144, and the sea plane / river
    // ribbons / lake sheets have no such bound — so a column of the band ran
    // terrain, then NOTHING (the far field past the window), then a lone water
    // sheet floating at the top. Drawn over the geometry backdrop that hole let
    // the backdrop's relief through above and below the sheet, which is exactly
    // the reported picture. A column of real surroundings can never do that:
    // ground is contiguous from the horizon down, so every opaque run is ONE
    // run. Counting columns whose opaque rows are split by a transparent gap
    // therefore isolates the defect with no assumed tone, row or distance.
    //
    // (The frame-level reading — a flat non-ground strip sandwiched between
    // ground — cannot be the gate: east of Giza the world really does put the
    // Red Sea and the trimmed Arabian shelf on the horizon, and that reads the
    // same way while being the surroundings the band is meant to show.)
    const bandGaps = await page.evaluate(async () => {
      if (!window.__panoCaptureForDump) return null
      const url = await window.__panoCaptureForDump()
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      const OPAQUE = 40
      let split = 0
      let worst = 0
      for (let x = 0; x < c.width; x++) {
        let first = -1
        let last = -1
        for (let y = 0; y < c.height; y++) {
          if (d[(y * c.width + x) * 4 + 3] > OPAQUE) {
            if (first < 0) first = y
            last = y
          }
        }
        if (first < 0) continue
        let clear = 0
        for (let y = first; y <= last; y++) if (d[(y * c.width + x) * 4 + 3] <= OPAQUE) clear++
        if (clear > 0) {
          split++
          if (clear > worst) worst = clear
        }
      }
      return { width: c.width, splitColumns: split, worstGapRows: worst }
    })
    // Measured on this very state: with the capture reaching 900 wu the band
    // split 231/3072 of Giza's columns (and 168/3072 of Cairo's — the defect was
    // never Giza-only, just most visible on an open plateau), gaps up to 11 rows;
    // bounded to the committed ring it splits none, and a settlement's worst is
    // 3 columns of one-row silhouette antialiasing.
    check(
      'the Giza band holds no floating strip over a hole in the surroundings (point 335)',
      bandGaps !== null && bandGaps.splitColumns / bandGaps.width < 0.02,
      bandGaps === null ? 'no capture to read' : `${bandGaps.splitColumns}/${bandGaps.width} columns split, worst gap ${bandGaps.worstGapRows} rows`,
    )

    // Point 381: the seam between the walkable ground and the §2.5 panorama
    // must be CLOSED. The reported picture had the plateau end in a hard
    // straight edge and give way to the captured band's low rows and the sky
    // behind them — because the geometry backdrop sank up to 6 units below the
    // ground plane just past the disc rim and never rose back into the eye's
    // grazing line inside its own reach.
    //
    // Read the rendered scene, not the formula: from each standpoint sweep the
    // elevation upward through the horizon and record which surface the frame
    // draws. A closed horizon reads ground-disc → landscape-backdrop → band/sky.
    // A torn one steps straight from the disc to the band or to nothing, which
    // is what this asserts against. Standpoints include the rim, where the
    // grazing line is shallowest and the tear was worst.
    {
      const siteR = await page.evaluate(() => window.__placeLayout?.radius ?? 60)
      const seamBad = []
      let seamProbed = 0
      for (const stand of [
        [0, 0],
        [0, siteR * 0.8],
        [siteR * 0.8, 0],
      ]) {
        await page.evaluate(([x, z]) => {
          const p = window.__placePlayer
          p.x = x
          p.z = z
          p.pitch = 0
        }, stand)
        // Let the camera follow the teleport: the ray probe casts from IT.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const res = await page.evaluate(() => {
          const cam = window.__placeCamera
          const bad = []
          let probed = 0
          for (let ai = 0; ai < 24; ai++) {
            const yaw = (ai / 24) * Math.PI * 2
            const seq = []
            for (let i = 0; i <= 60; i++) {
              const t = ((-6 + i * 0.1) * Math.PI) / 180
              const dx = -Math.sin(yaw) * Math.cos(t)
              const dz = -Math.cos(yaw) * Math.cos(t)
              const dy = Math.sin(t)
              const L = 3500
              const h = window.__placeRayHit(cam.position.x + dx * L, cam.position.y + dy * L, cam.position.z + dz * L)
              const name = h.hitDistance == null ? 'nothing' : h.hitName
              if (seq[seq.length - 1] !== name) seq.push(name)
            }
            probed++
            const disc = seq.indexOf('ground-disc')
            if (disc < 0) continue // a building or monument fills this bearing
            const next = seq[disc + 1]
            if (next === 'panorama-band' || next === 'nothing' || next === undefined) {
              bad.push({ yawDeg: Math.round((yaw * 180) / Math.PI), seq })
            }
          }
          return { probed, bad }
        })
        seamProbed += res.probed
        for (const b of res.bad) seamBad.push({ stand, ...b })
      }
      check(
        'the walkable ground meets the panorama with no torn horizon (point 381)',
        seamProbed > 0 && seamBad.length === 0,
        `${seamProbed} bearings probed, ${seamBad.length} torn${seamBad.length ? ' — ' + JSON.stringify(seamBad.slice(0, 3)) : ''}`,
      )
    }

    // Human-viewable evidence from two standpoints on the site.
    const radius = await page.evaluate(() => window.__placeLayout?.radius ?? 60)
    const posts = [
      ['south rim', 0, radius * 0.75, Math.PI / 2],
      ['east rim', radius * 0.7, 0, Math.PI],
    ]
    let shot = 0
    for (const [, px, pz, yaw] of posts) {
      await page.evaluate(
        ([x, z, y]) => {
          const p = window.__placePlayer
          p.x = x
          p.z = z
          p.yaw = y
          p.pitch = 0
        },
        [px, pz, yaw],
      )
      await page.waitForTimeout(600)
      shot++
      await frame(`141-giza-horizon-${shot}`, { place: 'giza', label: 'the Giza horizon from the site rim' })
    }

    // Point 390: the walkable sand must reach to where the PICTURE stops
    // offering ground. The desert around the plateau runs unbroken to the
    // horizon, so the old 60 m disc ended the world ~18 m past the outermost
    // mass — the player met an invisible wall (or was thrown back to the
    // bird's-eye view) while standing on the same sand that kept going.
    //
    // The exact radius is pinned in the Vitest layer (it is DERIVED from the
    // §2.5 band); here only the live shape is asserted, plus the picture from
    // the two standpoints the point asks for.
    {
      // Settle on the app's OWN clock (rendered frames), never a wall-clock
      // sleep: the camera follows the teleport on the next frame and the
      // temporal resolve needs a few more.
      const settleFrames = (n) =>
        page.evaluate(
          (k) =>
            new Promise((res) => {
              let i = 0
              const tick = () => (++i >= k ? res(true) : requestAnimationFrame(tick))
              requestAnimationFrame(tick)
            }),
          n,
        )
      const geo = await page.evaluate(() => ({
        radius: window.__placeLayout?.radius ?? 0,
        spawnZ: window.__placeLayout?.spawnZ ?? 0,
      }))
      check(
        'the Giza disc carries the open-plain radius and its own arrival distance (point 390)',
        geo.radius > 90 && geo.spawnZ > 0 && geo.spawnZ < geo.radius - 20,
        JSON.stringify(geo),
      )
      // At the walkable LIMIT the frame must still draw ground running outward:
      // disc first, then the geometry backdrop — never the band or nothing.
      // This is the standpoint the old disc turned into a wall in open sand.
      await page.evaluate((r) => {
        const p = window.__placePlayer
        p.x = 0
        p.z = r - 2
        p.yaw = Math.PI // yaw π faces +Z (south), straight out of the site
        p.pitch = 0
      }, geo.radius)
      await settleFrames(4)
      const edgeGround = await page.evaluate(() => {
        const cam = window.__placeCamera
        const seq = []
        for (let i = 0; i <= 60; i++) {
          const t = ((-6 + i * 0.1) * Math.PI) / 180
          const L = 3500
          const h = window.__placeRayHit(
            cam.position.x,
            cam.position.y + Math.sin(t) * L,
            cam.position.z + Math.cos(t) * L,
          )
          const name = h.hitDistance == null ? 'nothing' : h.hitName
          if (seq[seq.length - 1] !== name) seq.push(name)
        }
        return seq
      })
      const discAt = edgeGround.indexOf('ground-disc')
      check(
        'from the walkable edge the ground runs on to the backdrop (point 390)',
        discAt >= 0 && edgeGround[discAt + 1] === 'landscape-backdrop',
        JSON.stringify(edgeGround),
      )
      await settleFrames(30)
      await frame('390-giza-sand-edge', { place: 'giza', label: 'the open sand seen from the walkable edge' })
      // And from the monument row itself, looking out over the sand the player
      // may now cross. NOT from (0, 0): Khafre stands there (gizaSite.ts), so a
      // camera at the site's geometric centre sits INSIDE the pyramid and the
      // frame came out as a dark slit — a picture that did not show what its
      // name claimed. The standpoint is the open sand just south of the row.
      await page.evaluate(() => {
        const p = window.__placePlayer
        p.x = 0
        p.z = 30
        p.yaw = Math.PI
        p.pitch = 0
      })
      await settleFrames(30)
      await frame('390-giza-sand-open', { place: 'giza', label: 'the open sand seen from beside the monument row' })
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}
// --- Villager arms and gestures (point 479) ---------------------------------
// The figures were cones with sphere heads: nobody could show what he was
// talking about. What is checked here is what needs a real browser — that the
// arms the renderer DRAWS actually take the four poses, that a gesture ends on
// its own while the game runs, and that a figure at rest really stands at rest.
// The state machine itself (bounded duration, one gesture per figure, the
// return to rest) is pinned purely in src/render/gesture.test.ts.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  const gesturesLive = await page
    .waitForFunction(() => !!window.__placeGestures && !!window.__placeTalkers && !!window.__placeRayHit, null, {
      timeout: 40000,
    })
    .then(() => true)
    .catch(() => false)
  check('the conversing pair publishes its live gesture state', gesturesLive)
  if (gesturesLive) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))

    // Stand the player at conversational distance on a bearing whose line to the
    // pair is actually CLEAR — the settlement is dense, and a camera dropped on a
    // fixed bearing can end up inside a hut, which would photograph a wall and
    // prove nothing about an arm.
    const stood = await page.evaluate(() => {
      const p = window.__placePlayer
      const t = window.__placeTalkers
      if (!p || !t) return null
      const cx = (t[0].x + t[1].x) / 2
      const cz = (t[0].z + t[1].z) / 2
      const aim = (px, pz) => Math.atan2(-(cx - px), -(cz - pz))
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const px = cx + Math.sin(a) * 3.3
        const pz = cz + Math.cos(a) * 3.3
        p.x = px
        p.z = pz
        p.yaw = aim(px, pz)
        p.pitch = -0.06
        const hit = window.__placeRayHit(cx, 1.05, cz)
        if (hit.hitDistance == null || hit.hitDistance >= hit.targetDistance - 0.45) {
          return { x: px, z: pz, cx, cz, bearing: a }
        }
      }
      return null
    })
    check('a clear standpoint at conversational distance from the pair exists', stood != null)

    // --- the four poses, one frame each -------------------------------------
    // Long durations so the pose survives the shutter's own settling; the wait
    // is on the GESTURE's own clock, never on the wall clock.
    const HOLD = 12
    const poseAway = (p) =>
      Math.abs(p.left.pitch - 0.04) +
      Math.abs(p.right.pitch - 0.04) +
      Math.abs(p.left.yaw) +
      Math.abs(p.right.yaw) +
      Math.abs(p.lean) +
      Math.abs(p.turn)
    for (const kind of ['beckon', 'point', 'refuse', 'indicate']) {
      const who = 0
      await page.evaluate(([k, hold, w]) => window.__placeForceGesture(w, k, hold), [kind, HOLD, who])
      // Wait for the POSE to be open, not for a reading on the gesture's clock.
      // That clock is the frame delta CLAMPED to 0.1 s, so on a host rendering
      // at 1 FPS under load it advances ten times slower than the wall clock and
      // a threshold in gesture-seconds turns into minutes of waiting. The pose
      // is the thing the frame must show, and it is open after three frames.
      const opened = await page
        .waitForFunction(
          (w) => {
            const g = window.__placeGestures()[w]
            if (!g || !g.kind) return false
            const p = g.pose
            return (
              Math.abs(p.left.pitch - 0.04) + Math.abs(p.right.pitch - 0.04) + Math.abs(p.lean) > 0.5
            )
          },
          who,
          { timeout: 60000 },
        )
        .then(() => true)
        .catch(() => false)
      check(`the ${kind} gesture opens into a pose that can be seen`, opened)
      const shown = await page.evaluate((w) => window.__placeGestures()[w], who)
      check(
        `${kind}: the figure's arms leave the rest pose`,
        !!shown && shown.kind === kind && poseAway(shown.pose) > 0.5,
        shown ? `${shown.kind}, pose distance ${poseAway(shown.pose).toFixed(2)}` : 'no state',
      )
      // The partner keeps still: a gesture belongs to ONE figure.
      const partner = await page.evaluate(() => window.__placeGestures()[1])
      check(
        `${kind}: the listener is not gesturing at the same time`,
        !!partner && partner.kind === null,
        partner ? String(partner.kind) : 'no state',
      )
      if (stood) {
        await nextFrames(4)
        await frame(`479-gesture-${kind}`, {
          local: { x: stood.cx - 0.5, y: 1.15, z: stood.cz },
          label: `the villager's ${kind} gesture`,
        })
      }
    }

    // --- a gesture ENDS by itself, and rest really is rest -------------------
    // A SHORT gesture, so the end arrives within a bounded number of FRAMES even
    // where each frame is a second long.
    await page.evaluate(() => window.__placeForceGesture(0, 'point', 0.6))
    // Read the resting state IN the same poll that observes the end: the ambient
    // scheduler may start the next gesture a second and a half later, and a
    // separate read afterwards would race it.
    const restHandle = await page
      .waitForFunction(
        () => {
          const g = window.__placeGestures()[0]
          if (g.kind !== null) return null
          return { kind: g.kind, left: g.pose.left, right: g.pose.right, lean: g.pose.lean, turn: g.pose.turn }
        },
        null,
        { timeout: 60000 },
      )
      .catch(() => null)
    check('a gesture ends on its own — no figure is left holding a pose', restHandle != null)
    const atRest = restHandle ? await restHandle.jsonValue() : { kind: 'never ended', left: {}, right: {} }
    check(
      'and the figure stands at rest again: both arms down, no lean, no turn',
      atRest.kind === null &&
        atRest.lean === 0 &&
        atRest.turn === 0 &&
        atRest.left.yaw === 0 &&
        atRest.right.yaw === 0,
      JSON.stringify(atRest),
    )

    // --- sampled over the ambient conversation ------------------------------
    // A single instant proves nothing about a scheduler: sample across frames.
    const samples = []
    for (let i = 0; i < 30; i++) {
      samples.push(await page.evaluate(() => window.__placeGestures()))
      await nextFrames(4)
    }
    const kinds = ['beckon', 'point', 'refuse', 'indicate']
    const bad = samples.filter((s) => s.some((g) => g.kind !== null && !kinds.includes(g.kind)))
    check('every live gesture is one of the four kinds', bad.length === 0, `${bad.length} of ${samples.length} samples`)
    const overrun = samples.filter((s) => s.some((g) => g.kind !== null && g.t > g.duration))
    check('no gesture ever runs past its own duration', overrun.length === 0, `${overrun.length} overruns`)
    const both = samples.filter((s) => s[0].kind !== null && s[1].kind !== null)
    check('the pair takes turns — the two never gesture over each other', both.length === 0, `${both.length} overlaps`)
    const seen = new Set(samples.flatMap((s) => s.map((g) => g.kind)).filter(Boolean))
    check('the conversation actually gestures while it runs', seen.size >= 1, [...seen].join(', ') || 'none')
    const restBroken = samples.filter((s) =>
      s.some((g) => g.kind === null && (g.pose.lean !== 0 || g.pose.turn !== 0 || g.pose.left.yaw !== 0)),
    )
    check('a figure between gestures is exactly at rest', restBroken.length === 0, `${restBroken.length} samples`)
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}
// --- Cold-weather dress (design.md §19.13, point 120g) ---
// LAST in the file on purpose: it hops between settlements, and each leave
// remounts the travel scene, which makes the next enter capture a panorama —
// exactly the state the fallback check above asserts is absent.
// --- (checks) ------------------------
// The Zulu isipuku is the ONE period-sourced case (Mayr 1907): a cloak worn
// over the everyday dress in cold weather. So the Zulu village must dress for
// its austral winter and shed the cloak in its summer — while the peoples the
// research found no evidence for stay bare in any month, however cold their
// own ground gets. See src/systems/dress.ts for the per-people evidence.
{
  // NOTE: debugJumpToMonth is ONE-indexed (dayOfMonthJump clamps to 1..12 then
  // subtracts one; Hud.tsx calls it as i + 1). A zero-based probe lands a month
  // early and CLAMPS 0 to January — several checks here passed by luck that way,
  // because June is also austral winter and July is also the Sahel's rains.
  const dressAt = async (placeId, month) => {
    await page.evaluate(() => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
    })
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeDress, null, { timeout: 30000 })
    await page.waitForTimeout(300)
    return page.evaluate(() => window.__placeDress ?? null)
  }

  // Point 137: the six dressed peoples, each at its own village in its own
  // month, against the fifteen that never dress. The pure mapping is covered in
  // src/systems/dress.test.ts; this is the live half.
  const somaliKarif = await dressAt('somali-village', 8) // August — the karif on the Haud
  await frame('113-somali-karif-tobe', { place: 'somali-village', label: 'the Somali karif dress' })
  const somaliJilal = await dressAt('somali-village', 2) // February — jilal, dry and HOT
  const hausaHarmattan = await dressAt('hausa-village', 1) // January — the harmattan
  const hausaWet = await dressAt('hausa-village', 8) // August — the rains

  const zuluWinter = await dressAt('zulu-village', 7) // July — austral winter
  await frame('112-zulu-winter-cloaks', { place: 'zulu-village', label: 'the Zulu winter cloaks' })
  const zuluSummer = await dressAt('zulu-village', 1) // January — austral summer
  const maasaiWinter = await dressAt('maasai-village', 7) // the equator has no winter
  const sanWinter = await dressAt('san-village', 7) // Passarge's -5C Kalahari mornings

  check(
    'the Zulu wear the cold-weather cloak in their winter (Mayr, period source)',
    Array.isArray(zuluWinter?.cloaks) && zuluWinter.cloaks.length > 1,
    JSON.stringify(zuluWinter),
  )
  check(
    'and shed it in their summer — the cloak is the cold garment, not the dress',
    zuluSummer?.cloaks == null,
    JSON.stringify(zuluSummer),
  )
  check(
    'the equatorial Maasai never dress for a cold season they do not have',
    maasaiWinter?.cloaks == null,
    JSON.stringify(maasaiWinter),
  )
  check(
    'the San close the leather cloak in the Kalahari winter (Passarge)',
    Array.isArray(sanWinter?.cloaks),
    JSON.stringify(sanWinter),
  )
  check(
    'the Somali muffle the tobe over the HEAD in the karif (Swayne, period)',
    Array.isArray(somaliKarif?.cloaks) && somaliKarif.wear === 'head',
    JSON.stringify(somaliKarif),
  )
  check(
    'and wear it draped in jilal — the driest season is NOT the cold one',
    somaliJilal?.cloaks == null,
    JSON.stringify(somaliJilal),
  )
  check(
    'the Hausa zenne appears in the harmattan and is RANK-gated (Barth)',
    Array.isArray(hausaHarmattan?.cloaks) && hausaHarmattan.rankOnly === true,
    JSON.stringify(hausaHarmattan),
  )
  check(
    'and is gone in the rains — the Hausa answer the dust wind, not the calendar',
    hausaWet?.cloaks == null,
    JSON.stringify(hausaWet),
  )

  // Point 142 — "the young men are gone": a transhumant village visibly thins
  // in its away season while the children and the elder remain. The Maasai
  // direction is PERIOD (Thomson: up to the highlands in the DRY season).
  const walkersAt = async (placeId, month) => {
    await page.evaluate(() => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
    })
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeWalkers, null, { timeout: 30000 })
    return page.evaluate(() => window.__placeWalkers.states.length)
  }
  const maasaiDry = await walkersAt('maasai-village', 7) // July: at the highland camps
  const maasaiWet = await walkersAt('maasai-village', 4) // April: the rains, everyone home
  check(
    'the Maasai village thins in the dry season — the young men are gone (point 142)',
    maasaiDry < maasaiWet && maasaiDry >= 1,
    `walkers July ${maasaiDry} vs April ${maasaiWet}`,
  )
  // The warming fire (point 142, the §4.9 fire image): the village fire burns
  // harder where the place's own season is cold or dust-chilled.
  const blazeAt = async (placeId, month) => {
    await page.evaluate(() => { const g = window.__game.getState(); if (g.placeId) g.leavePlace() })
    await page.evaluate((m) => window.__game.getState().debugJumpToMonth(m), month)
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })
    return page.evaluate(() => window.__placeSeason().fireBlaze)
  }
  const tuaregJan = await blazeAt('tuareg-village', 1) // Ahaggar at 2110 m, Saharan winter
  const mongoJan = await blazeAt('mongo-village', 1) // the basin has no season
  check(
    'the village fire burns harder in a cold season, and not in the seasonless basin (point 142)',
    tuaregJan > 1.35 && mongoJan < 1.15,
    `blaze tuareg Jan ${tuaregJan.toFixed(2)} vs mongo Jan ${mongoJan.toFixed(2)}`,
  )

  const bembaJul = await walkersAt('bemba-village', 7)
  const bembaJan = await walkersAt('bemba-village', 1)
  check(
    'the sedentary Bemba never thin — no month empties them (the negative case)',
    bembaJul === bembaJan,
    `walkers July ${bembaJul} vs January ${bembaJan}`,
  )

  // The cook-fire's rain shelter (design.md §19.10, point 256). Under a downpour
  // the compound peoples' fire keeps a cook-shelter canopy and burns on, while a
  // dome-dweller's open fire is beaten down by the rain — the picture must show
  // the difference, not blaze on unaffected.
  const fireInRain = async (placeId) => {
    await page.evaluate(() => { const g = window.__game.getState(); if (g.placeId) g.leavePlace() })
    await page.evaluate((id) => window.__game.getState().enterPlace(id), placeId)
    await page.waitForFunction(() => !!window.__placeSeason, null, { timeout: 30000 })
    // Force a heavy downpour so the rain-response is at full strength, like the
    // settlement-season checks above.
    await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(1))
    // Poll the quantity the check actually reads. Waiting only for the SUN to
    // settle raced the override: in a fast-loading village the sun had not yet
    // started moving, so two successive reads matched, waitForStable returned
    // at once and the rain was still sampled at 0. Fail soft on the poll — the
    // assertion below judges the value, so a harness timeout can never mask a
    // real product failure.
    await page
      .waitForFunction(() => window.__placeSeason().rain > 0.5, null, { timeout: 15000 })
      .catch(() => {})
    await waitForStable(page, () => window.__placeSeason().sun, { settleMs: 200, timeout: 6000 })
    const s = await page.evaluate(() => window.__placeSeason())
    return { sheltered: s.fireSheltered, rain: s.rain, rainFactor: s.fireRainFactor }
  }
  const bembaFire = await fireInRain('bemba-village') // a cook-shelter people
  await frame('135-fire-cook-shelter-rain', { place: 'bemba-village', label: 'the cook shelter over the fire' })
  const maasaiFire = await fireInRain('maasai-village') // a dome-dweller, no canopy
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))
  check(
    'the compound village keeps its fire under a cook-shelter in the rain (point 256)',
    bembaFire.sheltered === true && bembaFire.rain > 0.5,
    `bemba sheltered=${bembaFire.sheltered} rain=${bembaFire.rain.toFixed(2)}`,
  )
  check(
    'the dome-dweller village has no canopy — its open fire is damped by the rain (point 256)',
    maasaiFire.sheltered === false && maasaiFire.rainFactor < bembaFire.rainFactor,
    `maasai sheltered=${maasaiFire.sheltered} factor=${maasaiFire.rainFactor.toFixed(2)} vs bemba ${bembaFire.rainFactor.toFixed(2)}`,
  )
}

// --- Campfire shadows (design.md §19.10): with the debug toggle ON, an occluder
// between the fire and the ground measurably darkens the ground behind it -------
{
  // A dry, weather-free village at a fixed standpoint facing the fire pit.
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.evaluate(() => {
    window.__ui.getState().setSeasonWetnessOverride(0)
    window.__game.getState().enterPlace('maasai-village')
  })
  await page.waitForFunction(() => !!window.__placePlayer && !!window.__placeCamera, null, { timeout: 30000 })
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    p.x = -3.5
    p.z = 8.0
    p.yaw = 0 // facing the fire pit at (-3.5, 2.5)
  })
  // The pairs below are read off PIXELS, so the scene must have finished drawing
  // (point 499). After 1.5 s it has not here: both probe points then landed on the
  // same unrendered ground and every contrast came out as exactly 0.0 — ON and OFF
  // alike, three stones each, which is a blind probe rather than a missing shadow.
  // Built, the same measurement reads OFF 8/-5/12 and ON 56/40/53, inside the
  // recorded ranges. Neither threshold below is touched.
  await waitForSceneBuilt(page)

  // The fire ring's stones ARE the visible occluders (light at the pit centre,
  // 1.1 m up): each stone's fire-shadow lands radially outward at ~1.2 m from
  // the pit centre, and its LIT twin sits at the SAME radius on the mid-angle
  // between two stones — same sun, same AO, same fire falloff, so the only
  // difference is the blocked light. All points lie inside the pit collider
  // (r 1.3), where no walker can stand on them; judging the WITHIN-frame
  // contrast (lit twin minus shadow point) makes the gate immune to global
  // frame drift (flame flicker, TRAA settling). Three stone pairs, 2-of-3
  // majority, so one walker crossing a sight line cannot flip the verdict.
  const firePairs = await page.evaluate(() => {
    const FIRE = [-3.5, 2.5]
    const R = 1.2
    const cam = window.__placeCamera
    const proj = (p) => {
      const v = cam.matrixWorldInverse.elements
      const x = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12]
      const y = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13]
      const z = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14]
      const e = cam.projectionMatrix.elements
      const w = e[3] * x + e[7] * y + e[11] * z + e[15]
      return [
        ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w) * 0.5 + 0.5,
        1 - (((e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * 0.5 + 0.5),
      ]
    }
    // Stones 1..3 of the 7-stone ring: their outward shadows face the camera.
    return [1, 2, 3].map((i) => {
      const a = (i / 7) * Math.PI * 2
      const m = ((i + 0.5) / 7) * Math.PI * 2
      return {
        stone: i,
        shadow: proj([FIRE[0] + Math.cos(a) * R, 0, FIRE[1] + Math.sin(a) * R]),
        lit: proj([FIRE[0] + Math.cos(m) * R, 0, FIRE[1] + Math.sin(m) * R]),
      }
    })
  })
  const lumAt = (raw, info, [nx, ny]) => {
    const px = Math.round(nx * info.width)
    const py = Math.round(ny * info.height)
    let sum = 0
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((py + dy) * info.width + (px + dx)) * info.channels
        sum += (raw[i] + raw[i + 1] + raw[i + 2]) / 3
      }
    return sum / 9
  }
  const fireContrasts = async () => {
    const { data, info } = await sharp(await page.screenshot()).raw().toBuffer({ resolveWithObject: true })
    return firePairs.map((p) => +(lumAt(data, info, p.lit) - lumAt(data, info, p.shadow)).toFixed(1))
  }

  // Campfire shadows are now level-driven (point 276): ON at the medium default,
  // so the OFF state must be FORCED via the debug flag, not assumed from the
  // default (which used to be off under point 289 alone).
  // Poll the cube-map tear-down/rebuild out rather than sleeping a fixed 1.5 s on
  // it: the measurement is the condition, so read it until two successive reads
  // agree, and judge the reading it settles on.
  const settledContrasts = async () => {
    let prev = await fireContrasts()
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 400))))
      const cur = await fireContrasts()
      if (cur.every((c, i) => Math.abs(c - prev[i]) <= 4)) return cur
      prev = cur
    }
    return prev
  }
  await page.evaluate(() => window.__ui.getState().setFireShadowsEnabled(false))
  const contrastOff = await settledContrasts()
  await page.evaluate(() => window.__ui.getState().setFireShadowsEnabled(true))
  const contrastOn = await settledContrasts()
  await frame('138-fire-shadows-on', { local: { x: -3.5, z: 2.5, y: 0.5 }, label: 'the fire pit and its stone ring' })
  await page.evaluate(() => {
    window.__ui.getState().setFireShadowsEnabled(false)
    window.__ui.getState().setSeasonWetnessOverride(null)
  })

  // Measured on both backends: OFF contrast 3-12, ON contrast 42-57.
  const majority = (xs, ok) => xs.filter(ok).length >= 2
  check(
    'fire shadows OFF (forced): the ground behind a ring stone is as lit as beside it',
    majority(contrastOff, (c) => c < 20),
    `lit-minus-shadow per stone [${contrastOff.join(', ')}]`,
  )
  check(
    'fire shadows ON: the ground behind a ring stone is measurably darker than beside it (design.md §19.10)',
    majority(contrastOn, (c) => c >= 25),
    `lit-minus-shadow per stone [${contrastOn.join(', ')}]`,
  )
}

// --- The settlement edge painted on the ground (design.md §2.6, point 352/488) ---
// The band must TELL THE TRUTH, so this measures it in the rendered picture and
// against the leave check itself, in EVERY kind of place and at BOTH ends of the
// year — a step visible only in the dry-season straw would be half a feature.
{
  // Ground crops: how far inside / outside the boundary each sample sits.
  const SAMPLES = [
    { name: 'inside', at: -5 },
    { name: 'boundary', at: 0 },
    { name: 'outside', at: 4 },
  ]

  /** Project a ground point through the live place camera (point 172/375: the
   *  picture decides where a crop sits, never an assumed screen position). */
  const groundPixel = (x, z) =>
    page.evaluate(
      ([px, pz]) => {
        const cam = window.__placeCamera
        if (!cam) return null
        const apply = (e, v) => [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
        const eye = apply(cam.matrixWorldInverse.elements, [px, 0, pz, 1])
        const clip = apply(cam.projectionMatrix.elements, eye)
        if (!(clip[3] > 0)) return null
        return { x: clip[0] / clip[3], y: clip[1] / clip[3] }
      },
      [x, z],
    )

  /** A bearing whose corridor across the boundary is free of buildings, fences,
   *  rocks and plants — a hut in a crop would measure the hut, not the ground. */
  const clearBearing = () =>
    page.evaluate(() => {
      const L = window.__placeLayout
      const r = L.radius
      const near = (x, z, ax, az, d) => Math.hypot(x - ax, z - az) < d
      const blocked = (ax, az) => {
        for (const c of L.colliders ?? []) {
          if (c.kind === 'segment') {
            if (near(c.x1, c.z1, ax, az, 4) || near(c.x2, c.z2, ax, az, 4)) return true
          } else if (near(c.x, c.z, ax, az, (c.r ?? Math.hypot(c.hx ?? 0, c.hz ?? 0)) + 4)) return true
        }
        for (const f of L.flora ?? []) if (near(f.x, f.z, ax, az, 4)) return true
        for (const rk of L.rocks ?? []) if (near(rk[0], rk[1], ax, az, 4)) return true
        return false
      }
      for (let i = 0; i < 180; i++) {
        const b = (i / 180) * Math.PI * 2
        let ok = true
        for (let d = r - 9; d <= r + 6 && ok; d += 1.5) {
          if (blocked(Math.cos(b) * d, Math.sin(b) * d)) ok = false
        }
        if (ok) return b
      }
      return null
    })

  /** Mean luminance of a crop centred on a ground point. */
  const groundLuma = async (buf, ndc, w, h) => {
    const view = page.viewportSize()
    const left = Math.round(((ndc.x + 1) / 2) * view.width - w / 2)
    const top = Math.round(((1 - ndc.y) / 2) * view.height - h / 2)
    if (left < 0 || top < 0 || left + w > view.width || top + h > view.height) return null
    const { data, info } = await sharp(buf).extract({ left, top, width: w, height: h }).raw().toBuffer({ resolveWithObject: true })
    let sum = 0
    for (let i = 0; i < info.width * info.height; i++) {
      sum += 0.35 * data[i * info.channels] + 0.5 * data[i * info.channels + 1] + 0.15 * data[i * info.channels + 2]
    }
    return sum / (info.width * info.height)
  }

  /** Aim the camera at a ground point ahead by bisecting the pitch on the
   *  PROJECTION — no assumption about the pitch convention or the field of view. */
  const aimAt = async (bearing, distance, standAt) => {
    await page.evaluate(
      ([b, stand]) => {
        const p = window.__placePlayer
        p.x = Math.cos(b) * stand
        p.z = Math.sin(b) * stand
        // Forward is -Z rotated by yaw, so this faces straight out of the place.
        p.yaw = Math.atan2(-Math.cos(b), -Math.sin(b))
        p.pitch = -0.2
      },
      [bearing, standAt],
    )
    const tx = Math.cos(bearing) * distance
    const tz = Math.sin(bearing) * distance
    let lo = -1.4
    let hi = 0.2
    let ndc = null
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      await page.evaluate((v) => { window.__placePlayer.pitch = v }, mid)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      ndc = await groundPixel(tx, tz)
      // pitch 0 is the horizon and + looks UP (design.md §17.5, point 392): a
      // target below the frame centre needs a LOWER pitch, so it is the lower
      // half that stays in play.
      if (!ndc) { hi = mid; continue }
      if (ndc.y > 0) lo = mid
      else hi = mid
      if (Math.abs(ndc.y) < 0.01) break
    }
    return ndc
  }

  /** Let the scene draw N frames — the app's own clock, never the wall clock. */
  const settleFrames = (frames = 3) =>
    page.evaluate(
      (n) =>
        new Promise((res) => {
          let i = 0
          const step = () => (++i >= n ? res() : requestAnimationFrame(step))
          requestAnimationFrame(step)
        }),
      frames,
    )

  const enterFor = async (id) => {
    await page.evaluate((want) => {
      const g = window.__game.getState()
      if (g.placeId) g.leavePlace()
      g.enterPlace(want)
    }, id)
    await page.waitForFunction(
      (want) => window.__game.getState().placeId === want && !!window.__placeLayout && !!window.__placeCamera,
      id,
      { timeout: 40000 },
    )
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    await settleFrames(8)
  }

  /** Read the crop until it stops moving: the settlement's own state settles on
   *  entry and the wet ground keeps SOAKING through a storm (§19.13), so the
   *  measurement waits on the picture rather than on a guessed number of
   *  milliseconds. Returns the settled reading (or the last one taken). */
  const settledLuma = async (ndc) => {
    let prev = null
    for (let i = 0; i < 40; i++) {
      await settleFrames(2)
      const cur = await groundLuma(await page.screenshot(), ndc, 150, 46)
      if (cur === null) return null
      if (prev !== null && Math.abs(cur - prev) < 0.3) return cur
      prev = cur
    }
    return prev
  }

  /** The band's OWN effect on a crop: its luminance with the edge drawn over
   *  its luminance with the edge switched off from the debug menu's own value,
   *  same camera, same frame content. Attribution, not correlation — the
   *  settlement's grass scatter also stops at the edge, and a plain
   *  inside-vs-outside difference could not tell the two apart. It doubles as
   *  the live proof that the calibratable strength lands without a reload. */
  const bandRatio = async (ndc) => {
    const shot = async (strength) => {
      await page.evaluate((s) => { window.__balance.placeEdgeBand.strength = s }, strength)
      await settleFrames(3)
      return groundLuma(await page.screenshot(), ndc, 150, 46)
    }
    // ON, OFF, ON — and the two ONs averaged. In the rains the ground SOAKS
    // while the shots are taken (the §19.13 wet accumulation keeps darkening
    // it), which biased a plain on/off pair by more than the edge itself; a
    // symmetric triple cancels that linear drift instead of racing it.
    const on1 = await shot(1)
    const off = await shot(0)
    const on2 = await shot(1)
    if (on1 === null || on2 === null || !(off > 0)) return null
    return (on1 + on2) / 2 / off
  }

  const readGround = async (id, wetness, seasonName, shoot) => {
    await enterFor(id)
    await page.evaluate((w) => window.__ui.getState().setSeasonWetnessOverride(w), wetness)
    const bearing = await clearBearing()
    if (bearing === null) {
      check(`${id} (${seasonName}): a clear ground corridor across the edge exists`, false, 'every bearing blocked')
      return null
    }
    const radius = await page.evaluate(() => window.__placeLayout.radius)
    // One standing spot for all three crops, so only the aim moves between them.
    const stand = radius - 6
    const out = {}
    for (const s of SAMPLES) {
      const ndc = await aimAt(bearing, radius + s.at, stand)
      if (!ndc || Math.abs(ndc.y) > 0.35 || Math.abs(ndc.x) > 0.5) {
        check(`${id} (${seasonName}): the ${s.name} ground crop is in the picture`, false, `ndc ${JSON.stringify(ndc)}`)
        return null
      }
      // Wait out the season change and, in the rains, the soak that keeps
      // building — on the PICTURE, not on a stopwatch — before the pair is taken.
      if (await settledLuma(ndc) === null) {
        check(`${id} (${seasonName}): the ${s.name} ground crop is measurable`, false, 'crop off-frame')
        return null
      }
      out[s.name] = await bandRatio(ndc)
      if (out[s.name] === null) {
        check(`${id} (${seasonName}): the ${s.name} ground crop could be measured`, false, 'crop off-frame')
        return null
      }
    }
    if (shoot) {
      // Human-viewable evidence, composed so the edge is READABLE rather than
      // merely present: standing just inside the line and looking ALONG it, so
      // the give-way runs across the frame with the swept ground on one side
      // and the open land on the other — a frame looking straight out over it
      // shows the band nearly edge-on and reads as a distance gradient.
      await page.evaluate(
        ([b, r]) => {
          const p = window.__placePlayer
          p.x = Math.cos(b) * (r - 2.5)
          p.z = Math.sin(b) * (r - 2.5)
          p.yaw = Math.PI - b // along the boundary's tangent
          // Shallow enough to keep the horizon in the frame: a picture of
          // nothing but ground shows the band without showing WHERE it is.
          p.pitch = -0.22
        },
        [bearing, radius],
      )
      await settleFrames(6)
      await frame(shoot.name, { place: id, label: shoot.label })
    }
    return out
  }

  const kinds = [
    { id: 'maasai-village', shoot: { name: '488-village-edge-band', label: 'the swept village ground giving way at the edge' } },
    { id: 'capetown', shoot: { name: '488-port-edge-band', label: 'the port ground giving way at the edge' } },
    { id: 'giza', shoot: { name: '488-monument-edge-band', label: 'the monument plateau giving way at the edge' } },
  ]
  for (const { id, shoot } of kinds) {
    for (const [wetness, seasonName] of [[0, 'dry'], [1, 'wet']]) {
      const r = await readGround(id, wetness, seasonName, wetness === 0 ? shoot : null)
      if (!r) continue
      const shown = `inside ×${r.inside.toFixed(3)} · boundary ×${r.boundary.toFixed(3)} · outside ×${r.outside.toFixed(3)}`
      check(
        `${id} (${seasonName}): the swept ground inside is measurably darkened, the open land outside is untouched`,
        1 - r.inside > 0.04 && Math.abs(1 - r.outside) < 0.025,
        shown,
      )
      check(
        `${id} (${seasonName}): the crop AT the boundary lies between the two — a give-way, not a step`,
        r.inside < r.boundary - 0.008 && r.boundary < r.outside - 0.008,
        shown,
      )
    }
  }
  await page.evaluate(() => window.__ui.getState().setSeasonWetnessOverride(null))

  // The truth check (design.md §2.6): walking straight out over the visible band
  // is the frame in which the place is left. Stepped in the REAL walk loop, not
  // teleported, and judged against the boundary the band draws at.
  {
    await enterFor('maasai-village')
    const bearing = (await clearBearing()) ?? 0
    const crossing = await page.evaluate(async (b) => {
      const p = window.__placePlayer
      const L = window.__placeLayout
      p.x = Math.cos(b) * (L.radius - 3)
      p.z = Math.sin(b) * (L.radius - 3)
      p.yaw = Math.atan2(-Math.cos(b), -Math.sin(b))
      p.pitch = 0
      const radius = L.radius
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
      const started = Date.now()
      let last = Math.hypot(p.x, p.z)
      while (Date.now() - started < 15000) {
        await new Promise((r) => requestAnimationFrame(r))
        if (!window.__game.getState().placeId) break
        last = Math.hypot(p.x, p.z)
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
      return { left: !window.__game.getState().placeId, last, radius }
    }, bearing)
    check(
      'walking straight over the painted edge is the frame in which the village is left (design.md §2.6)',
      crossing.left && Math.abs(crossing.last - crossing.radius) < 1.5,
      `left at ${crossing.last?.toFixed(2)} m of a ${crossing.radius} m boundary`,
    )
  }
}

// --- The children's game of tag (design.md §19.10, point 480/351) ------------
// What needs a real browser is that the RAF-driven chase is a GAME and not a
// route: the pure round is pinned in src/scenes/place/tagGame.test.ts, but only
// the live scene can show that the paths are not periodic, that the gap between
// chaser and quarry breathes, that the role really moves, and that a child is
// seen running out of steam. Sampled over an interval, and gated on a round
// actually being in play — the group idles between rounds by design, so a sample
// window straddling a break would judge the wrong thing.
{
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  const live = await page
    .waitForFunction(
      () => window.__game.getState().placeId === 'maasai-village' && !!window.__placeTag && !!window.__placeLayout,
      null,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false)
  check('the village children publish their live game of tag', live)
  if (live) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    const played = await page
      .waitForFunction(() => window.__placeTag().playing, null, { timeout: 40000 })
      .then(() => true)
      .catch(() => false)
    check('a round of tag is in play', played)

    // The window is an interval of GAME, read off the game's own clock — never a
    // count of frames. A frame budget buys wildly different amounts of game on an
    // idle machine and on one running three other suites, and 420 frames bought
    // barely 20 s here: the measured first catch is 6.6–11.3 s, so that window
    // could hold ONE catch or none, and "the chaser's identity changes at least
    // once" went red with no bug behind it. WINDOW_S is sized off that same
    // measurement to hold several catches on any machine, and the loop is capped
    // in frames so a scene that has stopped stepping FAILS LOUDLY on the check
    // below instead of spinning here forever.
    const WINDOW_S = 90
    const start = await page.evaluate(() => window.__placeTag().clock)
    const samples = []
    let clock = start
    for (let i = 0; i < 6000 && clock - start < WINDOW_S; i++) {
      const s = await page.evaluate(() => window.__placeTag())
      clock = s.clock
      samples.push(s)
      await nextFrames(3)
    }
    check(
      'the scene runs a full interval of the game to judge (its own clock, not a frame count)',
      clock - start >= WINDOW_S,
      `${(clock - start).toFixed(1)}s of ${WINDOW_S}s over ${samples.length} samples`,
    )
    const playing = samples.filter((s) => s.playing)
    check(
      'the group spends the interval playing rather than idling',
      playing.length > samples.length / 2,
      `${playing.length} of ${samples.length} samples`,
    )

    // Exactly ONE chaser at every playing sample, and nobody holds the role
    // during a break.
    const badChaser = samples.filter((s) =>
      s.playing ? !(s.chaser >= 0 && s.chaser < s.children.length) : s.chaser !== -1,
    )
    check(
      'exactly one child is IT while a round runs, and none between rounds',
      badChaser.length === 0,
      `${badChaser.length} of ${samples.length} samples`,
    )

    // The role MOVES: a game where one child chases for the whole interval is a
    // pursuit, not a game of tag.
    const chasers = new Set(playing.map((s) => s.chaser))
    check(
      "the chaser's identity changes at least once",
      chasers.size >= 2,
      `held by ${[...chasers].join(', ') || 'nobody'}`,
    )

    // The chase BREATHES: the gap to the quarry rises and falls repeatedly.
    const gaps = playing
      .filter((s) => s.target >= 0)
      .map((s) =>
        Math.hypot(
          s.children[s.chaser].x - s.children[s.target].x,
          s.children[s.chaser].z - s.children[s.target].z,
        ),
      )
    let turns = 0
    for (let i = 2; i < gaps.length; i++) {
      const a = gaps[i - 1] - gaps[i - 2]
      const b = gaps[i] - gaps[i - 1]
      if (a * b < 0) turns++
    }
    check(
      'the distance between chaser and quarry rises and falls repeatedly',
      turns >= 6,
      `${turns} turning points over ${gaps.length} readings`,
    )

    // A catch happens for a reason the viewer can SEE.
    const recovering = playing.some((s) => s.children.some((c) => c.effort === 'recover'))
    check('at least one child is seen slowing to get its breath back', recovering)

    // NOT A ROUTE: the headings cover a wide spread, and the group does not hold
    // one radius (a ring around a centre would be a route too).
    const bins = new Set()
    const radii = []
    for (const s of playing) {
      for (const c of s.children) {
        bins.add(Math.floor(((c.heading + Math.PI * 3) % (Math.PI * 2)) / (Math.PI / 6)))
        radii.push(Math.hypot(c.x, c.z))
      }
    }
    check(
      'their headings cover a wide spread rather than circling one centre',
      bins.size >= 9,
      `${bins.size} of 12 heading sectors`,
    )
    const mean = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length)
    const sd = Math.sqrt(radii.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, radii.length))
    check(
      'and they do not hold one radius around the settlement centre',
      sd > 1,
      `radius spread ${sd.toFixed(2)} m about ${mean.toFixed(1)} m`,
    )

    // Nobody pinned, nobody standing still, everybody where a walker may stand.
    const n = samples[0].children.length
    const travelled = Array.from({ length: n }, () => 0)
    for (let i = 1; i < samples.length; i++) {
      for (let k = 0; k < n; k++) {
        const a = samples[i - 1].children[k]
        const b = samples[i].children[k]
        if (a && b) travelled[k] += Math.hypot(b.x - a.x, b.z - a.z)
      }
    }
    check(
      'no child stands still for the whole interval',
      travelled.every((d) => d > 2),
      `travelled ${travelled.map((d) => d.toFixed(1)).join(', ')} m`,
    )
    const pinned = samples.filter((s) => s.children.some((c) => c.pinned > 3))
    check('no child is pinned against geometry', pinned.length === 0, `${pinned.length} samples`)
    const outside = await page.evaluate(() => {
      const L = window.__placeLayout
      return window.__placeTag().children.filter((c) => Math.hypot(c.x, c.z) > L.radius).length
    })
    check('every child stays inside the walkable settlement', outside === 0, `${outside} outside`)
    const reserves = samples.flatMap((s) => s.children.map((c) => c.reserve))
    check(
      'every sprint reserve stays within its bounds',
      reserves.every((r) => r >= 0 && r <= 1),
      `${Math.min(...reserves).toFixed(2)}..${Math.max(...reserves).toFixed(2)}`,
    )

    // The armed invariants stayed silent through all of it (point 207(i)).
    const asserts = await page.evaluate(() =>
      (window.__assertLog ?? [])
        .filter((a) => String(a.code).startsWith('tag-'))
        .map((a) => a.code + ': ' + a.detail),
    )
    check('the game fired none of its own invariant asserts', asserts.length === 0, asserts.join(' | '))

    // The picture. The frame must show THE CHASE, so the standpoint is chosen
    // the way the point-485 speaker shot chooses one rather than by a formula.
    // Two rules earned by looking at what the earlier tries actually produced:
    // aim at the CHASER AND ITS QUARRY — the pair IS the game, while the group
    // centroid drifts to wherever the stragglers are and framed a tree and an
    // empty paddock — and take the BEST bearing rather than the first passable
    // one, because the first clear sight line is as often the one looking out
    // of the village across open ground. Every bearing is ray-probed against
    // the RENDERED scene for an unobstructed line and scored by PROJECTING the
    // children through the live camera (§7.2), never by a radius.
    const standAt = async (bearing, back = 5.5) =>
      page.evaluate(
        ({ b, back }) => {
          const t = window.__placeTag()
          const p = window.__placePlayer
          if (!t || !p || !t.children.length) return null
          // The pair the game is about, falling back to the group's middle
          // between rounds.
          const a = t.chaser >= 0 ? t.children[t.chaser] : null
          const q = t.target >= 0 ? t.children[t.target] : null
          const cx = a && q ? (a.x + q.x) / 2 : t.children.reduce((s2, c) => s2 + c.x, 0) / t.children.length
          const cz = a && q ? (a.z + q.z) / 2 : t.children.reduce((s2, c) => s2 + c.z, 0) / t.children.length
          p.x = cx + Math.sin(b) * back
          p.z = cz + Math.cos(b) * back
          // Place-camera yaw 0 looks toward −Z, hence the +PI complement.
          p.yaw = Math.atan2(cx - p.x, cz - p.z) + Math.PI
          p.pitch = -0.05
          return { cx, cz }
        },
        { b: bearing, back },
      )
    /**
     * Is the game unobstructed from here, and how much of it is in frame?
     *
     * Projection ALONE is not enough, and that lesson cost a picture: a frame in
     * which the pair projects inside the viewport can still be a frame of the
     * huts they are standing behind. So each of the two is ray-probed against
     * the RENDERED scene on its own sight line, the way the point-485 speaker is
     * — the first surface drawn must be the CHILD ITSELF, which is what its
     * distance says. The ratio is bounded on both sides: a hut in front reads
     * far too near, and a ray that sails past a small figure hits the ground far
     * beyond it.
     */
    const readsFromHere = () =>
      page.evaluate(() => {
        const t = window.__placeTag()
        const cam = window.__placeCamera
        if (!t || !cam || !window.__placeRayHit) return { clear: false, inFrame: 0, pair: 0 }
        const a = t.chaser >= 0 ? t.children[t.chaser] : null
        const q = t.target >= 0 ? t.children[t.target] : null
        const cx = a && q ? (a.x + q.x) / 2 : t.children.reduce((s2, c) => s2 + c.x, 0) / t.children.length
        const cz = a && q ? (a.z + q.z) / 2 : t.children.reduce((s2, c) => s2 + c.z, 0) / t.children.length
        const h = window.__placeRayHit(cx, 0.75, cz)
        const clear = h.hitDistance == null || h.hitDistance >= h.targetDistance * 0.9
        // The SAME matrix math the frame shutter projects a `local` subject
        // with (scripts/verify/frameSubject.mjs) — no THREE in the page here.
        const apply = (e, v) =>
          [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
        const shows = (c) => {
          const eye = apply(cam.matrixWorldInverse.elements, [c.x, 0.5, c.z, 1])
          const clip = apply(cam.projectionMatrix.elements, eye)
          const w = clip[3]
          if (!(w > 0)) return false
          // Inside 0.85 of the frame rather than 1.0: a child clipped by the
          // very edge is in the picture by arithmetic and not by eye.
          if (!(Math.abs(clip[0] / w) <= 0.85 && Math.abs(clip[1] / w) <= 0.85 && clip[2] / w < 1)) return false
          // And it must actually be DRAWN there: chest height of a child, and
          // the first surface along that line has to be the child.
          const hit = window.__placeRayHit(c.x, 0.5, c.z)
          if (hit.hitDistance == null) return false
          const ratio = hit.hitDistance / hit.targetDistance
          // Close enough to read, too: a correctly-framed speck proves nothing.
          return ratio >= 0.8 && ratio <= 1.2 && hit.targetDistance <= 14
        }
        let inFrame = 0
        for (const c of t.children) if (shows(c)) inFrame++
        // The pair carries the picture: a frame holding two stragglers while the
        // chase runs off-screen shows village life, not a game of tag.
        const pair = (a && shows(a) ? 1 : 0) + (q && shows(q) ? 1 : 0)
        return { clear, inFrame, pair }
      })
    // The sweep is RETRIED as the game runs, and that is not a courtesy to a
    // slow machine: a chase that is momentarily boxed between two huts offers no
    // clear line from any bearing, which is a passing state of the game and not
    // a defect in it. A single sweep made that moment fail the whole suite. Two
    // ranges are tried before each wait, because a pair that has just sprinted
    // apart does not fit one frame at close range.
    //
    // THE STANDPOINT IS SHOT FROM WHERE IT WAS VALIDATED. Scoring the bearings
    // and then re-standing on the winner looked tidier and produced a frame of
    // the inside of a hut: re-standing recomputes the aim against a pair that
    // has run on, so the camera lands 5.5 m from somewhere nobody validated. The
    // reading is taken again after the shutter's own delay, too, because the
    // children keep running through it — and only a standpoint that still holds
    // both of them opens it.
    let stood = null
    let shotProbe = 'no clear standpoint in any sweep'
    for (let attempt = 0; attempt < 4 && !stood; attempt++) {
      for (const back of [5.5, 8.5]) {
        for (let k = 0; k < 16 && !stood; k++) {
          const at = await standAt((k / 16) * Math.PI * 2, back)
          if (!at) break
          await nextFrames(2)
          const r = await readsFromHere()
          if (!(r.clear && r.pair === 2)) continue
          // It reads from here NOW — does it still, once the shutter's settle
          // delay has passed? Only then is this the frame.
          await nextFrames(4)
          const still = await readsFromHere()
          if (still.pair === 2) {
            stood = at
            shotProbe = `attempt ${attempt + 1}, ${back} m, bearing ${k}/16: pair=${still.pair} inFrame=${still.inFrame}`
          }
        }
        if (stood) break
      }
      if (!stood) await nextFrames(30)
    }
    check(
      'the game is photographable: a clear standpoint holds the chaser and its quarry in frame',
      !!stood,
      shotProbe,
    )
    if (stood) {
      // The subject is read where the pair is NOW, not where it was when the
      // standpoint was picked: the settle delay above is eight frames of running
      // children, and the shutter must be told what it is actually looking at.
      const subject = await page.evaluate(() => {
        const t = window.__placeTag()
        if (!t || t.chaser < 0 || t.target < 0) return null
        const a = t.children[t.chaser]
        const q = t.children[t.target]
        return { x: (a.x + q.x) / 2, z: (a.z + q.z) / 2 }
      })
      const aim = subject ?? { x: stood.cx, z: stood.cz }
      await frame('480-village-tag', {
        local: { x: aim.x, y: 0.6, z: aim.z },
        label: 'the children playing tag',
      })
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
