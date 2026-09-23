// Full regression runner (CLAUDE.md §7.2): starts the dev server, runs every
// headless verify suite against it, then builds and runs the production-preview
// smoke test. Exits non-zero if any suite fails or logs a console error.
//
//   npm test            # the whole (LARGE) regression
//   npm run test:small  # Vitest + the SMALL everyday browser gate (no preview)
//   npm run test:large  # Vitest + every browser suite + preview (== npm test)
//   npm test -- flow    # only the named suite(s), dev server managed for you
//   npm test -- enrichments --section=<name>   # ONE declared section (point 566)
// The tier split (point 173) and the backend map (points 184/204) live in
// ./tiers.mjs; see the note below and scripts/verify/README.md.
//
// Requires the dev dependencies installed (Playwright + Chromium).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { killTree, launchServer } from './_server.mjs'
import {
  allChecks, checkFromName, clearInheritedBaselineLane, consoleErrorChecks, countCheckLines, failedChecks, parseCheckLines,
} from './baseline-classify-core.mjs'
import {
  LEVEL, annotateResult, annotateStageFailure, decideRun, formatLoadReport, onLoadMode,
} from './machine-load-core.mjs'
import { readMachine } from './machine-load.mjs'
import {
  RETRY_ENV, chargeablePoints, chargeFor, isCrashedRun,
  isIncompleteRecording, owned, runIdentity,
} from '../render-verify-core.mjs'
import { readRenderState } from '../render-verify-state.mjs'
import { readTasksAll } from '../tasks-source.mjs'
import { backendProbeDetail, gpuBackendVerdict } from './gpu-backend-probe-core.mjs'
import { probeGpuBackends } from './gpu-backend-probe.mjs'
import {
  DEV_SUITES, laneFor, needsDevServer, needsGpuBackendProbe, parseArgs, planBackends,
  selectBackend, skippedSuites, suitesFor,
} from './tiers.mjs'
import { LADDER_STATUS, formatLadderRefusal } from './ladder-core.mjs'
import { ladderCheck } from './ladder.mjs'
import { SECTION_ENV, listSections, planSectionRun, resolveSelection } from './sections.mjs'
import { isSectionName, sectionTag } from '../section-tag-core.mjs'
import { readFileSync } from 'node:fs'
import { EXIT_NOT_HELD, formatOwnershipVerdict, wantsBaseline } from './red-ownership-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const chargedPoints = new Set()

/** EVERY `console errors: <n>` line the output carries, not the first (point
 *  1135, cross-vendor review round 5): a suite printing `0` for one page and
 *  `1` for the next was read as clean by a first-match regex. The tally is the
 *  LARGEST reading, so a later zero cannot erase an earlier red. */
function countedConsoleErrors(out) {
  let most = 0
  for (const m of String(out ?? '').matchAll(/console errors: (\d+)/gi)) most = Math.max(most, Number(m[1]))
  return most
}

// A REGRESSION PASS IS NEVER THE BASELINE LANE. Dropped from this process's own
// environment, so no child — suite, retry, cross-browser check or Vitest — can
// inherit a stale marker and stand a block down where a missing capability IS
// the regression. Only baseline-classify.mjs writes the marker, on the suites it
// spawns itself.
clearInheritedBaselineLane(process.env)

// Hybrid test architecture: the fast, deterministic Vitest layer (jsdom, no
// browser) runs first (`unit` stage below) and covers all pure logic, store
// transitions and HTML-HUD component classes/text. Only the checks that
// genuinely need a real browser remain here as Playwright suites against the
// dev server (on an auto-assigned free port, never the default :5173, so a
// manual `npm run dev` never collides): the R3F/three scene + RAF wildlife, real layout geometry,
// canvas/WebGL init, pointer-lock, TTS audio, the §7.2 acceptance screenshots
// and one end-to-end core flow. `docs` is a pure Node check that runs in the
// same pass for a single report. See scripts/verify/README.md for the full
// old→new mapping table.
//
// Regression tiers (point 173) and the backend dimension (points 184/204) are
// the pure decision layer in ./tiers.mjs (Vitest-pinned in tiers.test.mjs):
// DEV_SUITES (the LARGE set), SMALL_SUITES (the fast everyday gate),
// WEBGL_ONLY_SUITES (touch/voice — the documented headless-WebGPU exception,
// ROUTED to WebGL 2 rather than dropped since point 571), DEFAULT_BACKEND (the
// everyday lane, WebGPU) and the arg/backend planning below. Pick per task:
//   npm run test:small   # Vitest + the small browser gate (no prod preview), WebGPU
//   npm run test:large   # Vitest + every browser suite + preview, BOTH backends
//   npm test             # the full LARGE regression (default) — same
//   npm test -- flow …   # just the named suite(s); dev server managed, no preflight
// The closing cycle ALWAYS runs LARGE.
// VERIFY_GL selects the renderer the suites launch (mirrored from _browser.mjs).
// Since point 571 the default is WEBGPU — the player's backend is the everyday
// lane, WebGL 2 the regression lane every LARGE run covers. It is pinned PER SUITE
// below (laneFor), so touch/voice keep their WebGL 2 lane wherever they are picked.
const VERIFY_GL = selectBackend(process.env.VERIFY_GL)
// Set by the parent on the WebGPU pass of a both-backends LARGE run: its companion
// WebGL 2 pass already ran the WebGL2-only suites, so this pass drops them instead
// of repeating them.
const WEBGL_ONLY_COVERED = process.env.RVA_WEBGL_COVERED === '1'

const args = process.argv.slice(2)
const { tier, filter, flags, fullRun, isLargeEquivalent, baseline, section } = parseArgs(args)
const wantBaseline = wantsBaseline({ isLargeEquivalent, baseline, env: process.env })

// THE VERIFICATION LADDER (point 1086), asked HERE because this is the
// ENTRYPOINT. run-logged.mjs wraps this file and asks it too, but the README
// documents `node scripts/verify/run-all.mjs <suite>` as an ordinary command
// and that path answered to nothing — the refusal the point owes was absent
// from the very command the house uses, and the LARGE run of 11.09.2026 was
// started through it (four-eyes review, GPT-6 Astra, pass 3/4).
//
// ASKED ONCE PER RUN. A parent that already asked sets the marker, so a waiver
// granted above — `--no-ladder "<why>"`, which run-logged consumes and does not
// forward — is not overruled down here. The backend re-exec below inherits the
// marker with the rest of the environment, so the second pass of a both-backend
// run does not ask again either.
if (process.env.RVA_LADDER_ASKED !== '1') {
  const verdict = ladderCheck({ argv: args, verifyGl: process.env.VERIFY_GL })
  if (!verdict.ok) {
    console.log(formatLadderRefusal(verdict))
    process.exit(1)
  }
  if (verdict.status === LADDER_STATUS.WAIVED_NON_PREDICTIVE) {
    console.log(`# ladder waived (${verdict.status}) — ${verdict.reason}`)
  }
  process.env.RVA_LADDER_ASKED = '1'
}

// Run ONE declared section of ONE suite (point 566) — the repair loop, where a
// check that needed fixing used to cost the whole 17-minute pass. Validated HERE,
// before anything is built or booted, from the suite's own source: an unknown
// name must cost a tenth of a second and name the sections that exist, never a
// browser boot that then asserts nothing and exits 0.
if (section !== null) {
  const die = (msg) => {
    console.log(msg)
    process.exit(1)
  }
  const plan = planSectionRun({ tier, filter, section, knownSuites: DEV_SUITES })
  if (!plan.ok) die(plan.message)
  const suite = plan.suite
  let source = ''
  try {
    source = readFileSync(join(HERE, `${suite}.mjs`), 'utf8')
  } catch {
    die(`--section: cannot read scripts/verify/${suite}.mjs`)
  }
  const verdict = resolveSelection({ sections: listSections(source), requested: section, suite })
  if (!verdict.ok) die(verdict.message)
  // The suites read it from the env; the run recorder stamps the record PARTIAL
  // from the same variable, which is what stops it counting as backend coverage.
  process.env[SECTION_ENV] = section
  console.log(`# PARTIAL: only section "${section}" of ${suite} — NOT suite coverage (point 566)`)
} else {
  // A leftover from an earlier partial run in this shell would silently narrow a
  // full regression to one section. A run that did not ASK for one runs whole.
  delete process.env[SECTION_ENV]
}

// point 204(b): a bare LARGE run (`npm test` / `npm run test:large`) covers BOTH
// renderer backends in one command — it re-invokes itself once per planned pass.
// An explicit VERIFY_GL (the gate's per-backend clear command), the SMALL tier,
// or a bare single-suite filter stays a single-backend pass, as before.
const backendPlan = planBackends({
  isLargeEquivalent,
  verifyGl: process.env.VERIFY_GL,
  ranBoth: process.env.RVA_RAN_BOTH === '1',
})
if (backendPlan.length > 0) {
  const self = fileURLToPath(import.meta.url)
  const runBackend = (pass) =>
    spawnSync(process.execPath, [self, ...args], {
      windowsHide: true,
      cwd: join(HERE, '..', '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        RVA_RAN_BOTH: '1',
        VERIFY_GL: pass.backend,
        ...(pass.skipPreflight ? { RVA_SKIP_PREFLIGHT: '1' } : {}),
        ...(pass.webglOnlyCovered ? { RVA_WEBGL_COVERED: '1' } : {}),
      },
    }).status ?? 1
  // A RED THAT DOES NOT HOLD DOES NOT STOP THE SEQUENCE (point 1135). A pass
  // that ends "own or unresolved: none; regression verdict unchanged" has
  // already said its reds belong elsewhere, and stopping there cost the run the
  // OTHER backend entirely — CLAUDE.md §5 asks for both once per bundle and at
  // the closing, and while any pre-existing red stood that was unreachable.
  // So the sequence runs on and the run FAILS AT ITS END. A red that DOES hold
  // still stops it: there is nothing to learn from a second backend about a
  // defect the first one has already pinned on this change.
  const notHeld = []
  for (const [i, pass] of backendPlan.entries()) {
    const label = pass.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'
    const shape = pass.skipPreflight
      ? 'render suites; preflight/preview already proven'
      : 'full, with preflight'
    console.log(`\n===== LARGE regression — backend ${i + 1}/${backendPlan.length}: ${label} (${shape}) =====`)
    const status = runBackend(pass)
    if (status === EXIT_NOT_HELD) {
      notHeld.push(label)
      console.log(
        `\nThe ${label} pass is RED, and its own accounting charges every red elsewhere — regression verdict unchanged. ` +
          'Continuing to the remaining backend(s); this run fails at its END (point 1135).',
      )
      continue
    }
    if (status !== 0) {
      console.log(`\nLARGE FAILED on the ${label} backend — a red that HOLDS; not proceeding to the remaining backend(s).`)
      process.exit(status)
    }
  }
  if (notHeld.length > 0) {
    console.log(`\nLARGE FAILED AT ITS END — red on ${notHeld.join(' and ')}, every red charged elsewhere. Every planned backend ran; none was skipped.`)
    process.exit(EXIT_NOT_HELD)
  }
  process.exit(0)
}
// On the second (WebGPU) pass of a both-backend LARGE run, the backend-agnostic
// preflight (build/lint/unit) and the prod preview were already proven on the
// first pass — skip them and run only the render browser suites.
const skipPreflight = process.env.RVA_SKIP_PREFLIGHT === '1'

// Is the machine QUIET enough for this run's verdict to be evidence (point 296)?
// The other half of the point-294 triage, and the half today's damage came from:
// `enrichments` was judged "a real failure, not a flake" while a unit run and two
// agents shared the machine (the same suite was green on a quiet one), and a unit
// run produced four "Test timed out in 5000ms" failures because a dev server from
// an earlier verify run had never been shut down. So the machine is read BEFORE
// the run: a leftover is named with the command that ends it, and a timing
// verdict taken under load is labelled rather than reported as a plain red.
// Default `flag` (never blocks); `--on-load=defer` / VERIFY_ON_LOAD=defer skips
// such a run outright, `off` disables the check. Probed once here, before the
// minutes of build/lint the preflight costs.
const loadMode = onLoadMode({ flags, env: process.env.VERIFY_ON_LOAD })
let machine = { level: LEVEL.unknown, strays: [] }
if (loadMode !== 'off') {
  machine = await readMachine()
  const plannedSuites = suitesFor({ tier, filter, backend: VERIFY_GL, webglOnlyCovered: WEBGL_ONLY_COVERED })
  const decision = decideRun({ suites: plannedSuites, level: machine.level, mode: loadMode })
  for (const line of formatLoadReport({ load: machine, decision, mode: loadMode })) console.log(line)
  if (decision.action === 'defer') {
    console.log(`\nDEFERRED — not run (exit ${decision.exitCode}). Nothing failed; nothing was proven either.`)
    process.exit(decision.exitCode)
  }
}

// Per-suite wall timeout (point 249): a GENEROUS backstop so a genuinely hung
// suite (a frozen renderer, a dead server) is killed and reported rather than
// hanging the whole regression forever — but high enough that a slow-but-green
// run (the staged-drama suites poll until state on a slow WebGPU backend) is
// NEVER killed for merely being slow. Configurable via VERIFY_SUITE_TIMEOUT_MS.
const SUITE_TIMEOUT_MS = Number(process.env.VERIFY_SUITE_TIMEOUT_MS) || 45 * 60 * 1000
/** ONE PASS OF ONE SUITE. Since point 1135 the runner makes no second attempt
 *  of its own: `RETRY_ENV` is written BLANK so a stale export in the calling
 *  shell cannot stamp this first attempt SUSPECT, and a HAND retry of the
 *  smallest affected check stays the diagnosis (CLAUDE.md §7.2). */
function runSuite(name, baseUrl, onlySection = '') {
  const before = readRenderState()?.runs
  const previous = new Set((Array.isArray(before) ? before : []).map(runIdentity))
  const startedAt = Date.now()
  // SAY WHICH SUITE IS RUNNING, BEFORE IT RUNS (point 1137). `spawnSync` captures
  // the suite's whole output, so the result line below is the FIRST thing the log
  // learns about a suite - and a 55-minute `polish` therefore left the log
  // standing at `# starting dev server` for its entire length. Twice on
  // 15.09.2026 a reader took that silence for a hang and ended a healthy run.
  console.log(`# → ${name}${onlySection ? ` [--section=${onlySection}]` : ''} running — its PASS/FAIL line arrives when the suite ENDS`)
  const res = spawnSync(process.execPath, [join(HERE, `${name}.mjs`)], {
    windowsHide: true,
    encoding: 'utf8',
    // The suites read BASE_URL (default :5173/:4173); pass the actual server
    // URL so they hit the regression's own server, not a manual dev server.
    // VERIFY_GL is pinned PER SUITE (point 571): the pass's backend for all but
    // the WebGL2-only ones, which are routed to WebGL 2 rather than dropped — so
    // each suite's own run record names the backend it really opened.
    env: {
      ...process.env,
      ...(baseUrl ? { BASE_URL: baseUrl } : {}),
      [RETRY_ENV]: '',
      // ONE BLOCK OF THE SUITE, for a diagnosis run that needs no more (point
      // 1126). Blank restores whatever the pass itself selected, so a normal
      // spawn is untouched; the suite's own gate stamps the record PARTIAL.
      ...(onlySection ? { [SECTION_ENV]: onlySection } : {}),
      VERIFY_GL: laneFor(name, VERIFY_GL),
    },
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })
  if (res.error && res.error.code === 'ETIMEDOUT') {
    console.log(`FAIL  ${name.padEnd(12)} — KILLED after ${Math.round(SUITE_TIMEOUT_MS / 60000)} min wall timeout (hung, not slow — raise VERIFY_SUITE_TIMEOUT_MS if this was a genuine slow-green run)`)
    return { ok: false, out: '', unresolved: true, allOwned: false, points: [], partial: false, rows: [], stale: [] }
  }
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  // COUNT THE RESULT LINES BY THE RULE THAT KNOWS THEM (`CHECK_LINE`), not by a
  // bare `^FAIL` prefix: flow.mjs closes with `FAILURES: <n>`, which a prefix
  // match counts as a failing check nobody can name.
  const { pass, fail } = countCheckLines(out)
  const consoleErrors = countedConsoleErrors(out)
  const ok = res.status === 0 && fail === 0 && consoleErrors === 0
  // A narrowed spawn says so on its own result line: a reader who sees only the
  // headline must never mistake one block's tally for the suite's (point 1126).
  const scope = onlySection ? ` [--section=${onlySection}]` : ''
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(12)}${scope} ${pass} pass, ${fail} fail, ${consoleErrors} console-errors (exit ${res.status})`)
  // A NON-PREDICTIVE PASS MUST BE SEEN (point 1086). Only the summary above
  // leaves this child, so a marker sitting on a passing line would die here —
  // and a green that does not mean what it looks like is exactly the thing a
  // reader must not miss. Lifted out as a CONCLUSION about the headline, the
  // same class as the PARTIAL banner.
  // A NOT-COVERING CHECK MUST BE SEEN FOR THE SAME REASON (work-order 1136):
  // it is counted as neither a pass nor a failure, so the headline above is
  // silent about it, and a question the run left OPEN must not read as green.
  for (const line of out.split('\n')) {
    if (line.includes('[NON-PREDICTIVE')) console.log(`NON-PREDICTIVE  ${name.padEnd(12)} ${line.trim()}`)
    else if (/^NOT-COVERING\s{2,}/.test(line)) console.log(`NOT-COVERING  ${name.padEnd(12)} ${line.trim().slice('NOT-COVERING'.length).trim()}`)
  }
  if (!ok) {
    for (const line of out.split('\n')) if (/^FAIL\s{2,}\S|^ERR:/.test(line)) console.log('      ' + line)
    // A non-zero exit without any FAIL line is a CRASH (uncaught exception,
    // timeout throw): echo the tail so the cause is not swallowed.
    if (res.status !== 0 && fail === 0) {
      for (const line of out.split('\n').filter((l) => l.trim()).slice(-12)) console.log('      | ' + line)
    }
  }
  // Read the child's own complete record: output parsing alone loses feature
  // level, capture cuts and repeated identities with different measurements.
  // Never borrow a previous or concurrent run's charges to skip this attempt.
  const finishedAt = Date.now()
  const after = readRenderState()?.runs
  const fresh = (Array.isArray(after) ? after : []).filter((r) =>
    r?.suite === name && r.backend === laneFor(name, VERIFY_GL) &&
    r.startedAt >= startedAt && r.startedAt <= r.at && r.at <= finishedAt && !previous.has(runIdentity(r)),
  )
  const record = fresh.length === 1 && !res.error && !res.signal ? fresh[0] : null
  const openPoints = new Set(chargeablePoints(readTasksAll()))
  const complete = record && record.exit === res.status && record.asserted === true &&
    record.terminalVerdict === true && !isCrashedRun(record) && !isIncompleteRecording(record)
  const recordedReds = Array.isArray(record?.reds) ? record.reds : []
  const reds = complete ? recordedReds : []
  const ownedReds = reds.filter((red) => owned(red, name, record.backend, record.featureLevel, openPoints))
  const points = [...new Set(ownedReds.map((red) => openPoints.has(red.point)
    ? red.point
    : chargeFor(red, { suite: name, backend: record.backend, featureLevel: record.featureLevel }).point,
  ))].sort((a, b) => a - b)
  for (const point of points) chargedPoints.add(point)
  // THE CLASSIFICATION THIS RUN MAKES, AND SINCE POINT 1135 THE ONLY ONE IT
  // MAKES. The automatic baseline passes are gone; the charge ledger
  // (scripts/render-verify-charges.mjs) IS the classified baseline — one entry
  // per check, each naming the OPEN point that owns it and carrying the date it
  // was measured in its own `why`. A red the ledger names is charged elsewhere;
  // a red it does not name holds, and no second pass is spent asking.
  const pointOf = (red) => (openPoints.has(red.point)
    ? red.point
    : chargeFor(red, { suite: name, backend: record.backend, featureLevel: record.featureLevel })?.point ?? null)
  const ownedSet = new Set(ownedReds)
  // THE PRINTED LINES ARE READ WITHOUT A SECTION TAG, as the recorder stores
  // them (`separateResultSection`). Suites tag their lines in whole runs too,
  // and a check without a detail carries the tag inside its NAME, so read raw,
  // one red arrived twice: keyed by the record, and keyed with the tag by the
  // output. Only a tag of a section the suite declares is stripped.
  const declared = new Set([onlySection, process.env[SECTION_ENV]])
  try {
    for (const n of listSections(readFileSync(join(HERE, `${name}.mjs`), 'utf8'))) declared.add(n)
  } catch { /* an unreadable suite source strips the live section's tag only */ }
  const tags = [...declared].filter(isSectionName).map(sectionTag)
  const judged = tags.length === 0 ? out : out.split('\n').map((line) => {
    const tag = tags.find((t) => line.endsWith(t))
    return tag ? line.slice(0, -tag.length) : line
  }).join('\n')
  const printed = failedChecks(judged)
  // A RECORD ENTRY MAY CARRY NO KEY — older records and hand-written ones name
  // the check and nothing else. Deriving it from the name is what every other
  // reader of this ledger does, and without it the same red arrives twice: once
  // keyed `undefined` from the record, once keyed properly from the output.
  const keyOf = (red) => red.key ?? checkFromName(red.name).key
  // EVERY OCCURRENCE THE RUN PRODUCED, recorded AND printed, undeduplicated.
  // `failedChecks` folds repeats away by key and the key folds the measurement
  // away, so a printed second reading of a charged check — a DIFFERENT
  // measurement under the same name — was invisible here while a `detailMatch`
  // charge reads exactly that measurement (Astra, round 5).
  const printedOccurrences = [
    ...parseCheckLines(judged).filter((c) => c.status === 'FAIL'),
    ...consoleErrorChecks(judged),
  ]
  const ownedPrinted = (check) => complete &&
    owned({ name: check.name, key: check.key, kind: check.kind ?? 'check', detail: check.detail },
      name, record.backend, record.featureLevel, openPoints)
  const recordedKeys = new Set(recordedReds.map(keyOf))
  const underKey = new Map()
  const add = (key, entry) => {
    const list = underKey.get(key) ?? []
    list.push(entry)
    underKey.set(key, list)
  }
  // A reading is a red's name and its measurement, as the reason text quotes it.
  const readingOf = (red) => `"${red.name}${red.detail ? ` — ${red.detail}` : ''}"`
  for (const red of reds) {
    add(keyOf(red), { recorded: true, reading: readingOf(red), owned: ownedSet.has(red), point: () => pointOf(red) })
  }
  for (const check of printedOccurrences) {
    add(check.key, {
      recorded: false,
      reading: readingOf(check),
      owned: ownedPrinted(check),
      point: () => chargeFor(check, { suite: name, backend: record?.backend, featureLevel: record?.featureLevel })?.point ?? null,
    })
  }
  const row = ({ key, name: check, fromRecord }) => {
    // EVERY RECORDED OCCURRENCE, NOT THE FIRST OWNED ONE. The key folds the
    // measurement out of a check's identity while a `detailMatch` charge reads
    // exactly that measurement, so two reds under one key can differ in
    // ownership. One of them being charged says nothing about the other.
    const occurrences = underKey.get(key) ?? []
    const recorded = occurrences.filter((entry) => entry.recorded)
    // A CHARGE RESTS ON THE RECORD. A printed reading the record does not carry
    // is a disagreement between the two: it charges nothing, and it may not
    // deny what the record's own reds earn — the record marks a measurement
    // that varied within the run (`markVariedDetails`) itself. The disagreement
    // is NAMED instead, with the reading, so it can be acted on.
    const charged = recordedKeys.has(key) && recorded.length > 0 && recorded.every((entry) => entry.owned)
    const point = charged ? recorded[0].point() : null
    const printedUnowned = occurrences.filter((entry) => !entry.recorded && !entry.owned).map((entry) => entry.reading)
    const recordedUnowned = recorded.filter((entry) => !entry.owned).map((entry) => entry.reading)
    const printedReadings = occurrences.filter((entry) => !entry.recorded).map((entry) => entry.reading)
    return {
      suite: name,
      check,
      key,
      point,
      elsewhere: charged,
      title: charged
        ? `point ${point} — ${check}${printedUnowned.length
          ? ` (the suite also printed ${printedUnowned.join(', ')}, which the record does not carry and no charge owns)`
          : ''}`
        : '',
      reason: charged
        ? `charged to open point ${point}`
        : !complete
          ? 'the run record is incomplete, so no charge may be accepted for it — ownership unresolved'
          : !fromRecord
            ? `printed by the suite as ${printedReadings.join(', ') || `"${check}"`} but carried by no record entry, and a charge rests on the record — ownership unresolved`
            : recorded.some((entry) => entry.owned)
              ? `charged for one reading of this check but not for ${recordedUnowned.join(', ')}`
              : 'not in the classified baseline — no open point owns it',
    }
  }
  const rows = []
  const seenRows = new Set()
  // EVERY RED THE RECORD CARRIES, complete or not. An incomplete record charges
  // nothing — `ownedSet` is empty then — so its reds arrive here holding, which
  // is the only honest reading of a measurement that did not finish.
  for (const red of recordedReds) {
    const key = keyOf(red)
    if (seenRows.has(key)) continue
    seenRows.add(key)
    rows.push(row({ key, name: red.name, fromRecord: true }))
  }
  for (const check of printed) {
    if (seenRows.has(check.key)) continue
    seenRows.add(check.key)
    rows.push(row({ key: check.key, name: check.name, fromRecord: false }))
  }
  // A NAMELESS CONSOLE RED CAN BORROW NOBODY'S OWNERSHIP (Astra, round 5).
  // `console errors: <n>` without the texts builds no identity, so it appeared in
  // no row at all — and a pass whose only NAMED red was charged then reported
  // that nothing held. A charge names a check; a number names none.
  const namedConsoleReds = rows.filter((r) => /^console error:/i.test(String(r.check))).length
  if (consoleErrors > namedConsoleReds) {
    const nameless = consoleErrors - namedConsoleReds
    rows.push({
      suite: name,
      check: `${nameless} console error(s) reported only as a COUNT`,
      key: `${name}:console-count`,
      point: null,
      elsewhere: false,
      title: '',
      reason: 'a number carries no identity, so no ledger entry can own it — read the log for the texts',
    })
  }
  // AN ENTRY THAT HAS GONE GREEN IS STRUCK (point 1135). A charge is a named
  // defect, not a standing exemption, so the pass that sees the check PASS says
  // so and names the file to strike it from. Reported, never rewritten here: the
  // ledger is source, and a run that edits its own tree would dirty a landing.
  const redKeys = new Set([...recordedReds.map(keyOf), ...printed.map((check) => check.key)])
  const stale = complete
    ? allChecks(judged)
      .filter((c) => c.status === 'PASS' && !redKeys.has(c.key))
      .map((c) => ({ check: c.name, charge: chargeFor({ name: c.name, key: c.key, kind: 'check', detail: c.detail },
        { suite: name, backend: record.backend, featureLevel: record.featureLevel }) }))
      .filter((s) => s.charge && openPoints.has(s.charge.point))
    : []
  // ACCOUNTED FOR IS A STATEMENT ABOUT EVERY RED THIS PASS HAS, printed or
  // recorded — not about the record's half of them (Astra finding P1).
  const allOwned = rows.length > 0 && rows.every((r) => r.elsewhere)
  // A GREEN HEADLINE OVER A RECORD THAT CARRIES REDS IS NOT A GREEN.
  if (ok && rows.length > 0) {
    console.log(`FAIL  ${name.padEnd(12)} — the printed line says PASS, but this run's own record carries ${rows.length} red(s); the record decides`)
  }
  return { ok: ok && rows.length === 0, out, unresolved: !complete, allOwned, points, partial: record?.partial === true, rows, stale }
}

// ONE PASS PER SUITE (point 1135, user order 15.09.2026). The automatic flake
// retry is GONE. It was point 200's answer to a rotating staging flake, and by
// 15.09.2026 it was the larger half of a measured waste: inside ONE LARGE the
// 28-minute `polish` ran four times — first pass, flake retry, two baseline
// passes — and the retry's own question ("transient or defect?") was answered
// twice over by the charge ledger for every red that has an owner.
//
// WHAT REPLACES IT. A red STANDS and is classified against the charge ledger,
// which is the classified baseline: a red the ledger names is charged to its
// open point, a red it does not name holds the run. A confirmed flake moves
// INTO the ledger as its own entry rather than being re-rolled every pass.
// A HAND retry of the SMALLEST affected check stays allowed as diagnosis, and
// CLAUDE.md §7.2 is unchanged by this: such a retry is SUSPECT and covers
// nothing. `scripts/verify/baseline-classify.mjs <suite>` is still the tool
// that measures a red against the pre-change tree — by hand, when a red is
// actually in doubt, never automatically for every red of every LARGE.
/** Suites that stayed red, kept for the end-of-run classification below. */
const redSuites = []
function runSuiteOnce(name, baseUrl) {
  const result = runSuite(name, baseUrl)
  for (const entry of result.stale) {
    console.log(
      `STRIKE  ${name.padEnd(12)} "${entry.check}" PASSED here but is still charged to open point ` +
        `${entry.charge.point} — strike that entry from scripts/render-verify-charges.mjs (point 1135)`,
    )
  }
  if (result.ok) return true
  if (result.allOwned) {
    console.log(`${result.partial ? 'PARTIAL' : 'ACCOUNTED FOR'}  ${name} — every red is charged to open point(s) ${result.points.join(', ')}; suite stays red`)
  }
  redSuites.push({
    suite: name,
    failed: failedChecks(result.out),
    checks: allChecks(result.out).length,
    runs: 1,
    unresolved: result.unresolved,
    rows: result.rows,
  })
  return false
}

// Cross-browser functional smoke (point 213): a SHORT check on Firefox + WebKit
// whose DEPTH scales with the tier (minimal/standard/thorough) — never the whole
// suite per engine. Graceful: exit 0 if the engines aren't installed. Surfaces the
// per-engine backend (WebGPU vs WebGL2 fallback).
function runCrossBrowser(baseUrl, depth) {
  const res = spawnSync(process.execPath, [join(HERE, 'crossbrowser.mjs')], {
    windowsHide: true,
    encoding: 'utf8',
    env: { ...process.env, BASE_URL: baseUrl, CROSSBROWSER_DEPTH: depth },
  })
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  const { pass, fail } = countCheckLines(out)
  const skip = (out.match(/^SKIP/gm) ?? []).length
  // NOT THE EXIT CODE ALONE (Astra, rounds 2 and 3): the reds are already parsed
  // here, and a child that prints them and exits 0 was reported as a pass whose
  // reds nothing then owned. `failedChecks` is the right reading rather than the
  // FAIL-line count, because a console error is a red that prints no FAIL line.
  const failing = failedChecks(out)
  // A BARE COUNT IS A RED WITH NO NAME (Astra, round 4). `consoleErrorChecks`
  // deliberately ignores `console errors: <n>` without the texts — there is no
  // identity to build from a number — so a child printing the count and exiting
  // 0 had no named red and passed. `runSuite` has always read the count as well;
  // this reads it the same way.
  const countedErrors = countedConsoleErrors(out)
  const ok = res.status === 0 && failing.length === 0 && countedErrors === 0
  console.log(`${ok ? 'PASS' : 'FAIL'}  crossbrowser  ${pass} pass, ${fail} fail, ${skip} skip (${depth}, exit ${res.status})`)
  // Always surface the per-engine backend + any skips; on failure also the FAILs.
  for (const line of out.split('\n')) {
    if (/backend:|^SKIP/.test(line)) console.log('      ' + line.trim())
    else if (!ok && /^FAIL\s{2,}\S/.test(line)) console.log('      ' + line.trim())
  }
  if (!ok) redSuites.push({ suite: 'crossbrowser', failed: failing, checks: allChecks(out).length, runs: 1, depth, rows: [],
    unresolved: Boolean(res.error || res.signal) || !/^\d+ CROSS-BROWSER\/MOBILE CHECK\(S\) FAILED$/m.test(out) })
  return ok
}

const results = []

// Preflight: type-check + production build and lint must be clean before the
// suites run (CLAUDE.md §7.2). Folding these into `npm test` means a feature's
// whole verification is one already-allowed command.
if (!skipPreflight && (fullRun || filter.includes('build'))) {
  console.log('# type-check + production build…')
  const build = spawnSync('npm run build', { windowsHide: true, cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
  const buildOk = build.status === 0
  console.log(`${buildOk ? 'PASS' : 'FAIL'}  build        (tsc -b + vite build, exit ${build.status})`)
  if (!buildOk) {
    console.log((build.stdout ?? '') + (build.stderr ?? ''))
    console.log('\n1 SUITE(S) FAILED — build failed, skipping the rest')
    process.exit(1) // fail fast: no point running suites against a broken build
  }
  results.push(buildOk)
}
if (!skipPreflight && (fullRun || filter.includes('lint'))) {
  console.log('# lint (oxlint)…')
  const lint = spawnSync('npx oxlint', { windowsHide: true, cwd: join(HERE, '..', '..'), shell: true, encoding: 'utf8' })
  const out = (lint.stdout ?? '') + (lint.stderr ?? '')
  const lintOk = lint.status === 0 && !/warning|error/i.test(out)
  console.log(`${lintOk ? 'PASS' : 'FAIL'}  lint         (oxlint, exit ${lint.status})`)
  if (!lintOk) console.log(out)
  results.push(lintOk)
}

// Vitest layer (jsdom): the fast, deterministic unit + component tests that
// carry the bulk of the coverage. Type-checked first (esbuild strips types at
// runtime, so tsc guards the test files), then run. Fail fast — no point
// driving the slow browser suites if the deterministic layer is red.
if (!skipPreflight && (fullRun || filter.includes('unit'))) {
  console.log('# unit + component tests (vitest, jsdom)…')
  const root = join(HERE, '..', '..')
  const tc = spawnSync('npx tsc -p tsconfig.vitest.json --noEmit', { windowsHide: true, cwd: root, shell: true, encoding: 'utf8' })
  if (tc.status !== 0) {
    console.log('FAIL  test-types   (tsc -p tsconfig.vitest.json)')
    console.log((tc.stdout ?? '') + (tc.stderr ?? ''))
    console.log('\n1 SUITE(S) FAILED — test type-check failed, skipping the rest')
    process.exit(1)
  }
  console.log('PASS  test-types   (tsc -p tsconfig.vitest.json)')
  // NO_COLOR keeps the summary free of ANSI escapes so the count parses cleanly.
  const unit = spawnSync('npx vitest run', {
    windowsHide: true,
    cwd: root, shell: true, encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  })
  const out = (unit.stdout ?? '') + (unit.stderr ?? '')
  const unitOk = unit.status === 0
  const m = out.match(/Tests\s+(\d+) passed/)
  console.log(`${unitOk ? 'PASS' : 'FAIL'}  unit         (vitest jsdom, ${m ? m[1] : '?'} tests, exit ${unit.status})`)
  if (!unitOk) {
    console.log(out)
    console.log('\n1 SUITE(S) FAILED — vitest failed, skipping the browser suites')
    // The fail-fast path never reaches the end-of-run label, and this is exactly
    // where the 27.07. leftover dev server did its damage (four 5000 ms timeouts
    // in tests that pass in 582 ms alone) — so say it here.
    if (loadMode !== 'off') for (const line of annotateStageFailure({ stage: 'unit', ...machine })) console.log(line)
    process.exit(1) // fail fast
  }
  results.push(unitOk)
}

// Resolve the browser work once. The GPU probe below and the suite loop MUST read the
// same selection: probing an empty or different lane set would recreate the false-ready
// report this guard exists to end.
const devPick = suitesFor({ tier, filter, backend: VERIFY_GL, webglOnlyCovered: WEBGL_ONLY_COVERED })
const wantPreview = !skipPreflight && ((fullRun && tier !== 'small') || filter.includes('preview'))

// Host/browser preflight (point 732): a browser executable is not a GPU backend. Before
// Vite starts — and before any suite can wait 180 seconds for window.__renderer — open a
// bare canvas in both exact verification browsers and query Chrome's Graphics Feature
// Status through CDP. A red here is explicitly pre-app; a green hands later startup
// failures back to the app. Pure Node/docs-only selections never need a GPU.
if (needsGpuBackendProbe(devPick, { preview: wantPreview })) {
  console.log('# GPU backend preflight (bare canvas, no app)…')
  const probe = gpuBackendVerdict(await probeGpuBackends())
  console.log(`${probe.ok ? 'PASS' : 'FAIL'}  gpu-backends  ${probe.summary}`)
  for (const result of probe.results) {
    console.log(`      ${result.lane}: ${backendProbeDetail(result)}`)
  }
  if (!probe.ok) {
    console.log('\n1 SUITE(S) FAILED — host/browser GPU preflight failed, skipping the browser suites')
    process.exit(1)
  }
  results.push(true)
}

let dev
try {
  // The suites this pass runs, and the lane each one opens. A WebGL2-only suite is
  // ROUTED to WebGL 2 (point 571) rather than dropped, so the everyday gate keeps
  // `voice` now that it runs on WebGPU; it is dropped only where the companion
  // WebGL 2 pass of the same command already ran it — logged either way, never a
  // silent gap.
  for (const s of skippedSuites({ tier, filter, backend: VERIFY_GL, webglOnlyCovered: WEBGL_ONLY_COVERED })) {
    console.log(`SKIP  ${s.padEnd(12)} (WebGL2-only — already run by this command's WebGL 2 pass, point 184/571)`)
  }
  for (const s of devPick) {
    if (laneFor(s, VERIFY_GL) !== VERIFY_GL) {
      console.log(`LANE  ${s.padEnd(12)} (WebGL2-only — run on WebGL 2 inside this ${VERIFY_GL} gate, point 571)`)
    }
  }
  // Cross-browser smoke (point 213): on a FULL tier/default run (not a bare
  // single-suite filter) or when asked by name; depth scales with the tier
  // (minimal for SMALL, standard for LARGE/default). Run ONCE per command — so it
  // is skipped on the second pass of a both-backends LARGE run, whose first pass
  // already ran it. It covers the OTHER engines, which no Chromium backend changes.
  const wantCross = (fullRun || filter.includes('crossbrowser')) && !WEBGL_ONLY_COVERED
  if (devPick.length > 0 || wantCross) {
    // A pure-Node pick (`npm test -- docs`) starts no vite server at all.
    const server = needsDevServer(devPick) || wantCross
      ? await launchServer('npm run dev', 'dev', join(HERE, '..', '..'))
      : { child: null, base: undefined }
    dev = server.child
    for (const s of devPick) results.push(runSuiteOnce(s, server.base))
    if (wantCross) {
      const depth = process.env.CROSSBROWSER_DEPTH ?? (tier === 'small' ? 'minimal' : 'standard')
      results.push(runCrossBrowser(server.base, depth))
    }
  }
} finally {
  killTree(dev)
}

// Production-preview smoke test (unless a filter excludes it).
// The prod-preview smoke test runs in the LARGE/default regression, not the SMALL
// gate (the `build` step already type-checks and builds; SMALL trades the extra
// prod-runtime smoke for speed).
if (wantPreview) {
  console.log('# building for the production-preview smoke test…')
  const build = spawnSync('npm run build', { windowsHide: true, cwd: join(HERE, '..', '..'), shell: true, stdio: 'inherit' })
  if (build.status !== 0) {
    console.log('FAIL  build failed — skipping preview')
    results.push(false)
  } else {
    let preview
    try {
      const server = await launchServer('npm run preview', 'preview', join(HERE, '..', '..'))
      preview = server.child
      results.push(runSuiteOnce('preview', server.base))
    } finally {
      killTree(preview)
    }
  }
}

// THE CLASSIFICATION IS A FILE LOOKUP, NOT A SECOND SET OF PASSES (point 1135).
// Every red already carries the verdict its own run made against the charge
// ledger; all that is left here is to say it in one place. A red with no ledger
// entry HOLDS — that is the whole gate, and it costs no machine minutes.
let ownership = null
if (redSuites.length > 0) {
  const rows = redSuites.flatMap((red) => (red.rows?.length
    ? red.rows
    // No usable run record, so the run made no classification: the checks are
    // named from the output and every one of them holds. Never a green.
    : red.failed.map((check) => ({ suite: red.suite, check: check.name, key: check.key, point: null,
      elsewhere: false, title: '', reason: 'no complete run record — ownership unresolved' }))))
  ownership = {
    rows,
    // AN UNNAMED FAILURE IS ONE NOTHING NAMED — not one the OUTPUT did not name.
    // `failed` is parsed from the printed lines alone, so a red suite whose reds
    // live only in its run record (fully charged and accounted for) was reported
    // as unnamed as well, which held the run and stopped the backend sequence
    // over a red its own accounting had settled (Astra, 17.09.2026).
    unresolved: redSuites.filter((red) => red.unresolved || (red.failed.length === 0 && (red.rows?.length ?? 0) === 0))
      .map((red) => `${red.suite}: incomplete run or unnamed failure`),
  }
  if (wantBaseline) {
    console.log(`\n# --baseline is a HAND diagnosis since point 1135 — it no longer runs inside the pass.`)
    console.log(`# To measure one red against the pre-change tree: node scripts/verify/baseline-classify.mjs ${redSuites[0].suite}`)
  }
}

const failed = results.filter((r) => !r).length
const charges = [...chargedPoints].sort((a, b) => a - b)
console.log(`\n${failed === 0 ? 'ALL GREEN' : failed + ' SUITE(S) FAILED'} — ${results.length} suites run` +
  (charges.length ? ` — reds charged to open points ${charges.join(', ')}` : ''))
// The stages that are not suites — build, lint, unit, the GPU preflight — are
// unresolved by construction: no charge ledger names them.
const otherStages = failed > redSuites.length ? ['other failed stages: see regression report'] : []
const unresolved = ownership ? [...ownership.unresolved, ...otherStages] : otherStages
if (ownership) console.log(formatOwnershipVerdict({ rows: ownership.rows, unresolved }))
// DOES THIS PASS'S RED HOLD? The answer the backend sequencer above reads off
// the exit code — nothing else in the house tells the two reds apart, and both
// are failures (point 1135).
const holds = ownership === null || ownership.rows.some((r) => !r.elsewhere) || unresolved.length > 0
// Say it again at the END, where the verdict is read (point 566): a green
// headline from a one-section run must never be quoted as the suite's.
if (section) console.log(`PARTIAL — only section "${section}" of ${filter[0]} ran; the suite is NOT covered by this run`)
// What the machine's state means for THIS result (point 296). The asymmetry is
// the content: a green under load still counts — load produces false REDS, not
// false greens — while a red from a timing-sensitive suite under load is not
// evidence and names the command that re-runs it alone.
if (loadMode !== 'off') {
  for (const line of annotateResult({
    level: machine.level,
    strays: machine.strays ?? [],
    redSuites: redSuites.map((r) => r.suite),
    green: failed === 0,
  })) console.log(line)
}
process.exit(failed === 0 ? 0 : holds ? 1 : EXIT_NOT_HELD)
