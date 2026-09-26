// THE READER SIDE OF THE BOARD'S LIVENESS AND PROGRESS LINES.
//
// Reads the stores the batch already keeps — the batch lock, the focus stamp,
// the pause record, the launcher log's tail, the active point's feat branch, the
// running verify processes and the recorded verify runs — and hands them to the
// pure core (board-liveness-core.mjs). Used by the publisher, which renders the
// lines, and by the launcher, which republishes when the focus branch moved.
//
// EVERY read fails soft: an unreadable store is a reading the line reports as
// absent, never a failed publish.

import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readlinkSync, readSync } from 'node:fs'
import { commonRepoPath, REPO_ROOT } from './repo-paths.mjs'
import { readPause } from './board-state.mjs'
import { readVerifyProcesses } from './verify/large-run-wait.mjs'
import { livenessVerdict, pointVerifyVerdict, progressLine, renderLivenessBlock, runningVerifications } from './board-liveness-core.mjs'

export const LIVENESS_PATHS = {
  lock: commonRepoPath('.claude/batch-lock.json'),
  focus: commonRepoPath('.claude/current-focus.json'),
  launcherLog: commonRepoPath('.claude/batch-launcher.log'),
  renderState: commonRepoPath('.claude/render-verify-state.json'),
}

function readJson(path) {
  try {
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** The last meaningful launcher log line (the log is megabytes: read its tail). */
export function readLauncherLine(path = LIVENESS_PATHS.launcherLog) {
  let fd = null
  try {
    if (!existsSync(path)) return ''
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const len = Math.min(size, 8192)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    return lines.reverse().find((l) => !/tick (started|finished)/.test(l)) ?? ''
  } catch {
    return ''
  } finally {
    if (fd !== null) try { closeSync(fd) } catch { /* nothing to release */ }
  }
}

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim()

/** The active point from the focus stamp, or null. */
export function focusPoint(focus = readJson(LIVENESS_PATHS.focus)) {
  const n = Number(focus?.point)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The newest local `feat/<point>-*` branch head: { name, head, at, subject }, or
 * null. Refs are shared by every worktree, so the main tree sees them all.
 */
export function focusBranch(point, { cwd = REPO_ROOT } = {}) {
  if (!point) return null
  try {
    const out = git(
      ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(objectname)%09%(committerdate:unix)%09%(subject)', `refs/heads/feat/${point}-*`],
      cwd,
    )
    const first = out.split('\n').find(Boolean)
    if (!first) return null
    const [name, head, unix, ...subject] = first.split('\t')
    return { name, head, at: Number(unix) * 1000, subject: subject.join('\t') }
  } catch {
    return null
  }
}

function branchCommits(branch, cwd) {
  try {
    return git(['rev-list', '--max-count=300', branch.head, '--not', 'origin/main'], cwd).split('\n').filter(Boolean)
  } catch {
    return branch ? [branch.head] : []
  }
}

/** Every worktree path and the branch it has checked out. */
function readWorktrees(cwd) {
  try {
    const list = []
    let cur = null
    for (const line of git(['worktree', 'list', '--porcelain'], cwd).split('\n')) {
      if (line.startsWith('worktree ')) list.push((cur = { path: line.slice(9), branch: null }))
      else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
    }
    return list
  } catch {
    return []
  }
}

/** Only the active point's runs: those whose cwd lies in its branch's worktree. */
function readRunning(branch, cwd) {
  try {
    const worktrees = readWorktrees(cwd)
    const own = branch ? worktrees.find((w) => w.branch === branch.name)?.path ?? null : null
    const rows = readVerifyProcesses().map((row) => {
      let procCwd = null
      try { procCwd = readlinkSync(`/proc/${row.pid}/cwd`) } catch { /* not readable: not attributable */ }
      return { ...row, cwd: procCwd }
    })
    return runningVerifications(rows, { worktree: own, worktrees: worktrees.map((w) => w.path) })
  } catch {
    return []
  }
}

/**
 * Everything measured for the block, and the block itself. `now` is the
 * measuring instant the page carries.
 */
export function measureLiveness({ now = Date.now(), cwd = REPO_ROOT } = {}) {
  const focus = readJson(LIVENESS_PATHS.focus)
  const liveness = livenessVerdict({
    lock: readJson(LIVENESS_PATHS.lock),
    focus,
    pause: readPause(),
    launcherLine: readLauncherLine(),
    now,
  })
  const point = focusPoint(focus)
  const branch = focusBranch(point, { cwd })
  const runs = readJson(LIVENESS_PATHS.renderState)?.runs
  const verdict = branch ? pointVerifyVerdict(runs, branchCommits(branch, cwd)) : null
  const progress = progressLine({ point, commit: branch, running: readRunning(branch, cwd), verdict, now })
  const focusHead = branch?.head ?? null
  return { liveness, progress, focusHead, block: renderLivenessBlock({ liveness, progress, measuredAt: now, focusHead }) }
}
