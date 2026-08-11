#!/usr/bin/env node
// THE SWITCH THAT MOVES READ-ONLY WORK TOWARDS OPENAI (work-order point 654, A2).
//
//   node scripts/sol-share.mjs --status     # what goes where right now, in ONE line
//   node scripts/sol-share.mjs --more       # one step towards Sol
//   node scripts/sol-share.mjs --less       # one step back towards Claude
//   node scripts/sol-share.mjs --set prefer-sol|default|claude-only
//   node scripts/sol-share.mjs --json       # the same, machine-readable
//
// WHY IT EXISTS (user 11.08.2026): two vendors, two allowances that run out at different
// times. Rather than wait until the Anthropic volume is nearly spent, the user wants to
// shift load to OpenAI EARLIER — and the cheap way to do that is to move the work that
// needs no write access at all: diagnoses, audits, enumerations, explanations.
//
// WHY IT IS CHEAP: Sol AUTHORS NOTHING under this switch. No commit carries its trailer,
// so the author allowlist, the `commit-msg` hook and `model-guard` are untouched, and
// none of the auditability machinery a role swap would need is required here.
//
// The setting lives in the MAIN checkout's `.claude/sol-share.json` (git-ignored, this
// machine's state), and every consumer — `scripts/ask-sol.mjs`, `scripts/review-sol.mjs`,
// the delegation brief and the board footer — READS it rather than keeping its own copy.
// The decisions are pure and Vitest-covered in scripts/sol-share-core.mjs.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, sep as sep_ } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  DEFAULT_SETTING,
  KIND_NOTES,
  NEVER_ROUTED,
  SETTINGS,
  SETTING_NOTES,
  normaliseSetting,
  readSetting,
  routeFor,
  routingTable,
  settingPathFrom,
  statusLine,
  step,
  writeState,
} from './sol-share-core.mjs'

/**
 * The state file, resolved to the MAIN checkout even from a delegated agent's worktree.
 * `SOL_SHARE_FILE` redirects it, which is how the CLI suite exercises the real command
 * without touching the developer's own setting.
 */
export const SETTING_FILE =
  process.env.SOL_SHARE_FILE ||
  settingPathFrom(
    spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).stdout ?? '',
    REPO_ROOT,
    { sep: sep_ },
  )

/**
 * The setting in force, and what (if anything) was wrong with the file.
 *
 * A missing or broken file is the DEFAULT with the problem named — never a throw. Every
 * caller of this is on the path of some other piece of work, and a switch that can break
 * a diagnosis is worse than no switch.
 */
export function currentSetting(file = SETTING_FILE) {
  let raw = null
  try {
    raw = existsSync(file) ? readFileSync(file, 'utf8') : null
  } catch (e) {
    return { setting: DEFAULT_SETTING, changedAt: null, changedBy: '', problem: `the state file could not be read (${e.message})` }
  }
  return readSetting(raw)
}

/** Where one kind of work goes right now — the one call every consumer needs. */
export function routeOf(kind, file = SETTING_FILE) {
  return routeFor(kind, currentSetting(file).setting)
}

function save(setting, { by = '', file = SETTING_FILE } = {}) {
  mkdirSync(dirname(file), { recursive: true })
  writeJsonAtomic(file, writeState(setting, { by }))
}

/** The full report `--status` prints: the one line, then the table under it. */
export function statusReport(state) {
  const lines = [statusLine(state.setting)]
  if (state.problem) lines.push(`  NOTE: ${state.problem}`)
  lines.push(`  ${SETTING_NOTES[state.setting]}`)
  for (const row of routingTable(state.setting)) {
    lines.push(`  ${row.kind.padEnd(10)} → ${row.to === 'sol' ? 'GPT-5.6 Sol' : 'Claude     '}   ${KIND_NOTES[row.kind]}`)
  }
  lines.push('  NEVER routed, at any setting:')
  for (const n of NEVER_ROUTED) lines.push(`    · ${n}`)
  if (state.changedAt) lines.push(`  set ${new Date(state.changedAt).toISOString()}${state.changedBy ? ` by ${state.changedBy}` : ''}`)
  return lines.join('\n')
}

export const usage = () =>
  [
    'usage: node scripts/sol-share.mjs --status | --more | --less | --set <setting> [--json]',
    '',
    `settings, from the least Sol to the most: ${SETTINGS.join(' → ')}`,
    ...SETTINGS.map((s) => `  ${s.padEnd(12)} ${SETTING_NOTES[s]}`),
    '',
    'The board shows a non-default setting while it is on, and the delegation brief tells',
    'every agent which kinds to hand over. Sol authors nothing at any setting.',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const emit = (state, extra = {}) => {
    if (asJson) {
      console.log(JSON.stringify({ file: SETTING_FILE, ...state, routing: routingTable(state.setting), ...extra }, null, 2))
    } else {
      console.log(statusReport(state))
    }
  }
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log(usage())
      process.exit(0)
    }
    const setIndex = argv.indexOf('--set')
    if (setIndex >= 0) {
      const wanted = normaliseSetting(argv[setIndex + 1])
      if (!wanted) {
        console.error(`sol-share: not a setting: ${argv[setIndex + 1] ?? '(none)'}\n`)
        console.error(usage())
        process.exit(2)
      }
      save(wanted, { by: 'sol-share --set' })
      emit(currentSetting(), { changed: true })
      process.exit(0)
    }
    const direction = argv.includes('--more') ? 'more' : argv.includes('--less') ? 'less' : ''
    if (direction) {
      const moved = step(currentSetting().setting, direction)
      if (!moved.changed) {
        // AT AN END IT SAYS SO rather than wrapping: a `--more` that quietly became
        // `claude-only` would move the load to the very vendor the user was sparing.
        console.error(`sol-share: already at \`${moved.from}\` — no setting further ${direction === 'more' ? 'towards Sol' : 'towards Claude'}.`)
        emit(currentSetting(), { changed: false })
        process.exit(0)
      }
      save(moved.to, { by: `sol-share --${direction}` })
      emit(currentSetting(), { changed: true, from: moved.from })
      process.exit(0)
    }
    emit(currentSetting(), { changed: false })
    process.exit(0)
  } catch (e) {
    console.error(`sol-share failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
