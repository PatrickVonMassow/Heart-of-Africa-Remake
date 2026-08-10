// LAND A FINISHED POINT — the whole chain, one command (point 594).
//
//   node scripts/land-point.mjs 594 --model "Claude Opus 5"   land it
//   node scripts/land-point.mjs 594 --dry      print the plan, touch nothing
//   node scripts/land-point.mjs 594 --serial   force the gate serial
//   node scripts/land-point.mjs 594 --branch feat/594-x   name the branch yourself
//
// It runs on `main`, in the MAIN tree, and it does what CLAUDE.md §6 already
// demands by hand: merge (--no-ff), fast gate, tick, archive move, COMMIT AND
// PUSH MAIN, board publish, worktree cleanup — printing ONE summary with a
// verdict per step.
//
// `--model` names the model running the landing, and is required for any real
// run: the tick commit's co-author trailer is model-guard's only evidence of who
// authored it, and nothing in the repository can tell the script which model it
// is. It is validated against the allowlist BEFORE the merge, so a wrong one
// costs nothing.
//
// EVERY DECISION IS IN scripts/land-point-core.mjs AND PINNED BY VITEST. This
// file is the I/O half only: git, npm, the two file writes, the two sub-scripts.
// Read the core for WHY any of it happens; read this for WHAT it runs.
//
// IT STOPS AT THE FIRST RED. There is no --force and no --continue: a chain that
// can be talked past its own failure is a chain that leaves half states, which is
// the failure mode this command exists to remove.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { writeTextAtomic } from './atomic-write.mjs'
import { evaluateTasksArchive } from './tasks-archive-guard-core.mjs'
import { openFingerprintOfTasks } from './board-currency-core.mjs'
import { evaluateCommitTrailers } from './model-guard-core.mjs'
import {
  GATE_COMMANDS,
  LandingError,
  MERGE_ARGS,
  VERDICT,
  auditNeeded,
  boardPublishNeeded,
  foldResult,
  formatLandingVerdict,
  gateConcurrency,
  landingExit,
  markNotReached,
  planLanding,
  resolveBranch,
  tickAndArchive,
  tickCommitMessage,
  transitionAccepted,
  worktreesForBranch,
} from './land-point-core.mjs'

const TASKS = join(REPO_ROOT, 'TASKS.md')
const ARCHIVE = join(REPO_ROOT, 'docs', 'tasks-archive.md')
const BOARD_FILE = join(REPO_ROOT, '.batch-dashboard.html')
const STATE_FILE = join(REPO_ROOT, '.claude', 'dashboard-state.json')

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, ...opts }).trim()

const git = (args, opts = {}) => sh('git', args, opts)

const readIf = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

/** `git worktree list --porcelain` → [{ path, branch }]. */
function listWorktrees() {
  const out = git(['worktree', 'list', '--porcelain'])
  const trees = []
  let cur = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) trees.push(cur)
      cur = { path: line.slice('worktree '.length).trim(), branch: '' }
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    }
  }
  if (cur) trees.push(cur)
  return trees
}

/**
 * Should the board be published — decided against the work order the tick
 * PRODUCES, never the one it replaces.
 *
 * THE INPUT IS THE WHOLE POINT. Every landing moves the open-point set by
 * definition, so a fingerprint taken from the pre-tick TASKS.md is stale before
 * the step it decides even runs: the skip would then fire exactly when it must
 * not, the live page would fall behind, `publishDue` would arm, and
 * `board-first-guard` would deny the next turn's first state-changing call — the
 * block loop the second input exists to prevent. `boardPublishNeeded` was right;
 * it was being fed the wrong text.
 */
function boardDecision(postTickTasks) {
  const bytes = readIf(BOARD_FILE)
  return boardPublishNeeded({
    fileHash: bytes ? createHash('sha256').update(Buffer.from(bytes)).digest('hex') : null,
    fingerprint: openFingerprintOfTasks(postTickTasks),
    state: readJson(STATE_FILE),
  })
}

/**
 * The machine probe, as data.
 *
 * `level: 'unknown'` is the probe's own word for "I could not read this machine"
 * — never mistaken for quiet by its own contract — so it reads here exactly like
 * a probe that crashed: not ok, and the gate falls back to serial. The probe
 * exits non-zero on a busy machine, which is a VERDICT and not an error, so its
 * output is captured rather than its exit code trusted.
 */
function probeMachine() {
  let raw = ''
  try {
    raw = sh('node', [join('scripts', 'verify', 'machine-load.mjs'), '--json'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (e) {
    raw = `${(e && e.stdout) || ''}`
  }
  try {
    const data = JSON.parse(raw)
    const strays = Array.isArray(data?.strays) ? data.strays : []
    return { probeOk: data?.level !== 'unknown' && data?.level !== undefined, strays }
  } catch {
    return { probeOk: false, strays: [] }
  }
}

/**
 * Run the gate steps. PARALLEL means "started together and all awaited" — every
 * step's verdict is collected even when an earlier one has already failed, so the
 * summary names ALL the red steps rather than only the first. That is the one
 * place the chain deliberately does not stop early: three gate results cost the
 * same wall clock as one, and a session that fixes one red only to meet the next
 * has spent a whole landing to learn it.
 */
async function runGate(steps, mode) {
  const run = (id) =>
    new Promise((res) => {
      const [cmd, ...args] = GATE_COMMANDS[id]
      try {
        sh(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        res({ id, ok: true, output: '' })
      } catch (e) {
        const out = `${(e && e.stdout) || ''}\n${(e && e.stderr) || ''}`.trim()
        res({ id, ok: false, output: out.split('\n').slice(-12).join('\n') })
      }
    })

  if (mode === 'parallel') return Promise.all(steps.map(run))
  const results = []
  for (const id of steps) results.push(await run(id))
  return results
}

async function main(argv) {
  const args = argv.slice(2)
  const number = Number(args.find((a) => /^\d+$/.test(a)))
  const dry = args.includes('--dry')
  const force = args.includes('--serial') ? 'serial' : args.includes('--parallel') ? 'parallel' : null
  const namedBranch = args[args.indexOf('--branch') + 1]
  const branchArg = args.includes('--branch') ? namedBranch : null
  const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : ''

  if (!Number.isInteger(number) || number <= 0) {
    console.error(
      'usage: node scripts/land-point.mjs <point> --model "<authoring model>"\n' +
        '                                   [--dry] [--serial|--parallel] [--branch <name>]',
    )
    return 2
  }

  // THE AUTHORING MODEL, CHECKED BEFORE ANYTHING MOVES. The tick commit carries
  // it, model-guard reads it, and a landing that discovered the problem after the
  // merge would have to be unwound. `--dry` is exempt: it commits nothing.
  if (!dry) {
    let message = ''
    try {
      message = tickCommitMessage({ number, model })
    } catch (e) {
      console.error(`land-point: ${e.message}`)
      if (e.repair) console.error(`  repair: ${e.repair}`)
      return 2
    }
    const trailers = evaluateCommitTrailers(message)
    if (trailers.block) {
      console.error(
        `land-point: --model "${model}" is not an allowed authoring model (CLAUDE.md §6).\n` +
          '  The chain is Opus 5 -> Fable 5 -> Opus 4.8; name the model actually running this landing.',
      )
      return 2
    }
  }

  // WHERE IT MAY RUN. The tick is main-only (CLAUDE.md §6) and the merge target is
  // main, so a chain started anywhere else would either fail late or write the
  // work order on a feature branch. Refuse up front, by name.
  if (resolve(process.cwd()) !== resolve(REPO_ROOT)) {
    console.error(`land-point: run this from the MAIN tree (${REPO_ROOT}), not from a worktree.`)
    return 2
  }
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (head !== 'main') {
    console.error(`land-point: HEAD is on "${head}" — check out main first. The tick is main-only.`)
    return 2
  }
  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    console.error('land-point: the working tree is dirty. Commit or stash first — a merge on top of\n' +
      'uncommitted work is exactly the half state this command exists to avoid.\n' + dirty)
    return 2
  }

  let plan
  let branch
  let worktrees
  let gate
  let audit
  let board
  try {
    const branches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n')
    branch = branchArg || resolveBranch({ branches, number })
    worktrees = worktreesForBranch({ worktrees: listWorktrees(), branch, mainRoot: REPO_ROOT })

    // What the merge will bring in decides whether the audit runs (rider a).
    const changed = git(['diff', '--name-only', `main...${branch}`]).split('\n').filter(Boolean)
    audit = auditNeeded({ changedFiles: changed })

    const probe = probeMachine()
    gate = gateConcurrency({ ...probe, force })

    // THE TICK IS COMPUTED HERE, BEFORE THE MERGE, for two reasons. It validates
    // the point (a number that is not in TASKS.md, or already archived, fails
    // while nothing has moved yet), and it yields the POST-tick work order the
    // board decision has to be taken against — see `boardDecision` below.
    const preview = tickAndArchive({
      tasksText: readIf(TASKS),
      archiveText: readIf(ARCHIVE),
      number,
    })
    board = boardDecision(preview.tasks)

    plan = planLanding({ number, branch, audit, board, gate, worktrees })
  } catch (e) {
    if (e instanceof LandingError) {
      console.error(`land-point: ${e.message}`)
      if (e.repair) console.error(`  repair: ${e.repair}`)
      return 1
    }
    throw e
  }

  if (dry) {
    console.log(`landing plan for point ${number} (${branch}) — DRY, nothing was touched`)
    for (const s of plan.steps) {
      console.log(`  ${s.run ? 'RUN ' : 'SKIP'} ${s.id.padEnd(8)} ${s.label}${s.reason ? ` — ${s.reason}` : ''}`)
    }
    return 0
  }

  let results = []
  let error = null
  const step = (id, verdict, detail) => {
    const folded = foldResult(results, { id, verdict, detail })
    results = folded.results
    return folded.continue
  }

  try {
    // 1. MERGE. --no-ff always (see MERGE_ARGS in the core for why).
    try {
      git([...MERGE_ARGS, branch], { stdio: ['ignore', 'pipe', 'pipe'] })
      step('merge', VERDICT.ok, `${branch} -> main`)
    } catch (e) {
      // A conflicted merge is ABORTED, not left in the index: a half-merged main
      // is the worst half state this chain could leave, and the session that has
      // to resolve it should start from a clean tree.
      try {
        git(['merge', '--abort'], { stdio: 'ignore' })
      } catch {
        /* nothing to abort */
      }
      error = new LandingError('the merge failed', {
        step: 'merge',
        repair: 'merge by hand, resolve the conflict CAREFULLY, re-run the relevant regression, then re-run this command',
      })
      step('merge', VERDICT.failed, `${(e && (e.stderr || e.message)) || e}`.split('\n')[0])
      throw error
    }

    // 2. FAST GATE.
    const gateSteps = ['build', 'lint', 'unit', ...(audit.run ? ['audit'] : [])]
    const gateResults = await runGate(gateSteps, gate.mode)
    const red = gateResults.filter((r) => !r.ok)
    if (red.length) {
      for (const r of red) console.error(`\n--- ${r.id} ---\n${r.output}`)
      error = new LandingError('the fast gate is red', {
        step: 'gate',
        repair: `fix ${red.map((r) => r.id).join(', ')}, then re-run — main already carries the merge, so re-running resumes from the gate`,
      })
      step('gate', VERDICT.failed, `${gate.mode}: ${red.map((r) => r.id).join(', ')} red`)
      throw error
    }
    step('gate', VERDICT.ok, `${gate.mode}: ${gateSteps.join(', ')} green${audit.run ? '' : ` (audit skipped — ${audit.reason})`}`)

    // 3+4. TICK AND ARCHIVE MOVE — ONE transition, two files.
    const tasksText = readIf(TASKS)
    const archiveText = readIf(ARCHIVE)
    const moved = tickAndArchive({ tasksText, archiveText, number })

    // The guard that governs the split judges the RESULT before it is written, so
    // the chain can never INTRODUCE a state tasks-archive-guard would block. The
    // before-verdict is taken too: a finding the work order already carried is not
    // this landing's to answer for, and blocking on it would stall every landing
    // behind an unrelated repair.
    const accepted = transitionAccepted({
      before: evaluateTasksArchive({ tasksText, archiveText }),
      after: evaluateTasksArchive({ tasksText: moved.tasks, archiveText: moved.archive }),
    })
    if (accepted.preexisting?.length) {
      console.error(
        `land-point: the work order already carries ${accepted.preexisting.length} archive finding(s) ` +
          `this landing did not cause: ${accepted.preexisting.map((f) => f.rule).join(', ')}`,
      )
    }
    if (!accepted.ok) {
      error = new LandingError('the tick would leave a state tasks-archive-guard blocks', {
        step: 'tick',
        repair: accepted.findings.map((f) => `${f.rule}: ${f.detail}`).join('; '),
      })
      step('tick', VERDICT.failed, accepted.findings.map((f) => f.rule).join(', '))
      throw error
    }

    // ARCHIVE FIRST, then the removal. A crash between the two leaves a DUPLICATE
    // (which tasks-archive-guard names, and whose repair is one deletion) rather
    // than a LOST point (which nothing would name at all).
    writeTextAtomic(ARCHIVE, moved.archive)
    step('archive', VERDICT.ok, `${moved.block.split('\n').length} lines moved`)
    writeTextAtomic(TASKS, moved.tasks)
    step('tick', VERDICT.ok, `point ${number} ticked and removed from TASKS.md`)

    // 5. COMMIT THE TICK AND PUSH MAIN. Until this lands, the merge commit exists
    // only locally and the tick only as an uncommitted edit — the one window in
    // which a machine loss loses the point outright, and the reason nothing may
    // be deleted before it. The push runs the pre-push gate, which re-runs the
    // full gate on main; that duplication is the price of not bypassing a guard,
    // and it is what the manual chain paid too.
    try {
      git(['add', '--', 'TASKS.md', 'docs/tasks-archive.md'])
      git(['commit', '-m', tickCommitMessage({ number, model })], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      error = new LandingError('the tick could not be committed', {
        step: 'push',
        repair: 'commit TASKS.md + docs/tasks-archive.md by hand and push main — the tick is written but NOT durable',
      })
      step('push', VERDICT.failed, `${(e && (e.stderr || e.message)) || e}`.split('\n').slice(-1)[0])
      throw error
    }
    try {
      git(['push', 'origin', 'main'], { stdio: ['ignore', 'pipe', 'pipe'] })
      step('push', VERDICT.ok, 'tick committed, main pushed')
    } catch (e) {
      error = new LandingError('main could not be pushed', {
        step: 'push',
        repair: 'git push origin main — the tick IS committed locally, and the feature branch is still intact',
      })
      step('push', VERDICT.failed, `${(e && (e.stderr || e.message)) || e}`.split('\n').slice(-1)[0])
      throw error
    }

    // 6. BOARD PUBLISH (rider b: skipped when nothing changed). Re-decided here
    // against the state as it now stands on disk: the plan's decision was taken
    // against the same POST-tick work order, but the board file and the recorded
    // publish state may have moved since — a publish is cheap, a stale page is
    // a blocked next turn.
    board = boardDecision(moved.tasks)
    if (board.run) {
      try {
        sh('node', [join('scripts', 'board-publish.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
        step('board', VERDICT.ok, board.reason)
      } catch (e) {
        error = new LandingError('the board publish failed', {
          step: 'board',
          // NOT "re-run this command": the tick has landed, so a re-run dies at
          // the tick step with "not in TASKS.md". The publisher is the repair.
          repair: 'node scripts/board-publish.mjs — the point itself has landed; only the board is behind',
        })
        step('board', VERDICT.failed, `${(e && (e.stderr || e.message)) || e}`.split('\n').slice(-1)[0])
        throw error
      }
    } else {
      step('board', VERDICT.skipped, board.reason)
    }

    // 7. CLEANUP: worktrees first (a tree holding the branch blocks its deletion),
    // then the local branch, then the remote.
    const problems = []
    for (const path of worktrees) {
      try {
        sh('node', [join('scripts', 'worktree-cleanup.mjs'), path], { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (e) {
        problems.push(`worktree ${path}: ${(e && (e.stderr || e.message)) || e}`.split('\n')[0])
      }
    }
    try {
      git(['branch', '-d', branch], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      problems.push(`local branch: ${(e && (e.stderr || e.message)) || e}`.split('\n')[0])
    }
    try {
      git(['push', 'origin', '--delete', branch], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      problems.push(`remote branch: ${(e && (e.stderr || e.message)) || e}`.split('\n')[0])
    }
    if (problems.length) {
      // NOT a failure of the landing — the point IS on main, ticked and archived.
      // Reported loudly as debris, because `branch-hygiene-guard` is the backstop
      // and a silent leftover is what filled the repository on 28.07.2026.
      step('cleanup', VERDICT.failed, problems.join(' | '))
      error = new LandingError('the point landed, but its branch/worktree could not be removed', {
        step: 'cleanup',
        repair: `node scripts/worktree-cleanup.mjs <path>; git branch -D ${branch}; git push origin --delete ${branch}`,
      })
      throw error
    }
    step('cleanup', VERDICT.ok, worktrees.length ? `branch + ${worktrees.length} worktree(s)` : 'branch')
  } catch (e) {
    if (!(e instanceof LandingError)) {
      error = new LandingError(`${(e && e.message) || e}`, { step: 'unknown' })
      results = [...results, { id: 'unknown', verdict: VERDICT.failed, detail: error.message }]
    }
  }

  const full = markNotReached({ plan, results })
  console.log(formatLandingVerdict({ number, branch, results: full, error }).join('\n'))
  if (error) console.error(`\nland-point: ${error.message}`)
  // WHAT IT DID AND DID NOT DO, stated so the reader never has to assume. The
  // first version of this epilogue listed only the picture verify and the
  // boundary, which read as "everything else is handled" while the tick was in
  // fact left uncommitted — the omission was the bug's cover.
  console.log(
    '\nDONE BY THIS COMMAND: the merge, the gate, the tick, the archive move, the tick\n' +
      'COMMIT and the push of main, the board publish and the branch/worktree cleanup.\n' +
      'NOT DONE: the picture verification on both backends (it belongs BEFORE the merge,\n' +
      'on the branch), and the point boundary — run\n' +
      `  node scripts/batch-boundary.mjs ${number}\n` +
      'and end the session.',
  )
  return landingExit(full)
}

if (isMainModule(import.meta.url)) {
  main(process.argv).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`land-point: ${(e && e.stack) || e}`)
      process.exit(1)
    },
  )
}
