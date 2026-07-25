// Swim escapability of a water pocket (design.md §11.2/§11.3, point 316).
//
// A traveller in the water is moved by two things: his own swim speed and the
// river's passive downstream drift. Where the drift is stronger than the swim
// speed he can no longer make progress against it — harmless on an open reach
// (he simply lands on a bank), but a TRAP wherever the water is fenced in by
// impassable open ocean: the current keeps feeding him back into the pocket
// faster than he can swim out of it. That is the reported Nile-mouth softlock.
//
// This module answers the question purely, for any water field: from every
// swimmable cell around a point, does an exit path exist on which the current
// never exceeds the swim speed? It knows nothing about terrain or rivers — the
// caller supplies the samples — so the same sweep runs over the real world in
// the mouth sweep and over hand-built fields in its own unit tests.

/** What the traveller finds at one sampled cell. */
export interface SwimCell {
  /** Impassable (open ocean beyond the swimmable band, design.md §11.2). */
  blocked: boolean
  /** Water: the traveller swims here and the current acts on him. */
  water: boolean
  /** Passive drift at the cell in degrees/second, as the game applies it. */
  driftLat: number
  driftLon: number
}

export interface SwimEscapeOptions {
  /** Lattice spacing in degrees. */
  stepDeg: number
  /** Half-width of the swept window in degrees. */
  radiusDeg: number
  /** The traveller's own swim speed in degrees/second. */
  swimSpeedDeg: number
  /**
   * Net progress a step must still make to count as an exit, in degrees/second.
   * A step that only just breaks even is no escape in practice, so the sweep
   * demands real headroom (default: `ESCAPE_HEADWAY` of the swim speed).
   */
  minNetSpeedDeg?: number
}

export interface SwimEscapeResult {
  /** Swimmable cells examined. */
  swimCells: number
  /** Swimmable cells with no exit path — every one of them is a softlock. */
  trapped: Array<{ lat: number; lon: number }>
}

/**
 * The fraction of his own swim speed a traveller must still make good along an
 * exit for it to count as one. An exit he crawls out of at a tenth of his pace
 * is no exit in play — the reported Nile pocket left him at most ~0.3 of it and
 * read as a softlock — while half speed is the pace of a channel he can plainly
 * work his way out of.
 */
export const ESCAPE_HEADWAY = 0.5

const NEIGHBOURS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * Every swimmable cell around `center` from which NO exit exists.
 *
 * An exit is a chain of steps ending on land (or leaving the swept window),
 * where each step makes real headway: `swimSpeed + drift·direction` must stay
 * at or above `minNetSpeedDeg`. The drift counted for a step is the WORSE of
 * its two endpoints, so a pocket is never declared safe on the strength of a
 * favourable half-step. Blocked cells are never entered — the sweep proves the
 * water is escapable, it never opens a way through the ocean boundary.
 */
export function findSwimTraps(
  center: { lat: number; lon: number },
  sample: (lat: number, lon: number) => SwimCell,
  opts: SwimEscapeOptions,
): SwimEscapeResult {
  const { stepDeg, radiusDeg, swimSpeedDeg } = opts
  const minNet = opts.minNetSpeedDeg ?? swimSpeedDeg * ESCAPE_HEADWAY
  const half = Math.max(1, Math.round(radiusDeg / stepDeg))
  const n = half * 2 + 1
  const cells: SwimCell[] = new Array(n * n)
  const latOf = (row: number) => center.lat + (row - half) * stepDeg
  const lonOf = (col: number) => center.lon + (col - half) * stepDeg
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) cells[r * n + c] = sample(latOf(r), lonOf(c))
  }

  // Seed the escaped set with everything that already IS an exit: passable dry
  // land, and the window's rim (a swimmer who reaches it has left the mouth's
  // pocket — the window is drawn wide enough that no real pocket spans it).
  const escaped = new Uint8Array(n * n)
  const queue: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      const cell = cells[i]
      if (cell.blocked) continue
      const rim = r === 0 || c === 0 || r === n - 1 || c === n - 1
      if (!cell.water || rim) {
        escaped[i] = 1
        queue.push(i)
      }
    }
  }

  // Relax backwards: whoever can step onto an escaped cell has escaped too.
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const r = (i / n) | 0
    const c = i % n
    const to = cells[i]
    for (const [dr, dc] of NEIGHBOURS) {
      const fr = r + dr
      const fc = c + dc
      if (fr < 0 || fc < 0 || fr >= n || fc >= n) continue
      const j = fr * n + fc
      if (escaped[j]) continue
      const from = cells[j]
      if (from.blocked || !from.water) continue
      // Direction of the step, in (lat, lon) degrees like the flow field.
      const uLat = -dr * stepDeg
      const uLon = -dc * stepDeg
      const len = Math.hypot(uLat, uLon) || 1
      const nLat = uLat / len
      const nLon = uLon / len
      const along = Math.min(from.driftLat * nLat + from.driftLon * nLon, to.driftLat * nLat + to.driftLon * nLon)
      if (swimSpeedDeg + along < minNet) continue
      escaped[j] = 1
      queue.push(j)
    }
  }

  const trapped: Array<{ lat: number; lon: number }> = []
  let swimCells = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      if (cells[i].blocked || !cells[i].water) continue
      swimCells++
      if (!escaped[i]) trapped.push({ lat: latOf(r), lon: lonOf(c) })
    }
  }
  return { swimCells, trapped }
}
