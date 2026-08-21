#!/usr/bin/env node
// WHAT THE USER SAID, AND WHEN — the CLI half. Rationale: scripts/user-said-core.mjs.
//
//   node scripts/user-said.mjs                          the last 20 things he said
//   node scripts/user-said.mjs --grep "reihenfolge"     every message matching, one line each
//   node scripts/user-said.mjs --grep "614" --full      the matches in full
//   node scripts/user-said.mjs --since 6h --last 50     a window, widened
//   node scripts/user-said.mjs --sessions 5             only the five newest conversations
//   node scripts/user-said.mjs --session d5fcb9cf       one conversation
//
// It streams the transcripts line by line and never holds a file in memory, so a
// 100 MB conversation costs the same as a small one.
import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { execFileSync } from 'node:child_process'
import { mainCheckoutFrom } from './main-checkout-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  chooseTranscriptDirectory,
  formatEntry,
  parseLine,
  parseSince,
  selectEntries,
  transcriptDirectoryCandidates,
} from './user-said-core.mjs'

function parseArgs(argv) {
  const out = { last: 20, width: 120, full: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--grep') { out.grep = value; i += 1 }
    else if (flag === '--since') { out.since = value; i += 1 }
    else if (flag === '--session') { out.session = value; i += 1 }
    else if (flag === '--sessions') { out.sessions = Number(value); i += 1 }
    else if (flag === '--last') { out.last = Number(value); i += 1 }
    else if (flag === '--width') { out.width = Number(value); i += 1 }
    else if (flag === '--dir') { out.dir = value; i += 1 }
    else if (flag === '--full') out.full = true
    else if (flag === '--help' || flag === '-h') out.help = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  return out
}

const USAGE = `usage: node scripts/user-said.mjs [--grep <regex>] [--since <iso|90m|6h|2d|07:31>]
       [--sessions <n>] [--session <id-prefix>] [--last <n>] [--full] [--width <n>] [--dir <path>]
One line per message the user actually typed, oldest first. --full prints them whole.`

function mainCheckout() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return mainCheckoutFrom(common, REPO_ROOT)
  } catch {
    return null
  }
}

async function transcriptDirectory(explicit) {
  const projectsDir = join(homedir(), '.claude', 'projects')
  const dirs = explicit
    ? [explicit]
    : transcriptDirectoryCandidates({ projectsDir, checkoutRoot: REPO_ROOT, mainCheckout: mainCheckout(), join })
  const candidates = await Promise.all(dirs.map(async (dir) => {
    try {
      return { dir, files: await readdir(dir) }
    } catch {
      return { dir, files: [] }
    }
  }))
  return { chosen: chooseTranscriptDirectory(candidates), tried: dirs }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { console.log(USAGE); return }

  const { chosen, tried } = await transcriptDirectory(args.dir)
  if (!chosen) {
    console.error(`no transcripts at ${tried.join(' or ')}`)
    return 1
  }
  const { dir } = chosen
  const files = chosen.files.filter((name) => name.endsWith('.jsonl'))

  const rows = []
  for (const name of files) {
    const stream = createInterface({ input: createReadStream(join(dir, name)), crlfDelay: Infinity })
    for await (const line of stream) {
      const row = parseLine(line, name.replace(/\.jsonl$/, ''))
      if (row) rows.push(row)
    }
  }

  const selected = selectEntries(rows, {
    grep: args.grep ?? null,
    since: parseSince(args.since),
    session: args.session ?? null,
    sessions: args.sessions ?? 0,
    last: args.last,
  })

  for (const row of selected) console.log(formatEntry(row, { width: args.width, full: args.full }))
  console.log(`— ${selected.length} of ${rows.length} messages · ${files.length} transcripts · ${dir}`)
  return 0
}

main().then((code) => {
  process.exitCode = code
}).catch((error) => {
  console.error(String(error?.message ?? error))
  process.exitCode = 1
})
