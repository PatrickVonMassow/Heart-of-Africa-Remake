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
  {
    id: 'cleanup-blind-parallel',
    title:
      'The legacy cleanup ran as a BLIND-PARALLEL four-eyes stage (CLAUDE.md §6) — both models ' +
      'worked from the same inputs to their own complete result, neither seeing the other’s before ' +
      'it was done; the union is deduplicated BY MEANING, marks what only one side found and drops ' +
      'nothing for being unusual',
  },
  {
    id: 'regression-after-cleanup',
    title:
      'Second full LARGE regression on BOTH backends, AFTER the last cleanup commit (evidence must ' +
      'NAME that commit or its timestamp)',
  },
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
function withoutProse(command, { keepHeredocBodies = false } = {}) {
  let c = keepHeredocBodies ? command : command.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n[ \t]*\1\b/g, ' ')
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
// `[^\s>]*` rather than `\S*`: a run of `>` characters made the redirect probe
// quadratic (4 s at 40k chars) — no realistic command, but a hook may not have
// a slow shape at all.
const REDIRECTS_INTO_WORK_ORDER = />>?\s*[^\s>]*(TASKS\.md|tasks-archive\.md)|\btee\b[^|\n]*(TASKS\.md|tasks-archive\.md)/
// `-i` counts only for the in-place EDITORS — grep's `-i` is a read, and denying
// `grep -i '- [x] 224.' <file>` during a closing would be obstruction.
const WORK_ORDER_WRITE = new RegExp(
  `\\b(sed|perl|ruby|gawk)\\b[^|\\n]*(\\s-[A-Za-z]*i\\b|--in-place)|\\bpatch\\b|\\bgit\\s+apply\\b|\\b(mv|cp|tee)\\b|${REDIRECTS_INTO_WORK_ORDER.source}`,
)

/**
 * THE LANDING CHAIN TICKS WITHOUT NAMING THE WORK ORDER (point 594).
 *
 * `node scripts/land-point.mjs <N>` writes the tick from inside a process, so the
 * command mentions no `TASKS.md` and performs no visible write — the two things
 * the shell backstop above looks for. Both gates that read `mayTickPoint` were
 * therefore blind to it: `closing-guard` would not deny the tick of a
 * closing-delivering point, and `point-proof-guard` (PreToolUse and CLI only,
 * with no Stop backstop) would not run at all. A convenience command must not be
 * a way past the gates its steps are governed by.
 *
 * `--dry` is deliberately NOT a tick: it prints the plan and writes nothing, and
 * denying it would block the very command a session uses to find out what a
 * landing would do.
 */
// Scanned LINEARLY, with no nested quantifier: this runs inside a PreToolUse
// hook, and a hook that HANGS is not covered by the wrapper's fail-open, which
// only catches throws (the same reasoning as the bounded option runs above).
const LANDING_SCRIPT = 'land-point.mjs'

/** The point number a landing command would tick, or null for "no tick here". */
export function landingTickNumber(command) {
  const c = String(command ?? '')
  if (!c.includes(LANDING_SCRIPT)) return null
  // Only the SEGMENT that invokes it, so a sibling command's number cannot leak
  // in — `echo 42 && node scripts/land-point.mjs 594` ticks 594, not 42.
  const seg = c.split(/&&|\|\||;|\||\n/).find((s) => s.includes(LANDING_SCRIPT))
  if (!seg || /\s--dry\b/.test(seg)) return null
  const after = seg.slice(seg.indexOf(LANDING_SCRIPT) + LANDING_SCRIPT.length)
  // A quoted value is not a place to read a point number from: `--model
  // "Claude Opus 5"` must never be mistaken for point 5.
  const m = after.replace(/"[^"]*"|'[^']*'/g, ' ').match(/(?:^|\s)(\d+)(?=\s|$)/)
  return m ? Number(m[1]) : null
}

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
    const raw = typeof input.command === 'string' ? input.command : ''
    // THE LANDING CHAIN FIRST: it ticks from inside a process, so it names no
    // work-order file and performs no visible write, and the three demands below
    // would all miss it. Synthesised into the tick form the callers already read.
    const landing = landingTickNumber(raw)
    if (landing !== null) return { added: `- [x] ${landing}.`, removed: '' }
    // A heredoc is prose in `git commit -F - <<MSG`, but it is the CONTENT in
    // `cat > TASKS.md <<EOF` — so its body survives exactly when the command
    // redirects into a work-order file, and the tick inside it counts.
    const c = withoutProse(raw, { keepHeredocBodies: REDIRECTS_INTO_WORK_ORDER.test(raw) })
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
  const { points, addedText } = tickClaim({ toolName, toolInput, tasksText })
  if (points.length === 0) return []
  const closing = closingPointNumbers(tasksText)
  for (const n of closingPointNumbers(addedText)) closing.add(n)
  return points.filter((n) => closing.has(n))
}

/**
 * Which points this tool call ticks, WHATEVER their subject — the generic half
 * of `closingTickClaim`, shared so a second tick gate cannot re-derive the
 * accounting and drift from it (point 437 C). `addedText` is handed back with
 * the numbers because the point's SPEC travels with the tick: the block that
 * lands in the archive is often the only copy of it the call can be judged
 * against.
 *
 * Total by contract: anything unreadable → { points: [], addedText: '' }.
 */
export function tickClaim({ toolName, toolInput, tasksText } = {}) {
  const none = { points: [], addedText: '' }
  try {
    const t = tickTexts(toolName, toolInput)
    if (!t) return none
    const ticked = tickedPointNumbers(t.added)
    if (ticked.size === 0) return none
    const points = parsePoints(tasksText)
    if (points.length === 0) return none // no readable work order → nothing to judge against
    const already = tickedPointNumbers(t.removed)
    const recorded = new Set(points.filter((p) => !p.open).map((p) => p.n))
    return {
      points: [...ticked].filter((n) => !already.has(n) && !recorded.has(n)).sort((a, b) => a - b),
      addedText: t.added,
    }
  } catch {
    return none
  }
}

// THE CLOSING IS A SEQUENCE, NOT A SET (user 11.08.2026, point 631).
//
// "Volle Regression, dann gründliches Vier-Augen-Cleanup von Altlasten im
// kompletten Code und allen Dokumenten und dann nochmal eine volle Regression."
// A checklist that only asks WHETHER each step happened is satisfied by a
// cleanup performed AFTER the one green regression — and the tag then carries
// changes nothing ever tested. So the second regression is its own step, and its
// POSITION is checked.
//
// WHAT "AFTER" CAN HONESTLY BE CHECKED AGAINST (four-eyes reviews 11.08.2026,
// GPT-5.6 Sol, two rounds). A commit's own DATE is the wrong clock: the state is
// keyed to the commit being tagged and the steps are recorded after that commit
// exists, so a regression naming the very state it tested would read as "too
// old", while any unrelated newer commit would read as fine. What CAN be judged,
// with no git and no clock of its own:
//   - THE COMMIT NAMED IS THE ONE BEING CLOSED. A LARGE run on the commit that
//     will be tagged tests exactly the state that will be tagged — which is the
//     point of running it again. A run on any OTHER commit says nothing about
//     this one. (It does NOT prove the cleanup is inside that commit; nothing in
//     the state can prove that. What it proves is the property the tag needs.)
//   - THE TIMES NAMED FRAME THE RUN. The EARLIEST time the evidence names must
//     lie after the youngest cleanup record — earliest, because "report
//     2026-08-12: run of 2026-08-10" must not certify a pre-cleanup run by
//     quoting a later date elsewhere in the sentence. The LATEST must not lie
//     after the moment the step was written down, or a run dated 2099 would
//     certify itself before it happened.
//   - THE RECORD TIMES RUN IN THE SEQUENCE'S OWN ORDER: `large-regression` at or
//     before the first cleanup step, the second regression at or after the last
//     one and at or after the first regression, and the two regressions are two
//     RUNS — the same evidence text cannot serve as both.
// A record time is only ever a NECESSARY condition (it is an upper bound of the
// run it describes, never a lower one), and ties are allowed throughout: two
// steps recorded in the same millisecond are a fast hand, not a violation.
// A step recorded WITHOUT a record time cannot be ordered at all, so it is
// reported missing with a re-record remedy rather than waved through.

/** The cleanup steps the second regression must come after. */
export const CLEANUP_STEP_IDS = ['dead-code', 'stale-doc', 'stale-comment', 'md-audit', 'cleanup-blind-parallel']
/** The step whose POSITION is checked, not merely its presence. */
export const AFTER_CLEANUP_STEP_ID = 'regression-after-cleanup'

/** An ISO-ish date or date-time (`2026-08-11`, `2026-08-11T14:03:00Z`, `2026-08-11 14:03`). */
const TIMESTAMP_IN_TEXT = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g
/**
 * A commit sha: 7-40 hex characters WITH at least one digit. The digit is what
 * separates a sha from an English word that happens to be all-hex (`defaced`,
 * `deadbeef`) — evidence is prose, and a word must not read as a commit.
 */
const SHA_IN_TEXT = /\b(?=[0-9a-f]{7,40}\b)[0-9a-f]*\d[0-9a-f]*\b/gi
const DAY_MS = 86_400_000

/** Milliseconds of an ISO-ish string, or null. Total: anything unparseable → null. */
function parseTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const t = Date.parse(value.trim())
  return Number.isFinite(t) ? t : null
}

/**
 * Milliseconds of a timestamp TOKEN, read as UTC when it carries no zone, so
 * the same evidence is judged identically on every machine.
 */
function parseStamp(token) {
  const normalized = token.replace(' ', 'T')
  const dateOnly = !normalized.includes('T')
  if (dateOnly) return { time: parseTime(`${normalized}T00:00:00Z`), dateOnly: true }
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`
  return { time: parseTime(zoned), dateOnly: false }
}

/**
 * Every anchor an evidence text names: the commit shas and the timestamps, with
 * the EARLIEST timestamp singled out (that is the one the order is judged by).
 * Total by contract: anything unreadable → empty lists.
 */
export function evidenceAnchors(text) {
  const out = { commits: [], times: [], earliest: null }
  try {
    const s = typeof text === 'string' ? text : ''
    for (const m of s.matchAll(TIMESTAMP_IN_TEXT)) {
      const { time, dateOnly } = parseStamp(m[0])
      if (time === null) continue
      const stamp = { token: m[0], time, dateOnly }
      out.times.push(stamp)
      if (!out.earliest || time < out.earliest.time) out.earliest = stamp
    }
    for (const m of s.matchAll(SHA_IN_TEXT)) {
      const sha = m[0].toLowerCase()
      // A date's digits are not a sha, and a token already read as a time is not one either.
      if (!out.commits.includes(sha)) out.commits.push(sha)
    }
  } catch {
    /* total by contract */
  }
  return out
}

const iso = (ms) => new Date(ms).toISOString()
const RE_RECORD = (id) => `re-record it: node scripts/closing-guard.mjs --step ${id} --evidence "<proof>"`
/** Evidence compared as CLAIMS, not as characters: case and spacing are noise. */
const sameClaim = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') ===
  String(b ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/** The steps whose POSITION in the sequence is checked, first to last. */
export const ORDERED_STEP_IDS = ['large-regression', ...CLEANUP_STEP_IDS, AFTER_CLEANUP_STEP_ID]

/**
 * Which recorded steps stand in the WRONG PLACE in the closing sequence, as
 * `Map<stepId, reason>`. A step that is not recorded at all is not judged here —
 * its absence is `missingSteps`' business.
 * Total by contract: anything unreadable → an empty map (a guard bug must not
 * trap a release either).
 */
export function orderProblems(steps, headSha) {
  const problems = new Map()
  try {
    const table = steps && typeof steps === 'object' ? steps : {}
    const head = typeof headSha === 'string' ? headSha.toLowerCase() : ''
    /** A step as RECORDED (evidence present), or null. */
    const recorded = (id) => {
      const e = table[id]
      return e && typeof e === 'object' && typeof e.evidence === 'string' && e.evidence.trim() ? e : null
    }
    /** Its record time, or null — and an undatable step is reported, not trusted. */
    const timeOf = (id) => {
      const e = recorded(id)
      if (!e) return null
      const at = parseTime(e.at)
      if (at === null) {
        problems.set(id, `it carries no record time, so its place in the sequence cannot be judged (a state from before the order check) — ${RE_RECORD(id)}`)
        return null
      }
      return at
    }

    // NOTHING IS ORDERED UNTIL THERE IS SOMETHING TO ORDER. While the second
    // regression is unrecorded the closing is still running, and a half-filled
    // checklist must read as "in progress" — the freeze detector in
    // batch-in-flight reads exactly that. The gate only decides at the tag/tick,
    // by which time this step is recorded or missing on its own account.
    if (!recorded(AFTER_CLEANUP_STEP_ID)) return problems

    const firstAt = timeOf('large-regression')
    let youngest = null
    let oldest = null
    for (const id of CLEANUP_STEP_IDS) {
      const at = timeOf(id)
      if (at === null) continue
      if (youngest === null || at > youngest.at) youngest = { id, at }
      if (oldest === null || at < oldest.at) oldest = { id, at }
    }
    const secondAt = timeOf(AFTER_CLEANUP_STEP_ID)
    const second = recorded(AFTER_CLEANUP_STEP_ID)

    // 1. THE FIRST REGRESSION COMES BEFORE THE CLEANUP. Recorded after it, the
    //    "first" run is really a second one and the sequence never happened.
    if (firstAt !== null && oldest && firstAt > oldest.at) {
      problems.set(
        'large-regression',
        `it was recorded ${iso(firstAt)}, AFTER the cleanup step "${oldest.id}" (${iso(oldest.at)}) — the first regression comes BEFORE the cleanup; record the steps in the order they happened`,
      )
    }

    // 2. THE SECOND REGRESSION NAMES WHAT IT RAN ON.
    const anchors = evidenceAnchors(second.evidence)
    const namesHead = anchors.commits.some((sha) => head && head.startsWith(sha))
    const foreign = anchors.commits.filter((sha) => !(head && head.startsWith(sha)))
    if (!namesHead && foreign.length) {
      problems.set(
        AFTER_CLEANUP_STEP_ID,
        `its evidence names commit ${foreign[0]}, which is NOT the commit being closed (${head.slice(0, 12) || 'unknown'}) — a regression on another commit says nothing about this one`,
      )
      return problems
    }
    if (!namesHead && anchors.times.length === 0) {
      problems.set(
        AFTER_CLEANUP_STEP_ID,
        `its evidence names neither the commit being closed nor a timestamp, so nothing places it after the cleanup — record it as e.g. --evidence "LARGE green on ${head.slice(0, 12) || '<sha>'}, both backends, 2026-08-11T14:00Z"`,
      )
      return problems
    }

    // 3. IT IS A SECOND RUN, NOT THE FIRST ONE WRITTEN DOWN TWICE.
    const first = recorded('large-regression')
    if (first && sameClaim(first.evidence, second.evidence)) {
      problems.set(
        AFTER_CLEANUP_STEP_ID,
        `its evidence is word for word the evidence of "large-regression" — the closing runs the regression TWICE, and one run cannot be both`,
      )
      return problems
    }

    // 4. ITS PLACE IN THE RECORD ORDER. Ties pass: two steps written in the same
    //    millisecond are a fast hand, not a violation.
    if (secondAt !== null && youngest && secondAt < youngest.at) {
      problems.set(
        AFTER_CLEANUP_STEP_ID,
        `it was recorded ${iso(secondAt)}, BEFORE the cleanup step "${youngest.id}" (${iso(youngest.at)}) — a run written down before the cleanup cannot have covered it`,
      )
      return problems
    }
    if (secondAt !== null && firstAt !== null && secondAt < firstAt) {
      problems.set(
        AFTER_CLEANUP_STEP_ID,
        `it was recorded ${iso(secondAt)}, BEFORE "large-regression" (${iso(firstAt)}) — the second regression is the LATER of the two runs`,
      )
      return problems
    }

    // 5. THE TIMES IT NAMES FRAME THE RUN: after the cleanup, and not in a future
    //    it could not have seen when it was written down.
    const earliest = anchors.earliest
    if (earliest && youngest) {
      if (earliest.dateOnly) {
        if (Math.floor(earliest.time / DAY_MS) <= Math.floor(youngest.at / DAY_MS)) {
          problems.set(
            AFTER_CLEANUP_STEP_ID,
            `its evidence dates the run ${earliest.token}, the cleanup's own day or earlier ("${youngest.id}", ${iso(youngest.at)}) — a bare date cannot order two runs of one day, so name the time or the commit ${head.slice(0, 12) || ''}`.trim(),
          )
          return problems
        }
      } else if (earliest.time <= youngest.at) {
        problems.set(
          AFTER_CLEANUP_STEP_ID,
          `its evidence dates the run ${earliest.token}, which is NOT after the youngest cleanup step ("${youngest.id}", ${iso(youngest.at)}) — every time the evidence names must lie after the cleanup, so drop or fix the earlier one`,
        )
        return problems
      }
    }
    if (secondAt !== null) {
      const latest = anchors.times.reduce((a, b) => (a === null || b.time > a.time ? b : a), null)
      // A bare DATE means "some moment that day", so it reads as future only once
      // the whole day lies beyond the record — 2026-08-11 written on 2026-08-11
      // at 09:00 is the same day, not a claim about that evening.
      const beyond = latest && (latest.dateOnly ? Math.floor(latest.time / DAY_MS) > Math.floor(secondAt / DAY_MS) : latest.time > secondAt)
      if (beyond) {
        problems.set(
          AFTER_CLEANUP_STEP_ID,
          `its evidence dates the run ${latest.token}, AFTER the moment it was written down (${iso(secondAt)}) — a run cannot be recorded before it happened`,
        )
      }
    }
  } catch {
    return problems
  }
  return problems
}

/**
 * Why the recorded `regression-after-cleanup` does NOT count for the closing of
 * `headSha`, or '' when it does — the single-step view of `orderProblems`, kept
 * because that step is the one the checklist is named after.
 * Total by contract: anything unreadable → ''.
 */
export function afterCleanupProblem(steps, headSha) {
  try {
    return orderProblems(steps, headSha).get(AFTER_CLEANUP_STEP_ID) ?? ''
  } catch {
    return ''
  }
}

/**
 * Which closing steps are NOT satisfied for `headSha`, given the recorded state.
 * A step is satisfied ONLY when the state is FOR this exact commit and the step
 * has an entry (with evidence). A state recorded for a different commit counts
 * for NOTHING — a closing is per-commit, so re-tagging a new commit needs a
 * fresh closing. A step must additionally stand in the right PLACE in the
 * sequence (point 631, `orderProblems`); when it does not, it is reported
 * missing WITH the reason in `note`.
 * Total: bad input → ALL steps missing (safest: blocks).
 */
export function missingSteps(state, headSha) {
  const done = new Set()
  const notes = new Map()
  try {
    let steps = {}
    if (state && typeof state === 'object' && typeof headSha === 'string' && headSha && state.commit === headSha) {
      steps = state.steps && typeof state.steps === 'object' ? state.steps : {}
      for (const id of Object.keys(steps)) {
        const e = steps[id]
        // A step counts only with a non-empty evidence string — no blank ticks.
        if (STEP_IDS.has(id) && e && typeof e === 'object' && typeof e.evidence === 'string' && e.evidence.trim()) {
          done.add(id)
        }
      }
    }
    // A step in the WRONG PLACE has not been done, whatever it says: the notes
    // travel with it so the block reason can name the position, not just the gap.
    for (const [id, reason] of orderProblems(steps, headSha)) {
      if (!done.has(id)) continue
      done.delete(id)
      notes.set(id, reason)
    }
  } catch {
    done.clear() // unreadable state → nothing counts, which is the safe direction here
    notes.clear()
  }
  return CLOSING_STEPS.filter((s) => !done.has(s.id)).map((s) => (notes.has(s.id) ? { ...s, note: notes.get(s.id) } : s))
}

/** The shared tail of every block reason: what is missing and how to record it. */
function remedy(missing, retry) {
  const list = missing.map((s) => `  - ${s.id}: ${s.title}${s.note ? `\n      RECORDED BUT OUT OF ORDER — ${s.note}` : ''}`).join('\n')
  return (
    `A closing runs the FULL cycle (§7.2 / Maximum-QA Phase 8) IN ORDER: LARGE regression, ` +
    `then the blind-parallel cleanup of code AND documents, then a SECOND LARGE regression ` +
    `after the last cleanup commit — the cleanup is what distinguishes a closing from a ` +
    `regression (the v0.2 miss), and the second regression is what tests it.\nMissing:\n${list}\n` +
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
