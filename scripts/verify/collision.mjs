// Headless verification for CLAUDE.md §7.1.16 (collision inside settlements).
// Headless Chromium throttles requestAnimationFrame, so sustained key-held
// walking is unreliable; the collision resolver runs in useFrame per input
// frame, so we verify it directly: place the player inside/against a solid
// object, feed a few input frames, and assert it is ejected to the object's
// surface and never penetrates. Reachability of paths/accesses is verified
// geometrically. Dev server only (dev hooks).
import { launchVerifyBrowser, assertBackend } from './_browser.mjs'
import { frameShutter } from './frameSubject.mjs'
import { fileURLToPath } from 'node:url'

// A fixed dev seed makes the procedural settlement layout deterministic so the
// collision/reachability checks are reproducible (?seed=<n>, DEV only).
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/?seed=42'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
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

// === Port (Cairo) ============================================================
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
const shot = frameShutter(page, OUT)
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

// === Village (Masai) =========================================================
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

// === The PoC village's teaching stone (work-order 482) ========================
// The adults teach the word for a rock at a stone in the open (docs/
// communication-poc-spec.md), so it has to BE there: a solid the player walks up
// to and not through, standing where the layout says — and in the picture, which
// is the only place a "visible from the village" claim can be judged.
await page.evaluate(() => window.__game.getState().enterPlace('bambara-village'))
await page
  .waitForFunction((want) => window.__game.getState().placeId === want && !!window.__placeLayout, 'bambara-village', { timeout: 30000 })
  .catch(() => {})
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)
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

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
