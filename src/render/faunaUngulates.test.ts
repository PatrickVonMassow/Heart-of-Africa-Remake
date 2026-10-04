// Detailed ungulates and pelt markings (work-order 1284): the zebra, antelope
// and goat are shaped (not capsules), keep the gait's hip pivots, and every
// ambient species that has an identifying pattern carries it.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  buildAntelope,
  buildAntelopeCalf,
  buildAntelopeParts,
  buildCheetah,
  buildElephant,
  buildGiraffe,
  buildGiraffeParts,
  buildGoat,
  buildGoatParts,
  buildHyena,
  buildLeopard,
  buildWildebeest,
  buildZebra,
  buildZebraCalf,
  buildZebraParts,
  createFaunaMaterial,
  createSilhouetteFaunaMaterial,
  gaitRig,
} from './fauna'
import { FAUNA_MARK_ATTRIBUTE, MARK, MARK_TONES, markAt, SILHOUETTE_PALE, silhouetteMarkScale } from './faunaMarkings'
import { balance } from '../config/balance'
import { sweepTube } from './faunaGeometry'
import { UNGULATE_SPECS, ungulateLayout } from './faunaUngulates'
import { QUALITY_PRESETS } from '../config/quality'

const kinds = (g: THREE.BufferGeometry): Set<number> => {
  const m = g.getAttribute(FAUNA_MARK_ATTRIBUTE)
  const out = new Set<number>()
  for (let i = 0; i < m.count; i++) out.add(m.getX(i))
  return out
}
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('detailed ungulates keep the gait rig (points 228/255/300)', () => {
  const rigs = {
    zebra: [buildZebraParts(), UNGULATE_SPECS.zebra],
    antelope: [buildAntelopeParts(), UNGULATE_SPECS.antelope],
    goat: [buildGoatParts(), UNGULATE_SPECS.goat],
  } as const

  it('hangs every jointed leg on its hip with the foot exactly at the leg length', () => {
    for (const [name, [parts, spec]] of Object.entries(rigs)) {
      const legLen = spec.legH + spec.bodyR * 0.4
      expect(parts.legs, name).toHaveLength(4)
      for (const leg of parts.legs) {
        const b = box(leg.geo)
        expect(b.max.y, name).toBeCloseTo(0, 6)
        expect(b.min.y, name).toBeCloseTo(-legLen, 6)
        expect(leg.hip[1], name).toBeCloseTo(legLen, 6)
      }
      // The same hips as the capsule plan, so the derived cadence is unchanged.
      expect(gaitRig(parts.legs).legLength, name).toBeCloseTo(legLen, 6)
      expect(gaitRig(parts.legs).wheelbase, name).toBeCloseTo(spec.bodyLen * 0.75, 6)
    }
  })

  it('legs are jointed, not rods: muscled top, slim cannon, the hind hock set back', () => {
    for (const [name, [parts]] of Object.entries(rigs)) {
      for (const leg of parts.legs) {
        const pos = leg.geo.attributes.position
        const legLen = -box(leg.geo).min.y
        // Fore-aft depth of the leg in a thin horizontal slice.
        const depthAt = (frac: number) => {
          let lo = Infinity
          let hi = -Infinity
          for (let i = 0; i < pos.count; i++) {
            if (Math.abs(pos.getY(i) + frac * legLen) < legLen * 0.06) {
              lo = Math.min(lo, pos.getZ(i))
              hi = Math.max(hi, pos.getZ(i))
            }
          }
          return { depth: hi - lo, mid: (hi + lo) / 2 }
        }
        const top = depthAt(0.08)
        const cannon = depthAt(0.75)
        expect(top.depth / cannon.depth, name).toBeGreaterThan(2)
        if (leg.hip[2] < 0) {
          // The hock (about 45 % down) sits behind the line hip→foot.
          expect(depthAt(0.47).mid, name).toBeLessThan(depthAt(0.08).mid)
        }
      }
    }
  })
})

describe('detailed ungulates read as their species', () => {
  it('the torso is shaped: the chest is deeper than the waist and the rump', () => {
    for (const [name, spec] of Object.entries(UNGULATE_SPECS)) {
      const { body } = { zebra: buildZebraParts, antelope: buildAntelopeParts, goat: buildGoatParts }[name as 'zebra']()
      const L = ungulateLayout(spec)
      const pos = body.attributes.position
      const depthAt = (z: number) => {
        let lo = Infinity
        let hi = -Infinity
        for (let i = 0; i < pos.count; i++) {
          // Torso only: below the neck root.
          if (Math.abs(pos.getZ(i) - z) < spec.bodyR * 0.08 && pos.getY(i) < L.backY + spec.bodyR) {
            lo = Math.min(lo, pos.getY(i))
            hi = Math.max(hi, pos.getY(i))
          }
        }
        return hi - lo
      }
      expect(depthAt(L.halfL - 0.1 * spec.bodyR), name).toBeGreaterThan(depthAt(0) * 1.05)
    }
  })

  it('the head reaches forward past the chest and carries ears above the poll', () => {
    for (const [name, spec] of Object.entries(UNGULATE_SPECS)) {
      const L = ungulateLayout(spec)
      expect(L.nose.z, name).toBeGreaterThan(L.halfL + spec.bodyR)
      expect(L.nose.y, name).toBeLessThan(L.poll.y) // the face hangs down from the poll
      const b = box(buildUngulateBody(name as keyof typeof UNGULATE_SPECS))
      expect(b.max.y, name).toBeGreaterThan(L.poll.y + spec.headSize * 0.5)
    }
  })

  it('the antelope carries tall horns; its calf drops them', () => {
    const adult = box(buildAntelope())
    const calf = buildAntelopeCalf()
    const L = ungulateLayout(UNGULATE_SPECS.antelope)
    expect(adult.max.y).toBeGreaterThan(L.poll.y + UNGULATE_SPECS.antelope.headSize * 2)
    expect(calf.attributes.position.count).toBeLessThan(buildAntelope().attributes.position.count)
  })

  it('the zebra carries an upright mane along the neck crest', () => {
    const L = ungulateLayout(UNGULATE_SPECS.zebra)
    const pos = buildZebra().attributes.position
    // Something stands proud behind the neck axis between withers and poll.
    const back = new THREE.Vector3(0, Math.sin(UNGULATE_SPECS.zebra.neckTilt), -Math.cos(UNGULATE_SPECS.zebra.neckTilt))
    // How far anything stands behind the neck axis at mid-neck: the neck's own
    // depth there is ~0.5 bodyR, the mane rises well past it.
    let proud = 0
    const p = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(L.neckBase)
      const along = p.dot(L.neckDir)
      if (along > UNGULATE_SPECS.zebra.neckLen * 0.25 && along < UNGULATE_SPECS.zebra.neckLen * 0.7) proud = Math.max(proud, p.dot(back))
    }
    expect(proud).toBeGreaterThan(UNGULATE_SPECS.zebra.bodyR * 0.65)
  })
})

function buildUngulateBody(name: keyof typeof UNGULATE_SPECS): THREE.BufferGeometry {
  return { zebra: buildZebraParts, antelope: buildAntelopeParts, goat: buildGoatParts }[name]().body
}

describe('pelt markings (procedural, no texture asset)', () => {
  it('every fauna build carries the marking attribute the shared material reads', () => {
    for (const g of [buildZebra(), buildAntelope(), buildGoat(), buildGiraffe(), buildElephant(), buildWildebeest(), buildCheetah()]) {
      expect(g.getAttribute(FAUNA_MARK_ATTRIBUTE)?.itemSize).toBe(4)
    }
  })

  it('the zebra is striped on torso, neck, face, mane and legs; the foal too', () => {
    for (const g of [buildZebra(), buildZebraCalf()]) expect(kinds(g).has(MARK.stripes)).toBe(true)
    const parts = buildZebraParts()
    for (const leg of parts.legs) expect([...kinds(leg.geo)]).toEqual([MARK.stripes])
  })

  it('zebra stripes are broad bands that survive a small animal (≤ 10 over the torso)', () => {
    const g = buildZebraParts().body
    const pos = g.attributes.position
    const L = ungulateLayout(UNGULATE_SPECS.zebra)
    // The torso's stripe frequency along its length.
    let freq = 0
    for (let i = 0; i < pos.count; i++) {
      const [k, , , az] = markAt(g, i)
      if (k === MARK.stripes && Math.abs(pos.getY(i) - L.backY) < 0.15 && Math.abs(pos.getZ(i)) < 0.4) freq = Math.max(freq, Math.abs(az))
    }
    const torsoLen = UNGULATE_SPECS.zebra.bodyLen + 1.5 * UNGULATE_SPECS.zebra.bodyR
    expect(freq).toBeGreaterThan(0)
    expect(freq * torsoLen).toBeGreaterThan(5)
    expect(freq * torsoLen).toBeLessThanOrEqual(10)
  })

  it('the gazelle carries a flank band over a pale belly, at its own belly line', () => {
    const g = buildAntelope()
    expect(kinds(g).has(MARK.flank)).toBe(true)
    const L = ungulateLayout(UNGULATE_SPECS.antelope)
    for (let i = 0; i < g.attributes.position.count; i++) {
      const [k, belly] = markAt(g, i)
      if (k !== MARK.flank) continue
      expect(belly).toBeLessThan(L.backY)
      expect(belly).toBeGreaterThan(L.backY - UNGULATE_SPECS.antelope.bodyR)
      break
    }
  })

  it('the unmarked species of the audit now carry their pattern', () => {
    expect(kinds(buildGiraffe()).has(MARK.patches)).toBe(true)
    expect(kinds(buildGiraffe(true)).has(MARK.patches)).toBe(true)
    for (const leg of buildGiraffeParts().legs) expect(kinds(leg.geo).has(MARK.patches)).toBe(true)
    expect(kinds(buildGiraffeParts().body).has(MARK.patches)).toBe(true)
    expect(kinds(buildCheetah()).has(MARK.spots)).toBe(true)
    expect(kinds(buildLeopard()).has(MARK.spots)).toBe(true)
    expect(kinds(buildHyena()).has(MARK.spots)).toBe(true)
    // The goat and elephant carry none.
    expect([...kinds(buildGoat())]).toEqual([MARK.none])
    expect([...kinds(buildElephant())]).toEqual([MARK.none])
  })

  it('the leopard wears rosettes (hollow spots), the cheetah solid spots', () => {
    const hollow = (g: THREE.BufferGeometry) => {
      for (let i = 0; i < g.attributes.position.count; i++) {
        const [k, , , c] = markAt(g, i)
        if (k === MARK.spots) return c
      }
      return -1
    }
    expect(hollow(buildLeopard())).toBeGreaterThan(0)
    expect(hollow(buildCheetah())).toBe(0)
  })

  it('the shared fauna material evaluates the markings in its colour node', () => {
    const m = createFaunaMaterial()
    expect(m.colorNode).toBeTruthy()
    expect(m.vertexColors).toBe(true)
    m.dispose()
  })
})

describe('skyline silhouettes carry the species marking (point 102 haze look)', () => {
  const pw = balance.panoramaWildlife

  it('the silhouette material is the hazed tint with the marking in its colour node, not the vertex coat', () => {
    const tint = new THREE.Color(0.4, 0.38, 0.33)
    const m = createSilhouetteFaunaMaterial(tint, pw.markContrast, pw.markBandScale)
    expect(m.colorNode).toBeTruthy()
    expect(m.vertexColors).toBe(false)
    expect(m.color.equals(tint)).toBe(true)
    m.dispose()
  })

  it('the panorama zebra body and legs are striped, the antelope body flank-banded with its horns kept', () => {
    const zebra = buildZebraParts()
    expect(kinds(zebra.body).has(MARK.stripes)).toBe(true)
    zebra.legs.forEach((l) => expect(kinds(l.geo).has(MARK.stripes)).toBe(true))
    const antelope = buildAntelopeParts()
    expect(kinds(antelope.body).has(MARK.flank)).toBe(true)
    expect(kinds(antelope.body).has(MARK.stripes)).toBe(false)
    expect(kinds(buildGiraffeParts().body).has(MARK.patches)).toBe(true)
  })

  it('a stripe stays clearly darker than the coat after the haze reduction, a pale belly lifts it', () => {
    const stripe = silhouetteMarkScale(MARK_TONES.stripeDark, pw.markContrast)
    expect(stripe).toBeLessThan(0.55) // clearly visible band on the tint
    expect(stripe).toBeGreaterThan(0.1) // never a black hole in the haze
    const flank = silhouetteMarkScale(MARK_TONES.flankDark, pw.markContrast)
    expect(flank).toBeLessThan(0.75)
    const belly = silhouetteMarkScale(SILHOUETTE_PALE, pw.markContrast)
    expect(belly).toBeGreaterThan(1.3)
    expect(belly).toBeLessThanOrEqual(1.8)
    expect(silhouetteMarkScale(1, pw.markContrast)).toBe(1) // unmarked: the flat haze tint
    expect(silhouetteMarkScale(MARK_TONES.stripeDark, 0)).toBe(1)
  })

  it('broadens the bands for the small skyline animal', () => {
    expect(pw.markBandScale).toBeGreaterThan(0.3)
    expect(pw.markBandScale).toBeLessThan(1)
    // The widened flank band stays on the flank: from the belly line to below the back.
    const R = buildAntelopeParts().body
    const m = R.getAttribute(FAUNA_MARK_ATTRIBUTE)
    const pos = R.getAttribute('position')
    let top = -Infinity
    let i0 = -1
    for (let i = 0; i < m.count; i++) {
      if (m.getX(i) !== MARK.flank) continue
      top = Math.max(top, pos.getY(i))
      i0 = i
    }
    const [, belly, band] = markAt(R, i0)
    expect(pw.markFlankWiden).toBeGreaterThan(1)
    expect(belly + band * pw.markFlankWiden).toBeLessThan(top)
  })
})

describe('body tessellation is the detail-level lever', () => {
  it('climbs low < medium < high and the builds follow it', () => {
    const { low, medium, high } = QUALITY_PRESETS
    expect(low.faunaBodySegments).toBeLessThan(medium.faunaBodySegments)
    expect(medium.faunaBodySegments).toBeLessThan(high.faunaBodySegments)
    for (const build of [buildZebra, buildAntelope, buildGoat]) {
      const n = (s: number) => build(s).attributes.position.count
      expect(n(low.faunaBodySegments)).toBeLessThan(n(medium.faunaBodySegments))
      expect(n(medium.faunaBodySegments)).toBeLessThan(n(high.faunaBodySegments))
    }
  })

  it('the default (medium) build costs no more triangles than the capsule build it replaced', () => {
    // Capsule-plan triangle counts measured before the rebuild.
    const before = { zebra: 2960, antelope: 2992, goat: 2992 }
    const tris = (g: THREE.BufferGeometry) => g.index!.count / 3
    expect(tris(buildZebra())).toBeLessThanOrEqual(before.zebra)
    expect(tris(buildAntelope())).toBeLessThanOrEqual(before.antelope)
    expect(tris(buildGoat())).toBeLessThanOrEqual(before.goat)
  })
})

describe('sweepTube', () => {
  it('builds closed, indexed, smooth rings along the stations', () => {
    const g = sweepTube(
      [
        { p: [0, 0, 0], rx: 0.1, ry: 0.2 },
        { p: [0, 0, 1], rx: 0.3, ry: 0.4 },
        { p: [0, 0, 2], rx: 0.1, ry: 0.1 },
      ],
      { radial: 12, rings: 9, capStart: true, capEnd: true },
    )
    expect(g.attributes.position.count).toBe(9 * 12 + 2)
    expect(g.index!.count).toBe(((9 - 1) * 12 * 2 + 2 * 12) * 3)
    const b = box(g)
    expect(b.max.x).toBeCloseTo(0.3, 2) // the middle station's half-width
    expect(b.max.y).toBeCloseTo(0.4, 2)
    expect(b.min.z).toBeLessThan(0) // rounded caps stand past the end stations
    expect(b.max.z).toBeGreaterThan(2)
    // Outward normals: at the widest ring the +X vertex faces +X.
    const n = g.attributes.normal
    const mid = 4 * 12 // ring 4 of 0..8 is the middle station, vertex 0 at +X
    expect(n.getX(mid)).toBeGreaterThan(0.9)
  })
})
