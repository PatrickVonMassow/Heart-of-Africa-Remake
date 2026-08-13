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
// does NOT do is judge its own work — no gate is run by the author, nothing is
// merged, and the report ends by naming what the reviewing Claude session owes.
//
// The decisions are pure and tested (author-sol-core.mjs, author-routing-core.mjs);
// this half does the process work, the git work and the push, and fails LOUD.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { authorLaneFor, formatLaneReport, LANE_MODEL } from './author-routing-core.mjs'
import { criticalityOf, parsePointBlocks } from './criticality-review-guard-core.mjs'
import { readTasksOpen } from './tasks-source.mjs'
import { classifyOutcome, mainCheckoutFrom } from './review-sol-core.mjs'
import { ensureModelProven } from './review-sol.mjs'
import { currentSetting, settingProblemLine } from './sol-share.mjs'
import { routeFor } from './sol-share-core.mjs'
import {
  AUTHOR_TIMEOUT_MS,
  authoringCodexArgs,
  buildAuthoringPrompt,
  childEnv,
  formatAuthoringReport,
  judgeAuthoring,
  parseAuthoringAnswer,
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

/** The lane a point belongs to, with the reasons that decided it. */
export function laneFor(number, { override = '', reworked = false } = {}) {
  const body = pointBody(number)
  return { body, ...authorLaneFor({ body, criticality: criticalityOf(body).level, override, reworked }) }
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

/** The commits that appeared on this branch since `base`, newest first. */
export function commitsSince(base, { cwd = process.cwd() } = {}) {
  const field = '%H%x1f%s%x1f%(trailers:key=Co-Authored-By,valueonly,separator=;)'
  const log = git(['log', `--format=${field}`, `${base}..HEAD`], { cwd }) ?? ''
  return log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, trailers] = line.split('')
      return { sha, subject, trailers: trailers ?? '' }
    })
}

/** Run codex as an AUTHOR: sandbox bypassed (it cannot work here), credentials
 *  stripped from the environment, the worktree as the working root. */
export function runAuthoringCodex({ prompt, cwd, timeoutMs = AUTHOR_TIMEOUT_MS, modelId = SOL_MODEL_ID }) {
  const outFile = join(tmpdir(), `author-sol-${process.pid}-${Date.now()}.txt`)
  const args = authoringCodexArgs({ modelId, effort: SOL_REASONING_EFFORT, cwd, outputFile: outFile, prompt })
  const res = spawnSync('codex', args, {
    cwd,
    encoding: 'utf8',
    env: childEnv(process.env),
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
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
    spawnError: res.error ?? null,
    exitCode: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    timedOut: res.signal === 'SIGTERM' || String(res.error?.code ?? '') === 'ETIMEDOUT',
    finalMessage: last || res.stdout || '',
  }
}

export const usage = () =>
  [
    'usage: node scripts/author-sol.mjs --point <N> [--findings <file>] [--timeout <ms>] [--anyway] [--dry-run]',
    '       node scripts/author-sol.mjs --routing (--point <N> | --all)',
    '',
    `${SOL_MODEL_NAME} AUTHORS the point in THIS worktree, on THIS branch, committing at every step;`,
    'the branch is pushed when the run ends. It runs no gate and merges nothing: the review, the',
    'suites, the picture and the landing belong to the Claude session that called it, which is',
    'what keeps two vendors on the point and neither reviewing itself.',
    '',
    'The lane is decided by the point itself (--routing shows why). A point the routing gives to',
    'another lane is refused unless --anyway is given, and the share switch can turn the whole',
    'lane off:  node scripts/sol-share.mjs --status',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
  }
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log(usage())
      process.exit(0)
    }

    // THE ROUTING REPORT: read-only, no allowance spent, no state touched.
    if (argv.includes('--routing')) {
      if (argv.includes('--all')) {
        const rows = parsePointBlocks(readTasksOpen())
          .filter((b) => !b.done)
          .map((b) => ({ number: b.n, ...authorLaneFor({ body: b.body, criticality: criticalityOf(b.body).level }) }))
        console.log(formatLaneReport(rows))
        process.exit(0)
      }
      const number = flag('--point')
      if (!number) {
        console.error('author-sol: --routing needs --point <N> or --all.\n')
        console.error(usage())
        process.exit(2)
      }
      const decided = laneFor(number)
      if (!decided.body) console.error(`author-sol: point ${number} is not in the OPEN work order — routing what is known.`)
      console.log(`author-sol: point ${number} → ${decided.lane} (${LANE_MODEL[decided.lane]})`)
      for (const why of decided.why) console.log(`  because ${why}`)
      process.exit(0)
    }

    const point = flag('--point')
    if (!point) {
      console.error('author-sol: --point <N> is required.\n')
      console.error(usage())
      process.exit(2)
    }

    // WHERE THIS RUN WOULD WRITE, asked before anything is spent.
    const cwd = process.cwd()
    const worktree = git(['rev-parse', '--show-toplevel'], { cwd }) ?? ''
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }) ?? ''
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd }) ?? ''
    const problems = readinessProblems({
      branch,
      worktree,
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
    const decided = laneFor(point)
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

    const findingsFile = flag('--findings')
    let findings = ''
    if (findingsFile) {
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
    }

    // The brief is cut fresh: a stale one describes a work order that has moved.
    const brief = findings ? '' : briefFor(point)
    if (!findings && !brief) {
      console.error(`author-sol: point-brief.mjs produced no brief for point ${point} — refusing to author from nothing.`)
      process.exit(2)
    }

    const prompt = buildAuthoringPrompt({ point, brief, branch, findings })
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

    const base = git(['rev-parse', 'HEAD'], { cwd, required: true })
    console.error(
      `author-sol: ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) is authoring point ${point} on ${branch}` +
        `${findings ? ' — second leg, answering the review' : ''} …`,
    )
    if (withheld.length) console.error(`  withheld from its environment: ${withheld.join(', ')}`)

    const run = runAuthoringCodex({ prompt, cwd: worktree, timeoutMs: Number(flag('--timeout')) || AUTHOR_TIMEOUT_MS })
    const outcome = classifyOutcome(run)
    const parsed = parseAuthoringAnswer(run.finalMessage)
    const commits = commitsSince(base, { cwd })

    // PUSHED BEFORE ANYTHING IS JUDGED: whatever the run did, what is committed
    // must not live only in a worktree that a landing may delete underneath it.
    let pushed = null
    if (commits.length) {
      const res = spawnSync('git', ['push', '-u', 'origin', branch], { cwd, encoding: 'utf8', windowsHide: true })
      pushed = res.status === 0 && !res.error
      if (!pushed) console.error(`author-sol: PUSH FAILED — ${(res.stderr || res.error?.message || '').trim()}`)
    }

    const judged = judgeAuthoring({ outcome, commits, parsed, dirty: git(['status', '--porcelain'], { cwd }) ?? '' })
    const said = String(run.finalMessage ?? '').trim()
    if (said) console.log(`--- ${SOL_MODEL_NAME} said ---\n${said}\n--- end ---\n`)
    console.log(formatAuthoringReport({ point, branch, judged, parsed, pushed }))
    // 0 only for a clean run that produced work; 3 says "look at this before you
    // treat it as a delivery", which is what a script chaining on it must see.
    process.exit(judged.clean ? 0 : 3)
  } catch (e) {
    console.error(`author-sol failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
