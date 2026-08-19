// Thin I/O adapter for the board's authoritative active-point projection.
// Parsing and policy live in normalizeActiveWork; this file only distinguishes
// an absent record (verified zero is possible) from a present unreadable one
// (unknown, so Stop allows but publication refuses).
import { existsSync, readFileSync } from 'node:fs'
import { IN_FLIGHT_PATH } from './batch-singleton.mjs'
import { FOCUS_PATH } from './dashboard-state.mjs'
import { normalizeActiveWork } from './batch-in-flight-core.mjs'

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

export function gatherActiveWorkSource({
  tasksText,
  declarationPath = IN_FLIGHT_PATH,
  focusPath = FOCUS_PATH,
  exists = existsSync,
  read = readFileSync,
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
      checkpointContradicted: declaration.value?.transfer?.checkpoints?.some((checkpoint) => checkpoint?.contradicted === true),
    })
  } catch (error) {
    return { ok: false, points: [], focusPoint: null, errors: [`active-work source failed: ${error?.message ?? error}`] }
  }
}

/** Pure lifecycle edit applied by board commands before their locked publish. */
export function transitionActiveDeclaration(declaration, { exitPoint = null, focusPoint = undefined } = {}) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return declaration
  return {
    ...declaration,
    ...(focusPoint === undefined ? {} : { focusPoint }),
    evidence: Array.isArray(declaration.evidence) && exitPoint != null
      ? declaration.evidence.filter((item) => Number(item?.point) !== Number(exitPoint))
      : declaration.evidence,
  }
}
