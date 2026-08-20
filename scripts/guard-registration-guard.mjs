// Wrapper for the guard-registration check (pre-commit). The decision is pure
// and lives in guard-registration-core.mjs; this half does the reading.
//
// It reads the INDEX, not the working tree: `git show :<path>` is the content
// that is about to become the commit. A partially staged tree — the guard
// registered in the editor but not added — must be judged on what is actually
// being committed, otherwise the check passes and the commit is still broken.
//
// FAIL-OPEN on an internal error, like every other guard in this repository: a
// broken guard must never make the tree uncommittable. A real finding fails
// CLOSED, which is the whole point.
import { execFileSync } from 'node:child_process'
import {
  evaluate,
  formatVerdict,
  STAGED_PATH_ARGS,
  touchesGuardWiring,
} from './guard-registration-core.mjs'

const git = (args) => execFileSync('git', args, { windowsHide: true, encoding: 'utf8' })

/** Index content of one path, or '' when it is not in the index at all. */
function staged(path) {
  try {
    return git(['show', `:${path}`])
  } catch {
    return ''
  }
}

try {
  const names = git(STAGED_PATH_ARGS)
    .split('\0')
    .filter(Boolean)

  if (touchesGuardWiring(names)) {
    const verdict = evaluate({
      paths: names,
      settingsJson: staged('.claude/settings.json'),
      preflightSource: staged('scripts/guard-preflight.mjs'),
    })
    if (verdict.block) {
      process.stderr.write(`${formatVerdict(verdict)}\n`)
      process.exit(1)
    }
  }
} catch {
  /* unreadable index — judge nothing rather than block the commit */
}
