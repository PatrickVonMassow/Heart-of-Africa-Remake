// The usage text of the commands that used to answer `--help` with something
// else (the carrier, nothing, or their normal action) — ONE definition each, so
// the failing call, `--help` and the SessionStart synopsis print the same words
// and no second copy can drift.
//
// Pure: no I/O. Each script prints its entry; batch-resume-hook.mjs builds the
// synopsis from the first line of every entry through `usageSynopsis`.
import { TIERS_USAGE } from './verify/tiers.mjs'

export const USAGE = Object.freeze({
  finding: [
    'usage: node scripts/finding.mjs --record "<title>" --detail "<…>" [--target <point|bundle>]',
    '       node scripts/finding.mjs --none "<why this turn found nothing>"',
    '       node scripts/finding.mjs --drain | --drained "<title>" (--point <N> | --why "<…>")',
    '       node scripts/finding.mjs --request "<title>" --spec-file <path|-> --why-file <path|-> [--approved "<words>"] [--once] […]',
    '       node scripts/finding.mjs --request "<title>" --stdin [--approved "<words>"]   (parts: --- spec ---, --- why ---, …)',
    '       node scripts/finding.mjs --requests | --show "<title>"',
    '       node scripts/finding.mjs --appending "<title>" --point <N>   (after the TASKS.md append)',
    '       node scripts/finding.mjs --queued "<title>" --point <N>      (after commit AND push of main) | --blocked "<title>" --why "<reason>"',
  ].join('\n'),
  'queue-rank': [
    'usage: node scripts/queue-rank.mjs [--status]                               what is unranked, and the release front',
    '       node scripts/queue-rank.mjs --ranked <N> --why "<one line>"           last IS right, and why',
    '       node scripts/queue-rank.mjs --ahead <N> [--origin user] --why "<one line>"   it stands BEFORE the release',
    '       node scripts/queue-rank.mjs --seed --why "<one line>"                 arm: what stands today is judged',
    '       node scripts/queue-rank.mjs --seed-boundary --why "<one line>"        arm: freeze the front of the order',
  ].join('\n'),
  'worktree-cleanup': [
    "usage: node scripts/worktree-cleanup.mjs <path> [--dry] [--expect '<json>']   remove one agent worktree safely",
    '       (never `git worktree remove` or `rm -rf`: both follow the node_modules link into the main tree)',
  ].join('\n'),
  'tasks-source': [
    "usage: import { readTasksOpen, readTasksAll, openPointStatus } from './tasks-source.mjs'   (a module, no CLI)",
    '       readTasksOpen()  TASKS.md alone — what is still to do',
    '       readTasksAll()   TASKS.md + docs/tasks-archive.md — every point number, closed ones included',
  ].join('\n'),
  tiers: TIERS_USAGE,
})

/** Is this argument list a request for the usage? */
export const wantsHelp = (argv = []) => argv.includes('--help') || argv.includes('-h')

/**
 * The SessionStart synopsis: the first line of every entry, `usage: ` cut off,
 * under one header. Throws on a malformed table — the hook catches it and omits
 * the synopsis, so a broken entry never costs the session start.
 */
export function usageSynopsis(usage = USAGE) {
  const lines = Object.entries(usage).map(([name, text]) => {
    const first = String(text).split('\n')[0]
    if (!first.startsWith('usage: ')) throw new Error(`usage of ${name} does not start with "usage: "`)
    return `  ${first.slice('usage: '.length)}`
  })
  return [
    'COMMAND SYNOPSIS (full syntax: the command with --help; run-wait, cross-review, board, batch-in-flight, author-delegate and focus print theirs the same way):',
    ...lines,
  ]
}
