// Where the rule-review bookkeeping lives, and how the corpus is counted.
// Shared by the attestation CLI and the Stop guard so both measure the SAME
// thing — a guard judging a different corpus than the one attested would drift
// apart silently, which is the defect class this whole mechanism exists for.
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultMemoryDir, REPO_ROOT } from './retro-sources.mjs'

export const STATE_PATH = fileURLToPath(new URL('../.claude/rule-review-state.json', import.meta.url))

/**
 * Size of the rule corpus: every memory file plus every guard/hook script. Both
 * are RULE CARRIERS — a guard's message teaches as surely as a memory does — and
 * both grow by accretion, which is the growth this mechanism watches.
 *
 * Counting rather than fingerprinting is deliberate: an edit to one rule is
 * ordinary work, while a corpus that keeps GAINING entries is what goes
 * unreviewed. Returns null when neither source can be read, so the guard errs
 * toward allowing.
 */
export function countCorpusEntries({ repoRoot = REPO_ROOT, memoryDir = defaultMemoryDir(repoRoot) } = {}) {
  let n = 0
  let sawAny = false
  try {
    if (existsSync(memoryDir)) {
      n += readdirSync(memoryDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').length
      sawAny = true
    }
  } catch {
    /* unreadable memory dir — fall through */
  }
  try {
    const scriptsDir = resolve(repoRoot, 'scripts')
    if (existsSync(scriptsDir)) {
      n += readdirSync(scriptsDir).filter((f) => /-(guard|hook)\.mjs$/.test(f)).length
      sawAny = true
    }
  } catch {
    /* unreadable scripts dir — fall through */
  }
  return sawAny ? n : null
}
