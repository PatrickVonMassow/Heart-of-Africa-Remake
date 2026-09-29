import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readRecord } from './run-record.mjs'
import { DEV_SUITES, SERVERLESS_SUITES, laneFor, parseArgs, selectBackend, suitesFor } from './tiers.mjs'
import { isCrashedRun, isIncompleteRecording, isRenderPath, owned } from '../render-verify-core.mjs'
import { isProseOnlyPath } from '../pre-push-gate-core.mjs'

// These controls stay out of the environment key: VERIFY_GL is matched on its
// own as the receipt's backend, and the other two do not change the tested
// behavior. All other VERIFY_ settings (seed, retry marker, load policy, etc.)
// must agree with the receipt.
export function cacheEnvironment(env = process.env) {
  const controls = new Set(['VERIFY_GL', 'VERIFY_LOG_DIR', 'VERIFY_NO_WAIT'])
  return JSON.stringify(Object.entries(env).filter(([key]) => key.startsWith('VERIFY_') && !controls.has(key))
    .sort(([a], [b]) => a.localeCompare(b)))
}

export function cleanWorktree(cwd) {
  try {
    return execFileSync('git', ['status', '--porcelain'], {
      cwd, encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() === ''
  } catch {
    return false
  }
}

/** Reuse only the requested suite/section, never promote a partial to coverage.
 * Backend and extra flags must also match; --again always asks for fresh work.
 * Only a tree recorded as clean can be identified by HEAD and serve a cached run. */
export function lastGreenReceipt({ records, argv, head, verifyGl, environment = '[]', again = false, clean = true }) {
  const wanted = parseArgs(argv)
  if (again || !clean || !head || wanted.tier || wanted.filter.length !== 1 || wanted.section === '') return null
  const flags = (args) => parseArgs(args).flags.filter((f) => !f.startsWith('--section')).sort().join('\0')
  let best = null
  for (const entry of records) {
    const r = entry.record
    if (!r || !Array.isArray(r.args) || r.head !== head || r.cleanAtStart !== true ||
      r.status !== 'finished' || r.exitCode !== 0 || r.receipt?.exitCode !== 0 || r.receipt.green !== true ||
      (r.cacheEnvironment ?? '[]') !== environment ||
      !Number.isFinite(r.finishedAt)) continue
    const shape = parseArgs(r.args)
    if (shape.tier || shape.filter.length !== 1 || shape.filter[0] !== wanted.filter[0] ||
      shape.section !== wanted.section || flags(r.args) !== flags(argv) ||
      selectBackend(r.verifyGl ?? undefined) !== selectBackend(verifyGl)) continue
    if (!best || r.finishedAt > best.record.finishedAt) best = entry
  }
  return best
}

export function findGreenReceipt({ dir, ...request }) {
  if (request.again || !request.clean) return null
  let names
  try { names = readdirSync(dir) } catch { return null }
  const records = names.filter((name) => name.endsWith('.run.json')).map((name) => {
    const path = join(dir, name)
    return { path, record: readRecord(path) }
  })
  return lastGreenReceipt({ ...request, records })
}

export function formatCachedGreen(entry, now = Date.now()) {
  return `already green ${Math.max(0, Math.floor((now - entry.record.finishedAt) / 60_000))} min ago, receipt ${entry.path}`
}

// ── RE-JUDGING A LARGE RECEIPT ACROSS A RENDER-NEUTRAL DIFF ────────────────
// User 28.09.2026: "Warum muss die gesamte Regression von vorne laufen, wenn
// bestimmte Teil bereits erfolgreich durchgetestet wurden?" A finished LARGE
// receipt whose HEAD differs from today's only by render-neutral commits is
// re-judged per backend against TODAY's charge ledger instead of discarded;
// only the backends it does not cover run again (pinned VERIFY_GL).
// Owner decision recorded on the board 29.09.2026 fixes the three choices below.

/** The spec's own neutral set, narrowed by the render classifier. Anything
 *  else — src/, public/, package or lockfile, vite/runner config, the verify
 *  suites, an unknown path — is NOT neutral and the receipt is not re-judged. */
export function isNeutralPath(path) {
  const p = String(path ?? '').replace(/\\/g, '/')
  if (!p || isRenderPath(p)) return false
  return p === 'scripts/render-verify-charges.mjs' || p.endsWith('.md') ||
    /^scripts\/.+\.test\.mjs$/.test(p) || isProseOnlyPath(p)
}

/** Is the whole diff neutral, and does it touch prose the `docs` suite reads? */
export function neutralDiff(paths) {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : null
  if (!list) return { neutral: false, docs: false, blocking: [] }
  const blocking = list.filter((p) => !isNeutralPath(p))
  return { neutral: blocking.length === 0, docs: list.some((p) => String(p).endsWith('.md')), blocking }
}

/** The per-suite records a LARGE run wrote, copied into its receipt at close:
 *  the render-verify state keeps only the last runs, fewer than one LARGE. */
export function snapshotSuiteRuns(runs, { head, startedAt, finishedAt }) {
  if (!Array.isArray(runs) || !head) return []
  return runs.filter((r) => r && typeof r.head === 'string' && r.head.startsWith(head) &&
    r.partial !== true && Number.isFinite(r.startedAt) && r.startedAt >= startedAt &&
    (!Number.isFinite(finishedAt) || (Number.isFinite(r.at) && r.at <= finishedAt)))
}

/** The backends a LARGE-equivalent command runs: unpinned both, pinned one. */
export function largeBackends(verifyGl) {
  return verifyGl === null || verifyGl === undefined ? ['webgl', 'webgpu'] : [selectBackend(verifyGl)]
}

/** The recorded browser suites a pass on `backend` owes one record each. */
function expectedSuites(backend) {
  return suitesFor({ tier: 'large', backend }).filter((s) => !SERVERLESS_SUITES.includes(s) && laneFor(s, backend) === backend)
}

/**
 * One backend of one receipt, re-judged. Every expected suite needs exactly one
 * record passing run-all's completeness test (asserted, terminal verdict, not
 * crashed, not truncated) and no retry; a red suite covers only when TODAY's
 * ledger (`owned`) charges every red to an open point. Anything missing or
 * incomplete leaves the backend to rerun. Total.
 */
export function rejudgeBackend(record, backend, { openPoints = [], ledger } = {}) {
  const runs = Array.isArray(record?.suiteRuns) ? record.suiteRuns : null
  if (!runs) return { covered: false, reason: 'the receipt holds no suite records (written before re-judging existed)' }
  for (const suite of expectedSuites(backend)) {
    const mine = runs.filter((r) => r?.suite === suite && r.backend === backend)
    if (mine.length !== 1) return { covered: false, reason: `${suite} has ${mine.length} records on ${backend}` }
    const r = mine[0]
    const complete = r.asserted === true && r.terminalVerdict === true && !isCrashedRun(r) && !isIncompleteRecording(r)
    if (!complete) return { covered: false, reason: `the ${suite} record on ${backend} is incomplete, so no charge may be accepted for it` }
    if (r.suspect === true) return { covered: false, reason: `${suite} on ${backend} passed only on the retry` }
    // Reds are judged whatever the exit code: an exit-zero record carrying an
    // unowned red is not clean.
    const reds = Array.isArray(r.reds) ? r.reds : []
    const loose = reds.filter((red) => !owned(red, suite, backend, r.featureLevel ?? null, openPoints, ledger))
    if ((r.exit !== 0 && reds.length === 0) || loose.length) {
      return { covered: false, reason: `${suite} on ${backend} holds a red no open point owns${loose[0]?.name ? `: "${loose[0].name}"` : ''}` }
    }
  }
  return { covered: true, reason: '' }
}

/** A finished, clean-tree, unfiltered LARGE whose failures are all browser suites. */
function rejudgeable(record, environment) {
  if (!record || record.status !== 'finished' || record.cleanAtStart !== true || !record.head ||
    !Number.isFinite(record.finishedAt) || (record.cacheEnvironment ?? '[]') !== environment) return false
  const shape = parseArgs(Array.isArray(record.args) ? record.args : [])
  if (!shape.isLargeEquivalent || shape.filter.length || shape.section !== null || shape.flags.length) return false
  const browser = new Set(DEV_SUITES.filter((s) => !SERVERLESS_SUITES.includes(s)))
  const failing = Array.isArray(record.receipt?.failing) ? record.receipt.failing : null
  return !!failing && failing.every((f) => browser.has(f?.name))
}

/**
 * Which backends of a LARGE request are already covered on `head`.
 * `diffFor(receiptHead)` answers the changed paths receiptHead..head, or null
 * when receiptHead is no ancestor of head. Returns per backend the newest
 * covering receipt, the backends still to run, and whether a changed `*.md`
 * makes the `docs` suite run fresh. Total.
 */
export function rejudgeLarge({ records, argv, head, verifyGl, environment = '[]', again = false, clean = true, diffFor, openPoints, ledger }) {
  const none = { covered: [], missing: [], docs: false }
  const shape = parseArgs(argv ?? [])
  if (again || !clean || !head || !shape.isLargeEquivalent || shape.filter.length || shape.section !== null || shape.flags.length) return none
  const wanted = largeBackends(verifyGl)
  const covered = []
  let docs = false
  const sorted = [...(records ?? [])].filter((e) => rejudgeable(e?.record, environment))
    .sort((a, b) => b.record.finishedAt - a.record.finishedAt)
  const diffs = new Map()
  for (const backend of wanted) {
    for (const entry of sorted) {
      const r = entry.record
      if (!largeBackends(r.verifyGl).includes(backend)) continue
      if (!diffs.has(r.head)) {
        let paths = null
        try { paths = head.startsWith(r.head) || r.head.startsWith(head) ? [] : diffFor(r.head) } catch { paths = null }
        diffs.set(r.head, neutralDiff(paths))
      }
      const diff = diffs.get(r.head)
      if (!diff.neutral) continue
      if (!rejudgeBackend(r, backend, { openPoints, ledger }).covered) continue
      covered.push({ backend, entry, range: `${r.head}..${head}` })
      docs ||= diff.docs
      break
    }
  }
  const missing = wanted.filter((b) => !covered.some((c) => c.backend === b))
  return { covered, missing, docs }
}

/** A NUL-separated `git diff --name-only -z` list as paths. */
export function parseNameList(output) {
  return String(output ?? '').split('\0').filter(Boolean)
}

/** The git answer `rejudgeLarge` needs: changed paths old..HEAD, or null. */
export function neutralDiffReader(cwd) {
  const git = (args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  })
  return (old) => {
    try {
      git(['merge-base', '--is-ancestor', old, 'HEAD'])
      // --no-renames: a rename lists BOTH its source and its destination, so a
      // move out of src/ into docs/ is judged by the code it deleted too.
      return parseNameList(git(['diff', '--name-only', '--no-renames', '-z', old, 'HEAD']))
    } catch {
      return null
    }
  }
}

/** One line per re-judged backend, naming the receipt and the neutral range. */
export function formatRejudged(result, display = (p) => p) {
  return result.covered.map(({ backend, entry, range }) =>
    `re-judged receipt ${display(entry.path)} covers ${backend} on this HEAD — neutral diff ${range}`)
}
