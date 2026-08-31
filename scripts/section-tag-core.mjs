// The tag a browser suite appends to a result line so a failing check names the
// argument that re-runs it alone.
//
// WHY IT LIVES AT THE TOP LEVEL and not beside the suites (scripts/verify/):
// guard cores are spawned by guard-hooks.test.mjs from a copy of scripts/ that
// deliberately EXCLUDES scripts/verify/ — "every guard and every core it imports
// lives there" — so anything a guard core may ever need belongs here.
//
// The legal name is shared with the source recogniser. A generator that accepted
// more names than the recogniser could declare would create tags no section run
// could select again.

/** The capture-free grammar used inside the declaration recogniser. */
export const SECTION_NAME_PATTERN = '[a-z0-9][a-z0-9-]*'
const SECTION_NAME_RE = new RegExp(`^${SECTION_NAME_PATTERN}$`)

/** Is this exactly a section name a suite source may declare? */
export const isSectionName = (name) => typeof name === 'string' && SECTION_NAME_RE.test(name)

/** What a result line appends while a section is open. */
export function sectionTag(name) {
  if (!isSectionName(name)) throw new TypeError(`invalid section name ${JSON.stringify(name)}`)
  return ` [--section=${name}]`
}
