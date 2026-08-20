#!/usr/bin/env node
// WHAT THE USER SAID, AND WHEN — the CLI half. Rationale: scripts/user-said-core.mjs.
//
//   node scripts/user-said.mjs                          the last 20 things he said
//   node scripts/user-said.mjs --grep "reihenfolge"     every message matching, one line each
//   node scripts/user-said.mjs --grep "614" --full      the matches in full
//   node scripts/user-said.mjs --since 6h --last 50     a window, widened
//   node scripts/user-said.mjs --session d5fcb9cf       one conversation
//
// It streams the transcripts line by line and never holds a file in memory, so a
// 100 MB conversation costs the same as a small one.
import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { formatEntry, parseLine, parseSince, projectDirName, selectEntries } from './user-said-core.mjs'

function parseArgs(argv) {
  const out = { last: 20, width: 120, full: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--grep') { out.grep = value; i += 1 }
    else if (flag === '--since') { out.since = value; i += 1 }
    else if (flag === '--session') { out.session = value; i += 1 }
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
       [--session <id-prefix>] [--last <n>] [--full] [--width <n>] [--dir <path>]
One line per message the user actually typed, oldest first. --full prints them whole.`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { console.log(USAGE); return }

  const dir = args.dir ?? join(homedir(), '.claude', 'projects', projectDirName(process.cwd()))
  let files
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith('.jsonl'))
  } catch {
    console.error(`no transcripts at ${dir}`)
    process.exitCode = 1
    return
  }

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
    last: args.last,
  })

  for (const row of selected) console.log(formatEntry(row, { width: args.width, full: args.full }))
  console.log(`— ${selected.length} of ${rows.length} messages · ${files.length} transcripts`)
}

main().catch((error) => {
  console.error(String(error?.message ?? error))
  process.exitCode = 1
})
