import assert from 'node:assert/strict'

export function turnDelta(yaw, from, target) {
  const desired = Math.atan2(-(target.x - from.x), -(target.z - from.z))
  return Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw))
}
export function travelKeys(from, target, tolerance = 0.12) {
  const keys = []
  if (Math.abs(target.x - from.x) > tolerance) keys.push(target.x > from.x ? 'KeyD' : 'KeyA')
  if (Math.abs(target.z - from.z) > tolerance) keys.push(target.z > from.z ? 'KeyS' : 'KeyW')
  return keys
}

/** All writes after entry are Playwright keyboard/mouse input. evaluate reads
 * poses or computes routes on private grids; it never changes the live pose. */
export function communicationDriver(page) {
  const read = (fn, arg) => page.evaluate(fn, arg)
  const wait = (fn, arg, timeout = 180000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' })
  async function held(keys, action) {
    try {
      for (const key of keys) await page.keyboard.down(key)
      return await action()
    } finally { for (const key of keys) await page.keyboard.up(key) }
  }
  async function aim(target) {
    for (let i = 0; i < 80; i++) {
      const p = await read(() => ({ ...window.__placePlayer }))
      const delta = turnDelta(p.yaw, p, target)
      if (Math.abs(delta) < 0.065) return
      await held([delta > 0 ? 'ArrowLeft' : 'ArrowRight'], () => page.waitForTimeout(Math.min(180, Math.max(20, Math.abs(delta) / 2.2 * 700))))
    }
    throw new Error('Could not aim at the declared subject using turn keys')
  }
  async function walkLeg(target) {
    const started = Date.now()
    let best = Infinity, progress = started
    while (Date.now() - started < 90000) {
      const p = await read(() => window.__game.getState().mode === 'place' ? { ...window.__placePlayer } : null)
      assert(p, 'Unexpected settlement exit during a walk')
      const distance = Math.hypot(p.x - target.x, p.z - target.z)
      if (distance < 0.32) return
      if (distance < best - 0.08) { best = distance; progress = Date.now() }
      assert(Date.now() - progress < 12000, `Blocked settlement walk to ${JSON.stringify(target)}`)
      await aim(target)
      await held(['KeyW'], () => page.waitForTimeout(Math.min(250, Math.max(35, distance * 110))))
    }
    throw new Error('Settlement walk timed out')
  }
  async function walk(target) {
    const path = await read(async (to) => {
      const { buildPlaceNavGrid, findPlaceRoute } = await import('/src/scenes/place/routing.ts')
      const l = window.__placeLayout
      const grid = buildPlaceNavGrid(l, l.colliders, 0.45)
      return findPlaceRoute(grid, window.__placePlayer, to)
    }, target)
    assert(path?.length, `No walkable route to ${JSON.stringify(target)}`)
    for (const p of path) await walkLeg(p)
  }
  async function inspect(target, distance = 3) {
    const stand = await read(async ({ target, distance }) => {
      const { standingClear } = await import('/src/scenes/place/collision.ts')
      const { insidePlace } = await import('/src/scenes/place/boundary.ts')
      const { buildPlaceNavGrid, findPlaceRoute } = await import('/src/scenes/place/routing.ts')
      const l = window.__placeLayout, p = window.__placePlayer
      const grid = buildPlaceNavGrid(l, l.colliders, 0.45)
      const bearing = Math.atan2(p.z - target.z, p.x - target.x)
      for (let i = 0; i < 24; i++) {
        const a = bearing + i * Math.PI / 12
        const to = { x: target.x + Math.cos(a) * distance, z: target.z + Math.sin(a) * distance }
        if (insidePlace(l, to.x, to.z, 0.6) && standingClear(l.colliders, to.x, to.z, 0.45) && findPlaceRoute(grid, p, to)) return to
      }
      return null
    }, { target, distance })
    assert(stand, `No reachable viewing spot at ${JSON.stringify(target)}`)
    await walk(stand); await aim(target)
  }
  async function leave() {
    const exit = await read(async () => {
      const { placeBoundaryRadius } = await import('/src/scenes/place/boundary.ts')
      const l = window.__placeLayout, a = l.wayOut
      if (a === null) return null
      const r = placeBoundaryRadius(l, a)
      return { inside: { x: Math.cos(a) * (r - 2), z: Math.sin(a) * (r - 2) },
        outside: { x: Math.cos(a) * (r + 4), z: Math.sin(a) * (r + 4) } }
    })
    assert(exit, 'The village has no walkable way out')
    await walk(exit.inside); await aim(exit.outside)
    await held(['KeyW'], () => wait(() => window.__game.getState().mode === 'travel', null, 30000))
  }
  async function travel(target, tolerance = 0.25) {
    const started = Date.now()
    let best = Infinity, progress = started
    while (Date.now() - started < 120000) {
      const p = await read(() => window.__game.getState().pos)
      const d = Math.hypot(p.x - target.x, p.z - target.z)
      if (d < tolerance) return
      if (d < best - 0.03) { best = d; progress = Date.now() }
      assert(Date.now() - progress < 15000, `Blocked travel leg to ${JSON.stringify(target)}`)
      assert(await read(() => window.__game.getState().mode === 'travel' && !window.__ui.getState().dialog), 'Travel was interrupted by a modal or scene change')
      await held(travelKeys(p, target, tolerance / 2), () => page.waitForTimeout(100))
    }
    throw new Error('Travel leg timed out')
  }
  async function travelTo(target, tolerance = 0.25) {
    const path = await read(async ({ target, tolerance }) => {
      const { collidableFloraNear } = await import('/src/scenes/travel/TravelScene.tsx')
      const { buildPlaceNavGrid, findPlaceRoute, navRestrict } = await import('/src/scenes/place/routing.ts')
      const { sampleTerrain, isBlocked } = await import('/src/world/terrain.ts')
      const { worldToLatLon, PLACES, latLonToWorld } = await import('/src/world/geo.ts')
      const s = window.__game.getState(), origin = s.pos
      const reach = Math.hypot(target.x - origin.x, target.z - origin.z) + 5
      const colliders = collidableFloraNear(origin.x, origin.z, s.seed, reach)
        .map(([x, z, r]) => ({ x: x - origin.x, z: z - origin.z, r }))
      for (const place of PLACES) {
        const p = latLonToWorld(place.lat, place.lon)
        if (Math.hypot(p.x - origin.x, p.z - origin.z) > 2) colliders.push({ x: p.x - origin.x, z: p.z - origin.z, r: 1.6 })
      }
      const grid = buildPlaceNavGrid({ radius: reach }, colliders, 0.22, 0.44, 0.25)
      navRestrict(grid, (x, z) => {
        const p = worldToLatLon(x + origin.x, z + origin.z)
        return !isBlocked(sampleTerrain(p.lat, p.lon, s.seed).type, p.lat, p.lon)
      })
      // An interaction target may be solid: stop within its declared reach.
      const dx = target.x - origin.x, dz = target.z - origin.z, len = Math.hypot(dx, dz)
      if (len <= tolerance) return []
      const to = { x: dx * (1 - tolerance / len), z: dz * (1 - tolerance / len) }
      return findPlaceRoute(grid, { x: 0, z: 0 }, to, 12)?.map((p) => ({ x: p.x + origin.x, z: p.z + origin.z })) ?? null
    }, { target, tolerance })
    assert(path, `No traversable route to ${JSON.stringify(target)}`)
    for (const p of path) await travel(p)
  }
  async function close() {
    for (let i = 0; i < 3; i++) {
      if (!await read(() => !!window.__ui.getState().dialog || window.__game.getState().journalOpen)) break
      await page.keyboard.press('Escape')
    }
  }
  async function inventory(selector) {
    // Number keys are the shipped inventory control under pointer lock.
    const digit = await page.locator(`${selector} .inv-digit`).innerText()
    assert(/^[1-9]$/.test(digit), `No inventory shortcut for ${selector}`)
    await page.keyboard.press(`Digit${digit}`)
  }
  return { read, wait, held, aim, walk, inspect, leave, travelTo, close, inventory }
}
