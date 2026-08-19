// Thin I/O adapter for the board's authoritative active-point projection.
// Parsing and policy live in normalizeActiveWork; this file only distinguishes
// an absent record (verified zero is possible) from a present unreadable one
// (unknown, so Stop allows but publication refuses).
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { IN_FLIGHT_PATH } from './batch-singleton.mjs'
import { FOCUS_PATH } from './dashboard-state.mjs'
import { normalizeActiveWork, withRecordedEvidencePoint } from './batch-in-flight-core.mjs'

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
 * assignment evidence→point is RECORDED, never guessed (fifth cross-vendor
 * round — every probe heuristic here produced the next finding): EVERY write
 * through here first migrates each item to carry its `point`
 * (`withRecordedEvidencePoint` persists what the read side resolves anyway,
 * so a legacy declaration is migrated by its next write — an exit AND a
 * plain focus write alike; the sixth round found the migration skipped on
 * the non-exit path, which left the once-only migration never happening
 * there). The exit then filters purely on that recorded field. An item that
 * cannot be attributed keeps standing UNCHANGED — no probe retires it; the
 * read side reports it loudly and names the explicit human command
 * (`batch-in-flight.mjs --clear`) as the only way out.
 */
export function transitionActiveDeclaration(
  declaration,
  { exitPoint = null, focusPoint = undefined, worktreeRef = worktreeRefFromGit } = {},
) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return declaration
  const next = { ...declaration, ...(focusPoint === undefined ? {} : { focusPoint }) }
  if (!Array.isArray(declaration.evidence)) return next
  const migrated = declaration.evidence.map((item) => withRecordedEvidencePoint(item, { worktreeRef }))
  const evidence = exitPoint == null
    ? migrated
    : migrated.filter((item) => !(item && typeof item === 'object' && Number(item.point) === Number(exitPoint)))
  return { ...next, evidence }
}
