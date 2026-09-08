#!/usr/bin/env node
// Stages the Windows host commands where the user can actually run them.
//
// The repository lives on a container volume that Windows cannot see, while
// /workspace is a bind mount of the user's Windows folder. So a PowerShell
// script that only exists in scripts/windows/ is unreachable for the person who
// has to run it. This copies the commands and the reviewed .devcontainer into
// /workspace/hoa-host/, which is C:\Users\...\claude-code\hoa-host\ on the host
// and readable from inside the container — so the reports come back on their own.
//
// Re-run it after every change to a staged file; it overwrites and reports.

import { copyFileSync, mkdirSync, existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const target = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : '/workspace/hoa-host'

const COMMANDS = [
  'collect-crash-evidence.ps1',
  'deploy-container-recovery.ps1',
  'restart-drill.ps1',
  'README.txt',
]

// The deploy script refuses a partial staging, so this list and the $files list
// in deploy-container-recovery.ps1 must stay identical.
const CONFIG = [
  'devcontainer.json',
  'Dockerfile',
  'container-entrypoint.sh',
  'init-firewall.sh',
  'fill-workspace.sh',
]

if (!existsSync(dirname(target))) {
  console.error(`no host mount at ${dirname(target)} — is /workspace bound?`)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
mkdirSync(join(target, 'devcontainer'), { recursive: true })

let copied = 0
const missing = []

// Windows PowerShell 5.1 reads a .ps1 without a byte-order mark as ANSI, not
// UTF-8. On 08.09.2026 an em dash in a comment therefore arrived as "a-tilde
// euro-quote" and the PARSER died on it, so the script was unusable on the only
// machine it is for. Pure ASCII removes the question of encoding entirely, and
// is enforced here rather than remembered.
const nonAscii = (text) =>
  [...text].map((c, i) => (c.charCodeAt(0) > 127 ? { c, i } : null)).filter(Boolean)

for (const name of COMMANDS) {
  const from = join(here, name)
  if (!existsSync(from)) {
    missing.push(`scripts/windows/${name}`)
    continue
  }
  const text = readFileSync(from, 'utf8')
  if (name.endsWith('.ps1')) {
    const bad = nonAscii(text)
    if (bad.length) {
      console.error(
        `REFUSED ${name}: ${bad.length} non-ASCII character(s), first at offset ${bad[0].i} — ` +
          'Windows PowerShell reads this file as ANSI and will not parse it',
      )
      missing.push(`scripts/windows/${name} (non-ASCII)`)
      continue
    }
    writeFileSync(join(target, name), text, 'ascii')
  } else {
    // A .txt is read by a human in an editor, so it keeps its umlauts and gets
    // the byte-order mark that makes Notepad show them correctly.
    const withBom = text.startsWith('﻿') ? text : `﻿${text}`
    writeFileSync(join(target, name), withBom, 'utf8')
  }
  copied += 1
}

for (const name of CONFIG) {
  const from = join(repo, '.devcontainer', name)
  if (!existsSync(from)) {
    missing.push(`.devcontainer/${name}`)
    continue
  }
  copyFileSync(from, join(target, 'devcontainer', name))
  copied += 1
}

for (const name of missing) console.error(`MISSING: ${name}`)

console.log(`staged ${copied} file(s) in ${target}`)
console.log('on Windows: cd C:\\Users\\Patri\\Documents\\Developing\\claude-code\\hoa-host')

// Reports written by the staged scripts land back in the same folder; naming
// them here saves the next reader a directory listing. Only the .txt reports —
// the .ps1 that produced them shares the prefix and is not a result.
const reports = readdirSync(target).filter((f) => /^(crash-evidence|restart-drill)-.*\.txt$/.test(f))
for (const hit of reports.sort()) {
  const at = statSync(join(target, hit)).mtime.toISOString().slice(0, 16).replace('T', ' ')
  console.log(`report present: ${hit} (${at})`)
}
if (reports.length === 0) console.log('no report written yet')

if (missing.length) process.exit(1)
