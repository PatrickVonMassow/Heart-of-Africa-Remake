// @vitest-environment node
// Diagnostic probe (point 1485 r4, plan 3.5.z): logs per-column envelope causes at the rest standstill; asserts nothing red.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import type { DressLayer } from '../systems/appearance'
import { clipLayers, applyClipLayers, stepClipLayers } from '../scenes/place/gltfClipLayers'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { createGltfSkeleton, drivenFigure, gltfPerson } from './villagerFigureBody'
import { ColumnDriver, capsuleActive, capsuleRadius, capsuleRadiusOver, clipActive, columnRig, pointSegment, restHeight, sectorOf, segmentTriangle, type V3 } from './villagerSkirtDriver'

type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any
const OUT = process.env.PROBE_OUT ?? '/tmp/claude-0/standstill-probe'
const DEG = Math.PI / 180
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3) => Math.sqrt(dot(a, a))
const at = (a: ArrayLike<number>, i: number): V3 => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]
const f4 = (x: number) => x.toFixed(4)
function skin(p: V3, idx: ArrayLike<number>, w: ArrayLike<number>, o: number, M: ArrayLike<number>, rest: ArrayLike<number>, ov?: (b: number) => ArrayLike<number> | null): V3 {
  const q: V3 = [0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const wt = w[o + c]
    if (!(wt > 0)) continue
    const i = idx[o + c]
    const m = (ov && ov(i)) || Array.from({ length: 16 }, (_, k) => M[i * 16 + k])
    const l = sub(p, at(rest, i))
    q[0] += (m[0] * l[0] + m[4] * l[1] + m[8] * l[2] + m[12]) * wt
    q[1] += (m[1] * l[0] + m[5] * l[1] + m[9] * l[2] + m[13]) * wt
    q[2] += (m[2] * l[0] + m[6] * l[1] + m[10] * l[2] + m[14]) * wt
  }
  return q
}

let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})
const layer = (form: string): DressLayer => ({ slot: 'hip', form, wear: 'waist', material: 'cotton', colour: '#888888', colour2: null, pattern: 'plain', source: { guess: 'standstill' } }) as DressLayer

/** The weights of geometry vertex v as "bone w" pairs. */
const weights = (g: Any, v: number) => {
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  const out: string[] = []
  for (let c = 0; c < 4; c++) if (sw.getComponent(v, c) > 0.01) out.push(`${asset.bones[si.getComponent(v, c)]} ${sw.getComponent(v, c).toFixed(2)}`)
  return out.join(' + ')
}

/** The capsules rebuilt as columnRig builds them, each with the drawn vertex that sets its radius. */
function capsuleOwners(person: Any, rest: number[], bottom: number, cfg: Any) {
  const g = person.geometry
  const pos = g.getAttribute('position')
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  const H = person.p.stature
  const out: Array<{ label: string; radius: number; v: number; vy: number; vt: number }> = []
  for (const [bone, tail] of [['thigh.L', 'shin.L'], ['thigh.R', 'shin.R']]) {
    const i = asset.bones.indexOf(bone)
    const a = at(rest, i)
    const b = at(rest, asset.bones.indexOf(tail))
    const ab = sub(b, a)
    const l2 = dot(ab, ab)
    // the slab rule is reverted (r5): without `thighSlab` one capsule per thigh
    const n = cfg.thighSlab ? Math.max(1, Math.round(Math.sqrt(l2) / (cfg.thighSlab * H))) : 1
    const best = Array.from({ length: n }, () => ({ r: -1, v: -1, t: 0 }))
    for (let v = 0; v < pos.count; v++) {
      if (!(pos.getY(v) < bottom)) continue
      let ok = false
      for (let c = 0; c < 4; c++) if (si.getComponent(v, c) === i && sw.getComponent(v, c) > 0.1) ok = true
      if (!ok) continue
      const p: V3 = [pos.getX(v), pos.getY(v), pos.getZ(v)]
      const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2))
      const j = Math.min(n - 1, Math.floor(t * n))
      const r = pointSegment(p, add(a, mul(ab, j / n)), add(a, mul(ab, (j + 1) / n)))
      if (r > best[j].r) best[j] = { r, v, t }
    }
    best.forEach((x, j) => {
      if (x.r >= 0) out.push({ label: `${bone}#${j}/${n}`, radius: x.r, v: x.v, vy: pos.getY(x.v), vt: x.t })
    })
  }
  return out
}

function trace(form: string, sex: string, age: string, slab: boolean, thighMargin?: number): string {
  const L: string[] = []
  const person: Any = gltfPerson(asset, sex as Any, age as Any, 0)
  const driven = drivenFigure(asset, person, [layer(form)])!
  const { skeleton, bones } = createGltfSkeleton(asset, driven.rest)
  const base = VILLAGER_ASSET.drivenGarments.driver
  const cfg: Any = slab ? base : { ...base, thighSlab: 1e9 }
  const rig = columnRig(asset, { ...person, rest: driven.rest, columnAnkles: driven.columnAnkles }, driven.form, cfg)
  // counterfactual (variant C, local to the probe): the thigh capsules with another margin
  const scale0 = person.frame.scale
  const exported = (b: string) => (asset.columns!.capsules[b] ?? 0)
  if (thighMargin !== undefined) for (const cp of rig.capsules) if (asset.bones[cp.bone].startsWith('thigh.')) cp.radius += (thighMargin - exported(asset.bones[cp.bone])) * scale0
  const marginOf = (b: string) => (thighMargin !== undefined && b.startsWith('thigh.') ? thighMargin : exported(b))
  const d: Any = new ColumnDriver(rig)
  const c = clipLayers(asset)
  for (let f = 0; f < 120; f++) {
    stepClipLayers(asset, person, c, 0, 0, { x: 0, z: 0, yaw: 0, unit: 1 }, null, 1 / 60)
    applyClipLayers(asset, person, bones, c, { speed: 0, weight: 0, kneel: 0 }, [true, true])
    d.step(skeleton.bones, 1 / 60)
  }
  const n: number = d.n
  // one more frame, instrumented: the station-only pass result, the repairs and joint searches
  const log: string[] = []
  const fe = d.finalEvaluation.bind(d)
  d.finalEvaluation = () => {
    log.push(`passes ${Array.from(d.cur as Float64Array, (t: number) => (t / DEG).toFixed(1)).join(' ')}`)
    fe()
  }
  const js = d.jointSearch.bind(d)
  d.jointSearch = (s: number) => {
    const before = Array.from(d.cur as Float64Array)
    js(s)
    const moved = before.map((t, i) => (Math.abs(t - d.cur[i]) > 1e-12 ? `${i}:${(t / DEG).toFixed(1)}→${(d.cur[i] / DEG).toFixed(1)}` : '')).filter(Boolean)
    log.push(`jointSearch seg ${s}: ${moved.join(' ')}`)
  }
  const j0 = d.counters.jointSearches
  const r0 = d.counters.repairs
  stepClipLayers(asset, person, c, 0, 0, { x: 0, z: 0, yaw: 0, unit: 1 }, null, 1 / 60)
  applyClipLayers(asset, person, bones, c, { speed: 0, weight: 0, kneel: 0 }, [true, true])
  d.step(skeleton.bones, 1 / 60)
  L.push(`frame 121: repairs ${d.counters.repairs - r0} jointSearches ${d.counters.jointSearches - j0} (over 121 frames: ${d.counters.jointSearches}); ${log.join(' | ')}`)
  const deg = Array.from(d.theta as Float64Array, (t) => (t * 180) / Math.PI)
  L.push(`== ${sex} ${age} ${form} ${slab ? 'A slab' : 'B plain'}${thighMargin !== undefined ? ` C thigh margin ${thighMargin}` : ''}: capsules ${rig.capsules.length}`)
  L.push(`theta upper ${deg.slice(0, n).map((x) => x.toFixed(1)).join(' ')} | lower ${deg.slice(n).map((x) => x.toFixed(1)).join(' ')}`)
  const P: Any = d.posed
  const hipsAt = at(rig.rest, rig.hips)
  const bottom = rig.profile.bottom
  const H = person.p.stature
  const scale = person.frame.scale
  L.push(`bottom ${f4(bottom)} bin ${f4(rig.profile.bin)} bins ${P.profile.bins} H ${f4(H)} scale ${f4(scale)} clearance ${f4(rig.clearance)}`)
  // capsule labels and radius owners
  const owners = capsuleOwners(person, rig.rest, bottom, cfg)
  const capLabel = rig.capsules.map((cp, i) => {
    const name = asset.bones[cp.bone]
    if (!name.startsWith('thigh.')) return { label: name, own: null as null | (typeof owners)[number], i }
    const o = owners.find((x) => x.label.startsWith(name) && Math.abs(x.radius + marginOf(name) * scale - cp.radius) < 1e-9)
    return { label: o?.label ?? `${name}?`, own: o ?? null, i }
  })
  for (const [ci, cp] of rig.capsules.entries()) if (cp.sectors) L.push(`  cap ${asset.bones[cp.bone]} sector radii ${cp.sectors.map(f4).join(' ')} (capsule ${ci})`)
  for (const cl of capLabel) {
    if (!cl.own) continue
    const cp = rig.capsules[cl.i]
    L.push(`  cap ${cl.label} radius ${f4(cp.radius)} (bare ${f4(cl.own.radius)}) set by v${cl.own.v} rest y−bottom ${f4(cl.own.vy - bottom)} t ${cl.own.vt.toFixed(2)} [${weights(person.geometry, cl.own.v)}]`)
  }
  // profile with sample owners per bin
  const pv = rig.pelvis
  const samples: Array<{ a: number; y: number; r: number; k: number }> = []
  for (let k = 0; k < pv.pos.length / 3; k++) samples.push({ ...d.hipsLocal(skin(at(pv.pos, k), pv.idx, pv.w, k * 4, P.M, rig.rest), P.hipsInv, hipsAt), k })
  const prof = P.profile
  const binOwner = new Map<number, number>()
  for (const s of samples) {
    if (s.y < bottom) continue
    const i = prof.column(s.a) * prof.bins + prof.binOf(s.y)
    const o = binOwner.get(i)
    if (o === undefined || s.r > samples[o].r) binOwner.set(i, s.k)
  }
  const pgeo = person.geometry.getAttribute('position')
  const vcache = new Map<number, number>()
  const vertexOf = (k: number) => {
    if (!vcache.has(k)) vcache.set(k, findVertex(k))
    return vcache.get(k)!
  }
  const findVertex = (k: number) => {
    const p = at(pv.pos, k)
    for (let v = 0; v < pgeo.count; v++) if (pgeo.getX(v) === p[0] && pgeo.getY(v) === p[1] && pgeo.getZ(v) === p[2]) return v
    return -1
  }
  const binDesc = (col: number, b: number) => {
    const i = col * prof.bins + b
    const o = binOwner.get(i)
    if (o === undefined) return `k${col}b${b} ${f4(prof.value[i])} (empty, filled)`
    const v = vertexOf(o)
    return `k${col}b${b} ${f4(prof.value[i])} sample ${o} v${v} rest y−bottom ${f4(pv.pos[o * 3 + 1] - bottom)} posed y−bottom ${f4(samples[o].y - bottom)} [${v >= 0 ? weights(person.geometry, v) : '?'}]`
  }
  const queryDesc = (a: number, y: number) => {
    const order = prof.order as Array<{ c: number; k: number }>
    const wrap = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const aw = wrap(a)
    let k0 = 0
    let k1 = 0
    let f = 0
    for (let i = 0; i < order.length; i++) {
      const p = order[i]
      const q = order[(i + 1) % order.length]
      const span = i + 1 < order.length ? q.c - p.c : q.c + 2 * Math.PI - p.c
      const dd = aw >= p.c ? aw - p.c : aw + 2 * Math.PI - p.c
      if (dd <= span + 1e-12) {
        k0 = p.k
        k1 = q.k
        f = span > 0 ? dd / span : 0
        break
      }
    }
    const cc = Math.min(prof.bins - 1, Math.max(0, (y - bottom) / prof.bin - 0.5))
    const b = Math.min(prof.bins - 1, Math.floor(cc))
    const k = f < 0.5 ? k0 : k1
    return `k${k0}/${k1} f ${f.toFixed(2)} binc ${cc.toFixed(2)}; dominant ${binDesc(k, b)}${b + 1 < prof.bins ? ` | ${binDesc(k, b + 1)}` : ''}`
  }
  // the drawn thigh surface toward a cloth point: the farthest drawn vertex of the capsule's bone
  // (weight > 0.1, rest y below the bottom) projecting into the capsule and within 20° of the point's direction
  const gpos = person.geometry.getAttribute('position')
  const gsi = person.geometry.getAttribute('skinIndex')
  const gsw = person.geometry.getAttribute('skinWeight')
  const posedBody = new Map<number, V3>()
  const bodyAt = (v: number) => {
    let q = posedBody.get(v)
    if (!q) {
      const idx = [0, 1, 2, 3].map((c2) => gsi.getComponent(v, c2))
      const w = [0, 1, 2, 3].map((c2) => gsw.getComponent(v, c2))
      posedBody.set(v, (q = skin([gpos.getX(v), gpos.getY(v), gpos.getZ(v)], idx, w, 0, P.M, rig.rest)))
    }
    return q
  }
  const dirRadius = (ci: number, p: V3) => {
    const cp = P.capsules[ci]
    const bone = rig.capsules[ci].bone
    const ab = sub(cp.b, cp.a)
    const l2 = dot(ab, ab)
    const perp = (x: V3) => {
      const t = dot(sub(x, cp.a), ab) / l2
      return { t, v: sub(sub(x, cp.a), mul(ab, t)) }
    }
    const pp = perp(p)
    let best = 0
    let bv = -1
    let cnt = 0
    let all = 0
    let b45 = 0
    for (let v = 0; v < gpos.count; v++) {
      if (!(gpos.getY(v) < bottom)) continue
      let ok = false
      for (let c2 = 0; c2 < 4; c2++) if (gsi.getComponent(v, c2) === bone && gsw.getComponent(v, c2) > 0.1) ok = true
      if (!ok) continue
      const q = perp(bodyAt(v))
      if (q.t < 0 || q.t > 1) continue
      all++
      const cos = dot(q.v, pp.v) / (len(q.v) * len(pp.v) || 1)
      if (cos >= Math.cos(45 * DEG)) b45 = Math.max(b45, len(q.v))
      if (cos < Math.cos(20 * DEG)) continue
      cnt++
      if (len(q.v) > best) {
        best = len(q.v)
        bv = v
      }
    }
    const own = capLabel[ci].own
    const ov = own ? perp(bodyAt(own.v)) : null
    const oang = ov ? (Math.acos(Math.max(-1, Math.min(1, dot(ov.v, pp.v) / (len(ov.v) * len(pp.v) || 1)))) / DEG).toFixed(0) : '-'
    return `radius vertex v${own?.v ?? '-'} at ${oang}° from the point's direction; drawn toward point ${f4(best)} (v${bv}, ${cnt} verts of ${all} in the slab; within 45° ${f4(b45)}${bv >= 0 ? `, rest y−bottom ${f4(gpos.getY(bv) - bottom)} [${weights(person.geometry, bv)}]` : ''}) point ${f4(len(pp.v))} t ${pp.t.toFixed(2)}`
  }
  // offending segments
  const offending = Array.from({ length: 2 * n }, (_, s) => s).filter((s) => Math.abs(deg[s]) > 5)
  for (const s of offending) {
    const k = s % n
    const settled = d.cur[s]
    const sweep: string[] = []
    let first = -1
    for (let x = 0; x <= settled / DEG + 2.01; x += 0.5) {
      const e = d.evaluate(s, x * DEG, d.cur, true)
      const e0 = d.evaluate(s, x * DEG, d.cur, false)
      if (first < 0 && e.worst <= 0) first = x
      if (Math.abs(x % 4) < 1e-9 || Math.abs(x - Math.round(settled / DEG)) < 1.01) sweep.push(`${x}:${f4(e.worst)}/${f4(e0.worst)}/${f4(e.tri)}`)
    }
    L.push(`-- seg ${s} sweep (θ:worst/stationsOnly/tri), first feasible ${first}°: ${sweep.join(' ')}`)
    const probes = [0, Math.max(0, settled - 1 * DEG)]
    if (first > 0 && Math.abs(first - 0.5 - (settled / DEG - 1)) > 0.6) probes.push((first - 0.5) * DEG)
    for (const th of probes) {
      const trial = Float64Array.from(d.cur)
      trial[s] = th
      const ev = d.evaluate(s, th, d.cur, true)
      const evNo = d.evaluate(s, th, d.cur, false)
      L.push(`-- seg ${s} (${s < n ? 'upper' : 'lower'} col ${k}) settled ${(settled / DEG).toFixed(1)}° at θ ${(th / DEG).toFixed(1)}°: worst ${f4(ev.worst)} stationsOnly ${f4(evNo.worst)} tri ${f4(ev.tri)}`)
      // station terms
      const st: V3[] = d.stations(s, th, trial)
      const level = s < n ? 0 : n
      const nb = [level + ((k + n - 1) % n), level + ((k + 1) % n)]
      const nst = nb.map((o) => d.stations(o, trial[o], trial) as V3[])
      const own = d.cloth?.[s]?.at ?? []
      const panel = rig.form!.panel
      st.forEach((p, j) => {
        const chord = Math.max(0, ...nst.filter((o) => o.length).map((o) => len(sub(p, o[j]))))
        const h = d.hipsLocal(p, P.hipsInv, hipsAt)
        const row = own[j] ? panel.row[own[j].v0] : -1
        const terms: string[] = []
        P.capsules.forEach((cp: Any, ci: number) => {
          if (!capsuleActive(cp.ry, P.hy, p, bottom)) return
          // the station's own sector radius, as the driver uses it (r6)
          const C = capsuleRadius(cp, p) + rig.clearance
          const target = Math.sqrt(C * C + (chord / 2) ** 2)
          const dist = pointSegment(p, cp.a, cp.b)
          if (target - dist > -0.01) terms.push(`${capLabel[ci].label} def ${f4(target - dist)} (dist ${f4(dist)} R+C ${f4(C)} chordTarget ${f4(target)}, restH ${f4(restHeight(cp.ry, p) - bottom)} hipsH ${f4(restHeight(P.hy, p) - bottom)}; ${th === 0 ? dirRadius(ci, p) : ''})`)
        })
        if (h.y >= bottom) {
          const q = prof.query(h.a, h.y)
          terms.push(`profile def ${f4(q + rig.clearance - h.r)} (r ${f4(h.r)} Rp ${f4(q)}) ${queryDesc(h.a, h.y)}`)
        }
        L.push(`   st${j} row ${row} y−bottom ${f4(h.y - bottom)} a ${(h.a / DEG).toFixed(1)}° r ${f4(h.r)} chord ${f4(chord)}: ${terms.join(' ; ') || 'none'}`)
      })
      for (const o of nb) L.push(`   neighbour seg ${o} θ ${(trial[o] / DEG).toFixed(1)}° term ${f4((Math.abs(th - trial[o]) - 60 * DEG) * len(s < n ? rig.upperOffset[k] : rig.lowerOffset[k]))}`)
      // triangle hits, as triangleDepth, recorded per hit
      if (s < n) trial[n + k] = d.cur[n + k] + (th - d.cur[s])
      const set = d.carried[s]
      const mats = new Map<number, number[]>()
      for (const kk of set.columns) {
        const m = d.columnMatrices(kk, trial)
        mats.set(rig.upper[kk], m.U)
        mats.set(rig.lower[kk], m.L)
      }
      const vert = (v: number) => skin(at(panel.pos, v), panel.idx, panel.w, v * 4, P.M, rig.rest, (i) => mats.get(i) ?? null)
      const hits: Array<{ env: string; depth: number; desc: string; ci?: number; centre?: V3 }> = []
      for (const t of set.triangles as number[]) {
        const ids = [panel.index[t * 3], panel.index[t * 3 + 1], panel.index[t * 3 + 2]]
        if (ids.every((v) => panel.exempt[v])) continue
        const [a, b, cc] = ids.map(vert)
        const C = Math.max(...ids.map((v) => panel.clearance[v]))
        const centre = mul(add(add(a, b), cc), 1 / 3)
        const rows = ids.map((v) => panel.row[v]).join('')
        P.capsules.forEach((cp: Any, ci: number) => {
          const below = clipActive([a, b, cc], cp.ry, P.hy, bottom)
          if (!below.length) return
          // per clipped piece the largest sector radius over its vertices and centroid, as the driver (r6)
          let dep = -Infinity
          let dist = 0
          let R = 0
          let secs = ''
          for (const [p, q, r] of below) {
            const pts = [p, q, r, mul(add(add(p, q), r), 1 / 3)]
            const Rp = capsuleRadiusOver(cp, pts)
            const dp = segmentTriangle(cp.a, cp.b, p, q, r)
            if (Rp + C - dp > dep) {
              dep = Rp + C - dp
              dist = dp
              R = Rp
              secs = cp.sectors && cp.ref ? pts.map((x) => sectorOf(cp.a, cp.b, cp.ref, cp.sectors.length, x)).join('') : '-'
            }
          }
          if (dep > 0) hits.push({ env: capLabel[ci].label, depth: dep, desc: `tri ${t} rows ${rows} dist ${f4(dist)} R ${f4(R)} sectors ${secs} C ${f4(C)} centreH ${f4(restHeight(P.hy, centre) - bottom)}`, ci, centre })
        })
        const free = ids.map((v) => panel.exempt[v] === 1 || panel.row[v] === 1)
        const bandEdge = free.filter(Boolean).length >= 2
        const pts: Array<[V3, number, boolean, string]> = ids.map((v, j) => [[a, b, cc][j], panel.exempt[v], !free[j], `v${v}`] as [V3, number, boolean, string])
        pts.push([centre, 0, !bandEdge, 'centroid'])
        for (const [p, ex, pr, nm] of pts) {
          if (ex || !pr) continue
          const h = d.hipsLocal(p, P.hipsInv, hipsAt)
          if (h.y < bottom) continue
          const q = prof.query(h.a, h.y)
          const dep = q + C - h.r
          if (dep > 0) hits.push({ env: 'profile', depth: dep, desc: `tri ${t} rows ${rows} ${nm} y−bottom ${f4(h.y - bottom)} a ${(h.a / DEG).toFixed(1)}° r ${f4(h.r)} Rp ${f4(q)} C ${f4(C)}; ${queryDesc(h.a, h.y)}` })
        }
      }
      const byEnv = new Map<string, { n: number; sum: number; max: number }>()
      for (const h of hits) {
        const e = byEnv.get(h.env) ?? { n: 0, sum: 0, max: 0 }
        e.n++
        e.sum += h.depth
        e.max = Math.max(e.max, h.depth)
        byEnv.set(h.env, e)
      }
      L.push(`   tri hits ${hits.length}: ${[...byEnv].map(([e, x]) => `${e} n ${x.n} sum ${f4(x.sum)} max ${f4(x.max)}`).join(' ; ') || 'none'}`)
      for (const h of hits.sort((p, q) => q.depth - p.depth).slice(0, 4)) L.push(`     ${h.env} ${f4(h.depth)} ${h.desc}${th === 0 && h.ci !== undefined ? `; ${dirRadius(h.ci, h.centre!)}` : ''}`)
    }
  }
  return L.join('\n')
}

describe('standstill probe (diagnostic, point 1485 r4)', () => {
  const people = [['male', 'adult'], ['female', 'child'], ['male', 'elder']] as const
  const only = process.env.PROBE_CASE
  for (const form of ['loinFlap', 'girdleTails']) {
    for (const [sex, age] of people) {
      for (const [slab, tag, tm] of [[true, 'A', undefined], [false, 'B', undefined], [true, 'C', 0.004]] as const) {
        const name = `${sex}-${age}-${form}-${tag}`
        it.runIf(!!process.env.PROBE_RUN && (!only || name.includes(only)))(name, () => {
          const text = trace(form, sex, age, slab, tm)
          mkdirSync(OUT, { recursive: true })
          writeFileSync(`${OUT}/${name}.txt`, text)
          expect(text.length).toBeGreaterThan(0)
        }, 600_000)
      }
    }
  }
  it('is a diagnostic probe, off unless PROBE_RUN is set', () => {
    expect(true).toBe(true)
  })
})
