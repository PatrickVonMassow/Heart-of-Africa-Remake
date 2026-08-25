#!/usr/bin/env node
// THE SWITCH THAT MOVES WORK TOWARDS OPENAI (work-order point 654, A2; widened by 667).
//
//   node scripts/sol-share.mjs --status     # what goes where right now, in ONE line
//   node scripts/sol-share.mjs --more       # one step towards Sol
//   node scripts/sol-share.mjs --less       # one step back towards Claude
//   node scripts/sol-share.mjs --set prefer-sol|default|claude-only
//   node scripts/sol-share.mjs --json       # the same, machine-readable
//
// WHY IT EXISTS (user 11.08.2026): two vendors, two allowances that run out at different
// times. Rather than wait until the Anthropic volume is nearly spent, the user wants to
// shift load to OpenAI EARLIER — first the work that needs no write access at all:
// diagnoses, audits, enumerations, explanations.
//
// AND SINCE POINT 667, AUTHORING TOO. At `prefer-sol` the `author` kind goes to Sol —
// since 18.08.2026 for the hard and critical points as well, which is the largest single
// item of the spend; the role swap it needs is built — Sol stands in the author allowlist, the
// `commit-msg` hook takes its trailer, and Claude reviews, runs the suites, judges the
// picture and lands. What no setting routes is in NEVER_ROUTED below.
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
  KIND_NOTES,
  NEVER_ROUTED,
  SAFE_SETTING,
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
 * A MISSING file is the default (nothing was ever set); a file that is there and unusable
 * is SAFE_SETTING with the problem named — never a throw. Every caller of this is on the
 * path of some other piece of work, and a switch that can break a diagnosis is worse than
 * no switch.
 */
export function currentSetting(file = SETTING_FILE) {
  let raw = null
  try {
    raw = existsSync(file) ? readFileSync(file, 'utf8') : null
  } catch (e) {
    // A file that is there and unreadable is the anomaly SAFE_SETTING exists for.
    return { setting: SAFE_SETTING, changedAt: null, changedBy: '', problem: `the state file could not be read (${e.message})`, corrupt: true }
  }
  return readSetting(raw)
}

/**
 * The line a consumer prints when the state file is broken, or ''.
 *
 * It exists because a fallback nobody is told about is a setting nobody chose (cross-
 * vendor review, 12.08.2026): `review-sol.mjs` and `board-publish.mjs` read the setting,
 * so they must also say when it is not the operator's.
 */
export function settingProblemLine(state, who = 'sol-share') {
  return state?.problem ? `${who}: the share setting is UNUSABLE — ${state.problem}. Repair it: node scripts/sol-share.mjs --set <setting>` : ''
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
    'every agent which kinds to hand over. At prefer-sol Sol also AUTHORS every point the',
    'routing cut does not keep here, the hard and critical ones included; Claude reviews them.',
    'What no setting routes is listed under',
    '"NEVER routed" by --status.',
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
