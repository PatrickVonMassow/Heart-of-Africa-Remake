// Shell garments (docs/garment-merge-r9-1347.md, stage 1): cloth that is the
// glTF body's own surface, offset along the body normal over a region of the
// body. The pipeline (scripts/villager/shells.py) cuts the body along every
// region's level sets, writes a 32-bit region word per body vertex (_REGION)
// and per shell its bit, rank, base offset and boundary rows; nothing is
// classified here. A worn shell draws its region's faces at (base + rank ×
// step) × the person's scale, weights, normal and push copied from its source
// vertex; faces under a worn shell of higher rank are cut (the body's too);
// each boundary row drops one rim strip from the shell's offset down to the
// surface across the seam (the skin, or a lower worn shell's offset), and a
// seam whose far side stands as high or higher carries nothing from this side.
//
// Pure: arrays in, arrays out (villagerFigureBody.ts turns them into geometry).

/** The glTF attribute (GLTFLoader lower-cases a custom attribute's name). */
export const REGION_ATTRIBUTE = '_region'

export interface ShellRecipe {
  bit: number
  rank: number
  base: number
  /** Closed boundary loops of body vertex indices, wound as the region's faces. */
  rows: number[][]
}

export interface ShellSet {
  step: number
  /** Shell names in bit order. */
  bits: string[]
  garments: Record<string, ShellRecipe>
}

/** Per vertex the region word from the _REGION attribute (lo, hi, 0, 0). */
export function regionWords(attr: ArrayLike<number>): Uint32Array {
  const n = attr.length / 4
  const out = new Uint32Array(n)
  for (let i = 0; i < n; i++) out[i] = (attr[i * 4] | (attr[i * 4 + 1] << 16)) >>> 0
  return out
}

/** Per face the AND of its corners' words. */
export function faceMasks(index: ArrayLike<number>, words: Uint32Array): Uint32Array {
  const out = new Uint32Array(index.length / 3)
  for (let f = 0; f < out.length; f++) out[f] = (words[index[f * 3]] & words[index[f * 3 + 1]] & words[index[f * 3 + 2]]) >>> 0
  return out
}

/** The worn shells' bits as one word (unknown names skipped). */
export function shellBits(set: ShellSet, worn: readonly string[]): number {
  let b = 0
  for (const n of worn) if (set.garments[n]) b |= 1 << set.garments[n].bit
  return b >>> 0
}

/** Directed edge → face. */
export function edgeFaces(index: ArrayLike<number>, vertices: number): Map<number, number> {
  const out = new Map<number, number>()
  for (let f = 0; f < index.length / 3; f++) {
    for (let e = 0; e < 3; e++) out.set(index[f * 3 + e] * vertices + index[f * 3 + ((e + 1) % 3)], f)
  }
  return out
}

/** The body index without the faces a worn shell covers or the legacy mask hides
 *  (`hidden`: three hidden corners). */
export function cutBodyIndex(index: ArrayLike<number>, fmask: Uint32Array, bits: number, hidden: Uint8Array | null): number[] {
  const out: number[] = []
  const h = (v: number) => !!hidden && v < hidden.length && hidden[v] === 1
  for (let f = 0; f < fmask.length; f++) {
    const a = index[f * 3]
    const b = index[f * 3 + 1]
    const c = index[f * 3 + 2]
    if (fmask[f] & bits) continue
    if (h(a) && h(b) && h(c)) continue
    out.push(a, b, c)
  }
  return out
}

export interface BuiltShell {
  /** Per shell vertex its source body vertex and offset (local units). */
  src: Uint32Array
  off: Float32Array
  index: Uint32Array
  /** Per face: a rim strip quad's triangle. */
  rim: Uint8Array
}

/**
 * Every worn shell (`worn` names of `set`) on a body of `vertices` vertices
 * with triangle `index` and face masks `fmask`, offsets scaled by `scale`;
 * `hidden` (per body vertex, the legacy worn garments' hide) cuts shell faces
 * with three hidden sources and rim quads with two. Vertex order: the drawn
 * faces' sources ascending, then the rims' inner rows in row order — as
 * scripts/villager/shells.py `build` orders them.
 */
export function buildShells(
  index: ArrayLike<number>,
  vertices: number,
  fmask: Uint32Array,
  set: ShellSet,
  worn: readonly string[],
  scale: number,
  hidden: Uint8Array | null,
  ef: Map<number, number> = edgeFaces(index, vertices),
): Record<string, BuiltShell> {
  const names = worn.filter((n) => set.garments[n])
  const g = (n: string) => set.garments[n]
  const off = new Map(names.map((n) => [n, (g(n).base + g(n).rank * set.step) * scale]))
  const above = new Map(names.map((n) => [n, names.reduce((b, o) => (g(o).rank > g(n).rank ? b | (1 << g(o).bit) : b), 0) >>> 0]))
  const drawn = (n: string, f: number) => !!(fmask[f] & (1 << g(n).bit)) && !(fmask[f] & above.get(n)!)
  const hid = (v: number) => !!hidden && v < hidden.length && hidden[v] === 1
  const out: Record<string, BuiltShell> = {}
  for (const n of names) {
    const o = off.get(n)!
    const faces: number[] = []
    for (let f = 0; f < fmask.length; f++) {
      if (!drawn(n, f)) continue
      if (hid(index[f * 3]) && hid(index[f * 3 + 1]) && hid(index[f * 3 + 2])) continue
      faces.push(f)
    }
    const srcSet = new Set<number>()
    for (const f of faces) for (let e = 0; e < 3; e++) srcSet.add(index[f * 3 + e])
    const src = [...srcSet].sort((a, b) => a - b)
    const voff: number[] = src.map(() => o)
    const at = new Map<string, number>()
    src.forEach((s, k) => at.set(`${s}|${o}`, k))
    const vert = (s: number, x: number) => {
      const key = `${s}|${x}`
      let k = at.get(key)
      if (k === undefined) {
        k = src.length
        at.set(key, k)
        src.push(s)
        voff.push(x)
      }
      return k
    }
    const tri: number[] = []
    const rim: number[] = []
    for (const f of faces) {
      tri.push(at.get(`${index[f * 3]}|${o}`)!, at.get(`${index[f * 3 + 1]}|${o}`)!, at.get(`${index[f * 3 + 2]}|${o}`)!)
      rim.push(0)
    }
    for (const loop of g(n).rows) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]
        const b = loop[(i + 1) % loop.length]
        const inner = ef.get(a * vertices + b)
        if (inner === undefined || !drawn(n, inner)) continue
        const across = ef.get(b * vertices + a)
        let far = 0
        if (across !== undefined) {
          let best: string | null = null
          for (const w of names) if (w !== n && drawn(w, across) && (best === null || g(w).rank > g(best).rank)) best = w
          if (best !== null) far = off.get(best)!
        }
        if (far >= o) continue
        if (hid(a) && hid(b)) continue
        const ah = vert(a, o)
        const bh = vert(b, o)
        const al = vert(a, far)
        const bl = vert(b, far)
        tri.push(ah, al, bl, ah, bl, bh)
        rim.push(1, 1)
      }
    }
    out[n] = { src: Uint32Array.from(src), off: Float32Array.from(voff), index: Uint32Array.from(tri), rim: Uint8Array.from(rim) }
  }
  return out
}
