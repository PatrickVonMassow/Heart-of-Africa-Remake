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
export const FILE_WRITING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * WHAT COUNTS AS STARTING A NEW UNIT, BY THE SCRIPT IT RUNS — widened
 * deliberately, and the coverage stated (Sol review of d0aebb6, finding 3):
 *   COVERED: the two sanctioned suite launchers (`run-all.mjs`,
 *   `run-logged.mjs` — everything `npm test`/`test:small`/`test:large` also
 *   reaches), delegating an author (`author-sol.mjs`), starting a
 *   cross-vendor review (`review-sol.mjs`) and a delegated ask
 *   (`ask-sol.mjs`) — each begins an expensive new unit of work.
 *   AND TAKING THE BATCH (`batch-claim.mjs`, point 542): a claim is not
 *   bookkeeping, it is the moment a session starts working, and one was
 *   measured at ~250,000 tokens of context. Its refusal names `/clear`
 *   as well as the boundary — see CLEAR_FIRST_SCRIPTS.
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
  'batch-claim.mjs': 'taking the batch, which is where a session begins its work',
}

/**
 * The starting scripts whose refusal must ALSO name `/clear`, because the
 * session can obey it without ending anything (user 19.08.2026: "Bevor die
 * Batch geholt wird, den Benutzer zu clear auffordern und danach zu weiter
 * oder so.").
 *
 * Taking the batch is the one start that is normally made by an ATTENDED
 * window, and an attended window has a cheaper exit than the boundary: clear
 * the context and claim again. Measured at ~250,000 tokens, a claim made
 * unchanged only carries the overrun into the next point. Unattended the
 * ordinary handover applies, so naming both costs nothing.
 */
const CLEAR_FIRST_SCRIPTS = new Set(['batch-claim.mjs'])

/**
 * Where ONE script both starts work and ends it, the ARGUMENTS decide.
 *
 * `batch-claim.mjs` is the case that forced this: `--session <id>` TAKES the
 * batch and is the start of a session's work, while `--status` merely reads
 * and `--withdraw` LETS GO — and a fence that denied the withdrawal would trap
 * the session in the state the withdrawal exists to leave (a pending claim
 * makes the launcher skip its spawn and stalls the batch). The fence's own
 * rule already says it: reads and everything that finishes stay allowed.
 *
 * A script with no entry here starts on every spelling, as before.
 */
const START_SCRIPT_ARG_GATES = {
  'batch-claim.mjs': (argTexts) => !argTexts.some((a) => a === '--status' || a === '--withdraw'),
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

/**
 * THE VALUE-TAKING SHORT OPTIONS of exactly the tool families this classifier
 * reads — ONE table, consulted by every place that interprets a short cluster
 * (Sol round 12). A cluster STOPS at the first value-taking letter: what
 * follows is that option's ATTACHED VALUE, never more option letters. Modelling
 * only `t` was wrong in both directions — `cp -St notes.md TASKS.md` (GNU reads
 * `-St` as `-S t` and copies ONTO the work order) matched the `-t` pattern,
 * read `notes.md` as a target directory and ALLOWED the write; and the sed/perl
 * letter scans denied ordinary READS whose attached value carried the trigger
 * letter (`sed -ffilters.sed TASKS.md`, `perl -MFile::Spec report.pl TASKS.md`).
 *
 * Each letter carries its value's MODE (round 14): 'required' — the value may
 * stand DETACHED, and `splitArgv` consumes the next word when the cluster ends
 * on the letter; 'optional' — the value only ever rides ATTACHED, so nothing
 * after the token may be swallowed. The mode is what lets the ONE table serve
 * consumption everywhere, the eval path included: round 12 skipped detached
 * consumption for the interpreters because sed's `-i` attaches optionally, and
 * that blanket reasoning hid a real defect — `node -r esm -e …` /
 * `python3 -W ignore -c …` read the detached value as the first operand, which
 * ended the leading-flag region and MISSED the eval behind it. The axis is
 * per LETTER, not per tool. A letter ambiguous even at the tool's own help
 * would stay 'optional': not consuming keeps the operand visible, the safe
 * direction for detached values (the cluster-scan rule "unsure → value-taking"
 * is about ATTACHED letters and does not transfer).
 *
 * Each letter checked against the INSTALLED tool (help text plus a probe of
 * the detached form), not guessed:
 *   - `cp/mv/ln --help` (coreutils 9.1): only -S SUFFIX and -t DIRECTORY take
 *     values, both detachable — required;
 *   - `install --help`: -g GROUP, -m MODE, -o OWNER, -S, -t — all required
 *     (`install -m 644 …` probed);
 *   - `sed --help`: -e script, -f script-file, -l N all take detached values
 *     (each probed) — required; -i[SUFFIX] attaches only (`sed -i 's/…/…/'
 *     file` treats the script as the script, probed) — optional;
 *   - `perl -h` + probes: -e/-E commandline take detached values — required;
 *     -Idirectory too (`perl -I lib -e …` probed) — required. -m/-M are
 *     ATTACH-ONLY: `perl -M Carp` dies "Missing argument to -M" without
 *     consuming the next word — optional. -F/pattern/, -i[extension],
 *     -x[directory], -C[list], -D[letters] attach or stand bare (probed:
 *     `perl -F , …` reads `,` as the program file; `-C -e`/`-x -e` keep the
 *     -e an option) — optional. NOT -l and NOT -s: -l[octnum] attaches only
 *     DIGITS (the non-letter stop covers those) and -s takes nothing, so
 *     `-lne`/`-se` stay the evals they really are — listing either would read
 *     their `e` as a value and MISS the write;
 *   - `python3 -h` + probes: -c cmd, -m mod, -W arg, -X opt — all required
 *     (`-W ignore`, `-X utf8` probed detached);
 *   - `node --help` + probes: -C conditions, -e eval, -p print, -r require —
 *     all required (`-r fs`, `-C default` probed detached).
 *
 * THE LONG NAMES of exactly these letters ride beside them in
 * `VALUE_TAKING_LONGS` (round 16): `--require` is only the long spelling of
 * the `-r` already in hand, so its detached value is as knowable as `-r`'s —
 * the residual "a long option's detached value hides the eval" was missing
 * implementation, not information, which disqualifies it as a residual. This
 * is NOT the open-ended per-tool long-option table the contract refuses:
 * only the letters already modelled get their long spelling, exact-name
 * matched (an ABBREVIATED long option — getopt_long's `--suf` — is a
 * constructed spelling and stays outside the claim). The mode is checked per
 * OPTION against the installed tool, not copied blindly from the letter:
 *   - cp/mv/ln `--help`: -S is --suffix, -t is --target-directory — required;
 *   - `install --help` adds -g/--group, -m/--mode, -o/--owner (probed:
 *     `install --mode 644 …` detached) — required;
 *   - `sed --help`: -e/--expression, -f/--file, -l/--line-length (each
 *     probed detached) — required; --in-place[=SUFFIX] attaches only
 *     (probed: `sed --in-place .bak f.sed` reads .bak as the script) —
 *     optional;
 *   - `node --help`: -C/--conditions, -e/--eval, -r/--require — required
 *     (probed: `node --require esm2` dies "Cannot find module 'esm2'", the
 *     detached word IS the value); --print brackets its value (`[...]`) and
 *     leaves a following option an option (probed: `node --print --eval
 *     "2+2"` prints 4) — optional, though no verdict hinges on it: --print
 *     is itself an eval flag, judged on its own token;
 *   - perl has NO long options at all (perlrun: single-letter switches
 *     only), and python3's long roster (--check-hash-based-pycs, --help-*)
 *     aliases none of -c/-m/-W/-X — a letter with no long alias simply has
 *     none.
 */
const req = 'required'
const opt = 'optional'
const VALUE_TAKING_SHORTS = new Map([
  ['cp', new Map([['S', req], ['t', req]])],
  ['mv', new Map([['S', req], ['t', req]])],
  ['install', new Map([['g', req], ['m', req], ['o', req], ['S', req], ['t', req]])],
  ['ln', new Map([['S', req], ['t', req]])],
  ['sed', new Map([['e', req], ['f', req], ['l', req], ['i', opt]])],
  ['perl', new Map([['e', req], ['E', req], ['I', req], ['m', opt], ['M', opt], ['F', opt], ['i', opt], ['x', opt], ['C', opt], ['D', opt]])],
  ['python', new Map([['c', req], ['m', req], ['W', req], ['X', req]])],
  ['python3', new Map([['c', req], ['m', req], ['W', req], ['X', req]])],
  ['node', new Map([['C', req], ['e', req], ['p', req], ['r', req]])],
])
const NO_VALUE_SHORTS = new Map()
const valueShortsOf = (head) => VALUE_TAKING_SHORTS.get(head) ?? NO_VALUE_SHORTS

const COREUTILS_LONGS = new Map([['--suffix', req], ['--target-directory', req]])
const VALUE_TAKING_LONGS = new Map([
  ['cp', COREUTILS_LONGS],
  ['mv', COREUTILS_LONGS],
  ['ln', COREUTILS_LONGS],
  ['install', new Map([...COREUTILS_LONGS, ['--group', req], ['--mode', req], ['--owner', req]])],
  ['sed', new Map([['--expression', req], ['--file', req], ['--line-length', req], ['--in-place', opt]])],
  ['node', new Map([['--conditions', req], ['--eval', req], ['--print', opt], ['--require', req]])],
])
const NO_VALUE_LONGS = new Map()
const valueLongsOf = (head) => VALUE_TAKING_LONGS.get(head) ?? NO_VALUE_LONGS

/**
 * ONE short-flag token, read with the table: the option letters up to and
 * INCLUDING the first value-taking one, plus what that leaves. `-ffilters.sed`
 * with `f` value-taking is the single option `f` (value `filters.sed`);
 * `-St` with `S` value-taking is the single option `S` (value `t` — no `-t`
 * in it); `-tstage` is `t` with value `stage`; `-ri` is `r` plus `i`. A
 * non-letter also ends the letters (`-i.bak`, `-l72`): the rest is an
 * attached value. Null for anything that is not a short-option token.
 */
function splitShortCluster(token, valueTaking) {
  const t = String(token ?? '')
  if (!t.startsWith('-') || t.startsWith('--') || t === '-') return null
  const body = t.slice(1)
  let letters = ''
  let valueLetter = null
  let attached = null
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (!/[A-Za-z]/.test(ch)) {
      attached = body.slice(i)
      break
    }
    letters += ch
    if (valueTaking.has(ch)) {
      valueLetter = ch
      attached = body.slice(i + 1) || null
      break
    }
  }
  return { letters, valueLetter, attached }
}

/** sed's in-place flag: `-i`, `-i.bak`, a cluster carrying it (`-ri`), or the
 *  long form — judged on the cluster's OPTION LETTERS, so an attached value
 *  carrying an `i` (`-ffilters.sed`) is not the flag. Without one, sed writes
 *  to stdout — a READ, and it stays one. */
const inPlaceFlag = (t) =>
  shortOptionLetters(t, valueShortsOf('sed')).includes('i') || t === '--in-place' || t.startsWith('--in-place=')

/** Inline-eval heads and the flag that makes an argument the SCRIPT — each
 *  judged on its cluster's OPTION LETTERS through the one table, so perl's
 *  `-pe`/`-ne`/`-pi -e` all carry it while `-MFile::Spec` carries only `M`,
 *  and python's attached `-c<code>` counts like the detached form. node's
 *  `--eval=`/`--print=` spellings are the flag too, as sed's `--in-place=`
 *  is above. */
const EVAL_FLAGS = new Map([
  [
    'node',
    (t) =>
      t === '--eval' ||
      t === '--print' ||
      t.startsWith('--eval=') ||
      t.startsWith('--print=') ||
      /[ep]/.test(shortOptionLetters(t, valueShortsOf('node'))),
  ],
  ['python', (t) => shortOptionLetters(t, valueShortsOf('python')).includes('c')],
  ['python3', (t) => shortOptionLetters(t, valueShortsOf('python3')).includes('c')],
  ['perl', (t) => /[eE]/.test(shortOptionLetters(t, valueShortsOf('perl')))],
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
 * The ONE argv reader every shell rule shares (Sol round 9, finding 2: the
 * option terminator and attached short options are ordinary argv facts, and
 * three separate parsers had them wrong three ways — in BOTH directions).
 * The facts, implemented once:
 *   - `--` ENDS THE OPTIONS: every later token is an OPERAND however it is
 *     spelled. `cp -- -notes.md docs/new.md` copies a dash-named file, and
 *     `node -- -e x` runs a FILE named `-e` — no eval;
 *   - with `valueTaking` (the tool's `VALUE_TAKING_SHORTS` entry), a short
 *     cluster is read through `splitShortCluster`: a REQUIRED-value letter
 *     ENDING its cluster takes the NEXT word as its value (`cp -S .bak`,
 *     `ln -st /tmp`, `node -r esm`, `python3 -W ignore`), which is consumed,
 *     not an operand — an OPTIONAL-value letter (sed/perl `-i`, perl `-M`)
 *     attaches or stands bare and never swallows the next word (round 14) —
 *     and with `targetOption`, the value of `t` (attached `-tdocs` or
 *     detached) and of `--target-directory[=<dir>]` is the destination. A
 *     letter whose value rides ATTACHED consumes nothing (`-St`: the `t` is
 *     `-S`'s value, so no `-t` fires — Sol round 12);
 *   - with `longValueTaking` (the tool's `VALUE_TAKING_LONGS` entry), a LONG
 *     option is read the same way (round 16): a required-value name standing
 *     bare takes the NEXT word as its value (`node --require esm`, `cp
 *     --suffix .bak`), which is consumed — an `=` spelling carries its value
 *     in the token, and an optional-value name (`--in-place`, `--print`)
 *     never swallows the next word.
 * Judged on the whole token however it was quoted — a quoted `-t` is still
 * the flag. Returns:
 *   operands     — the non-option words, the post-`--` region included;
 *   flags        — option tokens before `--`, at ANY position (GNU tools
 *                  accept trailing options);
 *   leadingFlags — option tokens before BOTH `--` and the first operand,
 *                  where an interpreter's OWN options live;
 *   targetDir    — the target-directory value, or null.
 */
function splitArgv(args, { targetOption = false, valueTaking = NO_VALUE_SHORTS, longValueTaking = NO_VALUE_LONGS } = {}) {
  const operands = []
  const flags = []
  const leadingFlags = []
  let targetDir = null
  let optionsEnded = false
  for (let i = 0; i < args.length; i++) {
    const t = args[i].text
    if (!optionsEnded && t === '--') {
      optionsEnded = true
      continue
    }
    if (optionsEnded || !t.startsWith('-') || t === '-') {
      operands.push(t)
      continue
    }
    flags.push(t)
    if (operands.length === 0) leadingFlags.push(t)
    if (t === '--target-directory' && targetOption) {
      targetDir = args[i + 1] ? args[i + 1].text : null
      i++
      continue
    }
    if (t.startsWith('--target-directory=')) {
      if (targetOption) targetDir = t.slice('--target-directory='.length)
      continue
    }
    // A LONG option through the tool's own long-name table (round 16): a
    // required-value name standing BARE consumes the next word as its value
    // (`node --require esm`, `cp --suffix .bak`) — an `=` spelling carries
    // the value in the token, an optional-value name (`--in-place`,
    // `--print`) swallows nothing, and an unmodelled name is judged as the
    // bare flag it looks like, exactly as before.
    if (t.startsWith('--')) {
      if (!t.includes('=') && longValueTaking.get(t) === req) i++
      continue
    }
    const cluster = splitShortCluster(t, valueTaking)
    if (!cluster || cluster.valueLetter === null) continue
    if (cluster.attached !== null) {
      if (targetOption && cluster.valueLetter === 't') targetDir = cluster.attached
      continue
    }
    // Only a REQUIRED-value option ending its cluster takes the next word —
    // then it is the option's value, never an operand. An optional-value
    // letter (sed/perl -i, perl -M/-F/-C/-D/-x) attaches or stands bare, so
    // consuming here would eat a real operand (round 14).
    if (valueTaking.get(cluster.valueLetter) !== req) continue
    if (targetOption && cluster.valueLetter === 't') targetDir = args[i + 1] ? args[i + 1].text : null
    i++
  }
  return { operands, flags, leadingFlags, targetDir }
}

/**
 * The OPTION LETTERS of one short-flag token — the cluster WITHOUT the value
 * the first value-taking letter swallows (`splitShortCluster` above, on the
 * one table). `-tstage` IS `-t stage`, so its only option letter is `t`; the
 * `s` of `stage` is part of a directory name (Sol round 11: the whole-token
 * scan read that `s` as `-s` and denied a permitted hard-link copy-out). A
 * long flag carries no cluster.
 */
function shortOptionLetters(token, valueTaking = NO_VALUE_SHORTS) {
  const cluster = splitShortCluster(token, valueTaking)
  return cluster ? cluster.letters : ''
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
 *     for EVERY source (`cp notes.md docs/reviews/`). A destination counts
 *     as a directory only ON EVIDENCE — the -t form, a trailing slash, or
 *     the injected type resolver (Sol round 9, finding 1) — and must be
 *     ANCHORED in the repo's own docs/ tree or the project-memory directory
 *     (`authoringDirDestination`), so the backup direction — `cp TASKS.md
 *     /tmp/backup/`, `cp TASKS.md /tmp/docs/` (a foreign tree that merely
 *     CARRIES the name), and `cp TASKS.md docs/task-backup` (a plain-file
 *     destination) — stays the read it is (findings 7.1/9.1);
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
 * TASKS.md`, a copy OUT of the target.
 *
 * WHAT THIS CLASSIFIER CLAIMS — AND WHAT IT DOES NOT. It catches the
 * ORDINARY shell forms that write the fenced documents: redirection, the
 * in-place editors, tee, a copy or move in, dd, the inline evals. It is NOT
 * argv-complete, and does not try to be: shell argv has no classifiable
 * closure (every tool's option table is its own, and open-ended), and Sol
 * rounds 7 and 9 are where that limit was measured — four rounds in, the
 * findings had turned from real escapes into ever more exotic spellings and
 * FALSE DENIALS, the signature of a rule fighting an unbounded surface. A
 * session that constructs an unusual spelling to get past this classifier
 * has already decided to defeat its own fence — the same boundary already
 * ruled for the constructed-symlink class (see resolveThroughAncestors),
 * and for the same reason. Every remaining ambiguity therefore resolves
 * toward the READ: a missed authoring call costs one unfenced edit, while a
 * false denial teaches the session to fight its own tooling — which costs
 * far more. Short-option VALUES are no longer such an ambiguity: the
 * classified families' value-taking letters are recorded in
 * `VALUE_TAKING_SHORTS` with each value's required/optional mode (checked
 * against the installed tools), which is what makes `-St`, `-ffilters.sed`,
 * `-MFile::Spec` and the detached `node -r esm` KNOWABLE rather than guessed
 * at (Sol rounds 11/12 and round 14 — both directions of the `t`-only model
 * and the skipped detached consumption were real defects, not residuals).
 *
 * THE RESIDUAL after that, each item pinned by test and named with the SIDE
 * it falls on. The round-14 test for membership: an item may stand here only
 * if the information needed to close it is NOT already in hand — the
 * required/optional metadata closed two items the round-12 text had
 * rationalised as intended, and round 16 closed a third the same way (the
 * long-option detached value: `--require` is `-r`'s long name, already
 * modelled, so `VALUE_TAKING_LONGS` decides it — what was missing was
 * implementation, not information):
 *   - MISSED WRITE: a directory destination carrying no evidence is judged
 *     the file it was spelled as, so `cp notes.md docs` passes — closing it
 *     needs a FILESYSTEM fact (is `docs` a directory?), which argv cannot
 *     carry and exactly what the injected `isDirectory` supplies where the
 *     guard can;
 *   - REFUSED READ: the deliberate eval over-reach above — an eval that only
 *     READS a fenced document is denied; deciding an eval's intent means
 *     reading its PROGRAM, not its argv, so no table closes it. The ordinary
 *     reads stay open.
 * Each miss is one unfenced edit in a spelling a cooperating session has no
 * reason to write; each refusal costs one message that names the boundary
 * command.
 */
function shellAuthoringTarget(head, args, resolvePath, isDirectory) {
  const texts = args.map((a) => a.text)
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
  if (head === 'sed') {
    // sed's own table consumes -e/-f/-l detached values (round 14): a script
    // file that NAMES a fenced document (`sed -i -f TASKS.md src/x.ts`) is
    // that option's value — a READ of it — not a file operand to deny.
    const { flags, operands } = splitArgv(args, { valueTaking: valueShortsOf('sed'), longValueTaking: valueLongsOf('sed') })
    return flags.some(inPlaceFlag) ? firstNamed(operands) : null
  }
  if (head === 'tee') return firstNamed(splitArgv(args).operands)
  if (head === 'cp' || head === 'mv' || head === 'install') {
    const { targetDir, operands } = splitArgv(args, {
      targetOption: true,
      valueTaking: valueShortsOf(head),
      longValueTaking: valueLongsOf(head),
    })
    const sources = targetDir === null ? operands.slice(0, -1) : operands
    const dest = targetDir === null ? (operands.length >= 2 ? operands[operands.length - 1] : null) : targetDir
    if (dest === null) return null
    // The direct check judges the destination as a FILE, so it sees the
    // NORMALISED spelling: `/tmp/memory/` with its trailing slash would
    // otherwise satisfy the file-level `/memory/` rule while naming no file.
    const direct = authoringTarget(posixNormalizePath(dest))
    if (direct) return direct
    // A destination is a DIRECTORY only ON EVIDENCE (Sol round 9, finding 1:
    // a relative `docs/<sub>` was ASSUMED a directory, so `cp TASKS.md
    // docs/task-backup` — a plain-file destination, the very copy-out this
    // rule promises to keep open — was judged docs/task-backup/TASKS.md and
    // denied). Evidence is: the -t/--target-directory form (a directory by
    // the flag's own meaning), a trailing slash, or the injected
    // `isDirectory` type resolver saying so. Without evidence the
    // destination is judged the FILE it was spelled as — the reading side —
    // and the direct check above has already judged that file.
    const provedDir = () => {
      if (typeof isDirectory !== 'function') return false
      try {
        return isDirectory(dest) === true
      } catch {
        return false
      }
    }
    if (targetDir === null && !/\/$/.test(dest) && !provedDir()) return null
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
    // BEFORE the first non-flag word AND before `--` — the same line
    // `segmentInvokesPathWhere` already draws (Sol round 7, finding 4; round
    // 9, finding 2). Behind either boundary the token belongs to the invoked
    // script (`node tools/report.mjs -e TASKS.md` runs no eval at all, and
    // `node -- -e TASKS.md` runs a FILE named -e), and the approved
    // over-reach covers read-only EVALS, not ordinary calls. The whole-token
    // rule as sed's above holds here too (finding 3): a quoted `--eval` IS
    // the flag, while the start-anchored patterns keep a flag-shaped string
    // inside a longer script body from counting. The interpreter's OWN table
    // consumes a required-value short's detached value (round 14): `node -r
    // esm -e …` / `python3 -W ignore -c …` / `perl -I lib -e …` keep their
    // eval flag in the leading region — round 12 left these open, and that
    // was a real defect, not a residual. The LONG spellings of the same
    // options consume by the same rule through the long-name table (round
    // 16): `node --require esm -e …` is only `-r esm -e …` written out, so
    // the detached value no longer ends the leading region and the eval
    // behind it is seen — that spelling stood pinned as a residual, wrongly:
    // the information was already in hand.
    if (splitArgv(args, { valueTaking: valueShortsOf(head), longValueTaking: valueLongsOf(head) }).leadingFlags.some(isEvalFlag)) {
      return firstNamed(texts.flatMap(pathTokensOf))
    }
  }
  return null
}

/** What ONE parsed segment starts, or null. The carrier call itself starts
 *  nothing — but ONLY that segment: the exemption must not cover whatever
 *  rides beside it on the same line (Sol finding 1). */
function segmentStart(seg, resolvePath, isDirectory) {
  if (segmentInvokesScript(seg, [CARRIER_SCRIPT])) return null
  const { head, args } = headAndArgs(seg)
  if (npmStartsSuite(head, args.map((a) => a.text))) {
    return { what: `starting a browser verify run (\`${seg.raw}\`)`, authoring: false }
  }
  for (const [script, what] of Object.entries(START_SCRIPTS)) {
    if (!segmentInvokesScript(seg, [script])) continue
    const gate = START_SCRIPT_ARG_GATES[script]
    if (gate && !gate(args.map((a) => a.text))) return null
    return { what: `${what} (\`${seg.raw}\`)`, authoring: false, clearFirst: CLEAR_FIRST_SCRIPTS.has(script) }
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
  if (head === 'ln') {
    const { targetDir, operands, flags } = splitArgv(args, {
      targetOption: true,
      valueTaking: valueShortsOf('ln'),
      longValueTaking: valueLongsOf('ln'),
    })
    const symbolic = flags.some((t) => t === '--symbolic' || shortOptionLetters(t, valueShortsOf('ln')).includes('s'))
    const linkTargets = targetDir !== null || operands.length < 2 ? operands : operands.slice(0, -1)
    if (symbolic && linkTargets.some((t) => VERIFY_TREE.test(posixNormalizePath(t)))) {
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
  const mutated = shellAuthoringTarget(head, args, resolvePath, isDirectory)
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
 * (the guard passes `realpathSync`; without one the rule stays lexical), and
 * `isDirectory` the injectable TYPE resolver for the directory-destination
 * evidence (a stat-based check at the guard; without one, a destination
 * carrying no trailing-slash or -t evidence is judged a FILE — the reading
 * side) — the core itself never touches the disk.
 */
export function classifyFenceCall({ toolName, command, filePath, resolvePath, isDirectory } = {}) {
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
      const start = segmentStart(seg, resolvePath, isDirectory)
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
export function fenceRefusal({ tokens, watermark, what, authoring = false, clearFirst = false } = {}) {
  return (
    `PAST THE CONTEXT WATERMARK, NEW WORK IS DENIED (point 700): this session's context measures ` +
    `${tokens} tokens against the ${watermark}-token mark, and this call would START new work (${what}). ` +
    (authoring
      ? `A finding does not need this expensive context — keep it on the CARRIER instead: ` +
        `\`${FENCE_CARRIER_COMMAND}\`; the successor writes the point or section in a cheap context. `
      : '') +
    (clearFirst
      ? `THIS ONE HAS A CHEAPER WAY OUT THAN THE BOUNDARY: ask the user for \`/clear\` and take the batch ` +
        'again in the fresh context — claiming it at this size only carries the overrun into the next ' +
        'point. Unattended, the ordinary handover below applies. '
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
export function contextFenceDecision({
  state,
  tokens,
  watermark,
  toolName,
  command,
  filePath,
  resolvePath,
  isDirectory,
} = {}) {
  if (state !== 'past') return { block: false, reason: null }
  const call = classifyFenceCall({ toolName, command, filePath, resolvePath, isDirectory })
  if (!call.starts) return { block: false, reason: null }
  return {
    block: true,
    reason: fenceRefusal({
      tokens,
      watermark,
      what: call.what,
      authoring: call.authoring,
      clearFirst: call.clearFirst,
    }),
  }
}
