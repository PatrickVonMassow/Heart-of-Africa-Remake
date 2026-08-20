// One place that knows the work order is stored in TWO files (user 26.07.2026).
//
// WHY: TASKS.md had grown to 13 000 lines, of which 10 000 were points long since
// finished. Every turn that consulted the work order carried that history along.
// The finished points therefore moved to docs/tasks-archive.md, verbatim and in
// order, and TASKS.md keeps only the OPEN work plus its framing sections.
//
// Consumers split into two kinds, and confusing them is the way this change
// breaks something:
//   - Those that ask "what is still to do" (the resume hook, the progress guard,
//     the queue-order guard) read TASKS.md alone — the archive holds nothing open.
//   - Those that need the FULL universe of point numbers, because they must
//     recognise a point as CLOSED (the dashboard integrity, card-topic and sync
//     checks: a queue card whose point is ticked is stale), read both through
//     `readTasksAll` below.
// A consumer of the second kind that forgets the archive silently stops seeing
// finished points — it would not fail, it would just never complain again.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

export const TASKS_PATH = resolve(REPO_ROOT, 'TASKS.md')
export const ARCHIVE_PATH = resolve(REPO_ROOT, 'docs/tasks-archive.md')

const read = (p) => {
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : ''
  } catch {
    return ''
  }
}

/** The open work order alone (TASKS.md). */
export function readTasksOpen(path = TASKS_PATH) {
  return read(path)
}

/**
 * The whole work order — open points and the archived finished ones — as one
 * text, so a parser written for a single file keeps working unchanged. The
 * archive is appended, never prepended: point order in the combined text then
 * still runs open-then-archived, and no parser that stops at the first section
 * heading loses the open half.
 */
export function readTasksAll(tasksPath = TASKS_PATH, archivePath = ARCHIVE_PATH) {
  const open = read(tasksPath)
  const archived = read(archivePath)
  if (!archived) return open
  return `${open}\n${archived}`
}

/**
 * HOW MANY POINTS ARE OPEN, AND IS THE FILE STILL PARSEABLE? PURE — the texts
 * are handed in, so every caller reads the files the way it must (the launcher
 * lets a missing TASKS.md throw and bails on it).
 *
 * `alarm` is the FORMAT ALARM: checkbox lines exist but not one of them parses
 * as a point, and the archive holds no tick either. That combination means a
 * reformat, never a finished batch, and everything that could spawn a session
 * off this reading must stop instead of concluding "nothing left to do". The
 * escape hatch reads the ARCHIVE rather than TASKS.md, because since the split
 * of 26.07.2026 a ticked point LEAVES TASKS.md at once — looking for `- [x]`
 * here could never succeed again, and every all-DEFERRED file would raise a
 * false alarm.
 *
 * It lives here rather than in either caller because two of them now ask:
 * scripts/batch-autostart.mjs (which may not resurrect a batch on an
 * unreadable work order) and scripts/chat-watcher.mjs (which may not wake a
 * responder on one). A second copy of the rule would drift silently — both
 * callers only ever see its verdict, never its reasoning.
 */
export function openPointStatus({ tasksText = '', archiveText = '' } = {}) {
  let open = 0
  let sawCheckbox = false
  for (const line of String(tasksText).split('\n')) {
    if (/^- \[/.test(line)) sawCheckbox = true
    if (/^- \[ \] \d+\./.test(line) && !/\bDEFERRED\b/.test(line)) open++
  }
  const ticksExist = /- \[x\] \d+\./.test(String(archiveText))
  return { open, alarm: open === 0 && sawCheckbox && !ticksExist }
}
