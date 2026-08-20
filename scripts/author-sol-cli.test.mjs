import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AUTHORING_COMMISSION_KIND, AUTHORING_FRAMINGS, FABLE_ESCALATION_ROUNDS } from './author-routing-core.mjs'
import { ledgerSnapshot, recordAuthoringCommission, restoreLedger } from './author-sol.mjs'

const root = resolve(process.cwd())
const script = resolve(root, 'scripts', 'author-sol.mjs')
const point = '999991'
const dirs = []

function ledger(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-author-rounds-'))
  dirs.push(dir)
  const path = join(dir, 'reviews.jsonl')
  writeFileSync(path, rows.map((row) => JSON.stringify({ sha: 'a'.repeat(40), ...row })).join('\n'))
  return path
}

function route(records, extra = []) {
  return spawnSync(process.execPath, [script, '--routing', '--point', point, ...extra], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, AUTHOR_REVIEW_RECORDS_FILE: records },
  })
}

function examine(records) {
  const cwd = mkdtempSync(join(tmpdir(), 'hoa-author-examination-'))
  dirs.push(cwd)
  return spawnSync(process.execPath, [script, '--point', '727'], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, AUTHOR_REVIEW_RECORDS_FILE: records },
  })
}

/** One git call in a temp checkout; loud, because a silent setup failure would
 *  make the assertions below pass for the wrong reason. */
const git = (cwd, ...args) => {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`)
  return (res.stdout ?? '').trim()
}

/** A real, committed checkout — the index is what these cases are about. */
const gitRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-ledger-index-'))
  dirs.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.invalid')
  git(dir, 'config', 'user.name', 'Test')
  writeFileSync(join(dir, 'seed.txt'), 'seed\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'seed')
  return dir
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('author-sol records a commission before dispatch', () => {
  it('appends and durably commits the exact point, round and framing once', () => {
    const events = []
    const input = {
      records: [],
      point,
      round: 3,
      framing: AUTHORING_FRAMINGS[0],
      sha: 'b'.repeat(40),
      now: 1_787_130_000_000,
      append: (record) => events.push(['append', record]),
      commit: (record) => events.push(['commit', record]),
    }
    const first = recordAuthoringCommission(input)
    expect(first.written).toBe(true)
    expect(first.record).toMatchObject({
      kind: AUTHORING_COMMISSION_KIND,
      point: Number(point),
      round: 3,
      authorFraming: AUTHORING_FRAMINGS[0],
      sha: 'b'.repeat(40),
    })
    expect(events.map(([event]) => event)).toEqual(['append', 'commit'])

    const retry = recordAuthoringCommission({ ...input, records: [first.record] })
    expect(retry).toEqual({ written: false, record: first.record })
    expect(events.map(([event]) => event)).toEqual(['append', 'commit'])
  })

  it('leaves the ledger byte-identical when the commit that seals the append fails', () => {
    // THE HALF-STATE THE RECORD EXISTS TO PREVENT (point 780). A commission that
    // aborts before the authoring starts must not leave a line claiming it ran:
    // two governing rules count rounds out of this append-only file.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-commission-rollback-'))
    dirs.push(dir)
    const ledger = join(dir, 'mechanism-reviews.jsonl')
    const priorLine = `${JSON.stringify({ sha: 'a'.repeat(40), kind: 'note' })}\n`
    writeFileSync(ledger, priorLine)
    const before = readFileSync(ledger)

    const input = {
      records: [],
      point,
      round: 0,
      framing: AUTHORING_FRAMINGS[0],
      sha: 'b'.repeat(40),
      now: 1_787_130_000_000,
      append: (record) => appendFileSync(ledger, `${JSON.stringify(record)}\n`),
      commit: () => {
        throw new Error('git add -- … is outside repository')
      },
      rollback: () => writeFileSync(ledger, before),
    }
    expect(() => recordAuthoringCommission(input)).toThrow(/outside repository/)
    expect(readFileSync(ledger)).toEqual(before)
    expect(readFileSync(ledger, 'utf8')).toBe(priorLine)

    // …and the SAME commission succeeds once the commit can run, so the rollback
    // undoes the append rather than poisoning the round.
    const sealed = recordAuthoringCommission({ ...input, commit: () => {}, rollback: () => {} })
    expect(sealed.written).toBe(true)
    expect(readFileSync(ledger, 'utf8').trim().split('\n')).toHaveLength(2)
  })

  it('undoes a PART-WAY append too, not only a failing commit', () => {
    // Finding 3 of the cross-vendor review: the append sat outside the try, so a
    // write that died half-way left a fragment in the append-only ledger and
    // never reached the undo at all.
    const undone = []
    expect(() =>
      recordAuthoringCommission({
        records: [],
        point,
        round: 0,
        framing: AUTHORING_FRAMINGS[0],
        sha: 'b'.repeat(40),
        now: 1_787_130_000_000,
        append: () => {
          throw new Error('ENOSPC half a line')
        },
        commit: () => undone.push('commit'),
        rollback: () => undone.push('rollback'),
      }),
    ).toThrow(/ENOSPC/)
    expect(undone).toEqual(['rollback'])
  })

  it('reports the failed undo BESIDE the failure that caused it', () => {
    expect(() =>
      recordAuthoringCommission({
        records: [],
        point,
        round: 0,
        framing: AUTHORING_FRAMINGS[0],
        sha: 'b'.repeat(40),
        now: 1_787_130_000_000,
        append: () => {},
        commit: () => {
          throw new Error('is outside repository')
        },
        rollback: () => {
          throw new Error('read-only file system')
        },
      }),
    ).toThrow(/is outside repository[\s\S]*could not be restored[\s\S]*read-only file system/)
  })

  it('restores the working tree AND the index with the production undo', () => {
    // FINDING 4 OF THE CROSS-VENDOR REVIEW: the case above injects its own undo,
    // so it can never see the half that actually bit — `git add` had already
    // STAGED the appended line, and a working-tree-only restore left it there
    // for the next commit in that worktree to carry. This drives the REAL pair
    // against a REAL index.
    const repo = gitRepo()
    const ledger = join(repo, '.claude', 'mechanism-reviews.jsonl')
    mkdirSync(dirname(ledger), { recursive: true })
    const priorLine = `${JSON.stringify({ sha: 'a'.repeat(40), kind: 'note' })}\n`
    writeFileSync(ledger, priorLine)
    git(repo, 'add', '--', ledger)
    git(repo, 'commit', '-q', '-m', 'ledger')

    const before = ledgerSnapshot(ledger, { cwd: repo })
    expect(before.staged).toMatch(/mechanism-reviews\.jsonl$/)

    appendFileSync(ledger, `${JSON.stringify({ sha: 'b'.repeat(40), kind: 'authoring-commission' })}\n`)
    git(repo, 'add', '--', ledger)
    expect(git(repo, 'diff', '--cached', '--name-only')).toContain('mechanism-reviews.jsonl')

    restoreLedger(before)
    expect(readFileSync(ledger, 'utf8')).toBe(priorLine)
    expect(git(repo, 'diff', '--cached', '--name-only')).toBe('')
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  it('leaves neither file nor index behind when the ledger did not exist before', () => {
    const repo = gitRepo()
    const ledger = join(repo, '.claude', 'mechanism-reviews.jsonl')
    mkdirSync(dirname(ledger), { recursive: true })

    const before = ledgerSnapshot(ledger, { cwd: repo })
    expect(before.bytes).toBe(null)
    expect(before.staged).toBe('')

    writeFileSync(ledger, `${JSON.stringify({ sha: 'c'.repeat(40) })}\n`)
    git(repo, 'add', '--', ledger)
    expect(git(repo, 'diff', '--cached', '--name-only')).toContain('mechanism-reviews.jsonl')

    restoreLedger(before)
    expect(existsSync(ledger)).toBe(false)
    expect(git(repo, 'diff', '--cached', '--name-only')).toBe('')
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  it('unstages by the name git really holds, in a checkout whose path ends in a space', () => {
    // Round 2 of the cross-vendor review: the undo asked for the toplevel
    // through a helper that TRIMS, so in such a checkout it computed a
    // different name and left the staged ledger behind.
    const outer = mkdtempSync(join(tmpdir(), 'hoa-ledger-space-'))
    dirs.push(outer)
    const repo = join(outer, 'checkout ')
    mkdirSync(repo, { recursive: true })
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@example.invalid')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'seed.txt'), 'seed\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'seed')

    const ledger = join(repo, '.claude', 'mechanism-reviews.jsonl')
    mkdirSync(dirname(ledger), { recursive: true })
    const before = ledgerSnapshot(ledger, { cwd: repo })
    expect(before.bytes).toBe(null)

    writeFileSync(ledger, `${JSON.stringify({ sha: 'e'.repeat(40) })}\n`)
    git(repo, 'add', '--', ledger)
    expect(git(repo, 'diff', '--cached', '--name-only')).toContain('mechanism-reviews.jsonl')

    restoreLedger(before)
    expect(existsSync(ledger)).toBe(false)
    expect(git(repo, 'diff', '--cached', '--name-only')).toBe('')
  })

  it('refuses the transaction when the ledger cannot be read at all', () => {
    // …rather than calling it absent and letting the undo delete it. A
    // directory in the ledger's place is an unreadable file that is NOT missing.
    const repo = gitRepo()
    const ledger = join(repo, '.claude', 'mechanism-reviews.jsonl')
    mkdirSync(ledger, { recursive: true })
    expect(() => ledgerSnapshot(ledger, { cwd: repo })).toThrow(/cannot read the ledger/)
  })

  it('refuses to rewrite the framing already recorded for a round', () => {
    const prior = {
      kind: AUTHORING_COMMISSION_KIND,
      point: Number(point),
      round: 3,
      authorFraming: AUTHORING_FRAMINGS[0],
    }
    expect(() =>
      recordAuthoringCommission({
        records: [prior],
        point,
        round: 3,
        framing: AUTHORING_FRAMINGS[1],
        sha: 'b'.repeat(40),
      }),
    ).toThrow(/different framing/)
  })
})

describe('author-sol routing reads unsuccessful rounds from the review ledger', () => {
  it('reports zero and uses the ordinary lane when the point has no review record', () => {
    const result = route(ledger([]))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('review record: 0 unsuccessful round(s)')
  })

  it('derives N non-passing reviews and holds the lane while the escalation is suspended', () => {
    const rows = Array.from({ length: FABLE_ESCALATION_ROUNDS }, (_, round) => ({
      point: Number(point),
      mode: 'review',
      verdict: 'do-not-merge',
      ...(round > 1 ? { authorFraming: AUTHORING_FRAMINGS[round % AUTHORING_FRAMINGS.length] } : {}),
    }))
    rows.splice(FABLE_ESCALATION_ROUNDS - 1, 0, {
      point: Number(point),
      mode: 'review',
      verdict: 'merge',
      specExamination: 'sound',
      evidence: 'the specification is coherent and the difficulty is real',
    })
    rows.unshift({ point: Number(point), mode: 'review', verdict: 'merge' })
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('but the Fable escalation is SUSPENDED')
    expect(result.stdout).toContain(
      `review record: ${FABLE_ESCALATION_ROUNDS} unsuccessful round(s); ${FABLE_ESCALATION_ROUNDS} fresh attempt(s)`,
    )
    expect(result.stdout).toContain(`round 2: framing — ${AUTHORING_FRAMINGS[0]}`)
    expect(result.stdout).toContain('spec examination: sound')
  })

  it('reports an unframed later review as a repeat and does not advance the lane', () => {
    const rows = []
    for (let round = 0; round < FABLE_ESCALATION_ROUNDS; round += 1) {
      if (round > 1) {
        rows.push({ point: Number(point), kind: AUTHORING_COMMISSION_KIND, round, authorFraming: '' })
      }
      rows.push({ point: Number(point), mode: 'review', verdict: 'do-not-merge' })
    }
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain(`${FABLE_ESCALATION_ROUNDS} unsuccessful round(s); 2 fresh attempt(s)`)
    expect(result.stdout).toContain('REPEAT — no author framing was recorded')
  })

  it('keeps all reviews from before commission receipts in the round count', () => {
    const rows = Array.from({ length: 11 }, () => ({
      point: Number(point),
      mode: 'review',
      verdict: 'do-not-merge',
    }))
    const result = route(ledger(rows))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('11 unsuccessful round(s); 11 fresh attempt(s)')
  })

  it('accepts an explicit numeric override for history outside the ledger', () => {
    const result = route(ledger([]), ['--rounds', String(FABLE_ESCALATION_ROUNDS)])
    expect(result.status, result.stderr).toBe(0)
    // The override still carries the count; only the lane change is suspended.
    expect(result.stdout).toContain(`point ${point} → sol`)
    expect(result.stdout).toContain('but the Fable escalation is SUSPENDED')
  })

  it('turns the override immediately before the threshold into the examination step', () => {
    const result = route(ledger([]), ['--rounds', String(FABLE_ESCALATION_ROUNDS - 1)])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('next step: spec-examination')
    expect(result.stdout).toContain(`threshold of ${FABLE_ESCALATION_ROUNDS}`)
  })

  it('rejects a numeric spelling that cannot be represented as an integer', () => {
    const result = route(ledger([]), ['--rounds', '9'.repeat(400)])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('--rounds needs a non-negative integer')
  })
})

describe('author-sol examination does not require an authoring worktree', () => {
  it('prints the read-only examination packet before branch and worktree readiness', () => {
    const records = ledger(
      Array.from({ length: FABLE_ESCALATION_ROUNDS - 1 }, () => ({
        point: 727,
        mode: 'review',
        verdict: 'do-not-merge',
      })),
    )
    const result = examine(records)
    expect(result.status, result.stderr).toBe(4)
    expect(result.stdout).toContain('SPEC EXAMINATION REQUIRED')
    expect(result.stdout).toContain('SPEC EXAMINATION FOR WORK-ORDER POINT 727')
    expect(result.stderr).not.toContain('refusing to start')
  })
})
