// Pure decision core of the CROSS-VENDOR four-eyes review (work-order point 624).
//
// WHY IT EXISTS: our two reviewers were Opus 5 and Fable 5 — one house, similar
// training, therefore CORRELATED blind spots, which is exactly what the
// four-eyes rule is bought against (CLAUDE.md §6). A model from a different
// vendor is the strongest decorrelation available, so REVIEWS go to OpenAI's
// GPT-5.6 Sol at reasoning effort HIGH first and to Fable 5 when Sol cannot be
// reached. AUTHORSHIP is untouched: Sol writes no commit here, and
// scripts/model-guard-core.mjs keeps its author allowlist exactly as it was.
//
// THE FAILURE MODE THIS FILE IS SHAPED AROUND: a review nobody ran must never be
// recorded as done. That is worse than having no second pair of eyes, because
// the mechanism/criticality gates then read GREEN on a commit nothing judged.
// So every path out of a failed Sol run yields Fable 5 as the reviewer and NO
// verdict — the verdict is the reviewer's to give, never the runner's to
// invent — and the model that is RECORDED is always the one that actually ran,
// never the one that was preferred.
//
// Side-effect free: the process spawn, the temp files and the printing belong to
// scripts/review-sol.mjs. Pinned by review-sol-core.test.mjs.

import { VERDICTS } from './mechanism-review-core.mjs'

/** The model id `codex exec -m` is given, and the name a record calls it by. */
export const SOL_MODEL_ID = 'gpt-5.6-sol'
export const SOL_MODEL_NAME = 'GPT-5.6 Sol'

/** The reasoning effort the user's decision fixes for reviews (10.08.2026). */
export const SOL_REASONING_EFFORT = 'high'

/** The reviewer that takes over whenever Sol did not deliver a verdict. */
export const FALLBACK_MODEL_NAME = 'Fable 5'

/** The binary, and the ceiling a review may take before it counts as stuck. */
export const CODEX_BIN = 'codex'
export const REVIEW_TIMEOUT_MS = 15 * 60_000

/**
 * How a Sol run ended. `ok` is the ONLY kind that may be recorded as Sol's; each
 * other kind is a cause the command names in one line before handing the review
 * to Fable 5.
 */
export const OUTCOME = Object.freeze({
  OK: 'ok',
  NOT_INSTALLED: 'not-installed',
  UNREACHABLE: 'unreachable',
  LOGIN_EXPIRED: 'login-expired',
  ALLOWANCE_EXHAUSTED: 'allowance-exhausted',
  MODEL_REFUSED: 'model-refused',
  TIMEOUT: 'timeout',
  ERROR_EXIT: 'error-exit',
  NO_VERDICT: 'no-verdict',
})

/** One human sentence per kind — what the reader is told went wrong. */
const CAUSE_TEXT = Object.freeze({
  [OUTCOME.NOT_INSTALLED]: `\`${CODEX_BIN}\` is not on PATH in this container`,
  [OUTCOME.UNREACHABLE]: 'the OpenAI host could not be reached (network or firewall)',
  [OUTCOME.LOGIN_EXPIRED]: `the ChatGPT login is gone or expired (see \`review-sol.mjs --restore-login\`)`,
  [OUTCOME.ALLOWANCE_EXHAUSTED]: 'the ChatGPT allowance for this account is exhausted',
  [OUTCOME.MODEL_REFUSED]: `the server refused the model id "${SOL_MODEL_ID}"`,
  [OUTCOME.TIMEOUT]: 'the review did not finish inside its time budget',
  [OUTCOME.ERROR_EXIT]: 'codex exited with an error',
  [OUTCOME.NO_VERDICT]: 'the run produced no parseable verdict',
})

/**
 * The message patterns each failure kind is recognised by.
 *
 * ORDER MATTERS and is the order below: an exhausted allowance and an expired
 * login both answer with an HTTP status, and the status alone would classify the
 * wrong one. The specific wording is therefore matched before the bare code.
 * A pattern that matches nothing simply falls through to ERROR_EXIT, which is
 * the honest answer — every kind here ends at the same fallback, so a
 * misclassification costs a sentence of explanation, never a wrong reviewer.
 */
const FAILURE_PATTERNS = [
  [OUTCOME.MODEL_REFUSED, /not supported when using codex with a chatgpt account|unknown model|model[^.\n]*not (?:supported|available|found)/i],
  [OUTCOME.ALLOWANCE_EXHAUSTED, /usage limit|rate limit|quota|too many requests|\b429\b|allowance|credit balance|plan limit/i],
  [OUTCOME.LOGIN_EXPIRED, /not logged in|log ?in again|codex login|refresh token|invalid[_ ]api[_ ]key|unauthorized|authentication|\b401\b|\b403\b/i],
  [OUTCOME.UNREACHABLE, /enotfound|eai_again|econnrefused|econnreset|etimedout|dns error|failed to lookup|error sending request|network (?:error|is unreachable)|connection (?:refused|reset|closed)|proxy|tls|certificate/i],
]

/**
 * Classify one finished `codex exec` run.
 *
 * `spawnError` is the Error node gives when the binary itself could not run;
 * `timedOut` is our own kill. Everything else is decided from the exit code and
 * from what the process said — stderr first, because that is where codex writes
 * its refusals, with stdout folded in for the runs that report the failure on
 * the normal channel.
 */
export function classifyOutcome({ spawnError = null, exitCode = 0, stdout = '', stderr = '', timedOut = false } = {}) {
  if (spawnError) {
    const code = String(spawnError.code ?? '')
    const kind = code === 'ENOENT' ? OUTCOME.NOT_INSTALLED : OUTCOME.ERROR_EXIT
    return { ok: false, kind, cause: `${CAUSE_TEXT[kind]}: ${spawnError.message ?? code}` }
  }
  if (timedOut) return { ok: false, kind: OUTCOME.TIMEOUT, cause: CAUSE_TEXT[OUTCOME.TIMEOUT] }

  const text = `${stderr ?? ''}\n${stdout ?? ''}`
  if (Number(exitCode) === 0) return { ok: true, kind: OUTCOME.OK, cause: '' }

  for (const [kind, re] of FAILURE_PATTERNS) {
    if (re.test(text)) return { ok: false, kind, cause: CAUSE_TEXT[kind] }
  }
  return { ok: false, kind: OUTCOME.ERROR_EXIT, cause: `${CAUSE_TEXT[OUTCOME.ERROR_EXIT]} (exit ${exitCode})` }
}

/**
 * Did the server REFUSE this model id?
 *
 * The probe that proves the `-m` flag is honoured at all: an unknown id must be
 * rejected rather than silently substituted, because a green review against a
 * substituted model would be worthless — it would be a review by whatever the
 * account defaults to, recorded under Sol's name.
 */
export function isUnknownModelRefusal(text) {
  return FAILURE_PATTERNS[0][1].test(String(text ?? ''))
}

/** The `codex exec` command line for one review. Read-only sandbox, no writes. */
export function codexArgs({
  modelId = SOL_MODEL_ID,
  effort = SOL_REASONING_EFFORT,
  cwd = '',
  outputFile = '',
  prompt = '',
} = {}) {
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--color',
    'never',
    '--sandbox',
    'read-only',
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
 * The prompt Sol is given.
 *
 * It states the ARTEFACT first and the author's rationale never: CLAUDE.md §6
 * requires a convergent reviewer to read the diff before any justification, so
 * the justification cannot anchor it. The answer shape is fixed because it is
 * transcribed into the ledger verbatim — a verdict word this project's recorder
 * accepts, and one honest line of what was actually checked.
 */
export function buildReviewPrompt({ sha = '', brief = '', mode = 'review' } = {}) {
  const divergent = String(mode) === 'blind-parallel'
  return [
    'You are the SECOND pair of eyes on a change in this repository, working under the',
    'four-eyes rule of CLAUDE.md §6. You were chosen because you are a DIFFERENT model',
    'from the author: your value is the errors the author cannot see, so judge the',
    'artefact itself and do not assume it is correct.',
    '',
    `COMMIT UNDER REVIEW: ${sha}`,
    'THE MATERIAL IS ATTACHED BELOW (the diffstat, the full patch, and the current',
    'content of the files it touches). Judge THAT — this container cannot create user',
    'namespaces, so a shell command of yours would fail before it ran, and a review',
    'that only reports it could not look at anything is worth nothing. If a file below',
    'is marked TRUNCATED, say so in your evidence rather than guessing past the cut.',
    '',
    `WHAT TO JUDGE: ${brief}`,
    '',
    divergent
      ? 'This is a DIVERGENT step: produce your OWN complete list from the inputs, do not\n' +
        'check somebody else\'s. Name what could go wrong that nobody has written down.'
      : 'This is a CONVERGENT review of ONE artefact: is the diff correct, does it match its\n' +
        'spec, are its tests real tests, what breaks that nobody tested?',
    '',
    'Report ONLY findings you can point at a line for. End your final message with',
    'EXACTLY these two lines and nothing after them:',
    `VERDICT: <${VERDICTS.join('|')}>`,
    'EVIDENCE: <one line naming what you actually checked and what you found>',
  ].join('\n')
}

/**
 * Pull the verdict and its evidence out of the reviewer's final message.
 *
 * Tolerant on the way in — markdown emphasis, a code fence, a leading bullet —
 * and strict on the way out: a verdict word the recorder does not accept, or an
 * evidence line too thin to mean anything, is NOT a verdict. Such a run has not
 * been reviewed, and the caller falls back rather than record a guess.
 */
export function parseVerdict(text) {
  const raw = String(text ?? '')
  const clean = raw.replace(/[*`_#>]/g, '')
  // Last occurrence wins: the prompt asks for the pair at the very end, and a
  // reviewer that quotes the instruction earlier must not shadow its own answer.
  const verdictMatches = [...clean.matchAll(/^\s*[-*]?\s*VERDICT\s*:\s*(.+)$/gim)]
  const evidenceMatches = [...clean.matchAll(/^\s*[-*]?\s*EVIDENCE\s*:\s*(.+)$/gim)]
  const verdict = verdictMatches.length ? verdictMatches.at(-1)[1].trim().toLowerCase() : ''
  const evidence = evidenceMatches.length ? evidenceMatches.at(-1)[1].trim() : ''
  if (!VERDICTS.includes(verdict)) {
    return { ok: false, verdict: '', evidence: '', error: verdict ? `unusable verdict "${verdict}"` : 'no VERDICT line' }
  }
  // A line still in its angle brackets is the PLACEHOLDER echoed back, not an
  // observation. (The closing bracket is not required: the markdown strip above
  // removes `>` as a blockquote marker, so only the opening one is reliable.)
  if (evidence.length < 10 || /^</.test(evidence)) {
    return { ok: false, verdict: '', evidence: '', error: 'no usable EVIDENCE line' }
  }
  return { ok: true, verdict, evidence, error: '' }
}

/**
 * WHO REVIEWED, AND WHAT MAY BE RECORDED.
 *
 * The one rule this function exists for: the recorded model NAMES THE RUN THAT
 * ACTUALLY HAPPENED, never the preference. Sol is preferred, so a successful Sol
 * run records Sol — but every failure, of every kind, records Fable 5, and does
 * so with an EMPTY verdict, because at that moment no second pair of eyes has
 * seen the change yet. `ready` says whether a record may be written at all.
 */
export function decideReview({ outcome = {}, parsed = {} } = {}) {
  if (outcome.ok && parsed.ok) {
    return {
      model: SOL_MODEL_NAME,
      ranBy: SOL_MODEL_NAME,
      verdict: parsed.verdict,
      evidence: parsed.evidence,
      fellBack: false,
      ready: true,
      kind: OUTCOME.OK,
      cause: '',
    }
  }
  const kind = outcome.ok ? OUTCOME.NO_VERDICT : outcome.kind || OUTCOME.ERROR_EXIT
  const cause = outcome.ok
    ? `${CAUSE_TEXT[OUTCOME.NO_VERDICT]}${parsed.error ? ` (${parsed.error})` : ''}`
    : outcome.cause || CAUSE_TEXT[kind] || 'codex did not deliver a review'
  return {
    model: FALLBACK_MODEL_NAME,
    ranBy: '',
    verdict: '',
    evidence: '',
    fellBack: true,
    ready: false,
    kind,
    cause,
  }
}

/** How much material one review may carry — the patch plus the changed files. */
export const MATERIAL_BUDGET_CHARS = 120_000

/**
 * The review MATERIAL, assembled into what codex receives on stdin.
 *
 * WHY IT IS FED RATHER THAN FETCHED (measured 10.08.2026): this dev container
 * cannot create unprivileged user namespaces, so codex's sandbox launcher
 * (bubblewrap) fails before ANY command of the reviewer's runs — `git show`
 * included. The first real run came back `do-not-merge` with the evidence "none
 * of my commands reached the repository", which is an honest answer to a useless
 * question: a reviewer that cannot see the artefact is not a second pair of
 * eyes. So the artefact travels WITH the request. The read-only sandbox stays on
 * regardless, for the machine where the launcher does work.
 *
 * The budget is spent in the order that matters — the patch first, then each
 * changed file — and what does not fit is CUT VISIBLY, because a reviewer that
 * silently saw half a file would report on the half it saw.
 */
export function formatReviewMaterial({ stat = '', patch = '', files = [], budget = MATERIAL_BUDGET_CHARS } = {}) {
  const out = ['=== DIFFSTAT ===', String(stat).trim(), '', '=== PATCH ===', String(patch).trim(), '']
  let left = Math.max(0, budget - out.join('\n').length)
  for (const file of files ?? []) {
    const text = String(file?.text ?? '')
    const header = `=== FILE (current content): ${file?.path ?? '?'} ===`
    if (left <= header.length + 200) {
      out.push(`=== FILE OMITTED ENTIRELY (material budget spent): ${file?.path ?? '?'} ===`, '')
      continue
    }
    const room = left - header.length - 80
    const cut = text.length > room
    out.push(header, cut ? `${text.slice(0, room)}\n… [TRUNCATED: ${text.length - room} characters not shown]` : text, '')
    left -= header.length + Math.min(text.length, room) + 80
  }
  return out.join('\n')
}

/**
 * Where the saved ChatGPT login lives, given git's COMMON dir.
 *
 * `local/` is per CHECKOUT, and a delegated agent works in a git WORKTREE that
 * is deleted when its point lands — a login saved there would vanish with it,
 * which is the opposite of surviving a rebuild. The login belongs to the
 * machine, so it is kept in the MAIN checkout's `local/`: `--git-common-dir`
 * points at the one real `.git` directory from every worktree alike. With no
 * git answer the current checkout is the honest fallback.
 */
export function savedAuthPathFrom(gitCommonDir, repoRoot, { sep = '/' } = {}) {
  const common = String(gitCommonDir ?? '').trim().replace(/[/\\]+$/, '')
  const base = /(?:^|[/\\])\.git$/.test(common) ? common.replace(/[/\\]\.git$/, '') : String(repoRoot ?? '')
  return `${base || String(repoRoot ?? '')}${sep}local${sep}codex-auth.json`
}

/** Shell-quote one value for the record command line we print. */
const q = (s) => `"${String(s ?? '').replace(/(["\\$`])/g, '\\$1')}"`

/**
 * The record command, in the shape `mechanism-review.mjs --record` expects.
 *
 * After a Sol run it is complete and can be run as printed. After a fallback the
 * verdict and the evidence stand as ANGLE-BRACKET PLACEHOLDERS the recorder
 * refuses — so a hand that pastes it without giving the review to Fable first
 * gets a refusal, not a green ledger line.
 */
export function formatRecordCommand({ sha = '', model = '', verdict = '', evidence = '', mode = 'review', point = '' } = {}) {
  const parts = [
    'node scripts/mechanism-review.mjs',
    `--record ${sha || '<sha>'}`,
    `--model ${q(model)}`,
    `--verdict ${verdict || `<${VERDICTS.join('|')}>`}`,
    `--evidence ${verdict ? q(evidence) : '"<what the review actually checked>"'}`,
    `--mode ${mode}`,
  ]
  if (String(point ?? '').trim()) parts.push(`--point ${String(point).trim()}`)
  return parts.join(' ')
}

/**
 * The whole verdict of a run as the command prints it: one line naming what
 * happened — LOUD on a fallback, per the point's "name the cause in ONE line" —
 * then the record command.
 */
export function formatReviewReport({ decision = {}, sha = '', mode = 'review', point = '' } = {}) {
  const cmd = formatRecordCommand({
    sha,
    model: decision.model,
    verdict: decision.verdict,
    evidence: decision.evidence,
    mode,
    point,
  })
  if (!decision.fellBack) {
    return [
      `review-sol: ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) reviewed ${String(sha).slice(0, 7)} → ${decision.verdict}`,
      `  ${decision.evidence}`,
      '',
      'Record it (the model named is the one that actually ran):',
      `  ${cmd}`,
    ].join('\n')
  }
  return [
    `review-sol: FALLBACK — ${SOL_MODEL_NAME} did not review ${String(sha).slice(0, 7)}: ${decision.cause}.`,
    `  The review is NOT done. Hand it to ${FALLBACK_MODEL_NAME} and record what IT says:`,
    '',
    `  1. give ${FALLBACK_MODEL_NAME} the commit and the brief above,`,
    `  2. then record its verdict — never this command's:`,
    `     ${cmd}`,
  ].join('\n')
}
