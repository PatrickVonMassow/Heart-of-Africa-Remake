#!/usr/bin/env node
// The only writer for the shared Fable decision.
//
//   node scripts/fable-switch.mjs --status
//   node scripts/fable-switch.mjs --on  --why "<user instruction>"
//   node scripts/fable-switch.mjs --off --why "<user instruction>"

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, sep as sep_ } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  readState,
  statePathFrom,
  statusReport,
  unreadableState,
  writeState,
} from './fable-switch-core.mjs'

export const STATE_FILE =
  process.env.FABLE_SWITCH_FILE ||
  statePathFrom(
    spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).stdout ?? '',
    REPO_ROOT,
    { sep: sep_ },
  )

/** Read afresh on every call: a flip must be visible to every reader immediately. */
export function currentFableState(file = STATE_FILE) {
  try {
    if (!existsSync(file)) return readState(null)
    return readState(readFileSync(file, 'utf8'))
  } catch (error) {
    return unreadableState(error)
  }
}

function setterIdentity() {
  if (String(process.env.FABLE_SWITCH_SET_BY ?? '').trim()) return process.env.FABLE_SWITCH_SET_BY.trim()
  const git = spawnSync('git', ['config', 'user.name'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  return String(git.stdout ?? '').trim() || String(process.env.USER ?? process.env.USERNAME ?? '').trim()
}

function save(state, why, file = STATE_FILE) {
  mkdirSync(dirname(file), { recursive: true })
  writeJsonAtomic(file, writeState(state, { why, by: setterIdentity() }))
}

export const usage = () =>
  'usage: node scripts/fable-switch.mjs --status | --on --why "<user instruction>" | --off --why "<user instruction>"'

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  try {
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
      console.log(usage())
      process.exit(0)
    }
    if (argv.length === 1 && argv[0] === '--status') {
      console.log(statusReport(currentFableState()))
      process.exit(0)
    }
    const direction = argv[0] === '--on' ? 'on' : argv[0] === '--off' ? 'off' : ''
    if (!direction || argv.length !== 3 || argv[1] !== '--why') {
      console.error(usage())
      process.exit(2)
    }
    save(direction, argv[2])
    console.log(statusReport(currentFableState()))
    process.exit(0)
  } catch (error) {
    console.error(`fable-switch: ${(error && error.message) || error}`)
    process.exit(1)
  }
}
