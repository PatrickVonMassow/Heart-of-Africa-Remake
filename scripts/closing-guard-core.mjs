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
// a PreToolUse hook on the shell tools blocks the tag/poc creation-or-push (and
// --tags) unless EVERY step below is recorded done FOR THE EXACT COMMIT tagged.
//
// The SECOND release act the checklist gates is the CLAIM that a closing is
// finished — in this repo's machine-readable form, the `[ ]`→`[x]` TICK of a
// work-order point whose own spec delivers a closing (the point-224 shape). The
// v0.2 miss was exactly that: the point was ticked while the cleanup steps had
// never run. So the same checklist decides the tick, on the work-order EDIT.
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

/** `git [options] <verb>` — at most ten options, each with at most one non-dash argument. */
const gitVerb = (verb) => new RegExp(String.raw`\bgit(?:\s+-{1,2}\S+(?:\s+[^-\s]\S*)?){0,10}\s+${verb}\b`)
const GIT_TAG = gitVerb('tag')
const GIT_PUSH = gitVerb('push')
/** The git options whose argument is a filesystem path, not a ref. */
const PATH_OPTION = /\s(?:-C|--git-dir|--work-tree)(?:\s+|=)\S+/g

/**
 * Does this shell command CREATE or PUSH a version tag (vX.Y) or the `poc` tag?
 * Those are the release acts the closing gates. Matches:
 *   git tag [..] vX.Y             (create/move a version tag)
 *   git tag [..] -f? poc          (move poc — it mirrors the newest version tag)
 *   git push <remote> vX.Y        (push a version tag)
 *   git push <remote> poc         (push poc)
 *   git push <remote> +v0.3       (force-update a version tag)
 *   git push <remote> :v0.3       (delete a version tag — a published one, too)
 *   git push .. --tags / --follow-tags   (bulk tag push)
 *   gh release create vX.Y|poc    (a release published straight from the CLI)
 *   any of the above with the tag QUOTED ("v0.3", 'poc') or with git options
 *   before the verb (git -C <path>, git -c key=val, git --no-pager)
 * Deliberately NOT matched: ordinary `git push origin main`, non-version
 * lightweight tags, branch pushes, a version/poc token that only appears in a
 * COMMIT MESSAGE, and a REPOSITORY PATH that happens to end in a tag name
 * (`git -C /build/poc push origin main`) — the gate is only for a version
 * RELEASE. Total: any non-string → false.
 */
/**
 * A command with its PROSE removed: heredoc bodies and -m/--message values.
 * What a command SAYS is not what it DOES — a commit message quoting `v0.2`,
 * `poc` or a ticked point line is talk, and blocking talk is obstruction. Only
 * those two forms are stripped: a blanket quote-strip would swallow the real
 * arguments (`git tag "v0.3"`, `sed 's/…/- [x] 224./'`), and an apostrophe in a
 * double-quoted string would consume unintended spans ("Don't …").
 */
function withoutProse(command) {
  let c = command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n[ \t]*\1\b/g, ' ')
  c = c.replace(/(-m|--message)\s+"[^"]*"/g, '$1 MESSAGE')
  c = c.replace(/(-m|--message)\s+'[^']*'/g, '$1 MESSAGE')
  return c
}

export function isVersionTagCommand(command) {
  if (typeof command !== 'string') return false
  // `git commit -m "… the v0.2 / poc release …" && git push origin main` is NOT
  // a release — the real false positive that once blocked this guard's own commit.
  let c = withoutProse(command)
  // A backslash-newline is a CONTINUATION, not a command break — joining it back
  // keeps `git tag \⏎  v0.3` one segment. Without this the newline split severed
  // the verb from its tag argument and the whole release act read as harmless
  // (four-eyes review 07.08.2026).
  c = c.replace(/\\\r?\n/g, ' ')
  // Evaluate each command SEGMENT on its own — a `git push origin main` segment
  // must not inherit a `poc`/`vX.Y` token from a sibling segment.
  const segments = c.split(/&&|\|\||;|\||\n/)
  // A version tag as a bare ARGUMENT (v0.1, v1.0, v12.34), or the poc tag, or a
  // bulk tag push. Matches quoted or unquoted. Word-bounded so `poctest`/`v0.2-rc`
  // refspecs don't false-hit. The prefix class carries `+` (force refspec) and
  // `:` (delete refspec): `git push origin +v0.3` and `git push origin :v0.3`
  // are release acts the gate used to wave through (25.07 review, finding c).
  const versionArg = /(^|[\s=/+:])['"]?v\d+\.\d+['"]?($|[\s^~:])/
  const pocArg = /(^|[\s=/+:])['"]?poc['"]?($|[\s^~:])/
  for (const seg of segments) {
    const s = ` ${seg.trim()} `
    // git may have options before the verb: git -C <path> tag, git -c user=x tag,
    // git --no-pager push. The run of options is BOUNDED and an option's argument
    // may not itself start with a dash — the former unbounded, doubly ambiguous
    // shape backtracked exponentially over a run of dash-tokens (measured 736 ms
    // on 34 synthetic flags, doubling per two). A PreToolUse that HANGS is not
    // covered by the wrapper's fail-open, which only catches throws.
    const isTag = GIT_TAG.test(s)
    const isPush = GIT_PUSH.test(s)
    const isGhRelease = /\bgh\s+release\s+create\b/.test(s)
    if (!isTag && !isPush && !isGhRelease) continue
    if (/\s--(tags|follow-tags)\b/.test(s)) return true
    // A path handed to -C/--git-dir/--work-tree is a LOCATION, never a tag, so it
    // is dropped before the tag matching: a repository at /build/poc must not
    // read as the poc tag (25.07 review, finding b).
    const args = s.replace(PATH_OPTION, ' ')
    if (versionArg.test(args) || pocArg.test(args)) return true
  }
  return false
}


/** The work-order files a tick is written into (the split of 26.07.2026). */
export const WORK_ORDER_FILES = ['TASKS.md', 'docs/tasks-archive.md']

/** Does this path (any separator, any prefix) name one of the work-order files? */
export function isWorkOrderPath(path) {
  if (typeof path !== 'string' || !path) return false
  const p = path.replace(/\\/g, '/')
  return p.endsWith('/TASKS.md') || p === 'TASKS.md' || p.endsWith('/docs/tasks-archive.md') || p === 'docs/tasks-archive.md'
}

// A point whose OWN delivery is a closing run says so: either its headline names
// a closing run/cycle/pass (points 148/150/173/224), or its body DEMANDS a full/
// complete/final one (174/184/330). A point that merely REFERS to some other
// closing ("found in the point-173 closing run", "before the final closing run
// and the tag") is not one — that reference shape is stripped before the demand
// is read. Measured over the whole corpus (536 points): 7 match, all of them
// points that genuinely deliver a closing, and no incidental mention.
// The headline word stands on its own — `pre-closing pass` is a preparation FOR
// a closing, not a closing, so the hyphenated compound must not match.
const CLOSING_HEADLINE = /(^|[\s(—])closing\s+(run|cycle|pass)\b/i
const CLOSING_DEMAND = /\b(full|complete|final)\s+closing\s+(run|cycle|pass)\b/i
const CLOSING_REFERENCE = /\b(before|after|during|since|from|in)\s+the\s+(full|complete|final)\s+closing\s+(run|cycle|pass)\b/gi

/**
 * Split a work-order text into its points: { n, open, headline, text }.
 * Total: a non-string (or an unparseable file) yields an empty list.
 */
export function parsePoints(tasksText) {
  const out = []
  if (typeof tasksText !== 'string' || !tasksText) return out
  let cur = null
  let buf = []
  const flush = () => {
    if (cur) out.push({ ...cur, text: buf.join('\n') })
  }
  for (const line of tasksText.split('\n')) {
    const m = /^- \[( |x)\] (\d+)\./.exec(line)
    if (m) {
      flush()
      cur = { n: Number(m[2]), open: m[1] === ' ', headline: line }
      buf = [line]
    } else if (cur) {
      buf.push(line)
    }
  }
  flush()
  return out
}

/**
 * The point numbers whose SPEC delivers a closing cycle — the ticks this guard
 * gates. Total: bad input → empty set (nothing gated, i.e. fail-open).
 */
export function closingPointNumbers(tasksText) {
  const found = new Set()
  for (const p of parsePoints(tasksText)) {
    if (CLOSING_HEADLINE.test(p.headline)) {
      found.add(p.n)
      continue
    }
    for (const line of p.text.split('\n')) {
      if (!CLOSING_DEMAND.test(line)) continue
      if (CLOSING_DEMAND.test(line.replace(CLOSING_REFERENCE, ' '))) {
        found.add(p.n)
        break
      }
    }
  }
  return found
}

/** The point numbers a text TICKS (`- [x] N.`). Total: bad input → empty set. */
export function tickedPointNumbers(text) {
  const out = new Set()
  if (typeof text !== 'string') return out
  for (const m of text.matchAll(/- \[x\] (\d+)\./g)) out.add(Number(m[1]))
  return out
}

/** The tool names whose payload can carry a tick. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

/** A shell command names a work-order file … */
const WORK_ORDER_NAMED = /TASKS\.md|tasks-archive\.md/
/** … and WRITES it: an in-place editor, a redirect or a copy ONTO the file, a patch. */
const WORK_ORDER_WRITE = /(^|\s)-i\b|>>?\s*\S*(TASKS\.md|tasks-archive\.md)|\btee\b|\bpatch\b|\bgit\s+apply\b|\b(mv|cp)\b/

/** The text a tool call WRITES, and the text it REPLACES, for tick accounting. */
function tickTexts(toolName, toolInput) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  if (EDIT_TOOLS.has(toolName)) {
    if (!isWorkOrderPath(input.file_path)) return null
    const edits = Array.isArray(input.edits) ? input.edits : []
    const added = [input.new_string, input.content, input.new_source, ...edits.map((e) => e && e.new_string)]
    const removed = [input.old_string, ...edits.map((e) => e && e.old_string)]
    return { added: added.filter((s) => typeof s === 'string').join('\n'), removed: removed.filter((s) => typeof s === 'string').join('\n') }
  }
  if (SHELL_TOOLS.has(toolName)) {
    // The shell branch is a BACKSTOP — the honest tick goes through the editing
    // tools, which the branch above decides exactly. So it demands all three:
    // prose removed (a commit message quoting a tick is talk, and it denied this
    // guard's own commit), the work-order file NAMED, and an actual WRITE onto
    // it — `grep -F '- [x] 224.' docs/tasks-archive.md` reads, and denying a read
    // during a closing is obstruction, not enforcement (four-eyes review
    // 07.08.2026).
    const c = withoutProse(typeof input.command === 'string' ? input.command : '')
    if (!WORK_ORDER_NAMED.test(c) || !WORK_ORDER_WRITE.test(c)) return null
    return { added: c, removed: '' }
  }
  return null
}

/**
 * Cheap structural pre-check: could this tool call possibly tick a point? The
 * wrapper asks FIRST so it reads the work order only when it might matter.
 */
export function mayTickPoint(toolName, toolInput) {
  try {
    const t = tickTexts(toolName, toolInput)
    return !!t && /- \[x\] \d+\./.test(t.added)
  } catch {
    return false
  }
}

/**
 * Which CLOSING points this tool call ticks. A point counts when the tick is NEW
 * — neither in the text being replaced nor already recorded in the work order,
 * so re-writing an already-archived tick can never re-fire.
 *
 * THE TICK IS TWO EDITS, IN EITHER ORDER (four-eyes review 07.08.2026): the
 * point leaves TASKS.md and lands, ticked, in the archive. Delete-first left the
 * point in NEITHER file at the moment the archive was written, so a membership
 * test against the work order alone let the whole claim through. The point's
 * spec travels WITH it, so the written text is read as a work order too, and a
 * point the work order no longer knows counts as open rather than as done.
 * Total: anything unreadable → [] (fail-open).
 */
export function closingTickClaim({ toolName, toolInput, tasksText } = {}) {
  try {
    const t = tickTexts(toolName, toolInput)
    if (!t) return []
    const ticked = tickedPointNumbers(t.added)
    if (ticked.size === 0) return []
    const points = parsePoints(tasksText)
    if (points.length === 0) return [] // no readable work order → nothing to judge against
    const already = tickedPointNumbers(t.removed)
    const closing = closingPointNumbers(tasksText)
    for (const n of closingPointNumbers(t.added)) closing.add(n)
    const recorded = new Set(points.filter((p) => !p.open).map((p) => p.n))
    return [...ticked].filter((n) => !already.has(n) && !recorded.has(n) && closing.has(n)).sort((a, b) => a - b)
  } catch {
    return []
  }
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

/** The shared tail of every block reason: what is missing and how to record it. */
function remedy(missing, retry) {
  const list = missing.map((s) => `  - ${s.id}: ${s.title}`).join('\n')
  return (
    `A closing runs the FULL cycle (§7.2 / Maximum-QA Phase 8), not just the LARGE ` +
    `regression — the dead-code/stale-doc/stale-comment cleanup and the .md audit are ` +
    `what distinguish a closing from a regression (the v0.2 miss).\nMissing:\n${list}\n` +
    `Do each step, record it with evidence:\n` +
    `  node scripts/closing-guard.mjs --step <id> --evidence "<what you did / the proof>"\n` +
    `${retry} Inspect anytime: node scripts/closing-guard.mjs --status`
  )
}

/**
 * Top-level PreToolUse decision. Blocks, while any closing step is unsatisfied
 * for the commit at hand (headSha), BOTH release acts:
 *   - a version-tag/poc create-or-push (shell tools), and
 *   - the `[ ]`→`[x]` tick of a point whose spec delivers a closing (the
 *     work-order edit that CLAIMS the closing is done).
 * Returns { block: boolean, reason: string }. Total by contract: any thrown
 * error is the wrapper's to swallow — this function never throws on partial
 * input (returns {block:false} on anything it cannot evaluate).
 */
export function evaluate({ command, state, headSha, toolName, toolInput, tasksText } = {}) {
  try {
    const tagAct = isVersionTagCommand(command)
    const tickedPoints = tagAct ? [] : closingTickClaim({ toolName, toolInput, tasksText })
    if (!tagAct && tickedPoints.length === 0) return { block: false, reason: '' }
    const missing = missingSteps(state, headSha)
    if (missing.length === 0) return { block: false, reason: '' }
    const forCommit = headSha ? ` for commit ${String(headSha).slice(0, 12)}` : ''
    if (tagAct) {
      return {
        block: true,
        reason:
          `CLOSING INCOMPLETE — refusing to create/push a version tag${forCommit}: ` +
          `${missing.length} of ${CLOSING_STEPS.length} closing steps are NOT recorded done. ` +
          remedy(missing, 'Then re-run the tag command.'),
      }
    }
    const which = tickedPoints.map((n) => `point ${n}`).join(', ')
    return {
      block: true,
      reason:
        `CLOSING INCOMPLETE — refusing to tick ${which} as done${forCommit}: that point's own ` +
        `delivery IS a closing cycle, and ${missing.length} of ${CLOSING_STEPS.length} closing ` +
        `steps are NOT recorded done. Ticking it now would repeat the v0.2 miss — the point ` +
        `declared finished while the cleanup steps had never run. ` +
        remedy(missing, 'Then re-run the tick. A step the user has expressly waived is recorded AS the waiver, naming his decision.'),
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must not depend on luck
  }
}
