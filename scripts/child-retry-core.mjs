// LAYER 5 — RETRY A CHILD, NOT AN OUTAGE (point 434 part 3), the decision half:
// pure, dependency-injected, no I/O. The I/O lives in scripts/child-retry.mjs.
//
// WHY THIS EXISTS. On the night of 29./30.07.2026 two delegated agents died on
// ONE upstream 500 within the same minutes. A naive "the child died, spawn it
// again" would have bought four more deaths into the same outage and burned the
// night's remaining tokens on nothing. The opposite failure is just as real: a
// single transient death today ends a point that was three commits from done,
// and nobody notices until morning. So the rule is neither "always retry" nor
// "never retry" — it is:
//
//   1. TRANSIENCE IS AN ALLOWLIST, never a guess. HTTP 5xx/429/529,
//      ECONNRESET/ETIMEDOUT and the harness's own "API error" death are
//      transient. EVERYTHING else — a red gate, a guard block, an escalated
//      brief, an unrecognised message — is NOT, and the default is no retry.
//      A death whose text merely CONTAINS a number must never read as a 500:
//      the non-transient markers are matched FIRST and win.
//   2. THE SAME SIGNATURE ACROSS TWO CHILDREN IN ONE WINDOW IS AN OUTAGE.
//      Not bad luck, not a retryable accident — pause the batch and report it.
//      This is the clause that would have prevented that night.
//   3. NEVER REPEAT WORK THAT LANDED. A child that reported a step complete is
//      never retried (its output is on the branch and belongs to the merge, not
//      to a second build), and a child that COMMITTED since its spawn is
//      re-prompted to CONTINUE rather than to repeat.
//   4. THE SAME BRANCH AND THE SAME BRIEF REVISION, or it is not a retry. A
//      changed brief is a new spawn and goes through the ordinary door.
//   5. BOUNDED. At most two retries per point, rising backoff, and a token cap
//      per point so one stubborn item cannot eat a night's budget.
//
// Where two verdicts are close this file chooses the CHEAPER MISTAKE: not
// retrying costs one deliberate re-spawn in the morning; retrying into an
// outage costs the night.

/** At most two retries of one point — beyond that the failure is not transient
 *  however it presents itself. */
export const MAX_RETRIES = 2

/** Backoff before retry 1 and retry 2. Long enough for a provider blip to pass
 *  (the 29./30.07. 500s cleared inside minutes), short enough that a night is
 *  not spent waiting. Index = number of retries already spent. */
export const RETRY_BACKOFF_MS = [2 * 60 * 1000, 8 * 60 * 1000]

/** How far back the outage detector looks. Two children dying of the same thing
 *  inside a quarter of an hour is a shared cause; a day apart is not. */
export const OUTAGE_WINDOW_MS = 15 * 60 * 1000

/** How many DISTINCT children with the same signature make it an outage. Two —
 *  which is exactly what that night produced. */
export const OUTAGE_CHILD_THRESHOLD = 2

/** The token ceiling one work-order point may consume across all its spawns.
 *  Calibratable via HOA_POINT_TOKEN_CAP (see scripts/child-retry.mjs). A big
 *  fan-out has already eaten ~3M tokens in a day; half of that on ONE point is
 *  a runaway, not progress. */
export const POINT_TOKEN_CAP = 1_500_000

/** How long a recorded death stays in the state file. Longer than the outage
 *  window so the window can never be emptied by pruning, short enough that the
 *  file stays small. */
export const DEATH_RETENTION_MS = 6 * 60 * 60 * 1000

/**
 * NON-TRANSIENT MARKERS, MATCHED FIRST AND WINNING.
 *
 * A red regression prints test counts, a guard block prints paths, and either
 * may contain "500" by accident. If the transient allowlist ran first, a red
 * gate with 500 assertions in it would be retried into the same red gate twice.
 * So these are checked before anything else, and any hit ends the question.
 */
export const NON_TRANSIENT_PATTERNS = [
  { label: 'gate-red', re: /\b(?:gate|ci|regression|vitest|test|tests|build|(?:ox)?lint|audit|typecheck)\b[^\n]{0,60}\b(?:red|fail|failed|failing|failure|error[s]?)\b/i },
  { label: 'gate-red', re: /\b(?:fail|failed|failing|failure)\b[^\n]{0,60}\b(?:gate|ci|regression|vitest|test|tests|build|(?:ox)?lint|audit)\b/i },
  { label: 'guard-block', re: /\bguard\b[^\n]{0,60}\b(?:block|blocked|blocks|denied|deny)\b/i },
  { label: 'guard-block', re: /\b(?:block|blocked|denied)\b[^\n]{0,60}\bguard\b/i },
  { label: 'guard-block', re: /\bPreToolUse\b|\bStop hook\b/i },
  { label: 'brief-escalated', re: /\bescalat(?:e|ed|ing|ion)\b/i },
  { label: 'brief-escalated', re: /\bbrief\b[^\n]{0,60}\b(?:insufficient|incomplete|unclear|contradict\w*)\b/i },
  { label: 'merge-conflict', re: /\bmerge conflict\b|\bCONFLICT \(/i },
]

/**
 * THE TRANSIENT ALLOWLIST. Nothing outside it is transient — an unrecognised
 * death is an unknown death, and an unknown death is not retried.
 *
 * The HTTP forms demand a status-ish context ("API Error: 500", "status 503",
 * "HTTP 429"), never a bare number, because a bare number in a stack trace is
 * not a status code. `Overloaded` is Anthropic's 529 by another name and
 * normalises to it, so the outage detector sees the two spellings as ONE
 * signature — which matters, since the same outage can print either.
 *
 * THE CONTEXT WORDS ARE DELIBERATELY NARROW. A bare `code` and a bare `error`
 * stood here and were REMOVED by the four-eyes review, which found that
 * "oxlint found 1 error: 503 warnings suppressed" read as a transient http-503
 * and "the child exited with code 502" as a transient http-502. A lint red is in
 * the NEVER-retry class, and retrying one buys the identical red a second time.
 * `api error` stays, because that IS the harness's own death.
 */
export const TRANSIENT_PATTERNS = [
  { signature: null, re: /\b(?:http|https|status|statuscode|status[ _-]?code|api error)\b\W{0,4}(429|5\d\d)\b/i, group: 1 },
  { signature: null, re: /\b(429|5\d\d)\b\s*(?:internal server error|bad gateway|service unavailable|gateway time-?out|too many requests|overloaded)/i, group: 1 },
  { signature: 'http-529', re: /\boverloaded(?:_error)?\b/i },
  { signature: 'http-429', re: /\brate[ _-]?limit(?:ed|ing)?\b/i },
  { signature: 'econnreset', re: /\bECONNRESET\b/i },
  { signature: 'etimedout', re: /\bETIMEDOUT\b/i },
  { signature: 'api-error', re: /\bAPI (?:Error|error)\b/ },
]

/** Signatures this module emits, as the command's `--signature` also accepts
 *  them pre-normalised (a caller that already classified need not re-print the
 *  provider's prose). */
const NORMALISED_SIGNATURE = /^(?:http-(?:429|5\d\d)|econnreset|etimedout|api-error)$/

/**
 * Classify a child's death text.
 *
 * @param {string} text  whatever the harness reported — a message, a stack, a
 *                       one-line summary, or an already normalised signature.
 * @returns {{transient: boolean, signature: string, label: string}}
 *          `signature` is stable across spellings of one cause, so the outage
 *          detector can compare two children by it.
 */
export function classifyDeath(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return { transient: false, signature: 'unknown', label: 'no death signature was reported' }

  // An already-normalised signature passes straight through.
  if (NORMALISED_SIGNATURE.test(raw.toLowerCase())) {
    return { transient: true, signature: raw.toLowerCase(), label: `transient: ${raw.toLowerCase()}` }
  }

  for (const { label, re } of NON_TRANSIENT_PATTERNS) {
    if (re.test(raw)) return { transient: false, signature: label, label: `not transient: ${label}` }
  }

  for (const { signature, re, group } of TRANSIENT_PATTERNS) {
    const m = raw.match(re)
    if (!m) continue
    const sig = signature ?? `http-${m[group]}`
    return { transient: true, signature: sig, label: `transient: ${sig}` }
  }

  return { transient: false, signature: 'unrecognised', label: 'not transient: the death does not match the transient allowlist' }
}

/** The identity a death is counted under. A child id when the caller has one,
 *  else the point/branch pair — two deaths of the SAME child are one child. */
export function childKey({ childId, point, branch } = {}) {
  if (childId) return String(childId)
  return `${point ?? '?'}:${branch ?? '?'}`
}

/** An empty state document, so every reader gets the same shape. */
export function emptyState() {
  return { deaths: [], points: {} }
}

/** The recorded deaths of a state document, defensively. A half-written or
 *  hand-edited file must not throw here — layer 5 has to answer even when every
 *  other layer's input is missing, stale or garbage (§8, independence). */
export function stateDeaths(state) {
  return Array.isArray(state?.deaths) ? state.deaths : []
}

/** The per-point map of a state document, defensively (see stateDeaths). */
function statePoints(state) {
  const p = state?.points
  return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
}

/** The per-point record, defaulted. */
export function pointRecord(state, point) {
  const rec = statePoints(state)[String(point)]
  return {
    retries: Number(rec?.retries) || 0,
    tokens: Number(rec?.tokens) || 0,
    branch: rec?.branch ?? null,
    briefRevision: rec?.briefRevision ?? null,
    completedSteps: Number(rec?.completedSteps) || 0,
  }
}

/**
 * Distinct children that died of `signature` inside the window — the current
 * one INCLUDED, because the decision is made before the death is recorded and
 * a detector that needed the caller to record first would be one child late.
 */
export function outageWitnesses({ deaths = [], signature, key, now = Date.now(), windowMs = OUTAGE_WINDOW_MS } = {}) {
  const seen = new Set()
  if (key) seen.add(key)
  for (const d of Array.isArray(deaths) ? deaths : []) {
    if (!d || d.signature !== signature) continue
    const at = Number(d.at)
    if (!Number.isFinite(at) || now - at > windowMs || at > now + 60_000) continue
    seen.add(d.key ?? childKey(d))
  }
  return [...seen]
}

/**
 * THE DECISION. Pure: everything it reads is an argument.
 *
 * @returns {{verdict: 'retry'|'no-retry'|'outage-pause'|'stand-down', ...}}
 */
export function retryDecision({
  point,
  branch = null,
  briefRevision = null,
  childId = null,
  death = '',
  reportedComplete = false,
  committedSinceSpawn = false,
  state = emptyState(),
  now = Date.now(),
  paused = false,
  ownsLock = true,
  tokensUsed = null,
  tokenCap = POINT_TOKEN_CAP,
  maxRetries = MAX_RETRIES,
  backoffs = RETRY_BACKOFF_MS,
  outageWindowMs = OUTAGE_WINDOW_MS,
  outageThreshold = OUTAGE_CHILD_THRESHOLD,
} = {}) {
  // STAND-DOWN comes first and answers nothing else: a session that does not own
  // the batch, and a paused batch, have no business deciding to spawn anything.
  if (paused) {
    return stand('the batch is paused — a paused batch spawns nothing; clear the pause first')
  }
  if (!ownsLock) {
    return stand('this session does not own the batch lock — the owner decides about its own children')
  }

  const { transient, signature, label } = classifyDeath(death)
  const key = childKey({ childId, point, branch })
  const rec = pointRecord(state, point)

  const base = {
    point: point ?? null,
    branch,
    briefRevision,
    childKey: key,
    signature,
    transient,
    retriesSpent: rec.retries,
    tokensUsed: Number.isFinite(tokensUsed) ? tokensUsed : rec.tokens,
    tokenCap,
  }

  if (!transient) {
    return { ...base, verdict: 'no-retry', reason: `${label} — a death outside the transient allowlist is fixed by a person, not by a second attempt`, backoffMs: 0, promptMode: null, promptHint: null }
  }

  // THE CLAUSE OF THE NIGHT: two children, one signature, one window.
  const witnesses = outageWitnesses({ deaths: stateDeaths(state), signature, key, now, windowMs: outageWindowMs })
  if (witnesses.length >= outageThreshold) {
    return {
      ...base,
      verdict: 'outage-pause',
      reason: `${witnesses.length} children died of ${signature} inside ${Math.round(outageWindowMs / 60000)} min — that is an environment outage, not bad luck; pause and report instead of retrying into it`,
      witnesses,
      backoffMs: 0,
      promptMode: null,
      promptHint: null,
    }
  }

  if (reportedComplete || rec.completedSteps > 0) {
    return { ...base, verdict: 'no-retry', reason: 'the child reported a step complete — its work is on the branch and belongs to the merge; a retry would rebuild what already exists', backoffMs: 0, promptMode: null, promptHint: null }
  }

  // A retry is the SAME spawn once more. A different branch or a re-cut brief is
  // a new spawn and must not inherit this point's retry budget.
  if (rec.branch && branch && rec.branch !== branch) {
    return { ...base, verdict: 'no-retry', reason: `the branch changed since the first spawn (${rec.branch} → ${branch}) — that is a new spawn, not a retry`, backoffMs: 0, promptMode: null, promptHint: null }
  }
  if (rec.briefRevision && briefRevision && rec.briefRevision !== briefRevision) {
    return { ...base, verdict: 'no-retry', reason: `the brief revision changed since the first spawn (${rec.briefRevision} → ${briefRevision}) — re-cut briefs get a fresh spawn, not a retry`, backoffMs: 0, promptMode: null, promptHint: null }
  }

  if (rec.retries >= maxRetries) {
    return { ...base, verdict: 'no-retry', reason: `${rec.retries} retries already spent on point ${point} (cap ${maxRetries}) — a third transient death is a pattern, not an accident`, backoffMs: 0, promptMode: null, promptHint: null }
  }

  const spent = Number.isFinite(tokensUsed) ? tokensUsed : rec.tokens
  if (spent >= tokenCap) {
    return { ...base, verdict: 'no-retry', reason: `point ${point} has consumed ${spent} tokens (cap ${tokenCap}) — the budget is the stop condition; re-open it deliberately`, backoffMs: 0, promptMode: null, promptHint: null }
  }

  const backoffMs = backoffs[Math.min(rec.retries, backoffs.length - 1)]
  const promptMode = committedSinceSpawn ? 'continue' : 'repeat'
  return {
    ...base,
    verdict: 'retry',
    attempt: rec.retries + 1,
    maxRetries,
    backoffMs,
    retryAt: now + backoffMs,
    promptMode,
    promptHint: promptHint({ promptMode, branch: branch ?? rec.branch, briefRevision: briefRevision ?? rec.briefRevision, point }),
    reason: `${label}, retry ${rec.retries + 1} of ${maxRetries} after ${Math.round(backoffMs / 1000)} s on the same branch and the same brief revision`,
  }
}

/** The one line the main session puts at the top of the re-spawn prompt. */
export function promptHint({ promptMode, branch, briefRevision, point }) {
  const where = `branch ${branch ?? '<the same branch>'}${briefRevision ? `, brief revision ${briefRevision}` : ''}`
  if (promptMode === 'continue') {
    return `CONTINUE, do not repeat: the previous agent for point ${point} already COMMITTED on ${where}. Check out that branch, read its git log first, and carry on from where it stopped.`
  }
  return `REPEAT: the previous agent for point ${point} died before committing anything. Re-spawn with the unchanged brief on ${where}.`
}

function stand(reason) {
  return { verdict: 'stand-down', reason, backoffMs: 0, promptMode: null, promptHint: null, transient: false, signature: 'n/a' }
}

/** Record a death — pure state transition, pruning what has aged out. */
export function recordDeath(state, { point, branch, childId, signature, verdict, at }, { retentionMs = DEATH_RETENTION_MS } = {}) {
  const next = { deaths: [...stateDeaths(state)], points: { ...statePoints(state) } }
  next.deaths.push({ key: childKey({ childId, point, branch }), point: point ?? null, branch: branch ?? null, signature, verdict, at })
  next.deaths = next.deaths.filter((d) => Number.isFinite(Number(d?.at)) && at - Number(d.at) <= retentionMs)
  return next
}

/** Book a granted retry against the point's budget — pure state transition. */
export function recordRetry(state, { point, branch, briefRevision, tokensUsed }) {
  const key = String(point)
  const rec = pointRecord(state, point)
  return {
    deaths: [...stateDeaths(state)],
    points: {
      ...statePoints(state),
      [key]: {
        retries: rec.retries + 1,
        tokens: Number.isFinite(tokensUsed) ? tokensUsed : rec.tokens,
        branch: branch ?? rec.branch,
        briefRevision: briefRevision ?? rec.briefRevision,
        completedSteps: rec.completedSteps,
      },
    },
  }
}

/** Note that a point's child reported a step complete — from here on it is never
 *  retried, however it later dies. */
export function recordCompletion(state, { point, tokensUsed }) {
  const key = String(point)
  const rec = pointRecord(state, point)
  return {
    deaths: [...stateDeaths(state)],
    points: {
      ...statePoints(state),
      [key]: { ...rec, completedSteps: rec.completedSteps + 1, tokens: Number.isFinite(tokensUsed) ? tokensUsed : rec.tokens },
    },
  }
}

/** The German pause text for an outage verdict — the morning reader's sentence,
 *  not a log line. */
export function outagePauseReason(decision, stamp) {
  return (
    `Umgebungsausfall: ${decision.witnesses?.length ?? 2} Agenten sind innerhalb von ` +
    `${Math.round(OUTAGE_WINDOW_MS / 60000)} Minuten am selben Fehler gestorben (${decision.signature}). ` +
    `Der Batch pausiert absichtlich, statt in den Ausfall hinein neu zu starten. ` +
    `Er läuft weiter, sobald die Pause-Datei .claude/batch-paused gelöscht wird — bitte erst prüfen, ob die API wieder antwortet. ` +
    `[${stamp}]`
  )
}

/** One human line for the console and the log — English, this is machine-facing. */
export function describeDecision(d) {
  const head = `${d.verdict.toUpperCase()} — ${d.reason}`
  if (d.verdict !== 'retry') return head
  return `${head}\n  wait ${Math.round(d.backoffMs / 1000)} s, then re-spawn.\n  ${d.promptHint}`
}
