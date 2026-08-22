// Filesystem adapter shared by every permission path that verifies authorship.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { checkAuthorship } from './authorship-check-core.mjs'

/** Expand the transcript spelling documentation uses without invoking a shell. */
export function expandHomePath(path, home = homedir()) {
  const raw = String(path ?? '').trim()
  if (raw === '~') return home
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(2))
  return raw
}

/** A missing/unreadable file is evidence state, not an exception. */
export function readTranscript(path) {
  const resolved = expandHomePath(path)
  if (!resolved) return { path: '', text: null, problem: 'no transcript path was recorded' }
  try {
    return { path: resolved, text: readFileSync(resolved, 'utf8'), problem: '' }
  } catch (error) {
    return {
      path: resolved,
      text: null,
      problem: `cannot read transcript ${resolved}: ${(error && error.message) || error}`,
    }
  }
}

/** Check one claim and retain which transcript path was attempted. */
export function checkAuthorshipFile({ claimedModel = '', artifactAt = '', transcriptPath = '' } = {}) {
  const transcript = readTranscript(transcriptPath)
  const result = checkAuthorship({ claimedModel, artifactAt, transcriptText: transcript.text })
  return {
    ...result,
    transcript: transcript.path || null,
    ...(transcript.problem && result.status === 'unverified' ? { reason: transcript.problem } : {}),
  }
}
