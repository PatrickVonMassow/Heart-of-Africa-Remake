// One fixed village composition for the two purpose cues and walkable spoil.
// The layout/clearance test pins this choice without running a browser.
export const DIG_PICTURE = { placeId: 'bambara-village', seed: 12 }

export function digPictureView(sites) {
  if (sites.length !== 2) return null
  const [a, b] = sites
  const span = Math.hypot(b.x - a.x, b.z - a.z)
  if (span < 6 || span > 9) return null
  const aim = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  const x = aim.x - (b.z - a.z) / span * 8
  const z = aim.z + (b.x - a.x) / span * 8
  return { x, z, yaw: Math.atan2(-(aim.x - x), -(aim.z - z)), pitch: -0.17, aim }
}

// Runs in the page. Height comes from the actor's shared place-ground sampler;
// the group transform is a separate reading, so a body clipping through fails.
export function readSpoilWalker({ who, start, hold = false }) {
  const walkers = window.__placeWalkers
  const v = walkers?.sample(who)
  if (!v || v.mode !== 'walk' || v.pause > 0 || !v.drawn.visible) return null
  if (!(v.groundHeight > 0.27) || Math.hypot(v.x - start.x, v.z - start.z) < 0.9) return null
  if (Math.hypot(v.drawn.x - v.x, v.drawn.z - v.z) > 0.01) return null
  if (v.drawn.y < v.groundHeight - 0.005 || v.drawn.y > v.groundHeight + 0.055) return null
  if (hold) walkers.hold(who)
  return v
}

// Project the actual purpose meshes, not just the midpoint between two holes.
export function readDigPicture() {
  const scene = window.__placeScene
  const camera = window.__placeCamera
  if (!scene || !camera) return null
  scene.updateMatrixWorld(true)
  const sites = []
  scene.traverseVisible((o) => { if (o.name === 'dig-site') sites.push(o) })
  if (sites.length !== 2 || new Set(sites.map((s) => s.userData.kind)).size !== 2) return null
  const readings = []
  for (const site of sites) {
    if (!(site.userData.dug >= 18) || !site.userData.completed) return null
    const name = { pit: 'grain-baskets-and-cover', postHole: 'stacked-posts', patch: 'seedling-tray' }[site.userData.kind]
    const furniture = site.getObjectByName(name)
    const ground = site.getObjectByName(site.userData.kind === 'patch' ? 'dig-furrows' : 'dig-mouth')
    if (!furniture || !ground) return null
    const bounds = (root) => {
      const points = []
      root.traverseVisible((o) => {
        if (!o.isMesh || !o.visible) return
        o.geometry.computeBoundingBox()
        const box = o.geometry.boundingBox
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const world = camera.position.clone().set(x, y, z).applyMatrix4(o.matrixWorld)
          const p = world.clone().project(camera)
          points.push(p)
        }
      })
      if (!points.length || points.some((p) => Math.abs(p.x) > 0.94 || Math.abs(p.y) > 0.94 || p.z >= 1 || p.z <= -1)) return null
      return {
        left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)),
        pixels: (Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))) * window.innerWidth / 2,
      }
    }
    const cue = bounds(furniture)
    const earth = bounds(ground)
    if (!cue || !earth || cue.pixels < 35 || earth.pixels < 90) return null
    readings.push({ kind: site.userData.kind, cue, earth })
  }
  const [a, b] = readings.map((r) => r.earth).sort((a, b) => a.left - b.left)
  return b.left - a.right > 0.08 ? readings : null
}

export async function captureSpoilWalk(page, check, frame, nextFrames, route) {
  try {
    await page.evaluate(({ start, end, who }) => {
      const s = window.__placeWalkers.states[who]
      // Start on flat ground. Segment 1 of five uses the ordinary collision and
      // separation path, never the door segment's collision exemption.
      Object.assign(s, { x: start.x, z: start.z, mode: 'walk', seg: 1, pause: 0, stuck: 0, pinned: 0,
        route: [[start.x, start.z], [start.x, start.z], [end.x, end.z], [end.x, end.z], [end.x, end.z]] })
    }, route)
    const caught = await page.waitForFunction(readSpoilWalker, { ...route, hold: true }, { timeout: 30000 })
      .then((h) => h.jsonValue()).catch(() => null)
    check('a village walker reaches more than half the full-grown spoil height', !!caught, JSON.stringify(caught))
    if (!caught) return
    await nextFrames(2)
    const held = await page.evaluate(readSpoilWalker, route)
    const composition = await page.evaluate(readDigPicture)
    const ready = !!held?.held && held.x === caught.x && held.z === caught.z && held.drawn.y === caught.drawn.y && !!composition
    check('both excavation purposes and the raised walker are held at the shutter', ready, JSON.stringify({ held, composition }))
    if (!ready) return
    await frame('1056-two-excavations-walkable-spoil', {
      local: { x: held.x, y: held.drawn.y + 0.65, z: held.z },
      label: 'the two excavations with a villager walking over the spoil',
    })
  } finally {
    await page.evaluate(() => window.__placeWalkers?.hold(null))
  }
}
