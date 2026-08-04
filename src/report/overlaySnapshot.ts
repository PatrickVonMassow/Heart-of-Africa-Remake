// Overlay snapshot for the F6 bug report (design.md §21.1).
//
// The canvas readback shows the 3-D scene ALONE: every floating map/region
// label is a drei `Html` overlay and the whole status bar, inventory and
// button row are ordinary React — all DOM, none of it in the picture. A
// report carrying only the PNG would therefore have missed a doubled place
// label entirely, which is the defect class this feature exists for.
//
// Rasterising the DOM would cost a dependency, so the overlay is captured as
// DATA instead: every visible text-carrying element with its text and its
// on-screen rectangle. Two entries with the same text at overlapping boxes
// say "duplicated label" outright; a box outside the viewport says "off
// screen"; a missing entry says the label never rendered.
//
// Pure apart from the DOM it is handed: the rectangle and visibility readers
// are injectable, so the assembly is testable without a layout engine.

export interface OverlayRect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayItem {
  /** Element identity: tag plus its classes, e.g. `div.map-label`. */
  kind: string
  /** The element's OWN text (direct text nodes), whitespace-collapsed. */
  text: string
  rect: OverlayRect
  /** True when the rectangle lies fully outside the viewport it was measured
   *  against — a label the player cannot see even though it exists. */
  offScreen?: boolean
}

export interface SnapshotOptions {
  /** On-screen rectangle of an element; defaults to getBoundingClientRect. */
  rectOf?: (el: Element) => OverlayRect
  /** Whether an element renders at all; defaults to a computed-style read.
   *  Returning false skips the whole subtree — a hidden parent hides its
   *  children. */
  visible?: (el: Element) => boolean
  /** Subtree never part of the report: the report modal itself. Other
   *  dialogs and overlays STAY in — a bug can sit in one of those too. */
  skipSelector?: string
  /** Viewport the rectangles are judged against for `offScreen`. */
  viewport?: { width: number; height: number }
  /** Long texts (the journal page, a dialog body) are cut to keep the
   *  archive small; the identity and the rectangle are what diagnoses. */
  maxTextLength?: number
}

/** The report modal itself — it covers the scene and is never its subject.
 *  Everything else the player can see stays in, dialogs included. */
export const DEFAULT_SKIP_SELECTOR = '.state-dump-backdrop'

const DEFAULT_MAX_TEXT = 240

function defaultRectOf(el: Element): OverlayRect {
  const r = el.getBoundingClientRect()
  return { x: round(r.left), y: round(r.top), width: round(r.width), height: round(r.height) }
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}

function defaultVisible(el: Element): boolean {
  const win = el.ownerDocument?.defaultView
  if (!win) return true
  const style = win.getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  // A fully transparent element is invisible to the player, however laid out.
  return style.opacity !== '0'
}

/** The element's own text: direct child text nodes only, so a container is not
 *  reported with the concatenation of everything it wraps. */
function ownText(el: Element): string {
  let text = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) text += node.nodeValue ?? ''
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** `div.map-label.discovered` — enough to name what an entry is. */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const cls = typeof el.className === 'string' ? el.className.trim() : ''
  if (!cls) return tag
  return tag + '.' + cls.split(/\s+/).join('.')
}

function isOffScreen(rect: OverlayRect, viewport: { width: number; height: number }): boolean {
  return rect.x + rect.width <= 0 || rect.y + rect.height <= 0 || rect.x >= viewport.width || rect.y >= viewport.height
}

/**
 * Every visible text-carrying element below `root`, in document order.
 * Degenerate (zero-area) elements are skipped: they carry no picture.
 */
export function snapshotOverlay(root: Element | null, opts: SnapshotOptions = {}): OverlayItem[] {
  if (!root) return []
  const rectOf = opts.rectOf ?? defaultRectOf
  const visible = opts.visible ?? defaultVisible
  const skip = opts.skipSelector ?? DEFAULT_SKIP_SELECTOR
  const maxText = opts.maxTextLength ?? DEFAULT_MAX_TEXT
  const out: OverlayItem[] = []

  const walk = (el: Element): void => {
    if (skip && typeof el.matches === 'function' && el.matches(skip)) return
    if (!visible(el)) return
    const text = ownText(el)
    if (text) {
      const rect = rectOf(el)
      if (rect.width > 0 && rect.height > 0) {
        const item: OverlayItem = {
          kind: describeElement(el),
          text: text.length > maxText ? text.slice(0, maxText) + '…' : text,
          rect,
        }
        if (opts.viewport && isOffScreen(rect, opts.viewport)) item.offScreen = true
        out.push(item)
      }
    }
    for (const child of Array.from(el.children)) walk(child)
  }

  walk(root)
  return out
}

/** Two entries whose text matches and whose rectangles overlap — the
 *  duplicated-label witness a screenshot alone cannot give. */
export function findDuplicateLabels(items: OverlayItem[]): Array<[OverlayItem, OverlayItem]> {
  const pairs: Array<[OverlayItem, OverlayItem]> = []
  for (let i = 0; i < items.length; i++) {
    for (let k = i + 1; k < items.length; k++) {
      if (items[i].text !== items[k].text) continue
      if (rectsOverlap(items[i].rect, items[k].rect)) pairs.push([items[i], items[k]])
    }
  }
  return pairs
}

function rectsOverlap(a: OverlayRect, b: OverlayRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}
