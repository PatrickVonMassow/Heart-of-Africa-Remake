// Driven garments at run time (render/villagerDriven.ts; stage-3 plan
// sections 3.2, 3.3, 3.9): row 0 from the band's recipe function, the
// clearance increment over worn shells below the junction, the per-form
// column rest heads on the anchors.
import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import type { DrivenRecord, VillagerAsset } from './villagerAsset'
import { anchorPoints, applyClearance, attachRowZero, clearanceAt, clearanceIncrements, drivenFormRig, drivenRecordOf, drivenRestHeads, junctionHeight, type DrivenBody } from './villagerDriven'

/** A ring of n body vertices at height y and radius r round the y axis, normals outward, skinned to bone 3. */
function ringBody(n: number, y: number, r: number, extra: Array<[number, number, number]> = []): THREE.BufferGeometry {
  const p: number[] = []
  const nor: number[] = []
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n
    p.push(r * Math.sin(a), y, r * Math.cos(a))
    nor.push(Math.sin(a), 0, Math.cos(a))
  }
  for (const e of extra) {
    p.push(...e)
    nor.push(0, 0, 1)
  }
  const g = new THREE.BufferGeometry()
  const c = p.length / 3
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(c * 4).map((_, i) => (i % 4 === 0 ? 3 : 0)), 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(c * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4))
  return g
}

const record = (over: Partial<DrivenRecord> = {}): DrivenRecord => ({
  form: 'loinFlap',
  panel: 'g-loinFlap-waist',
  band: 'g-loinFlap-waist.band',
  src: [0, 1, -1, -1],
  row: [0, 0, 1, 2],
  panels: { front: { rows: 2, base: 0, width: 2 } },
  anchors: [[0, 1, 0.5]],
  heads: { basis: [], deltas: {} },
  offset: 0.006,
  ease: 0.004,
  flare: 0.03,
  ...over,
})

function panelGeo(pts: Array<[number, number, number]>): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flat()), 3))
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(pts.length * 4).fill(30), 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(pts.length * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4))
  g.setIndex([0, 2, 3, 0, 3, 1])
  return g
}

describe('driven garments at run time', () => {
  it('finds a driven record by its panel mesh name only', () => {
    const asset = { driven: { loinFlap: record() } } as Pick<VillagerAsset, 'driven'>
    expect(drivenRecordOf(asset, 'g-loinFlap-waist')?.form).toBe('loinFlap')
    expect(drivenRecordOf(asset, 'g-loinFlap-waist.band')).toBeNull()
    expect(drivenRecordOf(asset, 'g-apron-waist')).toBeNull()
  })

  it('writes row 0 from the recipe function with its source skin, scaled', () => {
    const geometry = ringBody(4, 1, 0.2)
    const body: DrivenBody = { geometry, rest: new Float32Array(3), region: null, scale: 2 }
    const panel = panelGeo([[9, 9, 9], [9, 9, 9], [0, 0.8, 0.3], [0, 0.6, 0.3]])
    attachRowZero(panel, record(), body)
    const pos = panel.getAttribute('position')
    // vertex 0: source 0 at (0, 1, 0.2), normal +z, offset 0.006 × 2
    expect(pos.getZ(0)).toBeCloseTo(0.212, 6)
    expect(pos.getY(0)).toBeCloseTo(1, 6)
    // vertex 1: source 1 at (0.2, 1, 0), normal +x
    expect(pos.getX(1)).toBeCloseTo(0.212, 6)
    // the source's skin; rows below keep their own
    expect(panel.getAttribute('skinIndex').getX(0)).toBe(3)
    expect(panel.getAttribute('skinIndex').getX(2)).toBe(30)
    expect(pos.getZ(2)).toBeCloseTo(0.3, 6)
    expect(junctionHeight(record(), body)).toBeCloseTo(1, 6)
  })

  it('opens the panel by the full increment over the beads and not at all without them (worked case C1)', () => {
    // H = 1: hip 0, junction hip + 0.052, beads' top hip + 0.027; ΔS = 12 + 3 − 6 = 9 mm
    const yj = 0.052
    const beads = [{ shell: 'g-waistBeads-waist', delta: 0.009, top: 0.027 }]
    expect(clearanceAt(yj, yj, beads)).toBe(0)
    expect(clearanceAt(0.0267, yj, beads)).toBeCloseTo(0.009, 9)
    expect(clearanceAt(0.0395, yj, beads)).toBeCloseTo(0.0045, 9)
    expect(clearanceAt(-0.1, yj, beads)).toBeCloseTo(0.009, 9)
    expect(clearanceAt(0.0267, yj, [])).toBe(0)
  })

  it('takes the increment from the worn shells below the junction only, never from its own band', () => {
    // body ring at the junction (y 1) and a beads vertex at y 0.9, a collar vertex above at 1.4
    const geometry = ringBody(4, 1, 0.2, [[0, 0.9, 0.2], [0, 1.4, 0.1]])
    const region = new Uint32Array([16, 16, 16, 16, 8, 2])
    const body: DrivenBody = { geometry, rest: new Float32Array(3), region, scale: 2 }
    const shells = {
      step: 0.003,
      bits: [],
      garments: {
        'g-neckBeads-neck': { bit: 1, rank: 1, base: 0.003, rows: [] },
        'g-waistBeads-waist': { bit: 3, rank: 3, base: 0.003, rows: [] },
        'g-loinFlap-waist.band': { bit: 4, rank: 1, base: 0.003, rows: [] },
      },
    }
    const inc = clearanceIncrements({ shells }, record(), ['g-waistBeads-waist', 'g-neckBeads-neck', 'g-loinFlap-waist.band'], body, 1)
    expect(inc).toHaveLength(1)
    expect(inc[0].shell).toBe('g-waistBeads-waist')
    expect(inc[0].delta).toBeCloseTo(0.018, 9)
    expect(inc[0].top).toBeCloseTo(0.9, 6)
    expect(clearanceIncrements({ shells }, record(), ['g-loinFlap-waist.band'], body, 1)).toHaveLength(0)
    // rows ≥ 1 move outward along their radial direction; row 0 never
    const panel = panelGeo([[0, 1, 0.212], [0.212, 1, 0], [0, 0.95, 0.3], [0.3, 0.8, 0]])
    applyClearance(panel, record(), 1, inc, [0, 1.1, 0])
    const pos = panel.getAttribute('position')
    expect(pos.getZ(0)).toBeCloseTo(0.212, 6)
    expect(pos.getZ(2)).toBeCloseTo(0.3 + 0.009, 6)
    expect(pos.getX(3)).toBeCloseTo(0.3 + 0.018, 6)
  })

  it('moves the column rest heads onto the hung anchors and the knee pivots below them', () => {
    const geometry = ringBody(4, 1, 0.2)
    const bones = ['hips', 'col.U.0', 'col.L.0']
    const rest = new Float32Array([0, 1.1, 0, 0, 1, 0.1, 0, 0.5, 0.1])
    const body: DrivenBody = { geometry, rest, region: null, scale: 1 }
    const asset = { bones, columns: { count: 1, segments: 2, angles: [0], bones: { upper: ['col.U.0'], lower: ['col.L.0'] }, capsules: {} } }
    const heads = drivenRestHeads(asset, record(), body)
    const [a] = anchorPoints(record(), body)
    // the anchor: half way between the offset points of sources 0 and 1
    expect(a[0]).toBeCloseTo(0.103, 6)
    expect(a[2]).toBeCloseTo(0.103, 6)
    expect(Array.from(heads.slice(3, 6))).toEqual(Array.from(Float32Array.from(a)))
    expect(heads[6]).toBeCloseTo(a[0], 6)
    expect(heads[7]).toBeCloseTo(0.5, 6)
    expect(heads[8]).toBeCloseTo(a[2], 6)
    // the person's own rest is untouched
    expect(rest[4]).toBe(1)
    // the driver's form data: exempt row 0, the band offset as clearance, the anchors' top
    const panel = panelGeo([[0, 1, 0.206], [0.206, 1, 0], [0, 0.95, 0.3], [0.3, 0.8, 0]])
    const f = drivenFormRig(record(), panel, body)
    expect(f.panel.exempt).toEqual([1, 1, 0, 0])
    expect(f.clearance).toBeCloseTo(0.006, 9)
    expect(f.top).toBeCloseTo(1, 6)
    expect(f.anchors[0].ia[0]).toBe(3)
    expect(f.panel.index).toEqual([0, 2, 3, 0, 3, 1])
  })
})
