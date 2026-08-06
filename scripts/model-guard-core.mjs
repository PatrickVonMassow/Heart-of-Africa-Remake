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

// THE ALLOWLIST JUDGES THE PARSED NAME, NEVER THE RAW LINE (point 527, found
// 06.08.2026 by the four-eyes review of points 397/425, recorded as C9 in
// docs/rule-corpus-audit.md). `ALLOWED` used to be searched inside the whole
// trailer, so any line merely CONTAINING "opus" or "fable" passed the guard
// whose entire purpose is to catch a silently degraded session — a
// `Claude Haiku 4.5 (opus mode)` or a `Claude Sonnet 5 / Claude Opus 5` walked
// straight through. The name is therefore parsed out first and matched WHOLE,
// and a trailer claiming more than one model is a finding rather than a pass on
// its first allowed name: a commit has exactly one authoring model.

/** Model names allowed to author batch commits, matched against the name PARSED
 *  out of a trailer (`modelNamesIn`) — anchored, so an allowed name carrying any
 *  addition is no longer allowed by accident. Everything after the family name
 *  must be version digits: the policy names the model FAMILIES (Opus, Fable),
 *  and a pinned version would redden the whole batch the day the harness serves
 *  a point release or writes the raw model id (`claude-opus-5[1m]`, 14 commits
 *  on 29.07.2026, which normalises to `opus 5`). */
export const ALLOWED = /^(opus|fable)[\s.\d]*$/i

/** Any Claude co-author trailer (human co-authors are not model evidence). */
export const CLAUDE_TRAILER = /\bclaude\b/i

/** Words that stand beside "Claude" without naming a MODEL: the product name and
 *  the context-window suffix. A trailer left with nothing after these names no
 *  model, so it is unidentified rather than forbidden. */
const NON_MODEL_WORDS = /\b(code|agent)\b/gi

/**
 * The model names a single co-author trailer CLAIMS, with the address, the
 * parenthesised/bracketed suffixes and the non-model words stripped, and the
 * model-id spelling (`claude-opus-5[1m]`) normalised to the written one
 * (`opus 5`). Each "Claude" token opens one claim, so
 * `Claude Sonnet 5 / Claude Opus 5` reads as the two names it is rather than as
 * one string an allowlist search can be fooled by.
 * Empty means the trailer names no model at all.
 */
export function modelNamesIn(trailer) {
  const cleaned = String(trailer ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bco-authored-by:/gi, ' ')
  if (!CLAUDE_TRAILER.test(cleaned)) return []
  return cleaned
    .split(/\bclaude\b/gi)
    .slice(1)
    .map((seg) =>
      seg
        .replace(NON_MODEL_WORDS, ' ')
        .replace(/[\s,;/&_-]+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

/** What a trailer says the model is, as one string — the single name in the
 *  normal case, every claimed name joined when a line names several. Empty
 *  means the trailer names no model. */
export function modelNameIn(trailer) {
  return modelNamesIn(trailer).join(' + ')
}

/** The three states a commit's co-author field can be in, worst first. */
export const CLASSES = Object.freeze(['forbidden', 'unidentified', 'allowed'])

/**
 * Judge ONE co-author trailer value. Returns `{ verdict, names }` — the names
 * are what the wording of a finding is built from, so a refusal can say which
 * model it read rather than only that it disliked the line.
 *
 * 'forbidden'    a name outside the allowlist stands in the trailer
 * 'unidentified' the trailer names NO model, or names SEVERAL: neither can show
 *                which single model authored the commit. The path is the same —
 *                look the turn up in the transcripts — so they share a verdict.
 * 'allowed'      exactly one name, and it is on the allowlist (or the trailer
 *                is not a Claude one at all, which is no model evidence)
 */
export function judgeTrailer(trailer) {
  const names = modelNamesIn(trailer)
  if (!names.length) {
    return { verdict: CLAUDE_TRAILER.test(String(trailer ?? '')) ? 'unidentified' : 'allowed', names }
  }
  if (names.some((name) => !ALLOWED.test(name))) return { verdict: 'forbidden', names }
  return { verdict: names.length > 1 ? 'unidentified' : 'allowed', names }
}

/** The bracket pairs a separator may hide inside. */
const BRACKETS = Object.freeze({ '<': '>', '(': ')', '[': ']' })

/**
 * Split a `%(trailers:…,separator=,)` field into its individual trailer values.
 * The separator only separates OUTSIDE the address and the suffixes: a comma in
 * a `(1M, extended context)` suffix would otherwise cut one legitimate trailer
 * into two halves, and the half reading `Claude Opus 5 (1M` names no allowed
 * model — a false breach that would pause the batch (four-eyes review, point 527).
 */
export function splitTrailerField(field) {
  const parts = []
  let current = ''
  let closer = ''
  for (const ch of String(field ?? '')) {
    if (closer) {
      current += ch
      if (ch === closer) closer = ''
    } else if (BRACKETS[ch]) {
      closer = BRACKETS[ch]
      current += ch
    } else if (ch === ',' || ch === ';') {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/**
 * Classify a commit's `Co-Authored-By` field (see `judgeTrailer` for the three
 * states). A commit may carry several co-authors; each is judged alone and the
 * WORST verdict wins, so one forbidden co-author flags the commit even next to
 * an allowed one, and one bare trailer beside a named one is still unidentified.
 */
export function classifyTrailer(trailerField) {
  let worst = 'allowed'
  for (const part of splitTrailerField(trailerField)) {
    const { verdict } = judgeTrailer(part)
    if (verdict === 'forbidden') return 'forbidden'
    if (verdict === 'unidentified' && worst === 'allowed') worst = 'unidentified'
  }
  return worst
}

/** True when a commit's trailer field NAMES a Claude model outside the
 *  allowlist. A trailer naming nothing is not a breach — it is unidentified
 *  (`classifyTrailer`), which has its own, resolvable path. */
export function isPolicyBreach(trailerField) {
  return classifyTrailer(trailerField) === 'forbidden'
}

// ---------------------------------------------------------------------------
// CATCH IT AT THE SOURCE (points 397 b / 425 a). The classification above is the
// net under the commits already in history; this is the grip that keeps an
// unnamed trailer out of it. A delegated agent stamping the bare trailer is not
// a rare accident — it happened on five commits of one branch on 29.07.2026 —
// and the guard above can only ever report it after the fact, at a cost of a
// research pass no unattended session would have done.
//
// Driven from the versioned `commit-msg` hook via scripts/model-trailer-gate.mjs,
// so it binds every session, in the main tree and in a worktree. It deliberately
// does NOT stand down for a paused batch or a session that owns no lock: a
// subagent is exactly whose commits this is for, and a commit is not batch work.

/** The trailers a commit may carry, printed as the remedy. */
export const ALLOWED_TRAILERS = Object.freeze([
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  'Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>',
  'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>',
])

/** The `Co-Authored-By` values in a commit message, git's comment lines dropped
 *  so a hint in the commit template is never read as the author's own trailer. */
export function coAuthorTrailers(message) {
  const out = []
  for (const line of String(message ?? '').split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const m = /^[ \t]*co-authored-by:[ \t]*(.+?)[ \t]*$/i.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

/**
 * May this commit MESSAGE be committed? Every Claude co-author trailer must name
 * a model from the allowlist. A human co-author is not model evidence and is
 * ignored, and a message with no Claude trailer at all is not this gate's
 * business (a merge, or a commit made outside the agent tooling).
 *
 * Returns { block, findings: [{ rule, trailer, detail }] } and NEVER throws.
 */
export function evaluateCommitTrailers(message) {
  const findings = []
  try {
    for (const trailer of coAuthorTrailers(message)) {
      const { verdict, names } = judgeTrailer(trailer)
      if (verdict === 'unidentified' && names.length > 1) {
        findings.push({
          rule: 'multiple-model-trailer',
          trailer,
          detail: `names ${names.length} models (${names.join(', ')}) — a commit has ONE authoring model, so this shows none of them`,
        })
      } else if (verdict === 'unidentified') {
        findings.push({
          rule: 'unnamed-model-trailer',
          trailer,
          detail: 'names no model — it cannot show that an allowed model wrote this commit',
        })
      } else if (verdict === 'forbidden') {
        findings.push({
          rule: 'forbidden-model-trailer',
          trailer,
          detail: 'names a model outside the allowlist (only Opus 5, Opus 4.8 and Fable 5)',
        })
      }
    }
  } catch {
    /* fail-open: a broken gate must never make the tree uncommittable */
  }
  return { block: findings.length > 0, findings }
}

/** The refusal, naming every offender and the exact trailer to write instead. */
export function formatCommitTrailerVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = ['model-trailer-gate: refusing this commit message.', '']
  for (const f of verdict.findings) lines.push(`  ${f.rule}: "${f.trailer}"`, `      ${f.detail}`)
  lines.push(
    '',
    'Every commit records its AUTHORING MODEL in its co-author trailer — it is the only',
    'machine-readable evidence the serving-model tripwire has, and an unnamed one reads',
    'from the outside exactly like the silent degradation the tripwire exists to catch.',
    '',
    'Write your own model:',
    '',
    ...ALLOWED_TRAILERS.map((t) => `    ${t}`),
    '',
    'The `(1M context)` suffix is fine. If you do not know which model you are:',
    '',
    ...TRANSCRIPT_HINT,
  )
  return lines.join('\n')
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
 *  pause the batch and wait for the user (point 309, incident 24.07.2026).
 *  `alsoUnidentified` are the unnamed commits found in the same window: they are
 *  NAMED here rather than dropped, because advancing the baseline past the
 *  forbidden ones would otherwise clear them unseen (four-eyes review). */
export function formatForbiddenReason(hits, { backupRefs = [], alsoUnidentified = [] } = {}) {
  const unnamed = (alsoUnidentified ?? []).filter(Boolean)
  return [
    `SERVING-MODEL TRIPWIRE: commit(s) ${shaList(hits)} carry a co-author trailer NAMING a model ` +
      'outside the allowlist (only Opus 5, Opus 4.8 and Fable 5 may run the batch — Sonnet and ' +
      'Haiku are NOT acceptable; user policy 25.07.2026). Do NOT continue batch work: create ' +
      '.claude/batch-paused (reason: forbidden serving model) and stop. Only after the user has ' +
      'confirmed an allowed model may .claude/model-guard-baseline.json be advanced past these ' +
      'commits.',
    ...(unnamed.length
      ? [
          '',
          `The same window also holds ${unnamed.length} commit(s) whose trailer names NO SINGLE model — ` +
            `${shaList(unnamed)}. Resolve those from the transcripts too; advancing the baseline ` +
            'past the breach would otherwise clear them unseen.',
        ]
      : []),
    ...backupRefNotice(backupRefs),
  ].join('\n')
}

/** The RESOLVABLE block: the trailer names nothing, so nobody knows yet what
 *  authored it. Look it up, then take the path the answer dictates. */
export function formatUnidentifiedReason(hits, { backupRefs = [] } = {}) {
  return [
    `UNIDENTIFIED AUTHOR: commit(s) ${shaList(hits)} carry a Claude co-author trailer that names NO ` +
      'SINGLE model — no model at all, or several at once — so they cannot show WHICH model wrote ' +
      'them. This is NOT a policy breach yet — do not pause the batch over it. Resolve it FIRST, ' +
      'before any other work:',
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
