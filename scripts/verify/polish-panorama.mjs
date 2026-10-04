// Headless polish verification, theme polish-panorama: the skyline and the
// panorama: the Giza skyline over Cairo, panorama wildlife and its footing, port
// skylines, the travel panorama capture, the Sphinx and the walkable Giza site
// (design.md §2.5/§4.4).
// Dev server only. Split out of polish.mjs by theme; the boot and the shared
// helpers live in ./_polish.mjs, and every section below owns its staging.
import { waitForStable } from './_browser.mjs'
import { capturePixels } from './frameSubject.mjs'
import { judgeFootingSeries, judgePitchSeries, MIN_SLOPED_SAMPLES } from './footingSeries.mjs'
import { judgeStanceSlip } from './stanceSlip.mjs'
import sharp from 'sharp'
import { section, check, probeSilhouetteFooting, page, frame, nextFrames, stepUntil, goToPlace, finishPolishSuite } from './_polish.mjs'

// --- Giza skyline behind Cairo (design.md §4.4, point 82) ----------------------
// In Cairo the great pyramids stand as the western skyline silhouette
// (point-69 pattern, like Cape Town's Table Mountain).
if (section('giza-skyline')) {
  // The section STAGES Cairo itself rather than relying on the boot standing
  // there: a no-op after the boot, the jump wherever this block runs later.
  await goToPlace('cairo')
  await page.waitForFunction(() => !!window.__placeSkyline, null, { timeout: 20000 }).catch(() => {})
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
  // walkable site). Prove no strongly red-dominant pixels remain anywhere in the
  // skyline frame (it holds the pyramid silhouette) — a red-granite stripe would
  // light many up. The sky is
  // warm haze (r≈g≈b-ish) and the pyramids are tawny (r>g>b but not RED), so a
  // true red band (r well above BOTH g and b) is the error signature.
  // A refused frame is its own red and leaves nothing to measure (point 1145).
  if (skyBuf) {
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
if (section('panorama-wildlife')) {
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
    // that dip — `drop` — and at most 0.2 above it.
    wInfo.length >= 3 && wInfo.every((w) => w.y >= w.visibleY - w.drop - 1e-3 && w.y <= w.visibleY + 0.2),
    `y vs line [${wInfo.map((w) => `${w.y.toFixed(2)}/${w.visibleY.toFixed(2)}-${(w.drop ?? 0).toFixed(2)}`).join(', ')}]`,
  )
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
  await probeSilhouetteFooting(page, check, 'maasai-village (no capture)')
  // Point 255 (3): the silhouettes must WALK the horizon, not glide along it.
  // Their stride phase rides the ground they cover on the ring, so over the same
  // interval each one's phase advance divided by its (scale-normalised, point 286)
  // gait speed and its cadence is the SAME constant — a wall-clock bob would
  // advance them all alike whatever their speed.
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
  // cos yaw)) or be zero, and at least one must actually advance. The reverted bug set the
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
  // never left the ground. A planted foot holds its spot while the body walks on;
  // the old over-driven cadence dragged it along at a large fraction of the
  // body's speed.
  //
  // Point 549 — THE SERIES IS RECORDED IN THE PAGE, ONE SAMPLE PER DRAWN FRAME.
  // The old sampler stepped the scene from Node, one `page.evaluate` per frame,
  // until some animal had covered 5 % of its stride. The scene keeps drawing
  // through those round trips, so the interval was as long as the host was slow —
  // and on this container it grew long enough for the tracked leg to lift, swing
  // and be planted a whole cycle on between two reads. Asking only whether the
  // leg was down at each END then read that replanting as one huge slip: the same
  // unchanged scene reported 0.278, 0.603, 0.727, 0.972 and 1.549 across eight
  // attempts on an idle host, against a bar of 0.25. Recording every frame inside
  // the page makes the sample window the frame it actually is, and lets the
  // judgment demand an UNBROKEN stance across the whole interval, so a wrap is
  // not filtered out — it cannot occur. The judgment itself is the pure,
  // Vitest-covered `judgeStanceSlip` (scripts/verify/stanceSlip.mjs). The
  // renderer now keeps a stance contact in world space even as its body turns,
  // so the judgment reads that world travel directly; compensating for a rigid
  // body's yaw would manufacture movement for a contact whose coordinates did
  // not change.
  //
  // MEASURED SPREAD (19.08.2026, this section run six consecutive times on the
  // branch state, three passes per backend, against the 0.25 bar and the
  // eight-interval enough-gate). Settlement walker (goat), the lane that was
  // red: WebGL 2 — 35/36/36 intervals, worst foot/body travel 0.000 in every
  // pass, body turn up to 0.299/0.247/0.292 rad; WebGPU — 13/15/18 intervals,
  // worst 0.000 in every pass, turn up to 0.433/0.815/0.595 rad. Panorama
  // silhouette over the same runs: WebGL 2 48/50/49 intervals, worst
  // 0.025/0.026/0.026; WebGPU 49/50/47 intervals, worst 0.023/0.023/0.025. The
  // interval population therefore clears the gate on both backends with room
  // (13 is the thinnest run), the goat's contact does not move at all while the
  // body turns up to 0.8 rad over it, and the silhouette's tenth-of-the-bar
  // residue is the only travel any pass measured.
  {
    /** Record the tracked walkers frame by frame, inside the page: one round trip
     *  for the whole series, so no sample window can be stretched by the host.
     *  The reader is named rather than passed as a function — a page-side `new
     *  Function` would be both a lint finding and an indirection for nothing. */
    const recordGait = (kind, frames, maxMs) =>
      page.evaluate(
        ([which, n, cap]) =>
          new Promise((res) => {
            const read = () => {
              const out = {}
              const info = (which === 'panorama' ? window.__placePanoramaWildlifeInfo : window.__placeGoatGait) ?? {}
              for (const k of Object.keys(info)) {
                const w = info[k]
                if (w.visible === false) continue
                out[k] = { x: w.x, z: w.z, yaw: w.yaw, foot: w.foot, stance: w.stance, stride: w.stride }
              }
              return out
            }
            const samples = []
            const t0 = performance.now()
            const step = () => {
              samples.push(read())
              if (samples.length >= n || performance.now() - t0 >= cap) return res(samples)
              requestAnimationFrame(step)
            }
            requestAnimationFrame(step)
          }),
        [kind, frames, maxMs],
      )

    const trackFeet = async (kind, label) => {
      // In chunks, so a fast host stops as soon as it has a verdict's worth of
      // intervals and a slow one still gets its walking time. The stop condition
      // is the MEASUREMENT, never a frame count: a goat crosses its pen at
      // ~0.12 units a second, so how many frames one stance lasts is the host's
      // business, not the check's.
      let samples = []
      let judged = judgeStanceSlip(samples)
      for (let chunk = 0; chunk < 4 && judged.intervals < 8; chunk++) {
        samples = samples.concat(await recordGait(kind, 300, 12000))
        judged = judgeStanceSlip(samples)
      }
      check(`${label}: the planted foot holds its ground spot while the body walks over it (point 300)`, judged.enough && judged.worst < 0.25, judged.detail)
    }
    await trackFeet('panorama', 'panorama silhouette')
    await trackFeet('goat', 'settlement walker (goat)')
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
if (section('panorama-slope-footing')) {
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
  // Leave the scene in maasai-village, as a whole run always has; every later
  // section stages its own place.
  await goTo('maasai-village')
}

// --- Port skyline landmarks (design.md §4.4 Part C) ---------------------------
// Cape Town: Table Mountain stands as a flat-topped massif behind the town.
if (section('port-skylines')) {
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
}

// --- Travel panorama capture (design.md §2.5, point 81) -----------------------
// Entering from the travel scene captures the REAL surroundings as the
// first-person horizon: at the riverside Nubian village the Nile must show as a
// directional water signal and an injected compass pillar proves the band
// direction-true, while a direct place->place enter (no travel scene) falls back
// to the geometry backdrop.
if (section('travel-panorama-capture')) {
  await goToPlace('maasai-village')
  const before = await page.evaluate(() => window.__placePanoramaActive ?? null)
  check('a direct enter without the travel scene falls back (no capture)', before === false, `active ${before}`)
  // Point 96 gate: in a whole run this leave happens AFTER several settlement
  // visits (maasai, bambara, swahili, pedi or sidama, capetown and cairo among
  // them; a single --section run stages none of them) — exactly the recipe that used to freeze the main thread 13-16 s on
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
    // Point 387 — red on `main` at "bottom-quarter opaque 0.000", i.e. NOTHING
    // opaque in the band at all. VERDICT: the PRODUCT was wrong, and neither the
    // bar nor the staging. The band really was empty: point 545 found the shot
    // compiling its pipelines asynchronously (0 of 92 objects ready at the
    // shutter, 0 draw calls) and all four sectors covering the whole band
    // because a per-sector renderer viewport is ignored when drawing into a
    // render target. Both are fixed in panoramaCapture.ts; the bar of 0.7 is
    // UNCHANGED.
    // MEASURED 07.08.2026, quiet machine: 1.000 on WebGL 2 and 1.000 on WebGPU —
    // the near ground fills the band's bottom quarter completely, so this
    // criterion is nowhere near its own edge either.
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
  // pixels overall with one leading sector (no sector is required to be dry;
  // which way the river bends around the village depends on the run's
  // camera height over the bank dunes — the geography itself is fixed).
  const total = f ? f.reduce((a, b) => a + b, 0) : 0
  const max = f ? Math.max(...f) : 0
  const min = f ? Math.min(...f) : 1
  // Water present with a leading sector; the strict east-west proof lives in
  // the rendered-pixel check below.
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
    const buf = await capturePixels(page, 'panorama magenta-pillar orientation')
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
  // window ends (east must stay under a tenth of west) — fixed sleeps starve
  // under load.
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
  // Point 387 — red on `main` at "west 0px, east 0px". BOTH probes read zero, so
  // the check was never reporting a MIRRORED band; it was reporting a BLANK one.
  // VERDICT: the PRODUCT was wrong — the same empty-capture defect as the leave
  // check above, fixed in panoramaCapture.ts by point 545 (synchronous pipeline
  // compile at the shutter, one square shot per sector copied into its own
  // column). The bar of 200 px, and the 10:1 west-over-east ratio, are UNCHANGED.
  // MEASURED 07.08.2026, quiet machine: west 34418 px / east 0 px on WebGL 2 and
  // west 54236 px / east 0 px on WebGPU. The west readings differ by backend
  // (different pillar coverage at the same aim), but both are two orders of
  // magnitude above the bar with the east side at exactly zero.
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
if (section('cairo-silhouette-footing')) {
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

// --- Sphinx at travel scale (design.md §4.4, point 91) -------------------------
// The Giza field's Sphinx is a modelled couchant lion now; screenshot it from
// the travel camera just south of the field (the skyline-scale view is shot
// 100 above).
if (section('sphinx-travel')) {
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
if (section('giza-site')) {
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
    'the monuments are collidable and the site has no trade and no chief',
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
  if (siteBuf) {
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
    // Measured before the bound: with the capture reaching 900 wu the band
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
    // South rim, then east rim.
    const posts = [
      [0, radius * 0.75, Math.PI / 2],
      [radius * 0.7, 0, Math.PI],
    ]
    let shot = 0
    for (const [px, pz, yaw] of posts) {
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

// --- Detailed animal models (work-order 1284) ----------------------------------
// The zebra, the antelope and the settlement goat are shaped models with face,
// horns/mane and jointed legs; the zebra and the gazelle carry their pelt
// marking. Per species one frame inside a settlement and one from the bird's-eye
// view at zoom 0.5 — judged by looking (is the species recognisable?). The goat
// lives only in the settlements, so it has no bird's-eye frame. Zebra and
// antelope stand in a settlement only as the panorama silhouettes, which the
// dev probe names by species.
if (section('animal-models')) {
  await goToPlace('maasai-village')
  await page.waitForFunction(() => Object.values(window.__placePanoramaWildlifeInfo ?? {}).filter((w) => w.visible).length >= 2, null, { timeout: 25000 }).catch(() => {})
  for (const species of ['zebra', 'antelope']) {
    const aimed = await page.evaluate((sp) => {
      const it = Object.values(window.__placePanoramaWildlifeInfo ?? {}).find((w) => w.visible && w.species === sp)
      if (!it) return null
      const p = window.__placePlayer
      const r = (window.__placeLayout?.radius ?? 40) * 0.9
      const d = Math.hypot(it.x, it.z) || 1
      p.x = (it.x / d) * r
      p.z = (it.z / d) * r
      p.pitch = 0
      p.yaw = Math.atan2(-(it.x - p.x), -(it.z - p.z))
      return { x: it.x, z: it.z, y: it.y }
    }, species)
    check(`a ${species} silhouette walks the settlement panorama`, !!aimed, aimed ? JSON.stringify(aimed) : 'none visible')
    if (!aimed) continue
    await nextFrames(3)
    // Re-read the walker at the shutter: it drifts along its ring.
    const at = await page.evaluate((sp) => {
      const it = Object.values(window.__placePanoramaWildlifeInfo ?? {}).find((w) => w.visible && w.species === sp)
      return it ? { x: it.x, z: it.z, y: it.y } : null
    }, species)
    await frame(`1284-${species}-settlement`, { local: at ?? aimed, label: `the ${species} silhouette on the settlement skyline` })
  }
  // A goat at close range and in PROFILE: the standpoint lies square to its
  // facing, on the side toward the herd's centre (inside the pen, away from
  // the fence and the people outside it).
  await page.waitForFunction(() => Object.keys(window.__placeGoatGait ?? {}).length > 0, null, { timeout: 15000 }).catch(() => {})
  const goat = await page.evaluate(() => {
    const p = window.__placePlayer
    const herd = Object.values(window.__placeGoatGait ?? {})
    if (!p || herd.length === 0) return null
    const g = herd[0]
    const cx = herd.reduce((s, h) => s + h.x, 0) / herd.length
    const cz = herd.reduce((s, h) => s + h.z, 0) / herd.length
    const sx = Math.cos(g.yaw ?? 0)
    const sz = -Math.sin(g.yaw ?? 0)
    const side = sx * (cx - g.x) + sz * (cz - g.z) >= 0 ? 1 : -1
    p.x = g.x + side * sx * 3.2
    p.z = g.z + side * sz * 3.2
    p.pitch = -0.15
    p.yaw = Math.atan2(-(g.x - p.x), -(g.z - p.z))
    return { x: g.x, z: g.z }
  })
  check('the settlement has goats to photograph', !!goat, goat ? JSON.stringify(goat) : 'no goats')
  if (goat) {
    await nextFrames(3)
    const g = await page.evaluate(() => {
      const herd = Object.values(window.__placeGoatGait ?? {})
      return herd[0] ? { x: herd[0].x, z: herd[0].z } : null
    })
    await frame('1284-goat-settlement', { local: { x: (g ?? goat).x, y: 0.4, z: (g ?? goat).z }, label: 'a settlement goat at close range' })
  }

  // Bird's-eye at zoom 0.5: a small herd of each species staged beside the
  // player in open savanna, the hunt held idle so nothing chases them off.
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 45000 })
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    window.__ui.getState().setTravelZoom(0.5)
    window.__game.getState().debugJumpTo(-2.2, 34.8)
  })
  await page.waitForFunction(() => !!window.__wildlife?.herdsRef?.current, null, { timeout: 30000 }).catch(() => {})
  // Let the jump settle on the app clock before staging the herds.
  await nextFrames(10)
  const staged = await page.evaluate(() => {
    const herds = window.__wildlife?.herdsRef?.current
    if (!herds) return null
    if (window.__lionHunt) {
      window.__lionHunt.state.mode = 'idle'
      window.__lionHunt.state.timer = 999
    }
    const p = window.__game.getState().pos
    const out = {}
    for (const [sp, dx] of [['zebra', 4], ['antelope', -4]]) {
      herds[sp] = herds[sp].filter((a) => Math.hypot(a.x - p.x, a.z - p.z) > 30)
      const group = [[0, 0], [1.6, 1.1], [0.8, -1.4]].map(([ox, oz], i) => ({ x: p.x + dx + ox * Math.sign(dx), z: p.z + oz, y: 0, rot: 0.6 + i, scale: 1, phase: i }))
      group[0].__shot = sp
      herds[sp].push(...group)
      out[sp] = { x: group[0].x, z: group[0].z }
    }
    return out
  })
  check('zebra and antelope staged in the bird\'s-eye view', !!staged, JSON.stringify(staged))
  if (staged) {
    for (const species of ['zebra', 'antelope']) {
      await nextFrames(4)
      // The lead animal where it stands at the shutter (the herd sim moves it).
      const at = (await page.evaluate((sp) => {
        const a = window.__wildlife?.herdsRef?.current?.[sp]?.find((x) => x.__shot === sp)
        return a ? { x: a.x, z: a.z } : null
      }, species)) ?? staged[species]
      await frame(`1284-${species}-birdseye-zoom05`, { world: { x: at.x, z: at.z }, label: `the ${species} herd at zoom 0.5` })
    }
  }
}

await finishPolishSuite()
