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
// Shared helpers for all three collider shapes: circle, oriented box and the
// fence panel's capsule around a segment (point 413). A shape this helper does
// not know reads every point as NaN-blocked, so it must track collision.ts.
await page.addInitScript(() => {
  window.__clearanceTo = (c, x, z) => {
    if (c.kind === 'box') {
      const sin = Math.sin(c.rot)
      const cos = Math.cos(c.rot)
      const dx = x - c.x
      const dz = z - c.z
      const lx = cos * dx - sin * dz
      const lz = sin * dx + cos * dz
      const qx = Math.max(-c.hx, Math.min(c.hx, lx))
      const qz = Math.max(-c.hz, Math.min(c.hz, lz))
      if (qx === lx && qz === lz) return -Math.min(c.hx - Math.abs(lx), c.hz - Math.abs(lz))
      return Math.hypot(lx - qx, lz - qz)
    }
    if (c.kind === 'segment') {
      const ex = c.x2 - c.x1
      const ez = c.z2 - c.z1
      const l2 = ex * ex + ez * ez
      const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - c.x1) * ex + (z - c.z1) * ez) / l2))
      return Math.hypot(x - (c.x1 + ex * t), z - (c.z1 + ez * t)) - c.r
    }
    return Math.hypot(x - c.x, z - c.z) - c.r
  }
  window.__colliderSize = (c) => (c.kind === 'box' ? Math.max(c.hx, c.hz) : c.r)
})
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
 * standpoint within the door's trigger radius from which walking onto it opens
 * the building's dialog (§7.1.16 / design.md §2 walk-in).
 */
async function reachableBuildings(sceneLabel) {
  const targets = await page.evaluate(() =>
    window.__placeLayout.interactives
      .map((it, i) => ({ i, type: it.type, door: it.door ?? null }))
      .filter((t) => t.type !== 'villager'),
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
    if (placed) {
      // Arm the Space prompt at the door, then press it (design.md §2.3).
      await page.waitForFunction(() => !!document.querySelector('.prompt'), null, { timeout: 8000 }).catch(() => {})
      await page.keyboard.press('Space')
      opened = await page.waitForFunction(() => !!document.querySelector('.dialog'), null, { timeout: 8000 }).then(() => true).catch(() => false)
    }
    if (!placed || !opened) notOperable.push(`${t.type}${placed ? '' : '(no clear standpoint)'}${opened ? '' : '(no open)'}`)
    // Close and step away from the door for the next building.
    await page.keyboard.press('Escape')
    await page.evaluate(() => { const p = window.__placePlayer; p.x = 0; p.z = 0 })
    await page.waitForFunction(() => !document.querySelector('.dialog'), null, { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  check(
    `${sceneLabel}: all functional buildings operable (Space at the door opens it)`,
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
  // Space use key opens the audience dialog (design.md §2.3).
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
  const audienceOpened = await page
    .waitForFunction(() => !!document.querySelector('.dialog'), null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  check('Village: chief hut opens with Space at its door', audienceOpened)
  await page.evaluate(() => window.__ui?.getState?.().setDialog(null))
  await page.waitForTimeout(200)
  await dwellingDoorsReachable('Village')
  await shot('53-collision-village-chief-hut', { place: 'maasai-village', label: "the chief's hut and its door" })
  await page.keyboard.press('Escape')
  await page.evaluate(() => { const p = window.__placePlayer; p.x = 0; p.z = 0 })
  await page.waitForFunction(() => !document.querySelector('.dialog'), null, { timeout: 8000 }).catch(() => {})
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

// === The PoC village's teaching stone (work-order 482) ========================
// The adults teach the word for a rock at a stone in the open (docs/
// communication-poc-spec.md), so it has to BE there: a solid the player walks up
// to and not through, standing where the layout says — and in the picture, which
// is the only place a "visible from the village" claim can be judged.
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
}

if (section('teaching-stone')) {
  await enterSettlement('bambara-village')
  const teachingStone = await page.evaluate(() => window.__placeLayout.teachingStone ?? null)
  check('PoC village: the teaching stone is in the layout', !!teachingStone, JSON.stringify(teachingStone))
  if (teachingStone) {
    await ejectTest(
      'Teaching stone',
      `(cs)=>cs.findIndex((c)=>!c.kind&&Math.hypot(c.x-(${teachingStone.x}),c.z-(${teachingStone.z}))<0.01)`,
    )
    // Stand a couple of steps off it, looking at it, so the frame shows the stone
    // the way a player walking up to it sees it.
    await page.evaluate((s) => {
      const p = window.__placePlayer
      const len = Math.hypot(s.x, s.z) || 1
      p.x = s.x - (s.x / len) * (s.r + 2.6)
      p.z = s.z - (s.z / len) * (s.r + 2.6)
      p.yaw = Math.atan2(-(s.x - p.x), -(s.z - p.z))
    }, teachingStone)
    // Let the scene consume the teleport on ITS clock before the shutter judges:
    // two animation frames, not a wall-clock guess (CLAUDE.md §7.2). On a loaded
    // host a frame can take a second, and the camera would still be easing toward
    // the stone when the picture is taken.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
    await shot('54-collision-teaching-stone', {
      local: { x: teachingStone.x, z: teachingStone.z },
      label: 'the teaching stone in the PoC village',
    })
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
