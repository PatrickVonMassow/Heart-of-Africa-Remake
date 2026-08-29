import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MERGE_ARGS } from './land-point-core.mjs'
import { LedgerMergeError, mergeMechanismReviewLedger } from './mechanism-review-merge-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const LEDGER = join('.claude', 'mechanism-reviews.jsonl')
const sandboxes = []
const row = (id, at) => JSON.stringify({ id, at, atIso: new Date(at).toISOString() })
const occurrences = (rows) => {
  const counts = new Map()
  for (const line of rows) counts.set(line, (counts.get(line) ?? 0) + 1)
  return counts
}

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'ledger test',
  GIT_AUTHOR_EMAIL: 'ledger@test.invalid',
  GIT_COMMITTER_NAME: 'ledger test',
  GIT_COMMITTER_EMAIL: 'ledger@test.invalid',
}

const git = (repo, args, { fail = true } = {}) => {
  if (!fail) return spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, env: gitEnv })
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, env: gitEnv }).trim()
}

function write(repo, rows) {
  writeFileSync(join(repo, LEDGER), rows.length ? `${rows.join('\n')}\n` : '')
}

function commit(repo, message) {
  git(repo, ['add', '.'])
  git(repo, ['commit', '-q', '-m', message])
}

function fixture() {
  const sandbox = mkdtempSync(join(tmpdir(), 'mechanism-review-merge-'))
  sandboxes.push(sandbox)
  const repo = join(sandbox, 'repo')
  mkdirSync(join(repo, '.claude'), { recursive: true })
  mkdirSync(join(repo, 'scripts'), { recursive: true })
  git(repo, ['init', '-q', '-b', 'main'])
  git(repo, ['config', 'core.autocrlf', 'false'])
  cpSync(join(REPO_ROOT, '.gitattributes'), join(repo, '.gitattributes'))
  cpSync(join(REPO_ROOT, 'scripts', 'mechanism-review-merge.mjs'), join(repo, 'scripts', 'mechanism-review-merge.mjs'))
  cpSync(
    join(REPO_ROOT, 'scripts', 'mechanism-review-merge-core.mjs'),
    join(repo, 'scripts', 'mechanism-review-merge-core.mjs'),
  )
  return repo
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true })
})

describe('the append-only review-ledger merge', () => {
  it('unions two real branch appends without a hand edit, exactly once and in at order', () => {
    const repo = fixture()
    const base = row('base', 100)
    const fromMain = row('main', 300)
    const fromFeature = row('feature', 200)
    write(repo, [base])
    commit(repo, 'seed the ledger')

    git(repo, ['checkout', '-q', '-b', 'feature'])
    write(repo, [base, fromFeature])
    commit(repo, 'append the feature review')
    git(repo, ['checkout', '-q', 'main'])
    write(repo, [base, fromMain])
    commit(repo, 'append the main review')

    git(repo, [...MERGE_ARGS, 'feature'])
    const lines = readFileSync(join(repo, LEDGER), 'utf8').trimEnd().split('\n')
    const records = lines.map((line) => JSON.parse(line))
    expect(records.map(({ id }) => id)).toEqual(['base', 'feature', 'main'])
    expect(new Set(lines).size).toBe(3)
    expect(lines).toEqual(expect.arrayContaining([base, fromMain, fromFeature]))
    expect(git(repo, ['show', '-s', '--format=%P', 'HEAD']).split(' ')).toHaveLength(2)
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  })

  it('leaves a real Git conflict when a tip modifies an ancestor row', () => {
    const repo = fixture()
    const base = row('base', 100)
    write(repo, [base])
    commit(repo, 'seed the ledger')

    git(repo, ['checkout', '-q', '-b', 'feature'])
    write(repo, [row('edited', 100)])
    commit(repo, 'edit existing evidence')
    git(repo, ['checkout', '-q', 'main'])
    write(repo, [base, row('main', 200)])
    commit(repo, 'append the main review')
    const mainHead = git(repo, ['rev-parse', 'HEAD'])

    const merged = git(repo, [...MERGE_ARGS, 'feature'], { fail: false })
    expect(merged.status).not.toBe(0)
    expect(`${merged.stdout}${merged.stderr}`).toMatch(/mechanism-review merge: refusing.*modified or reordered/)
    expect(git(repo, ['status', '--porcelain'])).toContain(`UU ${LEDGER}`)
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(mainHead)
    git(repo, ['merge', '--abort'])
  })

  it('preserves an out-of-order ancestor across consecutive merges from older forks', () => {
    const repo = fixture()
    const newerAncestor = row('newer-ancestor', 300)
    const skewedAncestor = row('skewed-ancestor', 100)
    const ancestor = [newerAncestor, skewedAncestor]
    const firstAppend = row('first-append', 500)
    const secondAppend = row('second-append', 400)
    const fromMain = row('main-append', 600)
    write(repo, ancestor)
    commit(repo, 'seed the clock-skewed ledger')

    git(repo, ['checkout', '-q', '-b', 'first'])
    write(repo, [...ancestor, firstAppend])
    commit(repo, 'append the first branch review')
    git(repo, ['checkout', '-q', 'main'])
    git(repo, ['checkout', '-q', '-b', 'second'])
    write(repo, [...ancestor, secondAppend])
    commit(repo, 'append the second branch review')
    git(repo, ['checkout', '-q', 'main'])
    write(repo, [...ancestor, fromMain])
    commit(repo, 'append the main review')

    git(repo, [...MERGE_ARGS, 'first'])
    expect(readFileSync(join(repo, LEDGER), 'utf8').startsWith(`${ancestor.join('\n')}\n`)).toBe(true)

    git(repo, [...MERGE_ARGS, 'second'])
    const lines = readFileSync(join(repo, LEDGER), 'utf8').trimEnd().split('\n')
    expect(lines).toEqual([...ancestor, secondAppend, firstAppend, fromMain])
    expect(git(repo, ['show', '-s', '--format=%P', 'HEAD']).split(' ')).toHaveLength(2)
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  })

  it('keeps every duplicate from a real-ledger-shaped ancestor through a Git merge', () => {
    const repo = fixture()
    const realAncestor = readFileSync(join(REPO_ROOT, LEDGER), 'utf8').trimEnd().split('\n')
    // Current main legitimately has no exact duplicate row. The merge rule must
    // nevertheless preserve multiplicity if history contains one, so make that
    // condition part of this fixture instead of requiring production evidence
    // to remain accidentally duplicated forever.
    const ancestor = [realAncestor[0], ...realAncestor]
    const ancestorText = `${ancestor.join('\n')}\n`
    const ancestorCounts = occurrences(ancestor)
    const duplicates = [...ancestorCounts].filter(([, count]) => count > 1)
    const latestAt = Math.max(...ancestor.map((line) => JSON.parse(line).at))
    const fromFeature = row('real-ledger-feature', latestAt + 1)
    const fromMain = row('real-ledger-main', latestAt + 2)
    expect(duplicates.length).toBeGreaterThan(0)
    write(repo, ancestor)
    commit(repo, 'seed the real review ledger')

    git(repo, ['checkout', '-q', '-b', 'feature'])
    write(repo, [...ancestor, fromFeature])
    commit(repo, 'append the feature review')
    git(repo, ['checkout', '-q', 'main'])
    write(repo, [...ancestor, fromMain])
    commit(repo, 'append the main review')

    git(repo, [...MERGE_ARGS, 'feature'])
    const mergedText = readFileSync(join(repo, LEDGER), 'utf8')
    const merged = mergedText.trimEnd().split('\n')
    const mergedCounts = occurrences(merged)
    expect(mergedText.startsWith(ancestorText)).toBe(true)
    expect(merged).toHaveLength(ancestor.length + 2)
    for (const [line, count] of duplicates) expect(mergedCounts.get(line)).toBe(count)
    expect(merged.slice(ancestor.length)).toEqual([fromFeature, fromMain])
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  })

  it('refuses deletion, reordering and malformed appended JSON before producing output', () => {
    const a = row('a', 100)
    const b = row('b', 200)
    for (const current of [`${a}\n`, `${b}\n${a}\n`]) {
      expect(() => mergeMechanismReviewLedger({ ancestor: `${a}\n${b}\n`, current, other: `${a}\n${b}\n` })).toThrow(
        LedgerMergeError,
      )
    }
    expect(() =>
      mergeMechanismReviewLedger({ ancestor: `${a}\n`, current: `${a}\nnot-json\n`, other: `${a}\n` }),
    ).toThrow(/not JSON/)
  })

  it('uses maximum multiplicity and gives equal timestamps a side-independent order', () => {
    const base = row('base', 100)
    const left = row('z-left', 200)
    const right = row('a-right', 200)
    const merge = (current, other) =>
      mergeMechanismReviewLedger({ ancestor: `${base}\n`, current: `${base}\n${current}\n`, other: `${base}\n${other}\n` })
    expect(merge(left, right)).toBe(merge(right, left))
    const duplicated = mergeMechanismReviewLedger({
      ancestor: `${base}\n`,
      current: `${base}\n${left}\n`,
      other: `${base}\n${left}\n`,
    })
    expect(duplicated.trimEnd().split('\n')).toEqual([base, left])
    const repeated = mergeMechanismReviewLedger({
      ancestor: `${base}\n`,
      current: `${base}\n${left}\n${left}\n`,
      other: `${base}\n${left}\n`,
    })
    expect(repeated.trimEnd().split('\n')).toEqual([base, left, left])
  })
})
