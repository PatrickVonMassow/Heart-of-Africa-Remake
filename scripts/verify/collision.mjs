// Headless verification for CLAUDE.md §7.1.16 (collision inside settlements).
// Headless Chromium throttles requestAnimationFrame, so sustained key-held
// walking is unreliable; the collision resolver runs in useFrame per input
// frame, so we verify it directly: place the player inside/against a solid
// object, feed a few input frames, and assert it is ejected to the object's
// surface and never penetrates. Reachability of paths/accesses is verified
// geometrically. Dev server only (dev hooks).
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/'
const OUT = fileURLToPath(new URL('../../verification/', import.meta.url))
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
// Shared helpers for both collider shapes (circle and oriented box).
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
    const p = window.__placePlayer
    p.x = c.x
    p.z = c.z
    p.yaw = 0
    return { cx: c.x, cz: c.z, cr: window.__colliderSize(c) }
  }, pick)
  if (!info) {
    check(`${sceneLabel}: eject target found`, false, `pick matched nothing: ${pick}`)
    return
  }
  await pushFrames(14)
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
 * standpoint within interaction range from which its prompt appears. This is
 * the gameplay-level access guarantee (§7.1.16).
 */
async function reachableBuildings(sceneLabel) {
  const targets = await page.evaluate(() =>
    window.__placeLayout.interactives
      .map((it, i) => ({ i, type: it.type, pos: it.pos }))
      .filter((t) => t.type !== 'exit' && t.type !== 'villager'),
  )
  const unreachable = []
  for (const t of targets) {
    let ok = false
    for (let a = 0; a < 16 && !ok; a++) {
      const angle = (a / 16) * Math.PI * 2
      // Find a collision-free standpoint ~3.6 units out, then read the prompt.
      const placed = await page.evaluate(
        ([tx, tz, ang]) => {
          const cs = window.__placeColliders
          for (let r = 3.9; r >= 2.6; r -= 0.4) {
            const x = tx + Math.cos(ang) * r
            const z = tz + Math.sin(ang) * r
            if (cs.every((c) => window.__clearanceTo(c, x, z) > 0.36)) {
              const p = window.__placePlayer
              p.x = x
              p.z = z
              return true
            }
          }
          return false
        },
        [t.pos[0], t.pos[1], angle],
      )
      if (!placed) continue
      await pushFrames(4)
      const pr = await page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '')
      if (pr.trim().length > 0) ok = true
    }
    if (!ok) unreachable.push(t.type)
  }
  check(
    `${sceneLabel}: all functional buildings operable (free standpoint + prompt)`,
    unreachable.length === 0,
    unreachable.length ? `unreachable: ${unreachable.join(',')}` : `${targets.length} buildings ok`,
  )
}

async function accessPointsFree(sceneLabel) {
  const blocked = await page.evaluate(() => {
    const cs = window.__placeColliders
    const clear = (x, z) => cs.every((c) => window.__clearanceTo(c, x, z) > 0.35)
    return [
      { n: 'spawn', x: 0, z: 18 },
      { n: 'square', x: 0, z: 3 },
      { n: 'exit', x: 0, z: 23.5 },
    ].filter((p) => !clear(p.x, p.z)).map((p) => p.n)
  })
  check(`${sceneLabel}: spawn/square/exit free`, blocked.length === 0,
    blocked.length ? `blocked: ${blocked.join(',')}` : 'free')
}

// === Port (Cairo) ============================================================
// Eject from: biggest building (box collider), and a mid-size circle collider.
await ejectTest('Port', '(cs)=>cs.reduce((b,c,i,a)=>window.__colliderSize(c)>window.__colliderSize(a[b])?i:b,0)')
await ejectTest('Port', '(cs)=>cs.reduce((b,c,i,a)=>(c.kind!=="box"&&(b<0||c.r>a[b].r))?i:b,-1)') // biggest circle prop
const funcTypes = await page.evaluate(() =>
  window.__placeLayout.interactives.filter((b) => b.type !== 'exit' && b.type !== 'villager').map((b) => b.type),
)
check('Port: all 4 functional buildings present', funcTypes.length === 4, funcTypes.join(','))
await reachableBuildings('Port')
await accessPointsFree('Port')

// Ram screenshot: teleport in front of the biggest wall and nudge into it.
await page.evaluate(() => {
  const c = [...window.__placeColliders].sort((a, b) => window.__colliderSize(b) - window.__colliderSize(a))[0]
  const p = window.__placePlayer
  const len = Math.hypot(c.x, c.z) || 1
  p.x = c.x - (c.x / len) * (window.__colliderSize(c) + 2)
  p.z = c.z - (c.z / len) * (window.__colliderSize(c) + 2)
  p.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z))
})
await pushFrames(16)
check('Port: no penetration at the wall', (await clearance()) >= -0.03, `clearance ${(await clearance()).toFixed(3)}`)
await page.screenshot({ path: `${OUT}52-collision-port-wall.png` })
console.log('shot 52-collision-port-wall.png')

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
  await pushFrames(8)
  const cl = await clearance()
  check(`Port: ejected from building corner ${corner + 1}/4`, cl >= -0.03, `clearance ${cl.toFixed(3)}`)
}

// === Village (Masai) =========================================================
await page.evaluate(() => window.__game.getState().enterPlace('masai-village'))
await page.waitForTimeout(2500)
await page.evaluate(() => window.__game.getState().setJournalOpen(false))
await page.waitForTimeout(400)

await ejectTest('Village', '(cs)=>cs.reduce((b,c,i,a)=>window.__colliderSize(c)>window.__colliderSize(a[b])?i:b,0)') // chief hut
await ejectTest('Village', '(cs)=>cs.reduce((b,c,i,a)=>(c.kind!=="box"&&c.r>=1.5&&c.r<=2.2&&(b<0||c.r<a[b].r))?i:b,-1)') // dwelling hut
await ejectTest('Village', '(cs)=>cs.reduce((b,c,i,a)=>(c.kind!=="box"&&c.r<=0.65&&(b<0))?i:b,-1)') // thorn fence post

// Chief prompt reachable despite collision ("Chefhütte" — German default).
await page.evaluate(() => {
  const it = window.__placeLayout.interactives[0]
  const p = window.__placePlayer
  p.x = it.pos[0]
  p.z = it.pos[1] + 4.2
  p.yaw = 0
})
await pushFrames(6)
const prompt = await page.evaluate(() => document.querySelector('.prompt')?.textContent ?? '')
check('Village: chief-hut prompt reachable despite collision', prompt.includes('Chefhütte'), `prompt: "${prompt}"`)
await page.screenshot({ path: `${OUT}53-collision-village-chief-hut.png` })
console.log('shot 53-collision-village-chief-hut.png')

await reachableBuildings('Village')
await accessPointsFree('Village')

// Inhabitants enter their dwellings (§7.1.16 / design.md §2): observe the
// walkers until one that has been out walking disappears inside — at that
// moment it must stand at its home center (it slipped in through the door).
const walkerResult = await page.evaluate(async () => {
  const deadline = Date.now() + 150000
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

console.log('console errors:', errors.length)
for (const e of errors) console.log('ERR:', e.slice(0, 300))
await browser.close()
process.exit(failures > 0 || errors.length > 0 ? 1 : 0)
