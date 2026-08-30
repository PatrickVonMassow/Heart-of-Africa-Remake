// The tag a browser suite appends to a result line so a failing check names the
// argument that re-runs it alone.
//
// WHY IT LIVES AT THE TOP LEVEL and not beside the suites (scripts/verify/):
// guard cores are spawned by guard-hooks.test.mjs from a copy of scripts/ that
// deliberately EXCLUDES scripts/verify/ — "every guard and every core it imports
// lives there" — so anything a guard core may ever need belongs here.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT OFFER, and the reason is worth keeping:
// a way to take the tag back OFF a recorded detail. The recorder stores the
// printed line INCLUDING the tag, while the red-charge table matches the
// MEASURED line with regexes anchored at both ends, so no anchored charge in a
// section-using suite reaches the end of its own recorded red. That is a real,
// measured defect — four owned reds sit unaccounted because of it. Two readers
// were written for it on 30.08.2026 and both were refused by the cross-vendor
// round, for one reason: recovering the tag from the text proves SYNTAX, not
// PROVENANCE. A check that really measured a value ending in the join and a
// bracket is indistinguishable from a tagged one, and stripping it could satisfy
// a signature belonging to a different red. Asked which is worse, the reviewer
// answered that a silent false clearance is worse than a loud block. So the gate
// stays shut and POINT 1018 closes it where the provenance actually exists: the
// recorder, which knows the open section and can store it beside the
// measurement. Do not add a reader here.

/** What a result line appends while a section is open. */
export const sectionTag = (name) => ` [--section=${name}]`
