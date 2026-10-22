// Pure layer of the ONE-TIME STASH SWEEP (no user order is ever lost, 21.10.2026).
//
// 218+ doctor quarantine stashes had never been audited, and one of them held
// the uncommitted appends of five user orders. The sweep reads every stash —
// keyed by its commit sha, never by an index that shifts — and decides per
// stash whether anything in it is USER CONTENT that origin/main lacks: point
// heads, user quotes and order lines, classified by CONTENT rather than by
// file name. Side-effect free: the IO half (stash-sweep.mjs) hands texts in.
import { titleAnchor, unionHeads } from './carrier-reconcile-core.mjs'

/** Paths whose content is machine state: frames, run records, leases, builds. */
export function isMachinePath(path = '') {
  const p = String(path).replace(/\\/g, '/')
  return (
    /^(verification|local|dist|test-results|playwright-report|node_modules)\//.test(p) ||
    /\.(png|jpe?g|webp|gif|bin|glb|gltf|wav|mp3|ogg|zip)$/i.test(p) ||
    /^\.claude\/(?!queue-rank\.json$)[^/]+\.(json|jsonl|log|lock|pid)$/.test(p) ||
    /^\.claude\/worktrees\//.test(p)
  )
}

/** Text paths whose added lines may carry user orders (checked by content). */
export function isContentPath(path = '') {
  const p = String(path).replace(/\\/g, '/')
  return !isMachinePath(p) && /\.(md|txt|json)$/i.test(p)
}

const norm = (line) => String(line ?? '').replace(/\s+/g, ' ').trim()

/** A line that carries the user's own words or an order (by content, not by file). */
export function isUserLine(line = '') {
  const l = norm(line)
  if (l.length < 12) return false
  return (
    /\b(?:user|Nutzer|operator)\b[^.]{0,20}\d{1,2}\.\d{1,2}\.\d{4}/i.test(l) ||
    /^(?:Source|Quelle|Approved|approved)\s*:/.test(l) ||
    /[»„«“]/.test(l) ||
    /\buser (?:order|decision|request)\b/i.test(l)
  )
}

/** Added lines of a unified diff body (`+` lines, not the `+++` header). */
export function addedLines(diff = '') {
  return String(diff)
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
}

/**
 * Judge one stash. PURE.
 *
 * `files` [{ path, added: [lines], untracked }]; `main` = { heads (unionHeads of
 * origin/main TASKS.md + archive), corpus: Set of normalised lines of every
 * origin/main text consulted }. Returns { disposition, missingPoints,
 * missingQuotes, renumbered, otherLines, machine, code, contentPaths }.
 *
 *   machine-only   frames, records, leases — discardable
 *   redundant      every point and user line is on origin/main (or renumbered there)
 *   user-missing   a point head or user line that origin/main does not hold
 *   other-not-on-main  code or text not on main, but no user content (reported only)
 */
export function judgeStash({ files = [], main } = {}) {
  const heads = main?.heads ?? new Map()
  const corpus = main?.corpus ?? new Set()
  const titlesOnMain = new Map([...heads].map(([n, t]) => [titleAnchor(t), n]))
  const out = { missingPoints: [], missingQuotes: [], renumbered: [], otherLines: 0, machine: 0, code: 0, contentPaths: [] }
  for (const file of files) {
    if (isMachinePath(file.path)) {
      out.machine++
      continue
    }
    if (!isContentPath(file.path)) {
      // The IO half already dropped lines that main's copy of the SAME file holds.
      if ((file.added ?? []).some((l) => norm(l))) out.code++
      continue
    }
    out.contentPaths.push(file.path)
    for (const raw of file.added ?? []) {
      const line = norm(raw)
      if (!line) continue
      const head = /^- \[[ xX]\] (\d+)\.\s*(.*)$/.exec(line)
      if (head) {
        const n = Number(head[1])
        const anchor = titleAnchor(head[2])
        if (heads.has(n) && titleAnchor(heads.get(n)) === anchor) continue
        if (titlesOnMain.has(anchor)) {
          out.renumbered.push({ point: n, now: titlesOnMain.get(anchor), path: file.path })
          continue
        }
        // A tick change of a point main holds under the same title is no loss either.
        out.missingPoints.push({ point: n, title: head[2].slice(0, 120), path: file.path, onMainAs: heads.get(n) ?? null })
        continue
      }
      if (corpus.has(line)) continue
      if (isUserLine(line)) out.missingQuotes.push({ line: line.slice(0, 200), path: file.path })
      else out.otherLines++
    }
  }
  const disposition =
    out.missingPoints.length || out.missingQuotes.length
      ? 'user-missing'
      : out.contentPaths.length === 0 && out.code === 0
        ? 'machine-only'
        : out.otherLines === 0 && out.code === 0
          ? 'redundant'
          : 'other-not-on-main'
  return { disposition, ...out }
}

/** Normalised line set of the texts handed in. PURE. */
export function corpusOf(texts = []) {
  const set = new Set()
  for (const text of texts) for (const line of String(text ?? '').split(/\r?\n/)) {
    const l = norm(line)
    if (l) set.add(l)
  }
  return set
}

export { unionHeads }
