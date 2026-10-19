// Point 372 — one command for the board instead of six.
//
// Keeping the board current used to cost six tool calls per change (edit,
// publish, the since-retired mirror, --synced, focus, prep), several times per
// point, each billed at the whole context. That is also why the board lagged: a
// six-step ritual gets postponed, a two-step one (an edit, then `attest`) does not.
//
//   node scripts/board.mjs now    <point> "<status>"  # queue → current work
//   node scripts/board.mjs status <point> "<text>"    # restate a now-card's status
//   node scripts/board.mjs title  <point> "<text>"    # retitle a now- OR queue card
//   node scripts/board.mjs queue  <point> ["<text>"]  # current work → back to queue
//   node scripts/board.mjs done   <point> ["<text>"] --next <m> "<status>"
//                                                     # archive + promote in ONE write
//   node scripts/board.mjs done   <point> --none "<reason>"   # …or name the gap
//   node scripts/board.mjs none   "<reason>"           # the gap card, no point to close
//   node scripts/board.mjs closing <point> [--title "<Betreff>"] "<reason>"
//                                                     # …still owed: its closing duties
//   node scripts/board.mjs eta    <point> "<HH:MM>"    # a now-card's expected end
//   node scripts/board.mjs promote <point> "<times>" "<title>" "<status>"
//                                                     # write a now-card directly
//   node scripts/board.mjs describe <point> "<text>"  # rewrite a card's description
//                                                     # (only when the requirement changes)
//   node scripts/board.mjs migrate-descriptions       # one-time description/status split
//   node scripts/board.mjs merge-done                 # fold duplicate Erledigt cards
//   node scripts/board.mjs backfill-times [--dry-run] # record start/sessions of old cards
//   node scripts/board.mjs vdzk-add "<title>" "<question>"
//                                                     # ask the user a decision
//                                                     # (--automated: accepted, ignored)
//   node scripts/board.mjs vdzk-remove "<title>"      # drop an answered question
//   node scripts/board.mjs log-add "Entscheidungsprotokoll: <title>" "<record>"
//                                                     # a decision taken, for veto
//   node scripts/board.mjs log-remove "<title>"       # drop a vetoed record
//   node scripts/board.mjs vdzk-keep "<title>" [...] [--session <id>] # message did not answer it
//   node scripts/board.mjs focus  <point> "<note>"    # declare focus + stamp
//   node scripts/board.mjs attest                     # rotate, audit (--synced), confirm prep
//
// (`paused` only redirects: a pause is derived state since point 749.)
//
// GERMAN TEXT GOES IN ON STDIN (point 410). Wherever a "<text>" stands above,
// `--text-stdin` may take its place and the text is read from stdin as UTF-8:
//
//   node scripts/board.mjs status 410 --text-stdin <<'EOF'
//   Stand 12:40: Die Umlaute überleben den Weg aufs Board jetzt.
//   EOF
//
// The argument form still works and is fine for ASCII; a Windows shell mangles
// umlauts on the way, which is why every session used to transliterate by hand.
// `--none` takes it too — that gap card is written at every session boundary, so
// it was the last place a German text still reached the board as an argument:
//
//   node scripts/board.mjs done 434 --none --text-stdin <<'EOF'
//   Der Punkt ist abgeschlossen. Ich übergebe an eine frische Sitzung …
//   EOF
//
// A BLANK LINE IN THE PIPED TEXT BECOMES A PARAGRAPH (point 439). The
// conciseness guard blocks a long body squeezed into one <p>, and until now the
// only way to split one was hand-editing the board HTML.
//
// Every editing command publishes the live page itself, so the loop is exactly:
// (1) an editing command, (2) `attest`.
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  DECISION_RECORD_PREFIX,
  TEXT_STDIN_FLAG,
  addDecisionRecord,
  addVdzk,
  isDecisionRecordTitle,
  berlinStamp,
  closeCard,
  DESCRIPTION_MISSING_TEXT,
  migrateCardDescriptions,
  describedSection,
  setCardDescription,
  parseClosingArgs,
  parseDoneArgs,
  pointSubject,
  promoteToNow,
  promotionEstimateWarning,
  removeDecisionRecord,
  removeVdzk,
  resolveCardText,
  setCardStatus,
  setCardTimes,
  setCardTitle,
  toClosingWork,
  toNoCurrentWork,
  toNow,
  toQueue,
  mergeDoneDuplicates,
  runCardTimesBackfill,
  queueEstimateHours,
  recordPromotion,
  resolveBerlinClock,
  spanOf,
  timesEndClock,
} from './board-core.mjs'
import { runBoardEdit } from './board-edit-core.mjs'
import { withDerivedState } from './board-state.mjs'
import { recordDecisionCardKeep } from './decision-card-guard.mjs'
import { writeTextAtomic } from './atomic-write.mjs'
import { QUEUE_DATA_PATH, setQueueEntry } from './board-queue-core.mjs'
import { readJson } from './dashboard-state.mjs'
import { FOCUS_PATH } from './dashboard-state.mjs'
import { readDeclaration, writeDeclaration } from './batch-in-flight.mjs'
import { transitionActiveDeclaration } from './active-work-source.mjs'
import { withBoardEditLock } from './board-edit-lock.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { settledRulingVerdict } from './settled-ruling-core.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const ARCHIVE = resolve(REPO_ROOT, '.batch-dashboard-archive.html')
// The recorded start, session count, expected end and end per point (user
// 05.10.2026): the card header is rendered from it, so a successor session no
// longer writes its takeover time over the start.
const CARD_TIMES_PATH = resolve(REPO_ROOT, '.claude/board-card-times.json')
const ACTIVITY_LOG = resolve(REPO_ROOT, '.claude/batch-activity.jsonl')
const PUBLISH_SCRIPT = 'scripts/board-publish.mjs'
const run = (args) => execFileSync(process.execPath, args, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' })
const git = (args) => {
  try {
    return execFileSync('git', args, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  } catch {
    return ''
  }
}

const readCardTimes = () => {
  const store = readJson(CARD_TIMES_PATH)
  return store && typeof store.points === 'object' ? store : { v: 1, points: {} }
}
/** The record an edit produced; written together with the board file (see applyEdit). */
let pendingCardTimes = null
const stageCardTimes = (store) => {
  pendingCardTimes = store
}
const sessionId = () => readDeclaration()?.sessionId || process.env.CLAUDE_SESSION_ID || ''

/**
 * Per point: the first and last commit of its feat/ branch — merged into main
 * (the merge's range; the merge itself is the last) or still a local/remote
 * branch. The fallback start of a card and the retroactive pass's trace.
 */
function branchTraces(points) {
  const want = new Set(points.map(String))
  const traces = {}
  const add = (point, first, last) => {
    const t = (traces[point] ??= { firstCommit: null, lastCommit: null })
    if (first && (!t.firstCommit || first < t.firstCommit)) t.firstCommit = first
    if (last && (!t.lastCommit || last > t.lastCommit)) t.lastCommit = last
  }
  const toIso = (d) => new Date(d).toISOString()
  for (const line of git(['log', '--merges', '--first-parent', '--format=%H%x09%cI%x09%s', 'main']).split('\n')) {
    const [sha, at, subject] = line.split('\t')
    const point = (String(subject ?? '').match(/Merge (?:remote-tracking )?(?:branch )?'?(?:origin\/)?feat\/(\d+)-/) ?? [])[1]
    if (!point || !want.has(point)) continue
    const dates = git(['log', '--format=%aI', `${sha}^1..${sha}^2`]).split('\n').filter(Boolean).map(toIso).sort()
    if (dates.length) add(point, dates[0], toIso(at))
  }
  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/heads/feat', 'refs/remotes/origin/feat']).split('\n')
  for (const ref of refs) {
    const point = (ref.match(/\/feat\/(\d+)-/) ?? [])[1]
    if (!point || !want.has(point)) continue
    const dates = git(['log', '--format=%aI', `main..${ref}`]).split('\n').filter(Boolean).map(toIso).sort()
    if (dates.length) add(point, dates[0], dates.at(-1))
  }
  return traces
}

/** Distinct session ids the activity log names per point — the session trace of old cards. */
function sessionTraces(points) {
  const want = new Set(points.map(String))
  const seen = {}
  let text = ''
  try {
    text = readFileSync(ACTIVITY_LOG, 'utf8')
  } catch {
    return {}
  }
  for (const line of text.split('\n')) {
    const m = line.match(/"session":"([^"]+)","point":(\d+)/)
    if (m && want.has(m[2])) (seen[m[2]] ??= new Set()).add(m[1])
  }
  return Object.fromEntries(Object.entries(seen).map(([p, s]) => [p, [...s]]))
}

/** Record a promotion of `point` and return the span its header renders. */
function promoteTimes(store, point, { now, eta }) {
  const key = String(point)
  const fallbackStart = store.points[key] ? null : branchTraces([key])[key]?.firstCommit
  store.points[key] = recordPromotion(store.points[key], { now, session: sessionId(), fallbackStart, eta })
  stageCardTimes(store)
  return spanOf(store.points[key], { now })
}

/** Record the end of `point`; null (legacy header) when it was never recorded. */
function finishTimes(store, point, { now }) {
  const key = String(point)
  if (!store.points[key]?.start) return null
  store.points[key] = { ...store.points[key], end: now.toISOString() }
  stageCardTimes(store)
  return spanOf(store.points[key], { now })
}

const etaFromHours = (now, hours) => (hours == null ? null : new Date(now.getTime() + hours * 3600000))

// STDIN IS READ ONCE, AND ONLY WHEN ASKED FOR (point 410): reading fd 0
// unconditionally would block every call that has no pipe attached. Explicit
// UTF-8 — the whole reason this path exists is that the bytes must not be
// reinterpreted by anything between the author and the board file.
const stdinText = process.argv.includes(TEXT_STDIN_FLAG)
  ? (() => {
      try {
        return readFileSync(0, 'utf8')
      } catch (e) {
        throw new Error(`${TEXT_STDIN_FLAG} could not read stdin (${e.code ?? e.message}) — pipe the text in`)
      }
    })()
  : ''


/**
 * The German subject of a point that no longer stands on the BOARD: the archive
 * page it was rotated into, else the queue data file the titles are kept in
 * (both survive the card itself). Null when neither knows it — `toClosingWork`
 * then names `--title` as the way in.
 */
function fallbackSubject(point) {
  const archive = resolve(REPO_ROOT, '.batch-dashboard-archive.html')
  if (existsSync(archive)) {
    const found = pointSubject(readFileSync(archive, 'utf8'), point)
    if (found) return found
  }
  const data = readJson(resolve(REPO_ROOT, QUEUE_DATA_PATH))
  const title = data?.points?.[String(Number(point))]?.title
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

/** `.claude/board-queue.json`, where each point's German card description is kept; null when unreadable. */
function readQueueData() {
  return readJson(resolve(REPO_ROOT, QUEUE_DATA_PATH))
}

/**
 * Serialize the ENTIRE board transaction, not merely its atomic replacement.
 * The launcher can redeem an answered card while an owner is working; without
 * this lock both processes can read the same board and the later write silently
 * resurrects one edit. Rotation and publish stay inside too, so the transaction
 * reports and publishes the board version it actually wrote.
 */
function edit(fn, done) {
  return withBoardEditLock(() => applyEdit(fn, done))
}

function editPrepared(fn, done, preparePublish = () => {}) {
  return withBoardEditLock(() => applyEdit(fn, done, preparePublish))
}

/** Apply a pure card edit, rotate the archive overflow, publish, and say what is left by hand. */
function applyEdit(fn, done, preparePublish = () => {}) {
  // Both ends of the round trip name their encoding (point 410). The write used
  // to take the platform default, which is the other half of the way a German
  // card could reach the file as something the reader sees as damage.
  // ATOMIC (point 443, four-eyes F3). A kill mid-write left torn local bytes,
  // the doctor read the hash mismatch as "the publish is behind", and its repair
  // pushed the torn HTML to the page the user reads from their phone.
  // LF-NORMALISED (point 439): an editor that once wrote this file back in
  // Windows text mode left it MIXED, and the archive rotation then could not
  // find the Erledigt section at all — `attest` crashed on a board that looked
  // perfect in the browser. No writer has to be trusted with the line ending.
  // UPGRADED ON THE WAY OUT (point 655): a card still carrying its number inside
  // its title is lifted into the numbered chip, and the two state cards get
  // their kind marker. The board is one living file — without this the only way
  // to satisfy the new publish gate would be a hand edit, the act that wrecked
  // the line endings above.
  // A CARD THAT NAMES NEITHER A POINT NOR A STATE IS DROPPED, on the way IN as
  // well as out (four-eyes review, 12.08.2026): nothing else can remove one —
  // every point command needs the number it lacks, and a numbered card standing
  // beside it blocks the state writers — so the board would stay unpublishable.
  // It is said out loud, because an edit that silently swallowed a card's prose
  // would be its own defect.
  pendingCardTimes = null
  const result = runBoardEdit({
    html: readFileSync(BOARD, 'utf8'),
    tasksText: readTasksAll(),
    transform: fn,
    done,
    write: (html) => {
      writeTextAtomic(BOARD, html)
      if (pendingCardTimes) writeTextAtomic(CARD_TIMES_PATH, `${JSON.stringify(pendingCardTimes, null, 2)}\n`)
    },
    rotate: () => run(['scripts/board-archive-rotate.mjs']),
    preparePublish,
    publish: () => run([PUBLISH_SCRIPT, '--locked']),
    derive: (html) => withDerivedState(html),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  })
  if (!result.published) process.exitCode = 1
}

/** Update the structured active source inside the same board transaction. */
function prepareActiveTransition({
  focusPoint = undefined,
  exitPoint = null,
  note = 'board lifecycle transition',
  // MAY THIS STILL BE ROLLED BACK (sixth cross-vendor round)? Only while no
  // board write has become durable yet — the focus-only command. Run as a
  // board edit's prepare step, the edited board is already on disk, so undoing
  // the declaration would make the two disagree in the OTHER direction and the
  // publish remedy would then project the old membership over the new board.
  // There the new state stands and the focus store is named as the thing that
  // is behind.
  rollbackable = false,
} = {}) {
  return () => {
    const declaration = readDeclaration()
    if (declaration) {
      // EVERY transition is a write, so every transition migrates: a legacy
      // item gets its resolved point RECORDED (fifth cross-vendor round), on
      // the focus path as much as on an exit — the sixth round found the
      // migration skipped when nothing exited. The exit then filters on the
      // RECORDED point alone: nothing is probed, guessed or retired here —
      // an unattributable item survives and the read side names the human
      // way out.
      writeDeclaration(transitionActiveDeclaration(declaration, {
        exitPoint,
        focusPoint: focusPoint === undefined ? declaration.focusPoint ?? null : focusPoint,
      }))
    }
    try {
      if (focusPoint !== undefined) {
        console.log(run(['scripts/focus.mjs', 'set', focusPoint == null ? '-' : String(focusPoint), note]).trim())
      } else if (exitPoint != null) {
        const focus = readJson(FOCUS_PATH)
        if (Number(focus?.point) === Number(exitPoint)) {
          console.log(run(['scripts/focus.mjs', 'set', '-', note]).trim())
        }
      }
    } catch (error) {
      // ROLLBACK (eighth cross-review): the declaration is written FIRST, so a
      // focus step that fails here would leave the two stores contradicting
      // each other — the very split-brain this shared transition exists to
      // close, with the edit lock offering no rollback of its own. The
      // declaration write is in-process and restorable; the focus subprocess
      // failed and wrote nothing. Where the transition is rollbackable, restore;
      // either way, fail the command loudly.
      if (!rollbackable) {
        throw new Error(
          `${error.message} — the board edit is already written, so the active-work record KEEPS the new ` +
            'state and the focus store is the one left behind. Fix the cause, then: node scripts/focus.mjs ' +
            `set ${focusPoint == null ? '-' : String(focusPoint)} "${note}"`,
        )
      }
      if (declaration) {
        try {
          writeDeclaration(declaration)
        } catch (rollbackError) {
          throw new Error(
            `${error.message} — AND rolling the active-work declaration back failed too ` +
              `(${rollbackError.message}): the two active-work stores may now disagree; ` +
              're-run this command once the cause is fixed.',
          )
        }
      }
      throw error
    }
  }
}

const [cmd, ...rest] = process.argv.slice(2)
/** The command's text, from the argv or — with `--text-stdin` — from stdin. */
const textOf = (words) => resolveCardText(words, stdinText)
try {
  if (cmd === 'status') {
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs status <point> "<text>"|--text-stdin')
    const at = berlinStamp()
    edit((html) => setCardStatus(html, point, textOf(words), at), `status of ${point} restated (Stand ${at})`)
  } else if (cmd === 'eta') {
    const [point, when] = rest
    if (!point || !when) throw new Error('usage: board.mjs eta <point> "<HH:MM>"')
    edit((html) => {
      const store = readCardTimes()
      const entry = store.points[String(point)]
      if (!entry?.start || entry.end) return setCardTimes(html, point, when)
      const now = new Date()
      const eta = resolveBerlinClock(String(when).replace(/^~\s*/, ''), now, { future: true })
      if (!eta) return setCardTimes(html, point, when) // refuses the malformed time itself
      store.points[String(point)] = { ...entry, eta: eta.toISOString() }
      stageCardTimes(store)
      return setCardTimes(html, point, when, { span: spanOf(store.points[String(point)], { now }) })
    }, `${point} is now expected to be done by ~${when}`)
  } else if (cmd === 'paused') {
    // THERE IS NOTHING TO COMMAND HERE ANY MORE (point 749). A pause used to be
    // written — first as a user-decision card, then briefly onto the running
    // point's own status line, which overwrote the status the reader needed. It
    // is DERIVED now, from `.claude/batch-paused`, on every edit and every
    // publish, so a paused batch shows up without being told and stops showing
    // up when the marker goes.
    throw new Error(
      'board: the pause is not written, it is derived. Pause the batch itself — ' +
        'node scripts/batch-pause.mjs "<Grund>" — and the board reports it on the next edit; ' +
        'clearing the pause marker removes the card again with no board command at all.',
    )
  } else if (cmd === 'title') {
    // RETITLING HAD NO COMMAND AT ALL for a now-card (point 439), so the three
    // current-work cards of 30.07.2026 were fixed by hand-editing the HTML — the
    // edit that then wrecked the line endings. The queue side is written to the
    // DATA file as well: the Warteschlange is a projection, so a title that lived
    // only in the HTML would evaporate on the next rebuild.
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs title <point> "<text>"|--text-stdin')
    const title = textOf(words)
    edit((html) => setCardTitle(html, point, title), `${point} retitled: ${title}`)
    const dataFile = resolve(REPO_ROOT, QUEUE_DATA_PATH)
    writeTextAtomic(dataFile, `${JSON.stringify(setQueueEntry(readJson(dataFile), point, { title }), null, 2)}\n`)
    console.log(`the title is kept in ${QUEUE_DATA_PATH}, so a queue rebuild does not undo it`)
  } else if (cmd === 'now') {
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs now <point> "<status>"|--text-stdin')
    const at = berlinStamp()
    // READ BEFORE THE MOVE: once the queue card is gone, nothing can say whether
    // it carried an estimate — and a now-card promoted without one renders a
    // start time and no expected end, which is the invisibility point 439 ends.
    const noEstimate = promotionEstimateWarning(readFileSync(BOARD, 'utf8'), point)
    editPrepared(
      (html) => {
        const now = new Date()
        const span = promoteTimes(readCardTimes(), point, { now, eta: etaFromHours(now, queueEstimateHours(html, point)) })
        return toNow(html, point, textOf(words), { stamp: at, queueData: readQueueData(), span })
      },
      `${point} is current work since ${at} (title and estimate taken from its queue card)`,
      prepareActiveTransition({ focusPoint: Number(point), note: `point ${point}: current work` }),
    )
    if (noEstimate) console.error(noEstimate)
  } else if (cmd === 'queue') {
    const [point, ...words] = rest
    if (!point) throw new Error('usage: board.mjs queue <point> ["<text>"|--text-stdin]')
    editPrepared(
      (html) => toQueue(html, point, { text: textOf(words), recorded: readCardTimes().points[String(point)] ?? null }),
      `${point} returned to the queue`,
      prepareActiveTransition({ exitPoint: Number(point), note: `point ${point}: returned to queue` }),
    )
  } else if (cmd === 'done') {
    // ONE edit, one write (point 416): archiving and the successor go into the
    // same document, so the board is never observed without current work.
    const { point, words, next, nextWords, noneWords, hasNone } = parseDoneArgs(rest)
    if (!point) {
      throw new Error(
        'usage: board.mjs done <point> ["<text>"] [--next <m> "<status>" | --none "<reason>"] ' +
          `(any "<text>" may be ${TEXT_STDIN_FLAG} — including --none's reason)`,
      )
    }
    const at = berlinStamp()
    const noEstimate = next == null ? null : promotionEstimateWarning(readFileSync(BOARD, 'utf8'), next)
    editPrepared(
      (html) => {
        const now = new Date()
        const store = readCardTimes()
        const span = finishTimes(store, point, { now })
        const nextSpan =
          next == null ? null : promoteTimes(store, next, { now, eta: etaFromHours(now, queueEstimateHours(html, next)) })
        return closeCard(html, point, {
          span,
          nextSpan,
          text: textOf(words),
          end: at,
          next,
          nextStatus: next == null ? '' : textOf(nextWords),
          // A bare `--none` must reach the "needs a reason" refusal, not the
          // one for a forgotten successor: the caller DID choose this way out.
          none: hasNone ? textOf(noneWords) || ' ' : '',
          queueData: readQueueData(),
        })
      },
      next != null
        ? `${point} archived as done at ${at}; ${next} is current work in the same edit`
        : hasNone
          ? `${point} archived as done at ${at}; the board now names why nothing is running`
          : `${point} archived as done at ${at}`,
      prepareActiveTransition({
        exitPoint: Number(point),
        focusPoint: next == null ? null : Number(next),
        note: next == null ? `point ${point}: completed` : `point ${next}: current work after ${point}`,
      }),
    )
    if (noEstimate) console.error(noEstimate)
  } else if (cmd === 'none') {
    // THE GAP CARD WITHOUT A POINT TO CLOSE (point 470). `done <n> --none` needs
    // a current-work card for the point it closes, so at a boundary — where the
    // point is already ticked and its card already archived — there was NO
    // sanctioned way to put this card up, and the session hand-edited the board
    // file. Hand-edits append: three idle cards ended up stacked on the user's
    // phone and one of those edits broke the section markup. The card is a STATE,
    // so writing it replaces any that stands (see `toNoCurrentWork`).
    //
    // WRITING IT IS A CLAIM TO STOP: `board-first-guard` denies the next
    // state-changing call while it stands.
    const reason = textOf(rest)
    if (!reason) throw new Error(`usage: board.mjs none "<reason>"|${TEXT_STDIN_FLAG}`)
    const at = berlinStamp()
    edit(
      (html) => toNoCurrentWork(html, reason, { stamp: at }),
      `the board now names why nothing is running (Stand ${at}) — this is a claim to STOP: the ` +
        'board gate denies the next state-changing call while it stands.',
    )
  } else if (cmd === 'closing') {
    // THE THIRD THING A SESSION CAN SAY (point 544). Between "a numbered point"
    // and "nothing is running" sat a real state with no card: the point is merged
    // and ticked, and its closing duties — the four-eyes record on the tick
    // commit, the retrospective's new problem class — are still owed. Under the
    // idle card the point-470 deny stopped every one of those calls, and its two
    // remedies could not reach the state: `now <N>` needs an open point with a
    // queue card, `none` rewrites only the reason. So the work stalled and the
    // session had to raise the next queue point early just to get a card it could
    // stand behind. This card says it truthfully, and the deny lets the duties
    // through; `board.mjs none` at the boundary replaces it with the idle card.
    //
    // IT NAMES ITS POINT (point 655). The title was one constant sentence for
    // every point — "Abschlussarbeiten zum gerade beendeten Punkt" — so the card
    // said the STAGE and nothing else, and the reader on his phone learned
    // neither which point had ended nor what it was about. The command takes the
    // point and composes the title from the subject the board already knows, so
    // the caller cannot get it wrong; `--title` covers the case where the point
    // stands nowhere on the board any more.
    const { point, subject, words } = parseClosingArgs(rest)
    if (!point) throw new Error(`usage: board.mjs closing <point> ["--title <Betreff>"] "<reason>"|${TEXT_STDIN_FLAG}`)
    const reason = textOf(words)
    if (!reason) throw new Error(`usage: board.mjs closing <point> "<reason>"|${TEXT_STDIN_FLAG}`)
    const at = berlinStamp()
    const known = subject || fallbackSubject(point)
    edit(
      (html) => toClosingWork(html, point, { subject: known, reason, stamp: at, queueData: readQueueData() }),
      `the board now names point ${point} and the closing duties still owed (Stand ${at}) — this is ` +
        'NOT a claim to stop: the board gate lets those duties through. End with ' +
        'node scripts/board.mjs none "<Grund, der den nächsten Punkt nennt>".',
    )
  } else if (cmd === 'vdzk-add') {
    // EVERY decision asked of the user belongs here (point 421): the chat is an
    // inbox he writes into, not a board he reads. `decision-card-guard` blocks a
    // turn whose reply asks for a decision with no card standing for it, and this
    // is the command its remedy names.
    // `--automated` remains accepted for existing callers, but no longer selects
    // a stricter path: every card reaches the same typed admissibility rule.
    const [title, ...words] = rest.filter((arg) => arg !== '--automated')
    if (!title || (words.length === 0 && !stdinText.trim())) {
      throw new Error('usage: board.mjs vdzk-add [--automated] "<title>" "<question>"|--text-stdin')
    }
    // A DECISION ALREADY TAKEN IS NO QUESTION (user order 22.09.2026): its
    // record belongs in the decision log, which has its own command.
    if (isDecisionRecordTitle(title)) {
      throw new Error(
        `vdzk-add REFUSED — "${title}" is a decision record, not an open question; it goes in the ` +
          `decision log: node scripts/board.mjs log-add "${DECISION_RECORD_PREFIX} <Titel>" --text-stdin`,
      )
    }
    const question = textOf(words)
    const settled = settledRulingVerdict(`${title}\n${question}`)
    if (settled.block) throw new Error(`vdzk-add REFUSED — ${settled.reason}`)
    edit((html) => addVdzk(html, title, question), `open question added: ${title}`)
  } else if (cmd === 'vdzk-remove') {
    const fragment = textOf(rest)
    if (!fragment) throw new Error('usage: board.mjs vdzk-remove "<title>"|--text-stdin')
    edit((html) => removeVdzk(html, fragment), `open question removed: ${fragment}`)
  } else if (cmd === 'log-add') {
    const [title, ...words] = rest.filter((arg) => arg !== '--automated')
    if (!title || (words.length === 0 && !stdinText.trim())) {
      throw new Error(`usage: board.mjs log-add "${DECISION_RECORD_PREFIX} <title>" "<record>"|--text-stdin`)
    }
    edit((html) => addDecisionRecord(html, title, textOf(words)), `decision record added: ${title}`)
  } else if (cmd === 'log-remove') {
    const fragment = textOf(rest)
    if (!fragment) throw new Error('usage: board.mjs log-remove "<title>"|--text-stdin')
    edit((html) => removeDecisionRecord(html, fragment), `decision record removed: ${fragment}`)
  } else if (cmd === 'vdzk-keep') {
    // --session <id> names the session without an environment variable, so a
    // standing-down non-owner can run the guard's printed command as is.
    const sessionAt = rest.indexOf('--session')
    const sessionId = sessionAt < 0 ? '' : rest[sessionAt + 1] ?? ''
    const args = sessionAt < 0 ? rest : [...rest.slice(0, sessionAt), ...rest.slice(sessionAt + 2)]
    const whyAt = args.indexOf('--why')
    const fragments = whyAt < 0 ? args : args.slice(0, whyAt)
    const whyWords = whyAt < 0 ? [] : args.slice(whyAt + 1)
    if (!fragments.length || (whyAt >= 0 && whyWords.length !== 1) || (sessionAt >= 0 && !sessionId)) {
      throw new Error('usage: board.mjs vdzk-keep "<title>" [...] [--why "<reason>"] [--session <id>]')
    }
    const kept = recordDecisionCardKeep(fragments, whyWords[0] ?? '', sessionId ? { sessionId } : {})
    console.log(`message recorded as not answering: ${kept.join(' | ')}`)
  } else if (cmd === 'promote') {
    const [point, times, title, ...words] = rest
    if (!point || !times || !title || words.length === 0) {
      throw new Error('usage: board.mjs promote <point> "<times>" "<title>" "<status>"|--text-stdin')
    }
    editPrepared(
      (html) => {
        // The caller's "<times>" gives the expected end only; the start is the record's.
        const now = new Date()
        const clock = timesEndClock(times)
        const span = promoteTimes(readCardTimes(), point, {
          now,
          eta: clock ? resolveBerlinClock(clock, now, { future: true }) : null,
        })
        return promoteToNow(html, point, { title, times, status: textOf(words), queueData: readQueueData(), span })
      },
      `${point} promoted to current work`,
      prepareActiveTransition({ focusPoint: Number(point), note: `point ${point}: promoted to current work` }),
    )
  } else if (cmd === 'describe') {
    // THE ONLY WRITER OF A CARD'S DESCRIPTION once the card exists (user
    // 05.10.2026): used when the requirement itself changes, never for progress.
    const [point, ...words] = rest
    if (!point || words.length === 0) throw new Error('usage: board.mjs describe <point> "<text>"|--text-stdin')
    const text = textOf(words)
    edit((html) => {
      const out = setCardDescription(html, point, text)
      // A queue card is a projection of the data file: the description lives
      // there too, written inside the same locked transaction, before publish.
      if (describedSection(html, point) === 'queue') {
        const dataFile = resolve(REPO_ROOT, QUEUE_DATA_PATH)
        writeTextAtomic(dataFile, `${JSON.stringify(setQueueEntry(readJson(dataFile), point, { body: text }), null, 2)}\n`)
      }
      return out
    }, `description of ${point} rewritten`)
  } else if (cmd === 'migrate-descriptions') {
    // ONE-TIME (user 05.10.2026 / 14.10.2026): split every card into description
    // and status. Idempotent — an already split card is left alone.
    let report = null
    edit((html) => {
      const r = migrateCardDescriptions(html, readQueueData())
      report = r
      return r.html
    }, 'cards split into description and status')
    if (report) {
      const { counts, missing, skipped } = report
      console.log(
        `board: split now ${counts.now}, queue ${counts.queue}, done ${counts.done} card(s); ` +
          `"${DESCRIPTION_MISSING_TEXT}" stays on now [${missing.now.join(', ')}], done [${missing.done.join(', ')}] ` +
          `(${missing.now.length + missing.done.length} card(s)); queue stubs without prose: ${missing.queue.length}; ` +
          `queue cards left unsplit (body is not plain paragraphs): [${skipped.join(', ')}]`,
      )
    }
  } else if (cmd === 'merge-done') {
    // One point, one Erledigt card. `done` folds them at write time; this is for
    // a board that already carries duplicates (point 700 stood there four times).
    const folded = []
    edit((html) => {
      const r = mergeDoneDuplicates(html)
      folded.push(...r.merged)
      return r.html
    }, 'Erledigt duplicates folded')
    console.log(
      folded.length
        ? `board: folded duplicate Erledigt cards for point(s) ${folded.join(', ')}`
        : 'board: no duplicate Erledigt cards',
    )
  } else if (cmd === 'backfill-times') {
    // RETROACTIVE (user 14.10.2026): every card without a record — Erledigt and
    // the archive included — gets one from its traces; untraceable ones keep their value.
    const dryRun = rest.includes('--dry-run')
    const now = new Date()
    const traceOf = (points) => {
      const traces = branchTraces(points)
      const sessions = sessionTraces(points)
      for (const [point, t] of Object.entries(traces)) {
        t.sessionIds = sessions[point] ?? []
        t.sessions = Math.max(1, t.sessionIds.length)
      }
      return traces
    }
    const tx = runCardTimesBackfill({
      dryRun,
      now,
      readBoard: () => readFileSync(BOARD, 'utf8'),
      readArchive: () => (existsSync(ARCHIVE) ? readFileSync(ARCHIVE, 'utf8') : null),
      readStore: readCardTimes,
      traceOf,
      editBoard: (transform, afterWrite) =>
        editPrepared(
          (html) => {
            const out = transform(html)
            stageCardTimes(out.store)
            return out.html
          },
          'card times rendered from the record',
          afterWrite,
        ),
      writeArchive: (html) => writeTextAtomic(ARCHIVE, html),
    })
    if (tx) {
      console.log(
        `board: ${tx.cards} card(s) of ${tx.points} point(s); records added for ${tx.added.length} point(s); ` +
          `${tx.untraceable.length} point(s) untraceable, their cards keep their value; ` +
          `${tx.rendered} card(s) rendered from the record` +
          (dryRun ? ' (dry run, nothing written)' : ''),
      )
    }
  } else if (cmd === 'focus') {
    const [point, ...words] = rest
    const note = textOf(words)
    if (!point || !note) throw new Error('usage: board.mjs focus <point> "<note>"|--text-stdin')
    // A focus switch is an active-work TRANSITION like now/done (seventh
    // cross-review): writing only the focus FILE left the structured source's
    // declaration.focusPoint on the old strand — a split-brain the publish
    // could project as the old order while the set-check blessed it. The
    // shared transition writes both stores in the same locked publish.
    const focusPoint = point === '-' || point.toLowerCase() === 'none' ? null : Number(point)
    if (focusPoint !== null && (!Number.isInteger(focusPoint) || focusPoint <= 0)) {
      throw new Error(`board: focus "${point}" is neither a TASKS point number nor "-"`)
    }
    withBoardEditLock(() => {
      // The one caller with NO durable board write before it: nothing is on
      // disk yet, so a failed focus step is undone rather than announced.
      prepareActiveTransition({ focusPoint, note, rollbackable: true })()
      console.log(run([PUBLISH_SCRIPT, '--locked']).trim().split('\n')[0])
    })
  } else if (cmd === 'attest') {
    // UNDER THE SAME LOCK AS EVERY OTHER BOARD WRITE (ninth cross-vendor round):
    // attest ROTATES the archive, so it is a read-modify-write of the board file
    // like the rest, and it stood outside the lock — the one board-CLI path left
    // that could interleave with a locked edit or publish. None of the three
    // children takes the lock itself, so nothing deadlocks under it.
    withBoardEditLock(() => {
      // Rotation first: a tick that pushed the Erledigt section past its cap would
      // otherwise fail the audit two steps later, after the publish.
      console.log(run(['scripts/board-archive-rotate.mjs']).trim().split('\n')[0])
      console.log(run(['scripts/dashboard-guard.mjs', '--synced', '.batch-dashboard.html']).trim())
      console.log(run(['scripts/prep-guard.mjs', '--prepped']).trim())
    })
  } else {
    console.error(
      'usage: board.mjs now|status|title <point> "<text>" | queue <point> ["<text>"] | eta <point> "<HH:MM>" | ' +
        'done <point> ["<text>"] [--next <m> "<status>" | --none "<reason>"] | ' +
        'none "<reason>" | closing <point> ["--title <Betreff>"] "<reason>" | ' +
        'vdzk-add [--automated] "<title>" "<question>" | vdzk-remove "<title>" | ' +
        'log-add "Entscheidungsprotokoll: <title>" "<record>" | log-remove "<title>" | ' +
        'vdzk-keep "<title>" [...] [--why "<reason>"] [--session <id>] | ' +
        'promote <point> "<times>" "<title>" "<status>" | merge-done | backfill-times [--dry-run] | ' +
        'focus <point> "<note>" | attest\n' +
        `Any "<text>" may be replaced by ${TEXT_STDIN_FLAG} and piped in — use that for German prose.`,
    )
    process.exitCode = 2
  }
} catch (e) {
  console.error(`board: ${e.message}`)
  process.exitCode = 1
}
