// THE REVISION MARKER THE BUILT SITE CARRIES — pure, never throws, Vitest-covered
// in scripts/deploy-staleness-core.test.mjs (which round-trips it through the
// reader, so emitter and reader cannot drift apart).
//
// WHY IT EXISTS (measured 06.08.2026, point 528): the deployed page carried no
// way of saying which commit it was built from. `VITE_BUILD_COMMIT` is baked
// into a content-hashed JS chunk, so nothing outside a running browser can read
// it — and the fault that mattered on 06.08. was precisely that the site served
// a two-hour-old `main` while every alarm the project has watched RED RUNS. A
// stale site cannot be noticed without something to compare, so the build emits
// one small file at the site root: `<base>/build-info.json`.
//
// It is deliberately a SEPARATE, unhashed file: the staleness watchdog fetches
// it with one plain GET and no browser, and the game never reads it at runtime.

/** The marker's file name, emitted at the root of every built site (the root
 *  build and each frozen tag build get their own). */
export const BUILD_INFO_FILE = 'build-info.json'

const SHA_RE = /^[0-9a-f]{7,40}$/i

/** A sha in canonical form, or 'unknown' — never a half-trusted string. */
export function normalizeSha(sha) {
  const s = String(sha ?? '').trim().toLowerCase()
  return SHA_RE.test(s) ? s : 'unknown'
}

/**
 * Which commit a build is FROM.
 *
 * GIT FIRST, and that order is the point: the workflow builds each frozen tag
 * in a `git worktree` checked out at the TAG, while `GITHUB_SHA` still names the
 * pushed `main` commit. Preferring the environment there would stamp every tag
 * site with main's revision and make the marker lie about exactly the builds it
 * exists to identify. `GITHUB_SHA` remains the fallback for a checkout without
 * git history.
 *
 * @param {{gitSha?:string, env?:object}} input `gitSha` is what the caller read
 *   from git (or '' when that failed) — this module does no I/O.
 */
export function resolveBuildCommit({ gitSha = '', env = {} } = {}) {
  const fromGit = normalizeSha(gitSha)
  if (fromGit !== 'unknown') return fromGit
  return normalizeSha(env?.GITHUB_SHA)
}

/**
 * The marker payload. `commit` is the full sha the comparison uses; `short` is
 * what a human reads; `ref` names the branch or tag this build came from, so a
 * frozen tag build under /vX.Y/ is distinguishable from the root site.
 */
export function buildInfoPayload({ commit = '', ref = '', builtAt = '' } = {}) {
  const sha = normalizeSha(commit)
  return {
    commit: sha,
    short: sha === 'unknown' ? 'unknown' : sha.slice(0, 7),
    ref: String(ref ?? ''),
    builtAt: String(builtAt ?? ''),
  }
}

/** The exact bytes written to `build-info.json` (pretty, newline-terminated —
 *  it is read by humans in a browser as often as by the watchdog). */
export function buildInfoJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`
}
