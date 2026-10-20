import { describe, expect, it } from 'vitest'
import { buildShells, cutBodyIndex, faceMasks, regionWords, shellBits, type ShellSet } from './villagerShell'

/** A closed tube (scripts/villager/shells.py `_tube`): vertex (i, j) at angle i / nx, height j. */
function tube(nx: number, ny: number) {
  const vid = (i: number, j: number) => j * nx + (((i % nx) + nx) % nx)
  const index: number[] = []
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p = vid(i, j)
      const q = vid(i + 1, j)
      const r = vid(i + 1, j + 1)
      const s = vid(i, j + 1)
      index.push(p, q, r, p, r, s)
    }
  return { index, vertices: nx * (ny + 1), vid, y: (v: number) => Math.floor(v / nx) }
}

/** Closed boundary loops of a face set, wound as its faces (shells.py `boundary_loops`). */
function loops(index: number[], faces: number[]): number[][] {
  const count = new Map<string, number>()
  const key = (a: number, b: number) => `${Math.min(a, b)}|${Math.max(a, b)}`
  for (const f of faces) for (let e = 0; e < 3; e++) count.set(key(index[f * 3 + e], index[f * 3 + ((e + 1) % 3)]), (count.get(key(index[f * 3 + e], index[f * 3 + ((e + 1) % 3)])) ?? 0) + 1)
  const next = new Map<number, number>()
  for (const f of faces)
    for (let e = 0; e < 3; e++) {
      const p = index[f * 3 + e]
      const q = index[f * 3 + ((e + 1) % 3)]
      if (count.get(key(p, q)) === 1) next.set(p, q)
    }
  const out: number[][] = []
  while (next.size) {
    const start = Math.min(...next.keys())
    const loop = [start]
    let v = next.get(start)!
    next.delete(start)
    while (v !== start) {
      loop.push(v)
      const w = next.get(v)!
      next.delete(v)
      v = w
    }
    out.push(loop)
  }
  return out
}

describe('villager shell garments (render/villagerShell.ts)', () => {
  const nx = 8
  const t = tube(nx, 8)
  // A rank 1 on rows 0..6; B rank 2 nested in it on 2..4; C rank 3 abutting it on 6..8
  const words = new Uint32Array(t.vertices)
  for (let v = 0; v < t.vertices; v++) {
    const y = t.y(v)
    words[v] = (y <= 6 ? 1 : 0) | (y >= 2 && y <= 4 ? 2 : 0) | (y >= 6 ? 4 : 0)
  }
  const fmask = faceMasks(t.index, words)
  const facesOf = (bit: number) => [...fmask.keys()].filter((f) => fmask[f] & (1 << bit))
  const set: ShellSet = {
    step: 0.1,
    bits: ['A', 'B', 'C'],
    garments: Object.fromEntries(
      (
        [
          ['A', 0, 1],
          ['B', 1, 2],
          ['C', 2, 3],
        ] as const
      ).map(([n, bit, rank]) => [n, { bit, rank, base: 0.1, rows: loops(t.index, facesOf(bit)) }]),
    ),
  }
  const quadsOf = (built: ReturnType<typeof buildShells>) => {
    const q = new Map<string, Array<[string, number]>>()
    for (const [n, b] of Object.entries(built)) {
      for (let f = 0; f < b.rim.length; f += 2) {
        if (!b.rim[f]) continue
        const [ah, al, bl] = [b.index[f * 3], b.index[f * 3 + 1], b.index[f * 3 + 2]]
        const e = `${Math.min(b.src[ah], b.src[bl])}|${Math.max(b.src[ah], b.src[bl])}`
        q.set(e, [...(q.get(e) ?? []), [n, Math.round(b.off[al] * 1e6) / 1e6]])
      }
    }
    return q
  }

  it('reads the region words and masks a face by the AND of its corners', () => {
    expect([...regionWords([3, 0, 0, 0, 0xffff, 0x8000, 0, 0])]).toEqual([3, 0x8000ffff])
    expect(fmask[0]).toBe(words[t.index[0]] & words[t.index[1]] & words[t.index[2]])
    expect(shellBits(set, ['A', 'C', 'X'])).toBe(5)
  })

  it('cuts the faces under a higher worn rank, the body under every worn shell', () => {
    const b = buildShells(t.index, t.vertices, fmask, set, ['A', 'B', 'C'], 2, null)
    const faces = (n: string) => [...b[n].rim].filter((r) => !r).length
    expect(faces('A')).toBe(facesOf(0).length - facesOf(1).length)
    expect(faces('B')).toBe(facesOf(1).length)
    expect(faces('C')).toBe(facesOf(2).length)
    expect(cutBodyIndex(t.index, fmask, 7, null).length).toBe(0)
    expect(cutBodyIndex(t.index, fmask, 2, null).length / 3).toBe(fmask.length - facesOf(1).length)
  })

  it('drops one rim strip per seam, owned by the higher side, down to the far surface', () => {
    const b = buildShells(t.index, t.vertices, fmask, set, ['A', 'B', 'C'], 2, null)
    // offsets (base + rank × step) × scale: A 0.4, B 0.6, C 0.8
    expect(Math.max(...b.A.off)).toBeCloseTo(0.4)
    expect(Math.max(...b.C.off)).toBeCloseTo(0.8)
    const q = quadsOf(b)
    const want: Record<number, Array<[string, number]>> = { 0: [['A', 0]], 2: [['B', 0.4]], 4: [['B', 0.4]], 6: [['C', 0.4]], 8: [['C', 0]] }
    for (const [j, w] of Object.entries(want))
      for (let i = 0; i < nx; i++) {
        const a = t.vid(i, +j)
        const c = t.vid(i + 1, +j)
        expect(q.get(`${Math.min(a, c)}|${Math.max(a, c)}`)).toEqual(w)
      }
    expect([...q.values()].reduce((s, v) => s + v.length, 0)).toBe(nx * 5)
    // the strip's inner row coincides with the lower shell's edge vertices
    const onA = new Set([...b.A.src].map((s, k) => `${s}|${b.A.off[k].toFixed(6)}`))
    for (let k = 0; k < b.B.src.length; k++) if (b.B.off[k] > 0 && b.B.off[k] < 0.6 - 1e-6) expect(onA.has(`${b.B.src[k]}|${b.B.off[k].toFixed(6)}`)).toBe(true)
  })

  it('closes a shell alone to the skin, and cuts hidden sources', () => {
    const one = buildShells(t.index, t.vertices, fmask, set, ['A'], 1, null)
    expect([...one.A.rim].filter((r) => r).length).toBe(2 * 2 * nx)
    expect(Math.min(...one.A.off)).toBe(0)
    const hidden = new Uint8Array(t.vertices)
    for (let i = 0; i < nx; i++) hidden[t.vid(i, 0)] = hidden[t.vid(i, 1)] = 1
    const h = buildShells(t.index, t.vertices, fmask, set, ['A'], 1, hidden)
    expect([...h.A.rim].filter((r) => !r).length).toBe(facesOf(0).length - 2 * nx)
    expect([...h.A.rim].filter((r) => r).length).toBe(2 * 2 * nx - 2 * nx)
    expect(cutBodyIndex(t.index, fmask, 0, hidden).length / 3).toBe(fmask.length - 2 * nx)
  })
})
