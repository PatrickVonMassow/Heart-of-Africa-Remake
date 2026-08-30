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

/** The trailing tag as a pattern, for the reader that must strip it off again. */
export const SECTION_TAG_RE = /\s*\[--section=[^\]]*\]\s*$/
