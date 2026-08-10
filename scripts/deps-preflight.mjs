// A ONE-LINE DIAGNOSIS INSTEAD OF "'tsc' is not recognized" (point 429, bonus).
//
// Twice on 29.07.2026 an agent worktree removal took the main tree's
// `node_modules` with it (see worktree-cleanup-core.mjs). Each time the symptom
// was `npm run build` reporting that `tsc` is not a recognized command, and each
// time several minutes went into diagnosing what is a one-command repair. The
// build now says so itself.
//
// Runs in a couple of milliseconds and changes nothing on the happy path: it
// resolves the two binaries `npm run build` needs and gets out of the way.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

const REQUIRED = ['typescript', 'vite']

export function missingDependencies(require_ = createRequire(import.meta.url)) {
  if (!existsSync(repoPath('node_modules'))) return REQUIRED.slice()
  return REQUIRED.filter((name) => {
    try {
      require_.resolve(`${name}/package.json`)
      return false
    } catch {
      return true
    }
  })
}

export const DIAGNOSIS = (missing) =>
  [
    '',
    `BUILD PREFLIGHT: ${missing.join(' and ')} cannot be resolved — the dependencies are missing or damaged.`,
    "This is what \"'tsc' is not recognized\" means. It is NOT a defect in the code.",
    'Two known causes. In a FRESH AGENT WORKTREE they were never there — a worktree checks',
    'out the tracked tree only, and node_modules is git-ignored. In the MAIN tree the cause is',
    'a worktree removed with `git worktree remove` or `rm -rf`: the worktree carries a junction',
    "to the main tree's node_modules and the delete follows it.",
    'Repair in a worktree:   node scripts/worktree-bootstrap.mjs   (links the main tree, seconds)',
    'Repair in the main tree: npm install',
    'Prevent: node scripts/worktree-cleanup.mjs <worktree-path>   (never the bare git/rm commands)',
    '',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const missing = missingDependencies()
  if (missing.length > 0) {
    console.error(DIAGNOSIS(missing))
    process.exit(1)
  }
}
