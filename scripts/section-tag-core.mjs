// The tag a browser suite appends to a result line so a failing check names the
// argument that re-runs it alone — and the pattern that reads it back OFF a
// recorded detail.
//
// WHY IT LIVES AT THE TOP LEVEL and not beside the suites (scripts/verify/):
// two readers must agree about it, and one of them is a GUARD. The recorder
// stores the printed line INCLUDING this tag, while the red-charge table
// (render-verify-charges.mjs) matches the MEASURED line with regexes anchored
// at both ends. Written apart, every end-anchored `detailMatch` in a
// section-using suite silently stopped matching its own recorded red: measured
// 30.08.2026, the point-927 composite charge read `…-42.txt` while the record
// held `…-42.txt  [--section=bug-report-archive]`, so the red it exists to
// account for stayed unaccounted and blocked the gate.
//
// render-verify-core.mjs is a guard core, and guard-hooks.test.mjs spawns every
// guard from a copy of scripts/ that deliberately EXCLUDES scripts/verify/ —
// "every guard and every core it imports lives there". A core that reached into
// the suite directory would be unspawnable in that harness, so the shared
// constant comes here and scripts/verify/sections.mjs imports it upwards.

/** What a result line appends while a section is open. */
export const sectionTag = (name) => ` [--section=${name}]`

/**
 * How a suite's result line joins a measurement to its tag. The suites write
 * `[detail, sections.tag().trim()].filter(Boolean).join('  ')`, so a tagged
 * detail is either the tag ALONE (the check printed no measurement) or the
 * measurement, these two spaces, and the trimmed tag — nothing else.
 */
export const SECTION_TAG_JOIN = '  '

/**
 * The measurement a suite printed, with the tag it appended taken back off —
 * and NOTHING else touched.
 *
 * A cross-vendor review of 30.08.2026 (GPT-5.6 Sol, do-not-merge) refused the
 * first attempt at this, rightly: it was a regex loose enough to eat text a
 * check had really measured. `\s*\[--section=[^\]]*\]\s*$` matches with NO
 * leading space and eats trailing whitespace, so a detail whose own last word
 * ends `timeout[--section=x]` normalised to `timeout` and a `^timeout$` charge
 * would have excused a red nobody measured — the exact widening the anchors
 * exist to prevent, reached through the stripper instead of through the entry.
 *
 * So the shape is RECONSTRUCTED from the generator rather than described: the
 * candidate name is read out of the trailing bracket, `sectionTag` is asked what
 * it would have written for that name, and the tag comes off only where the
 * detail really ends in it — alone, or behind the suites' own join. A detail
 * that merely looks tagged is returned whole.
 */
export function withoutSectionTag(detail) {
  const line = typeof detail === 'string' ? detail : ''
  const match = /\[--section=([^\]\s]+)\]$/.exec(line)
  if (!match) return line
  const emitted = sectionTag(match[1]).trim()
  const head = line.slice(0, line.length - emitted.length)
  if (head === '') return ''
  if (head.endsWith(SECTION_TAG_JOIN)) return head.slice(0, -SECTION_TAG_JOIN.length)
  return line
}
