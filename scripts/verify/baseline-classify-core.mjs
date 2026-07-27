// Triage of a RED verify run, as pure functions (point 294).
//
// Two independent signals, neither of which the runner could read before:
//
//   1. THE REPEAT SIGNATURE. run-all retries a failed browser suite once and
//      used to conclude "FAIL (twice) — a real failure, not a flake" from the
//      bare fact that both runs failed. That is wrong reasoning, and it cost a
//      real triage on 27.07.2026: `enrichments` failed two staging checks on
//      run 1 and a completely different one (the crocodile eye knobs) on the
//      retry, on a machine carrying a unit run plus two agents. Two failures at
//      DIFFERENT places are the signature of LOAD; a defect fails the SAME
//      check twice. So the verdict is drawn from the failing check NAMES, not
//      from the failure count.
//   2. THE BASELINE COMPARISON (point 294 proper). A check that is already red
//      on the pre-change baseline is PRE-EXISTING or a stale check assumption
//      (the 24.07. SSAO ground-edge and proximity-call-fade cases); one that is
//      green on the baseline and red now is a REAL REGRESSION. Re-running a
//      browser suite against a baseline checkout is expensive, so the wrapper
//      (baseline-classify.mjs) does it OPT-IN and only for the checks that
//      failed — this module only decides what the two outputs MEAN.
//
// A third, deliberately WEAK signal corroborates: whether the failing check's
// name has anything to do with the files the change touched. It never decides a
// verdict — it is a hint printed beside one.
//
// Everything here is string-in / verdict-out so the Vitest layer can pin it
// (scripts/verify/baseline-classify.test.mjs); all process work — git, the
// baseline worktree, the dev server, the suite spawn — lives in the wrapper.

/** A suite's own result lines are `PASS  <name>` / `FAIL  <name> — <detail>`.
 *  Two spaces at least, and a NAME after them — so flow.mjs's `FAILURES: 2`
 *  summary and preview.mjs's bare `FAIL` are not mistaken for checks. */
const CHECK_LINE = /^(PASS|FAIL)\s{2,}(.+?)\s*$/

/** `ERR: <text>` (most suites) and the `console errors: <texts>` / `CONSOLE
 *  ERRORS: <texts>` line where it carries the texts rather than a count. */
const ERR_LINE = /^ERR:\s*(.+?)\s*$/
const CONSOLE_LINE = /^(?:console errors|CONSOLE ERRORS):\s*(.+?)\s*$/

/**
 * Every result line of a suite's output, in order.
 * `name` is the check label as printed; `key` is its identity for comparison
 * across runs (whitespace collapsed, digit runs folded to `#`, so a check whose
 * label carries a measured number is still recognised as the same check).
 */
export function parseCheckLines(output) {
  const lines = String(output ?? '').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    const m = CHECK_LINE.exec(line)
    if (!m) continue
    const rest = m[2]
    const dash = rest.indexOf(' — ')
    const name = (dash === -1 ? rest : rest.slice(0, dash)).trim()
    const detail = dash === -1 ? '' : rest.slice(dash + 3).trim()
    if (!name) continue
    out.push({ status: m[1], name, key: checkKey(name), detail, kind: 'check' })
  }
  return out
}

/**
 * The console errors a run reported, as PSEUDO-CHECKS. Two suites (`world`,
 * `i18n`) print no FAIL line at all — they go red purely through the
 * console-error gate, and without this the whole triage would answer "unknown"
 * for exactly the reds that need it most. The identity is the error text
 * NORMALISED (URLs, ports and numbers folded away), so the same error is
 * recognised across runs and across checkouts.
 */
export function consoleErrorChecks(output) {
  const texts = []
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const err = ERR_LINE.exec(line)
    if (err) {
      texts.push(err[1])
      continue
    }
    const con = CONSOLE_LINE.exec(line)
    if (!con) continue
    const rest = con[1].trim()
    if (/^(none|\d+)$/i.test(rest)) continue // just a count — the texts are elsewhere
    for (const t of rest.replace(/^\[\s*|\s*\]$/g, '').split(/\s\|\s|',\s*'|",\s*"/)) {
      const cleaned = t.replace(/^['"]|['"]$/g, '').trim()
      if (cleaned) texts.push(cleaned)
    }
  }
  const seen = new Set()
  const out = []
  for (const t of texts) {
    const name = `console error: ${normaliseErrorText(t)}`
    const key = checkKey(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ status: 'FAIL', name, key, detail: t.slice(0, 200), kind: 'console' })
  }
  return out
}

/** An error text reduced to its identity: no URL, no port, no counter. */
export function normaliseErrorText(text) {
  return String(text ?? '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/:\d+:\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** The comparison identity of a check label (see parseCheckLines). */
export function checkKey(name) {
  return String(name).replace(/\s+/g, ' ').trim().toLowerCase().replace(/\d+(?:[.,]\d+)?/g, '#')
}

/** The failing checks of one output (console errors included as pseudo-checks),
 *  de-duplicated, in first-seen order. */
export function failedChecks(output, { includeConsoleErrors = true } = {}) {
  const seen = new Set()
  const out = []
  const pool = [...parseCheckLines(output), ...(includeConsoleErrors ? consoleErrorChecks(output) : [])]
  for (const c of pool) {
    if (c.status !== 'FAIL' || seen.has(c.key)) continue
    seen.add(c.key)
    out.push(c)
  }
  return out
}

/** Every check a run REACHED (passed or failed), de-duplicated by key. Console
 *  pseudo-checks are not "reached" — their absence means the error did not
 *  happen, which classifyAgainstBaseline handles by kind. */
export function allChecks(output) {
  const seen = new Set()
  const out = []
  for (const c of parseCheckLines(output)) {
    if (seen.has(c.key)) continue
    seen.add(c.key)
    out.push(c)
  }
  return out
}

const byKey = (list) => new Map(list.map((c) => [c.key, c]))

/**
 * What TWO runs of the same suite mean together (the point of the live case).
 *
 *   flake-cleared   — the retry was green: one transient, already handled.
 *   candidate-real  — at least one check failed in BOTH runs. Only a CANDIDATE:
 *                     it says the failure reproduces, not yet that the change
 *                     caused it — that is what the baseline comparison decides.
 *   load-signature  — both runs failed, but at DISJOINT checks. The load
 *                     fingerprint; not evidence of a defect.
 *   unknown         — a run failed without a parseable FAIL line (a crash, a
 *                     wall-timeout kill, a console-error-only red). Nothing can
 *                     be concluded from names that do not exist, so say so
 *                     rather than guess.
 *
 * `firstFailed`/`secondFailed` are the raw suite outputs (strings) or already
 * parsed check lists; `secondRan`/`secondOk` describe the retry when no output
 * is available (retry disabled, suite killed).
 */
export function repeatSignature({ first, second, secondRan = true, secondOk = false }) {
  const a = Array.isArray(first) ? first : failedChecks(first)
  const b = Array.isArray(second) ? second : failedChecks(second)
  if (secondRan && secondOk) {
    return { verdict: 'flake-cleared', stable: [], onlyFirst: a, onlySecond: [], headline: 'cleared on the retry — one transient' }
  }
  if (!secondRan) {
    return {
      verdict: 'unknown',
      stable: [],
      onlyFirst: a,
      onlySecond: [],
      headline: 'only ONE run — no repeat signature (retry disabled or the suite was killed)',
    }
  }
  if (a.length === 0 || b.length === 0) {
    const which = a.length === 0 && b.length === 0 ? 'neither run' : a.length === 0 ? 'run 1' : 'run 2'
    return {
      verdict: 'unknown',
      stable: [],
      onlyFirst: a,
      onlySecond: b,
      headline: `${which} printed a FAIL line — a crash, a wall-timeout or a console-error-only red; read the output`,
    }
  }
  const mapB = byKey(b)
  const stable = a.filter((c) => mapB.has(c.key))
  if (stable.length > 0) {
    const keys = new Set(stable.map((c) => c.key))
    const onlyFirst = a.filter((c) => !keys.has(c.key))
    const onlySecond = b.filter((c) => !keys.has(c.key))
    const rotating = onlyFirst.length + onlySecond.length
    return {
      verdict: 'candidate-real',
      stable,
      onlyFirst,
      onlySecond,
      headline:
        `the SAME check failed twice (${stable.map((c) => c.name).join('; ')}) — a candidate REAL failure` +
        (rotating > 0 ? `; the other ${rotating} rotated between the runs and read as load` : ''),
    }
  }
  return {
    verdict: 'load-signature',
    stable: [],
    onlyFirst: a,
    onlySecond: b,
    headline: 'both runs failed but at DIFFERENT checks — the signature of machine LOAD, not of a defect',
  }
}

const STOPWORDS = new Set([
  'the', 'and', 'not', 'with', 'its', 'it', 'does', 'do', 'has', 'have', 'when', 'while', 'from', 'for',
  'that', 'this', 'into', 'over', 'under', 'after', 'before', 'never', 'always', 'still', 'only', 'one',
  'two', 'all', 'each', 'per', 'was', 'were', 'must', 'can', 'out', 'off', 'but', 'than', 'then', 'there',
  'here', 'them', 'they', 'his', 'her', 'are', 'any', 'own', 'both', 'same', 'more', 'less', 'least',
  'most', 'stays', 'stay', 'keeps', 'keep', 'goes', 'test', 'tests', 'check', 'checks', 'src', 'scripts',
  'verify', 'index', 'mjs', 'test.ts', 'tsx', 'json',
])

/** A crude suffix stem, enough that "streamed" and "Streaming" meet. */
const stem = (w) => {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

function words(text) {
  return String(text ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(stem)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

/**
 * The WEAK corroborating signal: does the failing check's NAME share a word with
 * the paths the change touched? A red in a check that has nothing to do with the
 * diff is more likely load or pre-existing; one that names the changed system is
 * more likely the change. It is a hint, never a verdict — `related: null` means
 * "no changed-file list", and a false is not innocence.
 */
export function changeRelatedness({ checks, changedFiles }) {
  const list = (checks ?? []).map((c) => (typeof c === 'string' ? { name: c, key: checkKey(c) } : c))
  if (!changedFiles || changedFiles.length === 0) {
    return list.map((c) => ({ check: c.name, key: c.key, related: null, tokens: [] }))
  }
  const fileWords = new Set()
  for (const f of changedFiles) for (const w of words(f)) fileWords.add(w)
  return list.map((c) => {
    const tokens = [...new Set(words(c.name).filter((w) => fileWords.has(w)))]
    return { check: c.name, key: c.key, related: tokens.length > 0, tokens }
  })
}

/**
 * The point-294 classification proper: what a check that is red NOW was on the
 * pre-change baseline.
 *
 *   real-regression — green on the baseline, red now: the change did it.
 *   pre-existing    — red on the baseline too: a pre-existing defect or a stale
 *                     check assumption, NOT this change's doing.
 *   baseline-flaky  — the baseline ran it twice with DIFFERENT outcomes. The
 *                     baseline says nothing then, and both wrong readings are
 *                     dangerous: a baseline red by flake would exonerate a real
 *                     regression, a baseline green by luck would convict an
 *                     innocent change. So it is named, not resolved.
 *   inconclusive    — the check never appeared in the baseline run: it is newer
 *                     than the baseline, or the baseline run died before it.
 *
 * `baselineChecks` is every check the baseline run reached (see allChecks); it
 * is what separates "passed there" from "never ran there" — without it a
 * baseline suite that crashed early would read as a clean bill of health.
 * A console-error pseudo-check is different in kind: it cannot be "reached", so
 * its ABSENCE on a baseline that ran at all means the error did not occur there.
 */
export function classifyAgainstBaseline({ currentFailed, baselineFailed, baselineChecks, baselineFlaky = [] }) {
  const failedNow = (currentFailed ?? []).map((c) => (typeof c === 'string' ? { name: c, key: checkKey(c), kind: 'check' } : c))
  const keys = (list) => new Set((list ?? []).map((c) => (typeof c === 'string' ? checkKey(c) : c.key)))
  const baseFailKeys = keys(baselineFailed)
  const baseSeenKeys = keys(baselineChecks)
  const flakyKeys = keys(baselineFlaky)
  const baselineRanAtAll = baseSeenKeys.size > 0 || baseFailKeys.size > 0
  return failedNow.map((c) => {
    let verdict
    if (flakyKeys.has(c.key)) verdict = 'baseline-flaky'
    else if (baseFailKeys.has(c.key)) verdict = 'pre-existing'
    else if (baseSeenKeys.has(c.key)) verdict = 'real-regression'
    else if (c.kind === 'console' && baselineRanAtAll) verdict = 'real-regression'
    else verdict = 'inconclusive'
    return { check: c.name, key: c.key, verdict }
  })
}

const VERDICT_LABEL = {
  'real-regression': 'REAL REGRESSION (green on baseline, red now)',
  'pre-existing': 'PRE-EXISTING / STALE ASSUMPTION (already red on baseline)',
  'baseline-flaky': 'UNSTABLE ON BASELINE (it flakes there too — the baseline decides nothing)',
  inconclusive: 'INCONCLUSIVE (the check did not run on the baseline — newer than it, or the baseline run died first)',
}

/** The repeat-signature verdict as printable lines (deterministic, no colour). */
export function formatRepeatReport({ suite, signature, relatedness = [] }) {
  const relByKey = new Map(relatedness.map((r) => [r.key, r]))
  const name = (c) => {
    const r = relByKey.get(c.key)
    if (!r || r.related === null) return c.name
    return r.related ? `${c.name} [touches the diff: ${r.tokens.join(', ')}]` : `${c.name} [unrelated to the changed files]`
  }
  const lines = []
  const head = {
    'candidate-real': `FAIL (twice, SAME check)  ${suite} — CANDIDATE REAL FAILURE`,
    'load-signature': `FAIL (twice, DIFFERENT checks)  ${suite} — LOAD/FLAKE SIGNATURE, not evidence of a defect`,
    'flake-cleared': `PASSED ON RETRY  ${suite}`,
    unknown: `FAIL  ${suite} — UNCLASSIFIED`,
  }[signature.verdict]
  lines.push(head)
  lines.push(`      ${signature.headline}`)
  if (signature.stable.length) lines.push(`      failed in BOTH runs: ${signature.stable.map(name).join('; ')}`)
  if (signature.onlyFirst.length) lines.push(`      run 1 only: ${signature.onlyFirst.map(name).join('; ')}`)
  if (signature.onlySecond.length) lines.push(`      run 2 only: ${signature.onlySecond.map(name).join('; ')}`)
  if (signature.verdict === 'load-signature') {
    lines.push('      house rule: judge a red only on a QUIET machine — re-run this suite alone before believing it.')
  }
  if (signature.verdict === 'candidate-real') {
    lines.push(`      to decide whether the CHANGE caused it: node scripts/verify/baseline-classify.mjs ${suite}`)
  }
  return lines
}

/** The baseline classification as printable lines. */
export function formatBaselineReport({
  suite,
  ref,
  backend = 'webgl',
  classified,
  suiteFileChanged = false,
  infraChanged = [],
  baselineRan = true,
  note = '',
}) {
  const lines = [`--- baseline classification — ${suite} vs ${ref} (backend ${backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}) ---`]
  if (!baselineRan) {
    lines.push('      the baseline run did not produce a result — NOT classified (never assume green).')
    if (note) lines.push(`      ${note}`)
    return lines
  }
  for (const c of classified) lines.push(`      ${c.check}: ${VERDICT_LABEL[c.verdict]}`)
  if (suiteFileChanged) {
    lines.push(
      `      NOTE: scripts/verify/${suite}.mjs itself differs from ${ref} — the CURRENT check was run against the BASELINE code,`,
    )
    lines.push('      so a "real regression" here can also mean the check is new or was tightened, not that the product broke.')
  }
  if (infraChanged.length) {
    lines.push(`      NOTE: the harness/dependencies moved since ${ref} (${infraChanged.join(', ')}) — the baseline checkout runs`)
    lines.push('      against the CURRENT node_modules and the current shared boot helpers; treat the verdict as advisory.')
  }
  if (note) lines.push(`      ${note}`)
  lines.push('      The baseline run is EVIDENCE, not a verdict: read the failing check before acting on it.')
  return lines
}
