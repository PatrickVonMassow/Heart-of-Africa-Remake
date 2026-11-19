// The side-effectful half of the origin line (core: board-origin-core.mjs):
// one `git log` pass over TASKS.md finds the commit that first added each point.
// Fail-soft: without git, every point without a `Source:` line reads "unknown".
//
//   node scripts/board-origin.mjs <N>…   print the origin line of each point, and the cost
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from './repo-paths.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { firstAdditions, originLine, originOf, sourceLines } from './board-origin-core.mjs'

const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

/** Grafted roots of a shallow clone: their diff shows the whole file as added. */
function shallowRoots() {
  try {
    const file = git(['rev-parse', '--git-path', 'shallow']).trim()
    const path = file.startsWith('/') ? file : `${REPO_ROOT}/${file}`
    return new Set(existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : [])
  } catch {
    return new Set()
  }
}

/** Map<n, { sha, date, subject }> of the commit that first added each point header. */
export function readAdditions() {
  try {
    const log = git(['log', '--reverse', '--format=@@C %H %cs %s', '-U0', '--no-color', '--no-ext-diff', '--', 'TASKS.md'])
    return firstAdditions(log, { skip: shallowRoots() })
  } catch {
    return new Map()
  }
}

/** `originFor(point)` over the work order, its archive and the git history; `ms` is the measured cost. */
export function readOrigins(tasksText = readTasksAll()) {
  const started = Date.now()
  const sources = sourceLines(tasksText)
  const additions = readAdditions()
  const ms = Date.now() - started
  return { originFor: (n) => originOf(n, { sources, additions }), ms, sources: sources.size, additions: additions.size }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { originFor, ms, sources, additions } = readOrigins()
  for (const n of process.argv.slice(2).map(Number).filter(Number.isInteger)) console.log(`${n}: ${originLine(originFor(n))}`)
  console.log(`derived in ${ms} ms: ${sources} Source: line(s), ${additions} point(s) dated from git`)
}
