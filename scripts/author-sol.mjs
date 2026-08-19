#!/usr/bin/env node
// THE COMMAND THAT LETS THE OPENAI LANE AUTHOR A POINT (work-order point 667).
//
//   node scripts/author-sol.mjs --point 651                  # author it, here, on this branch
//   node scripts/author-sol.mjs --point 651 --findings f.md  # the second leg: answer the review
//   node scripts/author-sol.mjs --routing --point 651        # which lane owns it, and why
//   node scripts/author-sol.mjs --routing --all              # the whole open queue
//   node scripts/author-sol.mjs --point 651 --dry-run        # the prompt and argv, no spend
//
// It is the delegated-agent flow with the author swapped: an isolated worktree,
// its own `feat/` branch, the point handed over as a BRIEF, atomic commits, and
// the branch pushed the moment the run ends so nothing lives only here. What it
// does NOT do is VERIFY its own work: it runs the three cheap gates (test:unit,
// build, lint) and must name each in its report, but the browser suites, the
// picture and the verdict are the reviewing Claude session's, and nothing here
// merges. The report ends by naming what that session owes.
//
// The decisions are pure and tested (author-sol-core.mjs, author-routing-core.mjs);
// this half does the process work, the git work and the push, and fails LOUD.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  authorRoundHistory,
  AUTHORING_COMMISSION_KIND,
  authorLaneFor,
  formatAuthorRoundHistory,
  formatLaneReport,
  LANE_MODEL,
  nextAuthoringStep,
  specExaminerFor,
} from './author-routing-core.mjs'
import { criticalityOf, parsePointBlocks } from './criticality-review-guard-core.mjs'
import { readTasksOpen } from './tasks-source.mjs'
import { appendRecord, readRecords, RECORDS_PATH } from './mechanism-review.mjs'
import { classifyOutcome, mainCheckoutFrom } from './review-sol-core.mjs'
import { ensureModelProven } from './review-sol.mjs'
import { currentSetting, settingProblemLine } from './sol-share.mjs'
import { routeFor } from './sol-share-core.mjs'
import {
  AUTHOR_TIMEOUT_MS,
  authoringCodexArgs,
  buildAuthoringPrompt,
  buildSpecExaminationPrompt,
  childEnv,
  formatAuthoringReport,
  judgeAuthoring,
  KILL_GRACE_MS,
  parseAuthoringAnswer,
  PUSH_INTERVAL_MS,
  PUSH_TIMEOUT_MS,
  readinessProblems,
  SOL_MODEL_ID,
  SOL_MODEL_NAME,
  SOL_REASONING_EFFORT,
  withheldEnvNames,
} from './author-sol-core.mjs'

/** One git read in the WORKTREE this command was started in — never REPO_ROOT's
 *  idea of it: the whole lane exists to work in an isolated checkout. */
function git(args, { cwd = process.cwd(), required = false } = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  if ((res.status !== 0 || res.error) && required) {
    throw new Error(`git ${args.join(' ')} failed: ${(res.stderr || res.error?.message || '').trim()}`)
  }
  return res.status === 0 && !res.error ? (res.stdout ?? '').trim() : null
}

/** The point's own text out of the OPEN work order, or '' when it is not there. */
export function pointBody(number, text = readTasksOpen()) {
  const block = parsePointBlocks(text).find((b) => b.n === Number(number))
  return block ? block.body : ''
}

/** The ledger-derived escalation signal. No record is the ordinary zero case. */
export function recordedReworkRounds(number, { records } = {}) {
  const rows = records ?? readRecords(process.env.AUTHOR_REVIEW_RECORDS_FILE || undefined)
  return authorRoundHistory(rows, number).freshRounds
}

// Re-exported beside the writer for callers that inspect its record shape.
export { AUTHORING_COMMISSION_KIND }

/**
 * Append one commission to the shared ledger and make that append durable.
 * The injected callbacks keep the state transition unit-testable; production
 * appends to the tracked review ledger and commits it before Sol starts.
 */
export function recordAuthoringCommission({
  records = [],
  point = '',
  round = 0,
  framing = '',
  sha = '',
  now = Date.now(),
  append = () => {},
  commit = () => {},
} = {}) {
  const wanted = Number(point)
  const attempt = Number(round)
  const frame = String(framing ?? '').trim()
  const commitSha = String(sha ?? '').trim()
  if (!Number.isSafeInteger(wanted) || wanted < 0) throw new Error('an authoring commission needs a numeric point')
  if (!Number.isSafeInteger(attempt) || attempt < 0) throw new Error('an authoring commission needs a non-negative round')
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) throw new Error('an authoring commission needs the current commit sha')

  const existing = (Array.isArray(records) ? records : []).find(
    (record) =>
      record?.kind === AUTHORING_COMMISSION_KIND &&
      Number(record?.point) === wanted &&
      Number(record?.round) === attempt,
  )
  if (existing) {
    if (String(existing.authorFraming ?? '').trim() !== frame) {
      throw new Error(`authoring round ${attempt} already has a different framing on record`)
    }
    return { written: false, record: existing }
  }

  const at = Number(now)
  if (!Number.isSafeInteger(at) || at < 0) throw new Error('an authoring commission needs a millisecond timestamp')
  const record = {
    sha: commitSha,
    kind: AUTHORING_COMMISSION_KIND,
    point: wanted,
    round: attempt,
    authorFraming: frame,
    model: SOL_MODEL_NAME,
    at,
    atIso: new Date(at).toISOString(),
  }
  append(record)
  commit(record)
  return { written: true, record }
}

/** The lane a point belongs to, with the reasons that decided it. */
export function laneFor(number, { override = '', reworkRounds, records } = {}) {
  const body = pointBody(number)
  const rows = records ?? readRecords(process.env.AUTHOR_REVIEW_RECORDS_FILE || undefined)
  const roundHistory = authorRoundHistory(rows, number)
  const rounds = reworkRounds ?? roundHistory.freshRounds
  return {
    body,
    roundHistory,
    ...authorLaneFor({ body, criticality: criticalityOf(body).level, override, reworkRounds: rounds }),
  }
}

/** The brief, cut by the project's own command — never a reading assignment. */
function briefFor(number) {
  const res = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'point-brief.mjs'), String(number)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })
  return res.status === 0 && !res.error ? (res.stdout ?? '').trim() : ''
}

/**
 * The commits that appeared since `base`, newest first.
 *
 * READ FROM THE BRANCH REF, not from HEAD (second cross-vendor round): a run
 * that committed on the approved branch and then checked out something else
 * would otherwise have its work discarded from the inspection, left unpushed,
 * and reported as "nothing was committed" while it sat on the branch all along.
 */
export function commitsSince(base, { cwd = process.cwd(), ref = 'HEAD' } = {}) {
  const field = '%H%x1f%s%x1f%(trailers:key=Co-Authored-By,valueonly,separator=;)'
  const log = git(['log', `--format=${field}`, `${base}..${ref}`], { cwd }) ?? ''
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, trailers] = line.split(UNIT)
      return { sha, subject: subject ?? '', trailers: trailers ?? '' }
    })
}

/** git's unit separator, so a subject holding any punctuation still parses. */
const UNIT = String.fromCharCode(31)

/** Push the branch, quietly. Returns true only on a real success. */
export function pushBranch(branch, { cwd = process.cwd(), timeoutMs = PUSH_TIMEOUT_MS } = {}) {
  // TIMED, because the interim push runs on the event loop the kill timer lives
  // on (second cross-vendor round): a push that hangs on the network would
  // otherwise block the timeout that is supposed to bound the whole run.
  const res = spawnSync('git', ['push', '-u', 'origin', branch], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    // SIGKILL, not SIGTERM (third round): a polite signal a hung transport can
    // ignore is not a bound, and this call blocks the loop the run's own timer
    // lives on. Bounded at one minute, it delays that timer by at most a minute.
    killSignal: 'SIGKILL',
  })
  return { ok: res.status === 0 && !res.error, why: (res.stderr || res.error?.message || '').trim() }
}

/**
 * Run codex as an AUTHOR: sandbox bypassed (it cannot work here), credentials
 * stripped from the environment, the worktree as the working root.
 *
 * ASYNCHRONOUS, so the branch can be PUSHED WHILE IT WORKS (cross-vendor review
 * of point 667, P2). The house rule is a push after every commit; the child
 * cannot be given the credential to do it, so the wrapper does it on an interval
 * instead and a commit is durable within two minutes rather than at the end of
 * an hour-long run.
 */
export async function runAuthoringCodex({
  prompt,
  cwd,
  branch = '',
  timeoutMs = AUTHOR_TIMEOUT_MS,
  modelId = SOL_MODEL_ID,
  pushEveryMs = PUSH_INTERVAL_MS,
  onPush = () => {},
}) {
  const outFile = join(tmpdir(), `author-sol-${process.pid}-${Date.now()}.txt`)
  const args = authoringCodexArgs({ modelId, effort: SOL_REASONING_EFFORT, cwd, outputFile: outFile, prompt })
  // ITS OWN PROCESS GROUP (third cross-vendor round). Signalling the child alone
  // left its shells and test runners alive: they went on writing to the worktree
  // AFTER the commits had been inspected, pushed and reported, so the report
  // described a branch that was still moving. `detached` makes the run a group
  // leader, and the kill below takes the group.
  const child = spawn('codex', args, {
    cwd,
    env: childEnv(process.env),
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  /** Signal the whole run — group where we have one, the child otherwise. */
  const killRun = (signal) => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal)
      else child.kill(signal)
    } catch {
      /* already gone: nothing to signal, and that is the outcome we wanted */
    }
  }
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => {
    stdout += d
  })
  child.stderr.on('data', (d) => {
    stderr += d
  })

  let timedOut = false
  let settle = () => {}
  const escalations = []
  const killer = setTimeout(() => {
    timedOut = true
    killRun('SIGTERM')
    // A BOUND, NOT A REQUEST (second cross-vendor round): a run that ignores
    // SIGTERM gets SIGKILL, and if its pipes are still held open after that, the
    // wrapper stops waiting rather than hanging for ever. What was committed is
    // on the branch either way, and that is what gets judged.
    escalations.push(setTimeout(() => killRun('SIGKILL'), KILL_GRACE_MS))
    escalations.push(setTimeout(() => settle({ spawnError: null, exitCode: 1 }), KILL_GRACE_MS * 2))
  }, timeoutMs)
  // The interim push only runs while the branch has moved, so an idle run costs
  // no network calls at all. It starts at NOTHING pushed rather than at the
  // current head: assuming the branch is already on the remote would skip the
  // one push that matters if it is not.
  let lastPushed = null
  const tip = () => git(['rev-parse', branch ? `refs/heads/${branch}` : 'HEAD'], { cwd })
  const pusher = branch && pushEveryMs > 0
    ? setInterval(() => {
        const head = tip()
        if (!head || head === lastPushed) return
        const { ok, why } = pushBranch(branch, { cwd })
        if (ok) lastPushed = head
        onPush({ ok, head, why })
      }, pushEveryMs)
    : null

  const { spawnError, exitCode } = await new Promise((resolve) => {
    settle = resolve
    child.on('error', (error) => resolve({ spawnError: error, exitCode: 1 }))
    child.on('close', (code) => resolve({ spawnError: null, exitCode: code ?? 1 }))
  })
  clearTimeout(killer)
  for (const t of escalations) clearTimeout(t)
  // A TIMED-OUT RUN IS KILLED HARD BEFORE THE TIMERS ARE DROPPED (fourth
  // cross-vendor round). The child closing after the group SIGTERM cancelled the
  // pending SIGKILL, so a grandchild that ignored the polite signal — and had
  // closed its inherited pipes — went on writing to the worktree behind the
  // report. Whatever is still in the group goes now, not on a timer.
  if (timedOut) killRun('SIGKILL')
  if (pusher) clearInterval(pusher)

  let last = ''
  try {
    last = readFileSync(outFile, 'utf8')
  } catch {
    /* codex writes it only on a completed run; stdout still carries the answer */
  }
  try {
    rmSync(outFile, { force: true })
  } catch {
    /* a leftover temp file is not worth an exit code */
  }
  return {
    spawnError,
    exitCode,
    stdout,
    stderr,
    timedOut,
    // What the interim pushes already made durable, so a transient failure of
    // the FINAL push cannot report work as local-only that is on the remote
    // (second cross-vendor round).
    lastPushed,
    finalMessage: last || stdout || '',
  }
}

export const usage = () =>
  [
    'usage: node scripts/author-sol.mjs --point <N> [--findings <file>] [--rounds <n>] [--timeout <ms>]',
    '           [--anyway] [--dry-run]',
    '       node scripts/author-sol.mjs --routing (--point <N> [--rounds <n>] | --all)',
    '',
    `${SOL_MODEL_NAME} AUTHORS the point in THIS worktree, on THIS branch, committing at every step;`,
    'the branch is pushed for it while it works. It runs the three cheap gates (test:unit, build,',
    'lint) on its own work and merges nothing: the REVIEW, the browser suites, the picture and the',
    'landing belong to the Claude session that called it, which is what keeps two vendors on the',
    'point and neither reviewing itself.',
    '',
    'The lane is decided by the point itself (--routing shows why). A point the routing gives to',
    'another lane is refused unless --anyway is given, and the share switch can turn the whole',
    'lane off:  node scripts/sol-share.mjs --status',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const knownFlags = new Set([
    '--point',
    '--findings',
    '--rounds',
    '--timeout',
    '--anyway',
    '--dry-run',
    '--routing',
    '--all',
    '--help',
    '-h',
  ])
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
  }
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log(usage())
      process.exit(0)
    }
    const unknown = argv.find((arg) => arg.startsWith('-') && !knownFlags.has(arg))
    if (unknown) {
      console.error(`author-sol: unknown option ${unknown}.\n`)
      console.error(usage())
      process.exit(2)
    }
    const roundsText = flag('--rounds')
    const roundsValue = Number(roundsText)
    if (argv.includes('--rounds') && (!/^\d+$/.test(roundsText) || !Number.isSafeInteger(roundsValue))) {
      console.error('author-sol: --rounds needs a non-negative integer.\n')
      console.error(usage())
      process.exit(2)
    }
    const roundsOverride = argv.includes('--rounds') ? roundsValue : undefined

    // THE ROUTING REPORT: read-only, no allowance spent, no state touched.
    if (argv.includes('--routing')) {
      if (argv.includes('--all')) {
        if (roundsOverride !== undefined) {
          console.error('author-sol: --rounds applies to one --point, not --all.')
          process.exit(2)
        }
        const records = readRecords(process.env.AUTHOR_REVIEW_RECORDS_FILE || undefined)
        const rows = parsePointBlocks(readTasksOpen())
          .filter((b) => !b.done)
          .map((b) => {
            const roundHistory = authorRoundHistory(records, b.n)
            const reworkRounds = roundHistory.freshRounds
            const decided = authorLaneFor({ body: b.body, criticality: criticalityOf(b.body).level, reworkRounds })
            return {
              number: b.n,
              ...decided,
              why: [
                `${decided.why[0]} (${roundHistory.unsuccessfulRounds} unsuccessful review round(s), ` +
                  `${reworkRounds} fresh attempt(s), spec examination ${roundHistory.examination ? 'recorded' : 'not recorded'})`,
              ],
            }
          })
        console.log(formatLaneReport(rows))
        process.exit(0)
      }
      const number = flag('--point')
      if (!number) {
        console.error('author-sol: --routing needs --point <N> or --all.\n')
        console.error(usage())
        process.exit(2)
      }
      const records = readRecords(process.env.AUTHOR_REVIEW_RECORDS_FILE || undefined)
      const decided = laneFor(number, { reworkRounds: roundsOverride, records })
      if (!decided.body) console.error(`author-sol: point ${number} is not in the OPEN work order — routing what is known.`)
      console.log(`author-sol: point ${number} → ${decided.lane} (${LANE_MODEL[decided.lane]})`)
      console.log(formatAuthorRoundHistory(decided.roundHistory))
      const step = nextAuthoringStep({ records, point: number, reworkRounds: roundsOverride })
      console.log(`  next step: ${step.kind} — ${step.reason}`)
      for (const why of decided.why) console.log(`  because ${why}`)
      process.exit(0)
    }

    const point = flag('--point')
    if (!point) {
      console.error('author-sol: --point <N> is required.\n')
      console.error(usage())
      process.exit(2)
    }

    // THE EXAMINATION IS READ-ONLY. Decide it before asking whether this is a
    // writable feature worktree: the examiner changes no code, starts no author
    // and needs neither the point's branch nor a clean checkout.
    const records = readRecords(process.env.AUTHOR_REVIEW_RECORDS_FILE || undefined)
    const decided = laneFor(point, { reworkRounds: roundsOverride, records })
    const authoringStep = nextAuthoringStep({ records, point, reworkRounds: roundsOverride })
    const readFindings = () => {
      const findingsFile = flag('--findings')
      if (!findingsFile) return ''
      let findings = ''
      try {
        findings = readFileSync(findingsFile, 'utf8')
      } catch (e) {
        console.error(`author-sol: --findings ${findingsFile}: ${e.message}`)
        process.exit(2)
      }
      if (!findings.trim()) {
        console.error(`author-sol: --findings ${findingsFile} is empty — there is nothing to answer.`)
        process.exit(2)
      }
      return findings
    }
    if (authoringStep.kind === 'spec-examination') {
      const findings = readFindings()
      const brief = briefFor(point)
      if (!brief) {
        console.error(`author-sol: point-brief.mjs produced no brief for point ${point} — the spec cannot be examined from half its text.`)
        process.exit(2)
      }
      const examinationRoute = specExaminerFor(decided.roundHistory, SOL_MODEL_NAME)
      const route = examinationRoute.route === 'claude-read'
        ? 'Claude reads this packet directly because Sol authored the round.'
        : 'Run `node scripts/ask-sol.mjs --kind audit` with this packet because Claude authored the round.'
      const packet = buildSpecExaminationPrompt({
        point,
        pointText: decided.body,
        brief,
        history: decided.roundHistory,
        currentFindings: findings,
      })
      const head = git(['rev-parse', 'HEAD'], { cwd: process.cwd() }) ?? '<reviewed-sha>'
      console.log(
        `author-sol: SPEC EXAMINATION REQUIRED before another authoring commission.\n` +
          `  ${authoringStep.reason}\n` +
          `  cross-vendor route: ${route}\n\n` +
          `${packet}\n\n` +
          `Record the result once it has been read (use amended only after the point text is amended):\n` +
          `  node scripts/mechanism-review.mjs --record ${head} --model "${examinationRoute.model}" --verdict merge ` +
          `--evidence "<what the examination established>" --mode review --point ${point} ` +
          `--spec-examination <sound|amended>`,
      )
      process.exit(4)
    }

    // WHERE THIS RUN WOULD WRITE, asked before anything is spent.
    const cwd = process.cwd()
    const worktree = git(['rev-parse', '--show-toplevel'], { cwd }) ?? ''
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }) ?? ''
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd }) ?? ''
    const problems = readinessProblems({
      branch,
      worktree,
      // THE POINT travels with it (fifth cross-vendor round): without it any
      // `feat/` branch passed, so a run for one point could commit and push onto
      // another point's branch.
      point,
      mainCheckout: mainCheckoutFrom(common, REPO_ROOT),
      dirty: git(['status', '--porcelain'], { cwd }) ?? '',
    })
    // A DRY RUN IS STILL SHOWN THE REFUSALS, but is not stopped by them: it
    // spends nothing and writes nothing, and inspecting the prompt is exactly
    // what one does while the tree is still dirty.
    const dryRun = argv.includes('--dry-run')
    if (problems.length) {
      console.error(`author-sol: ${dryRun ? 'this run WOULD be refused' : `refusing to start ${SOL_MODEL_NAME} here`}.`)
      for (const p of problems) console.error(`  · ${p}`)
      if (!dryRun) process.exit(2)
    }

    // THE LANE IS THE POINT'S OWN ANSWER, not the dispatcher's mood (point 667).
    // Its automatic escalation signal comes from the review ledger. `--rounds`
    // is the deliberate override for a history that the ledger cannot know.
    console.error(
      `author-sol: lane verdict for point ${point}: ${decided.lane} (${LANE_MODEL[decided.lane]}); ` +
        `${decided.roundHistory.unsuccessfulRounds} unsuccessful review round(s), ` +
        `${decided.signals.reworkRounds} fresh attempt(s).`,
    )
    console.error(formatAuthorRoundHistory(decided.roundHistory))
    if (decided.lane !== 'sol' && !argv.includes('--anyway')) {
      console.error(
        `author-sol: point ${point} routes to the ${decided.lane} lane (${LANE_MODEL[decided.lane]}), not to ${SOL_MODEL_NAME}:\n` +
          `  because ${decided.why[0]}\n` +
          '  Author it in that lane, or override this once with --anyway.',
      )
      process.exit(3)
    }

    // THE SHARE SWITCH CAN TURN THE WHOLE LANE OFF (point 654's lever, extended
    // here to the biggest spender of the two vendors).
    const share = currentSetting()
    if (share.problem) console.error(settingProblemLine(share, 'author-sol'))
    if (routeFor('author', share.setting) !== 'sol' && !argv.includes('--anyway')) {
      console.error(
        `author-sol: the share switch is at \`${share.setting}\`, which keeps authoring with Claude.\n` +
          '  node scripts/sol-share.mjs --more   (override once with --anyway)',
      )
      process.exit(3)
    }

    const findings = readFindings()

    // The brief is cut fresh: a stale one describes a work order that has moved.
    const brief = !findings ? briefFor(point) : ''
    if (!findings && !brief) {
      console.error(`author-sol: point-brief.mjs produced no brief for point ${point} — refusing to author from nothing.`)
      process.exit(2)
    }

    const prompt = buildAuthoringPrompt({ point, brief, branch, findings, framing: authoringStep.framing })
    const withheld = withheldEnvNames(process.env)
    if (dryRun) {
      console.log(`author-sol: DRY RUN — nothing is spent and nothing is written.\n`)
      console.log(`  codex ${authoringCodexArgs({ cwd: worktree, prompt: '<the prompt>' }).join(' ')}`)
      console.log(`  withheld from its environment: ${withheld.length ? withheld.join(', ') : 'nothing matched'}`)
      console.log(`\n--- the prompt ---\n${prompt}\n--- end ---`)
      process.exit(0)
    }

    // The identity is PROVEN before a commit is stamped with Sol's name: nothing
    // in a run's output says which model answered, so the attribution rests on
    // the server refusing an unknown id (review-sol.mjs --probe).
    if (!ensureModelProven({ who: 'author-sol' })) {
      console.error(`author-sol: the model id is not proven honoured — refusing to attribute commits to ${SOL_MODEL_NAME}.`)
      process.exit(2)
    }

    // RECORD THE COMMISSION BEFORE IT RUNS. The review sha is not known yet,
    // but the point, attempt number and exact prompt framing are. Keeping that
    // fact in the append-only ledger makes the later --author-framing flag a
    // confirmation rather than the only evidence, and committing it now means
    // a killed authoring run cannot erase which commission was actually sent.
    const commissionSha = git(['rev-parse', 'HEAD'], { cwd, required: true })
    const recordsPath = process.env.AUTHOR_REVIEW_RECORDS_FILE || RECORDS_PATH
    const commissioned = recordAuthoringCommission({
      records,
      point,
      round: authoringStep.round,
      framing: authoringStep.framing,
      sha: commissionSha,
      append: (record) => appendRecord(record, recordsPath),
      commit: () => {
        git(['add', '--', recordsPath], { cwd, required: true })
        git(
          [
            'commit',
            '-m',
            'Record hostile-test authoring commission',
            '-m',
            'Co-Authored-By: GPT-5.6 Sol <noreply@openai.com>',
          ],
          { cwd, required: true },
        )
      },
    })
    if (commissioned.written) {
      records.push(commissioned.record)
      const saved = pushBranch(branch, { cwd })
      console.error(
        saved.ok
          ? 'author-sol: recorded and pushed the authoring commission before starting it'
          : `author-sol: recorded the authoring commission locally; its immediate push failed — ${saved.why}`,
      )
    }

    // The commission receipt is orchestration, not authored work. Start the
    // delivered range after it so the report and reviewer see only Sol's edits.
    const base = git(['rev-parse', 'HEAD'], { cwd, required: true })
    console.error(
      `author-sol: ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) is authoring point ${point} on ${branch}` +
        `${findings ? ' — second leg, answering the review' : ''} …`,
    )
    if (withheld.length) console.error(`  withheld from its environment: ${withheld.join(', ')}`)

    const run = await runAuthoringCodex({
      prompt,
      cwd: worktree,
      branch,
      timeoutMs: Number(flag('--timeout')) || AUTHOR_TIMEOUT_MS,
      onPush: ({ ok, head, why }) =>
        console.error(ok ? `author-sol: pushed ${String(head).slice(0, 7)} while the run continues` : `author-sol: interim push failed — ${why}`),
    })
    const outcome = classifyOutcome(run)
    const parsed = parseAuthoringAnswer(run.finalMessage)
    // WHERE THE RUN ENDED, not where it began: nothing stops a sandbox-less run
    // from checking out another branch, and the commits below would then belong
    // to something else entirely (cross-vendor review, P1).
    const branchAfter = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }) ?? ''
    // READ OFF THE BRANCH, not off HEAD: a run that wandered elsewhere still
    // committed its work here, and discarding it would lose it (second
    // cross-vendor round). That it wandered is a PROBLEM, reported as one.
    const commits = commitsSince(base, { cwd, ref: `refs/heads/${branch}` })

    // PUSHED BEFORE ANYTHING IS JUDGED: whatever the run did, what is committed
    // must not live only in a worktree that a landing may delete underneath it.
    // (The interval above has usually pushed it already; this is the last one.)
    let pushed = null
    if (commits.length) {
      const res = pushBranch(branch, { cwd })
      // A failed FINAL push over work the interval ALREADY pushed is not
      // local-only work, and saying so would send the reader after a problem
      // that is not there.
      const tip = git(['rev-parse', `refs/heads/${branch}`], { cwd })
      pushed = res.ok || (Boolean(tip) && tip === run.lastPushed)
      if (!res.ok) {
        console.error(`author-sol: final push failed — ${res.why}`)
        if (pushed) console.error('  (the interim push already carried this commit to the remote)')
      }
    }

    const judged = judgeAuthoring({
      outcome,
      commits,
      parsed,
      branch,
      branchAfter,
      dirty: git(['status', '--porcelain'], { cwd }) ?? '',
    })
    const said = String(run.finalMessage ?? '').trim()
    if (said) console.log(`--- ${SOL_MODEL_NAME} said ---\n${said}\n--- end ---\n`)
    console.log(formatAuthoringReport({ point, branch, judged, parsed, pushed, framing: authoringStep.framing }))
    // 0 only for a clean run that produced work; 3 says "look at this before you
    // treat it as a delivery", which is what a script chaining on it must see.
    process.exit(judged.clean ? 0 : 3)
  } catch (e) {
    console.error(`author-sol failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
