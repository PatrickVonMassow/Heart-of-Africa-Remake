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
import { maskCode } from '../window-hide-core.mjs'

import { isSectionName, SECTION_NAME_PATTERN, sectionTag } from '../section-tag-core.mjs'

/** The env var a runner sets to select one section; the suites read it. */
export const SECTION_ENV = 'VERIFY_SECTION'

/** A section declaration in a suite's source: `section('slug')` at a call
 *  position (never `foo.section(`), with a lowercase slug so the CLI argument is
 *  typeable and stable. */
const DECL_RE = new RegExp(`(?<![\\w.$])section\\(\\s*(['"])(${SECTION_NAME_PATTERN})\\1`, 'g')
/** The same call, up to the opening quote — matched against the MASKED source,
 *  where a string's body is blanked but its quotes and every index survive. */
const DECL_HEAD = /(?<![\w.$])section\(\s*['"]/g

/**
 * The sections a suite DECLARES, in run order, de-duplicated. Read from the
 * source rather than from a hand-kept list, so a list can never drift from the
 * code it names — and read WITHOUT executing, so an unknown name can be refused
 * in a tenth of a second instead of after a browser boot.
 *
 * A declaration is CODE. `maskCode` blanks comments (and string/regex bodies)
 * while preserving every index, so the name is taken from the ORIGINAL source at
 * a position the masked one proved is code. Without that, a suite explaining its
 * own shape in a comment DECLARES a phantom: `section('x')` written in prose
 * became a 40th section of `enrichments` that a sweep dutifully ran, that a
 * typo's candidate list named, and that nothing in the file could execute.
 */
export function listSections(source) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  const out = []
  const seen = new Set()
  for (const head of masked.matchAll(DECL_HEAD)) {
    DECL_RE.lastIndex = head.index
    const decl = DECL_RE.exec(src)
    if (!decl || decl.index !== head.index) continue // not a valid slug at that spot
    if (seen.has(decl[2])) continue
    seen.add(decl[2])
    out.push(decl[2])
  }
  return out
}

/**
 * A NON-PREDICTIVE declaration in a suite's source:
 * `nonPredictive('<check name>', '<why>')`, written inside the section block
 * whose check it speaks about.
 *
 * WHY IT EXISTS (point 1086, measured 10.09.2026). `adult-errands` was climbed
 * twelve times on 09.09. and was green every time — 18 pass, 0 fail. The LARGE
 * run that night then failed on exactly that section's material: alone the
 * section always saw enough errands, inside the full suite it saw ONE, with the
 * fetch phase at 33 of about 2000 phase ticks. A rung that does not measure what
 * the suite measures is worse than no rung, because the ladder would credit it.
 * So a check whose subject is CAST RARELY either sizes its observation window so
 * both runs measure the same thing, or it says here that it cannot — and then
 * the ladder never counts it as climbed (scripts/verify/ladder-core.mjs) and the
 * result line says so when it passes narrowly. In the whole suite its reading
 * is advisory: neither a pass nor a failure is evidence there.
 */
const NP_HEAD = /(?<![\w.$])nonPredictive\(\s*['"]/g
/** The same call with both strings captured, read from the ORIGINAL source at a
 *  position the masked one proved is code. Each body excludes only ITS OWN
 *  delimiter: excluding both quote characters silently lost every declaration
 *  whose prose carried the other one — `nonPredictive('jar', "the suite's
 *  sampling differs")` declared itself at runtime and was invisible here, so its
 *  narrow green went on being credited as honest. Escapes are tolerated because
 *  check names are prose. */
const NP_RE = /(?<![\w.$])nonPredictive\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g

/**
 * Every non-predictive declaration a suite makes, each attached to the SECTION
 * it stands in — the nearest preceding `section('…')` declaration, which is how
 * these files are shaped (`if (section('x')) { … }`). A declaration before the
 * first section belongs to the boot prologue and carries `section: null`.
 *
 * Read from the source, not from a list: a hand-kept list drifts from the code
 * it names within a month. Masked like the section declarations, so a suite
 * explaining itself in a comment cannot declare a phantom. Total: never throws.
 */
export function listNonPredictive(source) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  const marks = []
  for (const head of masked.matchAll(DECL_HEAD)) {
    DECL_RE.lastIndex = head.index
    const decl = DECL_RE.exec(src)
    if (decl && decl.index === head.index) marks.push({ at: head.index, name: decl[2] })
  }
  const out = []
  for (const head of masked.matchAll(NP_HEAD)) {
    NP_RE.lastIndex = head.index
    const decl = NP_RE.exec(src)
    if (!decl || decl.index !== head.index) continue
    let section = null
    for (const mark of marks) {
      if (mark.at < head.index) section = mark.name
      else break
    }
    out.push({ section, check: decl[2], why: decl[4] })
  }
  return out
}

/**
 * HOW MANY SUBJECTS A CHECK ACTUALLY SAW (point 1136, user order 15.09.2026).
 *
 * WHY. `nonPredictive` below declares, once and for all, that a check's narrow
 * reading cannot predict the suite's. That is the FALLBACK. The cheaper and
 * provable answer is to CREATE the rare situation and then say how often it was
 * really reached — because a check that saw nothing gives no all-clear, and a
 * green over zero observations is a NON-MEASUREMENT dressed as evidence.
 * Measured 10.09.2026: `polish --section=adult-errands` was green twelve times
 * while the full pass went red on the same material, because alone it saw many
 * water errands and inside the pass it saw ONE.
 *
 * So a subject-dependent check hands its own sample count in, beside a NAMED
 * minimum, and three outcomes become possible instead of two:
 *   · seen >= minimum, assertion holds  → PASS
 *   · seen >= minimum, assertion broken → FAIL
 *   · seen <  minimum                   → NOT-COVERING: neither red nor green.
 *     The question is OPEN. The observed reading is printed beside the count so
 *     a reader can see what was seen, but it decides nothing.
 *
 * This is an EVALUATION, not a guard: it prints its verdict where the check
 * prints its own, and nothing downstream is made to enforce it.
 *
 * Returns null when a check declares no coverage (every check that is not
 * subject-dependent), otherwise { seen, minimum, what, covering }. Throws on a
 * malformed declaration — a coverage claim that cannot be read is worse than
 * none, because it would silently stop evaluating.
 */
export function coverageVerdict(coverage) {
  if (coverage === null || coverage === undefined) return null
  // THE TYPE IS CHECKED BEFORE ANY CONVERSION (GPT-6 Astra, cross-vendor round).
  // `Number()` coerces before it validates: `true` becomes 1 and `null` becomes
  // 0, so a malformed declaration would have MANUFACTURED a count — one subject
  // against a minimum of one, reported as covering — which is precisely the
  // silent non-measurement this whole mechanism exists to refuse.
  const seen = coverage.subjects
  const minimum = coverage.minimum
  if (typeof seen !== 'number' || !Number.isInteger(seen) || seen < 0) {
    throw new TypeError(`coverage needs a whole subject count, got ${JSON.stringify(coverage.subjects)}`)
  }
  if (typeof minimum !== 'number' || !Number.isInteger(minimum) || minimum < 1) {
    throw new TypeError(`coverage needs a named minimum of at least 1, got ${JSON.stringify(coverage.minimum)}`)
  }
  const what = typeof coverage.what === 'string' ? coverage.what.trim() : ''
  if (what === '') throw new TypeError('coverage needs to NAME what it counted, e.g. { what: "water errands" }')
  return { seen, minimum, what, covering: seen >= minimum }
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
  currentResultSection = null
  let current = null
  const ran = []
  // The checks this run has been told cannot predict the suite's own reading,
  // by check name (point 1086). Declared inside the block they belong to.
  const nonPredictiveChecks = new Map()
  // The checks that ran but saw too few subjects to answer (point 1136).
  const notCovering = []
  const gate = {
    /** True while ONE section was selected — the run proves nothing about the rest. */
    partial: verdict.partial,
    requested: verdict.requested,
    section(name) {
      if (!isSectionName(name)) throw new TypeError(`invalid section name ${JSON.stringify(name)}`)
      current = name
      currentResultSection = name
      const selected = verdict.requested === null || verdict.requested === name
      if (selected) ran.push(name)
      return selected
    },
    /**
     * THIS CHECK CANNOT PREDICT WHAT THE SUITE WILL READ (point 1086) — its
     * subject is cast rarely enough that the section alone and the full pass
     * measure different things. Declared beside the check, in the block that
     * owns it; `checkResult` then marks the result line and the ladder
     * refuses to count the narrow green as climbed.
     */
    nonPredictive(check, why) {
      const name = String(check ?? '')
      if (name === '') throw new TypeError('nonPredictive needs the CHECK NAME it speaks about')
      const reason = String(why ?? '').trim()
      if (reason === '') throw new TypeError(`nonPredictive(${JSON.stringify(name)}) needs a reason`)
      nonPredictiveChecks.set(name, reason)
      return name
    },
    /** One decision for both the printed status and the suite's failure count.
     * A declared check retains full force when its section runs alone. In the
     * whole suite the observation is advisory, even when it happens to pass.
     * Neither downstream FAIL scrapers nor PASS counters may credit it there.
     *
     * `coverage` is a subject-dependent check's own sample count beside its
     * named minimum (point 1136). It is MEASURED, so it outranks the static
     * NON-PREDICTIVE declaration: a check that saw too few subjects said
     * nothing this run, whatever anyone declared about it beforehand. Below the
     * minimum the verdict is NOT-COVERING — counted as neither a pass nor a
     * failure, in a narrow run exactly as in the whole suite, because a
     * non-measurement is a non-measurement in both.
     */
    checkResult(check, ok, coverage = null) {
      const name = String(check ?? '')
      const cover = coverageVerdict(coverage)
      if (cover && !cover.covering) {
        notCovering.push({ check: name, section: current, ...cover })
        return {
          status: 'NOT-COVERING',
          failed: false,
          note:
            `  [NOT COVERING: ${cover.seen} of a needed ${cover.minimum} ${cover.what} seen; ` +
            `the observed ${ok ? 'pass' : 'fail'} decides nothing and the question stays open]`,
        }
      }
      const why = nonPredictiveChecks.get(String(check ?? ''))
      // A COVERING CHECK STILL PRINTS ITS COUNT. The point of the count is that
      // a reader never has to take "green" on trust, so it is written whether
      // it cleared the minimum or not.
      const counted = cover ? `  [covering: ${cover.seen} ${cover.what} seen, ${cover.minimum} needed]` : ''
      if (why && !verdict.partial) {
        return {
          status: 'NON-PREDICTIVE',
          failed: false,
          note: `  [NON-PREDICTIVE in full suite: observed ${ok ? 'pass' : 'fail'}; ${why}]${counted}`,
        }
      }
      return {
        status: ok ? 'PASS' : 'FAIL',
        failed: !ok,
        note: (why && ok ? `  [NON-PREDICTIVE narrowly: ${why}]` : '') + counted,
      }
    },
    /** Every check this run could not answer for want of subjects (point 1136),
     *  so the suite can name them where it prints its own summary. */
    notCovering: () => notCovering.map((n) => ({ ...n })),
    /** The section a check being printed right now sits in. */
    currentSection: () => current,
    ran: () => [...ran],
    /** What a result line appends so a failing check names the argument that
     *  re-runs it alone. Empty until the first section is entered (the boot
     *  prologue belongs to no section). */
    tag: () => (current === null ? '' : sectionTag(current)),
    /** The banner a partial run prints, so no reader can mistake it for a pass
     *  of the suite. Null for a whole run, which prints nothing new. */
    banner: () =>
      verdict.partial
        ? `PARTIAL RUN — only section "${verdict.requested}" of ${suite} ran; this is NOT suite coverage`
        : null,
    /**
     * THE DEBT A PARTIAL RUN OWES AT ITS END: the requested section must have
     * actually EXECUTED. `listSections` reads the declarations out of source
     * TEXT, so a name behind a block an earlier `return`/throw never reached
     * passes the up-front check, and the run would then boot, assert nothing and
     * exit 0. A green that proves nothing is the one outcome that would make
     * this mechanism dangerous, so it is a FAILURE, checked where the suite
     * counts its failures. Null when the run owes nothing.
     */
    unrun: () =>
      verdict.partial && !ran.includes(verdict.requested)
        ? `section "${verdict.requested}" was selected but never ran — ${suite} declares the name (possibly only in a comment or behind an unreached branch) and no block executed it; nothing was verified`
        : null,
  }
  return gate
}

/** The section whose result lines a suite is emitting now. The recorder reads
 * this at emission time, while the provenance still exists; it is deliberately
 * not reconstructed later from durable text. */
let currentResultSection = null
export const resultSection = () => currentResultSection

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

/**
 * WHICH SECTION EACH CHANGED LINE OF A SUITE'S SOURCE BELONGS TO (point 1086).
 *
 * The ladder credits a green narrow run of the suite whose material was edited.
 * Which section covers a given edit is NOT derivable in general — an edit to
 * `src/render/fauna.ts` reaches three suites and no section in particular — but
 * when the edited file IS the suite's own source it is derivable exactly: a
 * section is a block, and a changed line sits in one. Without this the measured
 * case went uncaught, and the four-eyes round of 11.09.2026 named it: edit the
 * `adult-errands` block, run only `town-plan`, and the full pass counted as
 * climbed although the edited material was never checked once.
 *
 * A line above the first declaration belongs to the boot prologue, which every
 * section pays for — it answers `null`, and the ladder treats that as "no
 * section can stand in for this", i.e. every section is aged.
 *
 * Total: never throws; an unreadable source names no sections.
 */
export function sectionsForLines(source, lines) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  // Declaration offsets → the 1-based line they stand on.
  const marks = []
  for (const head of masked.matchAll(DECL_HEAD)) {
    DECL_RE.lastIndex = head.index
    const decl = DECL_RE.exec(src)
    if (!decl || decl.index !== head.index) continue
    let line = 1
    for (let i = 0; i < head.index; i += 1) if (src[i] === '\n') line += 1
    marks.push({ line, name: decl[2] })
  }
  marks.sort((a, b) => a.line - b.line)

  const out = new Set()
  for (const raw of lines ?? []) {
    const n = Number(raw)
    if (!Number.isFinite(n)) continue
    let name = null
    for (const mark of marks) {
      if (mark.line <= n) name = mark.name
      else break
    }
    out.add(name)
  }
  return [...out]
}

/** The section a printed result line names, taken from the tag `check()` appends
 *  (scripts/section-tag-core.mjs). Null when the line carries none: a suite that
 *  is not sectioned yet, or a check in the boot prologue that belongs to no
 *  block. Total: never throws. */
const TAG_RE = new RegExp(`\\[--section=(${SECTION_NAME_PATTERN})\\]`)
export function sectionOfLine(line) {
  const m = TAG_RE.exec(String(line ?? ''))
  return m === null ? null : m[1]
}

/**
 * WHICH SECTIONS A DIAGNOSIS RUN REPEATS (point 1126, user 14.09.2026).
 *
 * WHY. A red asks ONE question — transient or defect? — and two mechanisms ask
 * it today by replaying the WHOLE suite: the flake retry (point 200) and the
 * baseline classification (point 294). Measured 14.09.2026 on point 1056, inside
 * a single LARGE run: `polish` ran FOUR times at ~28 min each — first pass, flake
 * retry, two baseline passes on the merge base — to re-ask a handful of checks.
 * Each failing check already NAMES the block that re-runs it alone, so the same
 * question costs three section runs (~9 min) instead of three suite passes (~84).
 *
 * DIAGNOSIS ONLY. A `--section` run is stamped PARTIAL and can never be suite
 * coverage; this narrows what is asked, never what is credited. And it narrows
 * only where the narrow reading is TRUSTWORTHY — otherwise it answers `whole`
 * and the caller repeats the suite exactly as before:
 *   · a failing check that names no section: nothing can stand in for it;
 *   · a check the suite declares NON-PREDICTIVE (point 1086): its narrow reading
 *     is admittedly not the suite's, so a narrow verdict would be a lie;
 *   · a red spread over half the suite's blocks: every section pays the boot
 *     prologue again, so repeating that many costs more than the one pass.
 *
 * `failures` are the parsed failing checks (baseline-classify-core's
 * `failedChecks`) — the tag rides in `detail`, and `name` is read too so a
 * `--failed "<pasted line>"` keeps working. Total: never throws.
 */
export function narrowDiagnosis({ failures = [], declared = [], nonPredictive = [], suite = 'the suite' } = {}) {
  const known = Array.isArray(declared) ? declared : []
  const whole = (why) => ({ sections: [], whole: true, why })
  if (known.length === 0) return whole(`${suite} declares no sections`)
  const reds = Array.isArray(failures) ? failures : []
  if (reds.length === 0) return whole('no failing check to narrow to')
  const undeclarable = new Set((Array.isArray(nonPredictive) ? nonPredictive : []).map((d) => String(d?.check ?? '')))
  const named = new Set()
  for (const red of reds) {
    const label = String(red?.name ?? '')
    const where = sectionOfLine(red?.detail ?? '') ?? sectionOfLine(label)
    if (where === null) return whole(`"${label}" names no section, so no block can stand in for it`)
    if (!known.includes(where)) return whole(`"${label}" names section "${where}", which ${suite} no longer declares`)
    if (undeclarable.has(label)) {
      return whole(`"${label}" is declared NON-PREDICTIVE in "${where}" — its narrow reading is admittedly not the suite's`)
    }
    named.add(where)
  }
  if (named.size * 2 >= known.length) {
    return whole(`${named.size} of ${known.length} blocks are red — repeating them one by one pays the boot prologue ${named.size} times`)
  }
  return { sections: known.filter((name) => named.has(name)), whole: false, why: '' }
}
