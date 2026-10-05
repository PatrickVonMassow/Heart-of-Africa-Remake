// Evidence for docs/blind-1287/dispositions.md U15/U16/U22 (point 1287): run with
// `node docs/blind-1287/cap-coverage.mjs`; exits 1 on any violation.
// Travel camera offset {y 42, z 24}, fov 50, zoom 1 (zoom scales frame, shift and
// r/zoom together). Traveller at the origin, south = +z. The ground footprint is the
// quadrilateral of the four corner-ray ground hits; areas against a disc around the
// traveller are EXACT (polygon-circle intersection), no sampling.
const Y = 42, Z = 24, FOV = (50 * Math.PI) / 180, T = Math.tan(FOV / 2)
const pitch = Math.atan2(Y, Z)
const SHIFT = ((Y / Math.tan(pitch - FOV / 2) - Z) - (Z - Y / Math.tan(pitch + FOV / 2))) / 2

function footprint(s, aspect) {
  const cam = [0, Y, s + Z], l = Math.hypot(Y, Z)
  const f = [0, -Y / l, -Z / l], up = [0, Z / l, -Y / l], right = [1, 0, 0]
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
    const d = [0, 1, 2].map((i) => f[i] + sy * T * up[i] + sx * T * aspect * right[i])
    if (d[1] >= 0) throw new Error('corner ray misses the ground')
    const k = -cam[1] / d[1]
    return [cam[0] + k * d[0], cam[2] + k * d[2]]
  })
}
const polyArea = (P) => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
// Signed area of (disc r at origin) ∩ triangle (origin, a, b).
function triDisc(a, b, r) {
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0], dot = (u, v) => u[0] * v[0] + u[1] * v[1]
  const sector = (u, v) => 0.5 * r * r * Math.atan2(cross(u, v), dot(u, v))
  const d = [b[0] - a[0], b[1] - a[1]], A = dot(d, d), B = dot(a, d), C = dot(a, a) - r * r
  const disc = B * B - A * C
  if (disc <= 0) return sector(a, b)
  const sq = Math.sqrt(disc), t1 = Math.max(0, (-B - sq) / A), t2 = Math.min(1, (-B + sq) / A)
  if (t1 >= 1 || t2 <= 0 || t1 >= t2) return sector(a, b)
  const p1 = [a[0] + t1 * d[0], a[1] + t1 * d[1]], p2 = [a[0] + t2 * d[0], a[1] + t2 * d[1]]
  return sector(a, p1) + 0.5 * cross(p1, p2) + sector(p2, b)
}
const inDisc = (P, r) => Math.abs(P.reduce((acc, p, i) => acc + triDisc(p, P[(i + 1) % P.length], r), 0))
const outDisc = (P, r) => polyArea(P) - inDisc(P, r)
const maxR = (P) => Math.max(...P.map((p) => Math.hypot(p[0], p[1])))

// Distance from the traveller to the nearest footprint edge (the disc fits inside up to it).
function inRadius(P) {
  return Math.min(...P.map((a, i) => {
    const b = P[(i + 1) % P.length], d = [b[0] - a[0], b[1] - a[1]]
    const t = Math.max(0, Math.min(1, -(a[0] * d[0] + a[1] * d[1]) / (d[0] * d[0] + d[1] * d[1])))
    return Math.hypot(a[0] + t * d[0], a[1] + t * d[1])
  }))
}

// Claim per aspect: g(r) = out1(r) - out0(r) <= 0 for EVERY r >= 0 (out = frame area
// outside the disc, 0 = unshifted, 1 = shifted). The frames are translates, so
// g = in0 - in1 (in = frame area inside the disc), and:
//   r <= rho0 <= rho1:   in0 = in1 = pi r^2, g = 0;
//   rho0 <= r <= rho1:   in1 = pi r^2 >= in0, g <= 0;
//   far1 <= r:           in1 = whole frame >= in0, g <= 0;
//   rho1 <= r <= far1:   in is non-decreasing, so on [a, b] g <= in0(b) - in1(a);
//                        intervals are bisected until that bound is <= 0.
// The ordering rho0 <= rho1 and far1 <= far0 is checked, not assumed.
function boundHolds(P0, P1) {
  const rho0 = inRadius(P0), rho1 = inRadius(P1), far0 = maxR(P0), far1 = maxR(P1)
  if (rho0 > rho1 + 1e-12 || far1 > far0 + 1e-12) return { ok: false, why: 'ordering' }
  const stack = []
  for (let a = rho1; a < far1; a += 0.5) stack.push([a, Math.min(a + 0.5, far1)])
  let intervals = 0
  while (stack.length) {
    const [a, b] = stack.pop()
    intervals++
    if (inDisc(P0, b) - inDisc(P1, a) <= 0) continue
    if (b - a < 1e-7) return { ok: false, why: `interval [${a}, ${b}]` }
    const m = (a + b) / 2
    stack.push([a, m], [m, b])
  }
  return { ok: true, why: `${intervals} intervals`, rho0, rho1, far0, far1 }
}

let bad = 0
const NAMED = new Map([[16 / 9, '16:9'], [4 / 3, '4:3'], [9 / 16, '9:16']])
const aspects = [...Array.from({ length: 40 }, (_, i) => 0.45 + 0.05 * i), ...NAMED.keys()]
for (const aspect of aspects) {
  const P0 = footprint(0, aspect), P1 = footprint(SHIFT, aspect)
  const res = boundHolds(P0, P1)
  if (!res.ok) bad++
  if (NAMED.has(aspect) || !res.ok) {
    const row = [25, 30, 35].map((r) => `r${r} ${outDisc(P0, r).toFixed(0)}→${outDisc(P1, r).toFixed(0)}`).join('  ')
    console.log(`aspect ${NAMED.get(aspect) ?? aspect.toFixed(2)}: ${res.ok ? 'holds' : 'VIOLATED'} (${res.why}) | ${row} | frame ${polyArea(P0).toFixed(1)}→${polyArea(P1).toFixed(1)} | frame∩disc45 ${inDisc(P0, 45).toFixed(1)}→${inDisc(P1, 45).toFixed(1)} | inradius ${inRadius(P0).toFixed(1)}→${inRadius(P1).toFixed(1)} | far corner ${maxR(P0).toFixed(1)}→${maxR(P1).toFixed(1)}`)
  }
}
console.log(`shift ${SHIFT.toFixed(3)}; aspects 0.45..2.40 step 0.05 plus 16:9, 4:3, 9:16: ${bad ? bad + ' VIOLATED' : 'the frame area outside the disc never grows, for every radius, at each'}`)
process.exit(bad ? 1 : 0)
