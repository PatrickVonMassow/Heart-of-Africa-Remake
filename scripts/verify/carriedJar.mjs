// THE WATER CARRIER'S JAR AS DRAWN (work-order "the Bambara water carrier shows
// his jar for the whole errand"). The errand's `carry` field said "emptyJar" and
// "fullJar" while the player saw a man with nothing in his hands, and every
// browser check read that field or probed an assumed point over his head. These
// helpers ask the PICTURE instead: where the jar object's world bounds project
// into the frame, and how many pixels inside that rectangle change when only
// the jar's own meshes are hidden. A jar that is visible-flagged but sits inside
// the body, off the bone, at a zero scale or behind something changes nothing.

/**
 * Runs INSIDE the page (self-contained: Playwright ships its source). Finds the
 * jar group named `name` that belongs to villager `who`, and reports whether it
 * is shown through its whole ancestor chain, whether that chain reaches the
 * scene, its world bounds, and the CSS-pixel rectangle those bounds project to.
 */
export function probeCarriedJar({ who, name }) {
  const scene = window.__placeScene
  const cam = window.__placeCamera
  if (!scene || !cam) return { found: false, why: 'no place scene' }
  let jar = null
  scene.traverse((o) => {
    if (!jar && o.name === name && o.userData && o.userData.villager === who) jar = o
  })
  if (!jar) return { found: false, why: `no ${name} for villager ${who}` }
  const chain = []
  let shown = true
  let root = jar
  for (let o = jar; o; o = o.parent) {
    if (!o.visible) {
      shown = false
      chain.push(o.name || o.type)
    }
    root = o
  }
  scene.updateMatrixWorld(true)
  const canvas = document.querySelector('canvas')
  const r = canvas.getBoundingClientRect()
  const apply = (e, v) => [0, 1, 2, 3].map((k) => e[k] * v[0] + e[k + 4] * v[1] + e[k + 8] * v[2] + e[k + 12] * v[3])
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity
  let behind = false
  let meshes = 0
  jar.traverse((o) => {
    if (!o.isMesh) return
    meshes++
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const b = o.geometry.boundingBox
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const w = apply(o.matrixWorld.elements, [x, y, z, 1])
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], w[k])
        hi[k] = Math.max(hi[k], w[k])
      }
      const c = apply(cam.projectionMatrix.elements, apply(cam.matrixWorldInverse.elements, w))
      if (!(c[3] > 0)) {
        behind = true
        continue
      }
      const px = r.left + ((c[0] / c[3] + 1) / 2) * r.width
      const py = r.top + ((1 - c[1] / c[3]) / 2) * r.height
      sx0 = Math.min(sx0, px)
      sy0 = Math.min(sy0, py)
      sx1 = Math.max(sx1, px)
      sy1 = Math.max(sy1, py)
    }
  })
  const x0 = Math.max(r.left, Math.floor(sx0))
  const y0 = Math.max(r.top, Math.floor(sy0))
  const x1 = Math.min(r.right, Math.ceil(sx1))
  const y1 = Math.min(r.bottom, Math.ceil(sy1))
  const rect = x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
  const ws = jar.getWorldScale(new jar.position.constructor())
  const owner = (() => {
    for (let o = jar.parent; o; o = o.parent) if (o.name === 'inhabitant') return o
    return null
  })()
  const feet = owner ? owner.getWorldPosition(new jar.position.constructor()) : null
  return {
    found: true,
    shown,
    hiddenBy: chain,
    inScene: root === scene,
    meshes,
    behind,
    rect,
    center: { x: (lo[0] + hi[0]) / 2, y: (lo[1] + hi[1]) / 2, z: (lo[2] + hi[2]) / 2 },
    size: { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] },
    worldScale: ws.y,
    feet: feet ? { x: feet.x, y: feet.y, z: feet.z } : null,
  }
}

/**
 * Runs INSIDE the page: hides (`false`) or restores (`true`) the jar's OWN
 * meshes, leaving the group's visibility — the thing the frame loop drives —
 * alone, so the two exposures differ by the jar and nothing else.
 */
export function showCarriedJarMeshes({ who, name, on }) {
  let n = 0
  window.__placeScene.traverse((o) => {
    if (o.name !== name || !o.userData || o.userData.villager !== who) return
    o.traverse((m) => {
      if (m.isMesh) {
        m.visible = on
        n++
      }
    })
  })
  return n
}

/** A pixel counts as changed when its summed RGB difference reaches this. */
export const PIXEL_CHANGE_THRESHOLD = 36
/** The fewest changed pixels that count as a jar drawn on the screen: a jar at
 *  reading distance covers thousands; a few dozen is the background shimmering. */
export const MIN_JAR_PIXELS = 150

/** Pure: how many pixels differ between two equally sized raw RGB(A) buffers. */
export function countChangedPixels(a, b, channels, threshold = PIXEL_CHANGE_THRESHOLD) {
  if (a.length !== b.length) throw new Error(`buffers differ in size: ${a.length} vs ${b.length}`)
  let changed = 0
  for (let i = 0; i < a.length; i += channels) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (d >= threshold) changed++
  }
  return changed
}

/**
 * Pure verdict for one phase: the jar group is found, shown along its whole
 * chain, part of the scene, projects into the frame, and hiding its meshes
 * changes at least `minPixels` pixels inside that projection.
 */
export function judgeCarriedJar(probe, changed, minPixels = MIN_JAR_PIXELS) {
  if (!probe || !probe.found) return { ok: false, why: probe?.why ?? 'jar not found' }
  if (!probe.inScene) return { ok: false, why: 'the jar is not attached to the drawn scene' }
  if (!probe.shown) return { ok: false, why: `the jar is hidden by ${probe.hiddenBy.join(' > ')}` }
  if (!probe.meshes) return { ok: false, why: 'the jar group holds no mesh' }
  if (!probe.rect) return { ok: false, why: 'the jar projects outside the frame' }
  if (!(changed >= minPixels)) {
    return { ok: false, why: `only ${changed} px change when the jar is hidden (needs ${minPixels}): drawn nowhere the lens sees` }
  }
  return { ok: true, why: `${changed} px of jar in a ${probe.rect.width}×${probe.rect.height} px projection` }
}
