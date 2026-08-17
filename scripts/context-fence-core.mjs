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
  // Authoring by REDIRECTION — `echo "- [ ] 999. x" >> TASKS.md` writes the
  // work order without the Edit tool. Judged on the parsed redirect TARGET,
  // so a `>` inside a quoted argument never counts (that false deny is the
  // classifier defect this whole rewrite removes).
  for (const r of Array.isArray(seg?.redirects) ? seg.redirects : []) {
    if (!r.op.includes('>') || r.op.endsWith('&') || !r.target) continue
    const target = authoringTarget(r.target)
    if (target) return { what: `${target} via redirection (\`${seg.raw}\`)`, authoring: true }
  }
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
