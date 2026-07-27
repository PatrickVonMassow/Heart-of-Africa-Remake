// Where the rule-review bookkeeping lives, and how the corpus is counted.
// Shared by the attestation CLI and the Stop guard so both measure the SAME
// thing — a guard judging a different corpus than the one attested would drift
// apart silently, which is the defect class this whole mechanism exists for.
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultMemoryDir, REPO_ROOT } from './retro-sources.mjs'

// Resolve from this module's own location where that is available and fall back
// to the working directory otherwise. Under Vitest `import.meta.url` is not
// always a file: URL, and the bare fileURLToPath threw AT IMPORT TIME — which
// took the whole module down and is the reason this file had no test at all
// while carrying real decision logic. Same fallback as tasks-source.mjs.
export const STATE_PATH = (() => {
  try {
    return fileURLToPath(new URL('../.claude/rule-review-state.json', import.meta.url))
  } catch {
    return resolve(process.cwd(), '.claude', 'rule-review-state.json')
  }
})()

/**
 * Size of the rule corpus: every memory file plus every guard/hook script. Both
 * are RULE CARRIERS — a guard's message teaches as surely as a memory does — and
 * both grow by accretion, which is the growth this mechanism watches.
 *
 * Counting rather than fingerprinting is deliberate: an edit to one rule is
 * ordinary work, while a corpus that keeps GAINING entries is what goes
 * unreviewed.
 *
 * BOTH halves must be readable or the answer is null. A PARTIAL count is not a
 * smaller truth, it is a wrong number, and this one had a standing cause: the
 * memory directory is derived from the checkout PATH, so from a git worktree it
 * resolves to a directory that does not exist. The count then silently dropped
 * from 93 to the 27 scripts, which made the growth trigger unfirable (27 minus a
 * recorded 87 is negative) and would have poisoned the main tree's baseline had
 * a worktree session attested. Same defect class that retro-sources.mjs already
 * refuses loudly. Null is honest: the guard errs toward allowing, and the
 * time-based trigger still holds.
 */
export function countCorpusEntries({ repoRoot = REPO_ROOT, memoryDir = defaultMemoryDir(repoRoot) } = {}) {
  const memories = countIn(memoryDir, (f) => f.endsWith('.md') && f !== 'MEMORY.md')
  const enforcers = countIn(resolve(repoRoot, 'scripts'), (f) => /-(guard|hook)\.mjs$/.test(f))
  if (memories === null || enforcers === null) return null
  return memories + enforcers
}

/** Matching entries of a directory, or null when it cannot be read at all. */
function countIn(dir, match) {
  try {
    return existsSync(dir) ? readdirSync(dir).filter(match).length : null
  } catch {
    return null
  }
}
