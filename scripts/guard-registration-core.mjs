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
import ts from 'typescript'

/** Paths whose staging makes the wiring worth re-checking. */
const SETTINGS_PATH = '.claude/settings.json'
const PREFLIGHT_PATH = 'scripts/guard-preflight.mjs'
const GUARD_SCRIPT = /^scripts\/[\w.-]*guard[\w.-]*\.mjs$/

/**
 * Include deletions and show both sides of renames. Otherwise removing or
 * renaming guard-preflight.mjs makes its staged blob disappear without putting
 * that path in the set `evaluate` uses to decide whether the commit broke it.
 */
export const STAGED_PATH_ARGS = ['diff', '--cached', '--name-only', '--no-renames', '-z']

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
 * Parsing rather than matching is important here: comments and unrelated
 * strings are valid source text, but neither one registers a guard. The
 * compiler parser also gives single- and double-quoted string literals the
 * same meaning and tells an empty array apart from a missing/broken one.
 */
function readRegistry(source = '') {
  const text = String(source ?? '')
  const file = ts.createSourceFile(PREFLIGHT_PATH, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  if (file.parseDiagnostics?.length) return { found: false, ids: [] }

  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if (!statement.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword)) continue
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'GUARDS') continue
      if (!declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) {
        return { found: false, ids: [] }
      }

      const ids = []
      for (const element of declaration.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue
        const property = element.properties.find(
          (candidate) =>
            ts.isPropertyAssignment(candidate) &&
            ((ts.isIdentifier(candidate.name) && candidate.name.text === 'id') ||
              (ts.isStringLiteral(candidate.name) && candidate.name.text === 'id')),
        )
        if (!property || !ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
          continue
        }
        if (/^[\w.-]+$/.test(property.initializer.text)) ids.push(property.initializer.text)
      }
      return { found: true, ids }
    }
  }
  return { found: false, ids: [] }
}

export function registeredIdsFromSource(source = '') {
  return readRegistry(source).ids
}

/**
 * The verdict on one staged commit.
 *
 * FAILS CLOSED on a real finding, including a commit that makes the registry
 * itself unreadable. It remains open when an unchanged input cannot be read:
 * that is an infrastructure failure, not a defect introduced by this commit.
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
  const registry = readRegistry(preflightSource)
  if (!registry.found && paths.includes(PREFLIGHT_PATH)) {
    return {
      block: true,
      unregistered: [],
      registryUnreadable: true,
      why: 'this commit makes the GUARDS registry unreadable',
    }
  }
  if (!registry.found) {
    return { block: false, unregistered: [], why: 'no registry found in the preflight source — judged nothing' }
  }
  const unregistered = unregisteredStopHooks(
    wiredStopHookIds(settings),
    registry.ids.map((id) => ({ id })),
  )
  return {
    block: unregistered.length > 0,
    unregistered,
    why: unregistered.length > 0 ? 'wired Stop hooks with no registry entry' : 'every wired Stop hook is registered',
  }
}

/** The refusal text. It names the fix, because a guard that only says no costs a turn. */
export function formatVerdict(verdict = {}) {
  if (verdict?.registryUnreadable) {
    return [
      'GUARD REGISTRATION: this commit makes the GUARDS registry unreadable.',
      '',
      'The staged scripts/guard-preflight.mjs was deleted, renamed, or no longer',
      'contains a parseable `export const GUARDS = [...]` registry. Without that',
      'registry, wired Stop hooks cannot participate in the preflight.',
      '',
      'Restore the GUARDS registry in scripts/guard-preflight.mjs, then commit again.',
    ].join('\n')
  }
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
