// Housekeeping run (point 1509, user 12.11.2026): shrink the project's disk
// footprint, recurring and token-free. Plain Node, no LLM. Every verdict comes
// from scripts/housekeeping-core.mjs; this file gathers facts and acts.
//
// The one-off pass and the recurring run are the SAME script under the SAME
// rules; only the git mode differs (one-off: --git full, by hand).
//
//   node scripts/housekeeping.mjs --dry-run            manifest only, deletes nothing
//   node scripts/housekeeping.mjs                      recurring run (git gc --auto)
//   node scripts/housekeeping.mjs --git full           one-off pass (owner, quiet machine)
//   options: --git auto|full|off  --budget-entries <n>  --budget-ms <n>
//
// Steps: /tmp caches and hoa-*/point-* logs (rule 5), closed-point outputs in
// local/ (rules 1-4), local/tool-output-logs (rule 6), git gc (rules 9-10).
// Writes local/housekeeping/<date>.jsonl (manifest + summary), state.json
// (last-attempt / last-success stamps, resume cursor), failures.jsonl.
// The launcher daemon spawns it detached at most once per 24 h
// (`spawnHousekeepingIfDue`); an exclusive lock makes overlapping runs exit.
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  statfsSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { probePid } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import {
  busyVerdict,
  createBudget,
  heldOpen,
  failuresToFile,
  gitPlan,
  isContained,
  isReferenced,
  localVerdict,
  lockVerdict,
  manifestLine,
  parseWorkOrder,
  parseWorktreeList,
  spawnDecision,
  summaryLine,
  tmpShapeVerdict,
  tmpVerdict,
  toolLogVerdict,
  touchesWorktree,
  DEFAULT_BUDGET_ENTRIES,
  DEFAULT_BUDGET_MS,
} from './housekeeping-core.mjs'

const SELF_PATH = fileURLToPath(import.meta.url)

export const USAGE = [
  'usage: node scripts/housekeeping.mjs [--dry-run] [--git auto|full|off] [--budget-entries <n>] [--budget-ms <n>]',
  '       --dry-run      write the manifest only; delete nothing (one-off pass: run this first and review it)',
  '       --git full     one-off pass: full foreground git gc after a headroom check (owner, quiet machine)',
].join('\n')

/** Reference docs whose mentions keep a local/ entry (rule 2). */
const REFERENCE_DOCS = ['docs/acceptance-evidence.md', 'docs/acceptance-criteria-detail.md', 'docs/backlog.md']

/** Reasons not worth a manifest line: the entry never matched a rule's shape. */
const SILENT = new Set([
  'not numbered',
  'no rule',
  'denylist',
  'not a cache shape',
  'young',
  'not a file',
  'not an inventoried output kind',
])

export function dataPaths(localRoot) {
  const dir = join(localRoot, 'housekeeping')
  return {
    dir,
    lock: join(dir, 'lock.json'),
    state: join(dir, 'state.json'),
    spawn: join(dir, 'spawn.json'),
    failures: join(dir, 'failures.jsonl'),
    manifest: (now) => join(dir, `${new Date(now).toISOString().slice(0, 10)}.jsonl`),
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Facts.

/** Walk a tree without following symlinks. Every entry spends budget; an
 *  exhausted budget or any read error leaves `complete` false (= keep). */
export function scanTree(path, budget) {
  const out = { bytes: 0, newestMtimeMs: -Infinity, entries: 0, hasGit: false, complete: true }
  const stack = [path]
  while (stack.length) {
    const p = stack.pop()
    if (!budget.spend(1)) {
      out.complete = false
      return out
    }
    let st
    try {
      st = lstatSync(p)
    } catch {
      out.complete = false
      return out
    }
    out.entries++
    out.bytes += st.size
    if (st.mtimeMs > out.newestMtimeMs) out.newestMtimeMs = st.mtimeMs
    if (!st.isDirectory()) continue
    let names
    try {
      names = readdirSync(p)
    } catch {
      out.complete = false
      return out
    }
    for (const n of names) {
      if (n === '.git') out.hasGit = true
      stack.push(join(p, n))
    }
  }
  return out
}

/** The two-level shape of a /tmp dir, for `isViteCacheShape`. */
export function describeShape(path, name) {
  try {
    const children = readdirSync(path, { withFileTypes: true }).map((d) => {
      const kid = { name: d.name, isDir: d.isDirectory(), isSymlink: d.isSymbolicLink(), children: null }
      if (kid.isDir && !kid.isSymlink && kid.children === null && (d.name === 'ssr' || d.name === 'web')) {
        kid.children = readdirSync(join(path, d.name), { withFileTypes: true }).map((f) => ({
          name: f.name,
          isFile: f.isFile(),
          isSymlink: f.isSymbolicLink(),
        }))
      }
      return kid
    })
    return { name, children }
  } catch {
    return null
  }
}

/** Open file paths and command lines of every process. ok=false when /proc or
 *  any live process's fd table cannot be read (fail closed). */
export function readProcessTable(procRoot = '/proc') {
  let pids
  try {
    pids = readdirSync(procRoot).filter((n) => /^\d+$/.test(n))
  } catch {
    return { ok: false, openPaths: [], cmdlines: null }
  }
  if (pids.length === 0) return { ok: false, openPaths: [], cmdlines: null }
  const openPaths = []
  const cmdlines = []
  let ok = true
  for (const pid of pids) {
    const base = join(procRoot, pid)
    try {
      cmdlines.push(readFileSync(join(base, 'cmdline'), 'utf8').split('\0').join(' '))
    } catch (e) {
      if (e?.code !== 'ENOENT' && e?.code !== 'ESRCH') ok = false
    }
    try {
      openPaths.push(readlinkSync(join(base, 'cwd')))
    } catch (e) {
      if (e?.code !== 'ENOENT' && e?.code !== 'ESRCH') ok = false
    }
    let fds
    try {
      fds = readdirSync(join(base, 'fd'))
    } catch (e) {
      if (e?.code !== 'ENOENT' && e?.code !== 'ESRCH') ok = false
      continue
    }
    for (const fd of fds) {
      try {
        openPaths.push(readlinkSync(join(base, 'fd', fd)))
      } catch (e) {
        if (e?.code !== 'ENOENT' && e?.code !== 'ESRCH') ok = false
      }
    }
  }
  return { ok, openPaths, cmdlines }
}

function freeBytes(path) {
  try {
    const s = statfsSync(path)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

function gitPackBytes(runGit, repoRoot) {
  try {
    const r = runGit(['count-objects', '-v'], repoRoot)
    if (r.status !== 0) return null
    const kv = Object.fromEntries(
      String(r.stdout)
        .split('\n')
        .map((l) => l.split(':').map((s) => s.trim()))
        .filter((p) => p.length === 2),
    )
    const kib = Number(kv['size-pack']) + Number(kv.size) + Number(kv['size-garbage'] || 0)
    return Number.isFinite(kib) ? kib * 1024 : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Removal, revalidated (rule 4).

/** Re-check the target immediately before removal: same inode, not a symlink,
 *  canonically inside its root, top-level mtime unchanged. */
export function revalidate(path, ident, rootCanonical) {
  let st
  try {
    st = lstatSync(path)
  } catch {
    return 'vanished'
  }
  if (st.isSymbolicLink()) return 'became a symlink'
  if (st.dev !== ident.dev || st.ino !== ident.ino) return 'replaced'
  if (st.mtimeMs !== ident.mtimeMs) return 'changed since scan'
  let canon
  try {
    canon = realpathSync(path)
  } catch {
    return 'unresolvable'
  }
  if (!isContained(canon, rootCanonical)) return 'escapes its root'
  return null
}

// ---------------------------------------------------------------------------
// Lock (rule 11).

/** A takeover marker older than this means a taker died inside the critical
 *  section; the stale lock it guarded then needs a human (finding). */
const TAKEOVER_MARKER_STUCK_MS = 60 * 60 * 1000

function createLock(lockPath, record) {
  const fd = openSync(lockPath, 'wx')
  try {
    writeSync(fd, JSON.stringify(record))
  } finally {
    closeSync(fd)
  }
  const back = readJson(lockPath)
  if (!back || back.pid !== record.pid || back.startedAt !== record.startedAt) return { ok: false, reason: 'lock taken over' }
  return { ok: true, record }
}

/**
 * Exclusive lock. A stale lock is taken over EXCLUSIVELY: the taker first
 * creates (O_EXCL) a marker named after the stale lock's identity (inode +
 * ctime), re-checks that the lock file still IS that stale file, moves it aside
 * and only then creates its own lock. A second contender that judged the same
 * stale lock either loses the marker or finds a different file at the lock path
 * and leaves it alone — it can never remove the winner's fresh lock.
 */
export function acquireLock(lockPath, { now = Date.now(), pid = process.pid, probe = probePid } = {}) {
  const self = probe(pid)
  const record = { pid, pidStartedAt: self?.startedAt ?? null, startedAt: now }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return createLock(lockPath, record)
    } catch (e) {
      if (e?.code !== 'EEXIST') return { ok: false, reason: `lock not writable: ${e?.code || e}` }
    }
    let ident
    let lock = null
    try {
      ident = lstatSync(lockPath)
      const raw = readFileSync(lockPath, 'utf8')
      try {
        lock = JSON.parse(raw)
      } catch {
        lock = 'unreadable'
      }
    } catch (e) {
      if (e?.code === 'ENOENT') continue
      return { ok: false, reason: `lock unreadable: ${e?.code || e}` }
    }
    const holder = lock && typeof lock === 'object' ? probe(Number(lock.pid)) : null
    const verdict = lockVerdict({ lock, probe: holder, now, lockMtimeMs: ident.mtimeMs })
    if (verdict !== 'stale') return { ok: false, reason: 'another housekeeping run holds the lock' }
    const marker = `${lockPath}.takeover-${ident.ino}-${Math.round(ident.ctimeMs * 1000)}`
    try {
      closeSync(openSync(marker, 'wx'))
    } catch (e) {
      if (e?.code !== 'EEXIST') return { ok: false, reason: `takeover marker not writable: ${e?.code || e}` }
      let age = 0
      try {
        age = now - statSync(marker).mtimeMs
      } catch {
        /* the other taker finished meanwhile */
      }
      return age > TAKEOVER_MARKER_STUCK_MS
        ? { ok: false, stuck: true, reason: `stuck takeover marker ${marker}: a taker died; remove it and the lock by hand` }
        : { ok: false, reason: 'another run is taking the stale lock over' }
    }
    let aside = null
    try {
      let cur
      try {
        cur = lstatSync(lockPath)
      } catch (e) {
        if (e?.code === 'ENOENT') return { ok: false, reason: 'lock taken over' }
        throw e
      }
      // Not the file judged stale: another taker already replaced it.
      if (cur.ino !== ident.ino || cur.ctimeMs !== ident.ctimeMs) return { ok: false, reason: 'lock taken over' }
      aside = `${lockPath}.stale-${pid}-${now}`
      renameSync(lockPath, aside)
      try {
        return createLock(lockPath, record)
      } catch (e) {
        return { ok: false, reason: `lock not writable: ${e?.code || e}` }
      }
    } catch (e) {
      return { ok: false, reason: `lock takeover failed: ${e?.code || e}` }
    } finally {
      // The moved-aside file outlives the new lock's creation, so the new lock
      // can never reuse its inode; the marker goes last.
      for (const p of [aside, marker]) {
        if (!p) continue
        try {
          unlinkSync(p)
        } catch {
          /* already gone */
        }
      }
    }
  }
  return { ok: false, reason: 'lock contended' }
}

export function releaseLock(lockPath, record) {
  const back = readJson(lockPath)
  if (back && back.pid === record.pid && back.startedAt === record.startedAt) {
    try {
      unlinkSync(lockPath)
    } catch {
      /* already gone */
    }
  }
}

// ---------------------------------------------------------------------------
// The run.

function defaultRunGit(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 4 * 60 * 60 * 1000, windowsHide: true })
}

function defaultFileFinding(title, detail, repoRoot) {
  spawnSync(process.execPath, [join(repoRoot, 'scripts', 'finding.mjs'), '--record', title, '--detail', detail], {
    cwd: repoRoot,
    stdio: 'ignore',
    timeout: 60_000,
    windowsHide: true,
  })
}

/** Sorted names after the resume cursor. */
function namesAfter(dir, cursor) {
  const names = readdirSync(dir).sort()
  return cursor ? names.filter((n) => n > cursor) : names
}

/**
 * One housekeeping run. Everything touching the outside is injectable so the
 * tests drive it on a throwaway tree. Returns the summary object.
 */
export function runHousekeeping({
  repoRoot = REPO_ROOT,
  localRoot = join(repoRoot, 'local'),
  tmpRoot = '/tmp',
  procRoot = '/proc',
  clock = Date.now,
  dryRun = false,
  gitMode = 'auto',
  budgetEntries = DEFAULT_BUDGET_ENTRIES,
  budgetMs = DEFAULT_BUDGET_MS,
  steps = ['tmp', 'local', 'logs', 'git'],
  runGit = defaultRunGit,
  readWorktrees = () => {
    const r = runGit(['worktree', 'list', '--porcelain'], repoRoot)
    return r.status === 0 ? String(r.stdout) : null
  },
  readProcesses = () => readProcessTable(procRoot),
  fileFinding = (title, detail) => defaultFileFinding(title, detail, repoRoot),
  probe = probePid,
  pid = process.pid,
} = {}) {
  const startedAt = clock()
  const paths = dataPaths(localRoot)
  // The main checkout only: a worktree's local/ is not the one to clean.
  try {
    if (!statSync(join(repoRoot, '.git')).isDirectory()) return { outcome: 'refused', reason: 'not the main checkout' }
  } catch {
    return { outcome: 'refused', reason: 'checkout unverifiable' }
  }
  try {
    mkdirSync(paths.dir, { recursive: true })
  } catch (e) {
    return { outcome: 'refused', reason: `cannot create ${paths.dir}: ${e?.code || e}` }
  }
  const lock = acquireLock(paths.lock, { now: startedAt, pid, probe })
  if (!lock.ok) {
    if (lock.stuck) {
      try {
        fileFinding('Housekeeping failure: lock-takeover-stuck', `scripts/housekeeping.mjs: ${lock.reason}`)
      } catch {
        /* the outcome carries it */
      }
      return { outcome: 'failed', reason: lock.reason }
    }
    return { outcome: 'overlap', reason: lock.reason }
  }
  try {
    return runLocked()
  } finally {
    releaseLock(paths.lock, lock.record)
  }

  function runLocked() {
    const runId = `${new Date(startedAt).toISOString()}-${pid}`
    const manifestPath = paths.manifest(startedAt)
    const state = readJson(paths.state) || {}
    const cursor = { ...(state.cursor || {}) }
    const writeState = (patch) => {
      try {
        Object.assign(state, patch)
        writeJsonAtomic(paths.state, state)
      } catch {
        /* stamps are advisory; the lock still bounds overlap */
      }
    }
    writeState({ lastAttemptAt: startedAt })

    const failures = []
    const fail = (kind, detail) => {
      failures.push({ kind, detail })
      try {
        appendFileSync(paths.failures, `${JSON.stringify({ runId, at: clock(), kind, detail })}\n`)
      } catch {
        /* the summary still carries it */
      }
    }
    const emit = (line) => {
      try {
        appendFileSync(manifestPath, `${manifestLine({ runId, ...line })}\n`)
      } catch (e) {
        fail('manifest-unwritable', String(e?.code || e))
      }
    }
    const budget = createBudget({ maxEntries: budgetEntries, maxMs: budgetMs, clock })
    const stepResults = {}
    let complete = true
    let freedBytes = 0
    let plannedBytes = 0
    const dfBefore = { repo: freeBytes(repoRoot), tmp: freeBytes(tmpRoot) }

    /** Delete (or, dry, plan) one revalidated target. Liveness is read AFRESH
     *  for every candidate: a step-wide snapshot would be minutes old by the
     *  last entry. Unknown liveness keeps. The filesystem revalidation comes
     *  AFTER that scan, directly before removal: the /proc walk takes time in
     *  which the target can be replaced. */
    const remove = (path, ident, rootCanonical, rule, size) => {
      let fresh
      try {
        fresh = readProcesses()
      } catch {
        fresh = null
      }
      if (!fresh || !fresh.ok) {
        fail('proc-unreadable', `process table unreadable before removing ${path}`)
        return emit({ path, size, rule, outcome: 'kept', reason: 'liveness unknown' })
      }
      if (heldOpen(path, fresh.openPaths)) return emit({ path, size, rule, outcome: 'kept', reason: 'held open by a live process' })
      const bad = revalidate(path, ident, rootCanonical)
      if (bad) return emit({ path, size, rule, outcome: 'kept', reason: bad })
      if (dryRun) {
        plannedBytes += size
        return emit({ path, size, rule, outcome: 'would-delete' })
      }
      try {
        rmSync(path, { recursive: true, force: false })
        freedBytes += size
        emit({ path, size, rule, outcome: 'deleted' })
      } catch (e) {
        fail('remove-failed', `${path}: ${e?.code || e}`)
        emit({ path, size, rule, outcome: 'failed', reason: String(e?.code || e) })
      }
    }

    /** Iterate a directory's names after the step's cursor, under the budget. */
    const walk = (step, dir, visit) => {
      let names
      try {
        names = namesAfter(dir, cursor[step])
      } catch (e) {
        if (e?.code === 'ENOENT') return 'absent'
        fail(`${step}-unreadable`, `${dir}: ${e?.code || e}`)
        return 'unreadable'
      }
      let first = true
      for (const name of names) {
        if (budget.exhausted()) {
          complete = false
          writeState({ cursor })
          return 'incomplete'
        }
        visit(name)
        // A visit the budget cut short kept its entry as "scan incomplete": the
        // cursor stays before it so the next run sees it again — unless it was
        // this run's first entry, which alone outgrows the budget and would
        // otherwise block every later run.
        if (budget.exhausted() && !first) {
          complete = false
          writeState({ cursor })
          return 'incomplete'
        }
        first = false
        cursor[step] = name
      }
      cursor[step] = null
      writeState({ cursor })
      return 'done'
    }

    // Shared facts for local/ and tool-output-logs (rules 1, 2, 6).
    let workOrder = null
    let refTexts = null
    const needRefs = () => {
      if (workOrder) return
      let tasks = null
      let archive = null
      let readOk = false
      try {
        tasks = readFileSync(join(repoRoot, 'TASKS.md'), 'utf8')
        archive = readFileSync(join(repoRoot, 'docs/tasks-archive.md'), 'utf8')
        readOk = true
      } catch (e) {
        fail('work-order-unreadable', String(e?.code || e))
      }
      workOrder = parseWorkOrder(tasks, archive)
      if (!workOrder.ok && readOk) fail('work-order-unparseable', workOrder.reason)
      try {
        const docs = REFERENCE_DOCS.map((d) => readFileSync(join(repoRoot, d), 'utf8'))
        refTexts = workOrder.ok ? [workOrder.openText, ...docs] : null
      } catch (e) {
        fail('reference-docs-unreadable', String(e?.code || e))
        refTexts = null
      }
    }

    let liveness = null
    const needLiveness = () => {
      if (!liveness) {
        try {
          liveness = readProcesses() || { ok: false }
        } catch {
          liveness = { ok: false }
        }
      }
      return liveness
    }
    /** Fail closed: a step that deletes needs a readable process table. */
    const livenessGate = (step) => {
      if (needLiveness().ok) return true
      fail('proc-unreadable', `the /proc process table could not be read; ${step} step skipped`)
      stepResults[step] = 'skipped'
      return false
    }

    let repoCanon = null
    try {
      repoCanon = realpathSync(repoRoot)
    } catch {
      /* every repo-rooted step then refuses its root */
    }
    /** Canonical worktree roots other than the main checkout, or null (= skip). */
    let worktrees
    const needWorktrees = (step) => {
      if (worktrees === undefined) {
        let text = null
        try {
          text = readWorktrees()
        } catch {
          text = null
        }
        const list = parseWorktreeList(text)
        worktrees = list
          ? list
              .map((w) => {
                try {
                  return realpathSync(w)
                } catch {
                  return w
                }
              })
              .filter((w) => w !== repoCanon)
          : null
      }
      if (!worktrees) {
        fail('worktree-list-unreadable', `git worktree list failed; ${step} step skipped`)
        stepResults[step] = 'skipped'
      }
      return worktrees
    }
    /**
     * A repo-rooted cleanup root: neither it nor any directory between the repo
     * and it may be a symlink, and its canonical path must lie inside the repo.
     * Returns the canonical root, 'absent', or null after filing a failure.
     */
    const safeRepoRoot = (step, chain) => {
      for (const p of chain) {
        try {
          if (lstatSync(p).isSymbolicLink()) {
            fail(`${step}-root-unsafe`, `${p} is a symlink; ${step} step skipped`)
            return null
          }
        } catch (e) {
          if (e?.code === 'ENOENT') return 'absent'
          fail(`${step}-unreadable`, `${p}: ${e?.code || e}`)
          return null
        }
      }
      const target = chain[chain.length - 1]
      let canon
      try {
        canon = realpathSync(target)
      } catch (e) {
        fail(`${step}-unreadable`, `${target}: ${e?.code || e}`)
        return null
      }
      if (!repoCanon || !isContained(canon, repoCanon)) {
        fail(`${step}-root-unsafe`, `${target} resolves to ${canon}, outside the repository; ${step} step skipped`)
        return null
      }
      return canon
    }

    for (const step of steps) {
      if (step === 'tmp') {
        needRefs()
        if (!refTexts) {
          stepResults.tmp = 'skipped'
          continue
        }
        if (!livenessGate('tmp')) continue
        const live = needLiveness()
        const wts = needWorktrees('tmp')
        if (!wts) continue
        let root
        try {
          root = realpathSync(tmpRoot)
        } catch (e) {
          fail('tmp-unreadable', String(e?.code || e))
          stepResults.tmp = 'skipped'
          continue
        }
        stepResults.tmp = walk('tmp', root, (name) => {
          const path = join(root, name)
          let st
          try {
            st = lstatSync(path)
          } catch {
            return
          }
          budget.spend(1)
          const isSymlink = st.isSymbolicLink()
          const isFile = st.isFile()
          const shape = !isSymlink && st.isDirectory() && !/^(hoa|point)-/.test(name) ? describeShape(path, name) : null
          const pre = tmpShapeVerdict({ name, isSymlink, isFile, shape })
          if (!pre.ok) {
            if (!SILENT.has(pre.reason)) emit({ path, size: st.size, rule: 'tmp', outcome: 'kept', reason: pre.reason })
            return
          }
          if (touchesWorktree(path, wts)) return emit({ path, size: null, rule: pre.rule, outcome: 'kept', reason: 'git worktree' })
          const scan = scanTree(path, budget)
          const facts = { name, isSymlink, isFile, shape, complete: scan.complete, newestMtimeMs: scan.newestMtimeMs, canonical: path }
          const v = tmpVerdict(facts, { now: clock(), liveness: live })
          if (!v.act) {
            if (!SILENT.has(v.reason)) emit({ path, size: scan.bytes, rule: 'tmp', outcome: 'kept', reason: v.reason })
            return
          }
          if (scan.hasGit) return emit({ path, size: scan.bytes, rule: v.rule, outcome: 'kept', reason: 'contains .git' })
          if (isReferenced(name, refTexts)) return emit({ path, size: scan.bytes, rule: v.rule, outcome: 'kept', reason: 'referenced' })
          remove(path, st, root, v.rule, scan.bytes)
        })
        if (stepResults.tmp === 'incomplete') break
        continue
      }

      if (step === 'local') {
        needRefs()
        if (!workOrder.ok || !refTexts) {
          stepResults.local = 'skipped'
          continue
        }
        if (!livenessGate('local')) continue
        const worktrees = needWorktrees('local')
        if (!worktrees) continue
        const root = safeRepoRoot('local', [localRoot])
        if (!root || root === 'absent') {
          stepResults.local = 'skipped'
          continue
        }
        stepResults.local = walk('local', root, (name) => {
          const path = join(root, name)
          let st
          try {
            st = lstatSync(path)
          } catch {
            return
          }
          budget.spend(1)
          const entry = { name, isDir: st.isDirectory(), isFile: st.isFile(), isSymlink: st.isSymbolicLink() }
          const v = localVerdict(entry, { workOrder, refTexts })
          if (!v.act) {
            if (!SILENT.has(v.reason)) emit({ path, size: st.size, rule: 'local', outcome: 'kept', reason: v.reason })
            return
          }
          if (touchesWorktree(path, worktrees))
            return emit({ path, size: null, rule: v.rule, outcome: 'kept', reason: 'git worktree' })
          const scan = scanTree(path, budget)
          if (!scan.complete) return emit({ path, size: scan.bytes, rule: v.rule, outcome: 'kept', reason: 'scan incomplete' })
          if (scan.hasGit) return emit({ path, size: scan.bytes, rule: v.rule, outcome: 'kept', reason: 'contains .git' })
          remove(path, st, root, v.rule, scan.bytes)
        })
        if (stepResults.local === 'incomplete') break
        continue
      }

      if (step === 'logs') {
        needRefs()
        if (!refTexts) {
          stepResults.logs = 'skipped'
          continue
        }
        if (!livenessGate('logs')) continue
        const logWorktrees = needWorktrees('logs')
        if (!logWorktrees) continue
        const root = safeRepoRoot('logs', [localRoot, join(localRoot, 'tool-output-logs')])
        if (!root || root === 'absent') {
          stepResults.logs = 'skipped'
          continue
        }
        stepResults.logs = walk('logs', root, (name) => {
          const path = join(root, name)
          let st
          try {
            st = lstatSync(path)
          } catch {
            return
          }
          budget.spend(1)
          const entry = { name, isFile: st.isFile(), isSymlink: st.isSymbolicLink() }
          const v = toolLogVerdict(entry, { now: clock(), mtimeMs: st.mtimeMs, refTexts })
          if (!v.act) {
            if (!SILENT.has(v.reason)) emit({ path, size: st.size, rule: 'tool-log-age', outcome: 'kept', reason: v.reason })
            return
          }
          if (touchesWorktree(path, logWorktrees))
            return emit({ path, size: st.size, rule: v.rule, outcome: 'kept', reason: 'git worktree' })
          remove(path, st, root, v.rule, st.size)
        })
        if (stepResults.logs === 'incomplete') break
        continue
      }

      if (step === 'git') {
        // Fresh read: the cached snapshot dates from the first cleanup step, and
        // a suite may have started since.
        liveness = null
        const live = needLiveness()
        // ok:false may still carry a PARTIAL cmdline list: a suite may hide in
        // the unread part, so only a fully read table answers "not busy".
        const busy = live.ok ? busyVerdict(live.cmdlines) : null
        const before = gitPackBytes(runGit, repoRoot)
        const plan = gitPlan({ mode: gitMode, busy, freeBytes: freeBytes(repoRoot), gitBytes: before })
        if (!plan.run) {
          if (gitMode !== 'off' && busy === null) fail('proc-unreadable', 'git step skipped: process table unreadable')
          emit({ path: join(repoRoot, '.git'), size: before, rule: `git-${gitMode}`, outcome: 'kept', reason: plan.reason })
          stepResults.git = 'skipped'
          continue
        }
        if (dryRun) {
          emit({
            path: join(repoRoot, '.git'),
            size: before,
            rule: `git-${gitMode}`,
            outcome: 'would-run',
            reason: `git ${plan.args.join(' ')}`,
          })
          stepResults.git = 'planned'
          continue
        }
        const r = runGit(plan.args, repoRoot)
        const after = gitPackBytes(runGit, repoRoot)
        if (r.status !== 0) fail('git-gc-failed', `exit ${r.status}: ${String(r.stderr || '').slice(0, 400)}`)
        if (Number.isFinite(before) && Number.isFinite(after) && before > after) freedBytes += before - after
        emit({
          path: join(repoRoot, '.git'),
          size: after,
          rule: `git-${gitMode}`,
          outcome: r.status === 0 ? 'ran' : 'failed',
          reason: `before ${before} after ${after}`,
        })
        stepResults.git = r.status === 0 ? 'done' : 'failed'
      }
    }

    const finishedAt = clock()
    const dfAfter = { repo: freeBytes(repoRoot), tmp: freeBytes(tmpRoot) }
    const kinds = failures.map((f) => f.kind)
    const summary = {
      runId,
      startedAt,
      finishedAt,
      dryRun,
      complete,
      freedBytes,
      plannedBytes,
      dfBefore,
      dfAfter,
      failures: kinds,
      steps: stepResults,
    }
    try {
      appendFileSync(manifestPath, `${summaryLine(summary)}\n`)
    } catch {
      /* recorded in failures.jsonl by emit already when the file is unwritable */
    }

    // Rule 12: one finding per failure kind until that kind recovers.
    const { file, nextReported } = failuresToFile({ reported: state.reportedFailures || [], current: kinds })
    for (const kind of file) {
      const detail = failures.find((f) => f.kind === kind)?.detail || ''
      try {
        fileFinding(
          `Housekeeping failure: ${kind}`,
          `scripts/housekeeping.mjs run ${runId}: ${detail} (manifest ${manifestPath})`,
        )
      } catch {
        /* failures.jsonl keeps it regardless */
      }
    }
    writeState({
      reportedFailures: nextReported,
      lastOutcome: kinds.length ? 'failed' : complete ? 'complete' : 'incomplete',
      ...(kinds.length === 0 && complete && !dryRun ? { lastSuccessAt: finishedAt } : {}),
    })
    return { outcome: kinds.length ? 'failed' : complete ? 'complete' : 'incomplete', manifestPath, plannedBytes, ...summary }
  }
}

// ---------------------------------------------------------------------------
// The launcher's hook (rule 11): spawn detached, never await, never traverse.

/** A stamp file's value: absent = 0 (never), unreadable or malformed = null. */
function readStamp(path, field) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    return e?.code === 'ENOENT' ? 0 : null
  }
  try {
    const v = JSON.parse(raw)?.[field]
    if (v === undefined) return 0
    return Number.isFinite(Number(v)) ? Number(v) : null
  } catch {
    return null
  }
}

/**
 * Called by the launcher daemon after each tick. Synchronous and cheap: two
 * small JSON reads and, at most once per interval, a detached spawn.
 * The launch stamp is PERSISTED (atomic write) BEFORE the spawn, so the 24 h
 * limit survives a child that dies before writing its own state and a daemon
 * restart. An unreadable stamp or state, or a stamp that cannot be written,
 * means "not now" — never "never ran".
 * Returns { spawned, lastSpawnAt, reason }.
 */
export function spawnHousekeepingIfDue({
  now = Date.now(),
  lastSpawnAt = 0,
  statePath = dataPaths(join(REPO_ROOT, 'local')).state,
  spawnPath = join(dirname(statePath), 'spawn.json'),
  spawner = spawn,
  cwd = REPO_ROOT,
  scriptPath = SELF_PATH,
  writeStamp = writeJsonAtomic,
} = {}) {
  const lastAttemptAt = readStamp(statePath, 'lastAttemptAt')
  const persistedSpawnAt = readStamp(spawnPath, 'lastSpawnAt')
  if (lastAttemptAt === null || persistedSpawnAt === null)
    return { spawned: false, lastSpawnAt, reason: 'housekeeping state unreadable' }
  const d = spawnDecision({ now, lastSpawnAt: Math.max(Number(lastSpawnAt) || 0, persistedSpawnAt), lastAttemptAt })
  if (!d.spawn) return { spawned: false, lastSpawnAt, reason: d.reason }
  try {
    mkdirSync(dirname(spawnPath), { recursive: true })
    writeStamp(spawnPath, { lastSpawnAt: now })
  } catch (e) {
    return { spawned: false, lastSpawnAt, reason: `launch stamp not writable: ${e?.code || e}` }
  }
  const child = spawner(process.execPath, [scriptPath], { cwd, detached: true, stdio: 'ignore', windowsHide: true })
  // An asynchronous spawn failure must not crash the daemon.
  child?.on?.('error', () => {})
  child?.unref?.()
  return { spawned: true, lastSpawnAt: now, reason: d.reason }
}

// ---------------------------------------------------------------------------
// CLI.

export function parseArgs(argv) {
  const opts = { dryRun: false, gitMode: 'auto' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--git' && ['auto', 'full', 'off'].includes(argv[i + 1])) opts.gitMode = argv[++i]
    else if (a === '--budget-entries' && Number(argv[i + 1]) > 0) opts.budgetEntries = Number(argv[++i])
    else if (a === '--budget-ms' && Number(argv[i + 1]) > 0) opts.budgetMs = Number(argv[++i])
    else if (a === '--help' || a === '-h') opts.help = true
    else return { error: `unknown argument: ${a}` }
  }
  return opts
}

if (isMainModule(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || opts.error) {
    if (opts.error) console.error(opts.error)
    console.log(USAGE)
    process.exit(opts.error ? 2 : 0)
  }
  const r = runHousekeeping(opts)
  console.log(JSON.stringify(r))
  process.exit(r.outcome === 'complete' || r.outcome === 'incomplete' || r.outcome === 'overlap' ? 0 : 1)
}
