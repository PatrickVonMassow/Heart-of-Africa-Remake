// Pure decision core of the CROSS-VENDOR four-eyes review (work-order point 624).
//
// rule:model-policy@8b2f41d7
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

import { BLIND_REVIEWER, blindReviewerAdmission, modelFromTrailers, sameModel, VERDICTS } from './mechanism-review-core.mjs'
import {
  assembleMaterial,
  formatPassFiles,
  formatShortfall,
  MATERIAL_BUDGET_CHARS,
  parseDiffHeader,
  PATCH_SHARE,
} from './review-material-core.mjs'

// Re-exported: the runner and the recorder refuse the same sentence, from one
// definition (mechanism-review-core.mjs).
export { BLIND_REVIEWER, blindReviewerAdmission }

// The material budget and its split live with the accounting that spends them
// (review-material-core.mjs); re-exported here because this is where every
// caller of the review command already looks for them.
export { MATERIAL_BUDGET_CHARS, PATCH_SHARE }

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

/**
 * …and the chain for the OTHER direction (point 667): who reviews what SOL
 * AUTHORED.
 *
 * A separate order, deliberately. The chain above answers "Sol is unreachable,
 * who else can look at this?" and starts at Fable, the second-opinion model.
 * This one answers "Sol wrote it, who takes it from here?" — and under the role
 * swap that reviewer ALSO runs the suites, judges the picture and lands the
 * point, which is the main authoring session's job. So it starts at Opus 5.
 */
export const CLAUDE_REVIEW_CHAIN = Object.freeze(['Opus 5', 'Fable 5', 'Opus 4.8'])

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
  // NOT a failure: the operator has moved the load away from OpenAI (point 654). It ends
  // in the same place every failure does — the review handed to a Claude reviewer with NO
  // verdict — because that is the honest state either way: Sol has not seen this change.
  SWITCHED_OFF: 'switched-off',
  // Also not a failure, and not even a fallback: Sol AUTHORED this range, so the review
  // was never Sol's to give (point 667). It ends in the same place for the same reason.
  SELF_REVIEW: 'self-review',
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
  [OUTCOME.SWITCHED_OFF]: 'the share switch is at `claude-only` (node scripts/sol-share.mjs --status)',
  [OUTCOME.SELF_REVIEW]: `${SOL_MODEL_NAME} AUTHORED part of this range — no model reviews its own work`,
})

/** The cause sentence of one outcome kind — for the callers that skip classifyOutcome. */
export function causeTextFor(kind) {
  return CAUSE_TEXT[kind] ?? ''
}

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
  // A SPOKEN VERDICT OUTRANKS A DEAD CONNECTION; A DEAD CONNECTION OUTRANKS SILENCE
  // (11.08.2026, both halves found the hard way).
  //
  // First half: reported as an exhausted allowance, a transport failure sent the user
  // to his billing page while 96 % of his weekly limit stood unused, and it hid a
  // cause that was ours — a firewall entry gone stale after a container restart. So a
  // text that ONLY shows a broken connection is unreachable, whatever stray word it
  // carries.
  //
  // Second half (GPT-5.6 Sol, reviewing the first): the naive fix overshoots. Codex
  // RETRIES, so one transcript can hold a real `429` from attempt 1 and a
  // `Reconnecting…` storm after it — and a server that answered 429 DID speak about
  // the account, however the stream ended. Hence the order below: a definitive quota
  // verdict is matched first and wins wherever both appear; transport is the answer
  // only when nothing was ever said. The narrow `DEFINITIVE_QUOTA` is deliberately not
  // the broad allowance pattern — "rate limit" as a hint or a doc line must not
  // outrank a dead socket, only an actual refusal may.
  // NOT a bare `429` (second review, 11.08.2026). A real codex transcript reconnects
  // through repeated websocket 403s and then prints `last status: 429` as the LAST
  // thing it saw — an account with allowance to spare, whose run died in transport.
  // A bare code first would call that a spent account, which is the very mistake this
  // whole ordering exists to prevent, only one round further along. So the definitive
  // pattern demands the server's own REFUSING WORDS, and a naked code falls through to
  // transport and then to the broad pattern below.
  [OUTCOME.ALLOWANCE_EXHAUSTED, /too many requests|usage limit (?:reached|exceeded|hit)|you(?:'ve| have) hit your usage limit|quota (?:exceeded|exhausted)|credit balance|rate limit exceeded/i],
  [OUTCOME.UNREACHABLE, /error sending request|stream disconnected|reconnecting\b|connection (?:refused|reset|closed)|enotfound|eai_again|econnrefused|econnreset|etimedout|dns error|failed to lookup|network (?:error|is unreachable)/i],
  [OUTCOME.ALLOWANCE_EXHAUSTED, /usage limit|rate limit|quota|allowance|plan limit/i],
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
export function buildReviewPrompt({ sha = '', brief = '', mode = 'review', pass = null, receipt = '' } = {}) {
  const divergent = String(mode) === 'blind-parallel'
  const withReceipt = Boolean(String(receipt ?? '').trim())
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
    // A PASS REVIEWER IS TOLD THE MATERIAL'S SHAPE UP FRONT (structural finding,
    // fourth cross-vendor round): without this, every pass verdict degraded into
    // a coverage refusal over files another pass carries by design.
    ...(pass
      ? [
          '',
          `THIS IS PASS ${Number(pass.index)} OF ${Number(pass.total)} of a review split over the range's`,
          'FILE SET, because the whole range does not fit one round. The material OPENS WITH A',
          'MANIFEST naming which files THIS pass carries (and at which delivery level) and which',
          'are ABSENT BY DESIGN, each covered by another pass. A file the manifest declares',
          'absent is NOT truncated: do not refuse a verdict over its absence. Your verdict',
          'covers exactly the files this pass carries, and the range is cleared only once',
          'every pass is recorded.',
        ]
      : []),
    '',
    `WHAT TO JUDGE: ${brief}`,
    '',
    divergent
      ? 'This is a DIVERGENT step: produce your OWN complete list from the inputs, do not\n' +
        "check somebody else's. Name what could go wrong that nobody has written down.\n" +
        'Write the list as ONE ENTRY PER LINE in the form `B<n> | <file> | <the defect in\n' +
        'one line>`, numbered B1, B2, … — your list is list B. A THIRD model merges it with\n' +
        'list A and every entry is then accounted for by its id (CLAUDE.md §6), so an entry\n' +
        'without one cannot be counted and would simply disappear.'
      : 'This is a CONVERGENT review of ONE artefact: is the diff correct, does it match its\n' +
        'spec, are its tests real tests, what breaks that nobody tested?',
    '',
    'Report ONLY findings you can point at a line for. End your final message with',
    // THE TOKEN IS NEVER IN THE PROMPT (finding 8): it stands only on the
    // material's last line, so echoing it back is evidence the material was
    // read through to its end — a child that saw only this prompt cannot know it.
    ...(withReceipt
      ? [
          'EXACTLY these three lines and nothing after them:',
          'RECEIPT: <the hex token from the material\'s LAST line, "=== END OF MATERIAL — RECEIPT … ===">',
        ]
      : ['EXACTLY these two lines and nothing after them:']),
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
/** The VALUE of a labelled RAW line: everything after its first colon — the
 *  label always carries one, and decoration adds none before it. A label
 *  written `**EVIDENCE:**` closes its decoration right after the colon; that
 *  one marker run is dropped only when whitespace follows it, so a value that
 *  genuinely begins with a marker stays.
 *
 *  THE BOUNDARY, so nobody re-litigates it (final convergence): a RULING —
 *  anything that DECIDES by looking at the text: placeholder detection,
 *  presence, length, any match or classification — reads the STRIPPED copy,
 *  because decoration must not change a decision. A QUOTE — anything whose
 *  text reaches output a caller reads, cites or acts on — reads the RAW text
 *  through this helper, byte for byte, because the strip rewrites content
 *  (`src/__init__.py` → `src/init.py`). The one deliberate exception is the
 *  ADMISSION scan, which reads BOTH spellings: there the two readings can
 *  only widen the net, never shield it.
 *
 *  PADDING IS FORMAT, NOT CONTENT (trim sweep, final convergence): a labelled
 *  single-line field trims the separator whitespace at its edges — after the
 *  label's colon, around an entry's pipes, at line end — because that padding
 *  belongs to the `LABEL: value` / `id | file | text` format the prompts
 *  demand; the bytes INSIDE a field travel exactly. A whole-message quote
 *  (ask-sol's explain) is not a labelled field and trims NOTHING. */
export function rawFieldValue(rawLine) {
  const at = String(rawLine ?? '').indexOf(':')
  if (at < 0) return ''
  return String(rawLine)
    .slice(at + 1)
    .replace(/^\s*(?:[*_`]+(?=\s))?/, '')
    .trim()
}

export function parseVerdict(text, { receipt = '' } = {}) {
  const raw = String(text ?? '')
  // THE PAIR MUST BE THE END OF THE MESSAGE (four-eyes finding, 10.08.2026). The
  // prompt asks for exactly two closing lines; taking the last match of each
  // INDEPENDENTLY would happily pair a verdict with an evidence line from some
  // earlier paragraph, so the two final non-empty lines are what is read.
  //
  // MATCHED ON THE STRIPPED LINE, QUOTED FROM THE RAW ONE (final convergence):
  // the char-deleting strip exists so a decorated label still matches — but it
  // rewrites content (`src/__init__.py` → `src/init.py`), and the EVIDENCE
  // read here is what `--record` writes into the ledger. The character strip
  // removes no newline, so lines pair one to one. Stated exceptions, safe by
  // shape: the RECEIPT (hex token) and the VERDICT word are identifiers the
  // strip cannot rewrite and are read from the stripped line.
  const expected = String(receipt ?? '').trim()
  const pairs = raw
    .split('\n')
    .map((line) => ({ raw: line, clean: line.replace(/[*`_#>]/g, '').trim() }))
    .filter((p) => p.clean)
  const tailPairs = pairs.slice(expected ? -3 : -2)
  const tail = tailPairs.map((p) => p.clean)
  // THE RECEIPT IS DEMANDED WHERE ONE WAS ISSUED (fourth cross-vendor round,
  // pass 4, finding 8): the token stands only on the material's last line,
  // never in the prompt, so an answer that cannot repeat it is an answer from
  // a run whose material is not proven read — and that is not a verdict.
  if (expected) {
    const got = (/^[-*]?\s*RECEIPT\s*:\s*([0-9a-f]+)\s*$/i.exec(tail[0] ?? '')?.[1] ?? '').toLowerCase()
    if (got !== expected.toLowerCase()) {
      return {
        ok: false,
        verdict: '',
        evidence: '',
        error: got
          ? 'the RECEIPT line does not match the material\'s token — what was judged is not proven to be what was sent'
          : 'the answer carries no RECEIPT line — nothing proves the material was read to its end',
      }
    }
    tail.shift()
    tailPairs.shift()
  }
  const verdict = (/^[-*]?\s*VERDICT\s*:\s*(.+)$/i.exec(tail[0] ?? '')?.[1] ?? '').trim().toLowerCase()
  const evidenceMatched = /^[-*]?\s*EVIDENCE\s*:\s*(.+)$/i.test(tail[1] ?? '')
  const evidence = evidenceMatched ? rawFieldValue(tailPairs[1]?.raw) : ''
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
  // fallback, which costs a second reviewer, never a false green — but it is the
  // two-tier JUDGMENT, not the raw net: an evidence line that opens with what
  // was checked and then describes the reviewed code in the net's vocabulary is
  // a review, and routing its verdict to a fallback would discard it (measured
  // 18.08.2026, point 714 pass 2 — see blindReviewerAdmission).
  // Scanned RAW and STRIPPED, either hit admitting (the dual-scan rule): the
  // raw spelling may shield the words behind decoration the stripped one
  // unwraps, and vice versa.
  const evidenceClean = (/^[-*]?\s*EVIDENCE\s*:\s*(.+)$/i.exec(tail[1] ?? '')?.[1] ?? '').trim()
  if (blindReviewerAdmission(evidence) || blindReviewerAdmission(evidenceClean)) {
    return { ok: false, verdict: '', evidence: '', error: 'the reviewer says it could not see the change' }
  }
  // A line still in its angle brackets is the PLACEHOLDER echoed back, not an
  // observation. RULED on the STRIPPED capture (decoration must not change a
  // decision — `**<placeholder>**` walks a raw `/^</` test), while the quoted
  // evidence above stays raw.
  if (evidenceClean.length < 10 || /^</.test(evidenceClean)) {
    return { ok: false, verdict: '', evidence: '', error: 'no usable EVIDENCE line' }
  }
  return { ok: true, verdict, evidence: evidence || evidenceClean, error: '' }
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
export function decideReview({ outcome = {}, parsed = {}, authorModel = '', shortfall } = {}) {
  // THE REVERSED DIRECTION IS DECIDED BEFORE ANYTHING ELSE (point 667). Sol now
  // AUTHORS as well as reviews, and a model may not review its own work — so a
  // Sol run over a Sol-authored range is not a review whatever it answered, and
  // recording it would put a self-review in front of a gate that then reads
  // green. The runner asks the same question before it spends a codex call; this
  // is the backstop for every caller that does not.
  if (solAuthored(authorModel)) {
    return {
      model: claudeReviewerFor(authorModel),
      ranBy: '',
      verdict: '',
      evidence: '',
      fellBack: true,
      ready: false,
      kind: OUTCOME.SELF_REVIEW,
      cause: CAUSE_TEXT[OUTCOME.SELF_REVIEW],
    }
  }
  if (outcome.ok && parsed.ok) {
    return {
      model: SOL_MODEL_NAME,
      ranBy: SOL_MODEL_NAME,
      verdict: parsed.verdict,
      evidence: parsed.evidence,
      fellBack: false,
      // READY RESTS ON DELIVERY EVIDENCE, not on the exit code (escalation
      // round): a clean exit with a parseable verdict says nothing about
      // whether the round CARRIED its material. `shortfall` is the material
      // accounting's answer — an explicit null (the round provably complete)
      // is the only value that makes the record ready; a present shortfall
      // refuses, and a caller that never asked (undefined) refuses too,
      // because an unknown fit must never read as "everything was seen".
      ready: shortfall === null,
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
  return firstNonAuthor(FALLBACK_CHAIN, authorModels)
}

/** Every model designation of an author list, however it was handed over. */
function authorList(authorModels) {
  return (Array.isArray(authorModels) ? authorModels : [authorModels]).filter(Boolean)
}

/** The first candidate of a chain that authored no part of the range, or ''. */
function firstNonAuthor(chain, authorModels) {
  const authors = authorList(authorModels)
  return chain.find((candidate) => !authors.some((a) => sameModel(candidate, a))) ?? ''
}

/**
 * Did GPT-5.6 Sol author any part of this range (point 667)?
 *
 * Judged by `sameModel`, so every spelling of the one model answers alike — the
 * trailer's "GPT-5.6 Sol", a bare "Sol", the raw id. A range Sol wrote is a
 * range Sol may not review.
 */
export function solAuthored(authorModels = '') {
  return authorList(authorModels).some((a) => sameModel(a, SOL_MODEL_NAME))
}

/**
 * The Claude reviewer for work SOL AUTHORED — the first of CLAUDE_REVIEW_CHAIN
 * that authored no part of the range, or '' when every one of them did.
 *
 * Empty is a real answer and is reported as one: a range written by Sol AND by
 * all three Claude models has no reviewer that is not also an author, and
 * saying so beats recording a self-review.
 */
export function claudeReviewerFor(authorModels = '') {
  return firstNonAuthor(CLAUDE_REVIEW_CHAIN, authorModels)
}

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
 * The budget is spent in the order that matters — the patch first (which is
 * CAPPED TOO: an uncapped diff used to blow the ceiling and leave nothing for the
 * files, four-eyes finding 10.08.2026), then each changed file — and what does
 * not fit is CUT VISIBLY, because a reviewer that silently saw half a file would
 * report on the half it saw.
 *
 * THE TEXT IS ONLY HALF THE ANSWER (point 714). What the cut cost is accounted
 * for in `assembleMaterial`, whose second return half is what decides whether a
 * record may be printed at all — this wrapper keeps the string-only shape for the
 * callers that just want the material.
 */
export function formatReviewMaterial(options = {}) {
  return assembleMaterial(options).text
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
      // The SAME header parser the pass split uses, so a path git QUOTED is read
      // as one path by both — two readers of one line that disagree are how a
      // file falls out of the material with nothing said (cross-vendor round).
      const header = parseDiffHeader(lines[j])
      if (header) {
        paths.add(header.b)
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

/**
 * Does this review cover everything a record at that sha would clear?
 *
 * Returns null when it does, and the `partial` description when it does not —
 * which is what stops the record command being printed (formatReviewReport).
 * ONLY an answer EQUAL to the reviewed base counts as full coverage: an
 * unanswerable merge-base is not an answer of "everything", and defaulting it to
 * one switched the whole check off (fourth cross-vendor round). It lives here,
 * pure, because the wrapper's own version could be reverted without a test
 * noticing (same round).
 */
export function coverageDecision({ reviewedBase = '', coverageBase = '' } = {}) {
  const reviewed = String(reviewedBase ?? '')
  const coverage = String(coverageBase ?? '')
  if (coverage && coverage === reviewed) return null
  return { reviewedBase: reviewed, coverageBase: coverage || 'an unknown commit' }
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
export function probeFreshness(receipt, now = Date.now(), maxAgeMs = PROBE_MAX_AGE_MS, fingerprint = '') {
  const at = Number(receipt?.at ?? 0)
  if (!receipt || receipt.refused !== true || !at) {
    return { fresh: false, warning: `the model id ${SOL_MODEL_ID} has never been proven honoured on this machine — run: node scripts/review-sol.mjs --probe` }
  }
  // THE PROOF IS BOUND TO WHAT PRODUCED IT (fifth cross-vendor round). The
  // receipt outlives container rebuilds, so a proof taken with another codex
  // version, another binary or another account says nothing about the run being
  // attributed now: a changed fingerprint expires it immediately, whatever its
  // age. An empty fingerprint on either side only means "cannot tell", and time
  // alone decides then.
  if (fingerprint && receipt.fingerprint && receipt.fingerprint !== fingerprint) {
    return {
      fresh: false,
      warning: 'the codex binary, its version or the logged-in account changed since the model id was proven — re-proving it',
    }
  }
  if (fingerprint && !receipt.fingerprint) {
    return { fresh: false, warning: 'the model-id proof predates fingerprinting and cannot be tied to this codex — re-proving it' }
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
  return `${mainCheckoutFrom(gitCommonDir, repoRoot)}${sep}local${sep}codex-auth.json`
}

/**
 * The MAIN checkout, given git's common dir — the directory the login above and the
 * share switch (scripts/sol-share-core.mjs) both belong in, for the same reason: they
 * are the MACHINE's state, and a delegated agent's worktree is deleted when its point
 * lands. With no git answer the current checkout is the honest fallback.
 */
export function mainCheckoutFrom(gitCommonDir, repoRoot) {
  const common = String(gitCommonDir ?? '').trim().replace(/[/\\]+$/, '')
  const base = /(?:^|[/\\])\.git$/.test(common) ? common.replace(/[/\\]\.git$/, '') : String(repoRoot ?? '')
  return base || String(repoRoot ?? '')
}

/** Shell-quote one value for the record command line we print. */
const q = (s) => `"${String(s ?? '').replace(/(["\\$`])/g, '\\$1')}"`

/** Shortest readable form of a sha — and unchanged for anything that is not one. */
const short = (s) => (/^[0-9a-f]{7,40}$/i.test(String(s ?? '')) ? String(s).slice(0, 7) : String(s ?? ''))

/**
 * The record command, in the shape `mechanism-review.mjs --record` expects.
 *
 * After a Sol run it is complete and can be run as printed. After a fallback the
 * verdict and the evidence stand as ANGLE-BRACKET PLACEHOLDERS the recorder
 * refuses — so a hand that pastes it without giving the review to Fable first
 * gets a refusal, not a green ledger line.
 */
export function formatRecordCommand({
  sha = '',
  model = '',
  verdict = '',
  evidence = '',
  mode = 'review',
  point = '',
  pass = null,
} = {}) {
  const parts = [
    'node scripts/mechanism-review.mjs',
    `--record ${sha || '<sha>'}`,
    `--model ${q(model)}`,
    `--verdict ${verdict || `<${VERDICTS.join('|')}>`}`,
    `--evidence ${verdict ? q(evidence) : '"<what the review actually checked>"'}`,
    `--mode ${mode}`,
  ]
  if (String(point ?? '').trim()) parts.push(`--point ${String(point).trim()}`)
  // A PASS RECORD NAMES WHAT IT ACTUALLY READ (point 714). The range was too
  // large for one round, so this verdict covers the files of this pass alone —
  // and the gate clears the range only once every pass of the same total is on
  // record, which is what makes a composition a coverage rather than a claim.
  // The list is written in the ONE round-trippable representation (a path with
  // a comma, a quote or edge whitespace travels C-quoted, as git prints it), so
  // what the recorder stores is byte-identical to what this pass read.
  if (pass) {
    parts.push(`--pass ${pass.index}/${pass.total}`, `--pass-files ${q(formatPassFiles(pass.files ?? []))}`)
  }
  return parts.join(' ')
}

/**
 * The whole verdict of a run as the command prints it: one line naming what
 * happened — LOUD on a fallback, per the point's "name the cause in ONE line" —
 * then the record command.
 */
export function formatReviewReport({
  decision = {},
  sha = '',
  mode = 'review',
  point = '',
  partial = null,
  shortfall,
  plan = null,
  pass = null,
} = {}) {
  // THE REPORT RESTS ON decision.ready, NEVER ON A PARAMETER'S DEFAULT (fourth
  // cross-vendor round, pass 3). decideReview answers ready:false for a round
  // whose delivery accounting it was never shown — and this function then
  // printed the record command anyway, because its own `shortfall` parameter
  // defaulted to null, which is the accounting's word for "provably complete".
  // That is the fail-open this point exists to close, surviving in the one
  // function that decides what the caller is told to run. An absent accounting
  // is now the same refusal the accounting itself makes of an unknown fit; the
  // deliberate fallback templates (whose placeholders the recorder refuses
  // anyway) keep their shape, so only the successful-run path is gated here.
  const gap =
    shortfall !== null && shortfall !== undefined
      ? shortfall
      : !decision.fellBack && decision.ready !== true
        ? {
            reason: 'unverified',
            detail: 'the caller never asked the material accounting whether this round carried its range',
            truncated: [],
            omitted: [],
            budget: MATERIAL_BUDGET_CHARS,
            size: 0,
            rawSize: 0,
          }
        : null
  // A RECORD IS NEVER PRINTED FOR LESS THAN IT CLEARS (fourth cross-vendor
  // round). Both gates treat a record as covering every commit it CONTAINS, so a
  // narrowed range — `--since <sha>~1` on a branch with older commits — would
  // produce a ledger line that clears work this reviewer never saw. The verdict
  // is still reported; the ready-to-run command is not.
  if (partial) {
    const said = decision.fellBack
      ? `${SOL_MODEL_NAME} did not review it: ${decision.cause}`
      : `${SOL_MODEL_NAME} reviewed ${partial.reviewedBase.slice(0, 7)}..${String(sha).slice(0, 7)} → ${decision.verdict}\n  ${decision.evidence}`
    return [
      `review-sol: ${said}`,
      '',
      `  NO RECORD COMMAND IS PRINTED. A record at ${String(sha).slice(0, 7)} clears every commit it contains,`,
      // A hand-over never SAW anything, but the refusal is the same: only the
      // narrowed range was measured, and a template for the whole sha would
      // claim the rest (escalation round — both early routes printed one).
      decision.fellBack
        ? `  back to ${short(partial.coverageBase)}, and only the range back to ${short(partial.reviewedBase)} was measured here.`
        : `  back to ${short(partial.coverageBase)}, and this review only saw back to ${short(partial.reviewedBase)}.`,
      '  Re-run without --since to review the whole range, then record that.',
      // TWO REASONS ARE NOT ONE (cross-vendor review, second round): a narrowed
      // range whose round ALSO overflowed used to report only the narrowing, and
      // the files nobody read went unnamed — while the point demands each one be
      // named in the refusal, whatever else is wrong with the round.
      ...(gap ? ['', '  And it did not carry even that much:', formatShortfall(gap, { sha, plan })] : []),
    ].join('\n')
  }
  // A RECORD IS NEVER PRINTED FOR MATERIAL THE ROUND DID NOT CARRY (point 714).
  // The truncation notice is written INTO the material, so it reached the caller
  // only if the model chose to mention it — and a model that did not would have
  // produced a clean-looking record command covering files nobody read. The
  // verdict is still reported, because the reviewer's findings are worth having;
  // the ready-to-run command is not.
  if (gap) {
    // THE HAND-OVER STILL HAS TO NAME ITS READER. A short-fall on a path that
    // never ran Sol at all — the share switch, or a range Sol authored — is
    // still a review somebody must do, and a refusal that dropped the reviewer's
    // name left the caller with no idea whose review it was waiting for.
    const who = decision.model
    const handOver = who
      ? `  The review is ${who}'s, and it is NOT done.`
      : '  No model of the chain may review this range — every one of them authored part of it.'
    const said = !decision.fellBack
      ? `${SOL_MODEL_NAME} answered ${decision.verdict} on ${String(sha).slice(0, 7)}\n  ${decision.evidence}`
      : decision.kind === OUTCOME.SELF_REVIEW
        ? `ROLE SWAP — ${SOL_MODEL_NAME} AUTHORED part of ${String(sha).slice(0, 7)}, so it may not review it.\n${handOver}`
        : `${SOL_MODEL_NAME} did not review it: ${decision.cause}.\n${handOver}`
    return [`review-sol: ${said}`, '', formatShortfall(gap, { sha, plan })].join('\n')
  }
  const cmd = formatRecordCommand({
    sha,
    model: decision.model,
    verdict: decision.verdict,
    evidence: decision.evidence,
    mode,
    point,
    pass,
  })
  // EVERY pass template carries the not-cleared warning — the fallback and
  // role-swap templates included (round-5 pass 6) — and the way to the
  // remainder consults the LEDGER, not the pass number (round-4 pass 6):
  // passes run in any order, so "next: k+1" recommended recorded passes and
  // fell silent on unrecorded ones. This formatter is pure and cannot read
  // the ledger, so it points at the listing that can.
  const passWarning = pass
    ? [
        '',
        `  The range is NOT cleared until every pass 1..${pass.total} is recorded — ` +
          'node scripts/mechanism-review.mjs --list shows which already are.',
      ]
    : []
  if (!decision.fellBack) {
    const scope = pass
      ? ` (PASS ${pass.index}/${pass.total} — ${(pass.files ?? []).length} file(s) of a range too large for one round)`
      : ''
    return [
      `review-sol: ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) reviewed ${String(sha).slice(0, 7)} → ${decision.verdict}${scope}`,
      `  ${decision.evidence}`,
      '',
      'Record it (the model named is the one that actually ran):',
      `  ${cmd}`,
      ...passWarning,
    ].join('\n')
  }
  // The prose names the model the DECISION picked, not the usual one: where
  // Fable authored the change the reviewer is Opus 5, and an instruction saying
  // "hand it to Fable" beside a command naming Opus is how a self-review gets
  // recorded (four-eyes finding, second round, 10.08.2026).
  const who = decision.model
  // THE ROLE SWAP IS NOT A FALLBACK (point 667), and calling it one would read as
  // something having gone wrong. Sol authored this range; the review was always
  // Claude's, together with the suites, the picture and the landing.
  if (decision.kind === OUTCOME.SELF_REVIEW) {
    if (!who) {
      return [
        `review-sol: ROLE SWAP — ${SOL_MODEL_NAME} AUTHORED part of ${String(sha).slice(0, 7)}, so it may not review it.`,
        `  And every model of ${CLAUDE_REVIEW_CHAIN.join(', ')} authored part of it too, so none of them`,
        '  may either. The review is NOT done and cannot be recorded: review a narrower range.',
      ].join('\n')
    }
    return [
      `review-sol: ROLE SWAP — ${SOL_MODEL_NAME} AUTHORED part of ${String(sha).slice(0, 7)}, so it may not review it.`,
      `  The review is ${who}'s, which also runs the suites, judges the picture and lands the point.`,
      '  Record what IT says — never a verdict this command invented:',
      '',
      `     ${cmd}`,
      ...passWarning,
    ].join('\n')
  }
  if (!who) {
    return [
      `review-sol: FALLBACK — ${SOL_MODEL_NAME} did not review ${String(sha).slice(0, 7)}: ${decision.cause}.`,
      `  And EVERY model in the fallback chain (${FALLBACK_CHAIN.join(', ')}) authored part of this`,
      '  range, so none of them may review it. The review is NOT done and cannot be recorded:',
      `  fix the ${SOL_MODEL_NAME} run, or review a narrower range one of them did not write.`,
    ].join('\n')
  }
  // A FAILED DELIVERY OFFERS NO RECORD IN ANY SHAPE (escalation round). A record
  // is offered only for what was actually read — and after a spawn error, a
  // timeout, a dead host, a refused login or an error exit, nothing was: the
  // material was lost with the run. The placeholder template used to survive
  // here for the next reviewer to fill, but a ready-made whole-sha template is
  // an offer no completed hand-off backs. The two kinds below are different: a
  // NO_VERDICT run completed its transfer and answered unusably, and the share
  // switch never attempted one — both hand-offs rest on a measured, fitting
  // plan, so their template (whose placeholders the recorder refuses anyway)
  // stays. Every other kind — the unknown ones included — refuses.
  if (decision.kind !== OUTCOME.NO_VERDICT && decision.kind !== OUTCOME.SWITCHED_OFF) {
    return [
      `review-sol: FALLBACK — ${SOL_MODEL_NAME} did not review ${String(sha).slice(0, 7)}: ${decision.cause}.`,
      '  NO RECORD COMMAND IS PRINTED: the hand-off did not complete, so nothing of this range',
      "  was read — the whole round's material was lost with the run.",
      `  The review is NOT done — it is ${who}'s now. Hand it the commit and the brief above;`,
      '  it reads the range itself, and only what IT actually read may be recorded.',
    ].join('\n')
  }
  return [
    `review-sol: FALLBACK — ${SOL_MODEL_NAME} did not review ${String(sha).slice(0, 7)}: ${decision.cause}.`,
    `  The review is NOT done. Hand it to ${who} and record what IT says:`,
    '',
    `  1. give ${who} the commit and the brief above,`,
    `  2. then record its verdict — never this command's:`,
    `     ${cmd}`,
    ...passWarning,
  ].join('\n')
}
