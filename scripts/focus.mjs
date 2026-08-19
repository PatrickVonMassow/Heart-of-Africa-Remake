// Declare/confirm the CURRENT work focus — the primitive the dashboard Stop
// guard holds the now-card against (invariants 5-8 in dashboard-guard-core.mjs).
// The machine cannot know what the assistant is actually doing; this makes the
// assistant SAY it in a checkable form, at every pivot:
//
//   node scripts/focus.mjs set <pointNumber> "<one line what>"   # on every switch
//   node scripts/focus.mjs set - "<one line>"                    # non-point work
//   node scripts/focus.mjs confirm    # after a user prompt / periodically:
//                                     # "I checked — focus and now-card still match"
//   node scripts/focus.mjs show       # inspect
//
// `confirm` REFUSES (exit 1) while NO now-card names the declared focus — the
// mismatch must be reconciled, not acknowledged away. The match is against ANY
// now-card in the section, never only the first (point 713): several strands
// legitimately stand at once, the section's order is the render's to decide
// (the focused strand first), and reading the first card made opening a second
// strand silently move the focus. `set` and `confirm` clear the pending
// pivot-check marker the UserPromptSubmit hook arms on every user prompt.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  REPO_ROOT,
  STATE_PATH,
  FOCUS_PATH,
  PENDING_PATH,
  readJson,
  writeJsonAtomic,
  removeFile,
} from './dashboard-state.mjs'
import { parseNowCardPoints } from './dashboard-guard-core.mjs'
import { REPUBLISH } from './board-remedy.mjs'

/** ALL point numbers the registered dashboard's now-cards carry (empty Set:
 *  unknown/none) — the focus must name ONE OF them, whatever their order. */
function cardPoints() {
  try {
    const state = readJson(STATE_PATH)
    if (!state || !state.dashboardPath) return new Set()
    return parseNowCardPoints(readFileSync(resolve(REPO_ROOT, state.dashboardPath), 'utf8'))
  } catch {
    return new Set()
  }
}

/** The now-card points as a readable list, for the messages. */
const cardList = (points) => (points.size ? [...points].join(', ') : '<no parseable point>')

const usage = () => {
  console.error(
    'usage: node scripts/focus.mjs set <pointNumber|-> "<one line what>"\n' +
      '       node scripts/focus.mjs confirm\n' +
      '       node scripts/focus.mjs show',
  )
  process.exit(1)
}

const cmd = process.argv[2]

if (cmd === 'set') {
  const raw = process.argv[3]
  const note = process.argv[4]
  if (!raw || !note) usage()
  const point = raw === '-' || raw.toLowerCase() === 'none' ? null : Number(raw)
  if (point !== null && (!Number.isInteger(point) || point <= 0)) {
    console.error(`focus set: "${raw}" is neither a TASKS point number nor "-"`)
    process.exit(1)
  }
  const now = Date.now()
  writeJsonAtomic(FOCUS_PATH, { point, note, setAt: now, confirmedAt: now })
  removeFile(PENDING_PATH)
  console.log(`focus declared: ${point ?? '-'} — ${note}`)
  const cp = cardPoints()
  if (point != null && !cp.has(point)) {
    console.log(
      `NOTE: no dashboard now-card names ${point} (the section carries ${cardList(cp)}) — add or retitle ` +
        `its card, then ${REPUBLISH}, or the Stop guard will block the turn.`,
    )
  }
  process.exit(0)
}

if (cmd === 'confirm') {
  const focus = readJson(FOCUS_PATH)
  if (!focus) {
    console.error('focus confirm: no focus declared — use: node scripts/focus.mjs set <N> "<what>"')
    process.exit(1)
  }
  const cp = cardPoints()
  if (focus.point != null && !cp.has(focus.point)) {
    console.error(
      `focus confirm REFUSED: no now-card names the declared focus ${focus.point} ("${focus.note ?? ''}") — ` +
        `the section carries ${cardList(cp)}. Reconcile first — update the card (+ republish ` +
        '+ --synced) or re-declare via focus.mjs set.',
    )
    process.exit(1)
  }
  writeJsonAtomic(FOCUS_PATH, { ...focus, confirmedAt: Date.now() })
  removeFile(PENDING_PATH)
  console.log(`focus confirmed: ${focus.point ?? '-'} — ${focus.note ?? ''}`)
  process.exit(0)
}

if (cmd === 'show') {
  const focus = readJson(FOCUS_PATH)
  const pending = readJson(PENDING_PATH)
  console.log(`declared focus : ${focus ? `${focus.point ?? '-'} — ${focus.note ?? ''}` : '<none>'}`)
  if (focus) {
    console.log(`last confirmed : ${new Date(focus.confirmedAt ?? focus.setAt ?? 0).toISOString()}`)
  }
  console.log(`now-card points: ${cardPoints().size ? [...cardPoints()].join(', ') : '<none/unknown>'}`)
  console.log(`pivot check    : ${pending ? `PENDING (since ${new Date(pending.at ?? 0).toISOString()})` : 'clear'}`)
  process.exit(0)
}

usage()
