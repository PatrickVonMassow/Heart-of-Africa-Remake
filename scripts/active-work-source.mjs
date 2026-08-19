// Thin I/O adapter for the board's authoritative active-point projection.
// Parsing and policy live in normalizeActiveWork; this file only distinguishes
// an absent record (verified zero is possible) from a present unreadable one
// (unknown, so Stop allows but publication refuses).
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { IN_FLIGHT_PATH } from './batch-singleton.mjs'
import { FOCUS_PATH } from './dashboard-state.mjs'
import { evidencePoint, normalizeActiveWork } from './batch-in-flight-core.mjs'

export function openPointNumbers(tasksText) {
  const points = new Set()
  if (typeof tasksText !== 'string') return points
  for (const line of tasksText.split(/\r?\n/)) {
    const match = line.match(/^- \[ \] (\d+)\./)
    if (match && !/\bDEFERRED\b/.test(line)) points.add(Number(match[1]))
  }
  return points
}

const readJsonStrict = (path, { exists = existsSync, read = readFileSync } = {}) => {
  if (!exists(path)) return { present: false, value: null, error: null }
  try {
    const value = JSON.parse(read(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected a JSON object')
    return { present: true, value, error: null }
  } catch (error) {
    return { present: true, value: null, error: error?.message ?? String(error) }
  }
}

/** Resolve the branch a legacy worktree evidence item already names. */
const worktreeRefFromGit = (path) => {
  try {
    return execFileSync('git', ['-C', String(path), 'symbolic-ref', '--quiet', 'HEAD'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null
  } catch {
    return null
  }
}

export function gatherActiveWorkSource({
  tasksText,
  declarationPath = IN_FLIGHT_PATH,
  focusPath = FOCUS_PATH,
  exists = existsSync,
  read = readFileSync,
  worktreeRef = worktreeRefFromGit,
} = {}) {
  try {
    if (typeof tasksText !== 'string') {
      return { ok: false, points: [], focusPoint: null, errors: ['the work order is unreadable'] }
    }
    const declaration = readJsonStrict(declarationPath, { exists, read })
    const focus = readJsonStrict(focusPath, { exists, read })
    const sourceErrors = [declaration.error, focus.error].filter(Boolean)
    if (sourceErrors.length) {
      return { ok: false, points: [], focusPoint: null, errors: sourceErrors.map((error) => `active-work source: ${error}`) }
    }
    return normalizeActiveWork({
      readable: true,
      declaration: declaration.value,
      focusPoint: Number.isInteger(focus.value?.point) ? focus.value.point : null,
      openPoints: openPointNumbers(tasksText),
      worktreeRef,
      checkpointContradicted: declaration.value?.transfer?.checkpoints?.some((checkpoint) => checkpoint?.contradicted === true),
    })
  } catch (error) {
    return { ok: false, points: [], focusPoint: null, errors: [`active-work source failed: ${error?.message ?? error}`] }
  }
}

/**
 * Lifecycle edit applied by board commands before their locked publish. The
 * exit filter resolves each evidence item through the SAME `evidencePoint`
 * the read side uses — a `point`-less legacy branch/worktree item must leave
 * with its point exactly as it was counted for it, or the strand stays
 * readable-but-unretractable and blocks the very publish that exits it
 * (second cross-vendor review of this point). `worktreeRef` is injectable for
 * tests; the default is the same git probe the gather side binds.
 */
export function transitionActiveDeclaration(
  declaration,
  { exitPoint = null, focusPoint = undefined, worktreeRef = worktreeRefFromGit } = {},
) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return declaration
  return {
    ...declaration,
    ...(focusPoint === undefined ? {} : { focusPoint }),
    evidence: Array.isArray(declaration.evidence) && exitPoint != null
      ? declaration.evidence.filter((item) => evidencePoint(item, { worktreeRef }) !== Number(exitPoint))
      : declaration.evidence,
  }
}
