// THE OPENAI AUTHORING LANE, decided (point 667). Pure half.
//
// `scripts/review-sol.mjs` and `scripts/ask-sol.mjs` send Sol work it may only
// READ. This lane sends it work it WRITES: a point, on its own branch, in its
// own worktree, committed step by step. Claude then reviews it, runs the suites,
// judges the picture and lands it — the role swap of CLAUDE.md §6, which keeps
// two vendors on every point and lets neither review itself.
//
// TWO THINGS ARE DIFFERENT FROM THE READ-ONLY PATHS, and both are load-bearing:
//
// 1. THE SANDBOX IS OFF, and it has to be. Measured 13.08.2026 (and again on
//    every earlier Sol path): this container cannot create unprivileged user
//    namespaces, so codex's bubblewrap launcher dies before ANY command of the
//    model's runs — `codex sandbox read-only -- echo hi` prints the bwrap error
//    and nothing else. A read-only reviewer works around it by having the
//    artefact FED to it; an author that cannot run `git commit` cannot author.
//    So the run uses `--dangerously-bypass-approvals-and-sandbox`, whose own
//    documentation names the condition we are in: "intended solely for running
//    in environments that are externally sandboxed". The container is that
//    sandbox. What this file can still control, it does — see `childEnv` and
//    `readinessProblems` — and what it cannot is written down rather than
//    implied: inside this container the run has the filesystem access the
//    session itself has.
//
// 2. NOTHING IS TAKEN ON TRUST AFTERWARDS. The read-only paths refuse to record
//    an answer nobody gave; this one refuses to report work nobody did. What
//    counts is what is IN GIT — the commits that appeared, their trailers, the
//    tree left behind — never what the run said about itself (`judgeAuthoring`).
//
// Side-effect free: the spawn, the git work and the push belong to
// scripts/author-sol.mjs. Pinned by author-sol-core.test.mjs.

import { ALLOWED_TRAILERS, classifyTrailer, modelNamesIn } from './model-guard-core.mjs'
import { sameModel } from './mechanism-review-core.mjs'
import { SOL_MODEL_ID, SOL_MODEL_NAME, SOL_REASONING_EFFORT } from './review-sol-core.mjs'

export { SOL_MODEL_ID, SOL_MODEL_NAME, SOL_REASONING_EFFORT }

/** The trailer every commit of this lane carries — the allowlist's own spelling,
 *  so the `commit-msg` gate and the serving-model tripwire both accept it. */
export const SOL_TRAILER = ALLOWED_TRAILERS.find((t) => /sol/i.test(t)) ?? ''

/** An authoring run may take longer than a review: it builds and tests. */
export const AUTHOR_TIMEOUT_MS = 60 * 60_000

/**
 * How often the WRAPPER pushes while the run is still going (cross-vendor review
 * of point 667, P2).
 *
 * CLAUDE.md §6 demands a push after every commit, and the child cannot give one:
 * pushing needs a credential, and handing a credential to a sandbox-less run is
 * a worse trade than the delay. So the wrapper pushes on this interval instead —
 * a commit is durable within two minutes of being made rather than at the end of
 * an hour-long run. It is a fast-forward of a branch only this run is writing,
 * so it cannot collide with the work in progress.
 *
 * THIS IS A RESIDUAL, NOT COMPLIANCE (third cross-vendor round). The rule says
 * immediately; this says within two minutes, and a container that dies inside
 * that window loses exactly what the rule protects. It is the smallest gap the
 * trade allows, and it is named rather than counted as a rule kept.
 */
export const PUSH_INTERVAL_MS = 2 * 60_000

/** How long ONE push may take before it is given up on. The interim push runs on
 *  the same event loop as the run's kill timer, so an unbounded one would block
 *  the bound (second cross-vendor round). */
export const PUSH_TIMEOUT_MS = 60_000

/** After SIGTERM, how long the run gets to exit before it is SIGKILLed — and
 *  after that, how long its pipes get to close before the wrapper stops waiting.
 *  A timeout that only asks politely is not a bound: a child ignoring SIGTERM,
 *  or a grandchild holding the pipes open, left the promise waiting for ever
 *  (second cross-vendor round). */
export const KILL_GRACE_MS = 20_000

/**
 * The environment the authoring child gets: this one MINUS anything that reads
 * like a credential.
 *
 * HYGIENE, NOT CONTAINMENT — and the difference matters enough to write down
 * (cross-vendor review of point 667, P0). With the sandbox off, the run has this
 * session's filesystem access: it can read `.secrets/`, use a credential helper
 * and push. Removing the variables does not prevent that, and a claim that it
 * did would be false. What it does buy is that nothing leaks by ACCIDENT — a
 * token in the environment is spent by any command that happens to look there,
 * a token in a file is spent only by a run that goes for it deliberately.
 *
 * Fails towards dropping: an unknown variable that merely LOOKS like a secret
 * costs nothing to remove, while one wrongly kept is the whole risk. The
 * segments are matched WHOLE, so `GIT_AUTHOR_NAME` survives while `SSH_AUTH_SOCK`
 * does not.
 */
export const SENSITIVE_ENV =
  /(?:^|_)(TOKENS?|SECRETS?|PASSWORDS?|PASSWD|CREDENTIALS?|PAT|KEYS?|AUTH|ASKPASS|COOKIE|SESSION|JWT|NETRC|KUBECONFIG)(?:_|$)|API_?KEYS?|DATABASE_URL|CONNECTION_STRING|PGPASS|PGSERVICEFILE|NETRC|KUBECONFIG|_PWD$/i

/**
 * …and the whole `GIT_CONFIG_*` family goes together, whatever it is called.
 *
 * `GIT_CONFIG_KEY_0` matches the rule above and `GIT_CONFIG_COUNT` does not, so
 * filtering name by name left git a COUNT with no KEY — a malformed tuple that
 * makes every git command in the run fail (second cross-vendor round). They are
 * also configuration injected from the environment, which a run in an isolated
 * worktree has no business inheriting: the fixture suites drop them for exactly
 * that reason.
 */
export const GIT_CONFIG_ENV = /^GIT_CONFIG/i

/** Is this variable withheld from the authoring child? */
export function isWithheldEnv(key) {
  const name = String(key ?? '')
  return SENSITIVE_ENV.test(name) || GIT_CONFIG_ENV.test(name)
}

export function childEnv(env = {}) {
  const out = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (!isWithheldEnv(key)) out[key] = value
  }
  return out
}

/** The names `childEnv` removed, so the run can SAY what it withheld. */
export function withheldEnvNames(env = {}) {
  return Object.keys(env ?? {}).filter(isWithheldEnv).sort()
}

/**
 * The `codex exec` command line for an AUTHORING run.
 *
 * Same shape as the review path's `codexArgs`, with the two differences the lane
 * needs: the sandbox is bypassed (see the header) and the working root is the
 * POINT'S WORKTREE, so every relative path the model uses lands there.
 */
export function authoringCodexArgs({
  modelId = SOL_MODEL_ID,
  effort = SOL_REASONING_EFFORT,
  cwd = '',
  outputFile = '',
  prompt = '',
} = {}) {
  const args = [
    'exec',
    '--color',
    'never',
    '--dangerously-bypass-approvals-and-sandbox',
    '-m',
    String(modelId),
    '-c',
    `model_reasoning_effort=${String(effort)}`,
  ]
  if (cwd) args.push('-C', String(cwd))
  if (outputFile) args.push('-o', String(outputFile))
  args.push(String(prompt))
  return args
}

/**
 * May this run start at all? Returns the refusals, empty when it may.
 *
 * The checks are the ones whose absence is unrecoverable rather than merely
 * annoying. Authoring straight onto `main`, or into the main checkout, would put
 * an unreviewed model's commits on the deployed branch — and a dirty tree makes
 * "what did Sol write" unanswerable afterwards, which is the question every
 * check below it depends on.
 */
export function readinessProblems({ branch = '', worktree = '', mainCheckout = '', dirty = '' } = {}) {
  const problems = []
  const b = String(branch ?? '').trim()
  // THE RULE IS `feat/`, SO THAT IS WHAT IS CHECKED (cross-vendor review, P1).
  // Listing `main` and `HEAD` by name let `master`, `release` and `gh-pages`
  // through while the refusal claimed to demand a feature branch.
  if (!b) problems.push('the branch could not be read — refusing to author into an unknown ref')
  else if (!/^feat\//.test(b)) {
    problems.push(`the branch is \`${b}\` — every point is authored on its own \`feat/<point>-<slug>\` branch`)
  }
  const tree = String(worktree ?? '').replace(/[/\\]+$/, '')
  const main = String(mainCheckout ?? '').replace(/[/\\]+$/, '')
  if (!tree) problems.push('no worktree path was given')
  else if (main && tree === main) {
    problems.push('this is the MAIN checkout — the lane authors in an isolated worktree, never here')
  }
  if (String(dirty ?? '').trim()) {
    problems.push('the tree already has uncommitted changes — what Sol then wrote could not be told apart from them')
  }
  return problems
}

/** The house rules the authoring prompt states, one per line. Exported so the
 *  test pins them: a rule that quietly falls out of the prompt is a rule the
 *  lane stops following, and nothing else would notice. */
export const HOUSE_RULES = Object.freeze([
  `Every commit ends with the trailer \`${SOL_TRAILER}\` — it is the ONLY machine-readable`,
  '  record of who authored it, and a commit without it is REFUSED by a git hook.',
  'COMMIT AT EVERY SELF-CONTAINED STEP, not at the end. An uncommitted tree is the one state',
  '  nothing can rescue: if this run is killed, only what is committed survives.',
  'Commit messages describe the CHANGE ITSELF, never the point number, and are written in English.',
  'Do NOT push, do NOT merge, do NOT create or move a tag, and do NOT touch TASKS.md,',
  '  the dashboard, .claude/settings.json or the git hooks. The branch is pushed FOR you,',
  '  every two minutes and again when you finish — which is exactly why committing each',
  '  step as you go is what makes it durable.',
  'Do NOT change branch, and do not leave the worktree you were started in. What you commit',
  '  elsewhere cannot be attributed to this point, and the run is reported as having failed.',
  'Add or extend a test for everything you build, in the layer that can assert it:',
  '  Vitest (jsdom, `npm run test:unit`) for logic, state and pure functions; the browser',
  '  suites are NOT yours to run.',
  'Before you finish: `npm run test:unit`, `npm run build` and `npm run lint` must all be green.',
  '  Report their real result — a gate you did not run is reported as not run, never as green.',
  'Where the brief is insufficient or contradicts the code, STOP and say what is missing.',
  '  A guessed spec costs a rebuild, which is more expensive than the question.',
])

/**
 * The prompt an authoring run is given.
 *
 * It carries the BRIEF rather than a reading assignment (point 365): the work
 * order and design.md whole are ~108k tokens, the brief ~1.8k, and the whole
 * saving of this lane would be spent on reading if it were not handed over.
 *
 * `findings` turns the same prompt into the SECOND leg of the loop — Claude has
 * reviewed, and these are the findings to answer. That is where the four eyes
 * actually close, so it is the same command rather than a separate one.
 */
export function buildAuthoringPrompt({ point = '', brief = '', branch = '', findings = '' } = {}) {
  const answering = String(findings ?? '').trim()
  return [
    `You are AUTHORING work-order point ${point} for this repository as ${SOL_MODEL_NAME}.`,
    'You were chosen for it: this project runs two authoring lanes from different vendors, and',
    'the mechanical and mid-difficulty points are yours. A Claude session then REVIEWS what you',
    'wrote, runs the browser suites, judges the rendered picture and lands it — so write for a',
    'reviewer who will read every line, and leave nothing you would not defend.',
    '',
    `YOUR BRANCH: ${branch} — it is already checked out in the working directory, which is an`,
    'isolated git worktree of the repository. Work only there.',
    '',
    'THE HOUSE RULES, which are not negotiable:',
    // A rule that runs over one line continues INDENTED, not as a second bullet.
    ...HOUSE_RULES.map((rule) => (/^\s/.test(rule) ? `    ${rule.trim()}` : `  - ${rule}`)),
    '',
    answering
      ? [
          'THIS IS THE SECOND LEG: your work was REVIEWED and the findings are below. Answer every',
          'one of them — fix it, or say plainly why it is not a defect. Do not re-open what was not',
          'questioned, and commit each answer as its own step.',
          '',
          '=== THE REVIEW FINDINGS ===',
          answering,
          '=== END OF FINDINGS ===',
        ].join('\n')
      : [
          'THE SPEC IS THE BRIEF BELOW, in full. Do NOT read TASKS.md, docs/tasks-archive.md or',
          'design.md whole — that is ~108k tokens and avoiding it is the point of the brief. Any',
          'file or section the brief NAMES you may read on demand.',
          '',
          '=== THE BRIEF ===',
          String(brief ?? '').trim() || '(no brief was attached — stop and report that)',
          '=== END OF BRIEF ===',
        ].join('\n'),
    '',
    'WHEN YOU ARE DONE, end your final message with exactly these lines and nothing after them:',
    'DONE: <what you built, in one line>',
    'GATES: <NAME each of test:unit, build and lint with what it did — an unnamed gate reads as one you did not run>',
    'OPEN: <what you left undone or escalated, or the single word none>',
  ].join('\n')
}

/** What a GATES line says when the gates are not green. Deliberately broad: the
 *  cost of a false positive is one line of explanation in a report a human reads
 *  anyway, the cost of a false negative is a red delivery reported as clean. */
// `(?!-)` keeps a hyphenated compound out of it: "error-free" is a PASS, and the
// bare-word test read the "error" in it as a confession (fourth round).
const NOT_GREEN =
  /\b(not run|not executed|didn'?t run|un-?run|skipped|failing|failed|fails|red|errors?(?!-)|broken|unverified|pending)\b/i

/** …with the phrases that contain a negative WORD while saying the opposite cut
 *  out first: "passed without error" is a green line (third cross-vendor round).
 *  `0` counts as none as much as the word does (fourth round). */
const NEGATED = /\b(?:without|no|zero|0)\s+(?:errors?|failures?|warnings?|findings?)\b/gi

/** A word that says a gate actually PASSED. Demanded, because the absence of a
 *  complaint is not a pass: `test:unit, build and lint all exited 1` carries no
 *  blacklisted word at all and was accepted (fourth cross-vendor round). */
const GREEN = /\b(green|pass(?:ed|es|ing)?|ok|okay|clean|success(?:ful)?|error-free|no findings|zero findings)\b/i

/** The three gates the house rules demand, each of which must be NAMED. A line
 *  naming one and staying silent about the others reported a clean run for two
 *  gates nobody ran (third cross-vendor round) — the blacklist alone could not
 *  see an omission, only a confession. */
const GATE_NAMES = Object.freeze([
  { gate: 'test:unit', re: /\b(test:unit|unit|vitest)\b/i },
  { gate: 'build', re: /\bbuild\b/i },
  { gate: 'lint', re: /\b(lint|oxlint)\b/i },
])

/**
 * What is wrong with a GATES line, or '' when it reports all three green.
 *
 * Both halves are needed: the gates must be NAMED (an omission is invisible to a
 * word blacklist) and none of them may be reported as anything but green.
 */
export function gatesProblem(gates) {
  const line = String(gates ?? '').trim()
  if (!line) return 'it reports no gate result at all'
  const missing = GATE_NAMES.filter(({ re }) => !re.test(line)).map(({ gate }) => gate)
  if (missing.length) return `it does not say what ${missing.join(' and ')} did`
  const claim = line.replace(NEGATED, ' ')
  if (NOT_GREEN.test(claim)) return 'it reports a gate as anything but green'
  return GREEN.test(claim) ? '' : 'it never says the gates PASSED — an absent complaint is not a green run'
}

/** The closing lines of an authoring answer, read off the END of the message. */
export function parseAuthoringAnswer(text) {
  const clean = String(text ?? '').replace(/[*`_#>]/g, '')
  const tail = clean.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3)
  const field = (line, name) => (new RegExp(`^[-*]?\\s*${name}\\s*:\\s*(.+)$`, 'i').exec(line ?? '')?.[1] ?? '').trim()
  const done = field(tail[0], 'DONE')
  const gates = field(tail[1], 'GATES')
  const open = field(tail[2], 'OPEN')
  if (!done || !gates || !open) return { ok: false, error: 'the message does not end in the DONE/GATES/OPEN lines' }
  if (/^</.test(done) || /^</.test(gates)) return { ok: false, error: 'the closing lines are the placeholders echoed back' }
  return { ok: true, done, gates, open, error: '' }
}

/**
 * WHAT ACTUALLY HAPPENED, judged from git rather than from the run's own account.
 *
 * `commits` are the ones that appeared on the branch, newest first, each
 * `{ sha, subject, trailers }`. The run's message is an input, never the
 * verdict: a model that reports success while having committed nothing is the
 * exact failure this lane must not paper over, and a stalled run that DID commit
 * is worth keeping rather than throwing away.
 */
/**
 * Does this trailer name SOL as the author — the PARSED model name, never the
 * raw line?
 *
 * The raw line carries the address, and `Claude Opus 5 <build@sol.example>` is
 * an allowlisted commit by another model whose e-mail happens to contain the
 * word (cross-vendor review of point 667, P1). Read off the raw text it counted
 * as this lane's own work.
 */
export function namesSolAsAuthor(trailers) {
  return modelNamesIn(trailers).some((name) => sameModel(name, SOL_MODEL_NAME))
}

export function judgeAuthoring({ outcome = {}, commits = [], parsed = {}, dirty = '', branchAfter = '', branch = '' } = {}) {
  const list = Array.isArray(commits) ? commits : []
  const problems = []
  if (!list.length) {
    problems.push('NOTHING WAS COMMITTED — the branch is where it started, so there is nothing to review')
  }
  // THE RUN MUST END WHERE IT STARTED (cross-vendor review, P1). Nothing stops a
  // sandbox-less run from checking out another branch, and `base..HEAD` would
  // then report ITS commits as this point's work while the push names the branch
  // the readiness check approved.
  if (branch && branchAfter && branch !== branchAfter) {
    problems.push(`the run ended on \`${branchAfter}\`, not on \`${branch}\` — what it committed cannot be attributed to this point`)
  }
  for (const commit of list) {
    const verdict = classifyTrailer(commit?.trailers ?? '')
    if (verdict === 'forbidden') {
      problems.push(`${short(commit.sha)} names a model outside the author allowlist (${String(commit.trailers).trim()})`)
    } else if (verdict === 'unidentified') {
      problems.push(`${short(commit.sha)} carries a trailer naming no single model — it cannot show who wrote it`)
    } else if (!namesSolAsAuthor(commit?.trailers)) {
      problems.push(`${short(commit.sha)} does not name ${SOL_MODEL_NAME} as its author — this lane's commits must`)
    }
  }
  if (String(dirty ?? '').trim()) {
    problems.push('the run left UNCOMMITTED changes behind — commit or discard them before the review')
  }
  if (!outcome?.ok) problems.push(`the codex run did not finish cleanly: ${outcome?.cause || 'no cause was reported'}`)
  else if (!parsed?.ok) problems.push(`the run gave no usable closing report (${parsed?.error || 'no reason given'})`)
  // A RUN THAT SAYS ITS GATES ARE NOT GREEN IS NOT A CLEAN RUN (second
  // cross-vendor round). `GATES: not run` parsed perfectly well and the command
  // exited 0 — reporting as a delivery something the prompt's own rules refuse.
  // The reviewer runs the gates itself regardless; this is about the exit code
  // a script chains on.
  else {
    const gates = gatesProblem(parsed.gates)
    if (gates) problems.push(`the run's own GATES line is not a report of three green gates: ${gates} ("${String(parsed.gates).trim()}")`)
  }
  return {
    // DELIVERED means reviewable work exists, which is not the same as a clean
    // run: commits that survived a timeout are still the point's work.
    delivered: list.length > 0,
    clean: problems.length === 0,
    problems,
    commits: list,
  }
}

const short = (sha) => String(sha ?? '').slice(0, 7)

/**
 * What the session is told, and what it must do next.
 *
 * The next steps are printed even after a bad run, because the state they act on
 * is real either way — commits that exist are reviewed and landed or thrown
 * away deliberately, never left lying on a branch nobody looked at.
 */
export function formatAuthoringReport({ point = '', branch = '', judged = {}, parsed = {}, reviewer = 'Opus 5', pushed = null } = {}) {
  const lines = []
  const commits = judged.commits ?? []
  if (judged.delivered) {
    lines.push(
      `author-sol: ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) authored ${commits.length} commit(s) on ${branch}:`,
      ...commits.map((c) => `    ${short(c.sha)}  ${c.subject ?? ''}`),
    )
  } else {
    lines.push(`author-sol: ${SOL_MODEL_NAME} authored NOTHING on ${branch}.`)
  }
  if (parsed?.ok) {
    lines.push(`  DONE:  ${parsed.done}`, `  GATES: ${parsed.gates}`, `  OPEN:  ${parsed.open}`)
  }
  if (pushed === true) lines.push(`  the branch is pushed — nothing of it lives only in this worktree.`)
  if (pushed === false) lines.push('  PUSH FAILED — the work is committed but only local. Push it before anything else.')
  if (judged.problems?.length) {
    lines.push('', '  PROBLEMS with this run — none of them is closed by ignoring it:')
    lines.push(...judged.problems.map((p) => `    · ${p}`))
  }
  if (!judged.delivered) return lines.join('\n')
  lines.push(
    '',
    `  IT IS NOT REVIEWED, AND ${SOL_MODEL_NAME} MAY NOT REVIEW IT. The role swap makes the rest yours`,
    `  (${reviewer}), in this order:`,
    '    1. READ the diff and judge it — you are the second pair of eyes, so read the change',
    '       before any explanation of it,',
    '    2. run the gates and, for a render change, the picture on both backends,',
    `    3. hand the findings back for a second leg:  node scripts/author-sol.mjs --point ${point} --findings <file>`,
    '    4. record the review where a mechanism was touched:',
    `       node scripts/mechanism-review.mjs --record <sha> --model "${reviewer}" --verdict <v> --evidence "<what you read>" --point ${point}`,
    `    5. then land it:  node scripts/land-point.mjs ${point} --model "${SOL_MODEL_NAME}"`,
  )
  return lines.join('\n')
}
