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

// ═══ The reconciliation ═══════════════════════════════════════════════════════

/** `drained into point N @<sha> ~<anchor>` — a finding's drain proof line. */
const DRAIN_PROOF = /^ {6}drained into point (\d+) @([0-9a-f]{7,40})(?: ~([0-9a-f]{8}))?\s*$/

/** Request heads and finding drain proofs of one carrier text, as claims. PURE. */
export function carrierClaims(text = '', source = '') {
  const claims = []
  const lines = String(text ?? '').split(/\r?\n/)
  let lastHead = null
  for (const line of lines) {
    const m = /^- \[( |x|X)\] (\S+) · (\S+) · (.*)$/.exec(line)
    if (m) {
      lastHead = { at: m[2], title: m[4] }
      const req = /^\[request\] · ([^·]+?) · (.*)$/.exec(m[4])
      if (req) {
        const state = parseRequestState(req[1])
        lastHead.title = req[2]
        if (state) claims.push({ source, at: m[2], title: req[2], ...state, raw: req[1].trim() })
      }
      continue
    }
    const d = DRAIN_PROOF.exec(line)
    if (d && lastHead) {
      claims.push({ source, at: lastHead.at, title: lastHead.title, kind: 'drained', points: [Number(d[1])], sha: d[2], anchor: d[3] ?? null, range: false, raw: line.trim() })
    }
  }
  return claims
}

/** Does `sha` (any abbreviation) name a commit of origin/main? */
function onMain(sha, mainShas) {
  if (!sha) return false
  const list = mainShas instanceof Set ? mainShas : new Set(mainShas ?? [])
  if (list.has(sha) || (sha.length >= 12 && list.has(sha.slice(0, 12)))) return true
  for (const full of list) if (String(full).startsWith(sha)) return true
  return false
}

/**
 * EVERY CLAIM AGAINST THE WORK ORDER. PURE.
 *
 * `carriers` [{ path, text }]; `remote`/`head`/`working` are `unionHeads`
 * results for origin/main, HEAD and the working tree of the MAIN checkout;
 * `mainShas` every origin/main commit; `aliases` an explicit identity map for
 * points that were deliberately deleted, absorbed or renumbered —
 * `{ "<N>": { "status": "deleted" | "absorbed", "why": "…" } | { "renumberedTo": M } }`.
 *
 * A queued (or drain-proven) point is GREEN only when origin/main holds it, the
 * proof sha is an origin/main commit and the content anchor still matches its
 * title. Everything else is RED with its reason; `appending` is OPEN (not red).
 * Returns { ok, red, open, aliased, checked, duplicates }.
 */
export function reconcileCarrier({ carriers = [], remote, head, working, mainShas = [], aliases = {} } = {}) {
  const red = []
  const open = []
  const aliased = []
  let checked = 0
  const empty = { heads: new Map(), duplicates: [] }
  const planes = { remote: remote ?? empty, head: head ?? empty, working: working ?? empty }
  for (const { path, text } of carriers) {
    for (const claim of carrierClaims(text, path)) {
      if (claim.kind === 'appending') {
        open.push({ ...claim, reason: 'appended, not yet proven on origin/main' })
        continue
      }
      for (const original of claim.points) {
        checked++
        const alias = aliases?.[String(original)]
        let n = original
        let anchor = claim.range ? null : claim.anchor
        if (alias && (alias.status === 'deleted' || alias.status === 'absorbed')) {
          aliased.push({ point: original, title: claim.title, status: alias.status, why: alias.why ?? '' })
          continue
        }
        if (alias && Number.isInteger(alias.renumberedTo)) {
          n = alias.renumberedTo
          anchor = null
        }
        const where = pointLocation(n, planes)
        const base = { point: original, title: claim.title, source: claim.source, state: claim.raw }
        if (where !== 'origin-main') {
          red.push({ ...base, reason: where })
          continue
        }
        if (!claim.sha) {
          red.push({ ...base, reason: 'no-proof' })
          continue
        }
        if (!onMain(claim.sha, mainShas)) {
          red.push({ ...base, reason: 'proof-not-on-main' })
          continue
        }
        if (anchor && titleAnchor(planes.remote.heads.get(n)) !== anchor) {
          red.push({ ...base, reason: 'anchor-mismatch' })
        }
      }
    }
  }
  return { ok: red.length === 0, red, open, aliased, checked, duplicates: planes.remote.duplicates ?? [] }
}

const RED_WORDS = Object.freeze({
  ...LOCATION_WORDS,
  'no-proof': 'is ticked without an origin/main proof (legacy tick — run node scripts/carrier-reconcile.mjs --backfill)',
  'proof-not-on-main': 'names a proof commit that origin/main does not contain',
  'anchor-mismatch': 'now names a DIFFERENT point at that number (title anchor differs) — renumbered? record it in docs/carrier-aliases.json',
})

/** The reconciliation as report lines (red first). PURE. */
export function formatReconcile(result) {
  if (!result) return ['carrier reconciliation: NOT RUN']
  const out = []
  if (result.ok) {
    out.push(`carrier reconciliation: GREEN — ${result.checked} ticked point(s) on origin/main, ${result.aliased.length} aliased, ${result.open.length} still appending`)
  } else {
    out.push(`carrier reconciliation: RED — ${result.red.length} of ${result.checked} ticked point(s) are not proven on origin/main`)
    for (const r of result.red.slice(0, 25)) {
      out.push(`  RED point ${r.point} "${String(r.title).slice(0, 80)}" ${RED_WORDS[r.reason] ?? r.reason}`)
    }
    if (result.red.length > 25) out.push(`  … ${result.red.length - 25} more`)
  }
  for (const o of result.open) out.push(`  open: ${o.raw} "${String(o.title).slice(0, 80)}" — commit, push, then --queued`)
  if (result.duplicates.length) out.push(`  note: point number(s) ${result.duplicates.join(', ')} appear more than once in the work order (not lost)`)
  return out
}

/**
 * The line a SESSION START prints. PURE. `outcome` is `runReconcile`'s
 * `{ ran, ok, lines }`; a reconciliation that could not run is RED (fail
 * closed), a green one prints nothing.
 */
export function reconcileHookLine(outcome) {
  if (!outcome || outcome.ran !== true) {
    return (
      'CARRIER RECONCILIATION COULD NOT RUN — treat it as RED: no queued user order is proven to be in the work order ' +
      `(${outcome?.error ?? 'no result'}). Run node scripts/carrier-reconcile.mjs and fix what it names before working.`
    )
  }
  if (outcome.ok) return null
  return `RED FINDING — USER ORDERS MAY BE LOST. ${outcome.lines.join(' | ')} Restore the missing points in TASKS.md (rescue branches, stashes, carrier specs), commit and push main.`
}

/**
 * Points the transition LOSES: in the union of TASKS.md and the archive before,
 * absent after. A tick moves a point between the two files and loses nothing;
 * a stale branch copy or a bad conflict resolution does. PURE.
 */
export function lostPoints({ beforeTasks = '', beforeArchive = '', afterTasks = '', afterArchive = '' } = {}) {
  const before = unionHeads({ tasks: beforeTasks, archive: beforeArchive }).heads
  const after = unionHeads({ tasks: afterTasks, archive: afterArchive }).heads
  return [...before.keys()].filter((n) => !after.has(n)).sort((a, b) => a - b)
}
