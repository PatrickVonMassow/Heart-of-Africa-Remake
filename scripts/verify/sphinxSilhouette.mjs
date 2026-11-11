// The field Sphinx's picture judgements (work-order point 315), on pixels the
// suite cuts out of a rendered frame (scripts/verify/polish-panorama.mjs,
// sections `giza-skyline` and `sphinx-travel`). Pure, so the rules are
// unit-tested without a browser.

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const sat = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b))

/** Rows of Sphinx pixels a head must occupy before its shape is judged. */
export const HEAD_MIN_ROWS = 15

/**
 * Face-on skyline head, from the per-row widths of the Sphinx's silhouette
 * (crown first, down to the head's foot; 0 where a row holds no Sphinx pixel).
 * Only OCCUPIED rows count: a head is judged only when at least
 * HEAD_MIN_ROWS rows hold it and they are at least 80 % of the span, and the
 * proportions are read on those rows — empty rows never stand in for height
 * or for width.
 */
export function judgeSkylineHead(widths) {
  const occ = widths.filter((w) => w > 0)
  const n = occ.length
  const enough = n >= HEAD_MIN_ROWS && n >= 0.8 * widths.length
  const crownW = occ[1] ?? 0
  const quarterW = n ? occ[Math.round(0.25 * (n - 1))] : 0
  const shoulderW = Math.max(0, ...occ.slice(Math.round(0.7 * n)))
  const flat = enough && crownW > 0 && quarterW > 0 && crownW >= 0.6 * quarterW
  const widens = enough && crownW > 0 && shoulderW >= 1.4 * Math.max(crownW, quarterW)
  return { enough, flat, widens, rows: widths.length, occupied: n, crownW, quarterW, shoulderW }
}

/** Mean luma contrast (0..255) the drawn Sphinx must hold against the ground behind it. */
export const TRAVEL_MIN_CONTRAST = 6

/**
 * Bird's-eye Sphinx, from its mask pixels: per pixel the frame as drawn and
 * the same pixel with the Sphinx hidden (the ground behind). VISIBLE needs
 * at least 150 mask pixels AND a measurable drawn-vs-hidden difference there
 * (mean luma contrast and at least half the pixels changed by 8 or more) — a
 * mask alone proves only where the mesh would be, not that it shows. NO PALE
 * PATCH: under 5 % of its pixels lighter (by 8 %) and greyer (saturation
 * under 85 %) than the ground behind them.
 */
export function judgeTravelSphinx(pixels) {
  const n = pixels.length
  let pale = 0
  let contrast = 0
  let changed = 0
  let lumDrawn = 0
  let lumGround = 0
  for (const { drawn, hidden } of pixels) {
    const ld = lum(drawn)
    const lg = lum(hidden)
    lumDrawn += ld
    lumGround += lg
    contrast += Math.abs(ld - lg)
    if (Math.abs(ld - lg) >= 8) changed++
    if (ld > lg * 1.08 && sat(drawn) < sat(hidden) * 0.85) pale++
  }
  const meanContrast = n ? contrast / n : 0
  const visible = n >= 150 && meanContrast >= TRAVEL_MIN_CONTRAST && changed >= 0.5 * n
  return {
    visible,
    noPale: visible && pale / n < 0.05,
    n,
    pale,
    meanContrast,
    changedShare: n ? changed / n : 0,
    lumDrawn: n ? lumDrawn / n : 0,
    lumGround: n ? lumGround / n : 0,
  }
}
