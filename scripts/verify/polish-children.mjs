// Headless polish verification, theme polish-children: the children's games: tag,
// the catch, how the children move, the bank round and the child up on a stone
// (design.md §19.10).
// Dev server only. Split out of polish.mjs by theme; the boot and the shared
// helpers live in ./_polish.mjs, and every section below owns its staging.
import { assertBackend } from './_browser.mjs'
import { waitForSceneReady } from './frameSubject.mjs'
import { AXIS_SAMPLES, CONFIRMED_RATIO, KID_HEIGHT, MIN_CHILD_PIXELS, OCCLUDED_RATIO, describeReading, judgeChildFigure, judgeTagStandpoint } from './tagFrameReading.mjs'
import { CHILD_MOTION, holdsAGame, judgedEnough, rescueRate, shuffleWindows, traceLiveness } from './childMotionMetric.mjs'
import { section, check, page, frame, nextFrames, stepUntil, goToPlace, finishPolishSuite } from './_polish.mjs'

// --- The children's game of tag (design.md §19.10, point 480/351) ------------
// What needs a real browser is that the RAF-driven chase is a GAME and not a
// route: the pure round is pinned in src/scenes/place/tagGame.test.ts, but only
// the live scene can show that the paths are not periodic, that the gap between
// chaser and quarry breathes, that the role really moves, and that a child is
// seen running out of steam. Sampled over an interval that opens once a round is
// in play and runs on through the breaks — the group idles between rounds by
// design, so the checks below judge playing samples and breaks apart.
if (section('children-tag')) {
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
      const edgeAt = window.__placeBoundaryRadius
      return window.__placeTag().children.filter((c) => Math.hypot(c.x, c.z) > edgeAt(Math.atan2(c.z, c.x))).length
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
    // Three rules earned by looking at what the earlier tries actually produced:
    // aim at the CHASER AND ITS QUARRY — the pair IS the game, while the group
    // centroid drifts to wherever the stragglers are and framed a tree and an
    // empty paddock; keep the VILLAGE BEHIND THEM (point 524) — the first clear
    // sight line is as often the one looking OUT of the village across open
    // ground, which is the frame that passed every check and showed one child on
    // an empty plain; and stand on the bearing that does it, rather than at the
    // first one that is merely unobstructed. Every bearing is ray-probed against
    // the RENDERED scene for an unobstructed line and scored by PROJECTING the
    // children and the buildings through the live camera (§7.2), never by a
    // radius.
    //
    // The bearing is given as an OFFSET from the one that looks inward: the
    // camera stands outside the pair on the settlement's own radius, so what
    // lies beyond them is the village. The offset fans out from there, and every
    // candidate is validated where it stands (see the standpoint note below).
    const standAt = async (offset, back = 5.5) =>
      page.evaluate(
        ({ b, back }) => {
          const t = window.__placeTag()
          const p = window.__placePlayer
          const L = window.__placeLayout
          if (!t || !p || !t.children.length) return null
          // The pair the game is about, falling back to the group's middle
          // between rounds.
          const a = t.chaser >= 0 ? t.children[t.chaser] : null
          const q = t.target >= 0 ? t.children[t.target] : null
          const cx = a && q ? (a.x + q.x) / 2 : t.children.reduce((s2, c) => s2 + c.x, 0) / t.children.length
          const cz = a && q ? (a.z + q.z) / 2 : t.children.reduce((s2, c) => s2 + c.z, 0) / t.children.length
          // Outward from the settlement centre through the pair: standing there
          // and looking back puts the village behind them.
          const bearing = Math.atan2(cx, cz) + b
          let step = back
          // Never past the walkable rim — stepping over it LEAVES the place, and
          // the shot would be taken from outside the village or not at all.
          const rim = (L ? L.radius : 28) - 1.5
          while (step > 2.5 && Math.hypot(cx + Math.sin(bearing) * step, cz + Math.cos(bearing) * step) > rim) {
            step -= 0.5
          }
          if (step <= 2.5) return { cx, cz, tooFar: true }
          p.x = cx + Math.sin(bearing) * step
          p.z = cz + Math.cos(bearing) * step
          // Place-camera yaw 0 looks toward −Z, hence the +PI complement.
          p.yaw = Math.atan2(cx - p.x, cz - p.z) + Math.PI
          p.pitch = -0.05
          return { cx, cz, back: step }
        },
        { b: offset, back },
      )
    /**
     * MEASURE the picture this standpoint would write, and let
     * scripts/verify/tagFrameReading.mjs judge the numbers.
     *
     * Projection ALONE is not enough, and that lesson cost two pictures. The
     * first: a frame in which the pair projects inside the viewport can still be
     * a frame of the huts they are standing behind — so each of the two is
     * ray-probed against the RENDERED scene, and the first surface drawn must be
     * the CHILD ITSELF, which is what its distance says. The second: the probe
     * was ONE ray at chest height, and the settlement's boulder line hid the
     * children to the shoulders while leaving exactly that ray clear. Forty
     * pixels of head over the rocks passed every check and was rejected by eye.
     *
     * So the reading is taken along the child's WHOLE axis (AXIS_SAMPLES) and
     * its on-screen EXTENT is measured — feet and crown projected through the
     * live camera, the pixel height read off the real viewport (§7.2: project to
     * the rendered frame, never assume a radius or a distance).
     *
     * And it counts the VILLAGE BEHIND THEM (point 524): the buildings the
     * layout draws, projected the same way, that stand FURTHER from the camera
     * than the pair does. That is the difference between a game of tag in a
     * settlement and two figures on a plain, and no check saw it before.
     */
    const view = page.viewportSize()
    const readsFromHere = () =>
      page.evaluate(
        ({ KID_HEIGHT, AXIS_SAMPLES, OCCLUDED_RATIO, CONFIRMED_RATIO, width, height }) => {
          const t = window.__placeTag()
          const cam = window.__placeCamera
          if (!t || !cam || !window.__placeRayHit) return { clear: false, inFrame: 0, behind: 0, children: [] }
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
          const ndc = (x, y, z) => {
            const eyeAt = apply(cam.matrixWorldInverse.elements, [x, y, z, 1])
            const clip = apply(cam.projectionMatrix.elements, eyeAt)
            const w = clip[3]
            if (!(w > 0) || clip[2] / w >= 1) return null
            return [clip[0] / w, clip[1] / w]
          }
          /** One child as the frame would show it: where, how tall, how much of
           *  it something else is standing in front of. */
          const reads = (c) => {
            if (!c) return null
            const ndcFeet = ndc(c.x, 0, c.z)
            const ndcHead = ndc(c.x, KID_HEIGHT, c.z)
            if (!ndcFeet || !ndcHead) return { pixels: 0, occluded: 0, confirmed: 0, ndcFeet: null, ndcHead: null }
            let occluded = 0
            let confirmed = 0
            for (const f of AXIS_SAMPLES) {
              const hit = window.__placeRayHit(c.x, KID_HEIGHT * f, c.z)
              // Nothing drawn at all on that line is not an occluder — it is a
              // ray that sailed past a thin figure into the sky.
              if (hit.hitDistance == null) continue
              const ratio = hit.hitDistance / hit.targetDistance
              if (ratio < OCCLUDED_RATIO) occluded++
              else if (ratio <= CONFIRMED_RATIO) confirmed++
            }
            // NDC spans 2 over the viewport's height, so half of it is the frame.
            return { pixels: (Math.abs(ndcHead[1] - ndcFeet[1]) / 2) * height, occluded, confirmed, ndcFeet, ndcHead }
          }
          // The pair carries the picture: a frame holding two stragglers while
          // the chase runs off-screen shows village life, not a game of tag.
          const children = [reads(a), reads(q)]
          // How many of the whole group the frame holds — projection only, no
          // rays: it is reported, never judged, and a ray probe per child per
          // bearing would multiply the sweep's cost for a detail string.
          const inFrame = t.children.filter((c) => {
            const p = ndc(c.x, KID_HEIGHT / 2, c.z)
            return p && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1
          }).length
          // What stands BEHIND them: the settlement's own buildings, in frame and
          // further away than the children are.
          const L = window.__placeLayout
          const eye = cam.position
          const pairDistance = Math.hypot(cx - eye.x, cz - eye.z)
          const fabric = L
            ? L.dwellings
                .map((d) => [d.x, d.z])
                .concat(L.interactives.filter((it) => it.type !== 'villager').map((it) => it.pos))
            : []
          let behind = 0
          let nearestWall = Infinity
          for (const [bx, bz] of fabric) {
            const away = Math.hypot(bx - eye.x, bz - eye.z)
            nearestWall = Math.min(nearestWall, away)
            if (away <= pairDistance) continue
            const p = ndc(bx, 1.2, bz)
            if (p && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1) behind++
          }
          // How far apart the two are: a pair that has just sprinted apart fills
          // the frame with the ground between them, and one of the two is out of
          // it again by the time the shutter opens.
          const gap = a && q ? Math.hypot(a.x - q.x, a.z - q.z) : Infinity
          // How far apart the two stand ACROSS the frame. NDC x spans 2 over the
          // viewport's WIDTH — this is the one measurement taken against the
          // width rather than the height.
          const separation =
            children[0]?.ndcFeet && children[1]?.ndcFeet
              ? (Math.abs(children[0].ndcFeet[0] - children[1].ndcFeet[0]) / 2) * width
              : 0
          return { clear, inFrame, behind, gap, nearestWall, separation, children }
        },
        {
          KID_HEIGHT,
          AXIS_SAMPLES,
          OCCLUDED_RATIO,
          CONFIRMED_RATIO,
          width: view?.width ?? 1440,
          height: view?.height ?? 900,
        },
      )
    // The sweep is RETRIED as the game runs, and that is not a courtesy to a
    // slow machine: a chase that is momentarily boxed between two huts offers no
    // clear line from any bearing, which is a passing state of the game and not
    // a defect in it. A single sweep made that moment fail the whole suite.
    // Three ranges are tried before each wait: 5.5 m is the composition that was
    // accepted, 4.5 m is the way PAST an occluder — the boulder line stands
    // between the play ground and the settlement's rim, so a lens on the village
    // side of it sees the children whole where one behind it saw two heads —
    // and 8.5 m the fallback for a pair that has just sprinted apart.
    //
    // THE STANDPOINT IS SHOT FROM WHERE IT WAS VALIDATED. Scoring the bearings
    // and then re-standing on the winner looked tidier and produced a frame of
    // the inside of a hut: re-standing recomputes the aim against a pair that
    // has run on, so the camera lands 5.5 m from somewhere nobody validated. The
    // reading is taken again a few frames on, too, because the children keep
    // running — and only a standpoint that still holds both of them opens it.
    //
    // The offsets fan out from the inward-looking bearing rather than sweeping
    // the circle from due north, so the bearings tried first are those most
    // likely to have the village behind the pair; the first that qualifies is
    // taken (no bearing is compared against another), and it is still shot from
    // where it was validated.
    const OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8].map((n) => (n / 16) * Math.PI * 2)
    // THE PICTURE IS WAITED FOR ONCE, HERE — before the sweep, not between the
    // reading and the shutter. The shutter opens only on a scene that has been
    // quiet for five seconds, and the children run through those five seconds:
    // the first retaken frame was JUDGED with the pair 251 px apart and WRITTEN
    // with them almost touching, which is the same green-check-wrong-picture
    // shape this point is about. Taking the wait up front and shooting the
    // validated instant (`sceneReady: false` below) keeps the two together.
    await waitForSceneReady(page).catch(() => {})
    let stood = null
    let shotProbe = 'no readable standpoint in any sweep'
    let bestSeen = 'nothing read from any bearing'
    // Six attempts, not four: the pair must now also stand APART on screen, and
    // that is a state of the game the sweep waits for rather than one it can
    // choose — a sweep landing entirely inside the seconds after a catch finds
    // nothing however many bearings it tries.
    for (let attempt = 0; attempt < 6 && !stood; attempt++) {
      for (const back of [5.5, 4.5, 8.5]) {
        for (let k = 0; k < OFFSETS.length && !stood; k++) {
          const at = await standAt(OFFSETS[k], back)
          if (!at) break
          if (at.tooFar) continue
          await nextFrames(2)
          const r = await readsFromHere()
          const verdict = judgeTagStandpoint(r)
          if (!verdict.ok) {
            bestSeen = `last read: ${describeReading(r)} — ${verdict.reason}`
            continue
          }
          // It reads from here NOW — does it still, a few frames on? Only then
          // is this the frame.
          await nextFrames(4)
          const still = await readsFromHere()
          const settled = judgeTagStandpoint(still)
          if (settled.ok) {
            stood = at
            shotProbe =
              `attempt ${attempt + 1}, ${at.back.toFixed(1)} m, offset ${k}/${OFFSETS.length}: ` +
              `${describeReading(still)} inFrame=${still.inFrame}`
          }
        }
        if (stood) break
      }
      if (!stood) await nextFrames(60)
    }
    check(
      `the game is photographable: both children read whole, apart and at least ${MIN_CHILD_PIXELS} px tall, unoccluded, WITH the village behind them (point 524)`,
      !!stood,
      stood ? shotProbe : `${shotProbe}; ${bestSeen}`,
    )
    if (stood) {
      // The subject is A CHILD (point 524), read where it is NOW rather than
      // where the pair was when the standpoint was picked: the settle delay
      // above is six frames of running children, and the shutter must be told
      // what it is actually looking at. The midpoint between the two stays only
      // as the fallback when no chaser is published — a midpoint is a patch of
      // ground and projects into an empty plain as happily as into a game of tag.
      const subject = await page.evaluate(() => {
        const t = window.__placeTag()
        if (!t || t.chaser < 0) return null
        const a = t.children[t.chaser]
        return { x: a.x, z: a.z }
      })
      const aim = subject ?? { x: stood.cx, z: stood.cz }
      await frame('480-village-tag', {
        local: { x: aim.x, y: 0.6, z: aim.z },
        label: 'the child who is IT, with the village behind the chase',
        // The scene was waited for BEFORE the sweep (see above) and this
        // standpoint's picture has just been ray-probed and projected — which is
        // a stronger proof that the picture is there than a triangle count that
        // has stopped moving. The shutter's own five-second settle would only
        // buy the children time to run out of the frame it validated, and a
        // reading taken on the far side of the shutter is no remedy: measured
        // here, it reports a moment LATER than the pixels and called an occluder
        // on a frame that shows both children whole.
        sceneReady: false,
      })
    }
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}

// --- The game of tag reads at a glance (work-order 1176) ----------------------
// In a PORT at the default zoom: the catch frame itself, held by the dev
// shutter, with the catcher's reaching hand ON the caught child — judged off
// the DRAWN hand pivots against the caught child's drawn trunk, never assumed —
// and a frame late in the caught child's beat with the catcher-that-was already
// away from it. The catcher's forward arms are read off the same pivots, set
// against a runner's hanging ones.
if (section('tag-catch')) {
  await goToPlace('cairo')
  const live = await page
    .waitForFunction(() => window.__game.getState().placeId === 'cairo' && !!window.__placeTag && !!window.__placeHoldCatch, null, { timeout: 40000 })
    .then(() => true)
    .catch(() => false)
  check('the port children publish their live game of tag and the catch shutter', live)
  if (live) {
    const played = await page
      .waitForFunction(() => window.__placeTag().playing && window.__placeTag().chaser >= 0, null, { timeout: 60000 })
      .then(() => true)
      .catch(() => false)
    check('a round of tag is in play in the port', played)

    // THE CATCHER'S ARMS, read off the hand pivots. A frame in which the chaser
    // chases WITHOUT a grab playing (outside the commit distance) is waited for
    // and read in the same page call as the round, so both describe one frame.
    const arms = await page
      .waitForFunction(() => {
        const t = window.__placeTag()
        if (!t.playing || t.chaser < 0) return null
        const c = t.children[t.chaser]
        if (c.body !== 'chaser' || (c.gesture && c.gesture.kind)) return null
        const runner = t.children.findIndex((k, i) => i !== t.chaser && k.body === 'runner' && !(k.gesture && k.gesture.kind))
        if (runner < 0) return null
        return { chaser: window.__placeTagHands(t.chaser), runner: window.__placeTagHands(runner) }
      }, null, { timeout: 60000, polling: 'raf' })
      .then((h) => h.jsonValue())
      .catch(() => null)
    // Body heights, in the child's own frame: +z forward, +y up. A hanging arm
    // ends near z 0 (a run's lean carries it a little forward); the catcher's
    // hands stand out in front at chest height.
    const forward = (h) => h.local.z > 0.25 && h.local.y > 0.4 && h.local.y < 0.8
    check(
      "the catcher's two hands are held forward at chest height, read off the drawn pivots",
      !!arms && arms.chaser?.length === 2 && arms.chaser.every(forward),
      arms ? JSON.stringify(arms.chaser?.map((h) => h.local)) : 'no chasing frame without a grab',
    )
    check(
      "while a runner's hands hang at its sides",
      !!arms && arms.runner?.length === 2 && arms.runner.every((h) => h.local.z < 0.15),
      arms ? JSON.stringify(arms.runner?.map((h) => h.local)) : 'no runner frame',
    )

    // Side-on to the pair, a few metres off, on a line the rendered scene
    // leaves clear to the subject — both sides tried at 3.2 m, then 4.2 m, then 2.6 m.
    // Each candidate is stood on, DRAWN, and only then ray-probed: the camera
    // follows the player pose in the next frame, not in the call that sets it.
    const standBeside = async (from, to, subject) => {
      for (const back of [3.2, 4.2, 2.6]) {
        for (const side of [1, -1]) {
          const placed = await page.evaluate(
            ({ from, to, back, side, subject }) => {
              const p = window.__placePlayer
              const L = window.__placeLayout
              if (!p) return false
              const ux = to.x - from.x
              const uz = to.z - from.z
              const n = Math.hypot(ux, uz) || 1
              const mx = (from.x + to.x) / 2
              const mz = (from.z + to.z) / 2
              const x = mx + ((side * uz) / n) * back
              const z = mz + ((-side * ux) / n) * back
              if (Math.hypot(x, z) > (L ? L.radius : 28) - 1.5) return false
              p.x = x
              p.z = z
              // Aimed at the SUBJECT, not the pair's middle: the pair may have
              // run apart. Place-camera yaw 0 looks toward −Z, hence the +PI.
              p.yaw = Math.atan2(subject.x - x, subject.z - z) + Math.PI
              p.pitch = -0.28
              return true
            },
            { from, to, back, side, subject },
          )
          if (!placed) continue
          await nextFrames(3)
          // Collision may have moved the drawn camera off the requested spot: re-aim
          // from where it really stands, pitch included, and refuse a spot so close
          // that the subject falls off the bottom edge.
          const aimed = await page.evaluate((q) => {
            const p = window.__placePlayer
            const probe = window.__placeRayHit?.(q.x, 0.3, q.z)
            if (!p || !probe) return false
            const h = Math.hypot(q.x - p.x, q.z - p.z)
            if (h < 2) return false
            const dy = Math.sqrt(Math.max(0, probe.targetDistance ** 2 - h ** 2))
            p.yaw = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI
            p.pitch = -Math.atan2(dy + 0.3 - 0.35, h)
            return true
          }, subject)
          if (!aimed) continue
          await nextFrames(3)
          const hit = await page.evaluate((q) => window.__placeRayHit?.(q.x, 0.3, q.z) ?? null, subject)
          if (hit && (hit.hitDistance == null || hit.hitDistance >= hit.targetDistance * 0.9)) return { back }
        }
      }
      return null
    }

    // THE CATCH FRAME, held by the shutter the moment the hand lands.
    await page.evaluate(() => window.__placeHoldCatch('catch'))
    const shot = await page
      .waitForFunction(() => {
        const t = window.__placeTag()
        return t.catchHeld && t.catchShot ? t.catchShot : null
      }, null, { timeout: 120000 })
      .then((h) => h.jsonValue())
      .catch(() => null)
    check('a catch is held at its own frame', !!shot)
    if (shot) {
      check(
        "at the catch frame the catcher's drawn hand is ON the caught child (within one child hand radius of its body)",
        shot.gap <= shot.handRadius,
        `${shot.hand} ${(shot.gap * 100).toFixed(1)} cm off the trunk (hand radius ${(shot.handRadius * 100).toFixed(1)} cm), catcher ${shot.catcher} → caught ${shot.caught}`,
      )
      await nextFrames(2)
      const stood = await standBeside(shot.catcherAt, shot.caughtAt, shot.caughtAt)
      check('a clear side-on standpoint on the catch', !!stood, stood ? `${stood.back} m` : 'every standpoint occluded')
      if (stood) {
        await frame('1176-tag-catch', {
          local: { x: shot.caughtAt.x, y: 0.35, z: shot.caughtAt.z },
          label: "the catch frame: the catcher's reaching hand on the caught child, in the port at default zoom",
        })
      }
    }
    await page.evaluate(() => window.__placeHoldCatch(null))

    // THE BEAT: a frame late in the caught child's stand, the runner away.
    await page.evaluate(() => window.__placeHoldCatch('beat'))
    const beat = await page
      .waitForFunction(() => {
        const t = window.__placeTag()
        return t.catchHeld && t.beatShot ? t.beatShot : null
      }, null, { timeout: 120000 })
      .then((h) => h.jsonValue())
      .catch(() => null)
    check('a frame late in the caught child\'s beat is held', !!beat)
    if (beat) {
      const catchRing = await page.evaluate(() => window.__balance.villageLife.tag.catchDistance)
      check(
        'through its beat the caught child stands (no pace, arms dropped) while the catcher-that-was is already away',
        // Away = outside the catch ring and moving. No margin beyond the ring: a
        // catcher-that-was with a spent reserve leaves at its recovery pace, which
        // is the landed stamina model, not a runner that stays.
        beat.body === 'caught' && beat.caughtPace === 0 && beat.apart != null && beat.apart > catchRing && (beat.runnerPace ?? 0) > 0,
        JSON.stringify(beat),
      )
      await nextFrames(2)
      const stood = await standBeside(beat.caughtAt, beat.runnerAt ?? beat.caughtAt, beat.caughtAt)
      check('a clear side-on standpoint on the beat', !!stood, stood ? `${stood.back} m` : 'every standpoint occluded')
      if (stood) {
        await frame('1176-tag-beat', {
          local: { x: beat.caughtAt.x, y: 0.35, z: beat.caughtAt.z },
          label: 'the caught child standing out its beat, the catcher-that-was already running off',
        })
      }
    }
    await page.evaluate(() => window.__placeHoldCatch(null))
  }
}

// --- How the children MOVE (work-order 648) ----------------------------------
// The user reported three things from one state in the Bambara village: a child
// hangs briefly, a child jitters on the spot, two children clip through each
// other. All three are the same system, and the pure layer pins each cause
// (src/scenes/place/tagGame.test.ts, inhabitantBodies.test.ts). What needs a
// real browser is the state itself: this settlement, at HIS seed, with its own
// huts, fences, fire and lanes in the collision set — the pockets that stalled a
// child are drawn by THAT layout, and no synthetic world can stand in for it.
//
// The trace is taken INSIDE the page, one entry per rendered frame. The defects
// are per-frame — an alternation, a single stalled step, a moment of overlap —
// and a sampling loop that crosses the process boundary between readings would
// step straight over them.
async function checkChildrenMotion(motionPlace) {
  // The loop runs this block once per settlement, so every verdict names the one
  // it was taken in. The NAME stays the check's identity for the red ledger, and
  // the settlement goes at the END of the detail, never the front: the charge
  // ledger anchors its `detailMatch` on the first words of the detail, and the
  // run record cuts the detail at 200 characters (point 690).
  const checkAt = (name, ok, detail) =>
    check(name, ok, detail === undefined ? `at ${motionPlace}` : `${detail} — at ${motionPlace}`)
  // EACH SETTLEMENT IS MEASURED FROM THE SAME PAGE, not on top of the two before
  // it. The loop's claim is that one gate reads three settlements, and that is
  // only true if the three start alike: chaining three 1200-frame traces into one
  // session makes a settlement's POSITION IN THE LOOP part of its reading, and
  // leaving a settlement is not tearing its visit down.
  // WHAT THIS IS NOT: it is not the cure for the shuffling reds. They correlated
  // with the loop position — six runs, every red on the second or third
  // settlement and none on the first — and that correlation is why this was
  // tried; the WebGL 2 run right after it reddened at maasai-village all the
  // same, so the hypothesis is REFUTED and recorded as such rather than left
  // standing as an explanation. The reds are the known transient of points
  // 1068/1081/1169, charged there (point 690).
  // `installColliderProbe` rides an init script and survives the reload; the
  // backend is asserted again, because a silent fallback after a reload would
  // otherwise go unseen (point 204).
  await page.reload()
  await page.waitForFunction(() => window.__game && window.__balance, null, { timeout: 60000 })
  await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
  await assertBackend(page)
  // Settle in DRAWN FRAMES, not on the wall clock (the rule this file states at
  // `nextFrames`). Everything this block needs is already awaited above as a
  // condition, so the only thing left to wait for is the reloaded scene actually
  // drawing — and four rendered frames prove that, while four wall seconds prove
  // nothing on a renderer that stalled (point 690).
  await nextFrames(4)
  await page.evaluate(() => {
    window.__balance.randomEventsEnabled = false
    window.__game.getState().setJournalOpen(false)
  })
  await page.evaluate(() => {
    const g = window.__game.getState()
    if (g.placeId) g.leavePlace()
  })
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  // HIS seed: the settlement layout is derived from place + seed, so this is the
  // village he was standing in and not merely one of the same people. Put back
  // afterwards — every section after this one would otherwise be reading a world
  // it did not ask for.
  const bootSeed = await page.evaluate(() => window.__game.getState().seed)
  await page.evaluate(() => window.__game.setState({ seed: 2972259115 }))
  await page.evaluate(id => window.__game.getState().enterPlace(id), motionPlace)
  const live = await page
    .waitForFunction(
      id => window.__game.getState().placeId === id && !!window.__placeTag,
      motionPlace,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false)
  checkAt('the reported settlement publishes its live children’s game', live)
  if (live) {
    await page.evaluate(() => window.__game.getState().setJournalOpen(false))
    // AND IT MUST REALLY BE PLAYING (point 656). The wait's result used to be
    // thrown away: a group that never played produced no stalls, no shuffle
    // windows and no rescues, and satisfied every check below VACUOUSLY.
    const playing = await page
      .waitForFunction(() => window.__placeTag().playing, null, { timeout: 40000 })
      .then(() => true)
      .catch(() => false)
    checkAt('the group is really playing before the trace is taken', playing)
    const FRAMES = 1200
    const trace = await page.evaluate(
      (frames) =>
        new Promise((resolve) => {
          const log = []
          const tick = () => {
            const t = window.__placeTag()
            log.push({
              clock: t.clock,
              playing: t.playing,
              // Of that clock, the seconds actually played — likewise the
              // game's own count.
              playedClock: t.playedClock,
              c: t.children.map((k) => ({
                x: k.x,
                z: k.z,
                pace: k.pace,
                held: k.held,
                walked: k.walked,
                // The metres walked while the round was ON, the game's own
                // counter (point 656): a watcher outside cannot say which side
                // of a round's first frame a step belongs to.
                walkedWhilePlaying: k.walkedWhilePlaying,
                heading: k.heading,
                // How often the settlement has had to pick this child up
                // (point 656): the rescue is what ENDS a snag, so without it
                // the correction reads as the child getting somewhere.
                nudges: k.nudges,
                // And how far it carried it, the game's own counter — no watcher
                // outside can tell a carry from a walk in one frame vector.
                carried: k.carried,
              })),
            })
            if (log.length < frames) requestAnimationFrame(tick)
            else resolve({ bodyRadius: t.bodyRadius, log })
          }
          requestAnimationFrame(tick)
        }),
      FRAMES,
    )
    const log = trace.log
    const n = log[0].c.length
    checkAt(
      'the trace covers a real stretch of the game, frame by frame',
      n >= 2 && log[log.length - 1].clock - log[0].clock > 5,
      `${log.length} frames, ${n} children, ${(log[log.length - 1].clock - log[0].clock).toFixed(1)}s`,
    )
    // AND THE TRACE ITSELF HOLDS A GAME (point 656). Between rounds the group
    // idles for a calibratable break, which is legitimate — but a trace that is
    // ALL break has nothing in it to judge: no chase, no pockets walked into, no
    // shuffle windows.
    //
    // TWO REPAIRS HERE, both from the fourth cross-vendor review. The bar was a
    // majority of the FRAMES, which is not a majority of the minute — frames are
    // not evenly spaced, and this trace's own run from 20 ms to over a second.
    // And nothing required a child to WALK: four stationary children reporting
    // themselves as playing passed this check, the shuffle share (nothing walked
    // is nothing shuffled), the judged share, and both rescue rates. The
    // condition is now the shared `holdsAGame`, which asks the game CLOCK and
    // the QUIETEST child's legs.
    const tracks = Array.from({ length: n }, (_, k) =>
      log.map((f) => ({ ...f.c[k], clock: f.clock, playing: f.playing, playedClock: f.playedClock })),
    )
    const live = traceLiveness(tracks)
    checkAt(
      'and the trace holds a game rather than a break',
      holdsAGame(live),
      `${live.playedSeconds.toFixed(1)}s of ${live.seconds.toFixed(1)}s played ` +
        `(${(live.playedShare * 100).toFixed(0)} %), quietest child ${live.quietestChild} walked ` +
        `${live.quietestWalkedPerPlayedMinute.toFixed(1)} m per played minute ` +
        `(floor ${CHILD_MOTION.walkFloor}), ` +
        `group ${live.walkedPerChildMinute.toFixed(1)} m/child-min`,
    )

    // 3. THEY NEVER OCCUPY ONE ANOTHER. Judged against the body the game itself
    // publishes, not an assumed radius (§7.2) — and against the distance the
    // separation actually settles a resting pair at, which is the contact
    // distance less the deliberate slop band. Judging it against the bare
    // contact distance would call every settled pair an overlap.
    const contact = trace.bodyRadius * 2 - (await page.evaluate(() => window.__balance.villageLife.separation.slop))
    let worstOverlap = 0
    let overlapFrames = 0
    for (const f of log) {
      let bad = false
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(f.c[i].x - f.c[j].x, f.c[i].z - f.c[j].z)
          if (contact - d > worstOverlap) worstOverlap = contact - d
          if (contact - d > 1e-6) bad = true
        }
      }
      if (bad) overlapFrames++
    }
    checkAt(
      'no two children are ever inside one another, in any frame',
      overlapFrames === 0,
      `${overlapFrames} of ${log.length} frames, worst ${worstOverlap.toFixed(4)} m inside a ${contact.toFixed(3)} m contact`,
    )

    // 1. NOTHING SNAGS. A child COMMANDED to move that covers no ground is the
    // reported hang; a child standing at a pace of zero, or standing because it
    // was told to, is not — that is the game idling or a call being obeyed.
    let longestStall = 0
    for (let k = 0; k < n; k++) {
      let run = 0
      for (let i = 1; i < log.length; i++) {
        const before = log[i - 1].c[k]
        const now = log[i].c[k]
        const moving = now.pace > 1e-6 && !now.held
        if (moving && now.walked - before.walked < 1e-4) {
          run += log[i].clock - log[i - 1].clock
          longestStall = Math.max(longestStall, run)
        } else run = 0
      }
    }
    checkAt(
      'no child that is walking is held motionless by the settlement',
      longestStall < 0.25,
      `longest stall while commanded to move ${longestStall.toFixed(2)}s`,
    )

    // 2. NOTHING SHUFFLES ON THE SPOT — the user's own words, measured as he
    // would judge them: over a window of one second, does a child WALK a real
    // distance without GETTING anywhere?
    //
    // THE MEASURE IS NOT THIS FILE'S (point 656). It is
    // scripts/verify/childMotionMetric.mjs, which the replay test
    // (src/scenes/place/tagShuffle.test.ts) judges by too — because when each
    // side carried its own copy, both copies had the same two blind spots: they
    // summed frame-to-frame POSITIONS as the path walked, so the rescue teleport
    // that ENDS a snag counted as the child walking out of its own pocket, and
    // their window was longer than the 1.5 s rescue that tidied the symptom
    // away. The walked distance now comes from the game itself, the ground
    // covered leaves out the carry, and the rescues are counted.
    //
    // AND THE SHARE IS WEIGHTED IN GAME TIME, which matters most HERE: the
    // headless frame times in this very trace run from 20 ms to over a second,
    // and one window per FRAME would have let the fast stretches of a run
    // outvote the slow ones — the same fault, in a new place. Each window now
    // counts for the game time it stands for, so the number below is the share
    // of the traced minute the children spent shuffling.
    //
    // It used to count REVERSALS — a step that undoes the one before — and that
    // check could never hold either. A chase is FULL of legitimate reversals: a
    // runner doubling back at the rim, a chaser cutting in as its quarry dodges.
    // And their rate rides on the FRAME RATE — 1.4 % of steps at 60 fps against
    // 3.2 % at 14, because a slower frame turns a longer step — so on this
    // machine, where a headless frame takes anything from 20 ms to over a
    // second, one run passed a 3 % gate and the next failed it on the same code.
    // Ground covered against ground walked has neither fault.
    //
    // The gate is the replay's own, and this run is the proof that the LIVE
    // settlement — real frame times, the speech, the bodies, the player standing
    // in it — behaves as the replay says.
    const shuffle = shuffleWindows(tracks)
    // AND THE SHORT BURST BESIDE IT (point 656): the user's report was "die
    // Kinder hängen KURZ fest", and a child that paces on the spot for six
    // tenths of a second between spells of walking never collects the metre of
    // walking a one-second window asks for. The same windows over half a second,
    // with the ground bar a ratio of the distance walked. Both verdicts are ONE
    // check, because they are one question asked at two scales.
    const burst = shuffleWindows(tracks, CHILD_MOTION.short)
    checkAt(
      'no child walks without getting anywhere',
      // The bar is CHILD-SECONDS of game, not a count of frames: this trace is
      // 1200 rendered frames and buys anything from 20 s of game to a minute
      // and a half of it. The floor is CHILD_MOTION.minJudgedSeconds, 20
      // child-seconds (childMotionMetric.mjs) — four children over five seconds
      // of game — read in the unit the share is weighted in.
      // AND THE VERDICT MUST REST ON THE TRACE, CHILD BY CHILD. A live frame gap
      // longer than the window is judged by nobody — interpolating across a
      // silence longer than the question would invent the answer — so a share is
      // worth exactly what `judgedShare` says it covers. Both are read off the
      // WORST child rather than the group: one child snagging into a rescue
      // every three seconds while its three siblings play leaves every group
      // average clean, which is the whole of it divided by four.
      // BOTH measures must have judged something, and both must be clean. A
      // share of 0 is what either reports when nothing was bad AND when nothing
      // was looked at: at a live frame gap of 0.6 s the one-second windows still
      // stand while every half-second one is refused, so the burst half would
      // pass on nothing at all.
      judgedEnough(shuffle) &&
        judgedEnough(burst) &&
        shuffle.worstShare < CHILD_MOTION.shareGate &&
        burst.worstShare < CHILD_MOTION.shareGate,
      `worst child ${shuffle.worstShareChild} at ${(shuffle.worstShare * 100).toFixed(2)} % of its own ` +
        `judged time; group ${(shuffle.share * 100).toFixed(2)} % (${shuffle.bad} of ${shuffle.windows} ` +
        `${CHILD_MOTION.span}s windows, ${shuffle.seconds.toFixed(1)} judged child-seconds). ` +
        `Least judgeable child ${shuffle.leastJudgedChild} at ${(shuffle.leastJudged * 100).toFixed(1)} %, ` +
        `group ${(shuffle.judgedShare * 100).toFixed(1)} % of ${shuffle.covered.toFixed(1)} traced. ` +
        `In ${CHILD_MOTION.short.span}s bursts: worst child ${burst.worstShareChild} at ` +
        `${(burst.worstShare * 100).toFixed(2)} %, group ${(burst.share * 100).toFixed(2)} % of ` +
        `${burst.seconds.toFixed(1)} judged child-seconds, least judgeable child ` +
        `${burst.leastJudgedChild} at ${(burst.leastJudged * 100).toFixed(1)} %. ` +
        `Bad = over ${CHILD_MOTION.minPath} m walked inside ${CHILD_MOTION.circle} m ` +
        `(burst: over ${CHILD_MOTION.short.minPath} m walked for a ${CHILD_MOTION.short.ratio}th of it covered)` +
        (shuffle.worst.child >= 0
          ? ` — worst child ${shuffle.worst.child} at ${shuffle.worst.clock.toFixed(1)}s, ${shuffle.worst.path.toFixed(2)} m walked inside ${shuffle.worst.out.toFixed(2)} m`
          : ''),
    )

    // 2b. AND NOBODY IS BEING CARRIED (point 656). The stall watch teleports a
    // child that has got nowhere for 1.5 s onto free ground, and that teleport
    // is the reported episode ENDING — so it is a finding in its own right and
    // is reported by name here, whatever the windows above say. A CARRY is a
    // rescue that really set the child down somewhere else; the rest handed it
    // back the ground it was already standing on.
    const rescues = rescueRate(tracks)
    checkAt(
      'and no child has to be carried out of the settlement’s own geometry',
      rescues.carriedPublished &&
        rescues.nudgesPublished &&
        rescues.carriedMetresPerChildMinute < CHILD_MOTION.carryGate &&
        rescues.perChildMinute < CHILD_MOTION.rescueGate &&
        // AND THE WORST CHILD ON ITS OWN CLOCK: a rate averaged over the group
        // divides one persistently rescued child by its healthy siblings.
        rescues.worstPerChildMinute < CHILD_MOTION.worstChildRescueGate &&
        rescues.worstCarriedMetresPerChildMinute < CHILD_MOTION.worstChildCarryGate,
      // EACH FIGURE WITH THE CHILD IT BELONGS TO, AND CALLED WHAT IT IS. Three
      // different questions with three possibly different answers: the highest
      // RATE (what the gate reads), the most rescues in ABSOLUTE count, and the
      // most CARRIED per minute. The rate used to be printed as "most-often-picked-up",
      // which is the count's name, and the count was not printed at all.
      `highest rescue rate: child ${rescues.worstRescueChild} at ` +
        `${rescues.worstPerChildMinute.toFixed(2)}/min. Most rescues in all: child ` +
        `${rescues.worstChild} with ${rescues.worstRescues}. Most carried per minute: child ` +
        `${rescues.worstCarriedChild} at ${rescues.worstCarriedMetresPerChildMinute.toFixed(2)} m/min. ` +
        `Group ` +
        `${rescues.rescues} rescues (${rescues.carriedMetres.toFixed(2)} m carried in all` +
        `${rescues.carriedPublished && rescues.nudgesPublished ? '' : ', A COUNTER NOT PUBLISHED BY THE GAME'}) in ` +
        `${rescues.childMinutes.toFixed(2)} child-minutes = ${rescues.perChildMinute.toFixed(2)}/child-min, ` +
        `carried ${rescues.carriedMetresPerChildMinute.toFixed(2)} m/child-min`,
    )

    // AND A LOOK AT THEM. The complaint is what the player SEES, so the run
    // leaves a frame of the children themselves — the traveller stepped back to
    // the group and turned to face the nearest child it can see, the shutter
    // projecting that child so a frame named after them cannot photograph an
    // empty lane (point 375).
    // THE STANDPOINT IS SEARCHED, AND SO IS THE MOMENT. Where the children
    // stand decides what any standpoint can see of them: their ground is 13 m
    // across with the huts standing in it, so while the chase has them strung
    // out through the lanes, the best vantage in the settlement still sees one
    // of them past a wall — a photograph of an empty village with a figure in
    // it. The search below is therefore run EVERY frame and the shutter waits,
    // bounded, for a moment worth photographing; if the game never offers one it
    // searches once more and shoots that moment's best vantage rather than
    // skipping the picture.
    await page.evaluate(() => {
      window.__pickChildVantage = () => {
        const kids = window.__placeTag().children
        if (kids.length === 0) return null
        const cx = kids.reduce((s, k) => s + k.x, 0) / kids.length
        const cz = kids.reduce((s, k) => s + k.z, 0) / kids.length
        // A vantage the huts do not stand in. Merely stepping back from where
        // the traveller happened to be put the camera inside a dwelling, and the
        // shutter cannot see that: the centroid still PROJECTED into the frame,
        // behind a wall. So the standpoint is chosen against the layout — clear
        // of every dwelling, and with a clear line to the children.
        // THE OCCLUDERS ARE THE SETTLEMENT'S OWN SOLID BODIES, not the village
        // dwellings alone. A port carries no dwellings — its trade houses are
        // `interactives` with box colliders — so in Cairo this search saw no
        // obstacle whatever: it read every child as visible THROUGH a wall,
        // stood the camera inside one, and the frame named after the children
        // photographed a mud face (point 690). Every body the layout collides
        // against counts now, as the circle that encloses it — except wall
        // segments, which the search leaves out; anything smaller
        // than a child neither hides one nor crowds the camera and is dropped,
        // so scattered stones do not veto every vantage in the settlement.
        const huts = [
          ...window.__placeLayout.dwellings.map((d) => ({ x: d.x, z: d.z, r: d.r })),
          ...(window.__placeLayout.colliders ?? []).flatMap((c) =>
            c.kind === 'box'
              ? [{ x: c.x, z: c.z, r: Math.hypot(c.hx, c.hz) }]
              : c.kind === 'segment' || c.r === undefined
                ? []
                : [{ x: c.x, z: c.z, r: c.r }],
          ),
        ].filter((h) => h.r > 0.8)
        const blocks = (ax, az, bx, bz, pad) =>
          huts.some((h) => {
            const dx = bx - ax
            const dz = bz - az
            const len2 = dx * dx + dz * dz || 1
            const t = Math.max(0, Math.min(1, ((h.x - ax) * dx + (h.z - az) * dz) / len2))
            return Math.hypot(ax + t * dx - h.x, az + t * dz - h.z) < h.r + pad
          })
        const room = (sx, sz) =>
          huts.length > 0 ? Math.min(...huts.map((h) => Math.hypot(sx - h.x, sz - h.z) - h.r)) : Infinity
        let best = null
        let bestScore = -Infinity
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          // SIX METRES IS THE FLOOR, not a preference. A four-metre ring was
          // tried and the shutter refused the frame it produced — "off the
          // bottom edge": that close, the group's centre at knee height falls
          // out under the view, so a standpoint the score loves is one the
          // picture cannot use (point 690).
          for (const dist of [6, 8, 10, 13]) {
            const sx = cx + Math.sin(a) * dist
            const sz = cz + Math.cos(a) * dist
            if (Math.hypot(sx, sz) > window.__placeLayout.radius - 2) continue
            if (blocks(sx, sz, sx, sz, 2)) continue // standing inside a hut
            // How many children it can actually SEE: a thatch roof is opaque,
            // and a subject that merely projects into the frame can sit behind
            // one. The roof overhangs the wall, so the sightline is tested
            // against a hut generously wider than its footprint.
            const seen = kids.filter((k) => !blocks(sx, sz, k.x, k.z, 1.2))
            if (seen.length === 0) continue
            // Then ELBOW ROOM and nearness, weighed in one score in which each
            // child seen outweighs both. Seeing them was not enough on its
            // own: the first standpoint that did stood in the alley between two
            // dwellings, and at eye height a wall a metre away fills half the
            // picture whatever the sightline says. Room counts up to four metres
            // and no further — beyond that the wall is out of the picture, and
            // what is left to decide is that the children are figures rather
            // than specks.
            const clear = Math.min(room(sx, sz), 4)
            // NEARNESS IS MEASURED TO THE CHILDREN, not to their centroid. A
            // village quarter is 13 m across, so the two were nearly the same
            // thing; a port's is far wider, and a standpoint 6 m from the middle
            // of a scattered group stood twenty-odd metres from every child in
            // it. The frame came back an honest picture of a harbour lane with
            // one speck in it — its subject present by the letter and absent to
            // a reader (point 690). What is scored is therefore how far the
            // SEEN children really are, and it is worth less than seeing one
            // more of them and more than the last metre of elbow room.
            const near = seen.reduce((s_, k) => s_ + Math.hypot(sx - k.x, sz - k.z), 0) / seen.length
            const score = seen.length * 1000 + clear * 50 - near * 30
            if (score > bestScore) {
              bestScore = score
              best = { sx, sz, seen: seen.length, of: kids.length, clear, near }
              // THE NEAREST CHILD IT CAN SEE, which is what the frame DECLARES
              // and the camera faces. A centroid is not a thing, and a
              // frame that declares it satisfies the shutter by projecting a
              // point in empty air — which is how a port frame came back green
              // with no child in it at all (point 690). A child is a body: if it
              // is not in the picture the shutter says so and the run reds.
              const nearest = seen.reduce((a, k) =>
                Math.hypot(sx - k.x, sz - k.z) < Math.hypot(sx - a.x, sz - a.z) ? k : a)
              best.kx = nearest.x
              best.kz = nearest.z
            }
          }
        }
        return best
      }
    })
    // Worth photographing: most of the group in the clear, and the camera in the
    // open rather than up against a wall.
    await stepUntil(() => {
      const b = window.__pickChildVantage()
      return !!b && b.seen >= Math.min(3, b.of) && b.clear >= 2.5
    }, null, 300)
    const aimed = await page.evaluate(() => {
      const p = window.__placePlayer
      const best = window.__pickChildVantage()
      if (!p || !best) return null
      const pose = { x: p.x, z: p.z, yaw: p.yaw }
      p.x = best.sx
      p.z = best.sz
      // LOOK AT WHAT THE FRAME DECLARES. The camera used to face the centroid of
      // the children it could see, and a centroid is not a thing: in a port,
      // whose children's quarter is wide, it lands on a warehouse and the
      // picture centres on a wall with the group scattered around its edges.
      // Facing the nearest visible child puts a body in the middle of the frame
      // by construction, and it is the same body the shutter is handed (point 690).
      p.yaw = Math.atan2(-(best.kx - p.x), -(best.kz - p.z))
      return {
        pose, kx: best.kx, kz: best.kz,
        seen: best.seen, of: best.of, clear: best.clear, near: best.near,
      }
    })
    // AND THE STANDPOINT IS JUDGED, not merely taken. The search falls back to
    // the best it found when the game never offers a good moment, and that
    // fallback used to be silent — which is how a port frame named after the
    // children came back showing a wall. The same bar the wait holds out for is
    // now a verdict, so the picture cannot be worthless without the run saying
    // so (point 690).
    checkAt(
      'the children are photographed from a standpoint in the open',
      !!aimed && aimed.seen >= Math.min(3, aimed.of) && aimed.clear >= 2.5,
      aimed
        ? `${aimed.seen} of ${aimed.of} in the clear, ${aimed.clear.toFixed(1)} m of room around the camera, ` +
          `seen children ${aimed.near.toFixed(1)} m off on average`
        : 'no vantage at all',
    )
    if (aimed) {
      await nextFrames(2)
      await frame(motionPlace === 'bambara-village' ? '648-village-children' : `690-${motionPlace}-children`, {
        // AT THE CHILD'S HEAD, not its knees. The camera looks slightly upward,
        // so the group always sits in the lower third of the picture and a
        // subject declared at 0.6 m fell out under the bottom edge at six metres
        // — the shutter refused it, which is the mechanism working. A child's
        // upper body is both safely inside the view and the part of it worth
        // having in the frame (point 690).
        local: { x: aimed.kx, y: 1.0, z: aimed.kz },
        label:
          `the children at their game of tag (${aimed.seen} of ${aimed.of} in the clear, ` +
          `on average ${aimed.near.toFixed(1)} m off)`,
      })
      await page.evaluate((pose) => {
        const p = window.__placePlayer
        if (!p) return
        p.x = pose.x
        p.z = pose.z
        p.yaw = pose.yaw
      }, aimed.pose)
    }
    // The world goes back as it was found, the injected search included — every
    // section after this one would otherwise read a page this one left behind.
    await page.evaluate(() => {
      delete window.__pickChildVantage
    })
  }
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
  await page.evaluate((seed) => window.__game.setState({ seed }), bootSeed)
}

if (section('children-motion')) {
  // Keep the same motion thresholds in all three settlements, including the port staging.
  for (const motionPlace of ['bambara-village', 'maasai-village', 'cairo']) {
    await checkChildrenMotion(motionPlace)
  }
}

// --- The children's game at the river bank (work-order point 687) -------------
// The round itself is pinned in the fast layer: `src/scenes/place/bankGame.test.ts`
// replays a whole cycle (the phases, the caller who becomes the first catcher,
// the direction alternating with the side swap, the guards that keep ROCK from
// meaning "made it") and `src/scenes/place/bankStage.test.ts` measures the stage
// (the stretch in world units, the far rock's share of the frame, the lane's free
// width). Two of the point's claims are the PICTURE's, and neither can be made
// without a browser:
//
//   1. BOTH ROCKS IN FRAME FROM THE START LINE. The fast layer computes that from
//      a MODEL of the camera — 50 deg vertical at 1440x900. This section asks the
//      camera the scene really renders through, by projecting each rock with its
//      own matrices (CLAUDE.md §7.2: never a radius, never an assumed distance),
//      and then ray-probes both to prove the frame DRAWS a solid where the layout
//      says the stone stands rather than open bank.
//   2. THE TRAVELLER IS AN OBSTACLE, NEVER A STOP (spec item 7). Nothing outside
//      the running scene can show that the game goes ON with a player planted in
//      the lane — that the children come past him, from one side to the other,
//      without walking through him.
//
// The village is the Bambara one: it stands on a river, so it carries a bank, the
// two play rocks and the bank round (the settlements without a bank keep the tag
// round, which `children-tag` above covers).
if (section('children-bank-game')) {
  // The bodies the berth is measured against, mirrored from
  // src/scenes/place/collision.ts: the player's own radius and the walker's,
  // which is what a child's body claims (NPC_RADIUS = WALKER_RADIUS).
  const BANK_PLAYER_RADIUS = 0.35
  const BANK_CHILD_RADIUS = 0.3
  // The roaming phase is a balance value the debug menu edits (§21), and its
  // shipped 55 s is chosen so a VISITING player does not miss the call that opens
  // a cycle. This section needs the RUN, twice, so it shortens the roam the way
  // the debug menu would and puts it back afterwards. It also lengthens the tap
  // pause (below) and, for the tap photograph, the arrival hold, and latches the
  // charge; the walk down to the bank and every run are the shipped ones.
  //
  // BOTH LENGTHS OF THAT PHASE, not only the first. `roamSeconds` is what the
  // phase is SCHEDULED for; the off-game ROCK guard may then hold the cycle for
  // `roamGuardSeconds` (45 s) beyond it, and at the verify seed the boulder goes
  // unnamed every cycle, so the guard runs its overtime out every time. Shortening
  // the schedule alone therefore did not shorten the phase at all: measured in the
  // fast-layer replay, the roaming phase still ran 55 s and the cycles came 74-100 s
  // apart, which left the lane window of that time with a single 2 s run in it.
  // With both shortened the cycles came 35-59 s apart (measured before the tap
  // pause was lengthened; the run-wait budget below gives today's spacing). The guard's own bound is proved
  // at its SHIPPED length in `src/scenes/place/tagShuffle.test.ts`; this is a
  // spectator-time knob, not a weakened assertion.
  const shippedRoam = await page.evaluate(() => {
    const b = window.__balance.villageLife.bankGame
    const was = {
      roamSeconds: b.roamSeconds,
      roamGuardSeconds: b.roamGuardSeconds,
      tapPauseSeconds: b.tapPauseSeconds,
      arrivalHoldSeconds: b.arrivalHoldSeconds,
    }
    b.roamSeconds = 8
    b.roamGuardSeconds = 8
    // AND THE TAP IS HELD LONG ENOUGH TO PHOTOGRAPH (work-order 1065). The
    // shipped pause is 1.5 s, which is right for a player and shorter than a
    // headless shutter; the pose, the contact and the word are the SAME code
    // path at 9 s. It is a spectator-time knob, like the roam above, and the
    // shipped length is what `bankGame.test.ts` measures the hold against.
    b.tapPauseSeconds = 9
    return was
  })
  const cycleWaitSeconds = await page.evaluate(() => {
    const b = window.__balance.villageLife.bankGame
    return b.roamSeconds + b.roamGuardSeconds + b.gatherSeconds + b.partSeconds + b.endPauseSeconds +
      window.__balance.villageLife.tag.childCount *
      (b.regroupSeconds + b.runSeconds + b.tapPauseSeconds + b.tapReturnSeconds + 2 * b.utteranceGapSeconds)
  })
  await goToPlace('bambara-village')
  const staged = await page
    .waitForFunction(
      () => !!window.__placeLayout?.playRocks && !!window.__placeTag && window.__placeTag().phase !== null,
      null,
      { timeout: 40000 },
    )
    .then(() => true)
    .catch(() => false)
  check('the river village stands its two play rocks and its children play the bank round', staged)
  if (staged) {
    // THE SPECTATOR'S STANCE AT THE START LINE. The runners' own stations stand
    // `standOff` from their rock on the side FACING the far one, so a figure on
    // the line itself has the near rock behind it — "both rocks in one frame" is
    // a statement about the stance riverBank.ts measured, a spectator standing
    // BACK of the line.
    //
    // AND OFF ITS AXIS, which the first run of this section taught: standing back
    // ON the lane's own line put the near stone across the whole frame with the
    // far one peeping over its shoulder, 35 px of it. Both projected, both were
    // drawn, and the picture still did not show the stretch — the "looks wrong
    // but passes" case. A spectator does not stand in the running lane anyway.
    //
    // So the stance is back of the line AND a couple of paces INLAND of the lane,
    // aimed level at the middle of the stretch. The two offsets are the stretch's
    // own fractions, and they are the MEASURED optimum rather than a guess: swept
    // over the three river villages (nubian, bambara, mandinka) and both ends of
    // each stretch, 0.25 and 0.13 of the stretch is the stance with the largest
    // JOINT margin against the three walls this picture sits between — the
    // settlement boundary (5.0 m of room; the bank's walkable lobe is a ±34 deg
    // wedge and the second run of this section walked a stance straight out of
    // it), the frame edge (7.6 deg) and the two stones overlapping (5.9 deg).
    const stood = await page.evaluate(() => {
      const L = window.__placeLayout
      const p = window.__placePlayer
      const cam = window.__placeCamera
      if (!L?.playRocks || !p || !cam) return null
      const near = L.playRocks.upstream
      const far = L.playRocks.downstream
      const dx = far.x - near.x
      const dz = far.z - near.z
      const len = Math.hypot(dx, dz) || 1
      const ax = dx / len
      const az = dz / len
      // Inland is the side of the lane the village is on — the water is the other
      // one, and there is no standing in it.
      const inland = ax * -near.z - az * -near.x > 0 ? 1 : -1
      const vx = -az * inland
      const vz = ax * inland
      const back = len * 0.25
      const aside = len * 0.13
      p.x = near.x - ax * back + vx * aside
      p.z = near.z - az * back + vz * aside
      p.pitch = 0
      // Level, down the middle of the stretch: the aim a spectator takes, and the
      // one that challenges BOTH ends instead of centring the far rock by
      // construction. Place-camera yaw 0 looks toward -Z, so aim with the +PI
      // complement.
      const mid = { x: (near.x + far.x) / 2, z: (near.z + far.z) / 2 }
      p.yaw = Math.atan2(mid.x - p.x, mid.z - p.z) + Math.PI
      // Is that ground a player could have walked to? The shipped collider set
      // decides; a box is taken at its circumscribed radius, the conservative
      // reading.
      const reach = (c) =>
        c.kind === 'box'
          ? Math.hypot(c.hx, c.hz)
          : c.kind === 'segment'
            ? c.r + Math.hypot(c.x2 - c.x1, c.z2 - c.z1) / 2
            : c.r
      let clear = Infinity
      for (const c of window.__placeColliders ?? []) {
        const m = c.kind === 'segment' ? { x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2 } : { x: c.x, z: c.z }
        clear = Math.min(clear, Math.hypot(p.x - m.x, p.z - m.z) - reach(c))
      }
      return { near, far, r: L.playRocks.r, stretch: len, back, clear, x: p.x, z: p.z }
    })
    check(
      'a spectator can stand back of the start line on ground the colliders leave free',
      !!stood && stood.clear > 0.35,
      stood
        ? `${stood.back.toFixed(1)} m back of the upstream rock, ${stood.clear.toFixed(2)} m clear of the nearest collider, ` +
            `stretch ${stood.stretch.toFixed(1)} m`
        : 'no stage to stand at',
    )
    // Let the camera follow the teleport — and the settlement's own boundary
    // judge it — before anything is projected from it.
    if (stood) await nextFrames(2)
    // A stance the boundary rejects unmounts the whole settlement scene, and
    // every projection below then reads an undefined camera. It fails HERE, by
    // name, rather than crashing the suite in a stack trace about a matrix.
    const held = stood
      ? await page.evaluate(() => window.__game.getState().placeId === 'bambara-village' && !!window.__placeCamera)
      : false
    if (stood) {
      check(
        'and standing there leaves him inside the settlement, the scene still mounted',
        held,
        held ? `at ${stood.x.toFixed(1)}, ${stood.z.toFixed(1)}` : 'the boundary put him back on the map',
      )
    }
    if (stood && held) {
      const seen = await page.evaluate((rocks) => {
        const cam = window.__placeCamera
        const apply = (e, v) => [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
        // The shutter's own projection (scripts/verify/frameSubject.mjs), read
        // here for TWO points at once — the shutter judges one subject, and the
        // claim is about the pair.
        const ndc = (x, y, z) => {
          const eye = apply(cam.matrixWorldInverse.elements, [x, y, z, 1])
          const clip = apply(cam.projectionMatrix.elements, eye)
          const w = clip[3]
          if (!(w > 0)) return null
          return { x: clip[0] / w, y: clip[1] / w, z: clip[2] / w }
        }
        const read = (p) => {
          // Foot and upper body: a stone whose base has slid under the frame edge
          // is not "in frame from the start line", however well its top projects.
          const foot = ndc(p.x, 0, p.z)
          const top = ndc(p.x, rocks.r, p.z)
          const inFrame = (n) => !!n && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1 && n.z < 1
          // The stone's own silhouette across the frame: its centre offset by a
          // radius either way, perpendicular to the sight line. Two stones whose
          // spans OVERLAP are one stone with something behind it, whatever their
          // centres project to.
          const eye = cam.position
          const sx = p.x - eye.x
          const sz = p.z - eye.z
          const sl = Math.hypot(sx, sz) || 1
          const edgeA = ndc(p.x - (-sz / sl) * rocks.r, rocks.r * 0.5, p.z - (sx / sl) * rocks.r)
          const edgeB = ndc(p.x + (-sz / sl) * rocks.r, rocks.r * 0.5, p.z + (sx / sl) * rocks.r)
          const span = edgeA && edgeB ? [Math.min(edgeA.x, edgeB.x), Math.max(edgeA.x, edgeB.x)] : null
          // Is a SOLID drawn there? The ray meets the stone's near face, so it
          // comes back short of the centre by up to a radius; anything nearer is
          // something standing in front of it, anything beyond is the bank behind.
          const hit = window.__placeRayHit ? window.__placeRayHit(p.x, rocks.r * 0.5, p.z) : null
          const ratio = hit && hit.hitDistance != null ? hit.hitDistance / hit.targetDistance : Infinity
          const nearBound = hit ? (hit.targetDistance - rocks.r - 0.3) / hit.targetDistance : 0
          return {
            foot,
            top,
            span,
            inFrame: inFrame(foot) && inFrame(top),
            distance: hit ? hit.targetDistance : null,
            ratio,
            solid: ratio >= nearBound && ratio <= 1.05,
            what: hit ? (hit.hitName ?? 'sky') : 'no probe',
            // The stone's height in frame pixels, for the reader: the fast layer
            // pins the angular share, this says what it came to on the real frame.
            px: foot && top ? Math.round((Math.abs(top.y - foot.y) / 2) * window.innerHeight) : 0,
          }
        }
        return { near: read(rocks.near), far: read(rocks.far), viewport: { w: window.innerWidth, h: window.innerHeight } }
      }, { near: stood.near, far: stood.far, r: stood.r })
      const describeRock = (label, r) =>
        `${label} ${r.distance == null ? '?' : r.distance.toFixed(1)} m, ndc ` +
        `${r.foot ? `${r.foot.x.toFixed(2)}/${r.foot.y.toFixed(2)}` : 'behind the camera'}, ` +
        `${r.px} px, first surface ${Number.isFinite(r.ratio) ? r.ratio.toFixed(2) : '∞'}×@${r.what}`
      check(
        'both play rocks rest in the rendered frame from a spectator`s stance at the upstream end (point 687)',
        seen.near.inFrame && seen.far.inFrame,
        `${describeRock('near', seen.near)}; ${describeRock('far', seen.far)} ` +
          `[${seen.viewport.w}x${seen.viewport.h}]`,
      )
      check(
        'and the frame draws a solid at each of them, not open bank',
        seen.near.solid && seen.far.solid,
        `${describeRock('near', seen.near)}; ${describeRock('far', seen.far)}`,
      )
      // The picture has to show the STRETCH, not one stone with a bump behind it.
      const apart =
        !!seen.near.span &&
        !!seen.far.span &&
        (seen.near.span[0] > seen.far.span[1] || seen.far.span[0] > seen.near.span[1])
      check(
        'and they stand apart in it, the running ground between them',
        apart,
        seen.near.span && seen.far.span
          ? `near spans ndc ${seen.near.span[0].toFixed(2)}..${seen.near.span[1].toFixed(2)}, far ` +
              `${seen.far.span[0].toFixed(2)}..${seen.far.span[1].toFixed(2)}`
          : 'a stone projected behind the camera',
      )
      await frame('687-bank-play-rocks', {
        local: { x: stood.far.x, y: stood.r * 0.5, z: stood.far.z },
        label:
          `both detailed play rocks resting on broad bases, seen from a quarter of the stretch back of the upstream rock and ` +
          `an eighth of it aside (stretch ${stood.stretch.toFixed(1)} m)`,
      })

      // THE CALL REACHES THE STAND THE GAME IS PHOTOGRAPHED FROM (work-order
      // 1073). The defect this exists for: the runner announces the direction
      // from the START rock while this stand lies about 0.28 of the stretch from
      // it and 1.26 from the far rock, and the ordinary 10 m hearing radius
      // (communication.hearingRadius) is a HARD cut — so from the one place the
      // project photographs the round, the taught direction word arrived as no
      // sound, no reading and no arm at all. The CALL register carries it. What
      // only a browser can answer is whether the reading and the arm are in the
      // PROJECTION; audibility itself is measured numerically over whole rounds
      // from this same stand in `bankGame.test.ts`.
      const called = await page
        .waitForFunction(
          () => {
            const t = window.__placeTag()
            if (!t || t.direction == null || !t.announcedWord) return null
            // THE ANNOUNCED WORD, not merely SOME child's word. Taking the first
            // `kid-` label would pass on any utterance the round happens to be
            // holding — a tap, an arrival ROCK — with the taught direction
            // absent from the picture, which is the very defect this checks for.
            const spoken = (window.__speech?.labels() ?? []).find((l) =>
              String(l.speakerId).startsWith('kid-') &&
              Array.isArray(l.atoms) && l.atoms.length === 1 && l.atoms[0] === t.announcedWord)
            if (!spoken) return null
            const who = Number(String(spoken.speakerId).slice(4))
            const child = t.children[who]
            if (!child) return null
            return {
              direction: t.direction,
              announcedWord: t.announcedWord,
              who,
              atoms: spoken.atoms,
              screen: window.__speech?.anchorScreen(spoken.speakerId) ?? null,
              gesture: child.gesture ?? null,
              view: { w: window.innerWidth, h: window.innerHeight },
            }
          },
          null,
          { timeout: 240000 },
        )
        .then((h) => h.jsonValue())
        .catch(() => null)
      check(
        'the announced direction is READ over the calling child, inside the picture from the spectator`s stand',
        !!called && called.atoms.length === 1 && called.atoms[0] === called.announcedWord && !!called.screen &&
          called.screen.x > 0 && called.screen.x < called.view.w &&
          called.screen.y > 0 && called.screen.y < called.view.h,
        JSON.stringify(called && { direction: called.direction, word: called.announcedWord, who: called.who, atoms: called.atoms, screen: called.screen }),
      )
      // The arm is the half a raised reach alone would never have bought: the
      // gesture is cut by the SAME hard boundary as the sound, so a call out of
      // reach is a silent child standing still, not a mute child pointing.
      // `point` is the gesture `announceRun` gives this moment, and the only one
      // that means "that way". Accepting any non-rest arm would pass on a beckon
      // or a refusal and call it a direction shown.
      check(
        'and the same child POINTS it — the arm carries as far as the voice',
        !!called && !!called.gesture && called.gesture.kind === 'point' && called.gesture.t < called.gesture.duration,
        JSON.stringify(called && called.gesture),
      )
      if (called) {
        // Held for the shutter exactly as the chief's answer is, and for the
        // same reason: a reading stands its few seconds only and the scene-ready
        // wait before a frame outlasts them. What was really said is measured
        // LIVE above; this only keeps it in the picture.
        const held = await page.evaluate(
          ({ id, atoms }) => window.__speech?.speak(id, atoms, undefined, 120),
          { id: `kid-${called.who}`, atoms: called.atoms },
        )
        check(
          'the calling child`s word is held over its scene anchor for the shutter',
          held === true,
          `kid-${called.who}: speak returned ${String(held)}`,
        )
        const child = await page.evaluate((who) => {
          const c = window.__placeTag().children[who]
          return c ? { x: c.x, z: c.z } : null
        }, called.who)
        if (held === true && child) {
          // The point lasts 2 s; scene readiness can wait for 5 s of stability.
          // This frame declares only the held word. The arm remains a live
          // assertion above, not a pose this later shutter promises to contain.
          await frame('1073-bank-call-from-the-spectator-stand', {
            local: { x: child.x, y: 1.1, z: child.z },
            label:
              `the held direction word (${called.direction}) standing over the child that called it, seen from the ` +
              `bank-game spectator stand a quarter of the ${stood.stretch.toFixed(1)} m stretch back of the upstream rock`,
          })
        }
      }
    }

    // THE TRAVELLER IN THE LANE (spec item 7). He plants himself in the middle of
    // the running ground and stays there, facing down the stretch — the worst
    // place he could pick, and the one a game that stopped at him would visibly
    // halt in.
    const planted = await page.evaluate(() => {
      const L = window.__placeLayout
      const p = window.__placePlayer
      if (!L?.playRocks || !p) return null
      const near = L.playRocks.upstream
      const far = L.playRocks.downstream
      const dx = far.x - near.x
      const dz = far.z - near.z
      const len = Math.hypot(dx, dz) || 1
      p.x = (near.x + far.x) / 2
      p.z = (near.z + far.z) / 2
      p.pitch = 0
      p.yaw = Math.atan2(far.x - p.x, far.z - p.z) + Math.PI
      return { ax: dx / len, az: dz / len, far, r: L.playRocks.r, berth: window.__balance.villageLife.bankGame.strangerBerth }
    })
    // WAITING FOR A RUN IS WAITING ON THE GAME'S CLOCK, NOT ON THE WALL'S. This
    // was a 240 s wall-clock deadline on an event of the round's own clock, and
    // it broke the rule the lane window below states for itself: a headless
    // frame buys wildly different amounts of game per machine. Starve the
    // process and those 240 s buy far less played time, the round has not
    // reached its run phase inside them, and the check reports a product defect
    // that is not there — measured by `throttle-probe.mjs` on a quarter of a
    // core at a 6/8 skew rate, every one of the six reds this check and no
    // other.
    //
    // The observation budget follows the configured cycle: longer station
    // walks and the tapper's return can put two first runs over 150 s apart.
    // This changes only how long the spectator waits, not the crossing gate.
    // A stalled played clock remains a separate failure from spending this budget.
    const RUN_WAIT_PLAYED_S = cycleWaitSeconds
    const RUN_WAIT_STALL_MS = 90000
    const RUN_WAIT_WALL_MS = 1800000
    let runPhase = null
    let runPlayed = 0
    let runDead = false
    let runWallMs = 0
    if (planted) {
      const readRound = () =>
        page.evaluate(() => {
          const t = window.__placeTag()
          return { phase: t.phase, playedClock: t.playedClock }
        })
      const first = await readRound()
      const wallStart = Date.now()
      // THE WINDOW OPENS ON A CYCLE'S FIRST RUN, never wherever a run happens to
      // be. Two things were wrong with taking any run at all. The round keeps
      // playing while the traveller is planted, so the wait could begin mid-run
      // and the window then got the TAIL of it. And a cycle's LATER runs — the
      // ones after a `regroup` — carry only the runners that survived the ones
      // before, so they end in a second or two, far too short to carry anybody
      // the ten metres from the start line to the traveller in the middle of it.
      // A cycle's first run is the one with the whole line still in it.
      //
      // `gather` is the walk down to the bank and happens exactly once per cycle,
      // immediately before that first run, so it is what the wait watches for.
      // Measured in the fast-layer replay over the seven river layouts (with the
      // roam shortened as above): 84 cycle-first runs, and at the OLD 45 s window
      // six of them carried no crossing at all — the check was a coin toss, not a
      // measurement, and it had gone green on luck. The budget above covers the
      // wait, including the longer regroup and tap-return intervals.
      let sawGather = false
      for (;;) {
        const now = await readRound()
        runPhase = now.phase
        runPlayed = now.playedClock - first.playedClock
        if (runPhase === 'gather') sawGather = true
        if (sawGather && runPhase === 'run') break
        runWallMs = Date.now() - wallStart
        if (runPlayed >= RUN_WAIT_PLAYED_S) break
        if (Date.now() - wallStart > RUN_WAIT_WALL_MS) {
          runDead = true
          break
        }
        // ON TO THE NEXT SAMPLE BY WAITING FOR THE GAME'S CLOCK TO MOVE — a
        // CONDITION, never a pause (this suite's own fixed-wait gate, and the
        // same reason the budget above is played seconds). Its deadline is the
        // dead-page detector and nothing else: a scene that is still stepping
        // satisfies it in a frame however slow the machine, and only one that
        // has stopped buying game time at all can run it out.
        const seen = now.playedClock
        const stepped = await page
          .waitForFunction((was) => window.__placeTag().playedClock > was, seen, {
            timeout: RUN_WAIT_STALL_MS,
            polling: 'raf',
          })
          .then(() => true)
          .catch(() => false)
        if (!stepped) {
          runDead = true
          break
        }
      }
    }
    const running = runPhase === 'run'
    check(
      'a run starts while the traveller stands in the lane',
      running,
      running
        ? `after ${runPlayed.toFixed(1)}s of played time (budget ${RUN_WAIT_PLAYED_S}s)`
        : runDead
          ? `THE PAGE STOPPED STEPPING (or the wall-clock bound ran out) — only ${runPlayed.toFixed(1)}s of played time in ` +
            `${(runWallMs / 1000).toFixed(0)}s of wall clock. This is a dead or frozen scene, NOT a round ` +
            `that failed to open a run: nothing about the GAME is judged by this red.`
          : `the round played ${runPlayed.toFixed(1)}s of its own clock without opening a run ` +
            `(budget ${RUN_WAIT_PLAYED_S}s, phase ${runPhase})`,
    )
    if (planted && running) {
      // The window is an interval of the GAME's own clock, never a frame count:
      // a headless frame buys wildly different amounts of game per machine, and
      // this one has to span a run, the regroup walk and the next run.
      //
      // 120 SECONDS OF IT, which is the length at which the crossing below stops
      // being a coin toss. Measured in the fast-layer replay over the seven river
      // layouts, opening on a cycle's first run as this wait now does: of 75
      // windows NONE was without a crossing at 120 s, against one at 90 s and six
      // of 84 at the 45 s this used to take. The cost is spectator time only —
      // the round is the shipped one and every check below reads the longer trace.
      const LANE_WINDOW_S = 120
      // What counts as "went nowhere" over that window. A child that walked less
      // than half a metre over the whole window of play did not walk; anything
      // above it is a slow child, which is a different complaint and not this
      // check's.
      const LANE_STARVED_M = 0.5
      // How near a child has to come before the picture below is worth taking:
      // close enough that the frame shows him and the runner together, wide
      // enough that the shot is not waiting on the single closest pass of the
      // whole window.
      const LANE_SHOT_GAP = 10
      const LANE_SHOT_AHEAD = 1.5
      // ...and it must be CLOSING on him by at least this much between two
      // samples. Being on the positive side of the lane axis says nothing about
      // which way a child is going: the run reverses at every side swap, a
      // runner that got past him is walking away down the same axis, and a
      // tagged one stands slumped where it was caught. Without this the frame could
      // be written of any of the three under the label "coming at the
      // traveller".
      const LANE_SHOT_CLOSING = 0.05
      let prevGap = null
      let shotRun = false
      const first = await page.evaluate(() => window.__placeTag().clock)
      const lane = []
      let laneClock = first
      // The iteration cap is a runaway backstop, not the window: two frames per
      // sample at 60 fps is some 30 samples per played second, so 120 s of window
      // asks for about 3 600 of them and the cap has to sit well clear of that.
      for (let i = 0; i < 12000 && laneClock - first < LANE_WINDOW_S; i++) {
        const s = await page.evaluate(() => {
          const t = window.__placeTag()
          const p = window.__placePlayer
          return {
            clock: t.clock,
            playedClock: t.playedClock,
            phase: t.phase,
            tags: t.tags,
            px: p.x,
            pz: p.z,
            // `held` is the settlement's own word for a stillness that was ORDERED —
            // the tagged child standing slumped — as against one that just happened.
            // The starvation check below cannot be written without it.
            c: t.children.map((k) => ({ x: k.x, z: k.z, walked: k.walked, held: k.held })),
          }
        })
        laneClock = s.clock
        lane.push(s)
        // THE PICTURE IS TAKEN WHERE THE CLAIM IS TRUE (point 375). Shot after
        // this window instead, it caught whatever the group happened to be doing
        // by then — the run long over, the children back in their quarter — and
        // wrote an empty stretch of bank under the label "the children's run".
        // The frame's SUBJECT is therefore the nearest CHILD, not the rock: the
        // shutter refuses to write it unless that child is in the picture.
        if (!shotRun && s.phase === 'run') {
          let near = -1
          let gap = Infinity
          for (let k = 0; k < s.c.length; k++) {
            // IN FRONT OF HIM, not merely near: he faces down the stretch toward
            // the far rock, so a child behind him projects behind the camera and
            // the shutter rightly refuses the frame. The lane's own axis says
            // which side he is looking at.
            const along = (s.c[k].x - s.px) * planted.ax + (s.c[k].z - s.pz) * planted.az
            if (along < LANE_SHOT_AHEAD) continue
            const d = Math.hypot(s.c[k].x - s.px, s.c[k].z - s.pz)
            // AND COMING AT HIM: the gap it stands at has to be shrinking.
            if (!(prevGap && prevGap[k] != null && d < prevGap[k] - LANE_SHOT_CLOSING)) continue
            if (d < gap) {
              gap = d
              near = k
            }
          }
          if (near >= 0 && gap <= LANE_SHOT_GAP) {
            shotRun = true
            await frame('687-bank-game-traveller', {
              local: { x: s.c[near].x, y: planted.r * 0.5, z: s.c[near].z },
              label: `a child of the run coming at the traveller planted in their lane, ${gap.toFixed(1)} m off him`,
              settle: false,
            })
          }
        }
        prevGap = s.c.map((k) => Math.hypot(k.x - s.px, k.z - s.pz))
        await nextFrames(2)
      }
      const head = lane[0]
      const tail = lane[lane.length - 1]
      const kids = head ? head.c.length : 0
      const phases = new Set(lane.map((s) => s.phase))
      const played = tail && head ? tail.playedClock - head.playedClock : 0
      const walked = Array.from({ length: kids }, (_, k) => tail.c[k].walked - head.c[k].walked)
      // A GAME, not a group standing about with the phases ticking over it: the
      // cycle must ADVANCE — two distinct phases inside the window — and the legs
      // must carry the group at the walking floor the child-motion metric already
      // sets (m per child-minute). This is a LIVENESS check and says no more: two
      // phases are a run followed by a walk-back, not a closed
      // call -> runs -> walk -> roam, and it watches one village. The whole cycle
      // in every river layout, per child, is measured where it belongs — the
      // replay in `src/scenes/place/tagShuffle.test.ts` over a 120 s window.
      const groupWalked = walked.reduce((a, b) => a + b, 0)
      const perChildMinute = played > 0 && kids > 0 ? groupWalked / kids / (played / 60) : 0
      // AND NOT ONE CHILD STARVED INSIDE THAT AVERAGE (cross-vendor review,
      // 29.08.2026). The floor above is asked of the GROUP, for the good reason
      // that a tagged child legitimately stands slumped — but that reason
      // excuses a child the round HELD, not every child, and a group average
      // hides one standing at zero while the others carry it. The settlement
      // says which stillness was ordered, so the two are told apart here rather
      // than guessed: a child never held over the whole window has to have got
      // somewhere. The bar is deliberately low — this is a starvation detector,
      // not a second pace gate.
      const heldEver = Array.from({ length: kids }, (_, k) => lane.some((s) => s.c[k]?.held))
      const starved = []
      for (let k = 0; k < kids; k++) {
        if (!heldEver[k] && walked[k] <= LANE_STARVED_M) starved.push(k)
      }
      check(
        'the round goes on with him planted in it, rather than halting at him',
        played >= LANE_WINDOW_S * 0.9 &&
          phases.size >= 2 &&
          perChildMinute > CHILD_MOTION.walkFloor &&
          starved.length === 0,
        `${played.toFixed(1)}s of ${LANE_WINDOW_S}s played over ${lane.length} samples, phases ` +
          `[${[...phases].join(', ')}], ${kids} children walked ` +
          `[${walked.map((m) => m.toFixed(1)).join(', ')}] m = ${perChildMinute.toFixed(1)} m per ` +
          `child-minute (floor ${CHILD_MOTION.walkFloor}), ${tail.tags - head.tags} tagged` +
          (starved.length
            ? ` — STARVED: child(ren) ${starved.join(', ')} walked at most ${LANE_STARVED_M} m and were never held, ` +
              `so their stillness was not the caught slump`
            : ''),
      )
      // WALKED AROUND, not merely near: a child counts as having passed him when
      // it goes from one side of him to the other along the lane's own axis, with
      // a metre of hysteresis so a figure jittering beside him is never counted.
      let crossers = 0
      let minGap = Infinity
      let closestAt = null
      const reach = []
      for (let k = 0; k < kids; k++) {
        let side = 0
        let swapped = false
        let lo = Infinity
        let hi = -Infinity
        let nearest = Infinity
        for (const s of lane) {
          const c = s.c[k]
          const along = (c.x - s.px) * planted.ax + (c.z - s.pz) * planted.az
          const gap = Math.hypot(c.x - s.px, c.z - s.pz)
          if (along < lo) lo = along
          if (along > hi) hi = along
          if (gap < nearest) nearest = gap
          // The body separation is judged over EVERY phase — a child may not walk
          // through him while roaming any more than while running.
          if (gap < minGap) {
            minGap = gap
            closestAt = s.phase
          }
          // THE CROSSING IS NOT (cross-vendor review, 29.08.2026). What this
          // section claims is that the RUN carries the group past a planted
          // figure; a child that stays on one side throughout every run and
          // wanders past him afterwards, while the group walks back or roams,
          // proves nothing of the sort. So the side-swap is accumulated inside
          // the run phase only, and the side is forgotten on leaving it, which
          // also stops two separate runs being welded into one crossing.
          if (s.phase !== 'run') {
            side = 0
            continue
          }
          if (along > 1 || along < -1) {
            const now = along > 0 ? 1 : -1
            if (side !== 0 && now !== side) swapped = true
            side = now
          }
        }
        reach.push(`${lo.toFixed(0)}..${hi.toFixed(0)}@${nearest.toFixed(0)}`)
        if (swapped) crossers++
      }
      // A red here has to NAME what it found, because "0 crossed" has three very
      // different causes: a group held up by the traveller, a group tagged out
      // before it reaches him, and a group that never came down to the bank at
      // all. So the detail carries how far along the lane each child got (0 is
      // the line he stands on) with its closest approach, how the window's
      // samples split over the phases, and the metres each child walked.
      const phaseCount = new Map()
      for (const s of lane) phaseCount.set(s.phase, (phaseCount.get(s.phase) ?? 0) + 1)
      check(
        'the children walk PAST the traveller — from one side of him to the other',
        crossers >= 1,
        `${crossers} of ${kids} crossed his line; along the lane (0 = his line) ` +
          `[${reach.join(', ')}] m, walked [${walked.map((m) => m.toFixed(0)).join(', ')}] m, phases ` +
          `[${[...phaseCount].map(([p, n]) => `${p}×${n}`).join(' ')}] over ${played.toFixed(0)}s played, ` +
          `${tail.tags - head.tags} tagged`,
      )
      const bodies = BANK_PLAYER_RADIUS + BANK_CHILD_RADIUS
      check(
        'and never through him: no child body reaches the traveller`s own',
        minGap >= bodies,
        `closest approach ${minGap.toFixed(2)} m (bodies meet at ${bodies.toFixed(2)} m) during ${closestAt}`,
      )
      check(
        'they give the stranger the extra berth they owe him over a villager (spec item 7)',
        minGap >= bodies + planted.berth,
        `closest approach ${minGap.toFixed(2)} m against the berth ${(bodies + planted.berth).toFixed(2)} m ` +
          `(strangerBerth ${planted.berth})`,
      )
      // A window in which no child of a run ever came within `LANE_SHOT_GAP` of
      // him, ahead of him and closing, is a FAILURE of the check directly below,
      // not a picture to paper over — but the frame
      // is still written, aimed at the stage, so the reader can see WHAT the
      // group was doing instead.
      check('and the run was photographed with a child in it', shotRun, shotRun ? '' : 'no runner came near enough, ahead and closing, to shoot')
      if (!shotRun) {
        await frame('687-bank-game-traveller', {
          local: { x: planted.far.x, y: planted.r * 0.5, z: planted.far.z },
          label: 'the stretch the traveller stood in — no runner came near enough to photograph',
          settle: false,
        })
      }
    }
  }
  // --- THE TAPPING CHILD'S HAND ON ITS STONE (work-order 1065) ----------------
  //
  // The user watched a child say ROCK standing a metre off the rock it named and
  // read the word as "go!". The Vitest layer proves the SOLVE — where to stand,
  // which way to reach — against the mesh's own silhouette; what only the browser
  // can settle is that the drawn hand ends on the drawn stone. So the reading is
  // taken off the SCENE GRAPH: the hand mesh's world position, the flank the
  // instanced rock presents at that height and bearing, and the gap between them.
  if (staged) {
    // At these shots' ~150 px/m, the former 6 cm bar admitted 9 pixels of
    // daylight. Five millimetres is <1 pixel: 2 mm solve residual plus <2 mm
    // hand-sphere faceting, rounded up by 1 mm. The flank is now the exact mesh,
    // not the edge-bin approximation that overstated it by up to 64 mm in the
    // unit fixtures (docs/hand-stone-contact.md). Judge the new pictures too;
    // this bar covers the hold the checks below judge (the trace restarts at
    // every hold, so the last one read) and its recorded word frames.
    const contactBar = 0.005
    const holdSeconds = await page.evaluate(
      () => window.__balance?.villageLife?.bankGame?.tapPauseSeconds ?? 0,
    )
    // THE TAP MUST BE WITHIN EARSHOT, OR THERE IS NO ARM TO MEASURE (work-order
    // 1065). A gesture carries exactly as far as the voice (point 580), so a tap
    // spoken further off than the hearing radius is deliberately ARMLESS — and
    // this section then measured the hearing gate rather than the touch: on
    // WebGL 2 it read 57.8 cm with the shoulder at REST, written and drawn
    // alike, 40 ms into a nine-second hold, where no gesture can have expired.
    // Whichever side of the radius the traveller happened to be left on decided
    // the verdict, which is why the same code went green on WebGPU and red on
    // WebGL 2. He is therefore stood BETWEEN the two play rocks first, and the
    // stand is asserted rather than assumed.
    // The stance itself is one function, because the shot below borrows the
    // traveller and has to hand him back to exactly this spot.
    const restoreEarshotStance = () =>
      page.evaluate(() => {
        const L = window.__placeLayout
        const p = window.__placePlayer
        if (!L?.playRocks || !p) return null
        const near = L.playRocks.upstream
        const far = L.playRocks.downstream
        p.x = (near.x + far.x) / 2
        p.z = (near.z + far.z) / 2
        p.pitch = -0.05
        p.yaw = Math.atan2(far.x - p.x, far.z - p.z)
        return {
          radius: window.__balance.communication.hearingRadius,
          rockR: L.playRocks.r,
          toNear: Math.hypot(near.x - p.x, near.z - p.z),
          toFar: Math.hypot(far.x - p.x, far.z - p.z),
        }
      })
    const earshot = await restoreEarshotStance()
    // The tapper stands at the stone's flank on the lane side, a rock's radius
    // nearer than its centre; a stretch longer than twice the hearing radius
    // (21 m since 1245) still leaves both tappers in earshot.
    check(
      'the traveller stands within earshot of BOTH tappers, so a tap has an arm at all',
      !!earshot && Math.max(earshot.toNear, earshot.toFar) - earshot.rockR <= earshot.radius,
      earshot
        ? `${earshot.toNear.toFixed(1)} m and ${earshot.toFar.toFixed(1)} m from the two rock centres, ` +
          `${earshot.rockR} m less to the tapper at the flank, hearing radius ${earshot.radius} m`
        : 'the layout or the player was not readable',
    )
    let bestTouch = null
    let sawTouchPose = false
    let stationTap = null
    let looseTouch = null
    let opening = null
    let inHold = false
    let heldToTheEnd = false
    let tapAimed = false
    let tapShot = false
    const holdTrace = []
    /** A spectator's stance in the lane, 4.2 m off and level with the
     *  contact, so a hand and a stone read as two things.
     *
     *  AND ON THE SIDE THE ARM IS ON (work-order 1065). The quarter-turn used to
     *  be added blind, and the touching hand is the LEFT one on a child that
     *  FACES the stone: from the other flank the child's own body and head stand
     *  in front of the contact, and the frame declared a hand on a flank while
     *  showing a child leaning against a rock with its visible arm hanging
     *  (measured 10.09.2026, WebGPU). The offset between the drawn hand and the
     *  drawn body says which side to stand on. */
    const aimAtTap = async (hand) =>
      !!(await page.evaluate((h) => {
        const p = window.__placePlayer
        if (!p) return null
        const bearing = Math.atan2(h.x - h.rock.x, h.z - h.rock.z)
        const at = (s) => ({
          x: h.rock.x + Math.sin(bearing + 0.9 * s) * 4.2,
          z: h.rock.z + Math.cos(bearing + 0.9 * s) * 4.2,
        })
        // The side is CHOSEN, not assumed, and by the thing that matters: from
        // which of the two does the drawn hand stand clear of the drawn body?
        // That is the hand's distance from the eye→body line, and asking it
        // beats deriving a handedness convention that the figure, the yaw and
        // the camera each spell differently.
        const clearance = (c) => {
          const b = h.body
          if (!b) return 0
          const dx = b.x - c.x
          const dz = b.z - c.z
          const len = Math.hypot(dx, dz)
          if (!(len > 1e-6)) return 0
          return Math.abs(dz * (h.x - c.x) - dx * (h.z - c.z)) / len
        }
        const stand = clearance(at(1)) >= clearance(at(-1)) ? at(1) : at(-1)
        p.x = stand.x
        p.z = stand.z
        p.yaw = Math.atan2(-(h.x - p.x), -(h.z - p.z))
        p.pitch = -0.1
        return true
      }, hand))
    // THE BUDGET IS THE HOLD'S OWN LENGTH, NOT A ROUND NUMBER (work-order 1065).
    // INSIDE a hold this loop steps ONE frame per turn, so reading a hold from
    // the word to its far side costs as many turns as the lane draws frames in
    // `tapPauseSeconds` — and 400 does not cover a nine-second hold on WebGL 2.
    // It ran out INSIDE a hold and then failed its own coverage check: measured
    // 09.09.2026, 49 readings into the current hold on one run and 140 on the
    // next. That is not a hand that never arrived, it is a loop out of turns.
    // Sized for two whole holds at a pessimistic 60 fps plus the walk to the
    // stone, so the loop leaves because it is FINISHED, never because it is
    // spent — and the coverage check below therefore means what it says.
    const sampleBudget = Math.ceil(holdSeconds * 60) * 2 + 300
    for (let i = 0; i < sampleBudget; i++) {
      const now = await page.evaluate(() => (window.__placeTapHand ? window.__placeTapHand() : null))
      if (now) {
        if (now.gesture === 'touch') sawTouchPose = true
        if (!bestTouch || Math.abs(now.gap) < Math.abs(bestTouch.gap)) bestTouch = now
        // ...and the WORST reading WHILE THE WORD IS FALLING, which is where the
        // old defect lived: a hand out at the waiting station as ROCK is spoken.
        // The window is the tap's own hold (`tapFor` running in the run phase),
        // NOT the touch gesture: the gesture outlives the moment it belongs to,
        // so a child that is tapper twice in a row is still flagged 'touch' while
        // it walks to the stone for the next round, and measuring that walk
        // measures a gait rather than an utterance (08.09.2026, 58.3 cm).
        const holding = now.phase === 'run' && now.tapFor > 0
        // THE SHAPE OF THE HOLD, not only its worst reading. A hand that never
        // arrives and a hand that arrives one frame late produce the same worst
        // number; only the curve tells them apart, and only the written-against-
        // drawn pair says whether a late arrival is the pose or the drawing of
        // it (work-order 1065).
        // COVERAGE IS PER HOLD, NEVER CARRIED ACROSS ONE. A latched flag would
        // let the loop leave INSIDE a later hold on readings taken during an
        // earlier one, which is the same coin toss in a longer disguise: the
        // trace is therefore restarted at every hold and only a hold that was
        // read from the word to its far side counts (GPT-6 Astra, second round).
        if (holding) {
          if (!inHold) {
            inHold = true
            holdTrace.length = 0
            stationTap = null
          }
          holdTrace.push(now)
        } else if (inHold) {
          inHold = false
          heldToTheEnd = holdTrace.length >= 6
        }
        if (now.opening && (!opening || now.opening.tapper !== opening.tapper)) opening = now.opening
        if (holding && (!stationTap || Math.abs(now.gap) > Math.abs(stationTap.gap))) stationTap = now
        if (now.gesture === 'touch' && !holding && (!looseTouch || Math.abs(now.gap) > Math.abs(looseTouch.gap))) {
          looseTouch = now
        }
        // THE SHUTTER FALLS INSIDE THE HOLD, NOT AFTER IT (work-order 1065).
        // The picture used to be taken once the sampling loop had run THROUGH
        // the hold — so the frame declared "its hand on the drawn flank while it
        // names ROCK" and contained a child standing two metres off the stone
        // with its arm at its side, which is the very defect this section
        // exists to catch (08.09.2026). Aiming costs one frame, so the camera is
        // placed on the first good holding reading and the shutter falls on the
        // next one, both still inside the hold.
        if (holding && !tapShot && Math.abs(now.gap) <= contactBar) {
          if (!tapAimed) {
            tapAimed = await aimAtTap(now)
          } else {
            await frame('1065-tapping-child-at-its-rock', {
              local: { x: now.x, y: now.y, z: now.z },
              label:
                `the tapping child at its rock: its hand on the drawn flank of the stone ` +
                `(${(now.gap * 100).toFixed(1)} cm gap at ${now.y.toFixed(2)} m) while it names ROCK`,
            })
            tapShot = true
            // AND THE STANCE GOES BACK (work-order 1065). The traveller is the
            // LISTENER as well as the camera, and this shot walks him 4.2 m off
            // one rock — from the far flank the next round's stone falls outside
            // the hearing radius and its tap is armless by design, which this
            // section then reads as a tap from the waiting station (measured
            // 10.09.2026: 60.9 cm, the word carrying 8.5 m). He is put back
            // between the two rocks, where the earshot check above stood him.
            await restoreEarshotStance()
          }
        }
      }
      // ONE READING OF A HOLD IS A COIN TOSS. The loop used to stop at its first
      // good reading, so which single frame of a nine-second hold got measured
      // was luck — and the worst-reading check below then went red or green at
      // random on the same code (measured 08.09.2026). It now samples the hold
      // one frame per turn and runs THROUGH IT: a hand that arrives and then
      // leaves again is caught only by staying to the end. `inHold` is the
      // current sample's own state, so the loop can only leave on the far side
      // of a hold.
      if (bestTouch && Math.abs(bestTouch.gap) <= contactBar && sawTouchPose && heldToTheEnd && !inHold) break
      await nextFrames(now && now.phase === 'run' && now.tapFor > 0 ? 1 : 2)
    }
    check(
      'the tapping child reaches its stone at all (work-order 1065)',
      !!bestTouch,
      bestTouch ? `child ${bestTouch.tapper} at the ${bestTouch.end} rock` : 'no tapper was ever designated',
    )
    if (bestTouch) {
      // The same subpixel bar applies to the best frame and the worst hold
      // reading below; a walking allowance cannot be added to resting contact.
      check(
        'and its DRAWN hand rests on the stone`s DRAWN flank, not a metre off it',
        Math.abs(bestTouch.gap) <= contactBar,
        `hand ${bestTouch.hand} at ${bestTouch.radius.toFixed(3)} m from the stone axis, its flank ` +
          `${bestTouch.flank.toFixed(3)} m there — gap ${(bestTouch.gap * 100).toFixed(1)} cm ` +
          `at height ${bestTouch.y.toFixed(2)} m`,
      )
      check(
        'and the tap really is a TOUCH, held on the stone while the word falls',
        sawTouchPose,
        sawTouchPose ? 'the touch pose was seen running on the tapper' : 'the tapper never held a touch',
      )
      check(
        'and the whole hold was read, not one frame of it',
        heldToTheEnd && !inHold,
        heldToTheEnd && !inHold
          ? `${holdTrace.length} readings across one hold, from the word to its far side`
          : `the sampling left while a hold was still running (${holdTrace.length} readings ` +
            'in the current one) — a hand that arrives and then leaves again would not be seen',
      )
      if (stationTap) {
        // WHAT A READING IS, in one place, because the worst one and the frames
        // around it have to be comparable at a glance. Four numbers decide
        // between the three ways this check can go red, and reading them off the
        // scene costs nothing (work-order 1065):
        //  - `gap`      — the hand off the drawn flank.
        //  - `r <radius>`— the hand's distance from the stone's AXIS. A gap that
        //    grows while this stays put is an ARM returning to rest; a gap that
        //    grows WITH it is a BODY that was moved off its stand.
        //  - the gesture's KIND and its own AGE. A touch is issued for the hold
        //    plus its fade-out, so an age short of that with the kind already
        //    gone means the gesture was REPLACED, and one past it means the two
        //    clocks ran at different speeds.
        //  - `written`/`drawn` — the pose this component wrote against the pose
        //    the figure is really drawn with, which is the render-lag reading.
        const reading = (r) =>
          `[${r.tapFor.toFixed(2)}s ${(r.gap * 100).toFixed(0)}cm r${r.radius.toFixed(2)} ` +
          `${r.gesture ?? 'rest'}@${typeof r.gestureAge === 'number' ? r.gestureAge.toFixed(2) : '-'} ` +
          `written ${r.written ? r.written.leftPitch.toFixed(2) + '/' + r.written.rightPitch.toFixed(2) : '-'} ` +
          `drawn ${(r.drawn ?? []).map((a) => a.pitch.toFixed(2)).join('/') || '-'}]`
        // THE WINDOW AROUND THE WORST READING, not the hold's first six frames.
        // The old text printed the opening of the hold, and this defect happens
        // at its END — so every failure so far showed six frames of a hand
        // resting on its stone and said nothing at all about the moment it left
        // (measured 10.09.2026: the trace read 1 cm six times while the check
        // failed at 61.1 cm). The opening is still worth one frame, so it is
        // kept and the window is spliced in after it.
        const worst = holdTrace.indexOf(stationTap)
        // stationTap is only ever set on a holding sample the trace has just
        // taken, and both reset together, so it is always in the trace.
        const around = [holdTrace[0], ...holdTrace.slice(Math.max(1, worst - 3), worst + 4)]
        check(
          'and the tapping hand stays within 5 mm of the flank over the whole hold',
          Math.abs(stationTap.gap) <= contactBar,
          `the worst reading while the word was falling stood ${(stationTap.gap * 100).toFixed(1)} cm ` +
            `off the flank, ${stationTap.tapFor.toFixed(2)} s into the hold's remainder, ` +
            `with the ${stationTap.gesture ?? 'rest'} gesture ` +
            `${typeof stationTap.gestureAge === 'number' ? stationTap.gestureAge.toFixed(2) + ' s' : 'an unread time'} old ` +
            `and its hand ${stationTap.radius.toFixed(2)} m from the stone's axis ` +
            `(the word carried ` +
            `${typeof stationTap.opening?.heardFrom === 'number' ? stationTap.opening.heardFrom.toFixed(1) + ' m' : 'an unread distance'}` +
            ` to the traveller; beyond the hearing radius there is no arm to measure, by design) ` +
            `(the hold runs from ${holdSeconds.toFixed(2)} s down to 0, so a reading near the top ` +
            `is the arm still swinging in and one near 0 is it swinging back out; a touch is issued ` +
            `for the hold plus its fade-out, so its age should reach ` +
            `${holdSeconds.toFixed(2)} s and no gesture can expire inside the hold)` +
            (looseTouch
              ? `; outside the hold the touch pose ran on as far as ${(looseTouch.gap * 100).toFixed(1)} cm ` +
                `in phase ${looseTouch.phase}, which is the walk to the next round rather than a tap`
              : '') +
            `; the hold opened and then read, around the worst frame, ` +
            around.map(reading).join(' '),
        )
      }
      // AND THE FRAME THE WORD FALLS IN, measured when it fell rather than
      // sampled for afterwards. A sampler reads one frame of a nine-second hold
      // and which one is luck — this reading is taken by the scene itself, in
      // the frame the tap is uttered, once that frame's pose is written AND
      // applied. It is the check that would have named the one-frame render lag
      // straight away (08.09.2026: 54 cm at the word, on the stone from the next
      // frame on).
      check(
        'the utterance frame was recorded at all, so the reading below is owed',
        !!opening,
        opening
          ? `child ${opening.tapper}'s tap recorded at the frame it fell`
          : 'no utterance frame was recorded — the check below would otherwise pass unasked',
      )
      check(
        'and the hand is on the stone in the very frame the word falls',
        !!opening && Math.abs(opening.gap) <= contactBar,
        opening
          ? `child ${opening.tapper}: gap ${(opening.gap * 100).toFixed(1)} cm at the utterance, ` +
            `shoulder drawn at ${opening.drawnPitch.toFixed(2)} rad against the ` +
            `${opening.writtenPitch.toFixed(2)} rad written for that frame`
          : 'unmeasured',
      )

      // THE PICTURE IS TAKEN ABOVE, INSIDE THE HOLD. What is left here is the
      // honest report when no hold ever offered one — a silent missing frame
      // would read as a suite that stopped short, and a frame taken now would
      // claim a contact the scene is no longer showing.
      check(
        'and the contact was PHOTOGRAPHED while it was happening',
        tapShot,
        tapShot
          ? 'the shutter fell inside the hold, on a reading within tolerance'
          : `no hold offered a frame to shoot (aimed: ${tapAimed}) — the picture would have ` +
            'been taken after the hand had already left the stone',
      )
    }

    // Retain the actual first charge frame with several catchers. The latch
    // stops only after the tapper's return; it never moves or assigns a child.
    await restoreEarshotStance()
    await page.evaluate(() => window.__placeHoldCharge(true))
    try {
      const start = await page.evaluate(() => window.__placeTag().playedClock)
      let charged = null
      for (;;) {
        const now = await page.evaluate(() => window.__placeTag())
        if (now.chargeHeld) {
          charged = now.catcherLine
          break
        }
        if (now.playedClock - start >= cycleWaitSeconds) break
        // A slow renderer buys less game time; only a stopped clock times out.
        const advanced = await page.waitForFunction((was) => {
          const t = window.__placeTag()
          return t.chargeHeld || t.playedClock > was
        }, now.playedClock, { timeout: 90000, polling: 'raf' }).then(() => true).catch(() => false)
        if (!advanced) break
      }
      const reach = await page.evaluate(() => window.__balance.villageLife.bankGame.reachDistance)
      check(
        'the charge starts with every catcher back in one line before its rock',
        !!charged && charged.children.length >= 2 && charged.children.every((c) =>
          Math.hypot(c.x - c.station.x, c.z - c.station.z) <= reach * 0.6),
        JSON.stringify(charged),
      )
      if (charged) {
        // Frame the whole line and the stone behind it, from the running ground.
        const subject = await page.evaluate((line) => {
          const p = window.__placePlayer
          const L = window.__placeLayout.playRocks
          const other = Math.hypot(L.upstream.x - line.rock.x, L.upstream.z - line.rock.z) < 0.01
            ? L.downstream : L.upstream
          const dx = other.x - line.rock.x
          const dz = other.z - line.rock.z
          const len = Math.hypot(dx, dz)
          const target = { x: line.rock.x + dx / len * 1.5, y: 0.7, z: line.rock.z + dz / len * 1.5 }
          p.x = line.rock.x + dx / len * 8 - dz / len * 3
          p.z = line.rock.z + dz / len * 8 + dx / len * 3
          p.yaw = Math.atan2(-(target.x - p.x), -(target.z - p.z))
          p.pitch = -0.1
          return target
        }, charged)
        await nextFrames(2)
        await frame('1109-catcher-line-at-charge-start', {
          local: subject,
          label: `${charged.children.length} catchers together before their rock at charge start; child ${charged.tapper} has stepped back from the tap`,
        })
      }
    } finally {
      await page.evaluate(() => window.__placeHoldCharge(false))
      await restoreEarshotStance()
    }

    // ARRIVAL CONTACT (work-order 1106). Follow one spoken runner by identity
    // through the side swap and to the far side of its own hold. Another
    // runner naming the same stone cannot replace this trace halfway through.
    await restoreEarshotStance()
    const arrivalSeconds = await page.evaluate(() => {
      // Lengthen only the contact observation, after the ordinary round checks.
      window.__balance.villageLife.bankGame.arrivalHoldSeconds = 9
      return window.__balance.villageLife.bankGame.arrivalHoldSeconds
    })
    const arrivalHearingRadius = await page.evaluate(() => window.__balance.communication.hearingRadius)
    let unheardOpening = null
    let unheardArrivals = 0
    let runner = null
    let arrivalOpening = null
    let arrivalEnded = false
    let arrivalAimed = false
    let arrivalShot = false
    const arrivalTrace = []
    const arrivalBudget = Math.ceil(arrivalSeconds * 60) * 2 + 900
    for (let i = 0; i < arrivalBudget; i++) {
      const now = await page.evaluate((speaker) => window.__placeArrivalHand?.(speaker) ?? null, runner ?? undefined)
      if (runner === null && now?.arrivalFor > 0 && now.opening && now.clock - now.opening.clock <= 0.2) {
        // The midpoint is in earshot of both rock AXES, but alternate arrival
        // stands can lie beyond it: a measured +25° approach reaches the stone
        // at 10.43 m from the listener. The hearing gate then correctly leaves
        // the hand at rest (66.05 cm), despite the game's completed contact hold.
        // Acquire by hearing distance, never by gesture or gap: a heard word
        // with a missing/bad arm must still fail every existing contact check.
        const heardFrom = now.opening.heardFrom
        if (typeof heardFrom === 'number' && Number.isFinite(heardFrom) && heardFrom <= arrivalHearingRadius) {
          runner = now.tapper
          arrivalOpening = now.opening
        } else if (unheardOpening !== now.opening.clock) {
          unheardOpening = now.opening.clock
          unheardArrivals++
        }
      }
      if (runner !== null && now?.tapper === runner) {
        if (now.opening?.clock !== arrivalOpening.clock) break
        if (now.arrivalFor <= 0) {
          arrivalEnded = true
          break
        }
        arrivalTrace.push(now)
        if (!arrivalShot && Math.abs(now.gap) <= contactBar && now.gesture === 'touch') {
          if (!arrivalAimed) arrivalAimed = await aimAtTap(now)
          else {
            await frame('1106-arriving-runner-hand-on-the-far-stone', {
              local: { x: now.x, y: now.y, z: now.z },
              label: 'the arriving runner with its hand on the far play rock while it names ROCK',
            })
            arrivalShot = true
            await restoreEarshotStance()
          }
        }
      }
      await nextFrames(now?.arrivalFor > 0 ? 1 : 2)
    }
    const arrivalWorst = Math.max(
      Math.abs(arrivalOpening?.gap ?? Infinity),
      ...arrivalTrace.map((r) => Math.abs(r.gap)),
    )
    check(
      'the arriving runner is read from ROCK to the far side of its contact hold',
      !!arrivalOpening && arrivalTrace.length >= 6 && arrivalEnded &&
        arrivalTrace[0].arrivalFor >= arrivalSeconds - 0.2 &&
        arrivalTrace.at(-1).arrivalFor <= 0.2,
      `${arrivalTrace.length} readings; opening ${arrivalOpening?.clock ?? 'missing'}, ` +
        `remaining ${arrivalTrace[0]?.arrivalFor ?? '-'} to ${arrivalTrace.at(-1)?.arrivalFor ?? '-'} s; ended ${arrivalEnded}; ` +
        `heard from ${arrivalOpening?.heardFrom ?? 'missing'} m (radius ${arrivalHearingRadius} m); ` +
        `${unheardArrivals} unheard openings before acquisition`,
    )
    check(
      'the arriving runner`s DRAWN hand stays within 5 mm of the far stone, including the word frame',
      arrivalWorst <= contactBar && arrivalTrace.every((r) => r.gesture === 'touch'),
      `worst ${(arrivalWorst * 100).toFixed(1)} cm over ${arrivalTrace.length} readings`,
    )
    check(
      'the arriving runner was photographed naming ROCK with its hand on the far stone',
      arrivalShot,
      arrivalShot ? 'shutter inside the arrival hold' : 'no arrival contact frame was captured',
    )
  }

  // --- THE CAUGHT CHILD'S SLUMP, FROM A SPECTATOR'S DISTANCE (work-order 1239) --
  //
  // A caught child now stands where it was caught, trunk leaned and arms hanging.
  // The pose is pinned in Vitest; what only the picture can settle is whether it
  // reads at 10-14 m: not as a runner mid-sprint (lean 0.28 rad against 0.48), and
  // not as a free child when the whole group stands still.
  //
  // THE STILL MOMENT IS THE END HOLD, NOT THE ROCK TAP. The tap opens each run,
  // and the children caught in the run before it have already rejoined the
  // catchers (`endRun`), so no child is caught while the tap holds. The one
  // moment the whole group stands still with caught and free children together
  // is the end-of-cycle hold (`part` with `endFor` running; the only `part` in
  // which anyone is slumped, which `bank-slumped-outside-run` enforces).
  //
  // Shot LAST in the section: the end hold leaves the round at the start of a
  // new cycle, which would shift the timing the tap and charge frames wait on.
  if (staged) {
    const SLUMP_RANGE = [10, 14]
    // No other child may stand within this of the sight line to the caught one,
    // in front of it or behind: the frame shows the caught child on its own.
    const SLUMP_CLEAR = 0.7
    // A stance 10-14 m off the subject, broadside to the pair when there is one,
    // inside the settlement's own boundary (`insidePlace`, the function that
    // decides leaving) and clear of the colliders. The place camera is the eye,
    // so the stance is also where the sight line starts; candidates are sifted
    // in one page call, and `why` tallies what turned them down for a red.
    const standOff = async (caught, other, others, why) => {
      const mid = other ? { x: (caught.x + other.x) / 2, z: (caught.z + other.z) / 2 } : caught
      const picks = await page.evaluate(
        async ({ caught, mid, other, others, range, clear }) => {
          const { insidePlace } = await import('/src/scenes/place/boundary.ts')
          const L = window.__placeLayout
          if (!L) return { picks: [], tally: { layout: 1 } }
          const tally = {}
          const no = (k) => ((tally[k] = (tally[k] ?? 0) + 1), false)
          const reach = (c) =>
            c.kind === 'box' ? Math.hypot(c.hx, c.hz) : c.kind === 'segment' ? c.r + Math.hypot(c.x2 - c.x1, c.z2 - c.z1) / 2 : c.r
          const base = other ? Math.atan2(other.z - caught.z, other.x - caught.x) + Math.PI / 2 : 0
          const picks = []
          for (const back of [11, 12, 10.5, 13]) {
            for (let k = 0; k < 24; k++) {
              const a = base + (k * Math.PI) / 12
              const x = mid.x + Math.cos(a) * back
              const z = mid.z + Math.sin(a) * back
              const d = Math.hypot(caught.x - x, caught.z - z)
              if (d < range[0] + 0.3 || d > range[1] - 0.3) { no('range'); continue }
              if (!insidePlace(L, x, z, 1)) { no('outside'); continue }
              let blocked = false
              for (const c of window.__placeColliders ?? []) {
                const m = c.kind === 'segment' ? { x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2 } : { x: c.x, z: c.z }
                if (Math.hypot(x - m.x, z - m.z) - reach(c) < 0.5) { blocked = true; break }
              }
              if (blocked) { no('collider'); continue }
              let across = Infinity
              for (const o of others) across = Math.min(across, Math.abs((caught.z - z) * (o.x - x) - (caught.x - x) * (o.z - z)) / d)
              if (across < clear) { no('crowded'); continue }
              // Broadside to the pair first; otherwise the widest clearance.
              picks.push({ x, z, score: (other ? -Math.abs(Math.sin(a - base)) * 2 : 0) - Math.min(across, 3) })
            }
          }
          picks.sort((p, q) => p.score - q.score)
          return { picks: picks.slice(0, 4), tally }
        },
        { caught, mid, other, others: others ?? [], range: SLUMP_RANGE, clear: SLUMP_CLEAR },
      )
      for (const [k, n] of Object.entries(picks.tally)) why[k] = (why[k] ?? 0) + n
      for (const pick of picks.picks) {
        await page.evaluate(
          ({ pick, mid }) => {
            const p = window.__placePlayer
            p.x = pick.x
            p.z = pick.z
            // Place-camera yaw 0 looks toward -Z, hence the +PI; level, the
            // children are at eye distance and the frame needs no tilt.
            p.yaw = Math.atan2(mid.x - pick.x, mid.z - pick.z) + Math.PI
            p.pitch = -0.06
          },
          { pick, mid },
        )
        await nextFrames(3)
        // Judged again from where the camera really stands, by the drawn ray.
        const hit = await page.evaluate(
          ({ q, others }) => {
            if (window.__game.getState().placeId !== 'bambara-village') return { lost: true }
            const r = window.__placeRayHit?.(q.x, 0.4, q.z)
            const cam = window.__placeCamera?.position
            if (!r || !cam) return null
            const dx = q.x - cam.x
            const dz = q.z - cam.z
            const len = Math.hypot(dx, dz) || 1
            let across = Infinity
            for (const o of others) across = Math.min(across, Math.abs(dz * (o.x - cam.x) - dx * (o.z - cam.z)) / len)
            return { ...r, across }
          },
          { q: caught, others: others ?? [] },
        )
        if (hit?.lost) return hit
        if (!hit) { why.probe = (why.probe ?? 0) + 1; continue }
        if (hit.targetDistance < SLUMP_RANGE[0] || hit.targetDistance > SLUMP_RANGE[1]) { why.drawnRange = (why.drawnRange ?? 0) + 1; continue }
        if (hit.across < SLUMP_CLEAR) { why.drawnCrowded = (why.drawnCrowded ?? 0) + 1; continue }
        if (hit.hitDistance != null && hit.hitDistance < hit.targetDistance * 0.9) { why.occluded = (why.occluded ?? 0) + 1; continue }
        return { distance: hit.targetDistance, across: hit.across }
      }
      return null
    }
    const readKids = () =>
      page.evaluate(() => {
        const t = window.__placeTag()
        return {
          clock: t.clock,
          phase: t.phase,
          c: t.children.map((k, i) => ({ i, x: k.x, z: k.z, slumped: k.slumped, pace: k.pace })),
        }
      })

    // (1) IN THE RUN: a caught child standing out the run, clear of the others.
    // Bounded twice: by the game's own clock (two whole cycles) and by an
    // iteration cap as a runaway backstop.
    let runShot = null
    let lost = false
    // What the window offered, for a red that names why nothing was shot.
    const runWhy = { caughtMoments: 0, alone: 0 }
    const runFirst = (await readKids()).clock
    for (let i = 0; i < 12000 && !runShot && !lost; i++) {
      const s = await readKids()
      if (s.clock - runFirst > 2 * cycleWaitSeconds) break
      if (s.phase === 'run' && s.c.some((k) => k.slumped)) runWhy.caughtMoments++
      // A caught child standing clear of the run: at least 2 m from every child
      // but its own catcher, which stops beside its catch for the rest of the
      // run (`madeTag`), so "2 m from all" never happens. The stance is then
      // broadside to that pair, so the catcher stands beside it, not over it.
      let caught = null
      let catcher = null
      if (s.phase === 'run') {
        for (const k of s.c) {
          if (!k.slumped) continue
          const near = s.c.filter((o) => o !== k).sort((a, b) => Math.hypot(a.x - k.x, a.z - k.z) - Math.hypot(b.x - k.x, b.z - k.z))
          if (near.length > 1 && Math.hypot(near[1].x - k.x, near[1].z - k.z) >= 2) {
            caught = k
            catcher = near[0]
            break
          }
        }
      }
      if (caught) {
        runWhy.alone++
        const at = await standOff(caught, catcher, s.c.filter((o) => o !== caught), runWhy)
        if (at?.lost) lost = true
        const before = await readKids()
        const still = before.phase === 'run' && before.c[caught.i].slumped
        if (at && still) {
          await frame('1239-caught-child-standing-in-the-run', {
            local: { x: before.c[caught.i].x, y: 0.4, z: before.c[caught.i].z },
            label:
              `a caught child standing slumped where it was caught while the run goes on, its stopped catcher ` +
              `beside it and every other child 2 m or more away, ${at.distance.toFixed(1)} m from the camera, ` +
              `no other child within ${at.across.toFixed(1)} m of its sight line`,
            settle: false,
          })
          const after = await readKids()
          if (after.phase === 'run' && after.c[caught.i].slumped) {
            runShot = {
              distance: at.distance,
              drift: Math.hypot(after.c[caught.i].x - before.c[caught.i].x, after.c[caught.i].z - before.c[caught.i].z),
              moving: after.c.filter((k) => !k.slumped && k.pace > 0).length,
              across: at.across,
            }
          }
        }
      }
      await nextFrames(2)
    }
    check('the settlement stays mounted while the camera stands off the caught child', !lost)
    check(
      'a caught child was photographed standing slumped clear of the run, 10-14 m off (work-order 1239)',
      !!runShot && runShot.drift < 0.02,
      runShot
        ? `${runShot.distance.toFixed(1)} m, drifted ${(runShot.drift * 100).toFixed(1)} cm across the shutter, ${runShot.moving} free child(ren) moving, ` +
          `sight line ${runShot.across.toFixed(1)} m clear of the others`
        : `no caught child could be photographed inside the window — ${JSON.stringify(runWhy)}`,
    )

    // (2) IN THE END HOLD: caught and free children standing side by side. The
    // hold is lengthened for the shutter, like the tap pause above; the pose is
    // the same code path at 12 s.
    const shippedEnd = await page.evaluate(() => {
      const b = window.__balance.villageLife.bankGame
      const was = b.endPauseSeconds
      b.endPauseSeconds = 12
      return was
    })
    let holdShot = null
    const holdWhy = { pairMoments: 0 }
    const holdFirst = (await readKids()).clock
    for (let i = 0; i < 12000 && !holdShot && !lost; i++) {
      const s = await readKids()
      if (s.clock - holdFirst > 2 * cycleWaitSeconds + 20) break
      const caughtKids = s.phase === 'part' ? s.c.filter((k) => k.slumped) : []
      const free = s.phase === 'part' ? s.c.filter((k) => !k.slumped) : []
      if (caughtKids.length && free.length && caughtKids.some((c) => free.some((f) => Math.hypot(f.x - c.x, f.z - c.z) >= 1))) {
        // The closest caught/free pair at least 1 m apart, so neither hides the
        // other: "side by side" is a statement about them.
        let pair = null
        for (const c of caughtKids) {
          for (const f of free) {
            const d = Math.hypot(f.x - c.x, f.z - c.z)
            if (d >= 1 && (!pair || d < pair.d)) pair = { c, f, d }
          }
        }
        holdWhy.pairMoments++
        const at = await standOff(pair.c, pair.f, s.c.filter((o) => o !== pair.c && o !== pair.f), holdWhy)
        if (at?.lost) lost = true
        const before = await readKids()
        if (at && before.phase === 'part' && before.c[pair.c.i].slumped) {
          await frame('1239-caught-and-free-in-the-end-hold', {
            local: { x: pair.c.x, y: 0.4, z: pair.c.z },
            label:
              `the end-of-cycle hold: a caught child standing slumped ${pair.d.toFixed(1)} m beside a free one, ` +
              `the whole group still, ${at.distance.toFixed(1)} m from the camera`,
          })
          const after = await readKids()
          if (after.phase === 'part' && after.c[pair.c.i].slumped) {
            holdShot = {
              distance: at.distance,
              apart: pair.d,
              // The pair is what the claim is about; the group's largest drift is
              // reported, since an arriving runner may still finish its approach.
              drift: Math.max(...[pair.c.i, pair.f.i].map((j) => Math.hypot(after.c[j].x - before.c[j].x, after.c[j].z - before.c[j].z))),
              groupDrift: Math.max(...after.c.map((k, j) => Math.hypot(k.x - before.c[j].x, k.z - before.c[j].z))),
            }
          }
        }
      }
      await nextFrames(2)
    }
    // Put back only once the hold is over: `endFor` may not exceed the pause it
    // runs against (`bank-phase-overrun`). Capped, and loud if it never ends.
    let holdOver = false
    for (let i = 0; i < 3000 && !holdOver; i++) {
      const s = await readKids()
      holdOver = s.phase !== 'part' || !s.c.some((k) => k.slumped)
      if (!holdOver) await nextFrames(2)
    }
    check('and the lengthened end hold runs out before its shipped length is restored', holdOver)
    await page.evaluate((was) => {
      window.__balance.villageLife.bankGame.endPauseSeconds = was
    }, shippedEnd)
    check('the settlement stays mounted through the end-hold stance', !lost)
    check(
      'a caught and a free child were photographed standing still side by side in the end hold, 10-14 m off (work-order 1239)',
      !!holdShot && holdShot.drift < 0.02,
      holdShot
        ? `${holdShot.distance.toFixed(1)} m, pair ${holdShot.apart.toFixed(1)} m apart, pair drift ${(holdShot.drift * 100).toFixed(1)} cm, group ${(holdShot.groupDrift * 100).toFixed(1)} cm across the shutter`
        : `no end hold with a caught and a free child could be photographed inside the window — ${JSON.stringify(holdWhy)}`,
    )
  }

  // The world goes back as it was found: the shipped roam, roam guard, tap pause
  // and arrival hold, and the game left outside the settlement — every section after this one would otherwise be
  // reading a village this one staged.
  await page.evaluate((was) => {
    const b = window.__balance.villageLife.bankGame
    b.roamSeconds = was.roamSeconds
    b.roamGuardSeconds = was.roamGuardSeconds
    b.tapPauseSeconds = was.tapPauseSeconds
    b.arrivalHoldSeconds = was.arrivalHoldSeconds
  }, shippedRoam)
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}

// --- A child up on a stone ----------------------------------------------------
// THE OFF-GAME ROCK HAS TO BE SEEN (work-order 1080). The children's spec asks
// for ROCK to be spoken at a stone that is no part of the game, so the word
// cannot be learned as "the thing you run to" — and the round has said it since
// work-order 687. Until this section nothing in this file looked at it: the only
// mention of the boulder SHORTENED the guard so the running section need not
// wait for it. So the picture
// side of that guard was never taken at all, while the unit suite asserted a
// flag that a child hovering 2.2 m from the stone for a third of a second
// satisfied. The user reported the climb as missing from the game, and he was
// right about the picture.
//
// What this section proves is the one thing only the browser can: that the child
// is really UP THERE, in the drawn scene, high enough and long enough to be
// looked at — and it takes the frame as evidence.
if (section('children-boulder-climb')) {
  // SPECTATOR TIME, the same knob the running section uses and for the same
  // reason (§21, a debug-menu value): the off-game ROCK falls once per roaming
  // phase, and the shipped cycle is about a hundred seconds long. Measured in
  // the fast-layer replay at THIS suite's seed, the boulder is named twice in
  // 400 s of village clock — a wait of minutes for a frame that lasts three
  // seconds. `roamSeconds` is what the phase is SCHEDULED for, so shortening it
  // brings the next roaming phase round sooner; `roamGuardSeconds` is left at
  // its shipped 45 s deliberately, because that overtime is what lets a long
  // approach finish, and cutting it would stage away the very moment this
  // section exists to photograph.
  //
  // AND THE HOLD IS NOT TOUCHED (work-order 1082). It used to be forced to 25 s
  // to give the shutter's five-second readiness wait room, and THAT staging was
  // the defect: the accepted picture proved the mechanic ran, never that a player
  // could see it, and the user reported the climb missing a second time at
  // shipped values. The stand is now the shipped one, the readiness wait is taken
  // BEFORE the climb rather than during it, and the frame is declared as the
  // moment it is (`settle: false`), as other moment frames in this file are.
  // A visit now opens at the rocks (work-order 1250), which puts the first
  // roaming phase a whole cycle later; this section photographs the roam, so it
  // turns that opening off for its own visit — a spectator knob like the roam.
  const shippedClimbRoam = await page.evaluate(() => {
    const b = window.__balance.villageLife.bankGame
    const was = { roamSeconds: b.roamSeconds, visitOpensAtBank: b.visitOpensAtBank }
    b.roamSeconds = 8
    b.visitOpensAtBank = false
    const g = window.__game.getState()
    if (g.placeId === 'bambara-village') g.leavePlace()
    return was
  })
  await page.waitForFunction(() => window.__game.getState().placeId !== 'bambara-village', null, { timeout: 30000 }).catch(() => {})
  await goToPlace('bambara-village')
  const staged = await page
    .waitForFunction(() => !!window.__placeTag && !!window.__placeTag().boulder, null, { timeout: 40000 })
    .then(() => true)
    .catch(() => false)
  check('the village carries a children`s round with a stone to climb', staged, 'no boulder published')
  if (staged) {
    const boulder = await page.evaluate(() => window.__placeTag().boulder)
    // Stand off the stone far enough that the whole child is in the picture, and
    // look at the height its feet will be at rather than at the ground.
    // NOT ON THE APPROACH. The first camera this section used stood seven metres
    // inward of the stone — squarely on the line the climber walks in on — and
    // the children, who give the traveller a wider berth than they give each
    // other (spec item 7), swerved round it until the approach watch gave up:
    // three minutes of `roam` in which no child ever started to climb. The
    // camera therefore keeps out of the wedge toward the children's quarter and
    // takes the best-lit side of the rest of the circle; it stands in the wedge
    // only when the settlement's ground leaves nothing else.
    // AND IT STANDS WHERE THE SUN IS BEHIND IT. The first take of this frame put
    // the camera on whichever side came first and photographed the shadowed
    // flank: a black stone with a black figure on it against bright sand, which
    // shows that something is up there without showing what. The place sun is a
    // fixed direction (`SUN_DIR` in src/scenes/place/PlaceScene.tsx, mirrored
    // here as this file mirrors the body radii), so the lit side is known, and
    // the camera takes the candidate that faces it.
    const PLACE_SUN_XZ = { x: 0.52, z: 0.34 }
    const stood = await page.evaluate(({ b, sun }) => {
      const p = window.__placePlayer
      const layout = window.__placeLayout
      if (!p || !layout) return null
      const q = layout.playGround ?? { x: 0, z: 0 }
      const away = Math.atan2(b.x - q.x, b.z - q.z)
      const rim = (layout.radius ?? 40) * 0.9
      const sunLen = Math.hypot(sun.x, sun.z) || 1
      // EVERY SIDE OF THE STONE THAT IS STILL IN THE VILLAGE, scored. A stone can
      // sit near the settlement's rim — at this suite's seed it stands 28 m out —
      // and then three of four quarter-turns fall off the drawn ground
      // altogether. So the whole circle is walked in steps, and the best of
      // whatever is left is taken.
      const pick = (keepClear) => {
        let best = null
        for (let step = 0; step < 36; step++) {
          const turn = (step / 36) * Math.PI * 2
          // The wedge toward the children's quarter is the approach the climber
          // walks in on, and the children swerve round the traveller rather than
          // through him: standing there once cost three minutes of `roam` with
          // no climb at all. It is given up only if the village leaves no other
          // ground to stand on.
          if (keepClear && Math.abs(Math.atan2(Math.sin(turn - Math.PI), Math.cos(turn - Math.PI))) < 0.6) continue
          const a = away + turn
          const x = b.x + Math.sin(a) * 7
          const z = b.z + Math.cos(a) * 7
          if (Math.hypot(x, z) > rim) continue
          // How well this side faces the light: the camera's offset from the
          // stone against the direction the sun comes from.
          const lit = (Math.sin(a) * sun.x + Math.cos(a) * sun.z) / sunLen
          if (!best || lit > best.lit) best = { x, z, turn, lit, clear: keepClear }
        }
        return best
      }
      const best = pick(true) ?? pick(false)
      if (!best) return null
      p.x = best.x
      p.z = best.z
      // The place camera's own convention, as the other aimed frames in this
      // file write it: the bearing to the target plus a half turn.
      p.yaw = Math.atan2(b.x - p.x, b.z - p.z) + Math.PI
      p.pitch = 0
      return best
    }, { b: boulder, sun: PLACE_SUN_XZ })
    check('the camera has ground to stand on off the children`s approach', !!stood, JSON.stringify(stood))
    // THE PICTURE IS WAITED FOR ONCE, HERE — before the climb, not between the
    // top of it and the shutter (the same order the tag standpoint takes, and for
    // the same reason). The stand lasts its shipped seconds, and a five-second
    // readiness wait started after the child is up there would photograph the
    // empty stone it climbed down from.
    await waitForSceneReady(page).catch(() => {})
    // THE CLIMB ITSELF, waited for on the round's own state. Only the roam's
    // schedule is shortened above; the guard is the shipped one and holds the
    // cycle for up to its 45 s until the boulder is named, so a visit that begins
    // in `roam` reaches this without further staging.
    const up = await page
      .waitForFunction(
        () => (window.__placeTag().children ?? []).some((c) => c.climb === 'top'),
        null,
        { timeout: 300000 },
      )
      .then(() => true)
      .catch(() => false)
    // A timeout has to say WHAT the round was doing, or the next reader is left
    // with "no child reached the top" and no way to tell a broken climb from a
    // cycle that simply had not come round yet.
    const why = up
      ? ''
      : await page.evaluate(() => {
          const t = window.__placeTag()
          const b = t.boulder
          const near = Math.min(
            ...(t.children ?? []).map((c) => Math.hypot(c.x - b.x, c.z - b.z)),
          )
          return `phase ${t.phase}, nearest child ${near.toFixed(1)} m from the stone at ` +
            `(${b.x.toFixed(1)},${b.z.toFixed(1)}), stages ${(t.children ?? []).map((c) => c.climb).join('/')}`
        })
    check('a child climbs the ordinary boulder and stands on it', up, why)
    if (up) {
      const onTop = await page.evaluate(() => {
        const t = window.__placeTag()
        const i = (t.children ?? []).findIndex((c) => c.climb === 'top')
        return { i, c: t.children[i], boulder: t.boulder }
      })
      const over = Math.hypot(onTop.c.x - onTop.boulder.x, onTop.c.z - onTop.boulder.z)
      check(
        'it stands ON the stone rather than beside it',
        over < 0.05 && Math.abs(onTop.c.lift - onTop.boulder.height) < 1e-6,
        `${over.toFixed(3)} m off the centre, feet at ${onTop.c.lift.toFixed(2)} m ` +
          `against a stone ${onTop.boulder.height.toFixed(2)} m high`,
      )
      // …AND THE FRAME IS JUDGED, NOT MERELY TAKEN (work-order 1082). A ray that
      // reaches the child proves nothing about how much of the picture it is:
      // the standpoint here is one a player occupies, seven metres off on the
      // ground, so the figure is measured the way the game of tag's own
      // standpoint is — projected through the LIVE camera, probed along its whole
      // axis against the rendered scene, and put to the same bar
      // (`judgeChildFigure`: whole, inside the frame, unoccluded, drawn where the
      // state says it is, and at least MIN_CHILD_PIXELS tall). The feet are at
      // the child's LIFT, not on the ground — it is standing on a stone.
      const view = page.viewportSize()
      const reading = await page.evaluate(
        ({ KID_HEIGHT, AXIS_SAMPLES, OCCLUDED_RATIO, CONFIRMED_RATIO, height }) => {
          const t = window.__placeTag()
          const cam = window.__placeCamera
          if (!t || !cam || !window.__placeRayHit) return null
          const i = (t.children ?? []).findIndex((c) => c.climb === 'top')
          if (i < 0) return { i: -1 }
          const c = t.children[i]
          // The SAME matrix math the frame shutter projects a `local` subject
          // with (scripts/verify/frameSubject.mjs) — no THREE in the page here.
          const apply = (e, v) =>
            [0, 1, 2, 3].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + e[r + 12] * v[3])
          const ndc = (x, y, z) => {
            const eyeAt = apply(cam.matrixWorldInverse.elements, [x, y, z, 1])
            const clip = apply(cam.projectionMatrix.elements, eyeAt)
            const w = clip[3]
            if (!(w > 0) || clip[2] / w >= 1) return null
            return [clip[0] / w, clip[1] / w]
          }
          const ndcFeet = ndc(c.x, c.lift, c.z)
          const ndcHead = ndc(c.x, c.lift + KID_HEIGHT, c.z)
          let occluded = 0
          let confirmed = 0
          for (const f of AXIS_SAMPLES) {
            const hit = window.__placeRayHit(c.x, c.lift + KID_HEIGHT * f, c.z)
            if (hit.hitDistance == null) continue
            const ratio = hit.hitDistance / hit.targetDistance
            if (ratio < OCCLUDED_RATIO) occluded++
            else if (ratio <= CONFIRMED_RATIO) confirmed++
          }
          // The word the climb exists for, over that same child's head — read off
          // the live label channel and its drawn anchor, not assumed from the fact
          // that the round said it.
          const label = (window.__speech?.labels() ?? []).find((l) => l.speakerId === `kid-${i}`)
          return {
            i,
            child: ndcFeet && ndcHead
              ? { pixels: (Math.abs(ndcHead[1] - ndcFeet[1]) / 2) * height, occluded, confirmed, ndcFeet, ndcHead }
              : { pixels: 0, occluded, confirmed, ndcFeet: null, ndcHead: null },
            word: label ? { atoms: label.atoms, screen: window.__speech?.anchorScreen(label.speakerId) ?? null } : null,
            view: { w: window.innerWidth, h: window.innerHeight },
          }
        },
        {
          KID_HEIGHT,
          AXIS_SAMPLES,
          OCCLUDED_RATIO,
          CONFIRMED_RATIO,
          height: view?.height ?? 900,
        },
      )
      const verdict = reading && reading.i >= 0
        ? judgeChildFigure(reading.child, 'the child on the stone')
        : { ok: false, reason: 'nobody is standing on the stone any more' }
      check(
        `the climb is photographable from a standpoint on the ground: the child reads whole, unoccluded and at ` +
          `least ${MIN_CHILD_PIXELS} px tall at the SHIPPED hold`,
        verdict.ok,
        verdict.reason,
      )
      // AND THE WORD IS UP IN THE SAME FRAME. The stand and the note over the
      // child's head are one duration (`climbHoldSeconds`), so a picture with the
      // child up and the word gone would mean that coupling has come apart.
      const word = reading?.word ?? null
      check(
        'and its word stands over its head, inside the picture',
        !!word && Array.isArray(word.atoms) && word.atoms.length === 1 && !!word.screen &&
          word.screen.x > 0 && word.screen.x < reading.view.w &&
          word.screen.y > 0 && word.screen.y < reading.view.h,
        JSON.stringify(word),
      )
      await frame('187-child-on-the-boulder', {
        // A MOMENT, not a settled scene: the child is up there for the seconds it
        // is up there, and a five-second quiet window would photograph the
        // aftermath. The readiness wait was taken before the climb.
        settle: false,
        local: { x: onTop.c.x, z: onTop.c.z, y: onTop.boulder.height + 0.55 },
        label: 'a village child standing on the ordinary boulder it has just named, with its word over its head',
      })
      // THE PICTURE HAS TO CONTAIN WHAT IT CLAIMS (CLAUDE.md §7.2). The shutter
      // judges that the declared POINT is in the frame; only the round can say
      // that the child was still standing on the stone when it opened.
      const still = await page.evaluate(
        (i) => window.__placeTag().children[i]?.climb ?? 'none',
        onTop.i,
      )
      check('and it was still up there when the shutter opened', still === 'top', still)
    }
  }
  await page.evaluate((was) => {
    window.__balance.villageLife.bankGame.roamSeconds = was.roamSeconds
    window.__balance.villageLife.bankGame.visitOpensAtBank = was.visitOpensAtBank
  }, shippedClimbRoam)
  await page.evaluate(() => window.__game.getState().leavePlace())
  await page.waitForFunction(() => !window.__game.getState().placeId, null, { timeout: 30000 })
}

await finishPolishSuite()
