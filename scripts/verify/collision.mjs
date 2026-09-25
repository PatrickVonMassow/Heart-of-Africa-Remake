// Headless verification for CLAUDE.md §7.1.16 (collision inside settlements).
// Headless Chromium throttles requestAnimationFrame, so sustained key-held
// walking is unreliable; the collision resolver runs in useFrame per input
// frame, so we verify it directly: place the player inside/against a solid
// object, feed a few input frames, and assert it is ejected to the object's
// surface and never penetrates. Reachability of paths/accesses is verified
// geometrically. Dev server only (dev hooks).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { sectionGate } from './sections.mjs'
import { installColliderProbe } from './colliderProbe.mjs'
import { fileURLToPath } from 'node:url'

// A fixed dev seed makes the procedural settlement layout deterministic so the
// collision/reachability checks are reproducible. It is applied by the LAUNCHER
// (verify-seed.mjs via _browser.mjs, point 557) — written here it lived in a default
// URL that `process.env.BASE_URL` discarded on every run-all run, so the suite
// claimed a fixed layout it did not have.
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))

// SECTIONS (point 566). Each settlement this suite walks through is a named
// block that owns the entry it needs: `if (section('<slug>')) { … }`. Without a
// request every one runs, in file order, exactly as before; `--section=<slug>`
// runs ONE of them, so repairing a single collision check no longer replays the
// port, both villages and the walk into the river. The names are read out of
// THIS FILE by scripts/verify/sections.mjs, so an unknown one is refused with
// the list of the real ones — and the run is stamped PARTIAL, never counted as
// suite coverage.
const sections = sectionGate()
const { section } = sections
if (sections.banner()) console.log(sections.banner())

let failures = 0
const check = (name, ok, detail) => {
  // The section tag goes AFTER the ' — ' separator: the check's NAME is its
  // identity for the red ledger and the baseline classifier and must not change.
  const tail = [detail, sections.tag().trim()].filter(Boolean).join('  ')
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${tail ? ' — ' + tail : ''}`)
  if (!ok) failures++
}

const browser = await launchVerifyBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// The collider geometry every suite reads with (scripts/verify/colliderProbe.mjs).
await installColliderProbe(page)
// A virtual standard-mapped pad (work-order 610), so the unstuck section can
// prove the escape is reachable without a keyboard. Nothing is pressed and no
// axis is pushed, so the deliberate-input guard keeps it dormant for every other
// section — an idle pad steers nothing (design.md §17.5).
await page.addInitScript(() => {
  window.__pad = {
    id: 'virtual', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  }
  Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] })
})
// Point 375: every frame declares what it must show and the shutter projects
// that subject before the file is written. It lives ABOVE the section blocks
// because three of them photograph — a helper declared inside one section is
// invisible to the next (scripts/verify/scope.test.mjs).
const shot = frameShutter(page, OUT)
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => window.__game, null, { timeout: 60000 })
// Point 184 (Pillar 3): confirm the requested backend actually initialised — throws
// on a silent WebGL2 fallback under VERIFY_GL=webgpu (the lane's guardrail).
await page.waitForFunction(() => window.__renderer, null, { timeout: 60000 })
await assertBackend(page)
await page.waitForTimeout(5000)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)

/** Minimum clearance of the player to any collider (negative = penetrating). */
async function clearance() {
  return page.evaluate(() => {
    const p = window.__placePlayer
    let worst = Infinity
    for (const c of window.__placeColliders) {
      const s = window.__clearanceTo(c, p.x, p.z) - 0.35
      if (s < worst) worst = s
    }
    return worst
  })
}

/** Drive a few input frames pushing forward (RAF-independent nudge). */
async function pushFrames(n = 12) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
    await page.waitForTimeout(40)
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
  await page.waitForTimeout(120)
}

/** Hold forward until the resolver has ejected the player clear of every collider
 *  (or a generous window). Pushing from a collider CENTRE to its surface takes many
 *  render frames, and a fixed frame count starves on the WebGPU backend's slower/
 *  colder headless cadence (point 184) — so poll for the clearance instead of
 *  counting frames. Re-affirms the held key each tick. */
async function pushUntilClear(maxMs = 15000) {
  const t0 = Date.now()
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
  while (Date.now() - t0 < maxMs) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
    await page.waitForTimeout(80)
    if ((await clearance()) >= -0.03) break
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
  await page.waitForTimeout(120)
}

/** Hold forward until the traveller's feet are within `reach` of a fixed point and
 *  STAY there while he keeps walking into it (or a generous window elapses).
 *
 *  Three measurements shape this. How far a held key walks is decided by the RENDER
 *  cadence, not by the number of presses — this settlement under headless WebGPU
 *  draws about a third of a frame per second (measured 15.09.2026: three frames in
 *  nine seconds), so a fixed count of 40 ms presses buys one or two steps and the
 *  walk stalls in open ground, well short of its target. Arriving at a distance is
 *  not the same as being STOPPED at it: a traveller walking through a body that does
 *  not resolve passes through `reach` on his way past, so the key stays held for
 *  `settleFrames` further RESOLVED frames, which without the body would carry him a
 *  quarter of a metre per frame beyond it and redden the caller's assert. And the
 *  frames counted are the scene's OWN resolves (`window.__placeResolves`), never the
 *  browser's animation callbacks: those keep ticking while a stalled scene moves
 *  nobody, and three of them against an unchanged position would prove nothing.
 *
 *  Every wait here is a wait for that counter to advance — the event this loop is
 *  actually after — never for the wall clock.
 *
 *  Returns what happened, because a window that simply elapsed is not a stop: the
 *  caller has to be able to fail on `settled === false` rather than measure a
 *  position that was never held against anything. */
async function pushUntilWithin(target, reach, { settleFrames = 3, maxMs = 60000 } = {}) {
  const t0 = Date.now()
  const hold = () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
  const read = () =>
    page.evaluate(
      ({ x, z }) => ({
        distance: Math.hypot(window.__placePlayer.x - x, window.__placePlayer.z - z),
        resolves: window.__placeResolves ?? 0,
      }),
      target,
    )
  /** Block until the scene has resolved the traveller's movement once more. */
  const resolvedAgain = async (after, timeout) => {
    if (timeout <= 0) return false
    try {
      await page.waitForFunction((n) => (window.__placeResolves ?? 0) > n, after, { timeout })
      return true
    } catch {
      return false
    }
  }
  await hold()
  let last = await read()
  let arrivedAt = null
  let settled = false
  while (Date.now() - t0 < maxMs) {
    await hold() // re-affirm the held key, exactly as pushUntilClear does
    if (!(await resolvedAgain(last.resolves, maxMs - (Date.now() - t0)))) break
    last = await read()
    if (last.distance > reach) {
      arrivedAt = null
      continue
    }
    if (arrivedAt === null) arrivedAt = last.resolves
    else if (last.resolves - arrivedAt >= settleFrames) {
      settled = true
      break
    }
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
  // The release is taken up on the next resolved frame — that frame, not a pause.
  await resolvedAgain(last.resolves, 10000)
  last = await read()
  return {
    settled,
    heldFrames: arrivedAt === null ? 0 : last.resolves - arrivedAt,
    distance: last.distance,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
  }
}

/** Hold forward at the river until the settlement hands the traveller back to
 *  the bird's-eye view — or a generous window elapses (work-order 584). Reports
 *  how far out he got, how far his footing sank on the way, and which mode the
 *  walk ended in. Same reason as pushUntilClear for polling rather than counting:
 *  a fixed frame count measures the host's drawing speed, and the software lane
 *  draws the steps to the water far slower than the hardware one. */
async function pushIntoTheRiver(bank, maxMs = 20000) {
  // Each step waits for DRAWN frames, never for wall-clock milliseconds: on the
  // software lane two 80 ms polls can fall inside a single frame, and a walk that
  // simply had not been drawn yet would read as a wall.
  const step = () =>
    page.evaluate(
      (b) =>
        new Promise((r) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
              const p = window.__placePlayer
              r({
                mode: window.__game.getState().mode,
                out: p ? p.x * b.nx + p.z * b.nz : null,
                footing: (window.__walkFeel && window.__walkFeel.footing) ?? 0,
              })
            }),
          ),
        ),
      bank,
    )
  const t0 = Date.now()
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
  let deepest = -Infinity
  let footing = 0
  let mode = 'place'
  let steps = 0
  while (Date.now() - t0 < maxMs && mode === 'place') {
    const s = await step()
    steps++
    mode = s.mode
    if (s.out != null) deepest = Math.max(deepest, s.out)
    footing = Math.min(footing, s.footing)
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
  return { deepest, footing, mode, steps }
}

/**
 * Place the player exactly on a collider center, aimed outward, and feed
 * input frames; the resolver must push it out to (near) the surface.
 */
async function ejectTest(sceneLabel, pick) {
  const info = await page.evaluate((pickSrc) => {
    const cs = window.__placeColliders
    // eslint-disable-next-line no-eval
    const idx = eval(pickSrc)(cs)
    const c = cs[idx]
    if (!c) return null
    // A fence panel has no centre field — its middle is the segment's midpoint
    // (point 413); every other shape carries its own.
    const cx = c.kind === 'segment' ? (c.x1 + c.x2) / 2 : c.x
    const cz = c.kind === 'segment' ? (c.z1 + c.z2) / 2 : c.z
    const p = window.__placePlayer
    p.x = cx
    p.z = cz
    p.yaw = 0
    return { cx, cz, cr: window.__colliderSize(c) }
  }, pick)
  if (!info) {
    check(`${sceneLabel}: eject target found`, false, `pick matched nothing: ${pick}`)
    return
  }
  await pushUntilClear()
  const cl = await clearance()
  const end = await page.evaluate(() => ({ x: window.__placePlayer.x, z: window.__placePlayer.z }))
  const outDist = Math.hypot(end.x - info.cx, end.z - info.cz)
  check(
    `${sceneLabel}: ejected from object (r=${info.cr.toFixed(1)}), no penetration`,
    cl >= -0.03,
    `clearance ${cl.toFixed(3)}, distance from center ${outDist.toFixed(2)}`,
  )
}

/**
 * Every functional building must be operable: there is a collision-free
 * standpoint within the door's trigger radius from which the Space use key
 * does what that door does (§7.1.16 / design.md §2 walk-in). For a trade or
 * service building that is its dialog; at the chief's hut it is the chief
 * himself, who steps OUT of it (design.md §12) and opens no window at all.
 */
async function reachableBuildings(sceneLabel) {
  const targets = await page.evaluate(() =>
    window.__placeLayout.interactives.map((it, i) => ({ i, type: it.type, door: it.door ?? null })),
  )
  const notOperable = []
  for (const t of targets) {
    if (!t.door) {
      notOperable.push(`${t.type}(no door)`)
      continue
    }
    // Find a collision-free standpoint within the door trigger radius (1.2) and
    // teleport the player there; the door prompt then arms and Space opens the
    // dialog (design.md §2.3 — walking in alone no longer enters).
    const placed = await page.evaluate((d) => {
      const cs = window.__placeColliders
      for (let r = 0; r <= 1.0; r += 0.2) {
        for (let a = 0; a < 10; a++) {
          const ang = (a / 10) * Math.PI * 2
          const x = d[0] + Math.cos(ang) * r
          const z = d[1] + Math.sin(ang) * r
          if (Math.hypot(x - d[0], z - d[1]) <= 1.15 && cs.every((c) => window.__clearanceTo(c, x, z) > 0.36)) {
            window.__placePlayer.x = x
            window.__placePlayer.z = z
            return true
          }
        }
      }
      return false
    }, t.door)
    let opened = false
    let reset = true
    if (placed) {
      if (t.type === 'chief') {
        // Send him back inside first, so the press below has to do the work even
        // when an earlier check in this scene has already called him out. The
        // scene hands that reset over (__chiefHome): the store flag is only the
        // coarse half, and clearing it alone leaves his WALK standing beside the
        // drummer, where the hut key answers with nothing at all.
        await page.evaluate(() => window.__chiefHome())
        // …and the reset itself is CHECKED, or a half-reset that leaves the flag
        // standing would let the press below pass without anybody coming out
        // (GPT-6 Astra, pass 3/9). Indoors means: the flag is down and the
        // figure is off the scene.
        const home = await page
          .waitForFunction(
            () => window.__game.getState().chiefOutside[window.__game.getState().placeId] !== true && !window.__chief,
            null,
            { timeout: 8000 },
          )
          .then(() => true)
          .catch(() => false)
        reset = home
      }
      if (reset) {
        // Arm the Space prompt at the door, then press it (design.md §2.3).
        await page.waitForFunction(() => !!document.querySelector('.prompt'), null, { timeout: 8000 }).catch(() => {})
        // Outside Bambara the head man answers from indoors, so clear the toast
        // and his orientation first: the press itself has to raise both.
        const noMessage = await page.evaluate(async () => {
          const g = window.__game.getState()
          window.__game.setState({ toast: null, orientationGiven: { ...g.orientationGiven, [g.placeId]: false } })
          const { getStrings } = await import('/src/i18n/index.ts')
          return getStrings().toasts.chiefNoMessage
        })
        await page.keyboard.press('Space')
        // Only Bambara's chief walks out to his drummer (design.md §13.4).
        const answered = t.type === 'chief'
          ? (msg) => {
              const g = window.__game.getState()
              if (g.placeId === 'bambara-village') return g.chiefOutside[g.placeId] === true
              return g.toast === msg && g.orientationGiven[g.placeId] === true && g.chiefOutside[g.placeId] !== true
            }
          : () => !!document.querySelector('.dialog')
        opened = await page.waitForFunction(answered, noMessage, { timeout: 8000 }).then(() => true).catch(() => false)
      }
    }
    const missed = t.type === 'chief' ? '(did not answer)' : '(no open)'
    if (!placed || !reset || !opened) {
      const why = !placed ? '(no clear standpoint)' : !reset ? '(the reset left him outside)' : missed
      notOperable.push(`${t.type}${why}`)
    }
    // Close and step away from the door for the next building.
    await page.keyboard.press('Escape')
    await page.evaluate(() => { const p = window.__placePlayer; p.x = 0; p.z = 0 })
    await page.waitForFunction(() => !document.querySelector('.dialog'), null, { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  check(
    `${sceneLabel}: every door answers its Space use key`,
    notOperable.length === 0,
    notOperable.length ? `not operable: ${notOperable.join(',')}` : `${targets.length} buildings ok`,
  )
}

/**
 * Every dwelling — including the non-functional, inhabitant-only ones — must
 * have a reachable entrance door (design.md §2, point 6): the door lies inside
 * the walkable area and a collision-free standpoint exists at it, so a resident
 * (or the player) can stand there to enter/leave.
 */
async function dwellingDoorsReachable(sceneLabel) {
  const res = await page.evaluate(() => {
    const cs = window.__placeColliders
    const radius = window.__placeLayout.radius
    const bad = []
    for (const d of window.__placeLayout.dwellings) {
      const [dx, dz] = d.door
      if (Math.hypot(dx, dz) > radius) { bad.push(`${d.kind}(outside)`); continue }
      // A clear standpoint within reach of the door (0.35..0.75) at any angle.
      let ok = false
      for (let r = 0.35; r <= 0.75 && !ok; r += 0.2) {
        for (let a = 0; a < 10 && !ok; a++) {
          const ang = (a / 10) * Math.PI * 2
          const x = dx + Math.cos(ang) * r
          const z = dz + Math.sin(ang) * r
          if (cs.every((c) => window.__clearanceTo(c, x, z) > 0.36)) ok = true
        }
      }
      if (!ok) bad.push(d.kind)
    }
    return { total: window.__placeLayout.dwellings.length, bad }
  })
  check(
    `${sceneLabel}: every dwelling door is reachable (incl. inhabitant-only)`,
    res.bad.length === 0,
    res.bad.length ? `blocked: ${res.bad.join(',')}` : `${res.total} dwellings ok`,
  )
}

async function accessPointsFree(sceneLabel) {
  const blocked = await page.evaluate(() => {
    const cs = window.__placeColliders
    const clear = (x, z) => cs.every((c) => window.__clearanceTo(c, x, z) > 0.35)
    // Spawn and the southern walk-out corridor scale with settlement size
    // (design.md par.4.1). Leaving is walking past the edge (no exit gate).
    const radius = window.__placeLayout.radius
    return [
      { n: 'spawn', x: 0, z: radius - 10 },
      { n: 'square', x: 0, z: 3 },
      { n: 'walk-out', x: 0, z: radius - 0.5 },
    ].filter((p) => !clear(p.x, p.z)).map((p) => p.n)
  })
  check(`${sceneLabel}: spawn/square/walk-out free`, blocked.length === 0,
    blocked.length ? `blocked: ${blocked.join(',')}` : 'free')
}

/**
 * SHARED STAGING (point 566). Enter a settlement and wait until its layout and
 * the closed journal are actually there — the setup the PoC-village sections own
 * rather than inherit from the section above them. It is a no-op when the place
 * is already the one asked for, so a whole run walks exactly the path it always
 * did: the first section to want the village enters it, the next finds it open.
 */
async function enterSettlement(id) {
  if ((await page.evaluate(() => window.__game.getState().placeId)) === id) return
  await page.evaluate((want) => window.__game.getState().enterPlace(want), id)
  await page
    .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, id, { timeout: 30000 })
    .catch(() => {})
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  // Wait on the CONDITION the pause stood for — the journal actually gone from the
  // DOM — and then on the app's own clock for the frame that redraws without it
  // (CLAUDE.md §7.2: never a wall-clock guess, which is too short on a loaded host
  // and wasted time on a quiet one).
  await page
    .waitForFunction(() => !window.__game.getState().journalOpen && !document.querySelector('.journal'), null, { timeout: 8000 })
    .catch(() => {})
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
}

// === Port (Cairo) ============================================================
// The boot prologue above already stands in Cairo, so this section needs no
// entry of its own.
if (section('port')) {
  // Eject from: biggest building (box collider), and a mid-size circle collider.
  await ejectTest('Port', '(cs)=>cs.reduce((b,c,i,a)=>window.__colliderSize(c)>window.__colliderSize(a[b])?i:b,0)')
  // Biggest circle prop. A fence panel has an `r` too but no centre to eject
  // from, so segments are skipped here (point 413).
  await ejectTest('Port', '(cs)=>cs.reduce((b,c,i,a)=>(c.kind!=="box"&&c.kind!=="segment"&&(b<0||c.r>a[b].r))?i:b,-1)')
  const funcTypes = await page.evaluate(() =>
    window.__placeLayout.interactives.filter((b) => b.type !== 'villager').map((b) => b.type),
  )
  // Since the trade-economy batch, ports carry six functional buildings
  // (design.md §9: incl. bazaar and travel agency).
  check("Port: all 6 functional buildings present", funcTypes.length === 6, funcTypes.join(","))
  await reachableBuildings('Port')
  await accessPointsFree('Port')
  await dwellingDoorsReachable('Port')

  // Ram screenshot: teleport in front of the biggest wall and nudge into it.
  const rammedWall = await page.evaluate(() => {
    const c = [...window.__placeColliders].sort((a, b) => window.__colliderSize(b) - window.__colliderSize(a))[0]
    const p = window.__placePlayer
    const len = Math.hypot(c.x, c.z) || 1
    p.x = c.x - (c.x / len) * (window.__colliderSize(c) + 2)
    p.z = c.z - (c.z / len) * (window.__colliderSize(c) + 2)
    p.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z))
    return { x: c.x, z: c.z }
  })
  await pushFrames(16)
  check('Port: no penetration at the wall', (await clearance()) >= -0.03, `clearance ${(await clearance()).toFixed(3)}`)
  // Point 375: the wall the player is pressed against must be the thing in the
  // picture — projected through the place camera, not assumed from the teleport.
  await shot('52-collision-port-wall', { local: { x: rammedWall.x, z: rammedWall.z }, label: 'the rammed wall' })

  // Corner clipping (§7.1.16): drop the player exactly onto each corner of the
  // biggest box building; the resolver must eject it with positive clearance —
  // the former circle approximation left gaps here.
  for (let corner = 0; corner < 4; corner++) {
    await page.evaluate((k) => {
      const boxes = window.__placeColliders.filter((c) => c.kind === 'box')
      const c = boxes.reduce((b, x) => (Math.max(x.hx, x.hz) > Math.max(b.hx, b.hz) ? x : b), boxes[0])
      const sx = k % 2 ? 1 : -1
      const sz = k < 2 ? 1 : -1
      const sin = Math.sin(c.rot)
      const cos = Math.cos(c.rot)
      const lx = sx * c.hx
      const lz = sz * c.hz
      const p = window.__placePlayer
      p.x = c.x + cos * lx + sin * lz
      p.z = c.z - sin * lx + cos * lz
      p.yaw = 0
    }, corner)
    await pushUntilClear()
    const cl = await clearance()
    check(`Port: ejected from building corner ${corner + 1}/4`, cl >= -0.03, `clearance ${cl.toFixed(3)}`)
  }
}

// === Village (Masai) =========================================================
if (section('village')) {
  await page.evaluate(() => window.__game.getState().enterPlace('maasai-village'))
  await page
    .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, "maasai-village", { timeout: 30000 })
    .catch(() => {})
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForTimeout(400)

  await ejectTest('Village', '(cs)=>cs.reduce((b,c,i,a)=>window.__colliderSize(c)>window.__colliderSize(a[b])?i:b,0)') // chief hut
  await ejectTest('Village', '(cs)=>cs.reduce((b,c,i,a)=>(c.kind!=="box"&&c.kind!=="segment"&&c.r>=1.5&&c.r<=2.2&&(b<0||c.r<a[b].r))?i:b,-1)') // dwelling hut
  // The fence is now a run of panels, not a chain of posts (point 413): eject
  // from the MIDDLE of a panel, where the old post-circle chain had its thinnest,
  // most sideways-pushing spot.
  await ejectTest('Village', '(cs)=>cs.reduce((b,c,i)=>(c.kind==="segment"&&b<0)?i:b,-1)') // fence panel

  // Chief hut operable despite collision: standing at its door and pressing the
  // Space use key meets the head man and gives orientation (design.md §17.3).
  // Outside Bambara he answers from his hut, without walking to the drummer.
  await page.evaluate(() => {
    const it = window.__placeLayout.interactives.find((i) => i.type === 'chief')
    const p = window.__placePlayer
    p.x = it.door[0]
    p.z = it.door[1]
    p.yaw = 0
  })
  // Wait for the door prompt that NAMES the chief's hut (default language English,
  // src/i18n/en.ts) before pressing Space — waiting on "any prompt" could fire on
  // a neighbouring candidate; the swallowed .catch is dropped so a real arming
  // failure surfaces instead of a silent no-op (point 244).
  await page.waitForFunction(
    (label) => (document.querySelector('.prompt')?.textContent ?? '').includes(label),
    "Chief's Hut",
    { timeout: 8000 },
  )
  await page.keyboard.press('Space')
  const chiefMet = await page
    .waitForFunction(() => {
      const g = window.__game.getState()
      return g.orientationGiven[g.placeId] === true
    }, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  check('Village: meeting the chief with Space at his door gives orientation', chiefMet)
  check('Village: the Maasai chief stays indoors', await page.evaluate(() => {
    const g = window.__game.getState()
    return !g.chiefOutside[g.placeId] && !window.__chief
  }))
  await page.waitForTimeout(200)
  await dwellingDoorsReachable('Village')
  // Step BACK from the door and face the hut, or the frame holds nothing but
  // wall: at the door the camera stands inside the building's own footprint.
  // From ~9 m out on the door's own bearing, hut and door are in the picture.
  await page.evaluate(() => {
    const it = window.__placeLayout.interactives.find((i) => i.type === 'chief')
    const p = window.__placePlayer
    const [hx, hz] = it.pos
    const [dx, dz] = it.door
    const ux = dx - hx
    const uz = dz - hz
    const l = Math.hypot(ux, uz) || 1
    p.x = dx + (ux / l) * 9
    p.z = dz + (uz / l) * 9
    // Place-camera yaw 0 looks toward -Z, so aim with the +PI complement.
    p.yaw = Math.atan2(hx - p.x, hz - p.z) + Math.PI
  })
  await shot('53-collision-village-chief-hut', { place: 'maasai-village', label: "the chief's hut and its reachable door" })
  await page.evaluate(() => { const p = window.__placePlayer; p.x = 0; p.z = 0 })
  await page.waitForTimeout(150)

  await reachableBuildings('Village')
  await accessPointsFree('Village')

  // Inhabitants enter their dwellings (§7.1.16 / design.md §2): observe the
  // walkers until one that has been out walking disappears inside — at that
  // moment it must stand at its home center (it slipped in through the door).
  const walkerResult = await page.evaluate(async () => {
    // A TIMEOUT on a polled condition, not a fixed wait: it costs nothing when the
    // transition happens promptly, and the errand it waits for is paced by the
    // frame clock — a host rendering in software takes several times as long to
    // walk a villager home as the hardware this bound was written on.
    const deadline = Date.now() + 420000
    const wasOut = new Set()
    return await new Promise((resolve) => {
      const iv = setInterval(() => {
        const w = window.__placeWalkers
        if (!w) return
        for (let i = 0; i < w.states.length; i++) {
          const s = w.states[i]
          if (s.mode === 'walk') wasOut.add(i)
          else if (wasOut.has(i)) {
            const h = w.homes[i]
            clearInterval(iv)
            resolve({ ok: true, dist: Math.hypot(s.x - h.x, s.z - h.z) })
            return
          }
        }
        if (Date.now() > deadline) {
          clearInterval(iv)
          resolve({ ok: false, dist: -1 })
        }
      }, 150)
    })
  })
  check(
    'Village: inhabitant walked out and re-entered its dwelling through the door',
    walkerResult.ok && walkerResult.dist < 0.8,
    walkerResult.ok ? `entered at ${walkerResult.dist.toFixed(2)} from home center` : 'no walk→inside transition observed',
  )

  // No inhabitant stays pinned (point 155): observe every walker over a window
  // longer than the unstuck deadline. A walker in 'walk' mode (not lingering)
  // that stops moving is teleport-nudged free before its pinned timer passes the
  // calibratable window — so no walker's pinned time ever exceeds it, and the
  // walkers do actually move (the check is not vacuous).
  const pinResult = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const win = window.__balance.walkerUnstuckSeconds
    const w = window.__placeWalkers
    if (!w) return { ok: false, reason: 'no __placeWalkers' }
    let maxPinned = 0
    let anyMoved = false
    // Movement is measured against the START position, not against the previous
    // sample. A per-sample delta asks "did a walker cover 0.2 m in the last 150 ms",
    // which is a question about the SAMPLING RATE and the frame rate rather than
    // about the walkers: on a software-rendered host at ~12 fps every walker moves,
    // and the check still read "nothing moved". Cumulative displacement asks what
    // the check means to ask — did anyone get anywhere.
    const start = w.states.map((s) => ({ x: s.x, z: s.z }))
    const t0 = Date.now()
    // Watch for the window + a generous margin so a would-be pin has time to pass it.
    while (Date.now() - t0 < (win + 5) * 1000) {
      for (let i = 0; i < w.states.length; i++) {
        const s = w.states[i]
        if (s.pinned > maxPinned) maxPinned = s.pinned
        if (Math.hypot(s.x - start[i].x, s.z - start[i].z) > 0.2) anyMoved = true
      }
      await sleep(150)
    }
    return { ok: true, maxPinned, anyMoved, win, n: w.states.length }
  })
  check(
    'Village: no inhabitant stays pinned past the unstuck window (point 155)',
    pinResult.ok && pinResult.anyMoved && pinResult.maxPinned <= pinResult.win + 0.6,
    JSON.stringify(pinResult),
  )
}

// === The PoC village's play rocks (work-order 687/688) =======================
// The word for a rock is learnt at the TWO large rocks on the bank now — the village's
// lone teaching stone went with the errands that pointed at it (work-order 688).
// They have to BE there: solids the player walks up to and not through, resting
// where the layout says. The backend-sensitive pictures are also where the
// detailed surfaces and broad level bases can actually be judged; neither may
// read as an egg balanced on a vertex.
// Hold the chief at the beginning of his real walk so contact can be measured
// and photographed at his hut. The authored unit tests cover the moving body.
if (section('chief-body')) {
  await page.evaluate(() => window.__game.getState().enterPlace('bambara-village'))
  await page.waitForFunction(() => window.__game.getState().placeId === 'bambara-village' && window.__placeLayout,
    null, { timeout: 30000 })
  const speed = await page.evaluate(() => {
    const speed = window.__balance.communication.chiefWalkSpeed
    window.__balance.communication.chiefWalkSpeed = 0
    window.__game.getState().bumpBalance()
    window.__chiefHome()
    window.__game.getState().callChiefOut()
    window.__game.getState().setJournalOpen(false)
    return speed
  })
  try {
    await page.waitForFunction(() => window.__chief?.phase === 'walking-out' && window.__chief.progress === 0,
      null, { timeout: 8000 })
    // WHERE the traveller starts matters, and the outward normal is not free
    // ground everywhere: at bambara-village a scattered 0.77 m prop sits 0.51 m
    // behind his stand, so a player planted there is inside it, is pushed out
    // instead of forward and never reaches the chief at all (measured
    // 15.09.2026, the first red of this block). So SEARCH for the stand-off:
    // the outward normal first, then the nearest bearings to it, and take the
    // first whose stand-off AND whose straight line to the chief are clear of
    // every static collider. The chief is not among them — his body is
    // published live — so the search cannot reject a spot because of him.
    const contact = await page.evaluate(() => {
      const chief = window.__chief
      const hut = window.__placeLayout.interactives.find((it) => it.type === 'chief')
      const base = Math.atan2(chief.x - hut.pos[0], chief.z - hut.pos[1])
      const STAND_OFF = 2
      const free = (x, z) => window.__placeColliders.every((c) => window.__clearanceTo(c, x, z) - 0.35 > 0.02)
      // He walks from the stand-off up to his body, i.e. over the first
      // (STAND_OFF - r - 0.35) / STAND_OFF of the line — sample exactly that,
      // never the last stretch he is meant to be stopped in.
      const walked = (STAND_OFF - chief.r - 0.35) / STAND_OFF
      // Sampled to the CONTACT itself: stepping by a flat 0.1 left the last
      // three centimetres before his body unread, which is exactly where a prop
      // would stop the traveller early and redden the block on its own geometry.
      const laneSteps = Math.max(1, Math.ceil(walked / 0.1))
      const laneClear = (x, z) => {
        for (let i = 1; i <= laneSteps; i++) {
          const t = (walked * i) / laneSteps
          if (!free(x + (chief.x - x) * t, z + (chief.z - z) * t)) return false
        }
        return true
      }
      let picked = null
      for (let step = 0; step <= 18 && !picked; step++) {
        for (const sign of step === 0 ? [1] : [1, -1]) {
          const a = base + (sign * step * Math.PI) / 18
          const x = chief.x + Math.sin(a) * STAND_OFF
          const z = chief.z + Math.cos(a) * STAND_OFF
          if (free(x, z) && laneClear(x, z)) {
            picked = { x, z, nx: Math.sin(a), nz: Math.cos(a), bearingSteps: sign * step }
            break
          }
        }
      }
      if (!picked) return { x: chief.x, z: chief.z, r: chief.r, nx: 0, nz: 0, standFound: false }
      const p = window.__placePlayer
      p.x = picked.x
      p.z = picked.z
      p.yaw = Math.atan2(chief.x - p.x, chief.z - p.z) + Math.PI
      return { x: chief.x, z: chief.z, r: chief.r, nx: picked.nx, nz: picked.nz, standFound: true, bearingSteps: picked.bearingSteps }
    })
    check('Chief: a free stand-off two metres off his body exists', contact.standFound === true, JSON.stringify(contact))
    if (!contact.standFound) throw new Error('No free ground two metres off the chief to walk at him from')
    // Walk at him until he is REACHED, never for a fixed number of input frames:
    // the resolve that carries the traveller runs once per RENDER frame, and this
    // scene's headless cadence starves a counted push long before his body.
    const walkIn = await pushUntilWithin(contact, contact.r + 0.35 + 0.05)
    // The window must have been SPENT walking into him, not merely elapsed.
    check(
      'Chief: the traveller keeps walking into him over further resolved frames',
      walkIn.settled,
      JSON.stringify(walkIn),
    )
    if (!walkIn.settled) throw new Error('The traveller never came to rest against the chief')
    const stopped = await page.evaluate(({ x, z, nx, nz }) => {
      const p = window.__placePlayer
      return { distance: Math.hypot(p.x - x, p.z - z), side: (p.x - x) * nx + (p.z - z) * nz }
    }, contact)
    const touching = stopped.distance >= contact.r + 0.35 - 0.01 &&
      stopped.distance <= contact.r + 0.35 + 0.05 && stopped.side > 0
    check('Chief: walking forward stops at his body in front of the hut', touching, JSON.stringify(stopped))
    if (!touching) throw new Error('The declared blocked-player frame requires contact with the chief')
    await shot('53-collision-chief-body', {
      local: { x: contact.x, y: 1.4, z: contact.z },
      label: 'the player blocked at the chief’s body in front of his hut',
    })
  } finally {
    await page.evaluate((speed) => {
      window.__balance.communication.chiefWalkSpeed = speed
      window.__game.getState().bumpBalance()
      window.__chiefHome()
    }, speed)
  }
}

if (section('drawn-colliders')) {
  await enterSettlement('bambara-village')
  // === Nothing blocks where nothing is drawn (work-order 583) ===================
  // The F6 report "Ich kann hier nicht durchlaufen" was a fence: the scene
  // instanced its panels into a buffer with a FIXED capacity, the Bambara
  // compound's five woven rings asked for more than it held, and the overflow was
  // drawn NOWHERE while every one of its colliders stood — a wall seven panels
  // long across open sand. The mechanism is general, so the check is: no drawn run
  // in a settlement may be longer than the buffer that draws it. Only the live
  // scene knows the buffers, which is why this one check cannot live in Vitest.
  const instances = await page.evaluate(() => {
    const out = []
    window.__placeScene.traverse((o) => {
      if (!o.isInstancedMesh) return
      out.push({
        name: o.name || o.geometry?.type || 'instances',
        wants: o.count,
        capacity: o.instanceMatrix.count,
      })
    })
    return out
  })
  const truncated = instances.filter((m) => m.wants > m.capacity)
  check(
    'PoC village: every instanced run fits the buffer that draws it — no collider without a picture',
    instances.length > 0 && truncated.length === 0,
    truncated.length
      ? truncated.map((m) => `${m.name}: ${m.wants} wanted, ${m.capacity} drawn`).join('; ')
      : `${instances.length} instanced runs, all within their buffers`,
  )

  // === THE WATER TRACK AGAINST THE COMPOUND IT MEETS (work-order 1045) =========
  // The lane used to be ABANDONED wherever a compound ring stood across it, and a
  // third of the Bambara seeds then taught no RIVER at all. The ring is opened at
  // the crossing now, so the track runs THROUGH the compound the way a worn
  // footpath does. The unit layer proves the collider gap; only the drawn scene
  // can show that the gap is an OPENING and not a hole with a wall still in it.
  //
  // WHAT IT PHOTOGRAPHS DEPENDS ON THE SEED, AND IT SAYS WHICH (point 1136). The
  // lane is pinned to 42, where no compound stands across the Bambara water path
  // at all — so this shoots the track's nearest meeting with a compound ring and
  // NAMES it: an opening the track runs through, or a wall it runs clear past.
  // A gated seed (`VERIFY_SEED=7`) puts the gate itself in front of the lens.
  const meeting = await page.evaluate(() => {
    const l = window.__placeLayout
    if (!l?.waterPath) return { reason: 'this village draws no water path' }
    const { head, foot } = l.waterPath
    const len = Math.hypot(foot.x - head.x, foot.z - head.z)
    const ux = (foot.x - head.x) / len
    const uz = (foot.z - head.z) / len
    const along = (x, z) => Math.max(0, Math.min(len, (x - head.x) * ux + (z - head.z) * uz))
    // A panel is DRAWN as a segment collider between its two posts; a post pair
    // with no such collider is the gap. Read from the drawn set rather than from
    // the builder's intent, because the drawn set is what the player walks into.
    const bridged = (a, b) => l.colliders.some((c) => c.kind === 'segment'
      && ((Math.hypot(c.x1 - a[0], c.z1 - a[1]) < 0.01 && Math.hypot(c.x2 - b[0], c.z2 - b[1]) < 0.01)
        || (Math.hypot(c.x1 - b[0], c.z1 - b[1]) < 0.01 && Math.hypot(c.x2 - a[0], c.z2 - a[1]) < 0.01)))
    let gate = null
    let nearest = null
    for (const f of l.fences) {
      for (let i = 0; i < f.posts.length; i++) {
        const a = f.posts[i]
        const b = f.posts[(i + 1) % f.posts.length]
        const open = !bridged(a, b)
        for (let k = 0; k <= 60; k++) {
          const x = a[0] + (b[0] - a[0]) * k / 60
          const z = a[1] + (b[1] - a[1]) * k / 60
          const t = along(x, z)
          const d = Math.hypot(x - (head.x + ux * t), z - (head.z + uz * t))
          if (!nearest || d < nearest.d) nearest = { t, d, open }
          // 0.8 m is half the drawn lane: inside that the track and the opening
          // overlap, which is the crossing the point is about.
          if (open && d < 0.8 && (!gate || t < gate.t)) gate = { t, d }
        }
      }
    }
    const met = gate ?? nearest
    if (!met) return { reason: 'this settlement draws no compound ring' }
    const subject = { x: head.x + ux * met.t, z: head.z + uz * met.t }
    // Stand back UP the lane, as far as the ground stays free, so the opening and
    // the track leading into it are both in the picture. The walk back may pass
    // the head — the lane only BEGINS there, the plaza behind it is walkable too,
    // and the collider probe is what says where that stops being true.
    let back = 0
    for (let d = 0.25; d <= 8; d += 0.25) {
      const x = subject.x - ux * d
      const z = subject.z - uz * d
      if (!window.__placeColliders.every((c) => window.__clearanceTo(c, x, z) > 0.45)) break
      back = d
    }
    return {
      through: !!gate,
      t: met.t,
      gap: met.d,
      back,
      subject,
      camera: { x: subject.x - ux * back, z: subject.z - uz * back },
    }
  })
  check(
    'PoC village: the water track meets a compound ring, with free ground up the lane to photograph it from',
    meeting?.back >= 1.5,
    meeting?.reason
      ?? `${meeting.through ? 'through an opening' : 'clear past a wall'}, ${meeting.t.toFixed(1)} m down the lane, `
        + `${meeting.gap.toFixed(2)} m off the lane's middle, camera ${meeting.back.toFixed(2)} m back`,
  )
  if (meeting?.back >= 1.5) {
    await page.evaluate((m) => {
      const p = window.__placePlayer
      p.x = m.camera.x
      p.z = m.camera.z
      // design.md §17.5: pitch 0 is the horizon and + looks up, so a little DOWN
      // — the track lies on the ground and has to be in the frame with the ring.
      p.yaw = Math.atan2(-(m.subject.x - p.x), -(m.subject.z - p.z))
      p.pitch = -0.2
      window.__game.getState().setToast(null)
    }, meeting)
    await shot('1045-water-track-at-the-compound', {
      local: { x: meeting.subject.x, y: 0.5, z: meeting.subject.z },
      label: meeting.through
        ? 'the water track running through the opening in the compound ring, seen from up the lane'
        : 'the water track running clear past the compound ring, seen from up the lane',
    })
  }
}

if (section('play-rocks')) {
  await enterSettlement('bambara-village')
  const rocks = await page.evaluate(() => window.__placeLayout.playRocks ?? null)
  check('PoC village: the two play rocks are in the layout', !!rocks, JSON.stringify(rocks))
  if (rocks) {
    for (const [name, p] of [
      ['Play rock upstream', rocks.upstream],
      ['Play rock downstream', rocks.downstream],
    ]) {
      await ejectTest(
        name,
        `(cs)=>cs.findIndex((c)=>!c.kind&&Math.hypot(c.x-(${p.x}),c.z-(${p.z}))<0.01)`,
      )
    }
    // STAND OFF THE STRETCH'S AXIS, not on it. The camera used to be put on the
    // line between the two rocks and aimed at the near one, which puts the far
    // one exactly behind it — and the shutter gated the near rock alone, so the
    // claimed two-rock photograph would have passed with the second stone
    // occluded or missing outright (GPT-5.6 Sol, first cross-vendor round, D3).
    // The stand comes from the scene itself (`bankPlayRocksView`), so the suite
    // and `bankStage.test.ts` judge one description of it and not two.
    const view = await page.evaluate(() => window.__bankStageView?.() ?? null)
    // AND THE STAND IS REALLY OFF THE AXIS. A stand ON it would satisfy every
    // other claim here — both rocks project inside the frame, because they are
    // on one line through its middle — while showing a single stone with another
    // hidden behind it (GPT-5.6 Sol, confirming round). The angle the pair
    // subtends from the camera is what says otherwise, measured from the rocks
    // and the stand rather than assumed.
    const spread = view
      ? (() => {
          const a = Math.atan2(rocks.upstream.z - view.z, rocks.upstream.x - view.x)
          const b = Math.atan2(rocks.downstream.z - view.z, rocks.downstream.x - view.x)
          let d = Math.abs(a - b)
          if (d > Math.PI) d = 2 * Math.PI - d
          return (d * 180) / Math.PI
        })()
      : 0
    check(
      'the two rocks are photographed from a stand that separates them',
      !!view && spread > 20,
      view ? `they subtend ${spread.toFixed(1)}° from the stand at ${view.x.toFixed(1)},${view.z.toFixed(1)}` : 'no stand',
    )
    if (view) {
      await page.evaluate((v) => {
        const p = window.__placePlayer
        p.x = v.x
        p.z = v.z
        p.yaw = v.yaw
        p.pitch = -0.05
      }, view)
      // Let the scene consume the teleport on ITS clock before the shutter
      // judges: two animation frames, not a wall-clock guess (CLAUDE.md §7.2).
      // On a loaded host a frame can take a second, and the camera would still
      // be easing toward the stage when the picture is taken.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
      // ONE STAND, TWO DECLARATIONS. A frame carries a single subject by
      // contract, so each rock is claimed by its own frame from the same camera:
      // the pair is proven in the rendered picture rather than asserted in a
      // caption.
      await shot('54-collision-play-rocks', {
        local: { x: rocks.upstream.x, z: rocks.upstream.z },
        label: 'the detailed upstream play rock resting on its broad base, from the stand that shows the whole stage',
      })
      await shot('54b-collision-play-rocks-far', {
        local: { x: rocks.downstream.x, z: rocks.downstream.z },
        label: 'the detailed downstream play rock resting on its broad base, from the same stand',
      })
    }
  }
}

// === The village's river bank (work-order 482/584) ============================
// The water is NOT a wall, and that is a collision claim: walking into the river
// has to carry the traveller down the drawn shore and into the shallows, and
// then — out of his depth, where the river is swum — hand him back to the
// bird's-eye view. The shape, the wade limit and the empty collider set at the
// water are pinned in the unit layer; what only the live scene can show is that
// holding forward at the water is never REFUSED.
if (section('river-bank')) {
  await enterSettlement('bambara-village')
  const bank = await page.evaluate(() => window.__placeLayout?.bank ?? null)
  check('PoC village: the layout carries a walkable river bank', !!bank, JSON.stringify(bank && { riverId: bank.riverId, distance: bank.distance }))
  if (bank) {
    await page.evaluate((b) => {
      const p = window.__placePlayer
      // A few steps short of the water, facing straight at it.
      p.x = b.nx * (b.walkEdge - 4)
      p.z = b.nz * (b.walkEdge - 4)
      p.yaw = Math.atan2(-b.nx, -b.nz)
      p.pitch = 0
    }, bank)
    // Hold forward until the walk into the river ENDS the visit, not for a fixed
    // number of frames: the steps to the water take ~0.8 s of drawn time, which
    // the WebGPU lane manages and the software WebGL lane does not — the same
    // fixed window that reddens the checks of point 506. Polling on the walk's own
    // progress asks what the check means (is he ever held at the water?) instead
    // of how fast the host draws. The camera's footing is read at every step: it
    // is what proves he walked DOWN the drawn shore rather than out over it.
    const wade = await pushIntoTheRiver(bank)
    check(
      'PoC village: walking into the river is never REFUSED — no wall at the water',
      wade.deepest > bank.distance,
      `reached ${wade.deepest.toFixed(2)} m out, past a waterline at ${bank.distance.toFixed(2)}`,
    )
    check(
      'PoC village: he WADES — the camera sinks with the drawn shore',
      wade.footing <= -0.2,
      `footing dropped to ${wade.footing.toFixed(2)} m`,
    )
    check(
      'PoC village: and out of his depth the settlement hands him back to the map',
      wade.mode === 'travel',
      `ended in ${wade.mode} mode after ${wade.steps} drawn steps`,
    )
  }
}

// === No wedge is fatal (work-order 604) ======================================
// The collision rules keep the traveller out of the walls; this keeps him out of
// the gaps BETWEEN them. The pure halves (the stall detector, the outward search)
// are pinned in the unit layer — what only the live scene can show is that the
// key works where the player actually stands: pressed into the narrowest slot
// this village has, with the game's own resolver deciding every step.
if (section('unstuck')) {
  await enterSettlement('bambara-village')
  // The tightest slot the layout really has: the two colliders of DIFFERENT
  // bodies that approach closest, and the midpoint of that approach.
  const wedge = await page.evaluate(() => {
    const cs = window.__placeColliders
    const sample = (c) =>
      c.kind === 'segment'
        ? Array.from({ length: 9 }, (_, i) => [c.x1 + ((c.x2 - c.x1) * i) / 8, c.z1 + ((c.z2 - c.z1) * i) / 8])
        : [[c.x, c.z]]
    let best = null
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        for (const [ax, az] of sample(cs[i]))
          for (const [bx, bz] of sample(cs[j])) {
            const d = Math.hypot(ax - bx, az - bz)
            const gap = d - window.__colliderSize(cs[i]) - window.__colliderSize(cs[j])
            if (gap < 0) continue // colliders that merge into one body are no slot
            if (!best || gap < best.gap) best = { gap, x: (ax + bx) / 2, z: (az + bz) / 2 }
          }
      }
    return best
  })
  check(
    'PoC village: a narrowest slot was found to test in',
    !!wedge,
    wedge ? `gap ${wedge.gap.toFixed(2)} m at ${wedge.x.toFixed(1)},${wedge.z.toFixed(1)}` : 'none',
  )
  if (wedge) {
    // FIRST the hint. Walked against the biggest wall the village has, the
    // traveller holds his key and gets nowhere — which is what being wedged
    // looks like from the inside — and the game must tell him the key exists.
    // The key is pressed ONCE and left down (no keyup until the wait returns),
    // so the wait is on the hint's own appearance, never on the wall clock.
    await page.evaluate(() => {
      const c = [...window.__placeColliders].sort((a, b) => window.__colliderSize(b) - window.__colliderSize(a))[0]
      const p = window.__placePlayer
      const len = Math.hypot(c.x, c.z) || 1
      p.x = c.x - (c.x / len) * (window.__colliderSize(c) + 1.2)
      p.z = c.z - (c.z / len) * (window.__colliderSize(c) + 1.2)
      p.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z))
      p.pitch = 0
      window.__game.getState().setToast(null)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    })
    const hinted = await page
      .waitForFunction(() => document.querySelector('.toast')?.textContent || null, null, { timeout: 30000 })
      .then((h) => h.jsonValue())
      .catch(() => '')
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
    check(
      'PoC village: pushing into a wall and getting nowhere raises the hint that names the key',
      String(hinted).includes('U'),
      String(hinted) || '(no toast)',
    )
    const before = await page.evaluate((w) => {
      const p = window.__placePlayer
      p.x = w.x
      p.z = w.z
      p.yaw = 0
      p.pitch = 0
      const g = window.__game.getState()
      return { day: g.day, foodDays: g.foodDays, health: g.health, journal: g.journal.length }
    }, wedge)
    // The escape itself. Wait on the CONDITION the press stands for — the toast
    // the handler raises in place of the hint — not on the wall clock.
    await page.keyboard.press('KeyU')
    await page.waitForFunction(
      (previous) => (document.querySelector('.toast')?.textContent ?? '') !== previous,
      hinted,
      { timeout: 8000 },
    )
    const freed = await page.evaluate(() => {
      const p = window.__placePlayer
      const g = window.__game.getState()
      let worst = Infinity
      for (const c of window.__placeColliders) worst = Math.min(worst, window.__clearanceTo(c, p.x, p.z) - 0.35)
      return {
        x: p.x,
        z: p.z,
        clearance: worst,
        fromCentre: Math.hypot(p.x, p.z),
        radius: window.__placeLayout.radius,
        day: g.day,
        foodDays: g.foodDays,
        health: g.health,
        journal: g.journal.length,
        mode: g.mode,
      }
    })
    check('PoC village: U sets him down on collision-free ground', freed.clearance >= 0, `clearance ${freed.clearance.toFixed(3)} m`)
    check(
      'PoC village: and inside the settlement he was standing in',
      freed.mode === 'place' && freed.fromCentre <= freed.radius,
      `${freed.fromCentre.toFixed(1)} m from the centre of a ${freed.radius} m place`,
    )
    check(
      'PoC village: the rescue costs nothing — no day, no provisions, no health, no entry',
      freed.day === before.day &&
        freed.foodDays === before.foodDays &&
        freed.health === before.health &&
        freed.journal === before.journal,
      `day ${before.day}->${freed.day}, food ${before.foodDays}->${freed.foodDays}, health ${before.health}->${freed.health}`,
    )
    // And he can WALK from where he was put down — the whole point of freeing him.
    // Held once and waited on by DISTANCE, not by a count of frames: how far a
    // fixed number of frames carries him is the host's drawing speed, and this
    // check is about the ground, not the clock.
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })))
    const walked = await page
      .waitForFunction(
        (from) => {
          const d = Math.hypot(window.__placePlayer.x - from.x, window.__placePlayer.z - from.z)
          return d > 0.5 ? d : null
        },
        { x: freed.x, z: freed.z },
        { timeout: 30000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => 0)
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })))
    check('PoC village: and he walks away from the spot he was set down on', walked > 0.5, `walked ${Number(walked).toFixed(2)} m`)
    // Point 375: the frame must show the settlement he was freed into, projected
    // through the place camera rather than assumed from the teleport. Turn him to
    // face the village first — a picture of the empty plain behind him would pass
    // the subject gate and show a reader nothing.
    await page.evaluate(() => {
      const p = window.__placePlayer
      p.yaw = Math.atan2(-(0 - p.x), -(0 - p.z))
      p.pitch = 0
    })
    await shot('604-unstuck-freed', { place: 'bambara-village', label: 'the freed position' })

    // AND THE PAD REACHES IT TOO (work-order 610). The escape was keyboard-only:
    // no button carried it, so a pad-only player who was wedged still lost the
    // expedition — the very loss it exists to prevent. The MAP is pinned in the
    // unit layer; what only the live scene can show is that the rAF button poll
    // turns the press into the key the handler listens for, and that the handler
    // then frees him for real. The button is pulsed with clean edges until the
    // key lands, never on a fixed wall-clock tap (point 184).
    await page.evaluate((w) => {
      window.__padKeys = []
      window.addEventListener('keydown', (e) => window.__padKeys.push(e.code))
      const p = window.__placePlayer
      p.x = w.x
      p.z = w.z
      p.yaw = 0
      p.pitch = 0
      window.__game.getState().setToast(null)
    }, wedge)
    const L3 = 10 // left stick press: the button design.md §17.5's map leaves free
    // Pressed ONCE and held: the poll fires on the rising edge, so the wait is on
    // the key's own arrival, never on the wall clock (the button is released
    // afterwards, and the handler has already run by then — it is synchronous
    // with the keydown the poll dispatches).
    await page.evaluate((i) => (window.__pad.buttons[i] = { pressed: true, touched: true, value: 1 }), L3)
    const padKeyed = await page
      .waitForFunction(() => (window.__padKeys ?? []).includes('KeyU'), null, { timeout: 30000 })
      .then(() => true)
      .catch(() => false)
    await page.evaluate((i) => (window.__pad.buttons[i] = { pressed: false, touched: false, value: 0 }), L3)
    check(
      'PoC village: a gamepad button reaches the escape at all (L3 → the U handler)',
      padKeyed,
      padKeyed ? 'the poll dispatched KeyU' : 'no KeyU reached the keyboard pipeline',
    )
    const padFreed = await page.evaluate((w) => {
      const p = window.__placePlayer
      let worst = Infinity
      for (const c of window.__placeColliders) worst = Math.min(worst, window.__clearanceTo(c, p.x, p.z) - 0.35)
      return { clearance: worst, moved: Math.hypot(p.x - w.x, p.z - w.z), toast: document.querySelector('.toast')?.textContent ?? '' }
    }, wedge)
    check(
      'PoC village: and the pad press frees him for real, not just as a message',
      padKeyed && padFreed.clearance >= 0 && padFreed.moved > 0,
      `clearance ${padFreed.clearance.toFixed(3)} m, moved ${padFreed.moved.toFixed(2)} m, toast "${padFreed.toast}"`,
    )
  }
}

// === No inhabitant at an unplaced transform (work-order 509) =================
// The other failure of the layer point 155 closed: not a figure that walked
// itself into a corner but one that was never placed at all. A vignette writing
// its figures' transforms only from its frame callback leaves them at React's
// identity transform — the settlement origin — for as long as they do not move,
// and the walkers spend most of their day at home. Invisible to the eye, solid
// to a ray probe, and an EXACT zero, which is the signature of a placement that
// never happened.
//
// Swept over EVERY settlement, from the world model's own list, because the
// defect belongs to the shared life layer rather than to one village.
if (section('inhabitant-placement')) {
  const ids = await page.evaluate(() => window.__settlementIds ?? [])
  check(
    'the sweep reads every settlement from the world model',
    ids.length >= 30,
    `${ids.length} settlements`,
  )
  const offenders = []
  let figuresSeen = 0
  const emptyOf = []
  for (const id of ids) {
    await enterSettlement(id)
    const res = await page.evaluate((placeId) => {
      const scene = window.__placeScene
      const layout = window.__placeLayout
      if (!scene || !layout) return { placeId, error: 'scene or layout missing' }
      // The tolerance is float NOISE, not a zone: a transform nothing wrote is
      // exactly (0,0,0), while a villager may legitimately walk over the middle
      // of its own village and must not be reported for it (src/scenes/place/
      // placement.ts, UNPLACED_EPS).
      const EPS = 0.01
      // The settlement's own placement set: a settlement that genuinely puts
      // someone at its origin is not an offender.
      const anchors = [...layout.dwellings.map((d) => [d.x, d.z]), ...layout.errands]
      const originIsASpot = anchors.some(([x, z]) => Math.abs(x) <= EPS && Math.abs(z) <= EPS)
      let seen = 0
      let atOrigin = 0
      scene.traverse((o) => {
        if (o.name !== 'inhabitant') return
        seen++
        // The figure group always sits at its parent's origin — the PARENT is
        // the placement, so the world matrix is what has to be read.
        o.updateWorldMatrix(true, false)
        const e = o.matrixWorld.elements
        if (Math.abs(e[12]) <= EPS && Math.abs(e[13]) <= EPS && Math.abs(e[14]) <= EPS) atOrigin++
      })
      return { placeId, seen, atOrigin, originIsASpot }
    }, id)
    if (res.error) {
      offenders.push(`${id}(${res.error})`)
      continue
    }
    figuresSeen += res.seen
    if (res.seen === 0) emptyOf.push(id)
    if (res.atOrigin > 0 && !res.originIsASpot) offenders.push(`${id}:${res.atOrigin}`)
  }
  check(
    'no inhabitant of any settlement stands at the settlement origin (point 509)',
    offenders.length === 0,
    offenders.length ? `at the origin: ${offenders.join(',')}` : `${figuresSeen} figures over ${ids.length} settlements`,
  )
  // Non-vacuous: a sweep that found no figures would have proved nothing.
  check(
    'every settlement of the sweep actually drew inhabitants',
    emptyOf.length === 0 && figuresSeen > 0,
    emptyOf.length ? `no figures in: ${emptyOf.join(',')}` : `${figuresSeen} figures`,
  )
}

// === Stranded in blocked water (point 1212) ===================================
// The user's bug report (local/GefangenerSpieler.zip): an antelope's collision
// push left him in the closed Mediterranean off the delta beach, and no input
// moved him. From that exact standpoint he must now walk out under held input —
// the nearest open ground is the beach to the south — and on at least ten world units.
if (section('stranded-shore')) {
  const REPORT = { seed: 804048534, x: 299.925882924154, z: -310.1447977921902 }
  await page.evaluate(() => {
    const g = window.__game.getState()
    g.setJournalOpen(false)
    if (g.mode !== 'travel') g.leavePlace()
  })
  await page.waitForFunction(() => window.__game.getState().mode === 'travel', null, { timeout: 30000 })
  await page.evaluate((r) => window.__game.setState({ seed: r.seed, pos: { x: r.x, z: r.z }, toast: null }), REPORT)
  // Let the scene draw a few frames at the standpoint (animals, collision) before reading it.
  await page.evaluate(() => new Promise((r) => { let n = 30; const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) }))
  // Measured from where he stands once the scene has settled, and only if that
  // is still the trap: a setup push onto open ground would prove nothing.
  const start = await page.evaluate(() => {
    const g = window.__game.getState()
    return { x: g.pos.x, z: g.pos.z, blocked: window.__travelBlocked(g.pos.x, g.pos.z, g.seed) }
  })
  check('stranded shore: the settled standpoint is still blocked water (point 1212)', start.blocked, `at ${start.x.toFixed(2)}/${start.z.toFixed(2)}`)
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' })))
  let walked = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 20000 && walked < 10) {
    walked = await page.evaluate(
      (r) =>
        new Promise((res) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }))
              const p = window.__game.getState().pos
              res(Math.hypot(p.x - r.x, p.z - r.z))
            }),
          ),
        ),
      start,
    )
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS' })))
  const endOpen = await page.evaluate(() => {
    const g = window.__game.getState()
    return !window.__travelBlocked(g.pos.x, g.pos.z, g.seed)
  })
  check(
    'stranded shore: from the report standpoint he walks at least ten units out of the blocked water (point 1212)',
    walked >= 10 && endOpen,
    `walked ${walked.toFixed(2)} units in ${((Date.now() - t0) / 1000).toFixed(1)} s, ending on ${endOpen ? 'open ground' : 'BLOCKED water'}`,
  )
  await page.evaluate(() => window.__game.getState().setJournalOpen(false))
  await page.waitForFunction(() => !document.querySelector('.journal'), null, { timeout: 8000 })
  await shot('54-collision-stranded-shore', { world: { lat: 30.99, lon: 29.9926 }, label: 'the delta beach he walked out onto' })
}

// A selected section that never executed is a FAILURE, not a quiet pass: it is
// the one way a --section run could report green having verified nothing.
const unrun = sections.unrun()
if (unrun) check('the selected section actually ran', false, unrun)

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
// Said again where the verdict is read: a green one-section run is not a green
// suite, and nothing downstream may quote it as one.
if (sections.banner()) console.log(sections.banner())
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
