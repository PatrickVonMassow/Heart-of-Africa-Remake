// Durable once-per-session state for the attended context-ceiling notice.
// The decision is pure in session-context-ceiling-core; this file gives each
// top-level session its own marker so two attended windows cannot clobber a
// shared read/modify/write map.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'
import { attendedCeilingNoticeDecision } from './session-context-ceiling-core.mjs'

export const ATTENDED_CONTEXT_NOTICE_DIR = repoPath('.claude/context-ceiling-notices')

export function attendedContextNoticePath(sessionId, dir = ATTENDED_CONTEXT_NOTICE_DIR) {
  const key = createHash('sha256').update(String(sessionId ?? '')).digest('hex').slice(0, 24)
  return resolve(dir, `${key}.json`)
}

/** Read the marker and make the pure decision. This does not consume the notice. */
export function prepareAttendedContextNotice(input, { dir = ATTENDED_CONTEXT_NOTICE_DIR } = {}) {
  const sessionId = String(input?.sessionId ?? '').trim()
  if (!sessionId) return { speak: false, reason: 'no-session-id', path: null }
  const path = attendedContextNoticePath(sessionId, dir)
  return {
    ...attendedCeilingNoticeDecision({ ...input, alreadyNotified: existsSync(path) }),
    path,
  }
}

/** Mark only after the hook has written the notice to stdout. */
export function markAttendedContextNotice(prepared, { now = Date.now } = {}) {
  if (prepared?.speak !== true || !prepared.path) return false
  try {
    mkdirSync(dirname(prepared.path), { recursive: true })
    writeJsonAtomic(prepared.path, {
      v: 1,
      at: now(),
      tokens: prepared.tokens,
      ceiling: prepared.ceiling,
    })
    return true
  } catch {
    return false // a marker failure may repeat a warning; it may not break the prompt
  }
}
