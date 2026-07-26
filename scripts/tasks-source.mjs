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
import { fileURLToPath } from 'node:url'

export const TASKS_PATH = fileURLToPath(new URL('../TASKS.md', import.meta.url))
export const ARCHIVE_PATH = fileURLToPath(new URL('../docs/tasks-archive.md', import.meta.url))

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
