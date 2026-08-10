// "IT REJECTED, BECAUSE THE EXIT CODE WAS NON-ZERO" — the shape that is not a
// proof (point 573 d).
//
// WHAT IT CATCHES. A test spawns a tool, asserts the exit code was non-zero, and
// concludes the tool refused its input. A spawn that NEVER STARTED produces the
// same non-zero code: a binary resolved to a path that does not exist, a script
// renamed, a shell answering 127. The assertion passes, nothing ran, and the
// rule the case exists to guard can rot away in silence. That is exactly what
// `scripts/verify/scope.test.mjs` did in every git worktree — a false GREEN in
// the environment most of this project's work happens in, sitting beside five
// loud false REDS that got all the attention.
//
// WHAT SATISFIES IT. Establish, in the same case, that the process RAN:
//   · assert something POSITIVE about its output — `expect(r.stderr).toContain(
//     'unknown flag')`. Real output is evidence of a real run.
//   · or go through `didRun` / an `expectRejected`-style helper (see
//     `scripts/local-bin.mjs`), which makes the distinction explicitly.
// A `.not.toContain(…)` does NOT satisfy it, and that is the whole point: the
// empty output of a process that never started satisfies every negative
// assertion there is.
//
// Pure text in / findings out; the caller reads the files
// (`scripts/verify/spawn-assertion-gate.test.mjs`).
//
// KNOWN LIMITS, written down so no reader mistakes this for coverage:
//   · it is a TEXT audit over a CONVENTION. A case that establishes the run
//     through a helper this file cannot recognise is reported, and the honest
//     answer is to name that helper in `RUN_ESTABLISHERS` — not to weaken the
//     rule.
//   · establishment is looked for in the enclosing `it`/`test` case. A run
//     established in a `beforeAll` for the whole describe is NOT seen; hoist the
//     assertion or use a recognised helper.
//   · only assertions written as `expect(…)` are read. A hand-rolled
//     `if (r.status === 0) throw …` is invisible.
//   · a spawn wrapper defined in ANOTHER module is not followed; the file's own
//     use of `child_process` is what puts it in scope at all.
import { maskCode, balancedEnd } from '../window-hide-core.mjs'

/** Does this file spawn a child process at all? Nothing else is in scope. */
const SPAWNS = /\b(spawnSync|spawn|execFileSync|execFile|execSync|exec|fork)\s*\(/

/** `it('…', …)` / `test(…)` / `it.skipIf(x)('…')` — the case that must establish
 *  the run. Matched in MASKED source so prose cannot open one. */
const CASE_HEAD = /(?<![\w.$])(?:it|test)(?:\.\w+(?:\([^()]*\))?)*\s*\(/g

/** `expect(` itself. Everything else is read from the BALANCED argument and the
 *  matcher chain that follows it — a regex spanning both would run away across
 *  statements, this project's style carrying no semicolons to stop it. */
const EXPECT = /(?<![\w.$])expect\s*\(/g

/** The matcher chains that say "this value was non-zero", i.e. "it failed".
 *  `toBeTruthy` counts: an exit code is a number, and truthy means non-zero. */
const NEGATIVE_MATCHER =
  /^\s*(?:\.not\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\+?0\s*\)|\.toBeGreaterThan\s*\(\s*0\s*\)|\.toBeTruthy\s*\(\s*\))/

/** The matcher chains an EMPTY output cannot satisfy — a positive claim. */
const POSITIVE_MATCHER = /^\s*\.(?:toContain|toMatch|toContainEqual)\s*\(/

/** The names an exit status goes by. Word-bounded, so `codeLines` is not one. */
const EXIT_SUBJECT = /\b(status|code|exitCode|exit_code|signalCode)\b/

/** Names that mean the author asked "did it run?" rather than "was it non-zero?" */
export const RUN_ESTABLISHERS = /\b(didRun|expectRejected|expectAccepted|expectRan|assertRan|assertRejected|NOT_RUN)\b/

/** An output channel — what a positive claim must be ABOUT. */
const OUTPUT_SUBJECT = /\b(stdout|stderr|output|out|stdio|combined|log)\b/

/**
 * Every `expect(<argument>)<chain>` in a file, read over balanced parens.
 * @returns {{ index: number, argument: string, chain: string }[]}
 */
export function expectCalls(source) {
  const src = String(source ?? '')
  if (src === '') return []
  const masked = maskCode(src)
  const calls = []
  EXPECT.lastIndex = 0
  for (let m = EXPECT.exec(masked); m !== null; m = EXPECT.exec(masked)) {
    const open = m.index + m[0].length - 1
    const end = balancedEnd(masked, open)
    if (end === -1) continue
    calls.push({
      index: m.index,
      // The ARGUMENT is read from the original text (the mask blanked string
      // bodies), the CHAIN from the masked text — a matcher name can only be
      // real code, and a string must never be mistaken for one.
      argument: src.slice(open + 1, end - 1),
      chain: masked.slice(end, end + 120),
    })
    EXPECT.lastIndex = end
  }
  return calls
}

/** Line number (1-based) of an index. */
const lineAt = (source, index) => source.slice(0, index).split('\n').length

/**
 * The `it`/`test` case bodies in a file, as [start, end) index ranges over the
 * ORIGINAL source. Scanned over masked text so a case head in a comment or a
 * string opens nothing.
 */
export function caseRanges(source) {
  const src = String(source ?? '')
  if (src === '') return []
  const masked = maskCode(src)
  const ranges = []
  CASE_HEAD.lastIndex = 0
  for (let m = CASE_HEAD.exec(masked); m !== null; m = CASE_HEAD.exec(masked)) {
    const open = m.index + m[0].length - 1
    const end = balancedEnd(masked, open)
    if (end === -1) continue
    ranges.push({ start: m.index, end, name: caseName(src, open, end) })
    CASE_HEAD.lastIndex = m.index + m[0].length
  }
  // Keep only the OUTERMOST cases: a nested `it` inside another would otherwise
  // split one case's establishment away from its assertion.
  return ranges.filter((r, i) => !ranges.some((o, j) => j !== i && o.start <= r.start && o.end >= r.end && (o.end - o.start) > (r.end - r.start)))
}

/** The case's title, for a message a reader can locate. */
function caseName(src, open, end) {
  const head = src.slice(open, Math.min(end, open + 300))
  const m = /^\(\s*(['"`])([\s\S]*?)\1/.exec(head)
  return m ? m[2].replace(/\s+/g, ' ').slice(0, 90) : '(unnamed case)'
}

/** The case containing `index`, or null for module-level code. */
export const caseAt = (ranges, index) => ranges.find((r) => index >= r.start && index < r.end) ?? null

/**
 * Every "non-zero, therefore it rejected" that nothing in its case backs up.
 *
 * @returns {{ line: number, case: string, assertion: string, subject: string }[]}
 */
export function spawnAssertionFindings(source) {
  const src = String(source ?? '')
  if (src === '' || !SPAWNS.test(src)) return []
  const cases = caseRanges(src)
  const findings = []

  for (const call of expectCalls(src)) {
    if (!NEGATIVE_MATCHER.test(call.chain)) continue
    // Only exit-code claims. `expect(list.length).toBeGreaterThan(0)` is a
    // different sentence entirely, and reporting it would make this noise.
    if (!EXIT_SUBJECT.test(call.argument) || /\.length\b/.test(call.argument)) continue
    const owner = caseAt(cases, call.index)
    const scope = owner ? src.slice(owner.start, owner.end) : src
    if (establishesRun(scope)) continue
    const chain = call.chain.match(NEGATIVE_MATCHER)?.[0] ?? ''
    findings.push({
      line: lineAt(src, call.index),
      case: owner?.name ?? '(module level)',
      assertion: `expect(${call.argument})${chain}`.replace(/\s+/g, ' ').trim(),
      subject: call.argument.replace(/\s+/g, ' ').trim(),
    })
  }
  return findings
}

/** Does this text prove the process ran — by name, or by a positive claim about
 *  its output? */
export function establishesRun(scope) {
  const text = String(scope ?? '')
  if (RUN_ESTABLISHERS.test(text)) return true
  return expectCalls(text).some(
    (call) => POSITIVE_MATCHER.test(call.chain) && OUTPUT_SUBJECT.test(call.argument),
  )
}

/** The message the gate fails with — what is wrong, and both ways to fix it. */
export function formatSpawnAssertionFindings(findings, file = 'the file') {
  if (!findings || findings.length === 0) return ''
  return [
    `${file}: ${findings.length} assertion(s) conclude "it rejected" from a non-zero exit,`,
    'without anything establishing that the process RAN. A spawn that never started —',
    'a missing binary, a renamed script, a shell answering 127 — satisfies every one of',
    'them, so they would stay GREEN while the thing they guard rots away.',
    ...findings.map((f) => `  line ${f.line}  ${f.case}\n      ${f.assertion}`),
    'Fix it either way:',
    "  · assert something POSITIVE about that spawn's output: expect(r.stderr).toContain('…')",
    '  · or go through didRun()/expectRejected() from scripts/local-bin.mjs.',
    'A .not.toContain(…) does NOT count — empty output satisfies it, which is the defect.',
  ].join('\n')
}
