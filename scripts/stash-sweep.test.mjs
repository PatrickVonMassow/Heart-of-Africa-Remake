// THE ONE-TIME STASH SWEEP (no user order is ever lost, 21.10.2026): read-only,
// keyed by sha, judged by content against origin/main.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isBinaryPath, isBinaryText, isMachinePath, isUserLine, judgeStash, corpusOf } from './stash-sweep-core.mjs'
import { listStashes, renderReport, sweepStashes } from './stash-sweep.mjs'
import { unionHeads } from './carrier-reconcile-core.mjs'
import { appendPoint, makeRepoFixture } from './carrier-reconcile-fixture.mjs'

const main = (points, extra = []) => {
  const tasks = points.map((n) => `- [ ] ${n}. Point ${n} title`).join('\n')
  return { heads: unionHeads({ tasks }).heads, corpus: corpusOf([tasks, ...extra]) }
}

describe('judgeStash — by content, not by file name', () => {
  it('frames and run records are machine state', () => {
    expect(isMachinePath('verification/x.png')).toBe(true)
    expect(isMachinePath('.claude/wait-leases.json')).toBe(true)
    expect(isMachinePath('.claude/queue-rank.json')).toBe(false)
    expect(judgeStash({ files: [{ path: 'verification/a.png', added: [] }], main: main([1]) }).disposition).toBe('machine-only')
  })

  it('a point line in an excluded directory is still user content, not machine state', () => {
    const r = judgeStash({ files: [{ path: 'local/orders.md', added: ['- [ ] 1402. Lost order'] }], main: main([1]) })
    expect(r.disposition).toBe('user-missing')
    expect(judgeStash({ files: [{ path: 'local/run.log', added: ['ok 12 frames'] }], main: main([1]) }).disposition).toBe('machine-only')
    expect(isBinaryText('webm\0»bytes«')).toBe(true)
    expect(isBinaryPath('verification/x-video/page@1.webm')).toBe(true)
  })

  it('a point head origin/main lacks is user content missing; one main holds is redundant', () => {
    const r = judgeStash({ files: [{ path: 'TASKS.md', added: ['- [ ] 1402. Point 1402 title'] }], main: main([1400]) })
    expect(r.disposition).toBe('user-missing')
    expect(r.missingPoints[0].point).toBe(1402)
    expect(judgeStash({ files: [{ path: 'TASKS.md', added: ['- [ ] 1402. Point 1402 title'] }], main: main([1402]) }).disposition).toBe('redundant')
  })

  it('a renumbered point counts by its title, not by its number', () => {
    const r = judgeStash({ files: [{ path: 'TASKS.md', added: ['- [ ] 1402. Point 1499 title'] }], main: main([1499]) })
    expect(r.disposition).toBe('redundant')
    expect(r.renumbered).toEqual([{ point: 1402, now: 1499, path: 'TASKS.md' }])
  })

  it('finds a user quote in ANY text file, and accepts it once main holds the line', () => {
    const quote = 'Nutzer, 08.09.2026: »Reihe das direkt vor 690 ein.«'
    expect(isUserLine(quote)).toBe(true)
    expect(judgeStash({ files: [{ path: 'docs/notes.md', added: [quote] }], main: main([1]) }).disposition).toBe('user-missing')
    expect(judgeStash({ files: [{ path: 'docs/notes.md', added: [quote] }], main: main([1], [quote]) }).disposition).toBe('redundant')
  })
})

describe('sweepStashes — strictly read-only over real stashes', () => {
  let repo
  beforeEach(() => {
    repo = makeRepoFixture({ points: [1400] })
  })
  afterEach(() => rmSync(repo.base, { recursive: true, force: true }))

  it('keys every stash by sha, judges a feature-branch stash against its own base, and changes nothing', () => {
    // A quarantine of a lost append, on main.
    appendPoint(repo.root, 1402, 'Lost user order')
    repo.git('stash', 'push', '-m', 'doctor-quarantine-2026-10-21T11-15-21-622Z')
    // A frame-only stash.
    writeFileSync(join(repo.root, 'verification.png'), 'x')
    repo.git('stash', 'push', '-u', '-m', 'frames')
    // A feature-branch stash whose base already carries 1403: the point counts as pushed only if main has it.
    repo.git('checkout', '-q', '-b', 'feat/z')
    appendPoint(repo.root, 1403, 'Branch point')
    repo.git('commit', '-qam', 'branch adds 1403')
    writeFileSync(join(repo.root, 'notes.md'), 'Source: user 21.10.2026 "keep this"\n')
    repo.git('stash', 'push', '-u', '-m', 'branch notes')
    repo.git('checkout', '-q', 'main')

    // An untracked file with a name git would quote, holding an order.
    writeFileSync(join(repo.root, 'übernahme.md'), '- [ ] 1404. Order in a quoted name\n')
    repo.git('stash', 'push', '-u', '-m', 'quoted name')

    const before = { list: repo.git('stash', 'list'), status: repo.git('status', '--porcelain'), tasks: readFileSync(join(repo.root, 'TASKS.md'), 'utf8') }
    const result = sweepStashes({ root: repo.root })
    expect(repo.git('stash', 'list')).toBe(before.list)
    expect(repo.git('status', '--porcelain')).toBe(before.status)
    expect(readFileSync(join(repo.root, 'TASKS.md'), 'utf8')).toBe(before.tasks)

    const shas = listStashes((args) => repo.git(...args)).map((s) => s.sha)
    expect(result.stashes.map((s) => s.sha)).toEqual(shas)
    const by = Object.fromEntries(result.stashes.map((s) => [s.subject.replace(/^On [^:]+: /, ''), s]))
    expect(by['doctor-quarantine-2026-10-21T11-15-21-622Z']).toMatchObject({ disposition: 'user-missing', quarantine: true })
    expect(by['doctor-quarantine-2026-10-21T11-15-21-622Z'].missingPoints[0].point).toBe(1402)
    expect(by.frames.disposition).toBe('machine-only')
    expect(by['branch notes']).toMatchObject({ branch: 'feat/z', disposition: 'user-missing' })
    // The branch's own 1403 is its base, not the stash's addition.
    expect(by['branch notes'].missingPoints).toEqual([])
    expect(by['quoted name']).toMatchObject({ disposition: 'user-missing' })
    expect(by['quoted name'].missingPoints[0]).toMatchObject({ point: 1404, path: 'übernahme.md' })
    expect(renderReport(result, { date: '2026-10-22' })).toMatch(/\| user-missing \| 3 \|/)
  })
})
