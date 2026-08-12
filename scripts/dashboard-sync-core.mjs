// Pure decision logic of the dashboard SYNC Stop-hook guard (dashboard-sync.mjs
// is the thin I/O wrapper). Point 308: the »Woran ich gerade arbeite« card must
// mirror the REAL current state — the checked-out git branch, the worktree agent
// pool and the TASKS.md point state — not merely the DECLARED focus (which
// dashboard-guard already polices). At point 306 the card silently kept
// describing finished work while background work ran; a written rule alone did
// not hold, so this guard detects and BLOCKS that drift mechanically.
//
// READ-ONLY by design: the guard never edits the card, it only decides
// block/allow. Every function here is total — no I/O, no mutation, no throw on
// malformed input — so the Vitest layer can sweep every decision path and the
// wrapper's fail-open guarantee (any unreadable state → allow) rests on a core
// that cannot blow up either.
//
// Reality signals (gathered by the wrapper, all optional):
//   headBranch     the primary checkout's branch (git symbolic-ref); a point
//                  branch feat/<N>-… means the session is DRIVING point N.
//   agentBranches  branches of the OTHER git worktrees. Each worktree-isolated
//                  Fable agent works on its own feat/<N>-… branch, so the
//                  worktree pool IS the observable agent pool
//                  (.claude/batch-lock.json only names the owning session and
//                  holds no per-task ids). Lingering post-merge worktrees make
//                  this signal LENIENT (extra matches), never falsely blocking.
//   open / done    TASKS.md point numbers (`- [ ] N.` / `- [x] N.`; the repo
//                  has no in-progress marker — "current" is read from git, not
//                  from TASKS.md).
// The remedy's publish steps come from scripts/board-remedy.mjs — one copy.
import { REPUBLISH } from './board-remedy.mjs'

/** Leading point number of a work branch (`feat/306-cleanup` → 306), else null.
 *  Only NUMBERED slugs count: `main`, `chore/closing-cleanup` and the
 *  auto-created `worktree-agent-…` branches carry no point. */
export function branchPoint(branch) {
  if (typeof branch !== 'string') return null
  const m = branch.match(/^[a-z]+\/(\d{1,4})-/i)
  return m ? Number(m[1]) : null
}

/** Branch short-names out of `git worktree list --porcelain`, one per worktree
 *  that has a branch (detached worktrees contribute nothing), in list order —
 *  the FIRST entry is the primary checkout. Empty array on malformed input. */
export function parseWorktreeBranches(porcelain) {
  const branches = []
  if (typeof porcelain !== 'string') return branches
  for (const m of porcelain.matchAll(/^branch refs\/heads\/(.+)$/gm)) branches.push(m[1].trim())
  return branches
}

/** Open/done TASKS point numbers; skips DEFERRED lines like dashboard-guard. */
export function parseTasksPoints(text) {
  const open = []
  const done = []
  if (typeof text !== 'string') return { open, done }
  for (const l of text.split('\n')) {
    let m = l.match(/^- \[ \] (\d+)\./)
    if (m && !/\bDEFERRED\b/.test(l)) open.push(Number(m[1]))
    m = l.match(/^- \[x\] (\d+)\./)
    if (m) done.push(Number(m[1]))
  }
  return { open, done }
}

// A point reference at the START of a title: a 1-4 digit number that is not the
// head of a clock time (`22:29`), a version (`0.2`) or a word (`3D`).
const POINT_HEAD = /^(\d{1,4})(?![\w%.]|:\d)/
// What may join two numbers into ONE list of point references.
const POINT_LIST_SEP = /^\s*(?:[+/,&]|und)\s*/

/**
 * Collect the run of point references a title OPENS with — `307`, `316/319`,
 * `121, 130 und 146`, `306 + 308` — stopping at the first token that is not a
 * number joined by a list separator.
 *
 * Deliberately NOT "every number in the string": a card title is prose, and its
 * prose carries numbers that mean nothing of the sort. Reading them as point
 * references made this guard call the CURRENT card »337: Ladebild steht ~15
 * Sekunden still« stale, because it took the 15 for point 15 and found that one
 * ticked done (25.07.2026). A guard that accuses correct work of being wrong
 * costs exactly what a guard that stays silent costs.
 */
function leadingPointRun(text) {
  const out = []
  const first = text.match(POINT_HEAD)
  if (!first) return out
  out.push(Number(first[1]))
  let rest = text.slice(first[0].length)
  for (;;) {
    const sep = rest.match(POINT_LIST_SEP)
    if (!sep) break
    const after = rest.slice(sep[0].length)
    const num = after.match(POINT_HEAD)
    if (!num) break
    const n = Number(num[1])
    if (!out.includes(n)) out.push(n)
    rest = after.slice(num[0].length)
  }
  return out
}

/**
 * Parse one now-card title string into its point references and free-text
 * label. `point` is the LEADING number (`306 — Closing…` → 306, null for a
 * label-only card like `Closing-Aufräum + Fable`); `points` is the leading RUN
 * of point references (see leadingPointRun), so a combined card may name
 * several while numbers inside the prose are ignored.
 */
export function parseCardTitle(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const points = leadingPointRun(trimmed)
  return {
    raw: trimmed,
    point: points.length ? points[0] : null,
    points,
    label: trimmed.replace(/^\d{1,4}\s*[—–:-]*\s*/, ''),
  }
}

/**
 * All `.now` card titles of the »Woran ich gerade arbeite« section, parsed, in
 * document order. Bounded to the now SECTION (up to the next <h2>) exactly like
 * dashboard-guard's parser, so numbered cards in »Von dir zu klären« or the
 * Warteschlange are never mistaken for now-cards. Empty array on non-string
 * input or a missing section.
 */
export function nowCardTitles(html) {
  if (typeof html !== 'string') return []
  const nowStart = html.indexOf('Woran ich gerade arbeite')
  if (nowStart < 0) return []
  const nextH2 = html.indexOf('<h2>', nowStart + 1)
  const section = html.slice(nowStart, nextH2 < 0 ? undefined : nextH2)
  const titles = []
  // PER CARD, not per title span (point 655): a now-card carries its point in
  // the numbered CHIP now, so the number and the label live in two spans. They
  // are re-joined in the notation `parseCardTitle` reads, which keeps every
  // caller — and every card written before the chip existed — working unchanged.
  for (const chunk of section.split(/<details\b/).slice(1)) {
    const t = chunk.match(/class="t">([^<]*)</)
    if (!t) continue
    const num = chunk.match(/class="num">\s*(\d+)/)
    const parsed = parseCardTitle(num ? `${num[1]} — ${t[1].trim()}` : t[1])
    if (parsed && parsed.raw) titles.push(parsed)
  }
  return titles
}

/** The FIRST now-card title, parsed, or null — the prompt-level single-card
 *  view; the guard invariants themselves sweep ALL cards via nowCardTitles. */
export function cardTitle(html) {
  const [first] = nowCardTitles(html)
  return first ?? null
}

/** Normalized comparison tokens of a card label: lowercased, umlauts folded,
 *  split on non-alphanumerics, short fragments dropped. */
export function labelTokens(label) {
  if (typeof label !== 'string') return []
  return label
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
}

/** Loose free-text match: any label token appears in the branch slug
 *  (»Closing-Aufräum« ↔ `chore/closing-cleanup`). */
export function branchMatchesLabel(branch, label) {
  if (typeof branch !== 'string') return false
  const b = branch.toLowerCase()
  return labelTokens(label).some((t) => b.includes(t))
}

/** Does the card TITLE claim delegated agent work (»Fable Point 308«,
 *  »Agent läuft«)? Such a claim is checkable against the worktree pool. */
export function claimsAgents(raw) {
  return typeof raw === 'string' && /\b(agents?|fable|subagents?)\b/i.test(raw)
}

/**
 * Per-card corroboration: does at least one LIVE git signal back this card?
 *   - a card point matched by the primary checkout's branch or an agent branch
 *   - a label token appearing in the head or an agent branch slug
 *   - an agent-work claim while the worktree agent pool is non-empty
 * The card's declared point being merely OPEN in TASKS.md is deliberately NOT a
 * match here — `main` as HEAD confirms nothing (the prompt's »card 306, HEAD
 * main → no match«); evaluate() decides separately which unmatched cards are
 * harmless and which are drift.
 */
export function matches(card, state) {
  const c = typeof card === 'string' ? parseCardTitle(card) : card
  if (!c || typeof c !== 'object') return false
  const { headBranch = '', agentBranches = [] } = state ?? {}
  const agents = Array.isArray(agentBranches) ? agentBranches : []
  const branches = [headBranch, ...agents].filter((b) => typeof b === 'string' && b)
  const points = Array.isArray(c.points) ? c.points : []
  if (points.length && branches.some((b) => points.includes(branchPoint(b)))) return true
  if (branches.some((b) => branchMatchesLabel(b, c.label ?? c.raw))) return true
  if (claimsAgents(c.raw) && agents.length > 0) return true
  return false
}

/**
 * THE DRIFT CATALOGUE — what this guard actually catches, as data (point 308's
 * last deliverable). It is a TABLE and not a paragraph in a document for the
 * reason this whole file exists: prose about a mechanism ages away from the
 * mechanism. `evaluate` stamps the id it fired on into its verdict, and a test
 * pins the two directions — every id here is producible, and no block path
 * produces an id that is not here. `node scripts/dashboard-sync.mjs --drifts`
 * prints it.
 */
export const DRIFTS = Object.freeze([
  Object.freeze({
    id: 'no-card',
    detects: 'the board shows NO current work while the work order still has open points',
    example: '»Woran ich gerade arbeite« is empty while 308 and 411 are open',
  }),
  Object.freeze({
    id: 'head-drift',
    detects: 'the working tree is on a point branch that no now-card names',
    example: 'the card says »306« but HEAD is on »feat/224-workflow«',
  }),
  Object.freeze({
    id: 'unknown-point',
    detects: 'a now-card names a point that exists neither in the work order nor on any branch',
    example: 'a card »999 — Phantom« survives a typo or a renumbering',
  }),
  Object.freeze({
    id: 'stale-done',
    detects: 'every point a now-card names is ticked done and no branch still works one',
    example: 'the »306« card still stands after 306 was merged and its branch pruned',
  }),
  Object.freeze({
    id: 'agent-claim',
    detects: 'a card claims running delegated work while no agent worktree exists and HEAD is on no work branch',
    example: '»Fable-Verifikationen + Agent-Pool« with an empty pool',
  }),
])

/** The catalogue as a readable report — the `--drifts` output. PURE. */
export function formatDriftReport(drifts = DRIFTS) {
  const list = Array.isArray(drifts) ? drifts : []
  const lines = [
    'dashboard-sync: the drifts this guard BLOCKS a turn end on (read-only — it never edits the card).',
    '',
  ]
  for (const d of list) {
    lines.push(`  [${d?.id}] ${d?.detects}`)
    lines.push(`      e.g. ${d?.example}`)
  }
  lines.push('')
  lines.push('Signals it reads: the HEAD branch, the branches of the other git worktrees (the agent pool),')
  lines.push('the work order ticks, and the now-card titles. Anything unreadable ALLOWS the stop.')
  return lines.join('\n')
}

const block = (reason, drift) => ({ block: true, reason, drift })
const ALLOW = Object.freeze({ block: false, reason: '', drift: null })

const FIX = ` Fix the CARD (rewrite it to the real current work, then ${REPUBLISH}) — this guard never edits it for you.`

/**
 * Decide whether the turn may end. Input (all optional — FAIL-OPEN: whatever
 * cannot be read must never block):
 *   cards   parsed now-card titles (nowCardTitles output); null/undefined when
 *           the dashboard HTML was unreadable
 *   state   { headBranch, agentBranches, open, done, tasksReadable }
 *   paused  .claude/batch-paused exists → no dashboard duty at all
 * Returns { block, reason }.
 */
export function evaluate(input) {
  const { cards = null, state = null, paused = false } = input ?? {}
  if (paused) return ALLOW
  if (!state || typeof state !== 'object') return ALLOW // state unreadable → fail-open
  if (!Array.isArray(cards)) return ALLOW // dashboard unreadable → fail-open

  const headBranch = typeof state.headBranch === 'string' ? state.headBranch : ''
  const agents = Array.isArray(state.agentBranches) ? state.agentBranches : []
  const open = Array.isArray(state.open) ? state.open : []
  const done = Array.isArray(state.done) ? state.done : []
  const tasksReadable = state.tasksReadable !== false && open.length + done.length > 0

  // (1) A live batch (open points) must SHOW its current work — no now-card at
  // all is the maximal drift.
  if (cards.length === 0) {
    if (tasksReadable && open.length > 0) {
      return block(
        'DASHBOARD SYNC: no »Woran ich gerade arbeite« card found while TASKS.md still has open ' +
          `point(s) ${open.slice(0, 6).join(', ')}${open.length > 6 ? ', …' : ''}.` +
          FIX,
        'no-card',
      )
    }
    return ALLOW
  }

  const st = { headBranch, agentBranches: agents }
  const allCardPoints = new Set(cards.flatMap((c) => (Array.isArray(c.points) ? c.points : [])))
  const branchPoints = new Set([headBranch, ...agents].map(branchPoint).filter((n) => n != null))

  // (2) HEAD DRIFT — the session drives point P on a feat/P-… branch, but no
  // now-card names P (nor free-text-matches the branch). The card set lags the
  // real work: the exact class of the point-306 slip, read from git.
  const headPoint = branchPoint(headBranch)
  if (
    headPoint != null &&
    !allCardPoints.has(headPoint) &&
    !cards.some((c) => branchMatchesLabel(headBranch, c.label ?? c.raw))
  ) {
    return block(
      `DASHBOARD SYNC: HEAD is on ${headBranch} (point ${headPoint}) but no now-card names point ` +
        `${headPoint} — the card(s) say ${cards.map((c) => `»${c.raw}«`).join(', ')}.` +
        FIX,
      'head-drift',
    )
  }

  for (const c of cards) {
    if (matches(c, st)) continue // corroborated by a live branch/agent signal
    const points = Array.isArray(c.points) ? c.points : []

    if (points.length && tasksReadable) {
      // (3) UNKNOWN POINT — the card names a point TASKS.md has never seen and
      // no branch carries: a typo'd or imaginary card.
      const unknown = points.filter(
        (n) => !open.includes(n) && !done.includes(n) && !branchPoints.has(n),
      )
      if (unknown.length) {
        return block(
          `DASHBOARD SYNC: now-card »${c.raw}« names point(s) ${unknown.join(', ')} that exist ` +
            'neither in TASKS.md nor on any branch.' +
            FIX,
          'unknown-point',
        )
      }

      // (4) STALE DONE — every point the card names is ticked done and no
      // branch/worktree still carries one: the card describes FINISHED work
      // (the point-306 failure once the merged branch is cleaned up).
      if (points.every((n) => done.includes(n))) {
        return block(
          `DASHBOARD SYNC: now-card »${c.raw}« only names point(s) ${points.join(', ')} that are ` +
            'ALL ticked done in TASKS.md, and no branch still works them — the card is stale.' +
            FIX,
          'stale-done',
        )
      }
    }

    // (5) AGENT CLAIM — a label card claiming delegated agent/Fable work while
    // the worktree agent pool is EMPTY and the session sits on main: nothing is
    // running that the card talks about.
    if (!points.length && claimsAgents(c.raw) && agents.length === 0 && headPoint == null) {
      return block(
        `DASHBOARD SYNC: now-card »${c.raw}« claims running agent work, but the worktree agent ` +
          'pool is empty and HEAD is not on a work branch.' +
          FIX,
        'agent-claim',
      )
    }

    // An unmatched card with open points (or an unverifiable free-text label)
    // is NOT blocked: HEAD on main proves nothing while agents may be between
    // steps — precision over recall, per the fail-open constraint.
  }

  return ALLOW
}
