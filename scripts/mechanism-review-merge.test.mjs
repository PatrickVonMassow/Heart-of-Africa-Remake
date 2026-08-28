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

  it('deduplicates identical records and gives equal timestamps a side-independent order', () => {
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
  })
})
