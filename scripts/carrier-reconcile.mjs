// IO layer of the carrier's proof (see carrier-reconcile-core.mjs for the why).
//
// Reads the work order of the MAIN checkout — never a linked worktree's, whose
// branch may hold a point main does not — on three planes: origin/main (the only
// one that counts as durable), HEAD (committed, maybe unpushed) and the working
// tree (uncommitted).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMMON_REPO_ROOT, REPO_ROOT, withoutGitLocalEnvironment } from './repo-paths.mjs'
import { LOCATION_WORDS, pointLocation, titleAnchor, unionHeads } from './carrier-reconcile-core.mjs'

const TASKS = 'TASKS.md'
const ARCHIVE = 'docs/tasks-archive.md'

/** The main checkout every linked worktree shares. */
export const mainCheckoutRoot = () => COMMON_REPO_ROOT() || REPO_ROOT

function gitIn(root) {
  const env = withoutGitLocalEnvironment()
  return (args, { timeout = 30000 } = {}) =>
    execFileSync('git', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
}

const readIf = (p) => {
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : ''
  } catch {
    return ''
  }
}

/**
 * The work order on all three planes, plus every commit of origin/main.
 * `fetch` first refreshes origin/main (fail-soft: offline means the last known
 * origin/main, which a successful push has updated anyway). Throws when
 * origin/main cannot be read at all — the caller treats that as unproven.
 */
export function gatherWorkOrder({ root = mainCheckoutRoot(), fetch = false } = {}) {
  const git = gitIn(root)
  if (fetch) {
    try {
      git(['fetch', '--quiet', 'origin', 'main'], { timeout: 60000 })
    } catch {
      /* offline: judged against the last known origin/main */
    }
  }
  const originSha = git(['rev-parse', '--verify', 'origin/main^{commit}']).trim()
  const show = (rev, path) => {
    try {
      return git(['show', `${rev}:${path}`])
    } catch {
      return ''
    }
  }
  const mainShas = git(['rev-list', 'origin/main']).split(/\r?\n/).filter(Boolean)
  return {
    root,
    originSha,
    mainShas,
    remote: unionHeads({ tasks: show(originSha, TASKS), archive: show(originSha, ARCHIVE) }),
    head: unionHeads({ tasks: show('HEAD', TASKS), archive: show('HEAD', ARCHIVE) }),
    working: unionHeads({ tasks: readIf(join(root, TASKS)), archive: readIf(join(root, ARCHIVE)) }),
  }
}

/**
 * Prove that point N is on origin/main. Returns `{ ok: true, sha, anchor }` or
 * `{ ok: false, reason }` naming where the point stands instead.
 */
export function provePoint(point, gathered) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) return { ok: false, reason: `not a point number: ${point}` }
  const where = pointLocation(n, gathered)
  if (where !== 'origin-main') {
    return {
      ok: false,
      where,
      reason:
        `point ${n} ${LOCATION_WORDS[where]} of the main checkout — it is not on origin/main. ` +
        'Commit TASKS.md, push main, and only then tick the carrier; the entry stays open.',
    }
  }
  return { ok: true, sha: gathered.originSha.slice(0, 12), anchor: titleAnchor(gathered.remote.heads.get(n)) }
}
