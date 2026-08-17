// Stop hook: a rule that moved drags its restatements with it (user 17.08.2026).
//
// The decision is pure and Vitest-covered in scripts/rule-echo-core.mjs; this
// wrapper only reads files. A CONTENT guard, like doc-budget beside it: it does
// NOT stand down while the batch is paused, because rules are rewritten during
// pauses, which is exactly when a sleeping check would miss the drift.
//
// FAIL-OPEN, and deliberately so against the cross-vendor review's P0: CLAUDE.md
// §7.2 makes every guard here fail open, "a guard bug cannot trap the session".
// The failure is not silent — it goes to stderr, where the session sees it — but
// it does not block. A guard that blocked on its own bug would be the one defect
// this project has decided it will not accept.
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { RULE_REGISTRY, checkAll, filesToRead, formatVerdict, unregisteredStamps } from './rule-echo-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

/**
 * Where this project's memory entries live.
 *
 * TWO candidates, deliberately: the slug is derived from the repository path,
 * and a trailing slash there produces a trailing dash — which is how this
 * project ended up with two memory directories, the index in one and the
 * findings carrier in the other. BOTH are read and their contents concatenated
 * (cross-vendor review, P1: taking the first hit meant a second copy of the same
 * filename was never checked and never stamped). Windows separators are slugged
 * too, so a `C:\…` root cannot slip through unnormalised.
 */
export function memoryDirs({ home = homedir(), root = REPO_ROOT } = {}) {
  const slug = String(root)
    .replace(/[\\/]+$/, '')
    .replace(/[\\/]/g, '-')
    .replace(/:/g, '')
  return [slug, `${slug}-`].map((s) => resolve(home, '.claude', 'projects', s, 'memory'))
}

/** Read every watched file. A `memory/…` entry resolves outside the repository. */
export function gatherRuleEchoInputs(registry = RULE_REGISTRY) {
  const files = {}
  const dirs = memoryDirs()
  // Whether the memory TREE exists at all — the difference between "this machine
  // keeps no memory entries" and "a registered entry was deleted".
  files['memory/'] = dirs.some((d) => existsSync(d)) ? '' : null
  for (const rel of filesToRead(registry)) {
    const candidates = rel.startsWith('memory/')
      ? dirs.map((dir) => resolve(dir, rel.slice('memory/'.length)))
      : [resolve(REPO_ROOT, rel)]
    const found = candidates.filter((p) => existsSync(p))
    files[rel] = found.length ? found.map((p) => readFileSync(p, 'utf8')).join('\n') : null
  }
  return { applicable: true, inputs: { files } }
}

/**
 * Every tracked file that carries a stamp, so a stamp outside the registry is
 * seen. `git grep` rather than a walk: it is one process, it honours .gitignore,
 * and a repository without git simply yields nothing to check.
 */
export function gatherStampedFiles() {
  let paths = []
  try {
    paths = execFileSync('git', ['grep', '-l', '-E', 'rule:[a-z0-9-]+@[0-9a-f]{8}'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return {} // no git, or no match at all — both mean nothing to report
  }
  const out = {}
  for (const rel of paths) {
    // The registry and its own tests NAME stamps as examples; they are not
    // restatements of any rule, and reading them as stray ones would block the
    // turn for a doc string.
    if (rel.startsWith('scripts/rule-echo')) continue
    const full = resolve(REPO_ROOT, rel)
    if (existsSync(full)) out[rel] = readFileSync(full, 'utf8')
  }
  return out
}

if (isMainModule(import.meta.url)) {
  try {
    const { files } = gatherRuleEchoInputs().inputs
    const strays = unregisteredStamps(RULE_REGISTRY, gatherStampedFiles())
    const reason = formatVerdict(checkAll(RULE_REGISTRY, files), strays)
    if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }))
    process.exit(0)
  } catch (e) {
    console.error(`rule-echo-guard error (allowing the stop, per CLAUDE.md §7.2): ${e && e.message}`)
    process.exit(0)
  }
}
