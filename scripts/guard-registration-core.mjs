// PURE core of the guard-registration check (20.08.2026).
//
// WHY THIS EXISTS AT COMMIT TIME. The drift between `.claude/settings.json` and
// the preflight registry already had a test — and the test did its job. It just
// ran too late: the first place it speaks is the pre-push gate, by which time
// the broken state is already a commit on `main`. That happened on 20.08.2026:
// `clear-claim-guard` was wired as a Stop hook and never registered, the commit
// landed, the push was refused, `main` stood red and unpushed, and the OTHER
// live session declared itself blocked on it and stopped working. One missing
// line cost two sessions their forward motion.
//
// So the same truth is asked one step earlier. A commit that wires a Stop hook
// without registering it cannot be MADE, which is a state nothing has to be
// rescued from — as opposed to a commit that cannot be PUSHED, which leaves the
// repository in exactly the half-state this check now prevents.
//
// The comparison itself is NOT re-implemented here: `wiredStopHookIds` and
// `unregisteredStopHooks` are the authoritative pair and are imported. What is
// new is only WHERE the two inputs come from — the staged blobs rather than the
// working tree, so the check judges the commit being made and not whatever the
// tree happens to hold beside it.
import { unregisteredStopHooks, wiredStopHookIds } from './guard-preflight-core.mjs'

/** Paths whose staging makes the wiring worth re-checking. */
const SETTINGS_PATH = '.claude/settings.json'
const GUARD_SCRIPT = /^scripts\/[\w.-]*guard[\w.-]*\.mjs$/

/**
 * Does this staged set touch the wiring at all? A commit that changes neither
 * the settings file nor a guard script cannot introduce the drift, and paying
 * for the check there would tax every unrelated commit in the repository.
 */
export function touchesGuardWiring(paths = []) {
  return (Array.isArray(paths) ? paths : []).some(
    (p) => p === SETTINGS_PATH || GUARD_SCRIPT.test(String(p ?? '')),
  )
}

/**
 * The guard ids a `guard-preflight.mjs` SOURCE registers, read as text.
 *
 * Text rather than an import on purpose: the source being judged is a staged
 * blob, which has no path to import from, and importing it would also run its
 * module body — the second half of the same 20.08.2026 incident, where a guard
 * wrapper called `main()` on import and blocked the whole preflight on a pipe
 * nobody was writing.
 *
 * Total: an unrecognisable source yields an empty list. That direction is
 * deliberate — see `evaluate`, which treats "no registry found" as unreadable
 * rather than as "everything is unregistered".
 */
export function registeredIdsFromSource(source = '') {
  const text = String(source ?? '')
  const start = text.indexOf('export const GUARDS = [')
  if (start === -1) return []
  const end = text.indexOf('\n]', start)
  const block = text.slice(start, end === -1 ? undefined : end)
  return [...block.matchAll(/\bid:\s*'([\w.-]+)'/g)].map((m) => m[1])
}

/**
 * The verdict on one staged commit.
 *
 * FAILS CLOSED on a real finding and OPEN on everything it cannot read: an
 * unparseable settings file, or a preflight source with no recognisable
 * registry, reports nothing. A check that blocks a commit because it could not
 * understand its own inputs makes the tree uncommittable, which is worse than
 * the drift it watches — and the pre-push gate still stands behind it.
 */
export function evaluate({ paths = [], settingsJson = '', preflightSource = '' } = {}) {
  if (!touchesGuardWiring(paths)) {
    return { block: false, unregistered: [], why: 'no guard wiring in this commit' }
  }
  let settings
  try {
    settings = JSON.parse(String(settingsJson ?? ''))
  } catch {
    return { block: false, unregistered: [], why: 'settings file unreadable — judged nothing' }
  }
  const registered = registeredIdsFromSource(preflightSource)
  if (registered.length === 0) {
    return { block: false, unregistered: [], why: 'no registry found in the preflight source — judged nothing' }
  }
  const unregistered = unregisteredStopHooks(
    wiredStopHookIds(settings),
    registered.map((id) => ({ id })),
  )
  return {
    block: unregistered.length > 0,
    unregistered,
    why: unregistered.length > 0 ? 'wired Stop hooks with no registry entry' : 'every wired Stop hook is registered',
  }
}

/** The refusal text. It names the fix, because a guard that only says no costs a turn. */
export function formatVerdict(verdict = {}) {
  const ids = verdict?.unregistered ?? []
  const plural = ids.length === 1 ? 'hook is' : 'hooks are'
  return [
    `GUARD REGISTRATION: ${ids.length} wired Stop ${plural} missing from the preflight registry.`,
    ...ids.map((id) => `  · ${id}`),
    '',
    'A Stop hook wired in .claude/settings.json but absent from GUARDS in',
    'scripts/guard-preflight.mjs reports NOTHING in the preflight while it still blocks',
    'the turn — and the unit suite goes red, which the pre-push gate refuses. Committing',
    'it puts that red state on the branch, where the next session inherits it.',
    '',
    'Register it in the GUARDS array in scripts/guard-preflight.mjs (a gather that honestly',
    'reports "not judged" counts) and add it to the expected list in',
    'scripts/guard-preflight-core.test.mjs. Then commit again.',
  ].join('\n')
}
