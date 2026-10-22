// IO layer of the carrier's proof (see carrier-reconcile-core.mjs for the why).
//
// Reads the work order of the MAIN checkout — never a linked worktree's, whose
// branch may hold a point main does not — on three planes: origin/main (the only
// one that counts as durable), HEAD (committed, maybe unpushed) and the working
// tree (uncommitted).
//
// Usage:
//   node scripts/carrier-reconcile.mjs [--fetch] [--json]   every carrier tick vs the work order; exit 1 on RED
//   node scripts/carrier-reconcile.mjs --backfill [--fetch]  ONE-TIME: stamp `@<sha> ~<anchor>` onto legacy
//        sha-less ticks whose points origin/main holds; what cannot be proven stays RED
// Deliberately deleted/absorbed/renumbered points are named in docs/carrier-aliases.json.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMMON_REPO_ROOT, REPO_ROOT, withoutGitLocalEnvironment } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { repoCarrierPaths } from './findings-paths.mjs'
import { withBoardEditLock } from './board-edit-lock.mjs'
import {
  LOCATION_WORDS,
  carrierClaims,
  formatReconcile,
  pointLocation,
  reconcileCarrier,
  titleAnchor,
  unionHeads,
} from './carrier-reconcile-core.mjs'

export const ALIASES_PATH = 'docs/carrier-aliases.json'

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
 * A file at a revision. ONLY PROVEN ABSENCE is empty (review 22.10.2026): the
 * revision's tree is listed first, and a path it does not list returns ''. Any
 * other failure — an unreadable revision, a blob too big for the buffer —
 * THROWS, so no caller mistakes a read error for an empty work order.
 * `git(args)` must return stdout; give it a large maxBuffer.
 */
export function showAtRevision(git, rev, path) {
  const listed = String(git(['ls-tree', '-z', '--name-only', `${rev}^{tree}`, '--', path]))
  if (!listed.split('\0').includes(path)) return ''
  return git(['show', `${rev}:${path}`])
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
  const show = (rev, path) => showAtRevision(git, rev, path)
  const mainShas = git(['rev-list', 'origin/main']).split(/\r?\n/).filter(Boolean)
  return {
    root,
    originSha,
    mainShas,
    // The alias map from the SAME origin/main snapshot (review 22.10.2026): an
    // uncommitted deletion alias must never turn a missing order green.
    aliases: parseAliases(show(originSha, ALIASES_PATH)),
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

/** The explicit identity map of deliberately removed or renumbered points.
 *  An absent file is an empty map; an unparseable one THROWS (fail closed). */
export function parseAliases(text = '') {
  if (!String(text ?? '').trim()) return {}
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object') throw new Error(`${ALIASES_PATH} is not an object`)
  return raw.points ?? raw
}

/** Every carrier's text. Only a proven ENOENT counts as an empty carrier; any
 *  other read failure THROWS, so the reconciliation fails closed (review 22.10.2026). */
const readCarriers = (paths) =>
  paths.map((path) => {
    try {
      return { path, text: readFileSync(path, 'utf8') }
    } catch (e) {
      if (e?.code === 'ENOENT') return { path, text: '' }
      throw new Error(`carrier ${path} could not be read (${e?.code ?? e?.message ?? e})`)
    }
  })

/**
 * Run the reconciliation over every carrier of this repository. Never throws:
 * returns `{ ran, ok, result, lines, error }`, and `ran: false` is RED for
 * every caller (fail closed).
 */
export function runReconcile({ root = mainCheckoutRoot(), fetch = false, carrierPaths = null, override = null } = {}) {
  try {
    const paths = carrierPaths ?? repoCarrierPaths()
    const gathered = gatherWorkOrder({ root, fetch })
    const mainShas = new Set(gathered.mainShas.flatMap((sha) => [sha, sha.slice(0, 12)]))
    // `override` judges a CANDIDATE work order (a merge about to be pushed) as if
    // it were origin/main — land-point asks what pushing it would leave red.
    const candidate = override ? unionHeads({ tasks: override.tasks ?? '', archive: override.archive ?? '' }) : null
    const result = reconcileCarrier({
      carriers: readCarriers(paths),
      remote: candidate ?? gathered.remote,
      head: candidate ?? gathered.head,
      working: candidate ?? gathered.working,
      mainShas,
      // The candidate is judged WITH its own alias map (review 22.10.2026): a merge
      // that removes an alias must not keep borrowing origin/main's. Absent text
      // means no aliases — the strict reading.
      aliases: override ? parseAliases(override.aliases ?? '') : gathered.aliases,
    })
    return { ran: true, ok: result.ok, result, lines: formatReconcile(result), error: null }
  } catch (e) {
    const error = `${(e && (e.stderr || e.message)) || e}`.trim().split('\n')[0]
    return { ran: false, ok: false, result: null, lines: [`carrier reconciliation: COULD NOT RUN (${error}) — RED`], error }
  }
}

/**
 * ONE-TIME BACKFILL of legacy ticks. Each sha-less `queued N[..M]` whose every
 * point origin/main holds gets `@<origin/main sha>` (and `~<anchor>` for a
 * single point). Rewrites only those exact head lines on a FRESH read, so an
 * entry appended meanwhile survives. Returns { stamped, unproven }.
 */
export function backfillCarriers({ root = mainCheckoutRoot(), fetch = false, carrierPaths = null, lock = withBoardEditLock } = {}) {
  const gathered = gatherWorkOrder({ root, fetch })
  const aliases = gathered.aliases
  const sha = gathered.originSha.slice(0, 12)
  let stamped = 0
  const unproven = []
  for (const path of carrierPaths ?? repoCarrierPaths()) {
    // THE WHOLE READ-MODIFY-WRITE HOLDS THE DEPOSIT LOCK (review 22.10.2026) —
    // the same lock `finding.mjs --request` takes — so no deposit lands between
    // the read and the write and is lost.
    lock(() => {
      const result = stampOne(path)
      stamped += result
    }, { lockPath: `${path}.request-lock.json`, waitMs: 5000 })
  }
  return { stamped, unproven }

  function stampOne(path) {
    let text
    try {
      text = readFileSync(path, 'utf8')
    } catch (e) {
      if (e?.code === 'ENOENT') return 0
      throw e
    }
    const replace = new Map()
    for (const line of text.split(/\r?\n/)) {
      const claim = carrierClaims(line, path)[0]
      if (!claim || claim.kind !== 'queued' || claim.sha) continue
      const live = claim.points.filter((n) => !aliases[String(n)])
      const missing = live.filter((n) => pointLocation(n, gathered) !== 'origin-main')
      if (missing.length || live.length === 0) {
        if (missing.length) unproven.push({ path, title: claim.title, points: missing })
        continue
      }
      // One anchor per member, so every point of a range keeps its identity.
      const proof = `@${sha} ${claim.points.map((n) => `~${titleAnchor(gathered.remote.heads.get(n))}`).join(' ')}`
      replace.set(line, line.replace(` · ${claim.raw} · `, ` · ${claim.raw} ${proof} · `))
    }
    if (replace.size === 0) return 0
    const out = text
      .split('\n')
      .map((line) => {
        const key = line.replace(/\r$/, '')
        return replace.has(key) ? `${replace.get(key)}${line.endsWith('\r') ? '\r' : ''}` : line
      })
      .join('\n')
    writeFileSync(path, out, 'utf8')
    return replace.size
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const fetch = argv.includes('--fetch')
  if (argv.includes('--backfill')) {
    const { stamped, unproven } = backfillCarriers({ fetch })
    console.log(`backfill: ${stamped} legacy tick(s) stamped with their origin/main proof`)
    for (const u of unproven) console.log(`  UNPROVEN ${u.points.join(', ')} "${u.title.slice(0, 80)}" (${u.path})`)
  }
  const outcome = runReconcile({ fetch: fetch && !argv.includes('--backfill') })
  if (argv.includes('--json')) console.log(JSON.stringify({ ran: outcome.ran, ok: outcome.ok, ...outcome.result }, null, 2))
  else for (const line of outcome.lines) console.log(line)
  process.exit(outcome.ok ? 0 : 1)
}
