// Doc-consistency checks (no browser). Keeps the README in step with the
// authoritative acceptance list in CLAUDE.md §7.1 — the count in the README's
// Status section must equal the number of numbered criteria there — and keeps
// §7.1's two COMPANION DOCUMENTS honest: docs/acceptance-evidence.md carries
// each criterion's evidence and docs/acceptance-criteria-detail.md its
// condition, both under the SAME number. §7.1 kept a `Detail:`/`Evidence:`
// pointer line under every criterion until the build order was cut to its
// binding sentences (a3a04322, 21.08.2026); the numbering IS the reference now,
// so both documents are checked the same way — every criterion has its section,
// and no section stands without its criterion.
//
// The decision layer below is PURE and exported; the file only runs the checks
// when it is executed as a script, so scripts/verify/docs.test.mjs can exercise
// it against a present section, a missing one and an orphaned one.
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

/**
 * Judge one companion document against §7.1. Returns the number of criteria
 * judged plus two arrays, both empty when a non-empty §7.1 is sound:
 *   missing — a criterion with no section of its number in the document,
 *   orphans — a section in the document that NO criterion carries.
 *
 * `orphans` is judged in its own direction on purpose (four-eyes review, point
 * 555): a criterion that is deleted or renumbered leaves its section standing,
 * and a check that only asked "does every criterion have a section" would call
 * that sound — the one direction in which a moved criterion rots silently.
 */
export function checkCompanion(section, target) {
  const criteria = criterionNumbers(section)
  const sections = sectionNumbers(target)
  return {
    criterionCount: criteria.length,
    missing: criteria.filter((n) => !sections.includes(n)),
    orphans: sections.filter((n) => !criteria.includes(n)),
  }
}

/**
 * Turn one document's judgment into the two CLI rules. Keeping this layer pure
 * makes the fail-closed zero-criterion verdict directly testable: no rule may
 * turn green merely because its subject disappeared.
 */
export function companionRules(kind, doc, verdict) {
  const count = verdict.criterionCount
  const judged = `${count} criteri${count === 1 ? 'on' : 'a'} judged`
  const hasCriteria = count > 0
  const noneJudged = hasCriteria ? '' : 'no criteria matched'
  const numbers = (list) => list.map((n) => `§${n}`).join(', ')
  return [
    {
      name: `every criterion has its ${kind} section in ${doc} (${judged})`,
      ok: hasCriteria && verdict.missing.length === 0,
      detail: numbers(verdict.missing) || (hasCriteria ? 'all present' : noneJudged),
    },
    {
      name: `no orphaned ${kind} section that no criterion carries (${judged})`,
      ok: hasCriteria && verdict.orphans.length === 0,
      detail: numbers(verdict.orphans) || (hasCriteria ? 'none' : noneJudged),
    },
  ]
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
  // lives in docs/acceptance-criteria-detail.md the same way. §7.1 asks for
  // criterion and section to change in one commit — a request nothing enforced,
  // in a project whose model is "enforce, don't remind" (four-eyes review,
  // second round). These checks do.
  const companions = [
    { kind: 'evidence', doc: EVIDENCE_DOC },
    { kind: 'detail', doc: DETAIL_DOC },
  ]
  for (const c of companions) {
    const target = readFileSync(root + c.doc, 'utf8')
    const v = checkCompanion(section, target)
    for (const rule of companionRules(c.kind, c.doc, v)) check(rule.name, rule.ok, rule.detail)
  }

  console.log('console errors: 0')
  process.exit(failures > 0 ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
