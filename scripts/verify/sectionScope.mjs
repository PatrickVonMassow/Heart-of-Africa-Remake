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
import { maskCode } from '../window-hide-core.mjs'

/** A section declaration up to the opening quote, matched in MASKED source (so
 *  prose cannot declare one); the NAME is then read from the original text,
 *  whose string bodies the mask blanked. */
const DECL_HEAD = /(?<![\w.$])section\(\s*['"]/g
const DECL_NAME = /(?<![\w.$])section\(\s*(['"])([a-z0-9][a-z0-9-]*)\1\s*\)/g
/** Any `window.__something` — the convention every dev hook in this project uses. */
const GLOBAL = /\bwindow\.(__[A-Za-z0-9_$]+)/g

/**
 * The `if (section('name')) { … }` blocks of a suite, as half-open index ranges
 * over the ORIGINAL source (the masked copy preserves every index).
 *
 * The end is found by counting braces from the block's opening `{` in the masked
 * text, where a brace inside a comment or a string cannot mislead the count. A
 * declaration whose block never closes is dropped rather than guessed at.
 */
export function sectionRanges(source) {
  const src = String(source ?? '')
  const masked = maskCode(src)
  const out = []
  for (const head of masked.matchAll(DECL_HEAD)) {
    DECL_NAME.lastIndex = head.index
    const m = DECL_NAME.exec(src)
    if (!m || m.index !== head.index) continue
    const open = masked.indexOf('{', m.index + m[0].length)
    if (open < 0) continue
    let depth = 0
    let end = -1
    for (let i = open; i < masked.length; i++) {
      const c = masked[i]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) { end = i + 1; break }
      }
    }
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

/** The findings as the message a failing gate prints. */
export function formatCrossSectionGlobals(findings, file = 'the suite') {
  if (!findings?.length) return ''
  const lines = findings.map(
    (f) => `  · window.${f.name} is installed in [${f.installedIn.join(', ')}] but read from ` +
      `"${f.usedIn}" (${file}:${f.line}) — that block cannot run on its own`,
  )
  return (
    `A page helper crosses a section boundary (point 566):\n${lines.join('\n')}\n` +
    'Install it with the other shared staging, above the section blocks, so every block that ' +
    'uses it finds it — a --section run of that block otherwise dies on "is not a function".'
  )
}
