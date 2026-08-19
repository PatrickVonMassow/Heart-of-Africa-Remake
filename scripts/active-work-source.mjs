// Thin I/O adapter for the board's authoritative active-point projection.
// Parsing and policy live in normalizeActiveWork; this file only distinguishes
// an absent record (verified zero is possible) from a present unreadable one
// (unknown, so Stop allows but publication refuses).
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import { IN_FLIGHT_PATH } from './batch-singleton.mjs'
import { FOCUS_PATH } from './dashboard-state.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  fsErrorProvesAbsence,
  gitExitProvesRefAbsence,
  normaliseBranchRef,
  normalizeActiveWork,
  partitionEvidenceOnExit,
} from './batch-in-flight-core.mjs'

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
 * POSITIVE absence proof for a worktree path (fourth cross-vendor round): the
 * path is absolutised against the repository root — never the caller's cwd —
 * and only a clean ENOENT/ENOTDIR proves it gone. A dangling symlink lstats
 * fine (the link exists), and EACCES/EIO/ELOOP or a missing mount may all be
 * hiding a tree that still holds the work: none of them proves anything.
 * `lstat` is injectable so the error causes are pinned by tests.
 */
export function worktreeEvidenceGone(path, { lstat = lstatSync, root = REPO_ROOT } = {}) {
  if (typeof path !== 'string' || path === '') return false
  try {
    lstat(isAbsolute(path) ? path : resolve(root, path))
    return false
  } catch (error) {
    return fsErrorProvesAbsence(error?.code)
  }
}

/**
 * POSITIVE absence proof for a branch ref: `git show-ref --verify` in the
 * repository answers exit 1 for a ref that does not exist — or whose name no
 * ref could ever carry, which can testify to nothing either. Exit 0 keeps the
 * item; any other failure (git broken, not a repository) proves nothing.
 */
export function branchEvidenceGone(ref, { root = REPO_ROOT } = {}) {
  const name = normaliseBranchRef(ref)
  if (!name) return false
  try {
    execFileSync('git', ['-C', String(root), 'show-ref', '--verify', '--quiet', `refs/heads/${name}`], {
      windowsHide: true,
      timeout: 15000,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return false
  } catch (error) {
    return gitExitProvesRefAbsence(error?.status)
  }
}

/** The default gone-probe, per evidence kind; anything else is never gone. */
const evidenceProvablyGone = (item) => {
  if (item?.kind === 'worktree') return worktreeEvidenceGone(item.path)
  if (item?.kind === 'branch') return branchEvidenceGone(item.ref)
  return false
}

/**
 * Lifecycle edit applied by board commands before their locked publish. The
 * exit filter resolves each evidence item through the SAME `evidencePoint`
 * the read side uses — a `point`-less legacy branch/worktree item must leave
 * with its point exactly as it was counted for it, or the strand stays
 * readable-but-unretractable and blocks the very publish that exits it
 * (second cross-vendor review of this point). An item that can never resolve
 * again because its artefact is PROVABLY gone is retired — so a vanished
 * worktree or a deleted stray branch cannot wedge the exit permanently.
 * Returns `{ declaration, retired }`: the retired list is part of the RESULT,
 * so no caller can lose evidence silently by forgetting a callback (fourth
 * round). `worktreeRef`/`evidenceGone` are injectable for tests; the defaults
 * are the same git and fs probes the gather side binds.
 */
export function transitionActiveDeclaration(
  declaration,
  {
    exitPoint = null,
    focusPoint = undefined,
    worktreeRef = worktreeRefFromGit,
    evidenceGone = evidenceProvablyGone,
  } = {},
) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
    return { declaration, retired: [] }
  }
  const next = { ...declaration, ...(focusPoint === undefined ? {} : { focusPoint }) }
  if (!Array.isArray(declaration.evidence) || exitPoint == null) return { declaration: next, retired: [] }
  const { kept, retired } = partitionEvidenceOnExit(declaration.evidence, exitPoint, { worktreeRef, evidenceGone })
  return { declaration: { ...next, evidence: kept }, retired }
}
