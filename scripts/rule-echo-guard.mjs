// Stop hook: a rule that moved drags its restatements with it (user 17.08.2026).
//
// The decision is pure and Vitest-covered in scripts/rule-echo-core.mjs; this
// wrapper only reads files. A CONTENT guard, like doc-budget beside it: it does
// NOT stand down while the batch is paused, because rules are rewritten during
// pauses, which is exactly when a sleeping check would miss the drift.
// Fail-OPEN on an internal error — a bug here must never trap a session.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { RULE_REGISTRY, checkAll, filesToRead, formatVerdict } from './rule-echo-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

/**
 * Where this project's memory entries live.
 *
 * TWO candidates, deliberately: the slug is derived from the repository path,
 * and a trailing slash there produces a trailing dash — which is how this
 * project ended up with two memory directories, the index in one and the
 * findings carrier in the other. Trying both keeps the guard working whichever
 * a machine has, instead of silently watching an empty directory.
 */
export function memoryDirs({ home = homedir(), root = REPO_ROOT } = {}) {
  // REPO_ROOT carries a trailing slash here, which is precisely how the second
  // directory came about — so normalise first and then offer BOTH spellings.
  const slug = String(root).replace(/\/+$/, '').replace(/\//g, '-')
  return [slug, `${slug}-`].map((s) => resolve(home, '.claude', 'projects', s, 'memory'))
}

/** Read every watched file. A `memory/…` entry resolves outside the repository. */
export function gatherRuleEchoInputs(registry = RULE_REGISTRY) {
  const files = {}
  for (const rel of filesToRead(registry)) {
    const candidates = rel.startsWith('memory/')
      ? memoryDirs().map((dir) => resolve(dir, rel.slice('memory/'.length)))
      : [resolve(REPO_ROOT, rel)]
    const found = candidates.find((p) => existsSync(p))
    files[rel] = found ? readFileSync(found, 'utf8') : null
  }
  return { applicable: true, inputs: { files } }
}

if (isMainModule(import.meta.url)) {
  try {
    const { files } = gatherRuleEchoInputs().inputs
    const reason = formatVerdict(checkAll(RULE_REGISTRY, files))
    if (reason) process.stdout.write(JSON.stringify({ decision: 'block', reason }))
    process.exit(0)
  } catch (e) {
    console.error(`rule-echo-guard error (allowing the stop): ${e && e.message}`)
    process.exit(0)
  }
}
