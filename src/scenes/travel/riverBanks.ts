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
