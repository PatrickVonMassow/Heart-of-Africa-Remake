// Doc-consistency checks (no browser). Keeps the README in step with the
// authoritative acceptance list in CLAUDE.md §7.1 — the count in the README's
// Status section must equal the number of numbered criteria there — and keeps
// §7.1's two POINTER FAMILIES honest: the `Evidence:` lines into
// docs/acceptance-evidence.md and the `Detail:` lines into
// docs/acceptance-criteria-detail.md. Both families work the same way (a
// criterion states what must hold and points at the rest under the SAME
// number), so both are checked by the same three rules — a pointer names its
// own criterion, it resolves to a real section, and no section is orphaned.
//
// The decision layer below is PURE and exported; the file only runs the checks
// when it is executed as a script, so scripts/verify/docs.test.mjs can exercise
// it against a present, a missing and a misspelled section.
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EVIDENCE_DOC = 'docs/acceptance-evidence.md'
const DETAIL_DOC = 'docs/acceptance-criteria-detail.md'

/** The §7.1 block of CLAUDE.md — empty when the headings are gone. */
export function criteriaSection(claude) {
  const text = String(claude ?? '')
  const start = text.indexOf('### 7.1')
  const end = text.indexOf('### 7.2')
  return start >= 0 && end > start ? text.slice(start, end) : ''
}

/** The numbers of the "N. **Title**" criteria, in file order. */
export function criterionNumbers(section) {
  return [...String(section ?? '').matchAll(/^(\d+)\.\s+\*\*/gm)].map((m) => Number(m[1]))
}

/** The numbers of the "## N. Title" sections of a pointed-at document. */
export function sectionNumbers(doc) {
  return [...String(doc ?? '').matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]))
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `Evidence: docs/acceptance-evidence.md §12.` and its `Detail:` twin. */
export function pointerRe(keyword, doc) {
  return new RegExp(`${escapeRe(keyword)}: ${escapeRe(doc)} §(\\d+)\\.`)
}

/**
 * Judge one pointer family of §7.1 against the document it points into.
 * Returns { misdirected, unresolved, orphans } — each an array of readable
 * strings/numbers, all empty when the family is sound:
 *   misdirected — a pointer standing under a criterion it does not name,
 *   unresolved  — a pointer naming a section the target document lacks,
 *   orphans     — a section in the target document that no criterion carries.
 */
export function checkPointers(section, target, keyword, doc) {
  const re = pointerRe(keyword, doc)
  const nums = criterionNumbers(section)
  const sections = sectionNumbers(target)
  const misdirected = []
  const pointers = []
  let current = null
  for (const line of String(section ?? '').split('\n')) {
    const crit = line.match(/^(\d+)\.\s+\*\*/)
    if (crit) current = Number(crit[1])
    const ptr = line.match(re)
    if (!ptr) continue
    const at = Number(ptr[1])
    pointers.push(at)
    if (at !== current) misdirected.push(`§${at} under criterion ${current}`)
  }
  return {
    misdirected,
    unresolved: pointers.filter((n) => !sections.includes(n)),
    orphans: sections.filter((n) => !nums.includes(n)),
  }
}

function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const readme = readFileSync(root + 'README.md', 'utf8')
  const claude = readFileSync(root + 'CLAUDE.md', 'utf8')

  let failures = 0
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures++
  }

  const section = criteriaSection(claude)
  const nums = criterionNumbers(section)
  const count = nums.length
  check(
    'CLAUDE.md §7.1 criteria are numbered 1..N contiguously',
    count > 0 && nums[0] === 1 && nums[count - 1] === count && nums.every((n, i) => n === i + 1),
    `found ${count}, first ${nums[0]}, last ${nums[count - 1]}`,
  )

  const m = readme.match(/All (\d+) acceptance criteria/)
  check('README states an acceptance-criteria count', !!m, m ? m[0] : 'none')
  check('README count matches CLAUDE.md §7.1', !!m && Number(m[1]) === count, `README ${m ? m[1] : '?'} vs CLAUDE ${count}`)
  check('README no longer makes the stale "18 acceptance criteria" claim', !/All 18 acceptance criteria/.test(readme), '')

  // The evidence chains live in docs/acceptance-evidence.md under the SAME
  // numbers (user 26.07.2026), and since point 555 the criteria's full wording
  // lives in docs/acceptance-criteria-detail.md the same way. The intro asks for
  // criterion and section to change in one commit — a request nothing enforced,
  // in a project whose model is "enforce, don't remind" (four-eyes review,
  // second round). These checks do.
  const families = [
    { kind: 'evidence', keyword: 'Evidence', doc: EVIDENCE_DOC },
    { kind: 'detail', keyword: 'Detail', doc: DETAIL_DOC },
  ]
  for (const f of families) {
    const target = readFileSync(root + f.doc, 'utf8')
    const v = checkPointers(section, target, f.keyword, f.doc)
    check(`every ${f.kind} pointer names its own criterion`, v.misdirected.length === 0, v.misdirected.join(', '))
    check(
      `every pointer has a section in ${f.doc}`,
      v.unresolved.length === 0,
      v.unresolved.join(', ') || 'all present',
    )
    check(`no orphaned ${f.kind} section without a criterion`, v.orphans.length === 0, v.orphans.join(', ') || 'none')
  }

  console.log('console errors: 0')
  process.exit(failures > 0 ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
