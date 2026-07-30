// Point 372 — one command for the board instead of six.
//
// Keeping the board current used to cost six tool calls per change (edit,
// publish, mirror, --synced, focus, prep), several times per point, each
// billed at the whole context. That is also why the board lagged: a six-step
// ritual gets postponed, a one-step one does not.
//
//   node scripts/board.mjs now    <point> "<status>"  # queue → current work
//   node scripts/board.mjs status <point> "<text>"    # restate a now-card's status
//   node scripts/board.mjs title  <point> "<text>"    # retitle a now- OR queue card
//   node scripts/board.mjs queue  <point> ["<text>"]  # current work → back to queue
//   node scripts/board.mjs done   <point> ["<text>"] --next <m> "<status>"
//                                                     # archive + promote in ONE write
//   node scripts/board.mjs done   <point> --none "<reason>"   # …or name the gap
//   node scripts/board.mjs vdzk-add "<title>" "<question>"  # ask the user a decision
//   node scripts/board.mjs vdzk-remove "<title>"      # drop an answered question
//   node scripts/board.mjs focus  <point> "<note>"    # declare focus + stamp
//   node scripts/board.mjs attest                     # rotate, publish, audit, confirm
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
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  TEXT_STDIN_FLAG,
  addVdzk,
  berlinStamp,
  closeCard,
  normaliseLineEndings,
  parseDoneArgs,
  promoteToNow,
  promotionEstimateWarning,
  removeVdzk,
  resolveCardText,
  setCardStatus,
  setCardTitle,
  toNow,
  toQueue,
} from './board-core.mjs'
import { PUBLISH_CMD } from './board-remedy.mjs'
import { writeTextAtomic } from './atomic-write.mjs'
import { QUEUE_DATA_PATH, setQueueEntry } from './board-queue-core.mjs'
import { readJson } from './dashboard-state.mjs'

const BOARD = resolve(REPO_ROOT, '.batch-dashboard.html')
const PUBLISH_SCRIPT = 'scripts/board-publish.mjs'
const run = (args) => execFileSync(process.execPath, args, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' })

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


/** Apply a pure card edit, rotate the archive overflow, publish, and say what is left by hand. */
function edit(fn, done) {
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
  writeTextAtomic(BOARD, normaliseLineEndings(fn(normaliseLineEndings(readFileSync(BOARD, 'utf8')))))
  console.log(done)
  console.log(run(['scripts/board-archive-rotate.mjs']).trim().split('\n')[0])
  // THE LIVE PAGE IS PUBLISHED HERE (point 400, delta D — four-eyes finding 2).
  // This is the one-command board loop, so a loop that only synced a local copy
  // left the LIVE page behind on every edit while the due mark was cleared — the
  // launcher would then alert about a board the session had updated exactly as
  // documented, which trains the reader to ignore the one channel that speaks
  // when a session is wedged.
  //
  // A REFUSAL MUST BE READABLE (four-eyes NEW-2). The child's stdio is piped, so
  // a non-zero exit throws — and an uncaught throw here would abort the rest of
  // the loop AND reduce the publisher's whole remedy text to `e.message`. The
  // refusal is the most useful thing it ever prints, so it is printed, and the
  // mirror still runs: the board file is already written either way.
  let published = true
  try {
    console.log(run([PUBLISH_SCRIPT]).trim().split('\n')[0])
  } catch (e) {
    published = false
    console.error(String(e.stderr || '').trimEnd() || `board-publish failed: ${e.message}`)
    console.error(`The LIVE page was NOT updated — fix the above, then: ${PUBLISH_CMD}`)
    process.exitCode = 1
  }
  // The success line is GATED (four-eyes NEW-3): printed unconditionally it sat
  // two lines under "The LIVE page was NOT updated", so a session skimming the
  // tail read success in exactly the failure case this reporting exists for.
  if (published) console.log('The live page is updated. NEXT: node scripts/board.mjs attest')
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
    edit(
      (html) => toNow(html, point, textOf(words), { stamp: at }),
      `${point} is current work since ${at} (title and estimate taken from its queue card)`,
    )
    if (noEstimate) console.error(noEstimate)
  } else if (cmd === 'queue') {
    const [point, ...words] = rest
    if (!point) throw new Error('usage: board.mjs queue <point> ["<text>"|--text-stdin]')
    edit((html) => toQueue(html, point, { text: textOf(words) }), `${point} returned to the queue`)
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
    edit(
      (html) =>
        closeCard(html, point, {
          text: textOf(words),
          end: at,
          next,
          nextStatus: next == null ? '' : textOf(nextWords),
          // A bare `--none` must reach the "needs a reason" refusal, not the
          // one for a forgotten successor: the caller DID choose this way out.
          none: hasNone ? textOf(noneWords) || ' ' : '',
        }),
      next != null
        ? `${point} archived as done at ${at}; ${next} is current work in the same edit`
        : hasNone
          ? `${point} archived as done at ${at}; the board now names why nothing is running`
          : `${point} archived as done at ${at}`,
    )
    if (noEstimate) console.error(noEstimate)
  } else if (cmd === 'vdzk-add') {
    // EVERY decision asked of the user belongs here (point 421): the chat is an
    // inbox he writes into, not a board he reads. `decision-card-guard` blocks a
    // turn whose reply asks for a decision with no card standing for it, and this
    // is the command its remedy names.
    const [title, ...words] = rest
    if (!title || (words.length === 0 && !stdinText.trim())) {
      throw new Error('usage: board.mjs vdzk-add "<title>" "<question>"|--text-stdin')
    }
    edit((html) => addVdzk(html, title, textOf(words)), `open question added: ${title}`)
  } else if (cmd === 'vdzk-remove') {
    const fragment = textOf(rest)
    if (!fragment) throw new Error('usage: board.mjs vdzk-remove "<title>"|--text-stdin')
    edit((html) => removeVdzk(html, fragment), `open question removed: ${fragment}`)
  } else if (cmd === 'promote') {
    const [point, times, title, ...words] = rest
    if (!point || !times || !title || words.length === 0) {
      throw new Error('usage: board.mjs promote <point> "<times>" "<title>" "<status>"|--text-stdin')
    }
    edit(
      (html) => promoteToNow(html, point, { title, times, status: textOf(words) }),
      `${point} promoted to current work`,
    )
  } else if (cmd === 'focus') {
    const [point, ...words] = rest
    if (!point) throw new Error('usage: board.mjs focus <point> "<note>"|--text-stdin')
    console.log(run(['scripts/focus.mjs', 'set', point, textOf(words)]).trim())
  } else if (cmd === 'attest') {
    // Rotation first: a tick that pushed the Erledigt section past its cap would
    // otherwise fail the audit two steps later, after the publish.
    console.log(run(['scripts/board-archive-rotate.mjs']).trim().split('\n')[0])
    console.log(run(['scripts/dashboard-guard.mjs', '--synced', '.batch-dashboard.html']).trim())
    console.log(run(['scripts/prep-guard.mjs', '--prepped']).trim())
  } else {
    console.error(
      'usage: board.mjs now|status|title|queue <point> "<text>" | ' +
        'done <point> ["<text>"] [--next <m> "<status>" | --none "<reason>"] | ' +
        'vdzk-add "<title>" "<question>" | vdzk-remove "<title>" | ' +
        'promote <point> "<times>" "<title>" "<status>" | focus <point> "<note>" | attest\n' +
        `Any "<text>" may be replaced by ${TEXT_STDIN_FLAG} and piped in — use that for German prose.`,
    )
    process.exitCode = 2
  }
} catch (e) {
  console.error(`board: ${e.message}`)
  process.exitCode = 1
}
