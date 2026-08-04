// Wrapper for the commit-scope guard (user 25.07.2026). Two modes, one guard:
//
//   node scripts/commit-scope-guard.mjs                  (pre-commit)
//       collects the staged additions/modifications with their STAGED blob
//       sizes and asks the pure core whether they belong to this commit.
//
//   node scripts/commit-scope-guard.mjs --message <file> (commit-msg)
//       reads the commit MESSAGE and asks the pure core whether a rescue is
//       declared and skipped consistently (user 28.07.2026). The message is not
//       available at pre-commit time — git writes it afterwards — so this half
//       runs from the commit-msg hook.
//
// FAIL-OPEN on an internal error, like every other guard in this repository: a
// broken guard must never make the tree uncommittable. A real finding, however,
// fails CLOSED — that is the whole point.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  evaluateStagedFiles,
  formatVerdict,
  evaluateCommitMessage,
  formatMessageVerdict,
} from './commit-scope-guard-core.mjs'

const git = (args) => execFileSync('git', args, { windowsHide: true, encoding: 'utf8' })

const refuse = (text) => {
  process.stderr.write(`${text}\n`)
  process.exit(1)
}

try {
  const messageFlag = process.argv.indexOf('--message')
  if (messageFlag !== -1) {
    const path = process.argv[messageFlag + 1]
    // No path, or an unreadable one, is not a finding: judge nothing rather
    // than block a commit over a file this guard failed to open.
    const message = path ? readFileSync(path, 'utf8') : ''
    const verdict = evaluateCommitMessage(message)
    if (verdict.block) refuse(formatMessageVerdict(verdict))
    process.exit(0)
  }

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
  if (verdict.block) refuse(formatVerdict(verdict))
  process.exit(0)
} catch (e) {
  console.error(`commit-scope-guard error (allowing the commit): ${e && e.message}`)
  process.exit(0)
}
