// Pure decision logic of the dashboard-INTEGRITY Stop-hook guard
// (dashboard-integrity-guard.mjs is the thin fail-open I/O wrapper). Kept
// side-effect-free (no fs/git — node:crypto only, deterministic) so the Vitest
// layer can sweep every predicate (scripts/dashboard-integrity-guard-core.test.mjs).
//
// Built 22.07.2026 after a session in which the dashboard was WRONG four times
// and each error was only fixed on the user's prompt. The existing guards check
// the now-card against the DECLARED focus; nothing checked either against the
// ACTUAL work, or a queue card against its (possibly re-specced) TASKS point.
// Three new machine-checkable invariants, each conservative (allow on
// ambiguity — better a missed nag than a false block):
//
//   (A) NOW-CARD ~ ACTUAL WORK — the now-card/declared-focus point must be
//       supported by the git evidence: working-tree edits attributable (via the
//       file paths each TASKS spec names) to the now/focus point, or recent
//       commit subjects naming it. "Card says 215 while every edit is 210 work"
//       blocks; any supporting evidence, or thin/ambiguous evidence, allows.
//   (B) NO STALE QUEUE CARD — a Warteschlange card whose point is closed ([x])
//       in TASKS.md, or does not exist there at all, blocks (the closed half
//       overlaps dashboard-guard invariant 3 on purpose — this guard also runs
//       standalone; the nonexistent half is new).
//   (C) CARD ~ SPEC DRIFT (heuristic) — at --synced time a snapshot records,
//       per queue card, a hash of the card text AND of its TASKS spec block.
//       If a later turn changes the spec while the card text is unchanged, the
//       card is flagged possibly-stale. This is a reminder-to-reconcile, NOT a
//       correctness proof: re-running --synced after an honest review (card
//       still accurate) refreshes the snapshot and clears the flag.
//
// Fail-open is shared: the wrapper allows on any I/O error, and every function
// here is total (never throws, degrades to "no finding") on partial input.
import { createHash } from 'node:crypto'
import { parseQueueCards, parseNowCard } from './queue-order-guard-core.mjs'

// ---- calibratable constants -------------------------------------------------

/**
 * Cap on the commit subjects scanned for explicit point numbers (check A).
 * The wrapper feeds only commits SINCE the last attested --synced review —
 * older commits were already reviewed into the board and must not testify
 * against a legitimate later pivot.
 */
export const RECENT_COMMIT_COUNT = 5

/**
 * Minimum count of DISTINCT working-tree files attributable exclusively to
 * OTHER open points before check A blocks on file evidence alone (an explicit
 * foreign point number in a commit subject blocks at 1). Below this the
 * evidence is treated as ambiguous → allow.
 */
export const FOREIGN_EVIDENCE_MIN = 2

/** File-path prefixes that count as work evidence (docs/dashboard edits do not). */
export const EVIDENCE_PATH_RE = /^(src|scripts)\//

// ---- TASKS parsing ----------------------------------------------------------

/**
 * Per-point spec blocks from TASKS.md: Map<number, {open, deferred, spec}>.
 * A block runs from its `- [ ] N.` / `- [x] N.` line through the indented
 * continuation lines to the next top-level list item / heading / non-indented
 * text. Total: non-string input → empty map.
 */
export function parsePointSpecs(text) {
  const specs = new Map()
  if (typeof text !== 'string') return specs
  let current = null
  for (const line of text.split('\n')) {
    const m = line.match(/^- \[([ x])\] (\d+)\. ?(.*)$/)
    if (m) {
      current = { open: m[1] === ' ', deferred: /\bDEFERRED\b/.test(line), lines: [m[3]] }
      specs.set(Number(m[2]), current)
      continue
    }
    if (line.trim() === '') continue // blank lines never end a block
    if (/^\s+\S/.test(line)) {
      if (current) current.lines.push(line.trim())
    } else {
      current = null // any other top-level content ends the block
    }
  }
  for (const s of specs.values()) {
    s.spec = s.lines.join('\n')
    delete s.lines
  }
  return specs
}

/** Repo-relative file paths a spec text names (src/… and scripts/… only). */
export function filesInSpec(spec) {
  const files = new Set()
  if (typeof spec !== 'string') return files
  for (const m of spec.matchAll(/(?:src|scripts)\/[\w./-]+/g)) {
    const f = m[0].replace(/[./-]+$/, '') // trailing sentence punctuation
    if (EVIDENCE_PATH_RE.test(f) && f.includes('.')) files.add(f)
  }
  return files
}

/** TASKS point numbers (100-299) named in free text, filtered to known points. */
export function pointsFromText(text, knownPoints) {
  const found = new Set()
  if (typeof text !== 'string') return found
  const known = knownPoints instanceof Set ? knownPoints : null
  for (const m of text.matchAll(/\b(1\d\d|2\d\d)\b/g)) {
    const n = Number(m[1])
    if (!known || known.has(n)) found.add(n)
  }
  return found
}

// ---- (A) now-card vs actual work -------------------------------------------

/**
 * Does the git evidence support the now-card / declared focus?
 * Inputs: nowPoint/focusPoint (numbers or null), commitSubjects (recent
 * subject lines), touchedFiles (working-tree paths, any separator), specs
 * (parsePointSpecs output). Returns {ok:true} or
 * {ok:false, foreignPoints:[…], evidence:[…strings]}.
 *
 * Conservative by construction: allows when no point is derivable, when ANY
 * evidence supports the now/focus point (mixed turns), or when the foreign
 * file evidence is below FOREIGN_EVIDENCE_MIN. Only OPEN points count as
 * foreign — commits/edits for a just-closed point never block the pivot away
 * from it. Total: any malformed input → {ok:true}.
 */
export function nowCardMatchesWork(input) {
  try {
    const { nowPoint = null, focusPoint = null, commitSubjects = [], touchedFiles = [], specs } = input ?? {}
    const support = new Set([nowPoint, focusPoint].filter((n) => Number.isInteger(n)))
    if (support.size === 0) return { ok: true } // non-point work — nothing to hold evidence against
    if (!(specs instanceof Map)) return { ok: true }

    const openFiles = new Map() // open point -> Set(spec-named files)
    for (const [n, s] of specs) if (s && s.open) openFiles.set(n, filesInSpec(s.spec))

    let supported = false
    const evidence = []

    // Explicit point numbers in recent commit subjects (rare by convention,
    // strong when present).
    const openSet = new Set(openFiles.keys())
    const foreignCommitPoints = new Set()
    for (const subj of Array.isArray(commitSubjects) ? commitSubjects : []) {
      for (const n of pointsFromText(String(subj), openSet)) {
        if (support.has(n)) supported = true
        else foreignCommitPoints.add(n)
      }
    }
    if (foreignCommitPoints.size) {
      evidence.push(`recent commit subject(s) name open point(s) ${[...foreignCommitPoints].join(', ')}`)
    }

    // Working-tree edits attributed via the file paths each open spec names.
    const foreignFiles = new Map() // file -> owning open points
    for (const raw of Array.isArray(touchedFiles) ? touchedFiles : []) {
      const f = String(raw).replace(/\\/g, '/').trim()
      if (!EVIDENCE_PATH_RE.test(f)) continue
      const owners = [...openFiles].filter(([, files]) => files.has(f)).map(([n]) => n)
      if (owners.length === 0) continue
      if (owners.some((n) => support.has(n))) supported = true
      else foreignFiles.set(f, owners)
    }
    if (foreignFiles.size) {
      evidence.push(
        [...foreignFiles].map(([f, owners]) => `${f} (spec of ${owners.join('/')})`).join(', ') +
          ' edited in the working tree',
      )
    }

    if (supported) return { ok: true }
    if (foreignCommitPoints.size === 0 && foreignFiles.size < FOREIGN_EVIDENCE_MIN) return { ok: true }

    const foreignPoints = [...new Set([...foreignCommitPoints, ...[...foreignFiles.values()].flat()])].sort(
      (a, b) => a - b,
    )
    return { ok: false, foreignPoints, evidence }
  } catch {
    return { ok: true }
  }
}

// ---- (B) stale queue cards --------------------------------------------------

/**
 * Queue cards whose point is closed in TASKS ({closed}) or absent from TASKS
 * entirely ({unknown}). DEFERRED points are open points here — their cards are
 * legitimate. Total: malformed input → both empty.
 */
export function staleQueueCards(queuedPoints, specs) {
  const closed = []
  const unknown = []
  if (!Array.isArray(queuedPoints) || !(specs instanceof Map)) return { closed, unknown }
  for (const p of queuedPoints) {
    const n = Number(p)
    if (!Number.isInteger(n)) continue
    const s = specs.get(n)
    if (!s) unknown.push(n)
    else if (!s.open) closed.push(n)
  }
  return { closed, unknown }
}

// ---- (C) card vs spec drift (heuristic) -------------------------------------

/** Whitespace-normalized short content hash (spec/card snapshot identity). */
export function hashText(text) {
  if (typeof text !== 'string') return null
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)
}

/**
 * The snapshot recorded at --synced time: {point: {spec, card}} hashes for
 * every queue card whose point has a TASKS spec. Stored in
 * dashboard-state.json (integritySnapshots) by dashboard-guard --synced.
 */
export function specSnapshots(tasksText, dashboardHtml) {
  const snaps = {}
  try {
    const specs = parsePointSpecs(tasksText)
    for (const card of parseQueueCards(dashboardHtml)) {
      const s = specs.get(card.point)
      if (s) snaps[card.point] = { spec: hashText(s.spec), card: hashText(card.text) }
    }
  } catch {
    // partial snaps are fine — missing entries are skipped by driftedCards
  }
  return snaps
}

/**
 * Points whose TASKS spec changed since the snapshot while the queue card text
 * did not — the point-223 failure (spec broadened, card still narrow). A card
 * that was edited too counts as reconciled; a missing snapshot (new card, older
 * state file) is skipped. Total: malformed input → [].
 */
export function driftedCards(input) {
  const drifted = []
  try {
    const { cards, specs, snapshots } = input ?? {}
    if (!Array.isArray(cards) || !(specs instanceof Map) || !snapshots || typeof snapshots !== 'object') {
      return drifted
    }
    for (const card of cards) {
      if (!card || !Number.isInteger(Number(card.point))) continue
      const n = Number(card.point)
      const snap = snapshots[n]
      const s = specs.get(n)
      if (!snap || typeof snap.spec !== 'string' || typeof snap.card !== 'string' || !s) continue
      if (hashText(s.spec) !== snap.spec && hashText(card.text) === snap.card) drifted.push(n)
    }
  } catch {
    return []
  }
  return drifted
}

// ---- top-level decision ------------------------------------------------------

const ALLOW = { block: false, reason: '' }

/**
 * Decide on the raw inputs. All optional; any bad shape → allow:
 *   dashboardHtml, tasksMd   the two files' contents
 *   focusPoint               declared focus point (current-focus.json, or null)
 *   commitSubjects           last RECENT_COMMIT_COUNT commit subject lines
 *   touchedFiles             working-tree changed/untracked paths
 *   snapshots                integritySnapshots from dashboard-state.json
 */
export function evaluate(input) {
  try {
    const { dashboardHtml, tasksMd, focusPoint = null, commitSubjects = [], touchedFiles = [], snapshots = null } =
      input ?? {}
    const specs = parsePointSpecs(tasksMd)
    let anyOpen = false
    for (const s of specs.values()) if (s.open) anyOpen = true
    if (!anyOpen) return ALLOW // batch complete — no dashboard duty

    const cards = parseQueueCards(dashboardHtml)
    const nowCard = parseNowCard(dashboardHtml)
    if (!nowCard && cards.length === 0) return ALLOW // no board — dashboard-guard owns registration

    const problems = []

    // (B) stale queue cards
    const { closed, unknown } = staleQueueCards(cards.map((c) => c.point), specs)
    if (closed.length) {
      problems.push(
        `STALE QUEUE CARD(S): point(s) ${closed.join(', ')} are ticked done ([x]) in TASKS.md but still ` +
          'have a Warteschlange card. Move them to Erledigt, republish (dashboard-publish.mjs + Artifact), ' +
          're-run --synced.',
      )
    }
    if (unknown.length) {
      problems.push(
        `UNKNOWN QUEUE CARD(S): point(s) ${unknown.join(', ')} have a Warteschlange card but NO TASKS.md ` +
          'point. Fix the card number or remove the card, republish, re-run --synced.',
      )
    }

    // (A) now-card vs actual work
    const match = nowCardMatchesWork({
      nowPoint: nowCard ? nowCard.point : null,
      focusPoint,
      commitSubjects,
      touchedFiles,
      specs,
    })
    if (!match.ok) {
      problems.push(
        `NOW-CARD CONTRADICTS THE ACTUAL WORK: the now-card/declared focus names point ` +
          `${nowCard && nowCard.point != null ? nowCard.point : focusPoint} but the git evidence points at ` +
          `open point(s) ${match.foreignPoints.join(', ')} — ${match.evidence.join('; ')}. Reconcile NOW: ` +
          'if the work really is on the evidenced point(s), retitle the now-card + re-declare ' +
          '(focus.mjs set) + republish + --synced; if the card is right, commit/clean the unrelated edits ' +
          'so the evidence matches what you are doing.',
      )
    }

    // (C) card vs spec drift (heuristic reminder)
    const drifted = driftedCards({ cards, specs, snapshots })
    if (drifted.length) {
      problems.push(
        `QUEUE CARD(S) POSSIBLY STALE AFTER A SPEC CHANGE: the TASKS.md spec of point(s) ` +
          `${drifted.join(', ')} changed since the last --synced review but the card text did not. ` +
          'Re-read each changed spec and update its card to the CURRENT target state (final state, no ' +
          'iterative phrasing), or — if the card is still accurate — leave it and refresh the snapshot. ' +
          'Either way: republish (dashboard-publish.mjs + Artifact) and re-run --synced (which re-records ' +
          'the snapshots and clears this flag).',
      )
    }

    return problems.length ? { block: true, reason: problems.join(' | ') } : ALLOW
  } catch {
    return ALLOW // total by contract — the wrapper's fail-open must never depend on luck
  }
}
