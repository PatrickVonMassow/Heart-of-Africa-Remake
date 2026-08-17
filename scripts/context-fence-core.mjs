// THE CONTEXT FENCE (point 700) — the decision half, pure.
//
// WHY: the context watermark spoke only in the Stop chain, which fires when a
// turn tries to END — so every call that STARTS something (a suite, an agent, a
// new work-order point) went through untouched, and a session measured at 2.9×
// the mark kept starting browser suites and agent rounds for another hour
// (17.08.2026). This core decides, for one PreToolUse call, whether the call
// would START a new unit of work while the measured context is past the mark.
//
// THE FENCE ENDS A SESSION, IT NEVER IDLES ONE (user 17.08.2026). It therefore
// denies ONLY what begins new work — spawning an agent, starting a browser
// verify run, authoring a work-order point / memory / document — and leaves
// everything that FINISHES the step in flight untouched: reads, commits,
// pushes, the landing, the board, the boundary bookkeeping, the fast unit gate.
// A denied session is never trapped: the allowed set contains the whole exit.
//
// FILING A POINT IS STARTING WORK (user 17.08.2026): writing a work-order
// point, a memory or a doc section past the mark feels like bookkeeping and
// costs like work — the measured session wrote three points and two documents
// after the watermark fired. Past the mark a finding goes to the CARRIER (one
// command, one line) and the successor writes it out in a cheap context; the
// refusal names that path.
//
// Fail direction: an unreadable measurement allows EVERYTHING (state
// 'unreadable' → no block). The watermark's own Stop-chain guard already
// alerts loudly on an unobtainable reading; a fence that guessed would deny on
// an assumption, which the measurement rule forbids.
//
// A COMMAND IS CLASSIFIED BY WHAT IT RUNS, NOT BY ITS TEXT (Sol review of
// d0aebb6, finding 1). The first build pattern-matched the raw string, which
// was wrong in both directions: `rg "npm test" docs` — a read whose ARGUMENT
// quotes a suite name — was denied, and `node scripts/finding.mjs … && npm
// test` sailed through because the carrier exemption short-circuited the whole
// line. The classification now runs on `command-classify-core`'s segments
// (quotes honoured, wrappers unwrapped, `bash -c`/`eval`/`$(…)` expanded):
// each segment's actual invocation decides, and the carrier exemption covers
// exactly the segment that IS the carrier call.
import { basename, dirname, join } from 'node:path'
import {
  expandSegments,
  headAndArgs,
  posixNormalizePath,
  segmentInvokesPathWhere,
  segmentInvokesScript,
} from './command-classify-core.mjs'

/** The one command that ends the session — every refusal names it. */
export const FENCE_END_COMMAND = 'node scripts/batch-boundary.mjs --prepare --context'

/** The carrier command a finding goes to instead of the work order/docs. */
export const FENCE_CARRIER_COMMAND =
  'node scripts/finding.mjs --record "<title>" --detail "<one line>"'

/** Tools whose call IS the start of a new unit of work: a delegated agent. */
export const AGENT_TOOLS = new Set(['Agent', 'Task'])

/** Tools that WRITE the file they name. Only these can author; a Read on
 *  TASKS.md is a read, and every read stays allowed whatever the mark says. */
export const FILE_WRITING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

/**
 * WHAT COUNTS AS STARTING A NEW UNIT, BY THE SCRIPT IT RUNS — widened
 * deliberately, and the coverage stated (Sol review of d0aebb6, finding 3):
 *   COVERED: the two sanctioned suite launchers (`run-all.mjs`,
 *   `run-logged.mjs` — everything `npm test`/`test:small`/`test:large` also
 *   reaches), delegating an author (`author-sol.mjs`), starting a
 *   cross-vendor review (`review-sol.mjs`) and a delegated ask
 *   (`ask-sol.mjs`) — each begins an expensive new unit of work.
 *   ALSO COVERED: any DIRECT `node scripts/verify/<x>.mjs` call, judged on
 *   the PATH PREFIX rather than a suite list (Sol review of 534c2ba,
 *   finding 4b) — it starts exactly the browser work the fence exists to
 *   prevent, and a prefix enumerates nothing, so the core stays uncoupled
 *   from scripts/verify/. The AWAITING helper under that prefix
 *   (`run-wait.mjs` — a receipt-await is finishing, not starting) is
 *   explicitly allowed; a future finishing helper there joins
 *   VERIFY_FINISHERS.
 *   CONSCIOUSLY NOT: `run-wait.mjs` (above), `land-point.mjs` and the
 *   board/boundary scripts (the exit itself), and the fast gates
 *   (`npm run test:unit`/`build`/`lint` gate the in-flight commit). No
 *   further starting path through scripts/verify/ remains known.
 */
const START_SCRIPTS = {
  'run-all.mjs': 'starting a browser verify run',
  'run-logged.mjs': 'starting a browser verify run',
  'author-sol.mjs': 'delegating a new authoring run',
  'review-sol.mjs': 'starting a cross-vendor review run',
  'ask-sol.mjs': 'starting a delegated ask run',
}

/** The carrier SCRIPT and file stay usable past the mark — they are the
 *  sanctioned place for a finding, and the refusal points at them. */
const CARRIER_SCRIPT = 'finding.mjs'
const CARRIER_BASENAME = 'findings-carrier.md'

/** Any `.mjs` under this prefix is the verify work itself (a suite or its
 *  launcher) — matched as a PREFIX so nothing is enumerated. The path it
 *  tests arrives POSIX-NORMALISED from `segmentInvokesPathWhere` (Sol round
 *  3, finding 4b): `scripts/./verify/world.mjs` matches, and
 *  `scripts/verify/../board-publish.mjs` — which never runs verify work —
 *  does not. A SYMLINK spelling is judged on its resolved target through the
 *  injected `resolvePath` (Sol round 4: `verify-link -> scripts/verify` made
 *  `node verify-link/world.mjs` pass lexically); the guard injects the real
 *  resolver, this core stays disk-free. */
const VERIFY_PREFIX = /(?:^|\/)scripts\/verify\/[^\s]+\.mjs$/i

/** The finishing helpers under that prefix, allowed by name: awaiting a
 *  receipt ends a step, it starts none. Applied AFTER normalisation, so a
 *  finisher reached through a `..` spelling is still the finisher. */
const VERIFY_FINISHERS = new Set(['run-wait.mjs'])

/** Does this (normalised) path word name verify work that STARTS? */
function startsVerifyPath(p) {
  if (!VERIFY_PREFIX.test(p)) return false
  const norm = p.toLowerCase()
  return !VERIFY_FINISHERS.has(norm.slice(norm.lastIndexOf('/') + 1))
}

/**
 * npm's own subcommands (the npm v10 command roster plus its documented
 * aliases). This set INVERTS the option allowlist it replaced, deliberately
 * (Sol review of e837260, finding 4a): npm's OPTION table is open-ended —
 * every config key is a flag and most take a value — so enumerating
 * value-taking options failed OPEN: one missing entry (`--fetch-retries`)
 * read its value as the subcommand and ALLOWED `npm --fetch-retries 3 test`
 * to start a suite. A missing entry HERE fails CLOSED instead: a subcommand
 * this set cannot name reads as undeterminable, and undeterminable is treated
 * as STARTING. That asymmetry is the fence's whole point — a false deny costs
 * one refusal that names the boundary command; a false allow costs the
 * mechanism the session was supposed to end at.
 */
const NPM_SUBCOMMANDS = new Set([
  'access', 'add', 'adduser', 'audit', 'author', 'bugs', 'cache', 'ci', 'cit', 'clean-install',
  'clean-install-test', 'completion', 'config', 'create', 'ddp', 'dedupe', 'deprecate', 'diff',
  'dist-tag', 'docs', 'doctor', 'edit', 'exec', 'explain', 'explore', 'find-dupes', 'fund', 'get',
  'help', 'help-search', 'home', 'i', 'ic', 'in', 'info', 'init', 'innit', 'ins', 'inst', 'insta',
  'instal', 'install', 'install-ci-test', 'install-clean', 'install-test', 'isnt', 'isnta', 'isntal',
  'isntall', 'issues', 'it', 'la', 'link', 'list', 'll', 'ln', 'login', 'logout', 'ls', 'org',
  'outdated', 'owner', 'pack', 'ping', 'pkg', 'prefix', 'profile', 'prune', 'publish', 'query', 'r',
  'rb', 'rebuild', 'remove', 'repo', 'restart', 'rm', 'root', 'rum', 'run', 'run-script', 's', 'sbom',
  'se', 'search', 'set', 'show', 'shrinkwrap', 'sit', 'star', 'stars', 'start', 'stop', 't', 'team',
  'test', 'token', 'tst', 'un', 'uninstall', 'unlink', 'unpublish', 'unstar', 'up', 'update',
  'upgrade', 'urn', 'v', 'version', 'view', 'whoami', 'why', 'x',
])

/** The subcommands that ARE a suite start, and the run-scripts that are. */
const NPM_SUITE_SUBCOMMANDS = new Set(['test', 't', 'tst'])
const NPM_SUITE_SCRIPTS = new Set(['test', 'test:small', 'test:large'])

/** npm's argv words that are not flags. A flag's detached VALUE stays in this
 *  list on purpose — which flags consume one is exactly what cannot be known
 *  without npm's open-ended option table. */
function npmWordsOf(argTexts) {
  return argTexts.map((t) => String(t ?? '')).filter((t) => t && !t.startsWith('-'))
}

/**
 * Does this npm call start the browser regression? Judged on npm's
 * SUBCOMMAND where that is UNAMBIGUOUS, and fail-CLOSED where it is not:
 *   - The subcommand is the first positional that IS a known npm subcommand;
 *     the words before it may be options' detached values (`npm --loglevel
 *     warn run build`), which absolve nothing and are skipped.
 *   - `test`/`t`/`tst`, and `run`/`run-script` of test/test:small/test:large,
 *     START. `npm run test:unit`/`build`/`lint` and the rest finish or read.
 *   - Positionals but NO recognisable subcommand — an option value may BE the
 *     subcommand we failed to see (`npm --fetch-retries 3`) — read STARTING.
 *   - A suite token among the OTHER positionals also reads STARTING: the
 *     recognised word may itself have been an option's value standing in
 *     front of the real subcommand (`npm --loglevel ls test`).
 * The false denies this buys (`npm ls test`, `npm view test` past the mark
 * — the latter re-found as a defect by Sol round 4 and ruled INTENDED) each
 * cost one refusal naming the boundary command; the escapes it closes cost
 * the fence.
 */
function npmStartsSuite(head, argTexts) {
  if (head !== 'npm') return false
  const pos = npmWordsOf(argTexts)
  const at = pos.findIndex((p) => NPM_SUBCOMMANDS.has(p.toLowerCase()))
  if (at === -1) return pos.length > 0 // undeterminable subcommand → starting
  const sub = pos[at].toLowerCase()
  if (NPM_SUITE_SUBCOMMANDS.has(sub)) return true
  if ((sub === 'run' || sub === 'run-script') && NPM_SUITE_SCRIPTS.has((pos[at + 1] ?? '').toLowerCase())) return true
  return pos.some(
    (p, i) => i !== at && (NPM_SUITE_SUBCOMMANDS.has(p.toLowerCase()) || NPM_SUITE_SCRIPTS.has(p.toLowerCase())),
  )
}

const basenameOf = (p) => {
  const parts = String(p ?? '').replace(/\\/g, '/').toLowerCase().split('/')
  return parts[parts.length - 1]
}

/** Does this file path name an AUTHORING target (work order, doc, memory)?
 *  Returns the description of what it starts, or null. */
export function authoringTarget(filePath) {
  const raw = String(filePath ?? '').trim()
  if (!raw) return null
  const norm = raw.replace(/\\/g, '/').toLowerCase()
  const base = basenameOf(norm)
  if (base === CARRIER_BASENAME) return null // the carrier is the way to KEEP a finding
  if (base === 'tasks.md' || base === 'tasks-archive.md') return 'authoring in the work order'
  if (base === 'memory.md' || /(?:^|\/)memory\//.test(norm)) return 'authoring a memory'
  if (base === 'claude.md' || base === 'design.md') return 'authoring a document section'
  if (/(?:^|\/)docs\//.test(norm) && base.endsWith('.md')) return 'authoring a document section'
  return null
}

/** The verify tree itself, as a directory — for the one constructed-escape
 *  catch below (a link TARGETING it), matched on the normalised path. */
const VERIFY_TREE = /(?:^|\/)scripts\/verify(?:\/|$)/i

/** sed's in-place flag: `-i`, `-i.bak`, a cluster carrying it (`-ri`), or the
 *  long form. Without one, sed writes to stdout — a READ, and it stays one. */
const inPlaceFlag = (t) => /^-[A-Za-z]*i/.test(t) || t === '--in-place' || t.startsWith('--in-place=')

/** Inline-eval heads and the flag that makes an argument the SCRIPT. perl's
 *  is a cluster test (`-pe`, `-ne`, `-pi -e` all carry it). */
const EVAL_FLAGS = new Map([
  ['node', (t) => t === '-e' || t === '--eval' || t === '-p' || t === '--print'],
  ['python', (t) => t === '-c'],
  ['python3', (t) => t === '-c'],
  ['perl', (t) => /^-[A-Za-z]*[eE]/.test(t)],
])

/** Path-like tokens inside an inline script's text: split on the characters
 *  none of the fenced paths contain. `fs.appendFileSync('TASKS.md', …)` yields
 *  the token `TASKS.md`. */
function pathTokensOf(text) {
  return String(text ?? '')
    .split(/[\s'"`()[\]{},;=]+/)
    .filter(Boolean)
}

/**
 * cp/mv/install/ln argv, split into its bare OPERANDS and the
 * `-t <dir>`/`--target-directory=<dir>` destination where one is given (Sol
 * round 7, finding 2: both forms leave one positional, so a `pos.length < 2`
 * rule read them as having no destination at all). Judged on the whole token
 * however it was quoted — a quoted `-t` is still the flag.
 */
function destinationSplit(args) {
  let targetDir = null
  const operands = []
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text
    if (t === '-t' || t === '--target-directory') {
      targetDir = args[i + 1] ? args[i + 1].text : null
      i++
      continue
    }
    if (t.startsWith('--target-directory=')) {
      targetDir = t.slice('--target-directory='.length)
      continue
    }
    if (t.startsWith('-')) continue
    operands.push(t)
  }
  return { targetDir, operands }
}

/**
 * Is this DESTINATION a directory of the fenced trees — the repository's OWN
 * docs/ tree or the PROJECT-MEMORY directory? ANCHORED, not name-matched
 * (Sol round 7, finding 1: `/(?:^|\/)(docs|memory)$/` took any path ENDING in
 * the name, so `cp TASKS.md /tmp/docs/` — the very copy-out the rule promises
 * to keep open — was denied). The anchor is judged the way the rest of the
 * fence resolves repo-relative paths:
 *   - a RELATIVE spelling resolves against the repo root (where the guard
 *     resolves every relative word), so a normalised `docs` or `docs/<sub>`
 *     IS the repo's own tree — and any directory UNDER it counts (finding 2:
 *     `docs/reviews/` is as much an authoring destination as the root);
 *   - an ABSOLUTE or `..` spelling counts only where the injected resolver
 *     PROVES it lies under the repo's own docs/ (`resolvePath('docs')` names
 *     that tree's real path). No resolver, no proof, no anchor — an
 *     unprovable destination stays the read it claims to be, the fail
 *     direction the caller states;
 *   - the project-memory directory lives OUTSIDE any repository, so no repo
 *     anchor exists for it; it is identified by its FULL shape
 *     (`.claude/projects/<slug>/memory`), which a scratch tree does not
 *     carry — a bare `/tmp/memory/` anchors nothing.
 * Returns the directory the dir/<source basename> joins are judged under, or
 * null.
 */
const MEMORY_DIR_SHAPE = /(?:^|\/)\.claude\/projects\/[^/]+\/memory(?:\/|$)/i

function authoringDirDestination(dest, resolvePath) {
  const norm = posixNormalizePath(dest)
  if (/^docs(?:\/|$)/i.test(norm) || MEMORY_DIR_SHAPE.test(norm)) return norm
  if (typeof resolvePath !== 'function') return null
  let docsRoot = null
  let real = null
  try {
    docsRoot = resolvePath('docs')
    real = resolvePath(norm)
  } catch {
    return null // unresolvable → no anchor; the reading side wins
  }
  if (typeof docsRoot !== 'string' || !docsRoot || typeof real !== 'string' || !real) return null
  const rootNorm = posixNormalizePath(docsRoot)
  const realNorm = posixNormalizePath(real)
  if (realNorm === rootNorm || realNorm.startsWith(`${rootNorm}/`)) return realNorm
  return MEMORY_DIR_SHAPE.test(realNorm) ? realNorm : null
}

/**
 * Authoring by SHELL MUTATION (Sol round 6, finding A). The redirection rule
 * below caught only parsed `>`/`>>` targets, while a shell mutates the work
 * order just as ORDINARILY through an in-place editor, tee, a copy INTO the
 * target, dd, or an inline eval — and past the mark such a call must be
 * refused with the carrier named. Caught by the TOOL plus its TARGET:
 *   - `sed` WITH an in-place flag whose file operand is an authoring target;
 *   - `tee` (with or without -a) naming one as its output;
 *   - `cp`/`mv`/`install` whose DESTINATION is one — the last operand or the
 *     `-t <dir>`/`--target-directory=<dir>` form (Sol round 7, finding 2) —
 *     including a DIRECTORY as destination, judged as dir/<source basename>
 *     for EVERY source (`cp notes.md docs/reviews/`). The directory must be
 *     ANCHORED in the repo's own docs/ tree or the project-memory directory
 *     (`authoringDirDestination`), so the backup direction — `cp TASKS.md
 *     /tmp/backup/`, and equally `cp TASKS.md /tmp/docs/`, a foreign tree
 *     that merely CARRIES the name — stays the read it is (finding 1);
 *   - `dd of=<target>`;
 *   - `node -e` / `python -c` / `perl -e` — the eval flag standing among the
 *     INTERPRETER OPTIONS, before the first non-flag word; behind it the
 *     token is the invoked script's own argument, not an eval (Sol round 7,
 *     finding 4) — whose script text or arguments name
 *     one. DELIBERATE OVER-REACH on the eval forms: an eval that only READS
 *     the target is denied too — its intent is not cheaply decidable from
 *     outside, and the ordinary reads (the Read tool, `sed -n`, `grep`, `cat`)
 *     all stay open, so the session keeps a way to find anything out.
 * Everything that READS stays allowed — `sed -n '1,20p' TASKS.md`, `grep …
 * TASKS.md`, a copy OUT of the target — and where a form cannot be told apart
 * cheaply the READING side wins: a missed authoring call costs one unfenced
 * edit, a denied read costs the session its way forward.
 */
function shellAuthoringTarget(head, args, resolvePath) {
  const texts = args.map((a) => a.text)
  const pos = texts.filter((t) => !t.startsWith('-'))
  const firstNamed = (candidates) => {
    for (const c of candidates) {
      const target = authoringTarget(c)
      if (target) return target
    }
    return null
  }
  // A token that EQUALS a flag is the flag however it was written (Sol round
  // 7, finding 3): quoting changes nothing about argv, so `sed '-i' …` edits
  // in place exactly as the unquoted form does. The protection quoting really
  // owes — a flag STRING inside a longer script body — is already given by
  // the start-anchored whole-token patterns: `sed 's/-i/x/' TASKS.md` is a
  // substitution whose token starts with `s`, and it stays the read it is.
  if (head === 'sed' && args.some((a) => inPlaceFlag(a.text))) return firstNamed(pos)
  if (head === 'tee') return firstNamed(pos)
  if (head === 'cp' || head === 'mv' || head === 'install') {
    const { targetDir, operands } = destinationSplit(args)
    const sources = targetDir === null ? operands.slice(0, -1) : operands
    const dest = targetDir === null ? (operands.length >= 2 ? operands[operands.length - 1] : null) : targetDir
    if (dest === null) return null
    // The direct check judges the destination as a FILE, so it sees the
    // NORMALISED spelling: `/tmp/memory/` with its trailing slash would
    // otherwise satisfy the file-level `/memory/` rule while naming no file.
    const direct = authoringTarget(posixNormalizePath(dest))
    if (direct) return direct
    // Into a DIRECTORY of the fenced trees: the file that appears there is
    // dir/<source basename>, and with several sources EVERY one lands there,
    // so each join is judged. The directory must be ANCHORED
    // (`authoringDirDestination`) — joining the basename onto an arbitrary
    // destination would deny the backup direction (`cp TASKS.md /tmp/backup/`,
    // `cp TASKS.md /tmp/docs/`), which is a READ of the work order.
    const dir = authoringDirDestination(dest, resolvePath)
    if (dir) return firstNamed(sources.map((src) => `${dir}/${basenameOf(src)}`))
    return null
  }
  if (head === 'dd') return firstNamed(texts.filter((t) => /^of=/i.test(t)).map((t) => t.slice(3)))
  const isEvalFlag = EVAL_FLAGS.get(head)
  if (isEvalFlag) {
    // An eval flag is an INTERPRETER option, and an interpreter option stands
    // BEFORE the first non-flag word — the same line
    // `segmentInvokesPathWhere` already draws (Sol round 7, finding 4).
    // Behind that word a `-e` belongs to the invoked script (`node
    // tools/report.mjs -e TASKS.md` runs no eval at all), and the approved
    // over-reach covers read-only EVALS, not ordinary calls. The whole-token
    // rule as sed's above holds here too (finding 3): a quoted `--eval` IS
    // the flag, while the start-anchored patterns keep a flag-shaped string
    // inside a longer script body from counting. BOUNDED MISS, the reading
    // side winning as stated above: a detached option VALUE before the flag
    // (`node --require esm -e …`) reads as the first non-flag word without
    // every interpreter's option table, so that spelling passes — one
    // unfenced edit, against idling ordinary script calls.
    const firstBare = args.findIndex((a) => !a.text.startsWith('-'))
    const options = firstBare === -1 ? args : args.slice(0, firstBare)
    if (options.some((a) => isEvalFlag(a.text))) return firstNamed(texts.flatMap(pathTokensOf))
  }
  return null
}

/** What ONE parsed segment starts, or null. The carrier call itself starts
 *  nothing — but ONLY that segment: the exemption must not cover whatever
 *  rides beside it on the same line (Sol finding 1). */
function segmentStart(seg, resolvePath) {
  if (segmentInvokesScript(seg, [CARRIER_SCRIPT])) return null
  const { head, args } = headAndArgs(seg)
  if (npmStartsSuite(head, args.map((a) => a.text))) {
    return { what: `starting a browser verify run (\`${seg.raw}\`)`, authoring: false }
  }
  for (const [script, what] of Object.entries(START_SCRIPTS)) {
    if (segmentInvokesScript(seg, [script])) return { what: `${what} (\`${seg.raw}\`)`, authoring: false }
  }
  // A DIRECT call into scripts/verify/ starts the same browser work the
  // sanctioned launchers do — judged on the path prefix (symlink spellings
  // resolved where a resolver is injected), finishers excepted.
  if (segmentInvokesPathWhere(seg, startsVerifyPath, { resolvePath })) {
    return { what: `starting a verify script directly (\`${seg.raw}\`)`, authoring: false }
  }
  // A segment that CREATES a symlink into scripts/verify counts as starting
  // a verify run itself (Sol round 6, finding B; narrowed by round 7,
  // finding 5 — the one cheap catch stays exactly one construction wide):
  // `ln -s scripts/verify late-link` exists only to run the fenced work
  // through a name the resolver cannot see yet (the link is unborn when it
  // runs). So the catch takes `-s` AND judges the LINK TARGET (the source
  // operand) — a HARD link out of the tree (`ln scripts/verify/world.mjs
  // /tmp/world.mjs`) is the copy-shaped escape already pinned as the
  // intended limit, and an `ln -s` pointing elsewhere is ordinary file work.
  // This closes the literal construction; the CLASS of constructed escapes
  // stays outside the fence's claim — see resolveThroughAncestors.
  if (head === 'ln' && args.some((a) => /^-[A-Za-z]*s/.test(a.text) || a.text === '--symbolic')) {
    const { targetDir, operands } = destinationSplit(args)
    const linkTargets = targetDir !== null || operands.length < 2 ? operands : operands.slice(0, -1)
    if (linkTargets.some((t) => VERIFY_TREE.test(posixNormalizePath(t)))) {
      return { what: `constructing a link into the verify tree (\`${seg.raw}\`)`, authoring: false }
    }
  }
  // Authoring by REDIRECTION — `echo "- [ ] 999. x" >> TASKS.md` writes the
  // work order without the Edit tool. Judged on the parsed redirect TARGET,
  // so a `>` inside a quoted argument never counts (that false deny is the
  // classifier defect this whole rewrite removes).
  for (const r of Array.isArray(seg?.redirects) ? seg.redirects : []) {
    if (!r.op.includes('>') || r.op.endsWith('&') || !r.target) continue
    const target = authoringTarget(r.target)
    if (target) return { what: `${target} via redirection (\`${seg.raw}\`)`, authoring: true }
  }
  // Authoring by SHELL MUTATION — the tool-plus-target forms the helper names.
  const mutated = shellAuthoringTarget(head, args, resolvePath)
  if (mutated) return { what: `${mutated} via a shell mutation (\`${seg.raw}\`)`, authoring: true }
  return null
}

/**
 * Resolve an ABSOLUTE path through `realpath`, seeing through a symlinked
 * DIRECTORY even when the LEAF does not exist yet (Sol round 5): a compound
 * command may CREATE `verify-link/new.mjs` and run it in the same guarded
 * call, and a leaf realpath cannot reach used to fall back to its lexical
 * spelling — the symlinked directory went unseen. So the longest EXISTING
 * ancestor is resolved and the unresolved tail re-appended. Null when nothing
 * resolves at all (no such tree, or the resolver denied every level): the
 * caller then judges the LEXICAL shape, which can still DENY but never
 * becomes an accept. Pure over the injected `realpath` — this core still
 * touches no disk; the guard passes `realpathSync`.
 *
 * THE BOUNDARY OF THIS CLAIM (ruled at Sol round 6). Resolution exists to see
 * through links that ALREADY EXIST for ordinary reasons — not to defeat a
 * session constructing an escape in the same command. Sol's `ln -s
 * scripts/verify late-link && node late-link/world.mjs` beats the resolver
 * (the link is unborn when the call is judged, so the lexical spelling
 * outside scripts/verify is what gets judged), and `cp -r scripts/verify
 * /tmp/x && node /tmp/x/world.mjs` is the same escape with no symlink in it:
 * the class has no lexical closure. This fence binds a COOPERATING session
 * against its own watermark; it is not a sandbox and cannot become one — a
 * command built to run the fenced work through a fresh name has already
 * decided to defeat its own fence. One cheap catch is taken (an `ln` whose
 * TARGET lies under scripts/verify counts as starting a verify run —
 * `segmentStart`), which closes the literal example; the copy-based
 * constructed escape PASSES and is pinned by test as the intended limit,
 * not an oversight.
 */
export function resolveThroughAncestors(abs, { realpath } = {}) {
  if (typeof realpath !== 'function') return null
  let dir = String(abs ?? '')
  if (!dir) return null
  const tail = []
  for (;;) {
    try {
      const real = realpath(dir)
      if (typeof real === 'string' && real) return tail.length ? join(real, ...tail.reverse()) : real
      return null
    } catch {
      const parent = dirname(dir)
      if (!parent || parent === dir) return null // ran out of ancestors
      tail.push(basename(dir))
      dir = parent
    }
  }
}

/**
 * Does this call START a new unit of work? PURE.
 * Returns { starts, what, authoring } — `authoring` marks the refusals that
 * must name the carrier as the way to keep a finding.
 * `resolvePath` is the injectable path resolver for the verify-prefix rule
 * (the guard passes `realpathSync`; without one the rule stays lexical) —
 * the core itself never touches the disk.
 */
export function classifyFenceCall({ toolName, command, filePath, resolvePath } = {}) {
  const tool = String(toolName ?? '').trim()
  if (AGENT_TOOLS.has(tool)) {
    return { starts: true, what: 'spawning a delegated agent', authoring: false }
  }
  const cmd = typeof command === 'string' ? command.trim() : ''
  if (cmd) {
    // Every segment the command really runs — quotes honoured, wrappers
    // (`sudo`, `timeout`, `bash -c`, `eval`, `$(…)`) unwrapped — judged one
    // by one. Any starting segment denies; a line of finishing segments
    // passes whatever suite names its quoted arguments mention.
    for (const seg of expandSegments(cmd)) {
      const start = segmentStart(seg, resolvePath)
      if (start) return { starts: true, ...start }
    }
    return { starts: false, what: null, authoring: false }
  }
  if (FILE_WRITING_TOOLS.has(tool)) {
    const target = authoringTarget(filePath)
    if (target) return { starts: true, what: target, authoring: true }
  }
  return { starts: false, what: null, authoring: false }
}

/** The refusal, pinned by tests rather than improvised at the one moment it
 *  matters. Names the mark, the measurement, the carrier (for authoring) and
 *  the one command that ends the session. */
export function fenceRefusal({ tokens, watermark, what, authoring = false } = {}) {
  return (
    `PAST THE CONTEXT WATERMARK, NEW WORK IS DENIED (point 700): this session's context measures ` +
    `${tokens} tokens against the ${watermark}-token mark, and this call would START new work (${what}). ` +
    (authoring
      ? `A finding does not need this expensive context — keep it on the CARRIER instead: ` +
        `\`${FENCE_CARRIER_COMMAND}\`; the successor writes the point or section in a cheap context. `
      : '') +
    `Finish the step in flight — commits, pushes, the landing, the board and the boundary bookkeeping all ` +
    `stay allowed — then END THIS SESSION: \`${FENCE_END_COMMAND}\`, its bookkeeping, then ` +
    '`--commit --context` as the last repository action. A running verification is NO reason to stay: ' +
    'it transfers through its run record and the successor reads the receipt.'
  )
}

/**
 * THE VERDICT for one PreToolUse call. PURE.
 *
 * `state`/`tokens`/`watermark` come from a real watermark reading
 * (`watermarkDecision`): only a measured 'past' can deny — 'below' allows all,
 * and 'unreadable' fails OPEN (never a deny on an assumption).
 * Returns { block, reason }.
 */
export function contextFenceDecision({ state, tokens, watermark, toolName, command, filePath, resolvePath } = {}) {
  if (state !== 'past') return { block: false, reason: null }
  const call = classifyFenceCall({ toolName, command, filePath, resolvePath })
  if (!call.starts) return { block: false, reason: null }
  return { block: true, reason: fenceRefusal({ tokens, watermark, what: call.what, authoring: call.authoring }) }
}
