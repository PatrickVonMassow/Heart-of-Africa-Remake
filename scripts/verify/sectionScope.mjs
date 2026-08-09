// THE SECOND HALF OF THE SCOPE NET (point 566).
//
// `no-undef` over the suites (`.oxlintrc.json`, pinned by scope.test.mjs) catches
// a JS binding declared in one `if (section('x')) { … }` block and used from
// another — that was `pinFamily`, which aborted an `enrichments` pass after 176
// of 251 checks. It cannot catch the same mistake made on the PAGE: a helper
// installed as `window.__makeTestFamily = …` inside `calf-jitter` and called
// from four later blocks is, to a linter, a property assignment and a property
// read. Standalone, each of those blocks died on `window.__makeTestFamily is not
// a function` — found by a 100-second browser run, which is the cost this point
// exists to remove.
//
// So the same question is asked of the page globals, statically: is any
// `window.__x` READ from a section that never assigns it, while some OTHER
// section does? The answer is a defect either way round — the helper belongs
// above the blocks, with the rest of the shared staging.
//
// Pure text in / findings out; the suite files are read by the caller
// (scripts/verify/scope.test.mjs).
//
// KNOWN LIMITS. This is a TEXT audit over a CONVENTION, and the boundary is
// written down so the next reader does not mistake it for coverage. None of
// these is reported today; each is a shape a determined author could write and
// the net would stay silent:
//   · a bracketed install or read — `window['__h']`, `globalThis[name]`. Only
//     the dotted form is matched.
//   · an install written ONLY as `window.__h ??= …` (or `||=`/`&&=`). That reads
//     as a read, so the name never counts as installed and drops out entirely.
//   · an install performed by a SHARED function that a section calls. The
//     assignment text sits outside the blocks, which is precisely what this
//     check treats as legitimate staging — it cannot see WHEN the call happens.
//   · a section slug written with backticks or outside `[a-z0-9-]`: no
//     declaration is recognised, so the block counts as shared code. Such a slug
//     is not runnable either (scripts/verify/sections.mjs reads the same shape),
//     so it fails on the CLI first.
//   · for crossSectionBindings: an initialiser at the declaration (`let herd =
//     null`) counts as a shared assignment by design — see there; only the FIRST
//     declarator of a `let a, b` list is examined; and a name shadowed in a
//     nested scope is read as the module-level one.
// Closing any of these means moving from text to a parse, which is a different
// mechanism, not a bigger regex.
import { maskCode, balancedEnd } from '../window-hide-core.mjs'

/** A section declaration up to the opening quote, matched in MASKED source (so
 *  prose cannot declare one); the NAME is then read from the original text,
 *  whose string bodies the mask blanked. */
const DECL_HEAD = /(?<![\w.$])section\(\s*['"]/g
const DECL_NAME = /(?<![\w.$])section\(\s*(['"])([a-z0-9][a-z0-9-]*)\1\s*\)/g
/** Any `window.__something` — the convention every dev hook in this project uses.
 *  `globalThis` is the same object from the same callback and is written by hand
 *  often enough that leaving it out would be an evasion nobody had to intend. */
const GLOBAL = /\b(?:window|globalThis)\.(__[A-Za-z0-9_$]+)/g

/**
 * The `(` of the `if`-head whose condition contains the call starting at
 * `declStart`, or -1. Scanned backwards over MASKED text, so a paren in prose or
 * in a string cannot be mistaken for one; a `{`, `}` or `;` at depth 0 ends the
 * search, because none of them can stand inside an `if` condition.
 */
function conditionOpen(masked, declStart) {
  let depth = 0
  for (let i = declStart - 1; i >= 0; i--) {
    const c = masked[i]
    if (c === ')') depth++
    else if (c === '(') {
      if (depth === 0) return i
      depth--
    } else if (c === '{' || c === '}' || c === ';') return -1
  }
  return -1
}

/**
 * The index of the block's opening `{` for a declaration spanning
 * [declStart, declEnd), or -1 when the declaration owns no block.
 *
 * THE ANCHOR IS THE CONDITION'S CLOSING PAREN, not the next `{` in the file.
 * Taking the next `{` mis-scoped any head that carries braces of its own —
 * `if (section('a') && stage({ x: 1 })) { … }` recorded `{ x: 1 }` as the whole
 * section, which left the real block counting as SHARED code and silently
 * disabled every finding for a helper installed there. A gate that reports
 * nothing is worse than no gate, so the head is measured, not guessed.
 */
function blockOpen(masked, declStart, declEnd) {
  const cond = conditionOpen(masked, declStart)
  const after = cond < 0 ? declEnd : balancedEnd(masked, cond)
  if (after < 0) return -1
  let i = after
  while (i < masked.length && /\s/.test(masked[i])) i++
  // Only whitespace may stand between the condition and its block: a
  // single-statement `if` opens no block scope, so there is no range to record.
  return masked[i] === '{' ? i : -1
}

/**
 * The `if (section('name')) { … }` blocks of a suite, as half-open index ranges
 * over the ORIGINAL source (the masked copy preserves every index).
 *
 * The end is found by counting brackets from the block's opening `{` in the
 * masked text, where a brace inside a comment or a string cannot mislead the
 * count. A declaration whose block never closes is dropped rather than guessed at.
 */
export function sectionRanges(source) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  const out = []
  for (const head of masked.matchAll(DECL_HEAD)) {
    DECL_NAME.lastIndex = head.index
    const m = DECL_NAME.exec(src)
    if (!m || m.index !== head.index) continue
    const open = blockOpen(masked, m.index, m.index + m[0].length)
    if (open < 0) continue
    const end = balancedEnd(masked, open)
    if (end < 0) continue
    out.push({ name: m[2], start: m.index, end })
  }
  return out
}

/** The section a source index sits in, or null for the shared code around them. */
export function sectionAt(ranges, index) {
  for (const r of ranges ?? []) if (index >= r.start && index < r.end) return r.name
  return null
}

/**
 * Every `window.__x` a suite ASSIGNS in one section and READS in another.
 *
 * A name assigned anywhere OUTSIDE the section blocks is fine however widely it
 * is read — that is exactly the shared staging this rule asks for. A name the
 * suite never assigns at all is the application's own dev hook (`window.__game`,
 * `window.__wildlife`) and is none of this check's business.
 *
 * Each finding names the helper, where it is installed and where it is read, so
 * the message is the repair instruction: move the install above the blocks.
 */
export function crossSectionGlobals(source) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  const ranges = sectionRanges(src)
  const assigned = new Map() // name → Set(section | null)
  const read = new Map() // name → Map(section → line)
  const lineAt = (i) => src.slice(0, i).split('\n').length
  for (const m of masked.matchAll(GLOBAL)) {
    const name = m[1]
    const after = masked.slice(m.index + m[0].length)
    // `window.__x = …` is an install; `window.__x.y = …`, `window.__x(…)` and
    // `window.__x === …` are all reads of `__x` itself.
    const isAssign = /^\s*=(?![=>])/.test(after)
    const where = sectionAt(ranges, m.index)
    if (isAssign) {
      if (!assigned.has(name)) assigned.set(name, new Set())
      assigned.get(name).add(where)
    } else {
      if (!read.has(name)) read.set(name, new Map())
      if (!read.get(name).has(where)) read.get(name).set(where, lineAt(m.index))
    }
  }
  const findings = []
  for (const [name, where] of read) {
    const installs = assigned.get(name)
    if (!installs || installs.has(null)) continue // never installed here, or installed in shared code
    for (const [usedIn, line] of where) {
      if (usedIn === null || installs.has(usedIn)) continue
      findings.push({ name, installedIn: [...installs].sort(), usedIn, line })
    }
  }
  return findings
}

/** A module-level `let`/`var` declarator, up to and including its FIRST name. */
const BINDING_DECL = /(?<![\w$.])(let|var)\s+([A-Za-z_$][\w$]*)/g
/** What makes an identifier occurrence a WRITE rather than a read: assignment,
 *  compound assignment or an increment. `==`, `===` and `=>` are reads. */
const WRITE_AFTER = /^\s*(?:\*\*=|<<=|>>>?=|&&=|\|\|=|\?\?=|[+\-*/%&|^]=(?!=)|=(?![=>])|\+\+|--)/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Brace depth AT each index of masked text (the `{` and its `}` both read as
 *  the OUTER depth), so "module level" is depth 0 and nothing else. PURE. */
function braceDepths(masked) {
  const out = new Int32Array(masked.length)
  let d = 0
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    if (c === '}') d--
    out[i] = d
    if (c === '{') d++
  }
  return out
}

/**
 * THE RECURRENCE PATH. Every module-level `let`/`var` whose only assignments sit
 * inside section blocks, while another section READS it.
 *
 * This is the shape the OTHER two nets both wave through, and it is the single
 * most plausible way the pinFamily class comes back: an author whose cross-block
 * `const` `no-undef` refuses hoists the DECLARATION and leaves the
 * INITIALISATION where it was —
 *
 *     let herd                        // module level: `no-undef` is satisfied
 *     if (section('a')) { herd = … }  // …but only this run ever assigns it
 *     if (section('b')) { use(herd) } // and a --section=b run reads undefined
 *
 * — which no linter objects to (the name IS declared) and `crossSectionGlobals`
 * never sees (it is not a `window.__` helper).
 *
 * AN INITIALISER AT THE DECLARATION COUNTS AS A SHARED ASSIGNMENT, and that is
 * what keeps this quiet enough to be worth having: `let failures = 0` at the top
 * of every suite, counted up inside the blocks and read at the end, is
 * legitimate module-level state and is not reported. The price is the known
 * limit in the header — `let herd = null` initialised only inside a section is
 * the same defect and is NOT caught.
 */
export function crossSectionBindings(source) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  const ranges = sectionRanges(src)
  if (!ranges.length) return []
  const depth = braceDepths(masked)
  const lineAt = (i) => src.slice(0, i).split('\n').length
  const findings = []
  const seen = new Set()
  for (const d of masked.matchAll(BINDING_DECL)) {
    if (depth[d.index] !== 0 || sectionAt(ranges, d.index) !== null) continue
    const name = d[2]
    if (seen.has(name)) continue
    seen.add(name)
    const declEnd = d.index + d[0].length
    const writes = new Set()
    const reads = new Map() // section | null → line
    if (WRITE_AFTER.test(masked.slice(declEnd))) writes.add(null)
    const use = new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`, 'g')
    for (const u of masked.matchAll(use)) {
      if (u.index === declEnd - name.length) continue // the declaration itself
      const where = sectionAt(ranges, u.index)
      if (WRITE_AFTER.test(masked.slice(u.index + name.length))) writes.add(where)
      else if (!reads.has(where)) reads.set(where, lineAt(u.index))
    }
    if (!writes.size || writes.has(null)) continue
    for (const [usedIn, line] of reads) {
      if (usedIn === null || writes.has(usedIn)) continue
      findings.push({ name, kind: d[1], assignedIn: [...writes].sort(), usedIn, line })
    }
  }
  return findings.sort((a, b) => a.line - b.line)
}

/** The findings as the message a failing gate prints. */
export function formatCrossSectionBindings(findings, file = 'the suite') {
  if (!findings?.length) return ''
  const lines = findings.map(
    (f) => `  · ${f.kind} ${f.name} is assigned only in [${f.assignedIn.join(', ')}] but read from ` +
      `"${f.usedIn}" (${file}:${f.line}) — that block reads it undefined`,
  )
  return (
    `A module-level binding is initialised inside one section and read from another (point 566):\n` +
    `${lines.join('\n')}\n` +
    'Hoisting the DECLARATION is not the fix — that only silences `no-undef`. Move the ' +
    'INITIALISATION above the section blocks as well, with the rest of the shared staging.'
  )
}

/** The findings as the message a failing gate prints. */
export function formatCrossSectionGlobals(findings, file = 'the suite') {
  if (!findings?.length) return ''
  const lines = findings.map(
    // No `window.` prefix on the name: the same global is written both ways, and
    // a message naming a spelling the file does not use sends the reader hunting.
    (f) => `  · the page global ${f.name} is installed in [${f.installedIn.join(', ')}] but read from ` +
      `"${f.usedIn}" (${file}:${f.line}) — that block cannot run on its own`,
  )
  return (
    `A page helper crosses a section boundary (point 566):\n${lines.join('\n')}\n` +
    'Install it with the other shared staging, above the section blocks, so every block that ' +
    'uses it finds it — a --section run of that block otherwise dies on "is not a function".'
  )
}
