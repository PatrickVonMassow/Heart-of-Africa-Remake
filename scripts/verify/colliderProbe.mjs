// The collider geometry the SUITES read with — installed into the page so a
// check can ask how far a point lies from a collider and how big that collider
// is. Shared by every suite that needs it (collision measures ejections with it,
// polish stages the reported wedge with it); a shape this helper does not know
// reads every point as NaN-blocked, so it must track collision.ts.
export const installColliderProbe = (page) =>
  page.addInitScript(() => {
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
