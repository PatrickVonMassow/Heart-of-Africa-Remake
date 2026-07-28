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
// It may only ESCALATE to a deny where a publish is actually POSSIBLE. The
// headless successor session has no Artifact tool; denying it a publish it
// cannot perform would spin it against a gate it can never satisfy, and a
// blocked turn produces nothing. `publishCapability` (board-currency-core) is
// that question, and until the delta-D transport exists it answers yes only for
// a session that has demonstrably used the Artifact tool itself.

import { isPublishDue } from './board-currency-core.mjs'

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

/** Shell fragments that mutate the tree, the index or the remote. */
const MUTATING_SHELL = [
  // git verbs that write something (history, index, worktree, remote, tags).
  /\bgit\b[^\n]*?\b(commit|merge|push|rebase|reset|revert|cherry-pick|tag|add|stash|checkout|switch|worktree|apply|am|clean|filter-branch)\b/,
  // POSIX file mutation.
  /(^|[\s;&|(])(rm|mv|cp|mkdir|rmdir|touch|chmod|chown|ln|truncate|dd|tee|sed\s+-i)\b/,
  // Package/tooling runs — `npm run …` builds, installs and test runs all write.
  /(^|[\s;&|(])(npm|pnpm|yarn|npx)\b/,
  // PowerShell cmdlets that write.
  /(^|[\s;&|(])(Remove-Item|New-Item|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Rename-Item|Set-ItemProperty|Clear-Content)\b/i,
  // gh mutations (a PR/release is outward-facing state).
  /\bgh\s+(pr|release|issue|api)\b[^\n]*?\b(create|edit|merge|close|delete|-X|--method)\b/,
]

/** Strip stderr redirections so `2>&1` / `2>$null` never reads as a file write. */
function stripStderrRedirects(segment) {
  return segment.replace(/\d?>&\d/g, ' ').replace(/\d>\s*(\/dev\/null|\$null|NUL)/gi, ' ')
}

/** Split a shell command into the segments a shell would run separately. */
export function shellSegments(command) {
  return String(command ?? '')
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Does this single segment invoke one of the gate's own remedy scripts? */
export function isEscapeSegment(segment) {
  const s = String(segment ?? '')
  return ESCAPE_SCRIPTS.some((name) => s.includes(`scripts/${name}`) || s.includes(`scripts\\${name}`))
}

/** Does this single segment mutate anything? (Escape segments are judged first.) */
export function isMutatingSegment(segment) {
  const s = stripStderrRedirects(` ${String(segment ?? '')} `)
  if (MUTATING_SHELL.some((re) => re.test(s))) return true
  // A file-writing redirection (`> file`, `>> file`) after the stderr forms are
  // gone. `=>` and `->` are excluded — an arrow function inside `node -e` is not
  // a write, and a guard that cries wolf on ordinary text trains its reader to
  // skip it (retrospective §3.32, the substring false alarm).
  return /(^|[^\d&=-])>>?\s*[^\s&|>]/.test(s)
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
 * gated) or 'mutating' (gated). Anything unrecognised counts as READ-ONLY: this
 * gate must under-block rather than trap, and the Stop chain remains the
 * backstop for whatever slips past.
 */
export function classifyTool({ toolName, command, filePath, boardPaths = [] } = {}) {
  const tool = String(toolName ?? '')
  if (MUTATING_TOOLS.has(tool)) {
    // An edit of the board itself is how the gate gets satisfied.
    if ((tool === 'Edit' || tool === 'Write') && isBoardFile(filePath, boardPaths)) return 'escape'
    return 'mutating'
  }
  if (!SHELL_TOOLS.has(tool)) return 'read-only'

  const segments = shellSegments(command)
  if (segments.length === 0) return 'read-only'
  let sawEscape = false
  for (const seg of segments) {
    if (isEscapeSegment(seg)) {
      sawEscape = true
      continue
    }
    if (isMutatingSegment(seg)) return 'mutating'
  }
  return sawEscape ? 'escape' : 'read-only'
}

/**
 * Is the board's published copy identical to the repo file? Mirrors invariant 9
 * of dashboard-guard-core, including the logged `--defer` valve. An unknown repo
 * hash means "cannot tell" → treated as published (fail-open).
 */
export function isPublished(state, repoHash) {
  if (!repoHash) return true
  const s = state && typeof state === 'object' ? state : {}
  if (s.publishedHash && s.publishedHash === repoHash) return true
  const d = s.publishDeferred
  return !!(d && d.repoHash === repoHash)
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
 *
 * Returns { block, reason }. Never throws on partial input — the wrapper's
 * fail-open must not depend on luck.
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
} = {}) {
  try {
    const s = state && typeof state === 'object' ? state : null
    // No turn stamp → the UserPromptSubmit hook has not run (a manual invocation,
    // a fresh clone, a torn state file). Nothing to measure against: ALLOW.
    const turnStartedAt = Number(s && s.turnStartedAt)
    if (!Number.isFinite(turnStartedAt) || turnStartedAt <= 0) return { block: false, reason: '' }

    // Already fired this turn → stand down. At most one denial per turn, so an
    // ignored gate can never lock the session out of working.
    const firedAt = Number(s.boardFirstFiredAt ?? 0)
    if (Number.isFinite(firedAt) && firedAt >= turnStartedAt) return { block: false, reason: '' }

    if (classifyTool({ toolName, command, filePath, boardPaths }) !== 'mutating') {
      return { block: false, reason: '' }
    }

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
      reason:
        'BOARD FIRST — the board must describe the work BEFORE it starts, not after it ends ' +
        '(user 27.07.2026). The user reads the published board while the turn runs; every other ' +
        'board enforcer is a Stop hook and says nothing about that hour.\nMissing:\n' +
        missing.join('\n') +
        '\nDo this now, then repeat the call:\n' +
        '  1. Update the "Woran ich gerade arbeite" card so it names what you are about to do.\n' +
        '  2. node scripts/focus.mjs set <N> "<what>"   (or `confirm` when the card is already right)\n' +
        '  3. node scripts/dashboard-publish.mjs  → publish the scratchpad file via the Artifact tool\n' +
        '  4. node scripts/dashboard-guard.mjs --synced <board path>\n' +
        'Reads, those four commands and an edit of the board file are never blocked, and this gate ' +
        'fires at most ONCE per turn — the next call goes through either way.\n' +
        'IF YOU ARE A SUBAGENT: the board is not yours to keep. A subagent inherits the parent ' +
        'session id, so this gate cannot tell you apart — just repeat the call, it will go through.',
    }
  } catch {
    return { block: false, reason: '' } // total by contract
  }
}
