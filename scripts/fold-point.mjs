// FOLD A POINT AWAY — tick, archive move and Erledigt card in one command (point 614).
//
//   node scripts/fold-point.mjs 613 --into 720 --model "Claude Opus 5"
//   node scripts/fold-point.mjs 613 --delivered "der Fix sitzt seit c0ffee in main" --model "…"
//   node scripts/fold-point.mjs 613 --into 720 --model "…" --dry        print the plan, touch nothing
//   node scripts/fold-point.mjs 613 --into 720 --text-stdin --model "…" German card text on stdin
//
// A FOLD IS NOT A LANDING. Nothing was built, so there is no branch, no merge and
// no gate — but the WORK ORDER moves exactly as it does at a landing, and the
// board must say so. Until this command existed it could not: `board.mjs done`
// needs a current-work card, `promote` needs a queue card, and the Warteschlange
// is derived from the OPEN work order the point has just left, so the Erledigt
// card the dashboard audit demands was unreachable and `--waive-audit` was the
// only way past it. See scripts/fold-point-core.mjs for every decision this file
// merely performs.
//
// IT STOPS AT THE FIRST RED, and it leaves no half state: every refusal a fold
// can produce is produced in the VALIDATE step, before a byte is written, and a
// board edit that fails afterwards ROLLS THE WORK ORDER BACK to what it was.
//
// IT BYPASSES NO GUARD. The tick+archive transition is handed to
// `evaluateTasksArchive` — the same core the Stop-hook guard uses — before it is
// written, and the board edit runs through the same `withBoardEditLock` +
// `runBoardEdit` plumbing as `scripts/board.mjs`, so rotation, the publish
// precondition and the publish itself all happen inside the transaction.
//
// IT DOES NOT PUSH. The caller pushes, the same way it does after a hand-made
// bookkeeping commit.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { writeTextAtomic } from './atomic-write.mjs'
import { evaluateTasksArchive } from './tasks-archive-guard-core.mjs'
import { evaluateCommitTrailers } from './model-guard-core.mjs'
import { berlinStamp, resolveCardText, TEXT_STDIN_FLAG } from './board-core.mjs'
import { runBoardEdit } from './board-edit-core.mjs'
import { withBoardEditLock } from './board-edit-lock.mjs'
import {
  LandingError,
  VERDICT,
  foldResult,
  markNotReached,
  transitionAccepted,
} from './land-point-core.mjs'
import {
  USAGE,
  foldBoardTransform,
  foldCommitMessage,
  formatFoldVerdict,
  parseFoldArgs,
  planFold,
  validateFold,
} from './fold-point-core.mjs'

const TASKS = join(REPO_ROOT, 'TASKS.md')
const ARCHIVE = join(REPO_ROOT, 'docs', 'tasks-archive.md')
const BOARD_FILE = join(REPO_ROOT, '.batch-dashboard.html')

/** The tracked files a fold may commit. The board file and its queue data are
 *  git-ignored (`.gitignore` lines 51/55), so they never enter a commit — the
 *  live page is the board's durability, not git. */
const COMMIT_PATHS = Object.freeze(['TASKS.md', 'docs/tasks-archive.md'])

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, ...opts }).trim()

const git = (args, opts = {}) => sh('git', args, opts)

const readIf = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

const firstLine = (e) => `${(e && (e.stderr || e.message)) || e}`.split('\n').filter(Boolean).slice(-1)[0] ?? ''

/**
 * One board transaction: promote the card and close it into Erledigt in the SAME
 * edit, then rotate and publish — all inside the cross-process lock, exactly as
 * `scripts/board.mjs` does it, so a launcher writing the board at the same moment
 * cannot lose either edit.
 *
 * `tasksText` is read HERE rather than handed in, and that is deliberate: the
 * publish precondition (`boardMissingPoints`) must judge against the work order
 * as it now stands on disk — post-tick — or it would refuse the very card this
 * command exists to write.
 */
function editBoard(transform, done) {
  return withBoardEditLock(() =>
    runBoardEdit({
      html: readFileSync(BOARD_FILE, 'utf8'),
      tasksText: readFileSync(TASKS, 'utf8'),
      transform,
      done,
      write: (html) => writeTextAtomic(BOARD_FILE, html),
      rotate: () => sh('node', [join('scripts', 'board-archive-rotate.mjs')]),
      publish: () => sh('node', [join('scripts', 'board-publish.mjs')]),
      stdout: (line) => console.log(line),
      stderr: (line) => console.error(line),
    }),
  )
}

function main(argv) {
  let args
  try {
    args = parseFoldArgs(argv.slice(2))
  } catch (e) {
    console.error(`fold-point: ${e.message}`)
    console.error(USAGE)
    return 2
  }
  if (args.number == null) {
    console.error('fold-point: no point number given')
    console.error(USAGE)
    return 2
  }

  // WHERE IT MAY RUN. The tick is main-only (CLAUDE.md §6), so a fold started on
  // a feature branch or in a worktree would write the work order where it must
  // never be written. Refused up front, by name. `--dry` is exempt: it reads.
  if (!args.dry) {
    if (resolve(process.cwd()) !== resolve(REPO_ROOT)) {
      console.error(`fold-point: run this from the MAIN tree (${REPO_ROOT}), not from a worktree.`)
      return 2
    }
    const head = git(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (head !== 'main') {
      console.error(`fold-point: HEAD is on "${head}" — check out main first. The tick is main-only.`)
      return 2
    }
  }

  // THE CARD TEXT, from the argv or from stdin. Read ONLY when asked for: reading
  // fd 0 unconditionally would block every call that has no pipe attached.
  let text = args.text
  if (args.textStdin) {
    if (text) {
      console.error(`fold-point: ${TEXT_STDIN_FLAG} takes the WHOLE text — drop the --text argument ("${text}")`)
      return 2
    }
    let piped = ''
    try {
      piped = readFileSync(0, 'utf8')
    } catch (e) {
      console.error(`fold-point: ${TEXT_STDIN_FLAG} could not read stdin (${e.code ?? e.message}) — pipe the text in`)
      return 2
    }
    try {
      text = resolveCardText([TEXT_STDIN_FLAG], piped)
    } catch (e) {
      console.error(`fold-point: ${e.message}`)
      return 2
    }
  }

  const willCommit = !args.dry && !args.noCommit

  // THE AUTHORING MODEL, CHECKED BEFORE ANYTHING MOVES — the trailer is
  // model-guard's only evidence of who authored the commit, and a fold that
  // discovered the problem after the tick would have to be unwound by hand.
  let message = ''
  if (willCommit) {
    try {
      message = foldCommitMessage({ number: args.number, into: args.into, delivered: args.delivered, model: args.model })
    } catch (e) {
      console.error(`fold-point: ${e.message}`)
      if (e.repair) console.error(`  repair: ${e.repair}`)
      return 2
    }
    if (evaluateCommitTrailers(message).block) {
      console.error(
        `fold-point: --model "${args.model}" is not an allowed authoring model (CLAUDE.md §6).\n` +
          '  Name the model actually running this fold.',
      )
      return 2
    }
  }

  // 1. VALIDATE — the whole refusal surface, while a rollback is still free.
  const tasksText = readIf(TASKS)
  const archiveText = readIf(ARCHIVE)
  let checked
  try {
    checked = validateFold({
      tasksText,
      archiveText,
      boardHtml: readIf(BOARD_FILE),
      number: args.number,
      into: args.into,
      delivered: args.delivered,
      text,
    })
  } catch (e) {
    if (!(e instanceof LandingError)) throw e
    console.error(`fold-point: ${e.message}`)
    if (e.repair) console.error(`  repair: ${e.repair}`)
    return 1
  }

  // The guard that governs the split judges the RESULT before it is written, so a
  // fold can never INTRODUCE a state tasks-archive-guard would block. A finding
  // the work order already carried is reported but not charged to this fold —
  // blocking on it would stall every fold behind an unrelated repair.
  const accepted = transitionAccepted({
    before: evaluateTasksArchive({ tasksText, archiveText }),
    after: evaluateTasksArchive({ tasksText: checked.moved.tasks, archiveText: checked.moved.archive }),
  })
  if (accepted.preexisting?.length) {
    console.error(
      `fold-point: the work order already carries ${accepted.preexisting.length} archive finding(s) ` +
        `this fold did not cause: ${accepted.preexisting.map((f) => f.rule).join(', ')}`,
    )
  }
  if (!accepted.ok) {
    console.error('fold-point: the tick would leave a state tasks-archive-guard blocks')
    console.error(`  repair: ${accepted.findings.map((f) => `${f.rule}: ${f.detail}`).join('; ')}`)
    return 1
  }

  // A DIRTY WORK ORDER IS REFUSED, and only the work order: the main tree may
  // legitimately carry other uncommitted work, but an edit sitting in TASKS.md or
  // the archive would be swept into this fold's commit without anybody deciding
  // it should be.
  if (willCommit) {
    const dirty = git(['status', '--porcelain', '--', ...COMMIT_PATHS])
    if (dirty) {
      console.error(
        'fold-point: the work order already has uncommitted changes. Commit or stash them first —\n' +
          "otherwise they land inside the fold's commit.\n" +
          dirty,
      )
      return 2
    }
  }

  const plan = planFold({
    number: args.number,
    into: args.into,
    delivered: args.delivered,
    cardText: checked.cardText,
    // What a REAL run would do: `--dry` prints the plan, so the commit step must
    // not read as skipped merely because this invocation writes nothing.
    commit: !args.noCommit,
  })

  if (args.dry) {
    console.log(`fold plan for point ${args.number} — DRY, nothing was touched`)
    for (const s of plan.steps) {
      console.log(`  ${s.run ? 'RUN ' : 'SKIP'} ${s.id.padEnd(8)} ${s.label}${s.reason ? ` — ${s.reason}` : ''}`)
    }
    console.log(`  the Erledigt card would read: ${checked.cardText}`)
    console.log(`  its card comes from the ${checked.card.from} section`)
    return 0
  }

  let results = []
  let error = null
  let livePageBehind = false
  const step = (id, verdict, detail) => {
    results = foldResult(results, { id, verdict, detail }).results
  }
  step('validate', VERDICT.ok, plan.steps.find((s) => s.id === 'validate').reason)

  // 2+3. TICK AND ARCHIVE MOVE — ONE transition, two files, both texts computed
  // before either is written. ARCHIVE FIRST: a crash between the two leaves a
  // DUPLICATE (which tasks-archive-guard names, and whose repair is one deletion)
  // rather than a LOST point (which nothing would name at all).
  try {
    writeTextAtomic(ARCHIVE, checked.moved.archive)
    writeTextAtomic(TASKS, checked.moved.tasks)
  } catch (e) {
    step('tick', VERDICT.failed, firstLine(e))
    error = new LandingError('the work order could not be written', {
      step: 'tick',
      repair: 'check the working tree with git status — nothing else has run yet',
    })
  }

  if (!error) {
    step('tick', VERDICT.ok, `point ${args.number} ticked and removed from TASKS.md`)
    step('archive', VERDICT.ok, `${checked.moved.block.split('\n').length} lines moved`)

    // 4. THE BOARD, in ONE edit. It runs after the tick because the publish
    // precondition reads the open work order off TASKS.md.
    try {
      const result = editBoard(
        foldBoardTransform({
          point: args.number,
          cardText: checked.cardText,
          stamp: berlinStamp(),
          next: args.next,
          nextStatus: args.nextStatus,
          // A bare `--none` must reach the "needs a reason" refusal, not the one
          // for a forgotten successor: the caller DID choose this way out.
          none: args.hasNone ? args.none || ' ' : '',
        }),
        `${args.number} archived as done — ${checked.cardText}`,
      )
      if (result.published) {
        step('board', VERDICT.ok, 'card moved to Erledigt and published')
      } else {
        // The board FILE carries the right content and the work order matches it;
        // only the live page is behind. Rolling the tick back here would replace a
        // stale page with an inconsistent repository, which is worse — so the fold
        // finishes and the missing publish is named loudly instead.
        livePageBehind = true
        step('board', VERDICT.ok, 'card moved to Erledigt — but the LIVE PAGE was NOT updated')
      }
    } catch (e) {
      // NOTHING WAS WRITTEN: `runBoardEdit` only throws before its write (a
      // refused transform, the publish precondition), and the lock throws before
      // the transaction starts at all. So the work order goes back to what it was
      // and the fold leaves no half state.
      writeTextAtomic(TASKS, tasksText)
      writeTextAtomic(ARCHIVE, archiveText)
      step('board', VERDICT.failed, firstLine(e))
      error = new LandingError('the board edit failed — the tick was ROLLED BACK', {
        step: 'board',
        repair:
          e instanceof LandingError && e.repair
            ? e.repair
            : 'fix what the message above names, then re-run this command — TASKS.md and the archive are untouched',
      })
    }
  }

  // 5. COMMIT. Exactly the files this command changed, by pathspec: a fold must
  // not sweep in whatever else the main tree happens to be carrying. The board
  // file and its queue data are git-ignored, so the transition IS these two.
  if (!error && willCommit) {
    try {
      git(['commit', '-m', message, '--', ...COMMIT_PATHS], { stdio: ['ignore', 'pipe', 'pipe'] })
      step('commit', VERDICT.ok, COMMIT_PATHS.join(', '))
    } catch (e) {
      step('commit', VERDICT.failed, firstLine(e))
      error = new LandingError('the fold could not be committed', {
        step: 'commit',
        repair: `git commit -- ${COMMIT_PATHS.join(' ')} — the tick and the board are DONE but not durable`,
      })
    }
  } else if (!error) {
    step('commit', VERDICT.skipped, '--no-commit')
  }

  const full = markNotReached({ plan, results })
  console.log(formatFoldVerdict({ number: args.number, into: args.into, delivered: args.delivered, results: full, error }).join('\n'))
  if (error) {
    console.error(`\nfold-point: ${error.message}`)
    return 1
  }
  if (livePageBehind) {
    console.error('\nfold-point: the live page is BEHIND — run: node scripts/board-publish.mjs')
    return 1
  }
  console.log(
    '\nDONE BY THIS COMMAND: the tick, the archive move, the Erledigt card, the board\n' +
      'publish and the commit.\n' +
      `NOT DONE: the push — run: git push origin main`,
  )
  return 0
}

if (isMainModule(import.meta.url)) {
  try {
    process.exit(main(process.argv))
  } catch (e) {
    console.error(`fold-point: ${(e && e.stack) || e}`)
    process.exit(1)
  }
}
