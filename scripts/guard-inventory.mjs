// The enumerating half of the periodic guard & memory audit (point 297).
//
// Prints, from the REAL sources and nothing else: every hook `.claude/settings.json`
// wires (with the script it runs and whether that file exists), every enforcer
// script in `scripts/` including any nothing calls, and every memory directory
// this repo resolves to with its files' last-modified dates.
//
// Output is deliberately SMALL — counts plus only what needs a decision — so the
// pass costs a screenful, not a corpus read. `--all` adds the full script table,
// `--memories` the per-memory ages, `--json` the whole thing machine-readably.
//
// READ-ONLY and never a guard: it blocks nothing, exits 0 unless it cannot read
// its own sources, and holds no opinion a hook could act on. The procedure that
// uses it is docs/guard-memory-audit.md.
//
// Usage: node scripts/guard-inventory.mjs [--all] [--memories] [--json]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import {
  buildInventory,
  formatInventory,
  formatScriptTable,
  memoryDirVariants,
  memoryReport,
} from './guard-inventory-core.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)

/** The contents of the ACTIVE git hooks directory — nothing when unconfigured. */
function gitHookTexts() {
  const out = []
  try {
    const hooksPath = execSync('git config core.hooksPath', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
    if (!hooksPath) return out
    const dir = resolve(REPO_ROOT, hooksPath)
    if (!existsSync(dir)) return out
    for (const f of readdirSync(dir)) {
      try {
        out.push(readFileSync(resolve(dir, f), 'utf8'))
      } catch {
        /* unreadable hook file — contributes no wiring, which is the honest answer */
      }
    }
  } catch {
    /* no hooksPath configured: every gate reads as unwired, which is the point */
  }
  return out
}

/** Every memory directory this repo could resolve to, existing or not. */
function memoryDirs(now) {
  const projects = resolve(homedir(), '.claude', 'projects')
  const out = []
  for (const slug of memoryDirVariants(REPO_ROOT)) {
    const path = resolve(projects, slug, 'memory')
    let entries = []
    const exists = existsSync(path)
    if (exists) {
      for (const name of readdirSync(path)) {
        try {
          const st = statSync(resolve(path, name))
          if (st.isFile()) entries.push({ name, mtimeMs: st.mtimeMs, bytes: st.size })
        } catch {
          /* vanished between listing and stat */
        }
      }
    }
    // A variant that resolves to nothing is not worth a line; a variant that
    // holds files is a fact the reader must see, however unexpected.
    if (exists && entries.length > 0) out.push({ path, exists, report: memoryReport(entries, { now }) })
  }
  return out
}

try {
  const now = Date.now()
  const settings = JSON.parse(readFileSync(repoPath('.claude', 'settings.json'), 'utf8'))
  const scriptFiles = readdirSync(repoPath('scripts'))
  const inv = buildInventory({ settings, scriptFiles, gitHookTexts: gitHookTexts() })
  const dirs = memoryDirs(now)

  if (has('--json')) {
    console.log(JSON.stringify({ ...inv, memoryDirs: dirs }, null, 2))
    process.exit(0)
  }
  console.log(formatInventory(inv, dirs))
  if (has('--all')) console.log(`\n${formatScriptTable(inv)}`)
  if (has('--memories')) {
    for (const d of dirs) {
      console.log(`\n${d.path}`)
      for (const e of d.report.entries) {
        console.log(`  ${String(e.ageDays).padStart(4)} d  ${(e.bytes / 1024).toFixed(1).padStart(6)} KB  ${e.name}`)
      }
    }
  }
  process.exit(0)
} catch (e) {
  // A tool, not a guard: a failure here is a failure to MEASURE, and it says so
  // loudly rather than reporting an empty corpus as a clean one.
  console.error(`guard-inventory: cannot read its sources — ${e && e.message}`)
  process.exit(1)
}
