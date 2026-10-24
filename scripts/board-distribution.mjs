// THE "VERTEILUNG" GATHERER — reads git and the review ledger for the publish
// path; every judgement lives in scripts/board-distribution-core.mjs.
//
// A point's authored commits come from three places, in this order:
//   1. its live `feat/<N>-*` branch (local or origin), the commits not on main;
//   2. the merge of that branch into main, once the branch is gone;
//   3. the shas the review ledger recorded for the point.
// Commits that touch nothing outside `.claude/` are bookkeeping (review and
// commission records, queue ranks), not the build, and are left out.

import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from './dashboard-state.mjs'
import { readRecords } from './mechanism-review.mjs'
import { distributionLine, distributionOf, pointOfBranch } from './board-distribution-core.mjs'

const FORMAT =
  '%x1e%H%x1f%(trailers:key=Co-Authored-By,valueonly,separator=;)%x1f%(trailers:key=Claude-Session,valueonly,separator=;)'

function git(args, { input } = {}) {
  const res = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', input, windowsHide: true })
  return res.status === 0 ? res.stdout ?? '' : ''
}

/** Commits of one `git log --name-only --format=FORMAT` output as `{ sha, authors, cloud, files }`. */
export function parseCommitLog(text) {
  return String(text ?? '')
    .split('\x1e')
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [head, ...rest] = chunk.split('\n')
      const [sha, authors = '', session = ''] = head.split('\x1f')
      return {
        sha: sha.trim(),
        authors: authors.split(';').map((a) => a.trim()).filter(Boolean),
        cloud: Boolean(session.trim()),
        files: rest.map((f) => f.trim()).filter(Boolean),
      }
    })
}

const isBookkeeping = (commit) => commit.files.length > 0 && commit.files.every((f) => f.startsWith('.claude/'))
const logOf = (args, input) => parseCommitLog(git(['log', '--no-merges', '--name-only', `--format=${FORMAT}`, ...args], { input }))

/** The ref the branches are measured against: origin/main where it exists, else main. */
function baseRef() {
  return git(['rev-parse', '--verify', '--quiet', 'origin/main']).trim() ? 'origin/main' : 'main'
}

/**
 * `point → line` for every point in `points`.
 * `records` is injectable for a caller that already holds them.
 */
export function gatherDistributionLines(
  points,
  // Half authors play no part in the line; skipping their check spares a git read per blind row.
  { records = readRecords(undefined, { verifyHalves: () => false }) } = {},
) {
  const wanted = new Set([...points].map(Number))
  const commits = new Map([...wanted].map((n) => [n, new Map()]))
  const keep = (n, list) => {
    for (const c of list) if (!isBookkeeping(c)) commits.get(n).set(c.sha, c)
  }
  const base = baseRef()

  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/heads/feat/', 'refs/remotes/origin/feat/'])
  for (const ref of refs.split('\n').filter(Boolean)) {
    const n = pointOfBranch(ref)
    if (wanted.has(n)) keep(n, logOf([`${base}..${ref}`]))
  }

  const merges = git(['log', '--merges', '--first-parent', '--format=%P%x1f%s', base])
  for (const line of merges.split('\n').filter(Boolean)) {
    const [parents, subject] = line.split('\x1f')
    const n = pointOfBranch(subject)
    const [first, second] = parents.split(' ')
    if (wanted.has(n) && second && !commits.get(n).size) keep(n, logOf([`${first}..${second}`]))
  }

  const shaPoint = new Map()
  for (const r of records ?? []) {
    if (r && !r.kind && wanted.has(Number(r.point)) && /^[0-9a-f]{40}$/.test(String(r.sha ?? ''))) {
      shaPoint.set(r.sha, Number(r.point))
    }
  }
  if (shaPoint.size) {
    for (const c of logOf(['--no-walk', '--ignore-missing', '--stdin'], [...shaPoint.keys()].join('\n') + '\n')) {
      keep(shaPoint.get(c.sha), [c])
    }
  }

  return new Map(
    [...wanted].map((n) => [n, distributionLine(distributionOf(n, { commits: [...commits.get(n).values()], records }))]),
  )
}

/** The numbered points whose cards stand in `html`. */
export function cardPoints(html) {
  return [...String(html ?? '').matchAll(/<span class="num">\s*(\d+)\s*<\/span>/g)].map((m) => Number(m[1]))
}
