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

/** Claude-model trailers allowed to author batch commits. */
export const ALLOWED = /\b(opus|fable)\b/i

/** Any Claude co-author trailer (human co-authors are not model evidence). */
export const CLAUDE_TRAILER = /\bclaude\b/i

/** True when a commit's trailer field names a Claude model outside the
 *  allowlist. A commit may carry several co-authors; each is judged alone, so
 *  one forbidden co-author flags the commit even next to an allowed one. */
export function isPolicyBreach(trailerField) {
  return String(trailerField ?? '')
    .split(',')
    .some((t) => CLAUDE_TRAILER.test(t) && !ALLOWED.test(t))
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

/** Commits at/after sinceMs authored by a model outside the allowlist. */
export function findForbiddenCommits(logText, sinceMs) {
  const hits = []
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    const c = parseLogLine(line)
    if (!c || c.when < sinceMs) continue
    if (isPolicyBreach(c.trailers)) hits.push({ sha: c.sha, trailer: c.trailers.trim() })
  }
  return hits
}
