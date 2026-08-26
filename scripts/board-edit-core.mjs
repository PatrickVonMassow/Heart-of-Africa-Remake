// Dependency-injected controller for a board edit. The core owns no direct I/O,
// so Vitest can drive the exact write -> publish -> retry sequence without
// touching the real board or its live branch.
import { boardMissingPoints } from './board-currency-core.mjs'
import { parseTasks } from './dashboard-guard-core.mjs'
import { dropStrayNowCards, normaliseLineEndings, renderCardCriticalities, upgradeNowCards } from './board-core.mjs'
import { PUBLISH_CMD } from './board-remedy.mjs'

const firstLine = (text) => String(text ?? '').trim().split('\n')[0]

const publishPreconditionError = (missing) =>
  new Error(
    `publish precondition refused before writing — the board does not show open point(s) ${missing.join(', ')}. ` +
      'Give each of them a card first: node scripts/board-queue.mjs',
  )

/**
 * Apply one pure card transform, then rotate and publish it.
 *
 * A known publish refusal is checked against the transformed bytes before
 * `write` runs. Failures that can only be discovered later report the durable
 * write as their first output line, before the refusal and its remedy.
 */
export function runBoardEdit({
  html,
  tasksText,
  transform,
  done,
  write,
  rotate,
  preparePublish = () => {},
  publish,
  // THE DERIVED STATE CARD, refreshed on every edit (point 749). Injected, so
  // the controller stays free of the three state stores it would otherwise have
  // to read; identity by default, which is what the unit layer wants. It runs
  // AFTER the transform and the sweep: the card is a rendering of state, so the
  // last word on it belongs to the state, not to the command that happened to
  // touch the board.
  derive = (document) => document,
  stdout = () => {},
  stderr = () => {},
} = {}) {
  const swept = dropStrayNowCards(normaliseLineEndings(html))
  const edited = dropStrayNowCards(
    renderCardCriticalities(
      derive(upgradeNowCards(normaliseLineEndings(transform(swept.html)))),
      tasksText,
    ),
  )
  const missing = boardMissingPoints(edited.html, parseTasks(tasksText).open)
  if (missing.length) throw publishPreconditionError(missing)

  write(edited.html)

  const reportDropped = () => {
    for (const { title, text } of swept.dropped) {
      stderr(`board: dropped the current-work card "${title}" — it named neither a point nor a state.`)
      stderr(`  its text, so nothing is lost unsaid: ${text}`)
    }
  }
  const reportFailure = (stage, error, { sourceStale = false } = {}) => {
    stderr(`BOARD FILE WRITTEN — ${done}`)
    reportDropped()
    stderr(String(error?.stderr ?? '').trimEnd() || `${stage} failed: ${error?.message ?? error}`)
    if (sourceStale) {
      // THE ONE STAGE WHOSE REMEDY IS NOT A PUBLISH (ninth cross-vendor round).
      // When the record of what is in flight is the thing that failed, it still
      // describes the board as it stood BEFORE this edit — and publishing
      // projects that record, so the shared remedy would put back a card the
      // edit has just finished or returned to the queue.
      stderr(
        'The ACTIVE-WORK RECORD was NOT updated: it still describes the board as it stood BEFORE this ' +
          'edit. Do NOT publish yet — the publish projects that record and would undo this edit. ' +
          'Reconcile the record first (node scripts/batch-in-flight.mjs --status says what it holds), ' +
          `then: ${PUBLISH_CMD}`,
      )
    } else {
      stderr(`The LIVE page was NOT updated — fix the above, then: ${PUBLISH_CMD}`)
    }
    return { html: edited.html, written: true, published: false }
  }

  // THE AUTHORITATIVE RECORD FOLLOWS THE DURABLE WRITE IMMEDIATELY (sixth
  // cross-vendor round). It used to run after archive rotation, so a rotation
  // that failed left the board changed and the active-work declaration stale —
  // and the failure message's own remedy, a standalone publish, then projected
  // the OLD membership over the new board, which can put a card back for a
  // point the edit has just finished or returned to the queue. Nothing may sit
  // between the board write and the record of what it means.
  try {
    preparePublish()
  } catch (error) {
    return reportFailure('board state update', error, { sourceStale: true })
  }

  let rotated
  try {
    rotated = firstLine(rotate())
  } catch (error) {
    return reportFailure('board archive rotation', error)
  }

  let published
  try {
    published = firstLine(publish())
  } catch (error) {
    return reportFailure('board publish', error)
  }

  stdout(done)
  reportDropped()
  stdout(rotated)
  stdout(published)
  stdout('The live page is updated. NEXT: node scripts/board.mjs attest')
  return { html: edited.html, written: true, published: true }
}
