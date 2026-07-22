// Bank masking at confluences (design.md §11.3; user-reported artifact): a
// river ribbon renders its foam line along both lateral edges — but where a
// tributary runs into another channel, its edges lie INSIDE the joined water
// and painted "bank lines" across the surface. An edge only counts as a real
// bank when the ground just OUTSIDE it is land; edges whose outside probe
// falls into another channel's band (or a distant loop of the own river) are
// interior water and carry no bank treatment. Pure module so the rule is
// unit-testable without three.

export interface BankAxisSample {
  riverId: string
  /** Running index along the river's densified axis. */
  index: number
  lat: number
  lon: number
}

/** How far beyond the ribbon edge the land probe sits, in degrees. */
export const BANK_PROBE_DEG = 0.075
/** Own-axis samples this close (in indexes) never count: the own band always
 *  covers the probe around bends, which would mask every curved bank. */
export const SELF_ARC_EXCLUSION = 12

/** Spatial hash over the axis samples: a linear scan per edge probe made the
 *  ribbon build quadratic (~23 s at scene switch); with ±1-cell lookups it is
 *  back in the tens of milliseconds. The cell must be ≥ the band radius so a
 *  ±1 neighbourhood always covers a query. */
export type BankIndex = Map<string, BankAxisSample[]>
export const BANK_GRID_DEG = 0.25

const cellKey = (lat: number, lon: number) => `${Math.round(lat / BANK_GRID_DEG)},${Math.round(lon / BANK_GRID_DEG)}`

export function buildBankIndex(samples: ReadonlyArray<BankAxisSample>): BankIndex {
  const index: BankIndex = new Map()
  for (const s of samples) {
    const key = cellKey(s.lat, s.lon)
    const cell = index.get(key)
    if (cell) cell.push(s)
    else index.set(key, [s])
  }
  return index
}

// --- Confluence/branch overlap masking (point 233) ---------------------------
// At a junction the two arms used to be drawn as two crossing semi-transparent
// strips: the alpha doubled in the shared region (a dark wedge) and each arm's
// geometric edge ran through the other's water. The junction now reads as ONE
// water body: exactly one arm — the SENIOR one — draws the shared region,
// while the JUNIOR arm's vertices fade out inside the senior's channel band
// (a per-vertex opacity factor, interpolated across the quads, so the
// hand-over is a smooth crossfade rather than a seam).

/** Merge fade edges, as fractions of the channel half-width: fully faded well
 *  inside the senior channel, fully opaque just inside its waterline. */
export const MERGE_FADE_INNER = 0.35
export const MERGE_FADE_OUTER = 0.95

/**
 * Which arm of each junction pair yields (pure, data-driven): a river whose
 * course ENDS on another's band is an arriving tributary, one whose course
 * STARTS on another's band is a distributary branch head — both yield to the
 * river that continues through. Where both rivers carry an indicator (the
 * three Nile arms share the Khartoum point), the later river in data order
 * yields. Pairs with no junction carry no relation — two channels merely
 * passing near each other never fade. Returns "junior|senior" keys.
 */
export function buildJuniorPairs(
  rivers: ReadonlyArray<{ id: string; pts: ReadonlyArray<{ lat: number; lon: number }> }>,
  bandDeg: number,
): Set<string> {
  const minDist = (p: { lat: number; lon: number }, pts: ReadonlyArray<{ lat: number; lon: number }>) => {
    let best = Infinity
    for (const q of pts) best = Math.min(best, Math.hypot(q.lat - p.lat, q.lon - p.lon))
    return best
  }
  const joinsOther = (a: (typeof rivers)[number], b: (typeof rivers)[number]) =>
    minDist(a.pts[a.pts.length - 1], b.pts) < bandDeg || minDist(a.pts[0], b.pts) < bandDeg
  const out = new Set<string>()
  for (let i = 0; i < rivers.length; i++) {
    for (let j = i + 1; j < rivers.length; j++) {
      const a = rivers[i]
      const b = rivers[j]
      const aJoins = joinsOther(a, b)
      const bJoins = joinsOther(b, a)
      if (aJoins && !bJoins) out.add(`${a.id}|${b.id}`)
      else if (bJoins && !aJoins) out.add(`${b.id}|${a.id}`)
      else if (aJoins && bJoins) out.add(`${b.id}|${a.id}`) // tie: later data order yields
    }
  }
  return out
}

const sstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Per-vertex merge opacity factor: 0 deep inside a senior partner's channel
 * band (that arm draws the shared water once), 1 outside every senior band,
 * smooth in between. `juniorPairs` comes from buildJuniorPairs; a river that
 * is senior (or unrelated) at a point always keeps 1.
 */
export function mergeFactorAt(
  lat: number,
  lon: number,
  selfId: string,
  index: BankIndex,
  bandDeg: number,
  juniorPairs: ReadonlySet<string>,
): number {
  const ci = Math.round(lat / BANK_GRID_DEG)
  const cj = Math.round(lon / BANK_GRID_DEG)
  let dmin = Infinity
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const cell = index.get(`${ci + di},${cj + dj}`)
      if (!cell) continue
      for (const s of cell) {
        if (s.riverId === selfId || !juniorPairs.has(`${selfId}|${s.riverId}`)) continue
        const d = Math.hypot(s.lat - lat, s.lon - lon)
        if (d < dmin) dmin = d
      }
    }
  }
  return sstep(bandDeg * MERGE_FADE_INNER, bandDeg * MERGE_FADE_OUTER, dmin)
}

/**
 * True when the probe point just outside a ribbon edge lies inside another
 * channel's water band — the edge is interior to the joined water body.
 */
export function edgeIsInterior(
  probeLat: number,
  probeLon: number,
  selfId: string,
  selfIndex: number,
  index: BankIndex,
  bandDeg: number,
): boolean {
  const ci = Math.round(probeLat / BANK_GRID_DEG)
  const cj = Math.round(probeLon / BANK_GRID_DEG)
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const cell = index.get(`${ci + di},${cj + dj}`)
      if (!cell) continue
      for (const s of cell) {
        if (s.riverId === selfId && Math.abs(s.index - selfIndex) <= SELF_ARC_EXCLUSION) continue
        if (Math.hypot(s.lat - probeLat, s.lon - probeLon) < bandDeg) return true
      }
    }
  }
  return false
}
