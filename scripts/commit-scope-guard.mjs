// Pre-commit wrapper for the commit-scope guard (user 25.07.2026). Collects the
// staged additions/modifications with their STAGED blob sizes, asks the pure
// core, and refuses the commit on a finding.
//
// FAIL-OPEN on an internal error, like every other guard in this repository: a
// broken guard must never make the tree uncommittable. A real finding, however,
// fails CLOSED — that is the whole point.
import { execFileSync } from 'node:child_process'
import { evaluateStagedFiles, formatVerdict } from './commit-scope-guard-core.mjs'

const git = (args) => execFileSync('git', args, { encoding: 'utf8' })

try {
  // ACMR: added, copied, modified, renamed — deletions are deliberately absent,
  // so removing a stray file is never blocked by the guard that flagged it.
  const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .split('\0')
    .filter(Boolean)

  const entries = names.map((path) => {
    let size = 0
    try {
      size = Number(git(['cat-file', '-s', `:${path}`]).trim()) || 0
    } catch {
      /* unreadable blob — judge it on its path alone */
    }
    return { path, size }
  })

  const verdict = evaluateStagedFiles(entries)
  if (verdict.block) {
    process.stderr.write(`${formatVerdict(verdict)}\n`)
    process.exit(1)
  }
  process.exit(0)
} catch (e) {
  console.error(`commit-scope-guard error (allowing the commit): ${e && e.message}`)
  process.exit(0)
}
