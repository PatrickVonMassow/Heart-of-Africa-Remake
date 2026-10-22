// Pure layer of the carrier's PROOF and RECONCILIATION (no user order is ever lost).
//
// WHY. On 21.10.2026 the carrier ticked "queued 1402..1406" while the TASKS.md
// appends existed only in the working tree; the doctor then stashed that tree
// and judged it consistent. Nothing compared a tick against the work order. So:
//   - a request becomes `queued N @<sha> ~<anchor>` only once origin/main holds
//     point N (`<sha>` is the origin/main commit that proved it, `<anchor>` a
//     fingerprint of the point's title at that moment);
//   - `reconcileCarrier` re-checks every queued entry against TASKS.md and the
//     archive — on origin/main, HEAD and the working tree — and anything missing,
//     unpushed or unproven is RED, never "consistent".
// Side-effect free: texts and sha lists go in, data comes out.

/** Every point head in a work-order text: number → normalised title (first wins). */
export function pointHeads(text = '') {
  const heads = new Map()
  const duplicates = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^- \[[ xX]\] (\d+)\.\s*(.*)$/.exec(line)
    if (!m) continue
    const n = Number(m[1])
    if (heads.has(n)) duplicates.push(n)
    else heads.set(n, m[2].trim())
  }
  return { heads, duplicates }
}

/** The union of TASKS.md and the archive as one head map. */
export function unionHeads({ tasks = '', archive = '' } = {}) {
  const open = pointHeads(tasks)
  const closed = pointHeads(archive)
  const heads = new Map(closed.heads)
  for (const [n, t] of open.heads) heads.set(n, t)
  const duplicates = [...open.duplicates, ...closed.duplicates, ...[...open.heads.keys()].filter((n) => closed.heads.has(n))]
  return { heads, duplicates: [...new Set(duplicates)].sort((a, b) => a - b) }
}

/** A title's content anchor: FNV-1a over its letters and digits, 8 hex chars. */
export function titleAnchor(title = '') {
  const norm = String(title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  let h = 0x811c9dc5
  for (const ch of norm) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** The state string of a proven queue tick. */
export function queuedState(point, { sha, anchor } = {}) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`finding: not a point number: ${point}`)
  if (!/^[0-9a-f]{7,40}$/.test(String(sha ?? ''))) throw new Error('finding: a queue tick needs the origin/main sha that proves it')
  if (!/^[0-9a-f]{8}$/.test(String(anchor ?? ''))) throw new Error('finding: a queue tick needs the content anchor of its point')
  return `queued ${n} @${String(sha).slice(0, 12)} ~${anchor}`
}

/**
 * A request state as data. `queued N`, `queued N..M` (legacy ranges are
 * expanded to every member), optionally `@<sha>` and `~<anchor>`; `appending N`
 * is the open state between the TASKS.md append and the push. Returns null for
 * any other state (pending, blocked).
 */
export function parseRequestState(state = '') {
  const m = /^(queued|appending)\s+(\d+)(?:\s*(?:\.\.|–|-)\s*(\d+))?((?:\s+[@~][0-9a-f]+)*)\s*$/.exec(String(state ?? '').trim())
  if (!m) return null
  const from = Number(m[2])
  const to = m[3] ? Number(m[3]) : from
  const points = []
  for (let n = Math.min(from, to); n <= Math.max(from, to) && points.length < 1000; n++) points.push(n)
  const sha = /@([0-9a-f]{7,40})/.exec(m[4] ?? '')?.[1] ?? null
  const anchor = /~([0-9a-f]{8})/.exec(m[4] ?? '')?.[1] ?? null
  return { kind: m[1], points, sha, anchor, range: points.length > 1 }
}

/**
 * Where is point N, if not on origin/main? PURE. Used for the refusal text of
 * `--queued`/`--drained` and for the reconciliation's red reasons.
 */
export function pointLocation(n, { remote, head, working } = {}) {
  if (remote?.heads?.has(n)) return 'origin-main'
  if (head?.heads?.has(n)) return 'unpushed-commit-only'
  if (working?.heads?.has(n)) return 'working-tree-only'
  return 'missing'
}

export const LOCATION_WORDS = Object.freeze({
  'unpushed-commit-only': 'is only in an unpushed local commit',
  'working-tree-only': 'is only in the working tree (uncommitted)',
  missing: 'is in neither TASKS.md nor docs/tasks-archive.md',
})
