// Where the cursor-mode hint stands in the bottom band (design.md §17.1).
//
// The user asked for it CENTRED rather than left-aligned, "as long as the space
// allows" (18.09.2026) — so the fallback is MEASURED from the rendered
// rectangles, never from a breakpoint somebody picked. The hint is positioned
// out of flow, and that is what makes this decision stable: nothing the hint
// does changes any rectangle read here, so no placement can argue itself back
// into the one it just left.

/** The clearance the hint keeps to its neighbours — the bottom row's own gap. */
export const HINT_GAP = 8

export type HintMeasures = {
  /** The bottom row's box in viewport coordinates; its centre is the screen's. */
  row: { left: number; right: number }
  /** Right edge of what stands at the row's left end (the inventory bar). */
  leftEnd: number
  /** Left edge of the row's right-hand button group. */
  rightStart: number
  /** The hint's own natural width; 0 while nothing has been laid out yet. */
  width: number
}

export type HintPlacement =
  /** Centred in the viewport — the placement the user asked for. */
  | { mode: 'centre' }
  /** Yielded to its 1146 place beside the bar; `left` is relative to the row. */
  | { mode: 'beside'; left: number }
  /** Neither fits without overlapping: the band is full. */
  | { mode: 'hidden' }

/**
 * Decide the hint's place from the band's measured rectangles. An unmeasured
 * band (jsdom, the first paint before layout) answers `centre`, which is what
 * the CSS does on its own.
 */
export function planCursorHint(m: HintMeasures | null | undefined): HintPlacement {
  if (!m || m.width <= 0 || m.row.right <= m.row.left) return { mode: 'centre' }
  const centre = (m.row.left + m.row.right) / 2
  // The span the hint may occupy: inside the row, clear of both groups.
  const from = Math.max(m.row.left, m.leftEnd + HINT_GAP)
  const to = Math.min(m.row.right, m.rightStart - HINT_GAP)
  if (centre - m.width / 2 >= from && centre + m.width / 2 <= to) return { mode: 'centre' }
  if (to - from >= m.width) return { mode: 'beside', left: from - m.row.left }
  return { mode: 'hidden' }
}
