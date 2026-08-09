// Running ONE SECTION of a browser suite (point 566).
//
// WHY. Repairing a single check cost a whole suite pass. Measured 08.08.2026 on
// point 342: the feature took 22 minutes, the remaining four and a half hours
// were verification — and two of the three repair commits repaired the CHECK,
// not the game (one had to STAGE an animal instead of hoping one streamed into
// view, one read the label list a frame before the drawn labels). Each such
// repair replayed `enrichments` whole: one browser session, 251 checks, over 17
// minutes on the WebGL 2 lane, then the same round again on the second backend.
//
// A name filter on `check()` would buy nothing: the suites are linear scripts —
// boot, jump, wait for herds, assert, jump on — and the expensive part is the
// navigation, the waits and the screenshots, not the assertion. Skipping an
// assertion still replays every jump before it. So the unit that can be skipped
// is a SECTION: a named block that owns the setup it needs (its jumps and waits)
// plus its checks. The boundaries already existed as `// --- … ---` comments;
// `section('<slug>')` turns each into a declaration.
//
// WHAT IT IS NOT. A `--section` run is PARTIAL and can never be recorded as
// suite coverage: the recorder stamps `partial` on the run record and
// render-verify-core's runVerdict refuses it. Acceptance and closing runs stay
// whole-suite. This is a repair loop, not a cheaper gate.
//
// Everything here is string-in / decision-out so the Vitest layer can pin it
// (scripts/verify/sections.test.mjs); the only I/O is `sectionGate()` reading
// the running suite's own source at the bottom.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** The env var a runner sets to select one section; the suites read it. */
export const SECTION_ENV = 'VERIFY_SECTION'

/** A section declaration in a suite's source: `section('slug')` at a call
 *  position (never `foo.section(`), with a lowercase slug so the CLI argument is
 *  typeable and stable. */
const DECL_RE = /(?<![\w.$])section\(\s*(['"])([a-z0-9][a-z0-9-]*)\1/g

/**
 * The sections a suite DECLARES, in run order, de-duplicated. Read from the
 * source rather than from a hand-kept list, so a list can never drift from the
 * code it names — and read WITHOUT executing, so an unknown name can be refused
 * in a tenth of a second instead of after a browser boot.
 */
export function listSections(source) {
  const out = []
  const seen = new Set()
  for (const m of String(source ?? '').matchAll(DECL_RE)) {
    if (seen.has(m[2])) continue
    seen.add(m[2])
    out.push(m[2])
  }
  return out
}

/** The requested name reduced to its comparable form; '' and null both mean
 *  "no request", i.e. run the whole suite. */
function normalise(requested) {
  const name = String(requested ?? '').trim()
  return name === '' ? null : name
}

/**
 * What a `--section` request means for one suite.
 *
 * - no request         → { ok: true, partial: false } — everything runs, exactly
 *                        as before the mechanism existed.
 * - a declared name    → { ok: true, partial: true, requested }
 * - anything else      → { ok: false } with a message NAMING THE SECTIONS THAT
 *                        EXIST. A typo must fail loud, not run nothing and exit
 *                        0 — a silent empty pass is the one outcome that would
 *                        make this mechanism dangerous.
 * - a suite that declares none → also { ok: false }: it is not sectioned yet, so
 *                        there is nothing to select (it still runs whole without
 *                        the argument).
 *
 * Total: never throws.
 */
export function resolveSelection({ sections = [], requested = null, suite = 'the suite' } = {}) {
  const name = normalise(requested)
  const known = Array.isArray(sections) ? sections : []
  if (name === null) return { ok: true, partial: false, requested: null, message: null }
  if (known.includes(name)) return { ok: true, partial: true, requested: name, message: null }
  const message = known.length
    ? `unknown section "${name}" in ${suite} — the sections are:\n  ${known.join('\n  ')}`
    : `${suite} declares no sections — run it whole (without --section), or section it first (scripts/verify/sections.mjs)`
  return { ok: false, partial: true, requested: name, message }
}

/**
 * Is this COMMAND LINE a legitimate one-section run? The name is checked later,
 * against the suite's source; what is decided here is the shape of the request:
 *
 *   - the value must be ATTACHED (`--section=x`). A space would leave `x` looking
 *     like a suite filter, which is why every other flag here is value-less.
 *   - exactly ONE known suite is named beside it — the section names are a
 *     suite's own, so two suites cannot share a request.
 *   - no TIER. A tier is a coverage claim (preflight, the whole suite set, both
 *     backends) and one section is the opposite of one, so the combination is
 *     refused rather than quietly narrowed.
 *
 * Returns { ok, suite, message }. Total: never throws.
 */
export function planSectionRun({ tier = null, filter = [], section = null, knownSuites = [] } = {}) {
  if (section === null) return { ok: true, suite: null, message: null }
  const named = Array.isArray(filter) ? filter : []
  if (section === '') {
    // Covers both shapes that arrive empty: `--section` bare (whose value would
    // have read as a suite filter, which is why every flag here is written
    // attached) and `--section=` with nothing after it.
    return { ok: false, suite: null, message: '--section needs a section NAME attached to it: `--section=<name>`' }
  }
  if (tier !== null) {
    return { ok: false, suite: null, message: `--section=${section} is a one-block repair run — it cannot be combined with the ${tier} tier` }
  }
  if (named.length !== 1 || !knownSuites.includes(named[0])) {
    return {
      ok: false,
      suite: null,
      message: `--section=${section} needs exactly ONE suite named beside it, e.g. \`npm test -- enrichments --section=${section}\``,
    }
  }
  return { ok: true, suite: named[0], message: null }
}

/**
 * The gate a suite drives. `section(name)` is BOTH the declaration the parser
 * above reads and the runtime switch: it returns whether this block's setup and
 * checks should run, and records the block as the one a following `check()`
 * belongs to.
 *
 * `sections` is the declared list (for the loud refusal); passing none disables
 * only the refusal, never the selection.
 */
export function makeSectionGate({ sections = [], requested = null, suite = 'the suite' } = {}) {
  const verdict = resolveSelection({ sections, requested, suite })
  if (!verdict.ok) throw new Error(verdict.message)
  let current = null
  const ran = []
  const gate = {
    /** True while ONE section was selected — the run proves nothing about the rest. */
    partial: verdict.partial,
    requested: verdict.requested,
    section(name) {
      current = name
      const selected = verdict.requested === null || verdict.requested === name
      if (selected) ran.push(name)
      return selected
    },
    /** The section a check being printed right now sits in. */
    currentSection: () => current,
    ran: () => [...ran],
    /** What a result line appends so a failing check names the argument that
     *  re-runs it alone. Empty until the first section is entered (the boot
     *  prologue belongs to no section). */
    tag: () => (current === null ? '' : ` [--section=${current}]`),
    /** The banner a partial run prints, so no reader can mistake it for a pass
     *  of the suite. Null for a whole run, which prints nothing new. */
    banner: () =>
      verdict.partial
        ? `PARTIAL RUN — only section "${verdict.requested}" of ${suite} ran; this is NOT suite coverage`
        : null,
    /**
     * THE DEBT A PARTIAL RUN OWES AT ITS END: the requested section must have
     * actually EXECUTED. `listSections` reads the declarations out of source
     * TEXT, so a name that only survives inside a comment — or behind a block an
     * earlier `return`/throw never reached — passes the up-front check, and the
     * run would then boot, assert nothing and exit 0. A green that proves
     * nothing is the one outcome that would make this mechanism dangerous, so it
     * is a FAILURE, checked where the suite counts its failures. Null when the
     * run owes nothing.
     */
    unrun: () =>
      verdict.partial && !ran.includes(verdict.requested)
        ? `section "${verdict.requested}" was selected but never ran — ${suite} declares the name (possibly only in a comment or behind an unreached branch) and no block executed it; nothing was verified`
        : null,
  }
  return gate
}

/** Did the process that is running ever build a gate? The run recorder asks, so
 *  a suite that consults NO gate while `VERIFY_SECTION` is exported — a stale
 *  variable in a shell, a suite not sectioned yet — is reported instead of being
 *  silently booked as a one-section run of something. */
let gateBuilt = false
export const sectionGateWasBuilt = () => gateBuilt

/**
 * The gate for the suite that is running: its own source decides the valid
 * names, `VERIFY_SECTION` carries the request. A source that cannot be read
 * (an unusual argv) only costs the loud refusal, never the run.
 */
export function sectionGate({ suitePath = process.argv[1], env = process.env } = {}) {
  let source = ''
  try {
    source = readFileSync(suitePath, 'utf8')
  } catch {
    /* no source to parse — selection still works, the candidate list does not */
  }
  const gate = makeSectionGate({
    sections: listSections(source),
    requested: env[SECTION_ENV],
    suite: basename(String(suitePath ?? 'suite'), '.mjs'),
  })
  gateBuilt = true
  return gate
}
