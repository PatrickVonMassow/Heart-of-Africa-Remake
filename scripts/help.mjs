#!/usr/bin/env node
// FIND A REPOSITORY COMMAND WITHOUT LISTING 421 FILES — the I/O half.
//
//   node scripts/help.mjs "remove a board card"  # ranked commands and usage
//   node scripts/help.mjs --write                 # regenerate docs/command-index.md
//
// The committed index gives readers one browseable row per script; the query
// form gives a session only the few rows relevant to its question.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findCommands, harvestCommands, renderCommandIndex } from './help-core.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

export function readCommandEntries(scriptsDir = repoPath('scripts')) {
  return harvestCommands(
    readdirSync(scriptsDir)
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => ({ name, source: readFileSync(join(scriptsDir, name), 'utf8') })),
  )
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const entries = readCommandEntries()
  if (argv[0] === '--write') {
    const path = repoPath('docs', 'command-index.md')
    writeFileSync(path, renderCommandIndex(entries))
    console.log(`wrote ${entries.length} scripts to ${path}`)
  } else {
    const topic = argv.join(' ').trim()
    if (!topic) {
      console.error('usage: node scripts/help.mjs <topic> | --write')
      process.exitCode = 1
    } else {
      const matches = findCommands(entries, topic).slice(0, 8)
      if (!matches.length) {
        console.error(`no command found for: ${topic}`)
        process.exitCode = 1
      } else {
        for (const match of matches) {
          console.log(`${match.name} — ${match.purpose}`)
          for (const usage of match.usages) console.log(`  ${usage}`)
        }
      }
    }
  }
}

export { REPO_ROOT }
