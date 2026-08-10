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

import { BLIND_REVIEWER, modelFromTrailers, sameModel, VERDICTS } from './mechanism-review-core.mjs'

// Re-exported: the runner and the recorder refuse the same sentence, from one
// definition (mechanism-review-core.mjs).
export { BLIND_REVIEWER }

/** The model id `codex exec -m` is given, and the name a record calls it by. */
export const SOL_MODEL_ID = 'gpt-5.6-sol'
export const SOL_MODEL_NAME = 'GPT-5.6 Sol'

/** The reasoning effort the user's decision fixes for reviews (10.08.2026). */
export const SOL_REASONING_EFFORT = 'high'

/** The reviewers that take over whenever Sol did not deliver a verdict, in
 *  order. The ones behind Fable exist because Fable and Opus also AUTHOR here,
 *  and no model may review its own work (CLAUDE.md §6). */
export const FALLBACK_MODEL_NAME = 'Fable 5'
export const SECOND_FALLBACK_MODEL_NAME = 'Opus 5'
export const FALLBACK_CHAIN = Object.freeze([FALLBACK_MODEL_NAME, SECOND_FALLBACK_MODEL_NAME, 'Opus 4.8'])

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
  // THE TIMEOUT IS ASKED FIRST (four-eyes finding, 10.08.2026). `spawnSync` with
  // a timeout sets BOTH an ETIMEDOUT error and the kill signal, so asking about
  // the error first turned every real timeout into a nondescript "error exit".
  if (timedOut || String(spawnError?.code ?? '') === 'ETIMEDOUT') {
    return { ok: false, kind: OUTCOME.TIMEOUT, cause: CAUSE_TEXT[OUTCOME.TIMEOUT] }
  }
  if (spawnError) {
    const code = String(spawnError.code ?? '')
    const kind = code === 'ENOENT' ? OUTCOME.NOT_INSTALLED : OUTCOME.ERROR_EXIT
    return { ok: false, kind, cause: `${CAUSE_TEXT[kind]}: ${spawnError.message ?? code}` }
  }
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
    'THE MATERIAL IS ATTACHED (the diffstat, the patch, and the content of the files it',
    'touches). READ IT IN FULL FIRST, before the question below and before forming any',
    'view: the question is a checklist of what to look at, never a conclusion to check',
    'against, and no rationale from the author is included on purpose. This container',
    'cannot create user namespaces, so a shell command of yours would fail before it',
    'ran — judge the attached material, and if a part of it is marked TRUNCATED, say so',
    'in your evidence rather than guessing past the cut.',
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
  // THE PAIR MUST BE THE END OF THE MESSAGE (four-eyes finding, 10.08.2026). The
  // prompt asks for exactly two closing lines; taking the last match of each
  // INDEPENDENTLY would happily pair a verdict with an evidence line from some
  // earlier paragraph, so the two final non-empty lines are what is read.
  const tail = clean.split('\n').map((l) => l.trim()).filter(Boolean).slice(-2)
  const verdict = (/^[-*]?\s*VERDICT\s*:\s*(.+)$/i.exec(tail[0] ?? '')?.[1] ?? '').trim().toLowerCase()
  const evidence = (/^[-*]?\s*EVIDENCE\s*:\s*(.+)$/i.exec(tail[1] ?? '')?.[1] ?? '').trim()
  if (!VERDICTS.includes(verdict)) {
    return {
      ok: false,
      verdict: '',
      evidence: '',
      error: verdict ? `unusable verdict "${verdict}"` : 'the message does not end in the VERDICT/EVIDENCE pair',
    }
  }
  // A REVIEWER THAT SAYS IT COULD NOT LOOK HAS NOT REVIEWED (measured: the very
  // first run of this command answered `do-not-merge` because none of its
  // commands reached the repository). Such an answer carries a valid verdict
  // word and would otherwise be recorded as a review. The check errs towards the
  // fallback, which costs a second reviewer, never a false green.
  if (BLIND_REVIEWER.test(evidence)) {
    return { ok: false, verdict: '', evidence: '', error: 'the reviewer says it could not see the change' }
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
export function decideReview({ outcome = {}, parsed = {}, authorModel = '' } = {}) {
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
    model: fallbackReviewerFor(authorModel),
    ranBy: '',
    verdict: '',
    evidence: '',
    fellBack: true,
    ready: false,
    kind,
    cause,
  }
}

/**
 * The fallback reviewer, given who AUTHORED the change.
 *
 * Normally Fable 5 — but Fable also AUTHORS here (CLAUDE.md §6), and a Fable
 * review of Fable's own commit is the self-review both gates refuse. That would
 * leave a Fable-authored change with no reachable reviewer at all whenever Sol
 * is down, so the second Anthropic model in the chain takes over instead (found
 * by the cross-vendor review of this very branch, 10.08.2026).
 *
 * It takes EVERY author in the reviewed range, not just the head commit's: one
 * record covers every commit it contains, so a range with one Fable commit under
 * an Opus head must be handed to a model that authored NEITHER (second and third
 * rounds of the same review — the first fix picked Opus 5 for exactly that
 * range, which is a self-review of half of it).
 *
 * With every model in the chain among the authors it returns '' : there is then
 * no valid Anthropic reviewer at all, and saying so is the only honest answer —
 * the review waits for Sol rather than being recorded by an author of the work.
 */
export function fallbackReviewerFor(authorModels = '') {
  const authors = (Array.isArray(authorModels) ? authorModels : [authorModels]).filter(Boolean)
  return FALLBACK_CHAIN.find((candidate) => !authors.some((a) => sameModel(candidate, a))) ?? ''
}

/** How much material one review may carry — the patch plus the changed files —
 *  and the share of it the patch may take before the files get their turn. */
export const MATERIAL_BUDGET_CHARS = 200_000
export const PATCH_SHARE = 0.5

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
  // THE PATCH IS CAPPED TOO (four-eyes finding, 10.08.2026). It used to be
  // written whole and merely SUBTRACTED from the budget, so a large diff blew
  // the ceiling and left nothing for the files — measured on this branch: the
  // reviewer saw the patch, a truncated README and none of the six scripts. It
  // gets a fixed share, and what it loses is cut visibly like everything else.
  const cut = (text, room) =>
    text.length > room ? `${text.slice(0, Math.max(0, room))}\n… [TRUNCATED: ${text.length - room} characters not shown]` : text
  const patchRoom = Math.floor(budget * PATCH_SHARE)
  const out = [
    '=== DIFFSTAT ===',
    cut(String(stat).trim(), Math.floor(budget * 0.05)),
    '',
    '=== PATCH ===',
    cut(String(patch).trim(), patchRoom),
    '',
  ]
  let left = Math.max(0, budget - out.join('\n').length)
  for (const file of files ?? []) {
    const text = String(file?.text ?? '')
    const header = `=== FILE (current content): ${file?.path ?? '?'} ===`
    if (left <= header.length + 200) {
      out.push(`=== FILE OMITTED ENTIRELY (material budget spent): ${file?.path ?? '?'} ===`, '')
      continue
    }
    const room = left - header.length - 80
    out.push(header, cut(text, room), '')
    left -= header.length + Math.min(text.length, room) + 80
  }
  return out.join('\n')
}

/**
 * The paths a patch ADDS whole, whose current content would be sent twice.
 *
 * On this branch the duplicate cost the review its material budget: the patch
 * already carried every added file in full, and the copies pushed the files the
 * reviewer was asked to judge out of the ceiling (second cross-vendor round).
 */
/**
 * May the added files' content be left out because the patch carries it?
 *
 * ONLY while the patch fits whole. Once it is capped, its tail is cut — and an
 * added file living in that tail would be in neither half of the material, which
 * is a file the reviewer was asked about and never saw (third cross-vendor
 * round). The duplicate is the cheaper mistake, so the skip is dropped.
 */
export function addedFilesAreCoveredByPatch(patchLength, budget = MATERIAL_BUDGET_CHARS, share = PATCH_SHARE) {
  return Number(patchLength) <= Math.floor(Number(budget) * Number(share))
}

export function newFilePathsIn(patch) {
  const paths = new Set()
  const lines = String(patch ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^new file mode /.test(lines[i])) continue
    for (let j = i; j >= 0 && j > i - 6; j--) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[j])
      if (m) {
        paths.add(m[2])
        break
      }
    }
  }
  return paths
}

/**
 * EVERY model named in one commit's `Co-Authored-By` field, not just the first.
 *
 * `modelFromTrailers` deliberately returns the FIRST Claude co-author, which is
 * the right answer for "who wrote this" but the wrong one for "who may not
 * review this": a commit naming two models would hide the second, and the
 * fallback chain could then pick a model that authored the work (third
 * cross-vendor round). The separator is the one the git format uses.
 */
export function modelsInTrailerField(field) {
  return String(field ?? '')
    .split(';')
    .map((part) => modelFromTrailers(part))
    .filter(Boolean)
}

/** How long a passed model-id probe stands before it must be repeated. */
export const PROBE_MAX_AGE_MS = 30 * 86_400_000

/**
 * Has this machine PROVEN that `-m` is honoured rather than silently substituted?
 *
 * Nothing in a run's output names the model that answered (checked against
 * `codex exec --json`, 10.08.2026: its events carry the thread, the items and the
 * token usage, no model field). So the identity rests on the server REFUSING an
 * unknown id — which `--probe` demonstrates — and the honest thing is to say
 * when that demonstration is missing or old rather than to imply it every time.
 * A warning, never a block: an unproven id is a reason to distrust the ledger
 * line, not a reason to leave a change unreviewed.
 */
export function probeFreshness(receipt, now = Date.now(), maxAgeMs = PROBE_MAX_AGE_MS) {
  const at = Number(receipt?.at ?? 0)
  if (!receipt || receipt.refused !== true || !at) {
    return { fresh: false, warning: `the model id ${SOL_MODEL_ID} has never been proven honoured on this machine — run: node scripts/review-sol.mjs --probe` }
  }
  const ageDays = Math.floor((now - at) / 86_400_000)
  if (now - at > maxAgeMs) {
    return { fresh: false, warning: `the model-id probe is ${ageDays} days old — run: node scripts/review-sol.mjs --probe` }
  }
  return { fresh: true, warning: '', ageDays }
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
  // The prose names the model the DECISION picked, not the usual one: where
  // Fable authored the change the reviewer is Opus 5, and an instruction saying
  // "hand it to Fable" beside a command naming Opus is how a self-review gets
  // recorded (four-eyes finding, second round, 10.08.2026).
  const who = decision.model
  if (!who) {
    return [
      `review-sol: FALLBACK — ${SOL_MODEL_NAME} did not review ${String(sha).slice(0, 7)}: ${decision.cause}.`,
      `  And EVERY model in the fallback chain (${FALLBACK_CHAIN.join(', ')}) authored part of this`,
      '  range, so none of them may review it. The review is NOT done and cannot be recorded:',
      `  fix the ${SOL_MODEL_NAME} run, or review a narrower range one of them did not write.`,
    ].join('\n')
  }
  return [
    `review-sol: FALLBACK — ${SOL_MODEL_NAME} did not review ${String(sha).slice(0, 7)}: ${decision.cause}.`,
    `  The review is NOT done. Hand it to ${who} and record what IT says:`,
    '',
    `  1. give ${who} the commit and the brief above,`,
    `  2. then record its verdict — never this command's:`,
    `     ${cmd}`,
  ].join('\n')
}
