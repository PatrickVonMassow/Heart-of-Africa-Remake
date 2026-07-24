// Pure decision logic of the closing-completeness guard (closing-guard.mjs is
// the thin fail-open I/O wrapper + CLI). Kept side-effect-free so the Vitest
// layer can sweep every rule without fs/git (scripts/closing-guard-core.test.mjs).
//
// WHY THIS EXISTS (user mandate 24.07.2026): the v0.2 release TAGGED the demo
// after running only the LARGE regression — the dead-code / stale-doc /
// stale-comment cleanup + the .md audit (the very steps that distinguish a
// CLOSING from a plain regression, §7.2 / Maximum-QA Phase 8) were SKIPPED,
// because the closing steps were tracked by fallible MEMORY, not enforced. This
// guard makes a version release IMPOSSIBLE while any closing step is unchecked:
// a PreToolUse(Bash) hook blocks the tag/poc creation-or-push (and --tags)
// unless EVERY step below is recorded done FOR THE EXACT COMMIT being tagged.
//
// The enforcement is PRE-tag (a PreToolUse deny), not a post-hoc Stop block, so
// the bad state can never reach the remote. Fail-open is the WRAPPER's job; this
// core must never throw on partial input (a guard bug must not trap the session).

/**
 * The canonical closing checklist — every step a full closing cycle must
 * complete before a version tag (§7.2 + Maximum-QA Phase 8 + CLAUDE.md §9).
 * A step counts as done only when recorded for the tagged commit WITH evidence.
 * Adding a step here automatically tightens the gate (no other edit needed).
 */
export const CLOSING_STEPS = [
  { id: 'large-regression', title: 'Full LARGE regression green on BOTH backends, flake-free (§7.2)' },
  { id: 'lint-audit', title: 'npm run lint + npm audit clean (§7.1 pt 18)' },
  { id: 'dead-code', title: 'Dead-code cleanup — unreachable/unused code removed or justified' },
  { id: 'stale-doc', title: 'Stale-doc audit — design.md / CLAUDE.md / READMEs match the code' },
  { id: 'stale-comment', title: 'Stale-comment audit — comments match the code they describe' },
  { id: 'md-audit', title: '.md cruft audit — section numbers preserved, no orphaned/contradictory prose' },
  { id: 'impl-sections', title: 'Implementation sections current — peoples-1890 §8, climate-1890 §9' },
  { id: 'graphics-detail-doc', title: 'docs/graphics-detail-levels.md matches QUALITY_PRESETS' },
  { id: 'acceptance-criteria', title: '§7.1 acceptance criteria confirmed with evidence' },
  { id: 'open-items', title: 'Open items (// OPEN: …) collected and listed' },
  { id: 'simplifications', title: 'Simplifications and placeholder values named' },
]

/** The set of valid step ids, for validating CLI input. */
export const STEP_IDS = new Set(CLOSING_STEPS.map((s) => s.id))

/**
 * Does this shell command CREATE or PUSH a version tag (vX.Y) or the `poc` tag?
 * Those are the release acts the closing gates. Matches:
 *   git tag [..] vX.Y            (create/move a version tag)
 *   git tag [..] -f? poc          (move poc — it mirrors the newest version tag)
 *   git push <remote> vX.Y        (push a version tag)
 *   git push <remote> poc         (push poc)
 *   git push .. --tags / --follow-tags   (bulk tag push)
 * Deliberately NOT matched: ordinary `git push origin main`, non-version
 * lightweight tags, branch pushes — the gate is only for a version RELEASE.
 * Total: any non-string → false.
 */
export function isVersionTagCommand(command) {
  if (typeof command !== 'string') return false
  // A version/poc token inside a COMMIT MESSAGE (or any quoted string / heredoc
  // body) is not a tag argument — strip those first, so
  // `git commit -m "… the v0.2 / poc release …" && git push origin main` is NOT
  // mistaken for a release (the real false-positive that blocked this very
  // commit). Order: heredoc bodies, then single/double-quoted strings.
  let c = command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n[ \t]*\1\b/g, ' ')
  // Only strip quotes from -m/--message values, which cannot be version tags.
  // DO NOT blanket-strip quotes — version tokens may be wrapped (git tag "v0.3").
  // Apostrophes in double-quoted strings would match with ' regex, consuming
  // unintended spans ("Don't ..." matches 't' to another quote).
  c = c.replace(/(-m|--message)\s+"[^"]*"/g, '$1 MESSAGE')
  c = c.replace(/(-m|--message)\s+'[^']*'/g, '$1 MESSAGE')
  // Evaluate each command SEGMENT on its own — a `git push origin main` segment
  // must not inherit a `poc`/`vX.Y` token from a sibling segment.
  const segments = c.split(/&&|\|\||;|\||\n/)
  // A version tag as a bare ARGUMENT (v0.1, v1.0, v12.34), or the poc tag, or a
  // bulk tag push. Word-bounded so `poctest`/`v0.2-rc` refspecs don't false-hit.
  const versionArg = /(^|[\s=/])v\d+\.\d+($|[\s^~:])/
  const pocArg = /(^|[\s=/])poc($|[\s^~:])/
  for (const seg of segments) {
    const s = ` ${seg.trim()} `
    // git may have options before the verb: git -C <path> tag, git -c user=x tag, git --no-pager push
    const gitOptionsMatcher = '(?:\\s+(?:-[cC]|-{1,2}\\S+))*'
    const isTag = new RegExp(`\\bgit${gitOptionsMatcher}\\s+tag\\b`).test(s)
    const isPush = new RegExp(`\\bgit${gitOptionsMatcher}\\s+push\\b`).test(s)
    const isGhRelease = /\bgh\s+release\s+create\b/.test(s)
    if (!isTag && !isPush && !isGhRelease) continue
    if (/\s--(tags|follow-tags)\b/.test(s)) return true
    if (versionArg.test(s) || pocArg.test(s)) return true
  }
  return false
}

/**
 * Which closing steps are NOT satisfied for `headSha`, given the recorded state.
 * A step is satisfied ONLY when the state is FOR this exact commit and the step
 * has an entry (with evidence). A state recorded for a different commit counts
 * for NOTHING — a closing is per-commit, so re-tagging a new commit needs a
 * fresh closing. Total: bad input → ALL steps missing (safest: blocks).
 */
export function missingSteps(state, headSha) {
  const done = new Set()
  if (state && typeof state === 'object' && typeof headSha === 'string' && headSha && state.commit === headSha) {
    const steps = state.steps && typeof state.steps === 'object' ? state.steps : {}
    for (const id of Object.keys(steps)) {
      const e = steps[id]
      // A step counts only with a non-empty evidence string — no blank ticks.
      if (STEP_IDS.has(id) && e && typeof e === 'object' && typeof e.evidence === 'string' && e.evidence.trim()) {
        done.add(id)
      }
    }
  }
  return CLOSING_STEPS.filter((s) => !done.has(s.id))
}

/**
 * Top-level PreToolUse decision. Blocks a version-tag/poc create-or-push while
 * any closing step is unsatisfied for the commit being tagged (headSha).
 * Returns { block: boolean, reason: string }. Total by contract: any thrown
 * error is the wrapper's to swallow — this function never throws on partial
 * input (returns {block:false} on anything it cannot evaluate).
 */
export function evaluate({ command, state, headSha } = {}) {
  try {
    if (!isVersionTagCommand(command)) return { block: false, reason: '' }
    const missing = missingSteps(state, headSha)
    if (missing.length === 0) return { block: false, reason: '' }
    const list = missing.map((s) => `  - ${s.id}: ${s.title}`).join('\n')
    const forCommit = headSha ? ` for commit ${String(headSha).slice(0, 12)}` : ''
    return {
      block: true,
      reason:
        `CLOSING INCOMPLETE — refusing to create/push a version tag${forCommit}: ` +
        `${missing.length} of ${CLOSING_STEPS.length} closing steps are NOT recorded done. ` +
        `A version release runs the FULL closing cycle (§7.2 / Maximum-QA Phase 8), not just the ` +
        `LARGE regression — the dead-code/stale-doc/stale-comment cleanup and the .md audit are ` +
        `what distinguish a closing from a regression (the v0.2 miss).\nMissing:\n${list}\n` +
        `Do each step, record it with evidence:\n` +
        `  node scripts/closing-guard.mjs --step <id> --evidence "<what you did / the proof>"\n` +
        `Then re-run the tag command. Inspect anytime: node scripts/closing-guard.mjs --status`,
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must not depend on luck
  }
}
