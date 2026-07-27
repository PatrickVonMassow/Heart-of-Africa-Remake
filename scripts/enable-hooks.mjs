// Wire the versioned git hooks (point 302). Runs from package.json's `prepare`
// script, so every clone gets the pre-commit and pre-push gates after
// `npm install` instead of after someone remembers a one-time git config.
//
// That gap is not hypothetical: a pre-push gate once sat in this repository
// unable to ever fire, because core.hooksPath was never set.
//
// FAIL-OPEN and quiet: an install must never break because hooks cannot be
// configured (a tarball without .git, a CI checkout with a read-only config).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

export const HOOKS_PATH = 'scripts/git-hooks'

try {
  if (!existsSync(resolve(REPO_ROOT, '.git')) || !existsSync(resolve(REPO_ROOT, HOOKS_PATH))) {
    process.exit(0)
  }
  const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  let current = ''
  try {
    current = git(['config', '--local', '--get', 'core.hooksPath'])
  } catch {
    /* unset — git exits 1 for a missing key */
  }
  // An absolute path pointing at the same directory counts as configured; only
  // an unset or foreign value is rewritten, so a deliberate override survives.
  const configured = current && resolve(REPO_ROOT, current) === resolve(REPO_ROOT, HOOKS_PATH)
  if (!configured) {
    git(['config', '--local', 'core.hooksPath', HOOKS_PATH])
    console.log(`git hooks enabled: core.hooksPath = ${HOOKS_PATH}`)
  }
} catch (e) {
  console.error(`enable-hooks: skipped (${e.message})`)
}
