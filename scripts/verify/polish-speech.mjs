// Headless polish verification, theme polish-speech: speech and exchange inside a
// settlement: the hypothesis over the speaker, whose a note is, guessing a meaning,
// the Ctrl labels, the chief at his drummer and the given artefact (design.md
// §13.4/§17.8/§6).
// Dev server only. Split out of polish.mjs by theme; the boot and the shared
// helpers live in ./_polish.mjs, and every section below owns its staging.
import { waitForStable, waitForSceneBuilt } from './_browser.mjs'
import { captureFrame } from './frameSubject.mjs'
import { frameSpeakingDrums } from './drumFrame.mjs'
import { FUSE_CROWD_SHARE, FUSE_HARD, FUSE_TOLERANCE, judgeLabelFusion, mergeFusionReadings } from './labelFusion.mjs'
import { OUT, section, check, page, frame, nextFrames, stepUntil, goToPlace, finishPolishSuite } from './_polish.mjs'
// --- The hypothesis over the speaker's head (design.md §13.4, point 485) ------
// The lifetime and the note binding are pinned in the Vitest layer. What only a
// browser can answer is the ATTACHMENT: the note must ride on the FIGURE that
// speaks, not sit at a world coordinate. The delivered bug was exactly that —
// R3F keeps its objects' local matrices itself, so a group moved from a frame
// callback that does not publish the move is read at the position it was born
// with, and every label stood at the scene origin. Measured here against the
// figure's own projected anchor, in the SAME evaluate as the rendered label's
// DOM box, so no frame passes between deciding and measuring.
if (section('speech-hypothesis')) {
  // THE VILLAGE THE PLAYER LEARNS IN (work-order 1094). The label belongs to the
  // communication slice, and that slice runs in `ROCK_VILLAGE_ID` alone — judging
  // it over a maasai figure judged it where nobody in this PoC hears a word worth
  // a hypothesis. The axis that actually varies for the player is the world SEED,
  // which is drawn at every start; the village is not.
  await goToPlace('bambara-village')
  // A word the game speaks, not a hand-typed shape: one of the six four-syllable
  // words (RIVER in SHIPPED_VOCABULARY, src/communication/vocabulary.ts; its
  // meaning is rolled per run). A five-syllable literal survived the four-syllable rebuild here and
  // proved the label path for an utterance the game can no longer produce
  // (point 686); src/communication/verifySuiteUtterances.test.ts pins it now.
  const RIVER = 'ba-BA-ba-BA'
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
  // Two ranges, because standing 5 m INWARD of a figure can land the camera in a
  // hut — the probe then reads that wall, and a figure the player could plainly
  // walk up to is rejected for the geometry behind the lens. The nearer range is
  // tried before the candidate is given up on.
  const STAND_BACKS = [5, 3.5]
  /** Put the camera `back` in front of figure `i`, on the outward bearing, and
   *  look at it. Reads the figure's position LIVE, so it composes the shot on
   *  wherever the figure stands at this instant — which is the whole point of
   *  calling it more than once (point 1058). */
  const standBefore = (i, STAND_BACK) =>
    page.evaluate(
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
  /** Stand `back` in front of figure `i`, on the outward bearing, and report what
   *  the frame draws at its chest. */
  const aimAt = async (i, STAND_BACK) => {
    await standBefore(i, STAND_BACK)
    await nextFrames(2)
    return page.evaluate((idx) => {
      const figure = window.__speechProbeFigures?.[idx]
      if (!figure || !window.__placeRayHit) return null
      figure.updateWorldMatrix(true, false)
      const e = figure.matrixWorld.elements
      // THIS figure's chest, and against its position NOW — it may have walked on
      // since the pose was set. The height is taken from the group's own scale
      // rather than a flat metre: the children are barely 0.9 m tall (point 481),
      // so a metre above the feet sailed clean over every one of them and reported
      // the ground beyond as the obstruction — half the candidate list could never
      // qualify, whatever the picture showed.
      const scaleY = Math.hypot(e[4], e[5], e[6])
      const h = window.__placeRayHit(e[12], e[13] + Math.max(0.4, scaleY), e[14])
      return { ratio: h.hitDistance == null ? null : h.hitDistance / h.targetDistance, name: h.hitName }
    }, i)
  }
  let speaker = null
  let speakerIndex = -1
  let speakerBack = STAND_BACKS[0]
  const probes = []
  for (let i = 0; i < candidates.length && speakerIndex < 0; i++) {
    for (const back of STAND_BACKS) {
      const hit = await aimAt(i, back)
      probes.push(hit ? `${hit.ratio == null ? 'sky' : hit.ratio.toFixed(2)}@${hit.name}` : 'none')
      if (hit && hit.ratio !== null && hit.ratio >= 0.85 && hit.ratio <= 1.15) {
        // The pose that VALIDATED it is the pose the block goes on to measure
        // from, so the accepting aim is deliberately the last one performed —
        // and the range it was validated at is the one the shutter re-aims with.
        speaker = candidates[i]
        speakerIndex = i
        speakerBack = back
        break
      }
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
      { u: RIVER, idx: speakerIndex },
    )
    check('a figure can speak over its head at all (point 485)', spoke, `spoke ${spoke}`)
    await nextFrames(3)
    // The anchor point, the figure's own body and the rendered label's DOM box
    // are read in ONE evaluate, so no frame passes between deciding where the
    // speaker is and measuring where its note landed.
    const read = () =>
      page.evaluate((idx) => {
        const pt = window.__speech?.anchorScreen('probe-speaker')
        // THIS speaker's note, not whichever the DOM lists first: since the
        // children speak at their game (point 481) a settlement holds several
        // notes at once, and the unqualified selector measured a child's.
        const el = document.querySelector('.speech-label[data-speaker="probe-speaker"]')
        const figure = window.__speechProbeFigures?.[idx]
        if (!pt || !el || !figure) return null
        figure.updateWorldMatrix(true, false)
        const e = figure.matrixWorld.elements
        const cam = window.__placeCamera
        // The chest at THIS figure's own scale, not a flat metre: a metre above
        // a child's feet is over its head, and once the note rides close over
        // that head (point 582) the two would read as one point.
        const chest = Math.max(0.4, Math.hypot(e[4], e[5], e[6]))
        const v = new (Object.getPrototypeOf(cam.position).constructor)(e[12], e[13] + chest, e[14])
        v.project(cam)
        const r = el.getBoundingClientRect()
        // The note stands on its TAIL's tip (point 1238): that tip, not the box
        // centre, is what must land on the anchor over the speaker's crown.
        const tail = el.parentElement?.querySelector('.speech-tail')?.getBoundingClientRect()
        if (!tail) return null
        return {
          dx: tail.left + tail.width / 2 - pt.x,
          dy: tail.bottom - pt.y,
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
    // THE SHOT FOLLOWS ITS SPEAKER (point 1058). Measured 06.09.2026 on a quiet
    // host: the body walked out of the frame SIDEWAYS — bodyX ran 496, 360, 234,
    // 123, 11, -70, -140, -208 across the eight samples of a 1440-wide viewport
    // — while its note stayed over it in every one of them (the body below the
    // label's bottom edge throughout, the vertical offset inside its allowance)
    // and the label shrank 212 -> 160 px as the figure receded. So neither the
    // note nor the choreography was at fault: this block aimed the camera ONCE
    // and then spent eight shutters measuring a figure that the paired DIG
    // summons (point 688) sends off to its site in the same breath as its word.
    // A shot staged around a figure free to leave it proves nothing to a human
    // eye either, so the camera is put back on the subject before EVERY sample,
    // exactly as the shutter below already does before its frame. Two frames,
    // because the pose is consumed by the place controller and the note is
    // projected by a frame callback of drei's own.
    const samples = []
    for (let k = 0; k < 8; k++) {
      await standBefore(speakerIndex, speakerBack)
      await nextFrames(2)
      const s = await read()
      if (s) samples.push(s)
    }
    // Both allowances are expressed in the LABEL'S OWN height, which drei's
    // distanceFactor scales with the distance — a screen constant would pass at
    // one range and fail at another, and this scene picks its speaker afresh
    // every run. Horizontally the label is centred on its anchor and typically
    // lands within a pixel of it; the slack is there because drei's <Html> reads
    // the world matrix in a frame callback of its OWN, so on a frame where it
    // runs first the note trails the walking figure by exactly one step (10 px
    // measured, against a body some 95 px wide at this range). Vertically the
    // tail's tip stands on the anchor (point 1238). What this rejects is the
    // bug it exists for: a label left at the scene origin, hundreds of pixels
    // from its speaker or off the viewport altogether.
    const worstX = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dx) - 0.5 * s.height)) : Infinity
    const worstY = samples.length ? Math.max(...samples.map((s) => Math.abs(s.dy) - 0.35 * s.height)) : Infinity
    check(
      'the note rides on the figure that speaks, not on a world coordinate (point 485)',
      samples.length >= 6 && worstX <= 0 && worstY <= 0,
      samples.length >= 6
        ? `worst sideways offset past half the label height ${worstX.toFixed(1)} px, worst tail-tip vertical offset past its allowance ${worstY.toFixed(1)} px, over ${samples.length} frames`
        : `MEASURED NOTHING — only ${samples.length} frames carried both a label and its anchor`,
    )
    // And the picture must SHOW that: the speaker's own body stands inside the
    // frame, directly under its note. A label over an empty patch of village
    // would satisfy every number above and prove nothing to a human eye.
    const inFrame = (s) => s.bodyX > 0 && s.bodyX < s.vw && s.bodyY > s.labelBottom && s.bodyY < s.vh
    const underNote = samples.filter(inFrame)
    // WHICH BOUND BROKE, from the frames themselves (point 1058). The old detail
    // printed sample ZERO and the count, and sample zero is the one taken before
    // the subject had moved anywhere — so a red said only "5/8" and naming the
    // cause cost an instrumented probe run. A miss now says which side of the
    // frame the body left by, and the track of the reading that left it.
    const missReason = (s) => {
      if (!(s.bodyX > 0)) return 'off the left edge'
      if (!(s.bodyX < s.vw)) return 'off the right edge'
      if (!(s.bodyY > s.labelBottom)) return 'above its own note'
      return 'below the bottom edge'
    }
    const misses = [...new Set(samples.filter((s) => !inFrame(s)).map(missReason))]
    check(
      'the speaking figure itself stands in the frame, under its note (point 485)',
      underNote.length >= 6,
      samples.length
        ? `body at (${samples[0].bodyX.toFixed(0)}, ${samples[0].bodyY.toFixed(0)}), label bottom ${samples[0].labelBottom.toFixed(0)} — ${underNote.length}/${samples.length} frames`
          + (misses.length
            ? `; missed ${misses.join(' and ')} — bodyX ${samples.map((s) => s.bodyX.toFixed(0)).join(', ')} of ${samples[0].vw}, bodyY ${samples.map((s) => s.bodyY.toFixed(0)).join(', ')} of ${samples[0].vh}`
            : '')
        : 'MEASURED NOTHING',
    )
    // Point 485 (1)/(4): the syllables stand BESIDE the reading, never instead of
    // it, and an unwritten reading reads `???`.
    const last = samples[samples.length - 1] ?? { syllables: '', reading: '' }
    check(
      'the label shows the syllables beside the reading, `???` where none is written (point 485)',
      last.syllables === RIVER && last.reading === '???',
      JSON.stringify(last),
    )
    // Point 485 (3): editing the note in the journal changes the label at once —
    // one source seen twice, nothing copied onto the label.
    await page.evaluate((u) => window.__game.getState().setUtteranceHypothesis(u, 'the water'), RIVER)
    await nextFrames(2)
    const afterEdit = await read()
    check(
      'a reading written in the journal stands over the head immediately (point 485)',
      !!afterEdit && afterEdit.reading === 'the water',
      JSON.stringify(afterEdit),
    )
    // Re-aim before the shutter: the speaker has kept walking through the
    // measurement, and the frame is the evidence that its note stands over ITS
    // head — so the camera is put back in front of it, wherever it is now.
    await aimAt(speakerIndex, speakerBack)
    // The subject is where the figure stands NOW — it may have walked on since
    // it was chosen — so the shutter judges the frame against the live anchor.
    const at = await page.evaluate((idx) => {
      const figure = window.__speechProbeFigures?.[idx]
      if (!figure) return null
      figure.updateWorldMatrix(true, false)
      const e = figure.matrixWorld.elements
      const label = window.__speech?.labels().find((l) => l.speakerId === 'probe-speaker')
      return {
        x: e[12],
        y: e[13],
        z: e[14],
        // The note's OWN rise, so the shutter aims where the label actually is
        // rather than at a height written down here (point 582 moved it).
        rise: label?.height ?? null,
        mark: figure.userData?.actor?.height ?? null,
        // The VERTICAL scale, as the label's own rise uses: a kneeling figure is
        // squashed in height only.
        scale: Math.hypot(e[4], e[5], e[6]),
      }
    }, speakerIndex)
    // Point 582: the note floats a hand's breadth over THAT figure's head, at
    // the scale it is drawn — measured in WORLD units against the figure's own
    // record, the same one the Ctrl labels read. A label that fell back to a
    // grown figure's height over a child would stand out here at once.
    check(
      'the note floats close over the speaker’s own head, at its own scale (point 582)',
      !!at && at.rise !== null && at.mark !== null &&
        at.rise > at.mark * at.scale && at.rise - at.mark * at.scale <= 0.5,
      at ? JSON.stringify(at) : 'no speaker',
    )
    await frame('146-speech-hypothesis-label', {
      local: {
        x: (at ?? speaker).x,
        y: (at ?? speaker).y + (at?.rise ?? 1.7),
        z: (at ?? speaker).z,
      },
      label: 'the reading over the speaking figure',
    })
    await page.evaluate((u) => {
      window.__game.getState().setUtteranceHypothesis(u, '')
      window.__speech?.clear()
      delete window.__speechProbeFigures
    }, RIVER)
  }
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    p.pitch = saved.pitch
  }, pose)
}
// --- Whose a note is (point 1238) ---------------------------------------------
// Two figures standing close together both speak. The picture must show each
// note's tail pointing down at ITS OWN speaker, and the older note receded
// behind the newer one, so the current speaker is never in doubt. The recede
// rule itself is pinned in Vitest (speechLabelRecedes); this proves the drawn
// tails land on their own crowns and the dimming reaches the screen.
if (section('speech-owner')) {
  await goToPlace('bambara-village')
  const RIVER = 'ba-BA-ba-BA'
  const pose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  // Every pair of named figures standing 1.2-4 m apart, closest first: close
  // enough that an untailed note could float between the two heads.
  await page.evaluate(() => {
    const scene = window.__placeScene
    if (!scene) return []
    const found = []
    scene.traverse((o) => {
      if (o.name === 'inhabitant' && found.length < 24) found.push(o)
    })
    window.__speechOwnerFigures = found
    const at = found.map((o) => {
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      return { x: e[12], z: e[14] }
    })
    window.__speechOwnerStart = at
    return at.length
  })
  // The figures WALK, and a pair that drifts apart between the choice and the
  // shutter puts one note off the frame edge (measured: the notes at -165 and
  // 1546 px of a 1440 view) — so the staging below is judged again AT the
  // shutter. Whether each figure stands still is recorded for the detail only:
  // preferring still pairs picked the drummer's crowded shelter every time.
  await nextFrames(30)
  const pairs = await page.evaluate(() => {
    const figs = window.__speechOwnerFigures ?? []
    const start = window.__speechOwnerStart ?? []
    const at = figs.map((o) => {
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      return { x: e[12], z: e[14] }
    })
    const still = at.map((p, i) => Math.hypot(p.x - start[i].x, p.z - start[i].z) < 0.15)
    const out = []
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const d = Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z)
        if (d >= 1.2 && d <= 4) out.push({ a: i, b: j, d, still: still[i] && still[j] })
      }
    }
    return out.sort((l, r) => l.d - r.d).slice(0, 24)
  })
  // Stand a few metres in front of the pair's midpoint. The notes are spoken
  // with a tiny targeting reach, so neither is the guess target — a targeted
  // note never recedes, and that exception is Vitest's to prove, not this
  // picture's.
  const STAND_BACKS = [6, 5]
  const aimPair = (pair, back) =>
    page.evaluate(
      async ({ a, b, back }) => {
        const { insidePlace } = await import('/src/scenes/place/boundary.ts')
        const figs = window.__speechOwnerFigures
        const p = window.__placePlayer
        const layout = window.__placeLayout
        if (!figs || !p || !layout || !window.__placeRayHit) return null
        const pos = [figs[a], figs[b]].map((f) => {
          f.updateWorldMatrix(true, false)
          const e = f.matrixWorld.elements
          return { x: e[12], y: e[13], z: e[14], h: Math.max(0.4, Math.hypot(e[4], e[5], e[6])) }
        })
        const mid = { x: (pos[0].x + pos[1].x) / 2, z: (pos[0].z + pos[1].z) / 2 }
        // Look across the pair (perpendicular to the line joining them), from
        // the settlement's inner side, so both figures stand side by side.
        let px = -(pos[1].z - pos[0].z)
        let pz = pos[1].x - pos[0].x
        const n = Math.hypot(px, pz) || 1
        px /= n
        pz /= n
        if (px * mid.x + pz * mid.z < 0) {
          px = -px
          pz = -pz
        }
        // A stand beyond the settlement's edge is no stand: putting the player
        // there LEAVES the place (`isOutsidePlace`), and a pair on the bank
        // lobe — the fishermen at the waterline — offers exactly that. The
        // pair is skipped; the function that decides leaving decides it here.
        const x = mid.x - px * back
        const z = mid.z - pz * back
        if (!insidePlace(layout, x, z, 1)) return null
        p.x = x
        p.z = z
        p.pitch = 0
        p.yaw = Math.atan2(mid.x - p.x, mid.z - p.z) + Math.PI
        return pos
      },
      { a: pair.a, b: pair.b, back },
    )
  // Per figure: the best head-height reading, or 0 when anything stands in
  // front of the head at ANY of those heights (a post half across the face is
  // an occluder even if one ray gets past it). A last reading, -1, is the roof
  // test: a camera under the drum shelter frames beams and posts, not faces.
  const seen = (pair) =>
    page.evaluate(({ a, b }) => {
      const figs = window.__speechOwnerFigures
      const cam = window.__placeCamera
      const out = [figs[a], figs[b]].map((f) => {
        f.updateWorldMatrix(true, false)
        const e = f.matrixWorld.elements
        // The figure's OWN drawn height (its actor record), at its scale — a
        // child is drawn small inside an unscaled group, and a grown height
        // probed the air above its head.
        const h = (f.userData?.actor?.height ?? 1.45) * Math.hypot(e[4], e[5], e[6])
        let best = null
        for (const k of [0.8, 0.88, 0.95]) {
          const hit = window.__placeRayHit(e[12], e[13] + h * k, e[14])
          if (hit.hitDistance == null) continue
          const ratio = hit.hitDistance / hit.targetDistance
          if (ratio < 0.85) return 0
          if (best === null || Math.abs(ratio - 1) < Math.abs(best - 1)) best = ratio
        }
        return best
      })
      const up = window.__placeRayHit(cam.position.x, cam.position.y + 8, cam.position.z)
      if (up.hitDistance != null && up.hitDistance < up.targetDistance) out.push(-1)
      return out
    }, pair)
  // The older note first, the newer a few frames later — exactly the order of
  // an exchange. Both are held long so the expiry clock (pure-tested) plays no
  // part; a village word raised in between would dim both, so the pair is
  // spoken again right before the shutter too.
  const speakPair = (pair) =>
    page.evaluate(
      async ({ a, b, u }) => {
        const figs = window.__speechOwnerFigures
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
        window.__game.getState().hearUtterance(u)
        const say = (f, id) => {
          const name = f.name
          f.name = `${id}-figure`
          const ok = window.__speech?.speak(id, [u], `${id}-figure`, 120, 0.1) === true
          f.name = name
          return ok
        }
        const older = say(figs[a], 'owner-older')
        await raf()
        await raf()
        const newer = say(figs[b], 'owner-newer')
        for (let i = 0; i < 3; i++) await raf()
        return older && newer
      },
      { a: pair.a, b: pair.b, u: RIVER },
    )
  // The recede is a short CSS transition; wait for THAT to finish (no
  // running animation on either bubble), not for a wall-clock pause.
  const recedeSettled = () =>
    page
      .waitForFunction(
        () =>
          ['owner-older', 'owner-newer'].every((id) => {
            const b = document.querySelector(`.speech-label[data-speaker="${id}"]`)?.closest('.speech-bubble')
            return !!b && b.getAnimations().length === 0
          }),
        null,
        { timeout: 5000 },
      )
      .catch(() => {})
  const read = () =>
    page.evaluate(async () => {
      // The configured dim, read from the game's own balance module, so the
      // check follows a recalibration instead of a number written down here.
      const { balance } = await import('/src/config/balance.ts')
      // A rectangle alone proves nothing: `visibility: hidden` keeps it. What
      // the player sees is the RENDERED element and the opacity of it and every
      // ancestor multiplied together.
      const rendered = (node) =>
        !!node && node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      const effectiveOpacity = (node) => {
        let o = 1
        for (let n = node; n && n instanceof Element; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
        return o
      }
      const one = (id) => {
        const el = document.querySelector(`.speech-label[data-speaker="${id}"]`)
        const bubble = el?.closest('.speech-bubble')
        const tailNode = bubble?.querySelector('.speech-tail')
        const tail = tailNode?.getBoundingClientRect()
        const pt = window.__speech?.anchorScreen(id)
        if (!el || !bubble || !tail || !pt) return null
        return {
          tip: { x: tail.left + tail.width / 2, y: tail.bottom },
          anchor: pt,
          height: el.getBoundingClientRect().height,
          opacity: effectiveOpacity(el),
          tailOpacity: effectiveOpacity(tailNode),
          visible: rendered(el) && rendered(tailNode) && tail.width > 0 && tail.height > 0,
          dim: balance.communication.labelRecede.opacity,
          receded: bubble.classList.contains('receded'),
          targeted: bubble.classList.contains('targeted'),
          onScreen: tail.bottom > 0 && tail.bottom < window.innerHeight && tail.left > 0 && tail.right < window.innerWidth,
        }
      }
      return { older: one('owner-older'), newer: one('owner-newer') }
    })
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
  // The top of each speaker's DRAWN head on screen (its `figure-head` sphere).
  const crowns = (pair) =>
    page.evaluate(({ a, b }) => {
      const figs = window.__speechOwnerFigures
      const cam = window.__placeCamera
      return [figs[a], figs[b]].map((f) => {
        let head = null
        f.traverse((o) => {
          if (!head && o.name === 'figure-head') head = o
        })
        if (!head) return null
        head.updateWorldMatrix(true, false)
        const e = head.matrixWorld.elements
        const v = new (Object.getPrototypeOf(cam.position).constructor)(e[12], e[13] + 0.16 * Math.hypot(e[4], e[5], e[6]), e[14])
        v.project(cam)
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }
      })
    }, pair)
  const clear = (ratios) => ratios.every((r) => r !== null && r >= 0.85 && r <= 1.15)
  // Everything the picture must show, read on ONE aimed frame: both speakers
  // unobstructed, both tails on screen and on their own anchors, the older
  // note receded and neither the guess target.
  const stage = async (pair) => {
    await aimPair(pair, pair.back)
    await nextFrames(2)
    const view = { sight: await seen(pair), ...(await read()), crowns: await crowns(pair) }
    const { older, newer } = view
    const [olderCrown, newerCrown] = view.crowns ?? []
    // Each tip on its own anchor, AND just above its own DRAWN head — nearer
    // that head than the other speaker's — so the tail visibly points at the
    // face it belongs to, not at air the anchor merely computes.
    view.tails = !!older && !!newer && !!olderCrown && !!newerCrown &&
      [[older, olderCrown, newerCrown], [newer, newerCrown, olderCrown]].every(
        ([own, crown, otherCrown]) =>
          own.onScreen &&
          Math.abs(own.tip.x - own.anchor.x) <= 0.5 * own.height &&
          Math.abs(own.tip.y - own.anchor.y) <= 0.35 * own.height &&
          own.tip.y < crown.y &&
          crown.y - own.tip.y <= 1.2 * own.height &&
          Math.abs(own.tip.x - crown.x) <= 0.5 * own.height &&
          dist(own.tip, crown) < dist(own.tip, otherCrown),
      )
    view.recede = !!older && !!newer && older.receded && !newer.receded &&
      !older.targeted && !newer.targeted &&
      // Both notes and both tails actually drawn; the older at the configured,
      // NONZERO dim (a vanished note is not a receded one), the newer at full.
      older.visible && newer.visible &&
      older.dim > 0.1 && older.dim < 0.95 &&
      Math.abs(older.opacity - older.dim) < 0.03 && Math.abs(older.tailOpacity - older.dim) < 0.03 &&
      Math.abs(newer.opacity - 1) < 0.01 && Math.abs(newer.tailOpacity - 1) < 0.01
    view.ok = clear(view.sight) && view.tails && view.recede
    return view
  }
  // A pair qualifies only if the whole staging holds AT THE SHUTTER: these
  // figures walk, and one that steps behind a post or out of the frame after
  // the choice is the next pair's turn, not a picture.
  const MAX_ATTEMPTS = 8
  const attempts = []
  const rejected = []
  let shot = null
  for (const pair of pairs) {
    if (attempts.length >= MAX_ATTEMPTS || shot) break
    let back = null
    for (const b of STAND_BACKS) {
      if (!(await aimPair(pair, b))) continue
      await nextFrames(2)
      const sight = await seen(pair)
      if (clear(sight)) {
        back = b
        break
      }
      rejected.push(sight.map((r) => (r == null ? 'sky' : r.toFixed(2))).join('/'))
    }
    if (back === null) continue
    const cand = { ...pair, back }
    if (!(await speakPair(cand))) continue
    await recedeSettled()
    const before = await stage(cand)
    if (!before.ok) {
      attempts.push({ pair: cand, at: 'staging', view: before })
      await page.evaluate(() => window.__speech?.clear())
      continue
    }
    const pos = await aimPair(cand, cand.back)
    if (!pos) {
      // The pair walked on until its stand fell outside the settlement.
      attempts.push({ pair: cand, at: 'stand-outside' })
      await page.evaluate(() => window.__speech?.clear())
      continue
    }
    const label = await page.evaluate(() => window.__speech?.labels().find((l) => l.speakerId === 'owner-newer'))
    let atShutter = null
    await captureFrame(
      page,
      OUT,
      '1238-speech-owner-tails',
      {
        local: {
          x: (pos[0].x + pos[1].x) / 2,
          y: (pos[0].y + pos[1].y) / 2 + (label?.height ?? 1.6),
          z: (pos[0].z + pos[1].z) / 2,
        },
        label: 'two close speakers, each note tailed to its own head, the older one receded',
        // The figures walk: a full readiness wait lets the pair drift apart
        // across the frame. The scene has long been drawn by now.
        settle: false,
      },
      {
        beforeCapture: async () => {
          await speakPair(cand)
          await recedeSettled()
          atShutter = await stage(cand)
        },
      },
    )
    attempts.push({ pair: cand, at: 'shutter', view: atShutter })
    if (atShutter?.ok) shot = atShutter
    await page.evaluate(() => window.__speech?.clear())
  }
  const brief = (a) => `${a.pair.a}/${a.pair.b}@${a.pair.back}m ${a.at}: sight ${a.view?.sight?.map((r) => (r == null ? 'sky' : r.toFixed(2))).join('/')} tails ${a.view?.tails} recede ${a.view?.recede}`
  check(
    'two close speakers are shot unobstructed, each tail on its own speaker’s anchor, the older note receded and neither targeted (point 1238)',
    !!shot,
    `${pairs.length} pairs 1.2-4 m apart (${pairs.filter((p) => p.still).length} standing still); attempts [${attempts.map(brief).join('; ')}]; sight rejected [${rejected.join(', ')}]` +
      (shot ? ` — shot ${JSON.stringify({ older: shot.older, newer: shot.newer })}` : ''),
  )
  await page.evaluate((u) => {
    window.__game.getState().setUtteranceHypothesis(u, '')
    window.__speech?.clear()
    delete window.__speechOwnerFigures
    delete window.__speechOwnerStart
  }, RIVER)
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    p.pitch = saved.pitch
  }, pose)
}
// --- A near and a far speaker's note, sized by distance (point 1271) ---------
// The size curve (monotone, clamped) is pinned in
// src/communication/speechBubbleScale.test.ts. What only a browser can answer is
// that the DRAWN notes follow it: a speaker a few metres away carries a visibly
// larger note than one far across the village, each still on its own speaker.
// The size is read off each note's `.speech-distance` wrapper, whose box is the
// card's layout box times the distance scale alone, so the near note's receded
// look (it speaks first) cannot pass for the distance effect.
if (section('speech-distance-scale')) {
  await goToPlace('bambara-village')
  const RIVER = 'ba-BA-ba-BA'
  const pose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  await page.evaluate(() => {
    const scene = window.__placeScene
    const found = []
    scene?.traverse((o) => {
      if (o.name === 'inhabitant' && found.length < 24) found.push(o)
    })
    window.__speechScaleFigures = found
  })
  // Pairs 10-22 m apart, widest first: the nearer stands a few metres before
  // the camera, the other far behind it and off to the side.
  const pairs = await page.evaluate(() => {
    const at = (window.__speechScaleFigures ?? []).map((o) => {
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      return { x: e[12], z: e[14] }
    })
    const out = []
    for (let i = 0; i < at.length; i++) {
      for (let j = 0; j < at.length; j++) {
        const d = Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z)
        if (i !== j && d >= 10 && d <= 22) out.push({ near: i, far: j, d })
      }
    }
    return out.sort((l, r) => r.d - l.d).slice(0, 24)
  })
  const NEAR = 3.5
  const SIDE = 2.5
  /** Stand NEAR before the near figure, on the far figure's line but SIDE off
   *  it, and look between the two — live positions, the figures walk. */
  const aim = (pair) =>
    page.evaluate(
      async ({ near, far, NEAR, SIDE }) => {
        const { insidePlace } = await import('/src/scenes/place/boundary.ts')
        const figs = window.__speechScaleFigures
        const p = window.__placePlayer
        const layout = window.__placeLayout
        if (!figs || !p || !layout) return null
        const pos = [figs[near], figs[far]].map((f) => {
          f.updateWorldMatrix(true, false)
          const e = f.matrixWorld.elements
          return { x: e[12], y: e[13], z: e[14] }
        })
        let ux = pos[1].x - pos[0].x
        let uz = pos[1].z - pos[0].z
        const n = Math.hypot(ux, uz) || 1
        ux /= n
        uz /= n
        const x = pos[0].x - ux * NEAR - uz * SIDE
        const z = pos[0].z - uz * NEAR + ux * SIDE
        if (!insidePlace(layout, x, z, 1)) return null
        const dir = pos.map((q) => {
          const l = Math.hypot(q.x - x, q.z - z) || 1
          return { x: (q.x - x) / l, z: (q.z - z) / l }
        })
        p.x = x
        p.z = z
        p.pitch = 0
        p.yaw = Math.atan2(dir[0].x + dir[1].x, dir[0].z + dir[1].z) + Math.PI
        return pos
      },
      { near: pair.near, far: pair.far, NEAR, SIDE },
    )
  // Both heads in plain sight: the first surface along each sight line is the
  // figure itself (the speech-owner instrument), and no roof over the camera.
  const seen = (pair) =>
    page.evaluate(
      ({ near, far }) => {
        const figs = window.__speechScaleFigures
        const cam = window.__placeCamera
        if (!window.__placeRayHit || !cam) return [null]
        const out = [figs[near], figs[far]].map((f) => {
          f.updateWorldMatrix(true, false)
          const e = f.matrixWorld.elements
          const h = (f.userData?.actor?.height ?? 1.45) * Math.hypot(e[4], e[5], e[6])
          let best = null
          for (const k of [0.8, 0.88, 0.95]) {
            const hit = window.__placeRayHit(e[12], e[13] + h * k, e[14])
            if (hit.hitDistance == null) continue
            const ratio = hit.hitDistance / hit.targetDistance
            if (ratio < 0.85) return 0
            if (best === null || Math.abs(ratio - 1) < Math.abs(best - 1)) best = ratio
          }
          return best
        })
        const up = window.__placeRayHit(cam.position.x, cam.position.y + 8, cam.position.z)
        if (up.hitDistance != null && up.hitDistance < up.targetDistance) out.push(-1)
        return out
      },
      { near: pair.near, far: pair.far },
    )
  const clear = (ratios) => ratios.every((r) => r !== null && r >= 0.85 && r <= 1.15)
  // The near figure speaks first, the far one after, both held long; neither
  // may be the guess target, so both are spoken with a tiny reach.
  const speak = (pair) =>
    page.evaluate(
      async ({ near, far, u }) => {
        const figs = window.__speechScaleFigures
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
        window.__game.getState().hearUtterance(u)
        const say = (f, id) => {
          const name = f.name
          f.name = `${id}-figure`
          const ok = window.__speech?.speak(id, [u], `${id}-figure`, 120, 0.1) === true
          f.name = name
          return ok
        }
        const a = say(figs[near], 'scale-near')
        await raf()
        await raf()
        const b = say(figs[far], 'scale-far')
        for (let i = 0; i < 3; i++) await raf()
        return a && b
      },
      { near: pair.near, far: pair.far, u: RIVER },
    )
  const settled = () =>
    page
      .waitForFunction(
        () =>
          ['scale-near', 'scale-far'].every((id) => {
            const b = document.querySelector(`.speech-label[data-speaker="${id}"]`)?.closest('.speech-bubble')
            return !!b && b.getAnimations().length === 0
          }),
        null,
        { timeout: 5000 },
      )
      .catch(() => {})
  // Each note's drawn size (its wrapper's box), its distance scale as set by the
  // scene layer, the scale the pure curve gives for the camera distance read
  // here, and whether the tail's tip still stands on the speaker's anchor.
  const read = () =>
    page.evaluate(async () => {
      const { speechBubbleScale } = await import('/src/communication/speechBubbleScale.ts')
      const cam = window.__placeCamera
      const one = (id) => {
        const el = document.querySelector(`.speech-label[data-speaker="${id}"]`)
        const sizer = el?.closest('.speech-distance')
        const tail = el?.closest('.speech-bubble')?.querySelector('.speech-tail')?.getBoundingClientRect()
        const anchor = window.__speech?.anchorWorld(id)
        const label = window.__speech?.labels().find((l) => l.speakerId === id)
        const pt = window.__speech?.anchorScreen(id)
        if (!el || !sizer || !tail || !anchor || !label || !pt || !cam) return null
        const box = sizer.getBoundingClientRect()
        const distance = Math.hypot(
          anchor[0] - cam.position.x,
          anchor[1] + label.height - cam.position.y,
          anchor[2] - cam.position.z,
        )
        return {
          distance: +distance.toFixed(2),
          width: +box.width.toFixed(1),
          height: +box.height.toFixed(1),
          layoutWidth: sizer.offsetWidth,
          set: Number(getComputedStyle(sizer).getPropertyValue('--speech-distance-scale')),
          expected: +speechBubbleScale(distance).toFixed(3),
          onTip: Math.abs(tail.left + tail.width / 2 - pt.x) <= 6 && Math.abs(tail.bottom - pt.y) <= 0.35 * box.height,
          onScreen: box.left > 0 && box.right < window.innerWidth && box.top > 0 && tail.bottom < window.innerHeight,
          targeted: el.classList.contains('targeted'),
        }
      }
      return { near: one('scale-near'), far: one('scale-far') }
    })
  const judge = (v) => {
    const near = v?.near
    const far = v?.far
    if (!near || !far) return false
    const tracks = (n) => Math.abs(n.set - n.expected) <= 0.03 && Math.abs(n.width / n.layoutWidth - n.set) <= 0.03
    return (
      near.distance < far.distance &&
      near.width >= 1.25 * far.width &&
      tracks(near) &&
      tracks(far) &&
      near.onTip &&
      far.onTip &&
      near.onScreen &&
      far.onScreen &&
      !near.targeted &&
      !far.targeted &&
      near.layoutWidth === far.layoutWidth
    )
  }
  const MAX_ATTEMPTS = 8
  const attempts = []
  let shot = null
  for (const pair of pairs) {
    if (attempts.length >= MAX_ATTEMPTS || shot) break
    if (!(await aim(pair))) continue
    await nextFrames(2)
    if (!clear(await seen(pair))) continue
    if (!(await speak(pair))) continue
    await settled()
    let pos = await aim(pair)
    await nextFrames(2)
    const before = await read()
    if (!pos || !clear(await seen(pair)) || !judge(before)) {
      attempts.push({ pair, at: 'staging', view: before })
      await page.evaluate(() => window.__speech?.clear())
      continue
    }
    let atShutter = null
    await captureFrame(
      page,
      OUT,
      '1271-speech-near-far-sizes',
      {
        local: { x: (pos[0].x + pos[1].x) / 2, y: (pos[0].y + pos[1].y) / 2 + 1.6, z: (pos[0].z + pos[1].z) / 2 },
        label: 'a near and a far speaker in the village, the near note visibly larger than the far one',
        // The figures walk; the scene has long been drawn by now.
        settle: false,
      },
      {
        beforeCapture: async () => {
          pos = (await aim(pair)) ?? pos
          await nextFrames(2)
          const view = await read()
          atShutter = { ...view, sight: await seen(pair) }
          atShutter.ok = judge(view) && clear(atShutter.sight)
        },
      },
    )
    attempts.push({ pair, at: 'shutter', view: atShutter })
    if (atShutter?.ok) shot = atShutter
    await page.evaluate(() => window.__speech?.clear())
  }
  const brief = (a) =>
    `${a.pair.near}/${a.pair.far}@${a.pair.d.toFixed(1)}m ${a.at}: ${JSON.stringify({ near: a.view?.near, far: a.view?.far })}`
  check(
    'a near speaker’s note is drawn visibly larger than a far speaker’s, each at the scale its distance gives and on its own speaker (point 1271)',
    !!shot,
    `${pairs.length} pairs 10-22 m apart; attempts [${attempts.map(brief).join('; ')}]` +
      (shot ? ` — shot ${JSON.stringify({ near: shot.near, far: shot.far })}` : ''),
  )
  await page.evaluate((u) => {
    window.__game.getState().setUtteranceHypothesis(u, '')
    window.__speech?.clear()
    delete window.__speechScaleFigures
  }, RIVER)
  await page.evaluate((saved) => {
    const p = window.__placePlayer
    if (!p || !saved) return
    p.x = saved.x
    p.z = saved.z
    p.yaw = saved.yaw
    p.pitch = saved.pitch
  }, pose)
}
// --- Guessing a meaning where it is spoken (design.md §13.4, points 588/691) --
// The arbitration, the dialog and the note it writes are pinned in the Vitest
// layer. What ONLY a browser can answer is the input path: the guess key E opens
// the dialog at all (point 1139), a real left click on the settlement view opens NOTHING because
// the mouse handler is gone (point 691), the pointer lock is given up for the
// dialog and asked back on close, and real keystrokes land in the field. The
// lock itself cannot be exercised here — it is deliberately never engaged under
// browser automation (system-Chrome headless grabs the real OS cursor), so what
// is read is the game's own DECISION counter, while the click, the key, the
// focus and the typing are the genuine article.
if (section('speech-guess')) {
  await goToPlace('maasai-village')
  const GUESS_UTTERANCE = 'ba-BA-ba-BA' // one of the six words; its meaning is rolled per run
  const guessPose = await page.evaluate(() => {
    const p = window.__placePlayer
    return p ? { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch } : null
  })
  // Stage ONE speaker a few steps in front of the player: the guess key takes the
  // NEAREST word, so standing near him is what the highlight is for — and at a
  // distance a player really walks up to, since the note's size follows it. The
  // spot is open ground away from every door, so the bottom prompt stays empty
  // here and the note carries the only invitation on screen (point 1139).
  const staged = await page.evaluate((u) => {
    const scene = window.__placeScene
    const p = window.__placePlayer
    if (!scene || !p) return false
    let figure = null
    scene.traverse((o) => {
      if (!figure && o.name === 'inhabitant') figure = o
    })
    if (!figure) return false
    figure.updateWorldMatrix(true, false)
    const e = figure.matrixWorld.elements
    p.x = e[12] + 4
    p.z = e[14]
    p.pitch = 0
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(e[12] - p.x, e[14] - p.z) + Math.PI
    // A label shows only over speech the player has ALREADY observed, and a
    // long lifetime keeps this off the expiry clock, which is pure-tested.
    window.__game.getState().hearUtterance(u)
    window.__game.getState().setUtteranceHypothesis(u, '')
    figure.name = 'guess-probe-figure'
    const ok = window.__speech?.speak('guess-speaker', [u], 'guess-probe-figure', 120) === true
    figure.name = 'inhabitant'
    return ok
  }, GUESS_UTTERANCE)
  check('a figure can be staged to speak beside the player (point 588)', staged, `staged ${staged}`)
  await nextFrames(4)
  // What the player sees: which note is highlighted, and what stands under it.
  const highlight = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.speech-label'))
    const targeted = all.filter((el) => el.classList.contains('targeted'))
    const one = targeted[0]
    return {
      labels: all.length,
      targeted: targeted.length,
      speaker: one?.getAttribute('data-speaker') ?? null,
      invite: one?.querySelector('.speech-invite')?.textContent ?? '',
      strayInvites: all.filter(
        (el) => !el.classList.contains('targeted') && el.querySelector('.speech-invite'),
      ).length,
      syllables: Array.from(one?.querySelectorAll('.syllables') ?? []).map((s) => s.textContent),
    }
  })
  check(
    'exactly one note is highlighted, and it is the speaker beside the player (point 588)',
    highlight.targeted === 1 && highlight.speaker === 'guess-speaker',
    JSON.stringify(highlight),
  )
  check(
    'the invitation stands under the highlighted note alone, and does not shout (point 588)',
    highlight.invite.length > 0 &&
      highlight.invite !== highlight.invite.toUpperCase() &&
      highlight.strayInvites === 0,
    `invite ${JSON.stringify(highlight.invite)}, invitations on unhighlighted notes ${highlight.strayInvites}`,
  )
  // What the invitation NAMES is the key the player presses (points 691/1139):
  // a note still saying "click" would send him to a handler that no longer
  // exists, and one still saying SPACE would send him to the key that now
  // enters the hut he is standing at.
  check(
    'the invitation names the guess key E, never SPACE and never a click (point 1139)',
    /\bE\b/.test(highlight.invite) && !/click|klick|space|leertaste/i.test(highlight.invite),
    `invite ${JSON.stringify(highlight.invite)}`,
  )
  // The guess key is armed by the word alone (point 1139), and out here in the
  // open there is nothing for the use key to do — so the bottom prompt, the
  // OTHER hint slot, stands empty beside the note's invitation.
  const useKey = await page.evaluate(() => ({
    guessKeyArmed: window.__ui.getState().guessKeyArmed,
    prompt: window.__ui.getState().prompt,
  }))
  check(
    'the word arms the guess key here, and no door prompt stands with it (point 1139)',
    useKey.guessKeyArmed === true && useKey.prompt === null,
    JSON.stringify(useKey),
  )
  await frame('148-speech-guess-invitation', {
    element: '.speech-label.targeted',
    label: 'the highlighted note of the nearest speaker, inviting the guess',
  })
  // A key owns the guess now (point 691), so the mouse must be PROVED
  // dead: a point of the settlement view a click can actually land on — the
  // notes are drawn in an overlay of their own, and a click that hit one would
  // prove nothing about the canvas the player clicks.
  const spot = await page.evaluate(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    for (const [fx, fy] of [[0.2, 0.55], [0.8, 0.55], [0.2, 0.35], [0.5, 0.62]]) {
      const x = Math.round(w * fx)
      const y = Math.round(h * fy)
      if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') return { x, y }
    }
    return null
  })
  check('the settlement view offers a spot to click on (point 691)', !!spot, JSON.stringify(spot))
  if (spot) {
    await page.mouse.click(spot.x, spot.y)
    await nextFrames(2)
    const afterClick = await page.evaluate(() => !!document.querySelector('.dialog.speech-guess'))
    check(
      'a left click on the settlement opens nothing — the mouse handler is gone (point 691)',
      afterClick === false,
      `guess dialog after the click: ${afterClick}`,
    )
    // And the note that survives that click is still the one E means, so the
    // invitation the player just read has not gone stale.
    const stillTargeted = await page.evaluate(
      () => document.querySelector('.speech-label.targeted')?.getAttribute('data-speaker') ?? null,
    )
    check(
      'the highlight survives the dead click (point 691)',
      stillTargeted === 'guess-speaker',
      `highlighted ${JSON.stringify(stillTargeted)}`,
    )
    const lockBefore = await page.evaluate(() => ({ ...window.__placeLock }))
    await page.keyboard.press('KeyE')
    await nextFrames(2)
    const opened = await page.evaluate(() => {
      const dialog = document.querySelector('.dialog.speech-guess')
      return {
        open: !!dialog,
        spoken: Array.from(dialog?.querySelectorAll('.utterance') ?? []).map((u) =>
          Array.from(u.querySelectorAll('span'))
            .map((s) => s.textContent)
            .join('-'),
        ),
        focused: document.activeElement?.className ?? '',
        lock: { ...window.__placeLock },
      }
    })
    check(
      'E opens the guess for the highlighted speaker (point 1139)',
      opened.open && opened.spoken.join(' ') === highlight.syllables.join(' '),
      `${JSON.stringify(opened.spoken)} against the note's ${JSON.stringify(highlight.syllables)}`,
    )
    check(
      'the pointer is given back when the dialog opens (point 588)',
      opened.lock.releases > lockBefore.releases,
      `releases ${lockBefore.releases} → ${opened.lock.releases}`,
    )
    check(
      'the field takes the keyboard the moment the dialog stands (point 588)',
      String(opened.focused).includes('hypothesis'),
      `focus on ${JSON.stringify(opened.focused)}`,
    )
    // The genuine article: real keystrokes, not a synthetic change event.
    await page.keyboard.type('come here')
    const typed = await page.evaluate(
      () => document.querySelector('.dialog.speech-guess .hypothesis')?.value ?? null,
    )
    check(
      'what the player types reaches the field (point 588)',
      typed === 'come here',
      `field reads ${JSON.stringify(typed)}`,
    )
    await frame('149-speech-guess-dialog', {
      element: '.dialog.speech-guess',
      label: 'the guess at what the villager just said',
    })
    await page.keyboard.press('Enter')
    await nextFrames(2)
    const saved = await page.evaluate(
      (u) => ({
        open: !!document.querySelector('.dialog.speech-guess'),
        reading: window.__game.getState().communication.heard[u]?.hypothesis ?? null,
        lock: { ...window.__placeLock },
      }),
      GUESS_UTTERANCE,
    )
    check(
      'Enter writes the reading into the same note the journal keeps (point 588)',
      !saved.open && saved.reading === 'come here',
      JSON.stringify(saved),
    )
    check(
      'the pointer is asked back when the dialog closes (point 588)',
      saved.lock.grabs > lockBefore.grabs,
      `grabs ${lockBefore.grabs} → ${saved.lock.grabs}`,
    )
    // And Escape leaves the note exactly as it was.
    await page.keyboard.press('KeyE')
    await nextFrames(2)
    const reopened = await page.evaluate(() => !!document.querySelector('.dialog.speech-guess'))
    if (reopened) await page.keyboard.type(' and never mind')
    await page.keyboard.press('Escape')
    await nextFrames(2)
    const cancelled = await page.evaluate(
      (u) => ({
        open: !!document.querySelector('.dialog.speech-guess'),
        reading: window.__game.getState().communication.heard[u]?.hypothesis ?? null,
      }),
      GUESS_UTTERANCE,
    )
    check(
      'Escape closes the guess and leaves the note unchanged (point 588)',
      reopened && !cancelled.open && cancelled.reading === 'come here',
      `reopened ${reopened}, ${JSON.stringify(cancelled)}`,
    )
  }
  await page.evaluate(
    ({ u, saved }) => {
      window.__game.getState().setUtteranceHypothesis(u, '')
      window.__speech?.clear()
      const p = window.__placePlayer
      if (!p || !saved) return
      p.x = saved.x
      p.z = saved.z
      p.yaw = saved.yaw
      p.pitch = saved.pitch
    },
    { u: GUESS_UTTERANCE, saved: guessPose },
  )
}

// --- Hold Ctrl inside a settlement (design.md §17.8, point 342) -------------
// The first-person half; the bird's-eye half is in enrichments.mjs. What is
// checked here is that the SAME layer answers in this perspective, over the
// inhabitants and their animals, and that it leaves nothing behind.
if (section('ctrl-actor-labels')) {
  await page.evaluate(() => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    if (g.placeId) g.leavePlace()
    g.enterPlace('maasai-village')
  })
  await page.waitForFunction(
    () => window.__game.getState().placeId === 'maasai-village' && !!window.__placeLayout,
    null,
    { timeout: 40000 },
  )
  await waitForSceneBuilt(page).catch(() => {})
  // Stand back from the middle and look at it: that is where the village lives.
  // The first entry just journaled itself and OPENED the journal panel — close
  // it again, so the frame below shows the crowd, not the diary over half of it.
  await page.evaluate(() => {
    window.__game.getState().setJournalOpen(false)
    const p = window.__placePlayer
    p.x = 0
    p.z = 14
    p.pitch = 0
    p.yaw = Math.atan2(-(0 - p.x), -(0 - p.z))
  })
  await nextFrames(3) // four drawn frames

  const idle = await page.evaluate(() => document.querySelectorAll('.actor-label').length)
  check('a settlement stands unlabelled while Ctrl is up (point 342)', idle === 0, `${idle} labels`)

  await page.keyboard.down('Control')
  // Poll for the layer instead of sleeping: it refreshes on its own interval
  // and this machine may be loaded.
  const appeared = await page
    .waitForFunction(() => (window.__actorLabels?.() ?? []).length > 0, null, { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  // BOTH readings must describe the SAME moment — the bird's-eye half of this
  // check already reads them that way (enrichments.mjs) and this half was the
  // one still reading them apart, one round trip at a time. The probe reports
  // the list the layer last rendered FROM, while every new label reaches the
  // DOM through drei's own portal root, which commits on its own schedule.
  // Measured 11.08.2026 under a 20× CPU throttle, on this branch and on `main`
  // alike: the settlement's ~20 labels then arrive roughly ONE PER FRAME, so a
  // state read one round trip before the DOM read reported 24 labels against 2
  // drawn — which is exactly how this check went red on the loaded WebGL 2 lane
  // while every label was correct. So: poll on the app's own frames until the
  // two agree and snapshot them in the SAME tick. If they never converge the
  // snapshot still comes back and the check below fails on it, which is the
  // defect this assertion is really for.
  const snapshot = await page.evaluate(
    () =>
      new Promise((res) => {
        let frames = 0
        const step = () => {
          const labels = window.__actorLabels ? window.__actorLabels() : null
          if (labels === null) return res(null)
          const rendered = [...document.querySelectorAll('.actor-label')].map((el) => el.textContent ?? '')
          if (rendered.length === labels.length || ++frames > 240) return res({ labels, rendered, frames })
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
  )
  const held = snapshot === null ? null : snapshot.labels
  const rendered = snapshot === null ? [] : snapshot.rendered
  check(
    "holding Ctrl names the settlement's people and animals (point 342)",
    !!held && held.length > 0 && rendered.length === held.length,
    held
      ? `${held.length} labels, ${rendered.length} drawn after ${snapshot.frames} frame(s) ` +
        `[${held.map((l) => l.kind).join(', ')}]: ${rendered.slice(0, 4).join(' | ')}`
      : `no layer (appeared: ${appeared})`,
  )
  // A settlement's actors are its INHABITANTS and their animals — nothing else
  // is drawn here that could pass for one.
  // The elder is not in this list on purpose: he carries his own standing label,
  // so the Ctrl layer leaves him to it (see PlaceScene's Villager).
  const INHABITANTS = ['villager', 'child', 'trader', 'porter', 'goat']
  check(
    'the named subjects are inhabitants or their animals (point 342)',
    !!held && held.length > 0 && held.every((l) => INHABITANTS.includes(l.kind)),
    held ? [...new Set(held.map((l) => l.kind))].join(', ') : 'no layer',
  )
  check(
    'no label is empty or an internal id (point 342)',
    rendered.length > 0 && rendered.every((t) => t.trim().length > 1 && t[0] === t[0].toUpperCase()),
    rendered.slice(0, 6).join(' | '),
  )
  // Nothing built or grown answers: no hut, wall, fence or plant.
  const SCENERY_WORDS = ['hut', 'wall', 'mauer', 'fence', 'zaun', 'roof', 'dach', 'tree', 'baum', 'rock', 'fels', 'grass', 'gras']
  const scenery = rendered.filter((t) => SCENERY_WORDS.some((w) => t.toLowerCase().includes(w)))
  check('no building, fence or plant is named (point 342)', scenery.length === 0, scenery.join(' | '))

  // NOTHING THE SETTLEMENT DRAWS IS INVISIBLE TO THE LAYER (point 600). The
  // bird's-eye defect was a figure drawn from a list no source walked, and the
  // same failure here would be an inhabitant drawn without a mark. Every figure
  // names ITSELF in the graph (`name="inhabitant"`, set by PlaceLife's Figure
  // for the speech label), so that name is an INDEPENDENT handle on the people
  // this scene really draws: each of them must carry an actor mark AND stand in
  // the layer's raw candidate set, whatever it is doing.
  const figures = await page.evaluate(() => {
    const cands = window.__actorCandidates ? window.__actorCandidates() : null
    if (!cands || !window.__placeScene) return null
    const drawn = []
    window.__placeScene.traverse((o) => {
      if (o.name !== 'inhabitant') return
      for (let n = o; n; n = n.parent) if (n.visible === false) return
      const m = o.matrixWorld.elements
      drawn.push({ x: m[12], z: m[14], kind: o.userData?.actor?.kind ?? null })
    })
    const unmarked = drawn.filter((f) => f.kind === null)
    const unoffered = drawn.filter(
      (f) => f.kind !== null && !cands.some((c) => c.kind === f.kind && Math.hypot(c.x - f.x, c.z - f.z) < 1.5),
    )
    return {
      total: drawn.length,
      unmarked: unmarked.length,
      unoffered: unoffered.length,
      kinds: [...new Set(drawn.map((f) => f.kind))],
    }
  })
  check(
    'every inhabitant figure the scene draws reaches the label layer (point 600)',
    !!figures && figures.total > 0 && figures.unmarked === 0 && figures.unoffered === 0,
    figures
      ? `${figures.total} figures [${figures.kinds.join(', ')}], ${figures.unmarked} unmarked, ` +
        `${figures.unoffered} not offered`
      : 'no candidate hook',
  )

  // And it rides them while they WALK: the settlement's states are motion, and
  // a label that stayed at the birthplace would be the same defect one layer
  // down. Polled on the app's own frames (point 177), never a wall-clock wait.
  const walking = await page.evaluate(
    () =>
      new Promise((res) => {
        const figuresNow = () => {
          const list = []
          window.__placeScene.traverse((o) => {
            if (o.name !== 'inhabitant') return
            const m = o.matrixWorld.elements
            list.push({ node: o, x: m[12], z: m[14], kind: o.userData?.actor?.kind ?? null })
          })
          return list
        }
        const start = new Map(figuresNow().map((f) => [f.node, { x: f.x, z: f.z }]))
        let frames = 0
        const step = () => {
          const moved = figuresNow().filter((f) => {
            const s = start.get(f.node)
            return s !== undefined && Math.hypot(f.x - s.x, f.z - s.z) > 0.25
          })
          if (moved.length > 0) {
            const cands = window.__actorCandidates()
            const named = moved.filter((f) =>
              cands.some((c) => c.kind === f.kind && Math.hypot(c.x - f.x, c.z - f.z) < 1.5),
            )
            res({ moved: moved.length, named: named.length, kinds: [...new Set(moved.map((f) => f.kind))], frames })
            return
          }
          if (++frames > 900) {
            res({ moved: 0, named: 0, kinds: [], frames })
            return
          }
          requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
  )
  check(
    'a walking inhabitant is named where it now stands (point 600)',
    walking.moved > 0 && walking.named === walking.moved,
    `${walking.named}/${walking.moved} moved figures named after ${walking.frames} frame(s) [${walking.kinds.join(', ')}]`,
  )

  // NO TWO DRAWN BOXES FUSE IN THIS CROWD (point 628). The label checks above
  // ask which TEXT is present and where its figure stands, never how its drawn
  // box lies — which is exactly what let the evidence
  // frame below read "Villager llager" while the whole suite was green: the
  // defective frame had been written by ANOTHER revision's run (main, 14.08,
  // before the declutter), and no assertion in THIS suite — the one that owns
  // the frame — ever measured a rectangle. The only rect check lived in the
  // sparse savanna half (enrichments.mjs). So the rects are measured HERE, in
  // the dense scene the defect was reported in, at the very state the frame
  // photographs — and SAMPLED over many frames rather than one instant, since
  // the declutter decides at the layer's 10 Hz refresh while the subjects walk
  // every frame (the verdict and its reasoning: scripts/verify/labelFusion.mjs).
  // The shutter is BRACKETED: one window before the frame, one after, judged as
  // one series — a sample that closed before the capture would certify a
  // picture it never measured (the Sol-review gap, 17.08.).
  const sampleFusion = (windowFrames) => page.evaluate(
    ({ TOLERANCE, HARD, SAMPLES }) =>
      new Promise((res) => {
        let sampled = 0
        let fusedFrames = 0
        // The frames whose deepest pair reached the unreadable bar. The depth is
        // judged on how many frames HOLD it, not on the single worst one it ever
        // reached (point 1067), so the count has to be carried out of the page.
        let deepFrames = 0
        let worstDepth = 0
        let worstPair = null
        let labelsMin = Infinity
        let labelsMax = 0
        const read = () => {
          const boxes = [...document.querySelectorAll('.actor-label')]
            .map((el) => {
              const r = el.getBoundingClientRect()
              return { text: (el.textContent ?? '').trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom }
            })
            .filter((b) => b.right > b.left && b.bottom > b.top)
          labelsMin = Math.min(labelsMin, boxes.length)
          labelsMax = Math.max(labelsMax, boxes.length)
          let fusedHere = false
          let deepHere = false
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i]
              const b = boxes[j]
              const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
              const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
              if (across > TOLERANCE && down > TOLERANCE) {
                fusedHere = true
                const depth = Math.min(across, down)
                if (depth >= HARD) deepHere = true
                if (depth > worstDepth) {
                  worstDepth = depth
                  worstPair = `"${a.text}"×"${b.text}" ${across.toFixed(0)}×${down.toFixed(0)} px`
                }
              }
            }
          }
          if (fusedHere) fusedFrames++
          if (deepHere) deepFrames++
          if (++sampled >= SAMPLES)
            return res({ samples: sampled, fusedFrames, deepFrames, worstDepth, worstPair, labelsMin, labelsMax })
          requestAnimationFrame(read)
        }
        requestAnimationFrame(read)
      }),
    { TOLERANCE: FUSE_TOLERANCE, HARD: FUSE_HARD, SAMPLES: windowFrames },
  )
  const fusionPre = await sampleFusion(45)

  await frame('148-ctrl-actor-labels-village', {
    place: 'maasai-village',
    label: 'the Maasai village with the Ctrl labels over its inhabitants',
  })

  const fusionPost = await sampleFusion(45)
  // The DENSE-CROWD cushion, not the sparse one (point 1067): this scene holds
  // roughly 17–24 labels, so a loaded lane's drift crosses the tolerance in several
  // frames of the ninety where the savanna twin sees none. The measurement
  // behind the number is in labelFusion.mjs beside FUSE_CROWD_SHARE.
  const fusionVerdict = judgeLabelFusion(mergeFusionReadings(fusionPre, fusionPost), { maxShare: FUSE_CROWD_SHARE })
  check('no two Ctrl labels fuse in the village crowd (point 628)', fusionVerdict.ok, fusionVerdict.detail)

  await page.keyboard.up('Control')
  const cleared = await page
    .waitForFunction(
      () => document.querySelectorAll('.actor-label').length === 0 && window.__actorLabels === undefined,
      null,
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false)
  check('releasing Ctrl clears the settlement labels too (point 342)', cleared, `cleared=${cleared}`)
}

// --- The chief comes out to his drummer (design.md §13.4, user 07.09.2026) -----
// He no longer speaks at his own door. The use key at the hut sends him out and
// ACROSS to the drummer; there the key at either man beats the message, and the
// player standing in front of the pair sees both from the front. Only a browser
// can answer this: it is a walking figure, a prompt that changes with his phase
// and a picture of two men.
if (section('chief-to-drummer')) {
  await goToPlace('bambara-village')
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))

  /** Stand at a spot, looking at another one, and let the frame carry it. */
  const standAt = async (at, lookAt) => {
    await page.evaluate(({ at, lookAt }) => {
      const p = window.__placePlayer
      if (!p) return
      p.x = at.x
      p.z = at.z
      // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
      p.yaw = Math.atan2(lookAt.x - p.x, lookAt.z - p.z) + Math.PI
    }, { at, lookAt })
    await nextFrames(3)
  }

  const hut = await page.evaluate(() => {
    const it = window.__placeLayout?.interactives.find((i) => i.type === 'chief')
    return it ? { pos: it.pos, door: it.door } : null
  })
  check('the village has a chief hut with a door', !!hut?.door, JSON.stringify(hut))

  // 1. The drummer names the man while the man is still indoors: he points at
  //    the hut and says CHIEF, one atom of the same language as everything else.
  const drummer = await page.evaluate(() => {
    const d = window.__placeSpots?.drummer
    return d ? { x: d[0], z: d[1], facing: Math.atan2(3.5 - d[0], 2.5 - d[1]) } : null
  })
  check('the village names where its drummer sits', !!drummer, JSON.stringify(drummer))
  const inFrontOf = (at, away) => ({ x: at.x + Math.sin(drummer.facing) * away, z: at.z + Math.cos(drummer.facing) * away })
  await standAt(inFrontOf(drummer, 2), drummer)
  // Wait for the prompt that NAMES this key, not for any prompt: another offer
  // standing at the same moment would make the press mean something else.
  // (Before the two keys of point 1139, a nearby word could take this key and
  // open a guess dialog — the arbitration of point 691.)
  const askDrummer = await page.evaluate(async () => {
    const { getStrings } = await import('/src/i18n/index.ts')
    return getStrings().labels.askDrummer
  })
  const drummerPrompt = await stepUntil(
    (want) => (document.querySelector('.prompt')?.textContent ?? '').includes(want),
    askDrummer,
  )
  check('the use key arms at the drummer', drummerPrompt, `waited for: ${askDrummer}`)
  await page.keyboard.press('Space')
  const named = await page
    .waitForFunction(
      () => window.__speech?.labels().find((l) => l.speakerId === 'drummer')?.atoms ?? null,
      null,
      { timeout: 20000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null)
  // CHIEF's word is rolled per run, so it is read from the run, not typed here.
  const chiefWord = await page.evaluate(() => window.__game.getState().vocabulary.CHIEF)
  check(
    'the drummer names the chief with one word of the language',
    Array.isArray(named) && named.length === 1 && named[0] === chiefWord,
    JSON.stringify({ named, chiefWord }),
  )

  // 1b. THE COLLISION THE TWO KEYS REMOVED (point 1139, user 16.09.2026). The
  //     player stands before the drummer with the drummer's own word standing
  //     over his head: under the one candidate list of point 691 the word and
  //     the man took the key from each other by a step's distance, and whichever
  //     lost went silent. Both offers must now stand AT ONCE — the bottom prompt
  //     naming what SPACE does, the note inviting E — and E must take the word
  //     without touching the man.
  // The note is chosen in the scene's OWN frame loop, so the label appearing in
  // the channel is not yet the note standing over his head — wait for the key it
  // arms, not for a clock, and read the diagnostic only if the wait ran out.
  const bothStood = await page
    .waitForFunction(
      () =>
        window.__ui.getState().guessKeyArmed === true &&
        !!document.querySelector('.speech-label.targeted .speech-invite') &&
        !!document.querySelector('.prompt')?.textContent,
      null,
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false)
  const bothOffers = await page.evaluate(() => ({
    prompt: document.querySelector('.prompt')?.textContent ?? null,
    invite: document.querySelector('.speech-label.targeted .speech-invite')?.textContent ?? null,
    targeted: document.querySelector('.speech-label.targeted')?.getAttribute('data-speaker') ?? null,
    guessKeyArmed: window.__ui.getState().guessKeyArmed,
  }))
  check(
    'the man and his word offer their keys at the same time (point 1139)',
    bothStood &&
      !!bothOffers.prompt &&
      bothOffers.guessKeyArmed === true &&
      bothOffers.targeted === 'drummer' &&
      /\bE\b/.test(bothOffers.invite ?? ''),
    JSON.stringify(bothOffers),
  )
  await frame('151b-two-keys-at-the-drummer', {
    local: { x: drummer.x, y: 1.4, z: drummer.z },
    label: "the drummer, his word inviting E over his head while the bottom prompt still offers SPACE at the man himself",
  })
  await page.keyboard.press('KeyE')
  const guessAtDrummer = await page
    .waitForFunction(() => !!document.querySelector('.dialog.speech-guess'), null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  const chiefCameOut = await page.evaluate(() => window.__game.getState().chiefOutside[window.__game.getState().placeId] === true)
  check(
    'E takes the word and leaves the man to SPACE (point 1139)',
    guessAtDrummer && !chiefCameOut,
    !guessAtDrummer
      ? 'no guess dialog opened at the drummer'
      : chiefCameOut
        ? 'the chief came out of his hut on the guess key'
        : 'the guess dialog opened and the chief stayed in his hut',
  )
  await page.evaluate(() => window.__ui.getState().setDialog(null))
  await nextFrames(2)

  // 2. The use key at the HUT sends him out — and he walks to the drummer.
  if (hut?.door) {
    await standAt({ x: hut.door[0], z: hut.door[1] }, { x: hut.pos[0], z: hut.pos[1] })
    const hutLabel = await page.evaluate(async () => {
      const { getStrings } = await import('/src/i18n/index.ts')
      return getStrings().buildings.chief
    })
    const hutPrompt = await stepUntil(
      (want) => (document.querySelector('.prompt')?.textContent ?? '').includes(want),
      hutLabel,
    )
    check('the use key arms at the chief hut door', hutPrompt, `waited for: ${hutLabel}`)
    await page.keyboard.press('Space')
    // He must be SEEN on the way, part of the path behind him and part still in
    // front: accepting 'at-drummer' here would let a chief who is teleported to
    // the drummer's side pass a check that claims he walked (GPT-6 Astra, pass
    // 3/9). The crossing takes seconds, so a walking man is sampled many times.
    const walking = await page
      .waitForFunction(
        () => window.__chief?.phase === 'walking-out' && window.__chief.progress > 0 && window.__chief.progress < 1,
        null,
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false)
    check('using the hut sets the chief walking out of it', walking, JSON.stringify(await page.evaluate(() => window.__chief ?? null)))
    // The hut is inert while he is outside: no prompt stands at that door any more.
    const hutSilent = await page.evaluate(() => (document.querySelector('.prompt')?.textContent ?? '').trim())
    check('the hut offers nothing while he is out of it', hutSilent === '', `prompt: ${hutSilent}`)
  }

  const stood = await page
    .waitForFunction(() => (window.__chief?.phase === 'at-drummer' ? window.__chief : null), null, { timeout: 40000 })
    .then((h) => h.jsonValue())
    .catch(() => null)
  check('he arrives and takes his stand beside the drummer', !!stood, JSON.stringify(stood))

  if (stood) {
    // 3. Where the PICTURE puts him: abreast of the drummer, facing the same way.
    const drawn = await page.evaluate(() => {
      const o = window.__placeScene?.getObjectByName('chief')
      if (!o) return null
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      return { x: e[12], y: e[13], z: e[14], yaw: o.rotation.y }
    })
    const beside = await page.evaluate(() => window.__balance.communication.chiefBesideDrummer)
    const away = drawn ? Math.hypot(drawn.x - stood.drummer[0], drawn.z - stood.drummer[1]) : null
    check(
      'the drawn chief stands one stride beside the drummer',
      !!drawn && Math.abs(away - beside) < 0.2,
      JSON.stringify({ away, beside, drawn }),
    )
    // Abreast: the offset between the two men is square to the way they look, so
    // neither stands in the other's picture from the front.
    const ahead = drawn
      ? Math.sin(stood.facing) * (drawn.x - stood.drummer[0]) + Math.cos(stood.facing) * (drawn.z - stood.drummer[1])
      : null
    check('the two men stand abreast, not one behind the other', Math.abs(ahead) < 0.2, `${ahead}`)
    check(
      'and the chief looks exactly where his drummer looks',
      !!drawn && Math.abs(Math.atan2(Math.sin(drawn.yaw - stood.facing), Math.cos(drawn.yaw - stood.facing))) < 0.02,
      JSON.stringify({ chief: drawn?.yaw, drummer: stood.facing }),
    )

    // 4. In FRONT of the pair, the key at the DRUMMER beats the message out.
    const mid = { x: (stood.x + stood.drummer[0]) / 2, z: (stood.z + stood.drummer[1]) / 2 }
    const front = { x: mid.x + Math.sin(stood.facing) * 5, z: mid.z + Math.cos(stood.facing) * 5 }
    await standAt(inFrontOf({ x: stood.drummer[0], z: stood.drummer[1] }, 2), mid)
    const askLabel = await page.evaluate(async () => {
      const { getStrings } = await import('/src/i18n/index.ts')
      return getStrings().labels.askForDrumMessage
    })
    const armed = await stepUntil(
      (want) => (document.querySelector('.prompt')?.textContent ?? '').includes(want),
      askLabel,
    )
    // What stood there instead, read only when the wait ran out: this check
    // failed once on a stale note of the drummer's holding SPACE — which the
    // two keys of point 1139 make impossible — and "no prompt" alone did not
    // say so.
    const armedWhy = armed
      ? null
      : await page.evaluate(() => ({
          prompt: document.querySelector('.prompt')?.textContent ?? null,
          guessKeyArmed: window.__ui.getState().guessKeyArmed,
          dialog: window.__ui.getState().dialog,
          speaking: window.__speech?.labels().map((l) => l.speakerId) ?? null,
          chief: window.__chief,
          player: { x: window.__placePlayer?.x, z: window.__placePlayer?.z },
        }))
    check(
      'the use key arms at the drummer with the chief standing there',
      armed,
      armedWhy ? `waited for: ${askLabel} — ${JSON.stringify(armedWhy)}` : `named: ${askLabel}`,
    )
    await page.keyboard.press('Space')
    const beating = await page
      .waitForFunction(() => !!window.__ui.getState().drumPerformance, null, { timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    check('the key at the drummer sends the message out on the drums', beating, 'no drum performance started')

    // 5. THE PICTURE: chief and drummer from the front, while the drums speak.
    await standAt(front, mid)
    await frameSpeakingDrums(page, OUT, '151-chief-beside-his-drummer', {
      local: { x: mid.x, y: 1.4, z: mid.z },
      label: 'the chief standing beside his drummer, both seen from the front while the errand is beaten out',
    }, 'errand')

    // 6. Once it has been heard, the same key offers the REPEAT.
    const heard = await page
      .waitForFunction(() => window.__game.getState().drumMessageHeard.errand === true &&
        window.__ui.getState().drumPerformance === null, null, { timeout: 40000 })
      .then(() => true)
      .catch(() => false)
    check('the message enters the heard memory once it has been beaten out', heard, 'never recorded or drumPerformance still running')
    await page.evaluate(() => window.__ui.getState().setDialog(null))
    await standAt(inFrontOf({ x: stood.drummer[0], z: stood.drummer[1] }, 2), mid)
    const repeatLabel = await page.evaluate(async () => {
      const { getStrings } = await import('/src/i18n/index.ts')
      return getStrings().labels.repeatDrumMessage
    })
    // Waited for BY NAME, exactly like the ask above. A spoken word can no longer
    // take the prompt away from the drummer (point 1139: the word answers E, the
    // drummer SPACE), but the chief's own minute still runs — the offer must
    // STAND while the player stands there, which is what the wait asks.
    const offered = await stepUntil(
      (want) => (document.querySelector('.prompt')?.textContent ?? '').includes(want),
      repeatLabel,
    )
    // Read only when the wait ran out, and it names what stood there instead:
    // the chief's own minute had run out under the player and he was already
    // walking home, or no candidate armed the key at all.
    const offeredWhy = offered
      ? null
      : await page.evaluate(() => ({
          prompt: document.querySelector('.prompt')?.textContent ?? null,
          guessKeyArmed: window.__ui.getState().guessKeyArmed,
          speaking: window.__speech?.labels().map((l) => l.speakerId) ?? null,
          chief: window.__chief,
          heard: window.__game.getState().drumMessageHeard,
        }))
    check(
      'and the prompt then offers to have it beaten again',
      offered,
      offeredWhy ? `waited for: ${repeatLabel} — ${JSON.stringify(offeredWhy)}` : `named: ${repeatLabel}`,
    )
  }
}

// --- The find from the boulder is GIVEN by using it (design.md §6, user 06.09.2026) --
// The whole act, end to end, in the picture: the thing dug up at the erratic
// stands in the inventory bar under its own localized name, a click before the
// chief who is out in the open lays it in his hands, the drums beat his
// answer, and the bar loses it. Out of reach the same click gives nothing.
// Only a browser can answer this: the bar is HTML, the chief is a drawn figure,
// and the reach is measured between the two live positions the scene writes.
if (section('artefact-give')) {
  const FIND = '[data-find="rockArtefact"]'
  // Dig it up first, out on the map — the bar shows the find only from the
  // moment the shovel reaches it. The site comes from the game's OWN placement
  // module, never from a coordinate written down here.
  const dug = await page.evaluate(async () => {
    const g = () => window.__game.getState()
    if (g().placeId) g().leavePlace()
    const rock = await import('/src/world/communicationRock.ts')
    const site = rock.communicationRockSite(g().seed)
    g().debugAddEquipment('shovel')
    g().debugJumpTo(site.lat, site.lon)
    g().dig()
    return g().rockArtefact
  })
  check('digging at the erratic puts the find in the pack', dug === 'carried', `rockArtefact=${dug}`)

  await goToPlace('bambara-village')
  await page.evaluate(() => window.__game.getState().callChiefOut())
  // He walks across to his drummer before he is met (design.md §13.4): wait for
  // him to have ARRIVED, or every measurement below is taken off a man mid-stride.
  await page.waitForFunction(() => window.__chief?.phase === 'at-drummer', null, { timeout: 30000 })
  // The dig and the arrival both write a page, and a new entry opens the book:
  // every frame below is of the village and the bar, not of the journal.
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await waitForStable(page)
  // The chief's own figure, read out of the drawn scene: everything below is
  // measured against where the PICTURE puts him.
  const chiefStood = await page
    .waitForFunction(
      () => {
        const o = window.__placeScene?.getObjectByName('chief')
        if (!o) return null
        o.updateWorldMatrix(true, false)
        const e = o.matrixWorld.elements
        return { x: e[12], y: e[13], z: e[14] }
      },
      null,
      { timeout: 20000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null)
  check('the chief stands out in the open, drawn in the scene', !!chiefStood, JSON.stringify(chiefStood))
  // The open ground he faces: standing beside the drummer he looks exactly where
  // the drummer looks, so the ground in front of the pair is where the traveller
  // stands to be seen by both. The scene hands the bearing over rather than
  // having it transcribed here.
  const outward = await page.evaluate(() => {
    const yaw = window.__chief?.facing
    return typeof yaw === 'number' ? { x: Math.sin(yaw), z: Math.cos(yaw) } : null
  })
  check('the pair names the open ground they face', !!outward, JSON.stringify(outward))

  if (chiefStood && outward) {
    const reach = await page.evaluate(() => window.__balance.communication.giveReach)
    /** Stand `away` metres in front of the chief, on the open ground he faces
     *  beside the drummer (`outward`), looking at him — the pose the player
     *  gives the find in. */
    const standOff = async (away) => {
      await page.evaluate(
        ({ at, dir, away }) => {
          const p = window.__placePlayer
          if (!p) return
          p.x = at.x + dir.x * away
          p.z = at.z + dir.z * away
          // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
          p.yaw = Math.atan2(at.x - p.x, at.z - p.z) + Math.PI
          // And LEVEL. The pitch survives everything this section does to the
          // traveller — the map jump to the erratic, the dig, the walk back into
          // the village — so whatever the block before it last looked at is
          // still the angle this one photographs from.
          p.pitch = 0
        },
        { at: chiefStood, dir: outward, away },
      )
      // The scene publishes the player's position per FRAME; the reach is read
      // from that, so the new stand must be drawn before the click.
      await nextFrames(3)
    }

    // Composed from a step and a half away, facing him: near enough to give,
    // far enough that the man, his hut and the bar are all in the picture.
    await standOff(reach * 0.9)
    // 1. The find is in the bar, under its own localized name, as a thing that
    //    ACTS on a click — the same shape medicine and the shovel carry.
    const inBar = await page.evaluate(async (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const { getStrings } = await import('/src/i18n/index.ts')
      return {
        tag: el.tagName, text: el.textContent, expected: getStrings().finds.rockArtefact,
        shortcut: el.querySelector('.inv-digit')?.textContent ?? '',
      }
    }, FIND)
    check(
      'the find stands in the inventory bar under its own localized name',
      !!inBar && inBar.tag === 'BUTTON' && inBar.text === inBar.shortcut + inBar.expected && inBar.expected.length > 0,
      JSON.stringify(inBar),
    )
    await frame('149-artefact-in-the-bar', {
      element: '.inventory-bar',
      label: 'the find from the boulder standing in the inventory bar before it is given',
    })

    // 2. Out of reach the click gives NOTHING and says why.
    await standOff(reach + 2)
    await page.locator(FIND).click()
    await nextFrames(3)
    const refused = await page.evaluate((sel) => ({
      state: window.__game.getState().rockArtefact,
      toast: document.querySelector('.toast')?.textContent ?? null,
      stillThere: !!document.querySelector(sel),
    }), FIND)
    check(
      'used from across the village it hands nothing over, says why and keeps the find',
      refused.state === 'carried' && !!refused.toast && refused.toast.length > 0 && refused.stillThere,
      JSON.stringify(refused),
    )

    // 3. Face to face it IS the hand-over.
    await standOff(reach * 0.9)
    await page.locator(FIND).click()
    const given = await page.evaluate((sel) => ({
      state: window.__game.getState().rockArtefact,
      gone: document.querySelector(sel) === null,
      forms: window.__game.getState().carriedForms,
      message: window.__ui.getState().drumPerformance?.plan.message ?? null,
      atoms: window.__ui.getState().drumPerformance?.plan.atoms ?? null,
    }), FIND)
    check('using the find before him lays it in his hands', given.state === 'given', JSON.stringify(given.state))
    check('the find leaves the bar the moment it is given', given.gone, `still in the bar: ${!given.gone}`)
    check('and the clay impression takes its place in the pack', given.forms.includes('rock-relief'), JSON.stringify(given.forms))
    check(
      'the give starts his two-word answer on the drums',
      given.message === 'answer' && given.atoms?.length === 2,
      JSON.stringify(given),
    )
    // Frame BOTH men from the front. The actual give was checked at its reach;
    // the picture asks for a normal repeat once the composed scene is ready.
    const pair = await page.evaluate(() => window.__chief)
    const mid = { x: (pair.x + pair.drummer[0]) / 2, z: (pair.z + pair.drummer[1]) / 2 }
    await page.evaluate(({ at, dir }) => {
      window.__game.getState().setJournalOpen(false)
      const p = window.__placePlayer
      p.x = at.x + dir.x * 7
      p.z = at.z + dir.z * 7
      p.yaw = Math.atan2(at.x - p.x, at.z - p.z) + Math.PI
      p.pitch = 0
    }, { at: mid, dir: outward })
    await frameSpeakingDrums(page, OUT, '150-artefact-chiefs-answer', {
      local: { x: mid.x, y: chiefStood.y + 1, z: mid.z },
      label: 'the drummer beating the answer with the chief beside him after the find was given',
    }, 'answer')
    // The photographed repeat has its OWN last beat. The heard flag is already
    // true from the give, so it cannot tell us when this display is ready.
    await page.waitForFunction(() => {
      const ui = window.__ui.getState()
      return ui.drumPerformance === null && ui.dialog?.kind === 'drumMessage' &&
        ui.dialog.message === 'answer' && document.querySelectorAll('.drum-message .drum-concept').length === 2
    }, null, { timeout: 40000 })
    const answered = await page.evaluate(() => ({
      message: window.__ui.getState().dialog?.message,
      concepts: document.querySelectorAll('.drum-message .drum-concept').length,
    }))
    check('the finished answer opens its two-concept display', answered.message === 'answer' && answered.concepts === 2, JSON.stringify(answered))

  }
}

await finishPolishSuite()
