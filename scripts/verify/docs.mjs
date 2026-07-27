// Doc-consistency checks (no browser). Keeps the README in step with the
// authoritative acceptance list in CLAUDE.md §7.1 — the count in the README's
// Status section must equal the number of numbered criteria there.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const readme = readFileSync(root + 'README.md', 'utf8')
const claude = readFileSync(root + 'CLAUDE.md', 'utf8')

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

// Numbered "N. **Title**" lines between the §7.1 and §7.2 headings.
const s71 = claude.indexOf('### 7.1')
const s72 = claude.indexOf('### 7.2')
const section = s71 >= 0 && s72 > s71 ? claude.slice(s71, s72) : ''
const nums = [...section.matchAll(/^(\d+)\.\s+\*\*/gm)].map((m) => Number(m[1]))
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

// The evidence chains live in docs/acceptance-evidence.md under the SAME numbers
// (user 26.07.2026). The intro asks for criterion and evidence to change in one
// commit — a request nothing enforced, in a project whose model is "enforce,
// don't remind" (four-eyes review, second round). These three checks do.
const evidence = readFileSync(root + 'docs/acceptance-evidence.md', 'utf8')
const pointers = [...section.matchAll(/Evidence: docs\/acceptance-evidence\.md §(\d+)\./g)].map(
  (m2) => Number(m2[1]),
)
const sections = [...evidence.matchAll(/^## (\d+)\./gm)].map((m2) => Number(m2[1]))

// A pointer must name the criterion it stands in: walk the section and pair each
// pointer with the most recent numbered criterion above it.
const misdirected = []
{
  let current = null
  for (const line of section.split('\n')) {
    const crit = line.match(/^(\d+)\.\s+\*\*/)
    if (crit) current = Number(crit[1])
    const ptr = line.match(/Evidence: docs\/acceptance-evidence\.md §(\d+)\./)
    if (ptr && Number(ptr[1]) !== current) misdirected.push(`§${ptr[1]} under criterion ${current}`)
  }
}
check('every evidence pointer names its own criterion', misdirected.length === 0, misdirected.join(', '))
check(
  'every pointer has a section in docs/acceptance-evidence.md',
  pointers.every((n) => sections.includes(n)),
  pointers.filter((n) => !sections.includes(n)).join(', ') || 'all present',
)
check(
  'no orphaned evidence section without a criterion',
  sections.every((n) => nums.includes(n)),
  sections.filter((n) => !nums.includes(n)).join(', ') || 'none',
)

console.log('console errors: 0')
process.exit(failures > 0 ? 1 : 0)
