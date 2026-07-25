// Shared fs/git source collector for the retrospective-currency toolchain
// (retro-refresh.mjs + retro-currency-guard.mjs). BOTH scripts must gather
// the sources through this one module, or their fingerprints could disagree
// and either trap the session in a refresh loop or let staleness through.
// The pure classification/fingerprint logic lives in retro-core.mjs.
//
// Failure contract: a missing memory dir or absent TASKS.md contributes an
// empty list (a legitimate machine state both sides see identically); a
// FAILING subprocess (git) THROWS instead of degrading, because a transient
// git error seen by only one side would fabricate a fingerprint mismatch —
// the guard wrapper's fail-open catches the throw and allows the stop.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  MEMORY_TYPES,
  escalationCount,
  guardScriptNames,
  parseMemoryDescription,
  parseMemoryType,
  processTaskPoints,
  revertCommits,
} from './retro-core.mjs'

// Under Vitest the module URL is not file-scheme; the repo root then falls
// back to the test runner's cwd (the repo/worktree root — same place).
export const REPO_ROOT = (() => {
  try {
    return fileURLToPath(new URL('..', import.meta.url))
  } catch {
    return resolve(process.cwd())
  }
})()

/** The retrospective document (git-ignored; overridable for the test harness). */
export const DOC_PATH =
  process.env.RETRO_DOC_PATH || resolve(REPO_ROOT, 'docs', 'analysis_de', 'retrospektive-zusammenarbeit.md')

/** The beginner guide, derived from the same sources but pure prose — kept
 *  current by an explicit review attestation rather than regeneration. */
export const GUIDE_PATH =
  process.env.RETRO_GUIDE_PATH || resolve(REPO_ROOT, 'docs', 'analysis_de', 'vibe-coding-anleitung.md')

/**
 * The project memory dir under ~/.claude/projects/<munged repo path>/memory.
 * The munging mirrors the harness: every ':' '\' '/' becomes '-', the drive
 * letter is lowercased (C:\Users\... -> c--Users-...).
 */
export function defaultMemoryDir(repoRoot = REPO_ROOT) {
  const munged = resolve(repoRoot).replace(/[:\\/]/g, '-').replace(/-+$/, '')
  const lowered = munged.charAt(0).toLowerCase() + munged.slice(1)
  return resolve(homedir(), '.claude', 'projects', lowered, 'memory')
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

/** Feedback/project memory entries: [{name, description, hash, escalations}]. */
export function collectMemories(memoryDir) {
  if (!memoryDir || !existsSync(memoryDir)) return []
  const out = []
  for (const file of readdirSync(memoryDir)) {
    if (!file.endsWith('.md')) continue
    const text = readFileSync(resolve(memoryDir, file), 'utf8')
    const type = parseMemoryType(text)
    if (!MEMORY_TYPES.has(type)) continue // MEMORY.md index and reference notes stay out
    out.push({
      name: basename(file, '.md'),
      description: parseMemoryDescription(text),
      hash: sha256(text),
      escalations: escalationCount(text),
    })
  }
  return out
}

/**
 * The canonical source structure for computeFingerprint/buildRows:
 * {memories, guards, reverts, processPoints}. All paths overridable for
 * tests; the defaults are the live repo/memory locations.
 */
export function collectSources({
  repoRoot = REPO_ROOT,
  memoryDir = process.env.RETRO_MEMORY_DIR || defaultMemoryDir(repoRoot),
  scriptsDir = resolve(repoRoot, 'scripts'),
  tasksPath = resolve(repoRoot, 'TASKS.md'),
} = {}) {
  const memories = collectMemories(memoryDir)
  const guards = existsSync(scriptsDir) ? guardScriptNames(readdirSync(scriptsDir)) : []
  // Full-history subjects; a git failure throws (see the failure contract above).
  const log = execSync('git log --format="%H %s"', {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  const reverts = revertCommits(log)
  const processPoints = existsSync(tasksPath)
    ? processTaskPoints(readFileSync(tasksPath, 'utf8'))
    : []
  return { memories, guards, reverts, processPoints }
}
