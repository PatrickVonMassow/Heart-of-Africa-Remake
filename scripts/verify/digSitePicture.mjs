// One fixed village composition for the two purpose cues and walkable spoil.
// The layout/clearance test pins this choice without running a browser.
// Re-picked when the well left this village (point 1092), and again when point
// 1173 grew the settlement: the dig search reads the collider set and the
// walkable radius, so a larger disc spread the pair well past the 8 m this was
// composed at. Seed 58 is the one candidate in the first 600 that keeps the
// whole composition — both holes, their furniture and the walkable spoil lane —
// inside the frame at the widened stand-off, at a span of 11.8 m.
export const DIG_PICTURE = { placeId: 'bambara-village', seed: 58 }

export function digPictureUnmounted() {
  return !window.__game.getState().placeId && !window.__placeWalkers && !window.__placeErrands
}

/** The span the two holes may be apart and still compose one picture, and how
 *  far back the camera stands for it. Point 1173 grew the settlement, which
 *  spread the pair well past the 6-9 m this was first written for; the
 *  STAND-OFF is derived from the span now rather than fixed at 8 m, so the
 *  frame holds the pair wherever the disc's size puts it. */
const DIG_PICTURE_SPAN = { min: 9, max: 14 }

export function digPictureView(sites) {
  if (sites.length !== 2) return null
  const [a, b] = sites
  const span = Math.hypot(b.x - a.x, b.z - a.z)
  if (span < DIG_PICTURE_SPAN.min || span > DIG_PICTURE_SPAN.max) return null
  const aim = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  // Back off with the span: at the 50 deg vertical field of the verification
  // viewport the horizontal frame is ~73 deg, so half a span of `s` needs about
  // `s/2 / tan(36.7 deg)` = 0.67 s of depth to sit inside the edge. The factor
  // below carries that plus the furniture that stands beside each hole.
  const back = Math.max(8, span * 0.95)
  const x = aim.x - (b.z - a.z) / span * back
  const z = aim.z + (b.x - a.x) / span * back
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
  if (window.__ui?.getState().speechConceptLabels !== false) return null
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
