// Pure decision core of the BOARD-FIRST gate (board-first-guard.mjs is the thin
// fail-open I/O wrapper). Side-effect free, so the Vitest layer can sweep every
// rule without a filesystem (scripts/board-first-core.test.mjs).
//
// WHY THIS EXISTS (user 27.07.2026, retrospective §3.32): every board enforcer —
// dashboard-guard, dashboard-integrity-guard, dashboard-conciseness-guard,
// dashboard-card-topic-guard and the focus review — is a STOP hook. They all
// fire when the turn ENDS, so they guarantee the board is honest by the time the
// work is over and say NOTHING about the hour in between. That hour is exactly
// when the user reads the board: the now-card still read "Pausiert —
// Wochenkontingent erschöpft" while a review agent and a branch cleanup were
// already running, and the user had to point it out twice. The gap is
// structural, not a lapse of discipline, so it gets a mechanism.
//
// THE RULE: the FIRST state-changing tool call of a turn is DENIED while the
// board does not yet describe the work that is starting. "Describes it" is not
// judged from prose — the gate reads two already-recorded facts:
//   (i)  a `focus set|confirm` stamped AFTER this turn's `turnStartedAt`, and
//   (ii) the published board content equal to the repo file's content
//        (the invariant dashboard-publish already maintains).
//
// THE ESCAPE PATH IS PART OF THE DESIGN. A gate that can trap the session is
// worse than the staleness it fixes (a block-loop cost ~30 turns on point 278),
// so the gate:
//   - never denies a READ of any kind,
//   - never denies the very commands that satisfy it (focus.mjs,
//     dashboard-publish.mjs, dashboard-guard.mjs, an edit of the board file),
//   - denies AT MOST ONCE per turn — after it has fired it stands down, so a
//     session that ignores it can still work; the Stop chain still catches the
//     end state,
//   - and is fail-OPEN in the wrapper: any internal error allows the call.
//
// THE THIRD CONDITION (point 400, delta B): a publish is DUE. The open-point set
// changed since the board was last published, so the reader is looking at a
// board that is missing work — the 25-minute window of 28.07.2026. The mark is
// written by the PostToolUse heartbeat (delta A) and read here.
//
// It may only ESCALATE to a deny where a publish is actually POSSIBLE. Denying
// a session a publish it cannot perform would spin it against a gate it can
// never satisfy, and a blocked turn produces nothing. `publishCapability`
// (board-currency-core) is that question; since the delta-D transport is a
// SCRIPT, the answer is yes for every session, headless included.

import { isPublishDue } from './board-currency-core.mjs'
import { CLOSING_CARD_CMD, NONE_CARD_CMD, NOW_CARD_CMD, PUBLISH_CMD, SYNCED_CMD } from './board-remedy.mjs'
import { claimsNoCurrentWork } from './board-core.mjs'
import { handoverSurvivesCall } from './batch-boundary-core.mjs'
import { parseSegments, segmentInvokesScript, isMutatingSegment, shellSegments } from './command-classify-core.mjs'

// The command classifier is SHARED with the fence chokepoint (point 473): both
// gates judge a shell call the same way — per segment, on the command HEAD, with
// quoted text deciding nothing. Re-exported so the gate's own callers and tests
// keep one import.
export { shellSegments, isMutatingSegment }

/**
 * Is this checkout a delegated agent's isolated worktree? (point 440)
 *
 * WHY THE GATE ASKS. A subagent inherits the parent's session id, so the
 * ownership stand-down cannot tell it apart — the deny used to admit exactly
 * that and tell the agent to repeat the call. Measured, that is 1058 characters
 * of block text plus one thrown-away tool call for EVERY delegated agent, spent
 * on a duty the agent is forbidden to discharge: CLAUDE.md §6 keeps the board
 * with the main session, and a worktree agent must not publish it.
 *
 * The CHECKOUT PATH is the signal the session id cannot give. Worktrees are
 * created under `.claude/worktrees/<agent>` (scripts/worktree-cleanup.mjs), and
 * the main session — the only session with a board duty — always works in the
 * main tree. Separator-agnostic, so a Windows path reads the same.
 */
export function isWorktreeCheckout(path) {
  return /[/\\]\.claude[/\\]worktrees[/\\]/.test(String(path ?? ''))
}

/** Tools that change state by their nature — no command inspection needed. */
export const MUTATING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Agent'])

/** Tools whose payload is a shell command; mutation depends on the command. */
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

/**
 * The scripts that SATISFY the gate. A command consisting only of these is
 * always allowed, whatever the board state — otherwise the gate would forbid
 * its own remedy.
 */
export const ESCAPE_SCRIPTS = [
  'focus.mjs',
  'dashboard-publish.mjs',
  'dashboard-guard.mjs',
  'dashboard-sync.mjs',
  'board-archive-rotate.mjs',
  'board-first-guard.mjs',
  'guard-preflight.mjs',
  // The one-command board loop, the generator that rebuilds the queue from the
  // work order, and the transport that publishes it. All three are remedies for
  // the publish-due deny below; a gate that blocks its own way out is worse than
  // the staleness it fixes.
  'board.mjs',
  'board-queue.mjs',
  'board-publish.mjs',
]

/** Board files an Edit/Write may always touch (suffix match on the path). */
export const BOARD_FILE_HINTS = ['.batch-dashboard.html', 'hoa-batch-dashboard.html']

/** Does this single segment invoke one of the gate's own remedy scripts? */
export function isEscapeSegment(segment) {
  return segmentInvokesScript(segment, ESCAPE_SCRIPTS)
}

/** Is this Edit/Write aimed at the board file itself? (Always permitted.) */
export function isBoardFile(filePath, boardPaths = []) {
  const p = String(filePath ?? '').replace(/\\/g, '/')
  if (!p) return false
  const known = [...BOARD_FILE_HINTS, ...boardPaths.filter(Boolean).map((x) => String(x).replace(/\\/g, '/'))]
  return known.some((k) => p === k || p.endsWith(`/${k}`) || p.endsWith(k))
}

/**
 * Classify a tool call: 'read-only' (never gated), 'escape' (the remedy — never
 * gated) or 'mutating' (gated), together with the SEGMENT that decided it — the
 * deny names it, because "this call would change state" is unhelpful about a
 * chain of five commands (point 473).
 *
 * A shell call is judged SEGMENT BY SEGMENT on the command HEAD; quoted text
 * decides nothing. Anything unrecognised counts as READ-ONLY: this gate must
 * under-block rather than trap, and the Stop chain remains the backstop for
 * whatever slips past.
 */
export function classifyCall({ toolName, command, filePath, boardPaths = [] } = {}) {
  const tool = String(toolName ?? '')
  if (MUTATING_TOOLS.has(tool)) {
    // An edit of the board itself is how the gate gets satisfied.
    if ((tool === 'Edit' || tool === 'Write') && isBoardFile(filePath, boardPaths)) return { kind: 'escape', segment: '' }
    return { kind: 'mutating', segment: '' }
  }
  if (!SHELL_TOOLS.has(tool)) return { kind: 'read-only', segment: '' }

  const segments = parseSegments(command)
  if (segments.length === 0) return { kind: 'read-only', segment: '' }
  let sawEscape = false
  for (const seg of segments) {
    if (isEscapeSegment(seg)) {
      sawEscape = true
      continue
    }
    if (isMutatingSegment(seg)) return { kind: 'mutating', segment: seg.raw }
  }
  return { kind: sawEscape ? 'escape' : 'read-only', segment: '' }
}

/** The classification alone, for callers that do not need the segment. */
export function classifyTool(call) {
  return classifyCall(call).kind
}

/**
 * Is the board's published copy identical to the repo file? Mirrors invariant 9
 * of dashboard-guard-core, including the logged `--defer` valve. An unknown repo
 * hash means "cannot tell" → treated as published (fail-open).
 *
 * The pages publish is the transport (point 400, delta D) — the user reads that
 * page. A legacy mirror record still counts where one stands, so an old hash
 * never re-blocks a board that was live; a gate that recognised only the mirror
 * would deny a headless session over a remedy it has no tool to run, which is
 * the spin this design forbids.
 */
export function isPublished(state, repoHash) {
  if (!repoHash) return true
  const s = state && typeof state === 'object' ? state : {}
  if (s.publishedHash && s.publishedHash === repoHash) return true
  if (s.pagesPublishedHash && s.pagesPublishedHash === repoHash) return true
  const d = s.publishDeferred
  return !!(d && d.repoHash === repoHash)
}

// ═══ Point 470 — "nothing is running" is a CLAIM TO STOP ═════════════════════
//
// The board carried "Gerade keine laufende Arbeit" while three things were in
// flight, and the user reported it four times in one evening. The asymmetry that
// makes it enforceable: "nothing is running" is a statement about the FUTURE of
// the turn. It is true only if the session stops now — so the next
// state-changing call is the proof it was false, and that call is the one this
// gate refuses.
//
// WHAT STAYS OPEN, so the claim can never trap a session:
//   - reads, and everything `classifyTool` already treats as escape (the board
//     commands themselves, an edit of the board file);
//   - the whole CLOSING SET (`handoverSurvivesCall`) — the calls that END a
//     session rather than carry it on: `batch-boundary.mjs`, the focus stamp, the
//     board publish, the mechanism-review record, the work-order tick. That set
//     is the case the claim exists for, so blocking it would be exactly wrong.
// Everything else — a commit, a test run, an agent, a source edit — is the
// session working on, and it is denied while the claim stands.
//
// THIS DENY DOES NOT STAND DOWN after firing once, unlike the focus/publish
// conditions above it. Those can be blocked on facts a session may be unable to
// change; this one is a sentence the session itself wrote, its remedy is one
// command, and that command is never blocked. A stand-down here would leave the
// lie on the board for the rest of the turn — which is the whole defect.
//
// A REMEDY MUST REACH THE STATE THE SESSION IS IN (point 544, 07.08.2026). The
// deny named two ways out, and a session finishing its CLOSING DUTIES could take
// neither: `now <N>` needs an open point that already has a queue card, and
// `none` rewrites only the reason, never the title, so the claim and the deny
// stood. A finished retrospective refresh could not be committed, filing the
// point about it was itself blocked, and the session had to raise the next queue
// point early just to get a card it could stand behind — which is working AROUND
// the guard, the one thing this chain cannot afford. The third card says that
// state truthfully, `claimsNoCurrentWork` is false under it, and the deny names
// it as the third way out.

/** Is this call part of ENDING the session rather than carrying it on? */
export function isSessionEndingCall({ toolName, command, filePath } = {}) {
  try {
    return handoverSurvivesCall({ toolName, command, filePath }).survives === true
  } catch {
    return false
  }
}

/**
 * The deny text for a board that claims idleness while the session works on.
 * `segment` NAMES the state-changing part of a chained command (point 473) —
 * without it a five-command line says only "something here writes", and the
 * reader has to guess which part the gate meant.
 */
export function noWorkClaimReason(segment = '') {
  const named = String(segment ?? '').trim()
  return (
    'THE BOARD CLAIMS NOTHING IS RUNNING — and this call would prove it wrong (point 470, user ' +
    '30.07.2026). "Gerade keine laufende Arbeit" stands in "Woran ich gerade arbeite", so the board ' +
    'the user reads on his phone says this session has stopped. It is a claim about the FUTURE of ' +
    'this turn: it is true only if you stop now.\n' +
    (named ? `The segment that changes state: \`${named}\`\n` : '') +
    'Do ONE of these:\n' +
    `  - ${NOW_CARD_CMD} <N> "<was gerade läuft>"   → puts a card up for the work; it REPLACES the ` +
    'claim, and this call goes through.\n' +
    `  - ${CLOSING_CARD_CMD} <N> "<welche Abschlussarbeiten noch offen sind>"   → for the state between ` +
    'the two: the point is merged and TICKED, and its closing duties (the four-eyes record, the ' +
    'retrospective) are still owed. That is neither idle nor a numbered point, and it is what this ' +
    'card is for.\n' +
    '  - STOP: end the turn. The session-ending path (node scripts/batch-boundary.mjs --prepare/--commit ' +
    '<point>, the focus stamp, the board publish, the work-order tick) is never blocked by this rule.\n' +
    `If the claim itself is wrong, rewrite it — ${NONE_CARD_CMD} "<Grund>" replaces the standing card ` +
    'rather than adding a second one.\nReads are never blocked — a call is judged SEGMENT BY SEGMENT ' +
    'on the command itself, never on what stands inside its quotes, so a call whose every part reads ' +
    'goes through. This rule is fail-open: an unreadable board never costs a call.'
  )
}

/** The moment the focus was last declared or confirmed (0 when never). */
export function focusStampedAt(focus) {
  if (!focus || typeof focus !== 'object') return 0
  const a = Number(focus.confirmedAt ?? 0)
  const b = Number(focus.setAt ?? 0)
  return Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0)
}

/**
 * Top-level PreToolUse decision.
 *
 * Inputs (all plain data):
 *   toolName, command, filePath   the tool call being attempted
 *   state                         .claude/dashboard-state.json (may be null)
 *   focus                         .claude/current-focus.json (may be null)
 *   repoHash                      sha256 of the registered board file (or null)
 *   boardPaths                    extra board paths an edit may always target
 *   canPublish                    may THIS session publish at all? (delta B —
 *                                 false disables the publish-due deny entirely)
 *   boardHtml                     the board file's content (point 470 — the
 *                                 no-work claim is read from it)
 *
 * Returns { block, reason, recordFired }. `recordFired` is false for the
 * point-470 claim deny, which must NOT consume the once-per-turn stand-down (see
 * the block above `isSessionEndingCall`). Never throws on partial input — the
 * wrapper's fail-open must not depend on luck.
 */
export function evaluate({
  toolName,
  command,
  filePath,
  state,
  focus,
  repoHash = null,
  boardPaths = [],
  canPublish = false,
  boardHtml = null,
} = {}) {
  try {
    const s = state && typeof state === 'object' ? state : null
    // No turn stamp → the UserPromptSubmit hook has not run (a manual invocation,
    // a fresh clone, a torn state file). Nothing to measure against: ALLOW.
    const turnStartedAt = Number(s && s.turnStartedAt)
    if (!Number.isFinite(turnStartedAt) || turnStartedAt <= 0) return { block: false, reason: '' }

    const call = classifyCall({ toolName, command, filePath, boardPaths })
    if (call.kind !== 'mutating') return { block: false, reason: '' }

    // THE CLAIM TO STOP (point 470) — judged BEFORE the stand-down, because it
    // does not stand down. Only a string can carry the claim; anything else
    // (null, an unreadable file) is silently no claim, which is the fail-open
    // direction.
    if (typeof boardHtml === 'string' && claimsNoCurrentWork(boardHtml)) {
      if (!isSessionEndingCall({ toolName, command, filePath })) {
        return { block: true, reason: noWorkClaimReason(call.segment), recordFired: false }
      }
    }

    // Already fired this turn → stand down. At most one denial per turn, so an
    // ignored gate can never lock the session out of working.
    const firedAt = Number(s.boardFirstFiredAt ?? 0)
    if (Number.isFinite(firedAt) && firedAt >= turnStartedAt) return { block: false, reason: '' }

    const stampedAt = focusStampedAt(focus)
    const focusFresh = stampedAt >= turnStartedAt
    const published = isPublished(s, repoHash)
    // The publish-due mark only bites where a publish is possible (see the head
    // of this file); everywhere else it is carried by the watchdog instead.
    const dueUnpublished = canPublish === true && isPublishDue(s)
    if (focusFresh && published && !dueUnpublished) return { block: false, reason: '' }

    const missing = []
    if (!focusFresh) {
      missing.push(
        '  - no `focus set|confirm` recorded since this turn began' +
          (stampedAt ? ` (last stamp ${new Date(stampedAt).toISOString()}, turn began ${new Date(turnStartedAt).toISOString()})` : ' (no focus ever declared)'),
      )
    }
    if (!published) {
      missing.push('  - the board file differs from what was last PUBLISHED (the phone still shows the old board)')
    }
    if (dueUnpublished) {
      const due = s.publishDue
      missing.push(
        '  - the OPEN-POINT SET changed and the board has not been published since' +
          (due && due.at ? ` (marked ${new Date(due.at).toISOString()})` : '') +
          ' — the reader is looking at a board that is missing work',
      )
    }

    return {
      block: true,
      recordFired: true,
      reason:
        'BOARD FIRST — the board must describe the work BEFORE it starts, not after it ends ' +
        '(user 27.07.2026). The user reads the published board while the turn runs; every other ' +
        'board enforcer is a Stop hook and says nothing about that hour.\nMissing:\n' +
        missing.join('\n') +
        '\nDo this now, then repeat the call:\n' +
        '  1. Update the "Woran ich gerade arbeite" card so it names what you are about to do.\n' +
        '  2. node scripts/focus.mjs set <N> "<what>"   (or `confirm` when the card is already right)\n' +
        `  3. ${PUBLISH_CMD}   → pushes the board to the live page; works in EVERY\n` +
        '     session, headless included.\n' +
        `  4. ${SYNCED_CMD} <board path>\n` +
        'Reads, those four commands and an edit of the board file are never blocked, and this gate ' +
        'fires at most ONCE per turn — the next call goes through either way.\n' +
        'IF YOU ARE A SUBAGENT: the board is not yours to keep. A subagent inherits the parent ' +
        'session id, so this gate cannot tell you apart — just repeat the call, it will go through.',
    }
  } catch {
    return { block: false, reason: '' } // total by contract
  }
}
