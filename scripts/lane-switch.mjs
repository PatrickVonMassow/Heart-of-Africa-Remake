#!/usr/bin/env node
// The only writer for the shared per-lane switch decisions.
//
//   node scripts/lane-switch.mjs --status                      (every lane)
//   node scripts/lane-switch.mjs --lane <role> --status
//   node scripts/lane-switch.mjs --lane <role> --on  --why "<user instruction>"
//   node scripts/lane-switch.mjs --lane <role> --off --why "<user instruction>"
//
// The file `.claude/lane-switch.json` in the main checkout holds
// `{ lanes: { <role>: {state, reason, setBy, changedAt} } }`. While it is absent the
// legacy single-lane file is read as the scarce lane's entry; it is never rewritten.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, sep as sep_ } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  DEFAULT_SWITCH_ROLE,
  LEGACY_STATE_FILE_NAME,
  SWITCH_ROLES,
  readState,
  statePathFrom,
  statusReport,
  unreadableState,
  writeLaneFile,
  writeState,
} from './lane-switch-core.mjs'

export { servingRoute } from './lane-switch-core.mjs'

const gitCommonDir = () =>
  spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).stdout ?? ''

export const STATE_FILE = process.env.LANE_SWITCH_FILE || statePathFrom(gitCommonDir(), REPO_ROOT, { sep: sep_ })

/** The legacy file read while `file` is absent: its sibling under the legacy name. */
export function legacyFileFor(file = STATE_FILE) {
  return basename(file) === LEGACY_STATE_FILE_NAME ? '' : join(dirname(file), LEGACY_STATE_FILE_NAME)
}

/** Read afresh on every call: a flip must be visible to every reader immediately. */
export function currentLaneState(role = DEFAULT_SWITCH_ROLE, { file = STATE_FILE } = {}) {
  try {
    if (existsSync(file)) return readState(readFileSync(file, 'utf8'), role)
    const legacy = legacyFileFor(file)
    if (legacy && existsSync(legacy)) return readState(readFileSync(legacy, 'utf8'), role)
    return readState(null, role)
  } catch (error) {
    return unreadableState(error, role)
  }
}

function setterIdentity() {
  if (String(process.env.LANE_SWITCH_SET_BY ?? '').trim()) return process.env.LANE_SWITCH_SET_BY.trim()
  const git = spawnSync('git', ['config', 'user.name'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  return String(git.stdout ?? '').trim() || String(process.env.USER ?? process.env.USERNAME ?? '').trim()
}

function save(role, state, why, file = STATE_FILE) {
  const entry = writeState(state, { why, by: setterIdentity() })
  const currentRaw = existsSync(file) ? readFileSync(file, 'utf8') : null
  const legacy = legacyFileFor(file)
  const legacyRaw = currentRaw == null && legacy && existsSync(legacy) ? readFileSync(legacy, 'utf8') : null
  mkdirSync(dirname(file), { recursive: true })
  writeJsonAtomic(file, writeLaneFile(currentRaw, role, entry, { legacyRaw }))
}

/** One line per lane; an unusable lane prints its problem instead. */
function allStatus() {
  return SWITCH_ROLES.map((role) => {
    const state = currentLaneState(role)
    return state.ok ? statusReport(state) : `lane-switch: ${role} UNUSABLE — ${state.problem}`
  })
}

// Literal role names: docs/command-index.md is generated from this source text.
export const usage = () =>
  'usage: node scripts/lane-switch.mjs [--lane <main|cross|scarce>] --status | ' +
  '--lane <role> --on --why "<user instruction>" | --lane <role> --off --why "<user instruction>"'

/** Parse argv into { role, action, why } or null. */
export function parseArgs(argv) {
  const args = [...argv]
  let role = ''
  if (args[0] === '--lane') {
    role = String(args[1] ?? '')
    if (!SWITCH_ROLES.includes(role)) return null
    args.splice(0, 2)
  }
  if (args.length === 1 && args[0] === '--status') return { role, action: 'status', why: '' }
  const direction = args[0] === '--on' ? 'on' : args[0] === '--off' ? 'off' : ''
  if (!role || !direction || args.length !== 3 || args[1] !== '--why') return null
  return { role, action: direction, why: args[2] }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  try {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      console.log(usage())
      process.exit(0)
    }
    const parsed = parseArgs(argv)
    if (!parsed) {
      console.error(usage())
      process.exit(2)
    }
    if (parsed.action === 'status' && !parsed.role) {
      const lines = allStatus()
      console.log(lines.join('\n'))
      process.exit(lines.some((line) => line.includes(' UNUSABLE — ')) ? 1 : 0)
    }
    if (parsed.action !== 'status') save(parsed.role, parsed.action, parsed.why)
    console.log(statusReport(currentLaneState(parsed.role)))
    process.exit(0)
  } catch (error) {
    console.error(`lane-switch: ${(error && error.message) || error}`)
    process.exit(1)
  }
}
