// Pure decision core of the serving-model tripwire (point 309): on 24.07.2026
// the session silently degraded to Haiku 4.5 and merged defective work; the
// Co-Authored-By trailer in `git log` is the one mechanical record of WHO
// actually authored a commit. This module only decides — no I/O; the gathering
// and blocking live in the fail-open wrapper scripts/model-guard.mjs.
//
// Model policy (user, 25.07.2026): ONLY Opus 5 (default), Opus 4.8 (fallback
// when Opus 5 is unavailable) and Fable 5 (occasional four-eyes work) may run
// the batch. Every other model — Sonnet and Haiku included — is a policy
// breach: the batch must stop rather than run on it. Hence an ALLOWLIST, not
// a Haiku blocklist: an unknown future model name fails closed.

// AN UNNAMED AUTHOR IS NOT A FORBIDDEN ONE (point 397, observed 28.07.2026 and
// again on 29.07.2026): commits carrying the bare `Co-Authored-By: Claude
// <noreply@anthropic.com>` — the trailer with no model name at all — failed the
// allowlist exactly as a Haiku trailer does and demanded the full breach ritual,
// though every session live in that window was Opus 5. The guard is not softened:
// a bare trailer is no proof of compliance either. It is SPLIT, because the two
// states have different answers — a forbidden model stops the batch, an
// unidentified one is LOOKED UP in the local transcripts and then resolved.

/** Claude-model trailers allowed to author batch commits. */
export const ALLOWED = /\b(opus|fable)\b/i

/** Any Claude co-author trailer (human co-authors are not model evidence). */
export const CLAUDE_TRAILER = /\bclaude\b/i

/** Words that stand beside "Claude" without naming a MODEL: the product name and
 *  the context-window suffix. A trailer left with nothing after these names no
 *  model, so it is unidentified rather than forbidden. */
const NON_MODEL_WORDS = /\b(code|agent)\b/gi

/** What a single co-author trailer says the model is, with the vendor word, the
 *  address, any parenthesised suffix and the non-model words stripped. Empty
 *  means the trailer names no model. */
export function modelNameIn(trailer) {
  return String(trailer ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bco-authored-by:/gi, ' ')
    .replace(/\bclaude\b/gi, ' ')
    .replace(NON_MODEL_WORDS, ' ')
    .replace(/[\s,;]+/g, ' ')
    .trim()
}

/** The three states a commit's co-author field can be in, worst first. */
export const CLASSES = Object.freeze(['forbidden', 'unidentified', 'allowed'])

/**
 * Classify a commit's `Co-Authored-By` field:
 *   'forbidden'    a Claude trailer NAMES a model outside the allowlist
 *   'unidentified' a Claude trailer names NO model at all
 *   'allowed'      every Claude trailer names an allowed model — or there is no
 *                  Claude trailer at all (a merge commit and a purely human
 *                  co-author carry no model evidence and are not judged)
 *
 * A commit may carry several co-authors; each is judged alone and the WORST
 * verdict wins, so one forbidden co-author flags the commit even next to an
 * allowed one, and one bare trailer beside a named one is still unidentified.
 */
export function classifyTrailer(trailerField) {
  let worst = 'allowed'
  for (const part of String(trailerField ?? '').split(/[,;]/)) {
    if (!CLAUDE_TRAILER.test(part) || ALLOWED.test(part)) continue
    if (!modelNameIn(part)) {
      if (worst === 'allowed') worst = 'unidentified'
      continue
    }
    return 'forbidden'
  }
  return worst
}

/** True when a commit's trailer field NAMES a Claude model outside the
 *  allowlist. A trailer naming nothing is not a breach — it is unidentified
 *  (`classifyTrailer`), which has its own, resolvable path. */
export function isPolicyBreach(trailerField) {
  return classifyTrailer(trailerField) === 'forbidden'
}

/** Parse one log line of the form `sha|isoDate|trailer[,trailer…]`.
 *  Returns null for anything malformed (merge commits print an empty trailer
 *  field but still parse — they carry no model evidence and never flag). */
export function parseLogLine(line) {
  const parts = String(line ?? '').split('|')
  if (parts.length < 3) return null
  const sha = parts[0].trim()
  const when = Date.parse(parts[1])
  if (!/^[0-9a-f]{7,40}$/i.test(sha) || Number.isNaN(when)) return null
  return { sha, when, trailers: parts.slice(2).join('|') }
}

/** Commits at/after sinceMs whose trailer field falls into `wanted`. */
function findCommitsClassified(logText, sinceMs, wanted) {
  const hits = []
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    const c = parseLogLine(line)
    if (!c || c.when < sinceMs) continue
    if (classifyTrailer(c.trailers) === wanted) hits.push({ sha: c.sha, trailer: c.trailers.trim() })
  }
  return hits
}

/** Commits at/after sinceMs authored by a model NAMED outside the allowlist. */
export function findForbiddenCommits(logText, sinceMs) {
  return findCommitsClassified(logText, sinceMs, 'forbidden')
}

/** Commits at/after sinceMs whose Claude trailer names no model at all. */
export function findUnidentifiedCommits(logText, sinceMs) {
  return findCommitsClassified(logText, sinceMs, 'unidentified')
}

// ---------------------------------------------------------------------------
// THE BLOCK TEXTS. Pure, so the Vitest layer can pin what the session is told —
// a remedy that has to be rediscovered is the failure this point fixes.

/** Where the true serving model per turn is readable: the harness writes one
 *  JSONL line per request, each carrying `message.model`. */
export const TRANSCRIPT_HINT = [
  'The authoring model is READABLE, not a matter of assumption. The local transcripts record it',
  'per turn in their `message.model` field:',
  '',
  '    ~/.claude/projects/<repo-slug>/<session>.jsonl',
  '    ~/.claude/projects/<repo-slug>/<session>/subagents/agent-*.jsonl   (delegated work)',
]

/** The prefix git's history-rewriting tools park the pre-rewrite commits under. */
export const BACKUP_REF_PREFIX = 'refs/original/'

/** The backup refs out of a `git for-each-ref --format=%(refname)` listing. */
export function backupRefsIn(refListing) {
  return String(refListing ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(BACKUP_REF_PREFIX))
}

/**
 * The trap the remedy itself sets (measured 30.07.2026): rewriting a trailer with
 * `git filter-branch` leaves the OLD commits alive under `refs/original/…`, and
 * this guard reads `git log --all` — so it stays red on a branch that is already
 * fixed, invisibly, because every worktree shares one `.git` and nobody looks
 * there. Naming the refs turns a second "policy breach" into a one-line cleanup.
 */
export function backupRefNotice(backupRefs) {
  const refs = (backupRefs ?? []).filter(Boolean)
  if (!refs.length) return []
  return [
    '',
    `NOTE — this repository still holds ${refs.length} pre-rewrite backup ref(s), and the guard reads`,
    '`git log --all`, so a trailer you have ALREADY rewritten is still reported from them. Delete',
    'them once the rewrite is confirmed good:',
    '',
    ...refs.map((r) => `    git update-ref -d ${r}`),
  ]
}

const shaList = (hits) => (hits ?? []).map((h) => `${h.sha.slice(0, 7)} (${h.trailer})`).join(', ')

/** The HARD stop: a named model outside the allowlist. Unchanged in substance —
 *  pause the batch and wait for the user (point 309, incident 24.07.2026). */
export function formatForbiddenReason(hits, { backupRefs = [] } = {}) {
  return [
    `SERVING-MODEL TRIPWIRE: commit(s) ${shaList(hits)} carry a co-author trailer NAMING a model ` +
      'outside the allowlist (only Opus 5, Opus 4.8 and Fable 5 may run the batch — Sonnet and ' +
      'Haiku are NOT acceptable; user policy 25.07.2026). Do NOT continue batch work: create ' +
      '.claude/batch-paused (reason: forbidden serving model) and stop. Only after the user has ' +
      'confirmed an allowed model may .claude/model-guard-baseline.json be advanced past these ' +
      'commits.',
    ...backupRefNotice(backupRefs),
  ].join('\n')
}

/** The RESOLVABLE block: the trailer names nothing, so nobody knows yet what
 *  authored it. Look it up, then take the path the answer dictates. */
export function formatUnidentifiedReason(hits, { backupRefs = [] } = {}) {
  return [
    `UNIDENTIFIED AUTHOR: commit(s) ${shaList(hits)} carry a Claude co-author trailer that names NO ` +
      'model, so they cannot show that an allowed model wrote them. This is NOT a policy breach ' +
      'yet — do not pause the batch over it. Resolve it FIRST, before any other work:',
    '',
    ...TRANSCRIPT_HINT,
    '',
    '  · an ALLOWED model (Opus 5 / Opus 4.8 / Fable 5) → advance .claude/model-guard-baseline.json',
    '    past these commits and carry on; no user interruption is owed.',
    '  · a model outside the allowlist, or no transcript covers the commit → treat it as the ',
    '    forbidden case: create .claude/batch-paused (reason: forbidden serving model) and stop.',
    '',
    'Then stop it recurring: write your own model into the trailer —',
    '`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.',
    ...backupRefNotice(backupRefs),
  ].join('\n')
}
