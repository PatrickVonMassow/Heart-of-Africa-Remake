// Dependency-injected controller for a board edit. The core owns no direct I/O,
// so Vitest can drive the exact write -> publish -> retry sequence without
// touching the real board or its live branch.
import { boardMissingPoints } from './board-currency-core.mjs'
import { parseTasks } from './dashboard-guard-core.mjs'
import { dropStrayNowCards, normaliseLineEndings, upgradeNowCards } from './board-core.mjs'
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
  publish,
  stdout = () => {},
  stderr = () => {},
} = {}) {
  const swept = dropStrayNowCards(normaliseLineEndings(html))
  const edited = dropStrayNowCards(upgradeNowCards(normaliseLineEndings(transform(swept.html))))
  const missing = boardMissingPoints(edited.html, parseTasks(tasksText).open)
  if (missing.length) throw publishPreconditionError(missing)

  write(edited.html)

  const reportDropped = () => {
    for (const { title, text } of swept.dropped) {
      stderr(`board: dropped the current-work card "${title}" — it named neither a point nor a state.`)
      stderr(`  its text, so nothing is lost unsaid: ${text}`)
    }
  }
  const reportFailure = (stage, error) => {
    stderr(`BOARD FILE WRITTEN — ${done}`)
    reportDropped()
    stderr(String(error?.stderr ?? '').trimEnd() || `${stage} failed: ${error?.message ?? error}`)
    stderr(`The LIVE page was NOT updated — fix the above, then: ${PUBLISH_CMD}`)
    return { html: edited.html, written: true, published: false }
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
