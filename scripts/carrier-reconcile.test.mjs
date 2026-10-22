// EVERY "queued N" MUST BE IN THE WORK ORDER (no user order is ever lost, 21.10.2026).
//
// The pure reconciliation, its one-time backfill, and the three places it runs:
// the doctor (every run), the session start (whatever the marker says) and the
// land-point post-merge gate.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import {
  formatReconcile,
  lostPoints,
  reconcileCarrier,
  reconcileHookLine,
  titleAnchor,
  unionHeads,
} from './carrier-reconcile-core.mjs'
import { backfillCarriers, runReconcile } from './carrier-reconcile.mjs'
import { transitionAccepted } from './land-point-core.mjs'
import { postMergeLoss } from './land-point.mjs'
import { repoCarrierPaths } from './findings-paths.mjs'
import { appendPoint, makeRepoFixture, tasksWith } from './carrier-reconcile-fixture.mjs'

const SHA = 'abcdef1234567890abcdef1234567890abcdef12'
const MAIN = new Set([SHA, SHA.slice(0, 12)])
const T = (n) => `Point ${n} title`
const tick = (n, { sha = SHA.slice(0, 12), anchor = titleAnchor(T(n)) } = {}) =>
  `- [x] 2026-10-21T10:31:00.000Z · s · [request] · queued ${n}${sha ? ` @${sha}` : ''}${anchor ? ` ~${anchor}` : ''} · Auftrag ${n}\n      #spec\n      x\n`
const planes = ({ remote = [], archive = [], head = remote, headArchive = archive, working = head, workingArchive = headArchive } = {}) => ({
  remote: unionHeads({ tasks: tasksWith(remote), archive: tasksWith(archive).replace(/- \[ \]/g, '- [x]') }),
  head: unionHeads({ tasks: tasksWith(head), archive: tasksWith(headArchive) }),
  working: unionHeads({ tasks: tasksWith(working), archive: tasksWith(workingArchive) }),
})
const check = (text, p, aliases = {}) => reconcileCarrier({ carriers: [{ path: 'c', text }], ...p, mainShas: MAIN, aliases })

describe('reconcileCarrier — a queued point without its work-order point is RED', () => {
  it('queued 1402 with a parseable TASKS.md and archive lacking 1402 is not ok and never formats as green', () => {
    const r = check(tick(1402), planes({ remote: [1400, 1401], archive: [1399] }))
    expect(r.ok).toBe(false)
    expect(r.red).toMatchObject([{ point: 1402, reason: 'missing' }])
    expect(formatReconcile(r)[0]).toMatch(/RED/)
  })

  it('archive-only is green', () => {
    expect(check(tick(1406), planes({ remote: [1400], archive: [1406] })).ok).toBe(true)
  })

  it('working-tree-only is red', () => {
    expect(check(tick(1402), planes({ remote: [1400], working: [1400, 1402] })).red[0].reason).toBe('working-tree-only')
  })

  it('unpushed-commit-only is red', () => {
    expect(check(tick(1402), planes({ remote: [1400], head: [1400, 1402] })).red[0].reason).toBe('unpushed-commit-only')
  })

  it('a tick without its proof (legacy, missing anchor) is red', () => {
    expect(check(tick(1402, { sha: null, anchor: null }), planes({ remote: [1402] })).red[0].reason).toBe('no-proof')
  })

  it('a proof sha origin/main does not contain is red', () => {
    expect(check(tick(1402, { sha: '0123456789ab' }), planes({ remote: [1402] })).red[0].reason).toBe('proof-not-on-main')
  })

  it('expands a range to every member and fails on the single missing one', () => {
    const anchors = [1402, 1403, 1404, 1405, 1406].map((n) => `~${titleAnchor(T(n))}`).join(' ')
    const text = `- [x] 2026-10-21T10:31:00.000Z · s · [request] · queued 1402..1406 @abcdef123456 ${anchors} · Fünf Aufträge\n`
    const r = check(text, planes({ remote: [1402, 1403, 1405], archive: [1406] }))
    expect(r.checked).toBe(5)
    expect(r.red.map((x) => x.point)).toEqual([1404])
  })

  it('a range member without its own anchor, or an unrelated point at its number, is red', () => {
    const text = '- [x] 2026-10-21T10:31:00.000Z · s · [request] · queued 1402..1403 @abcdef123456 · Zwei Aufträge\n'
    expect(check(text, planes({ remote: [1402, 1403] })).red.map((x) => x.reason)).toEqual(['no-anchor', 'no-anchor'])
    const anchored = `- [x] 2026-10-21T10:31:00.000Z · s · [request] · queued 1402..1403 @abcdef123456 ~${titleAnchor(T(1402))} ~${titleAnchor(T(1403))} · Zwei\n`
    const p = planes({ remote: [1402, 1403] })
    p.remote.heads.set(1403, 'An unrelated point now at 1403')
    expect(check(anchored, p).red).toMatchObject([{ point: 1403, reason: 'anchor-mismatch' }])
  })

  it('a single tick WITH its sha but WITHOUT an anchor is red', () => {
    expect(check(tick(1402, { anchor: null }), planes({ remote: [1402] })).red[0].reason).toBe('no-anchor')
  })

  it('rejects an oversized range explicitly instead of cutting it short', () => {
    const text = '- [x] 2026-10-21T10:31:00.000Z · s · [request] · queued 1..5000 @abcdef123456 · Zu viel\n'
    expect(check(text, planes({ remote: [1] })).red).toMatchObject([{ reason: 'range-too-large' }])
  })

  it('the 5ba920079 restore (1402–1405 back in TASKS.md, 1406 closed in the archive) is green', () => {
    const text = [1402, 1403, 1404, 1405, 1406].map((n) => tick(n)).join('\n')
    expect(check(text, planes({ remote: [1402, 1403, 1404, 1405], archive: [1406] })).ok).toBe(true)
  })

  it('reports a point number standing twice as a duplicate, not as lost', () => {
    const r = check(tick(1402), planes({ remote: [1402, 1402] }))
    expect(r.ok).toBe(true)
    expect(r.duplicates).toEqual([1402])
  })

  it('an appending entry is open, not red', () => {
    const r = check('- [ ] 2026-10-21T10:31:00.000Z · s · [request] · appending 1402 · A\n', planes({ remote: [] }))
    expect(r.ok).toBe(true)
    expect(r.open).toHaveLength(1)
  })

  it('checks a finding drained into a point by its proof line', () => {
    const text = `- [x] 2026-10-21T10:00:00.000Z · s · Ein Befund\n      d\n      drained into point 1410 @${SHA.slice(0, 12)} ~${titleAnchor(T(1410))}\n`
    expect(check(text, planes({ remote: [1410] })).ok).toBe(true)
    expect(check(text, planes({ remote: [] })).red[0]).toMatchObject({ point: 1410, reason: 'missing' })
  })
})

describe('renumbering and deletion go through an explicit alias, never through the number alone', () => {
  it('an unrelated point now standing at the old number cannot satisfy the tick (anchor mismatch)', () => {
    const p = planes({ remote: [1402] })
    p.remote.heads.set(1402, 'Something entirely different')
    expect(check(tick(1402), p).red[0].reason).toBe('anchor-mismatch')
  })

  it('a renumbered point is followed to its new number; a deleted one is accepted only when named', () => {
    // Renumbering keeps the title: the claim's anchor is checked at the new number.
    const moved = planes({ remote: [1499] })
    moved.remote.heads.set(1499, T(1402))
    expect(check(tick(1402), moved, { 1402: { renumberedTo: 1499 } }).ok).toBe(true)
    // An unrelated point at the alias target does not satisfy it.
    expect(check(tick(1402), planes({ remote: [1499] }), { 1402: { renumberedTo: 1499 } }).red[0].reason).toBe('anchor-mismatch')
    // Unless the alias itself names the target's anchor.
    expect(check(tick(1402), planes({ remote: [1499] }), { 1402: { renumberedTo: 1499, anchor: titleAnchor(T(1499)) } }).ok).toBe(true)
    expect(check(tick(1107), planes({ remote: [] })).ok).toBe(false)
    const r = check(tick(1107), planes({ remote: [] }), { 1107: { status: 'deleted', why: 'user' } })
    expect(r.ok).toBe(true)
    expect(r.aliased).toHaveLength(1)
  })

  it('the committed alias file parses and names only deliberate removals', () => {
    const file = JSON.parse(readFileSync(repoPath('docs', 'carrier-aliases.json'), 'utf8'))
    for (const [n, v] of Object.entries(file.points)) {
      expect(Number.isInteger(Number(n))).toBe(true)
      expect(['deleted', 'absorbed'].includes(v.status) || Number.isInteger(v.renumberedTo)).toBe(true)
      expect(String(v.why ?? '')).not.toBe('')
    }
  })
})

describe('the session start prints a red reconciliation, and fails closed', () => {
  it('ran:false is RED, red is RED, green is silent', () => {
    expect(reconcileHookLine({ ran: false, error: 'timeout' })).toMatch(/COULD NOT RUN — treat it as RED/)
    expect(reconcileHookLine(undefined)).toMatch(/RED/)
    expect(reconcileHookLine({ ran: true, ok: false, lines: ['carrier reconciliation: RED — 1 of 1'] })).toMatch(/RED FINDING — USER ORDERS MAY BE LOST/)
    expect(reconcileHookLine({ ran: true, ok: true, lines: [] })).toBeNull()
  })

  it('the hook runs it for EVERY session, before and independent of the doctor marker', () => {
    const src = readFileSync(repoPath('scripts', 'batch-resume-hook.mjs'), 'utf8')
    const call = src.indexOf('reconcileHookLine(runReconcile(')
    expect(call).toBeGreaterThan(0)
    // Ahead of the mandate-marker path, and not inside an ownership branch.
    expect(call).toBeLessThan(src.indexOf('resumeRepairMandate(readRepoVerdict())'))
    expect(src.slice(Math.max(0, call - 600), call)).not.toMatch(/ownsBatch\(/)
  })
})

describe('against a real checkout: worktree invocation, backfill, doctor and land-point', () => {
  let repo
  let mem
  beforeEach(() => {
    repo = makeRepoFixture({ points: [1400, 1401], archived: [1399] })
    mem = mkdtempSync(join(tmpdir(), 'hoa-reconcile-mem-'))
  })
  afterEach(() => {
    rmSync(repo.base, { recursive: true, force: true })
    rmSync(mem, { recursive: true, force: true })
  })
  const cli = (args, root) =>
    spawnSync(process.execPath, ['scripts/carrier-reconcile.mjs', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, HOA_REPO_ROOT: root, FINDINGS_MEMORY_DIR: mem },
    })

  it('run from a worktree whose TASKS.md holds the point, it still reads main and stays red', () => {
    const sha = repo.git('rev-parse', 'HEAD').slice(0, 12)
    writeFileSync(join(mem, 'findings-carrier.md'), tick(1402, { sha, anchor: titleAnchor(T(1402)) }))
    const wt = join(repo.base, 'wt')
    repo.git('worktree', 'add', '-q', '-b', 'feat/y', wt)
    appendPoint(wt, 1402)
    execFileSync('git', ['-C', wt, 'commit', '-qam', 'on branch'], { stdio: 'ignore', windowsHide: true })
    const r = cli([], wt)
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/RED point 1402/)
  })

  it('the backfill stamps a proven legacy tick and leaves an unproven one red', () => {
    const carrier = join(mem, 'findings-carrier.md')
    writeFileSync(carrier, `${tick(1400, { sha: null, anchor: null })}\n${tick(1402, { sha: null, anchor: null })}`)
    const { stamped, unproven } = backfillCarriers({ root: repo.root, carrierPaths: [carrier] })
    expect(stamped).toBe(1)
    expect(unproven).toMatchObject([{ points: [1402] }])
    const sha = repo.git('rev-parse', 'origin/main').slice(0, 12)
    expect(readFileSync(carrier, 'utf8')).toContain(`queued 1400 @${sha} ~${titleAnchor(T(1400))} · Auftrag 1400`)
    const after = runReconcile({ root: repo.root, carrierPaths: [carrier] })
    expect(after.ran).toBe(true)
    expect(after.result.red.map((x) => x.point)).toEqual([1402])
  })

  it('reads aliases from origin/main: an uncommitted deletion alias never turns a missing order green', () => {
    const carrier = join(mem, 'findings-carrier.md')
    writeFileSync(carrier, tick(1107))
    writeFileSync(join(repo.root, 'docs', 'carrier-aliases.json'), JSON.stringify({ points: { 1107: { status: 'deleted', why: 'x' } } }))
    expect(runReconcile({ root: repo.root, carrierPaths: [carrier] }).ok).toBe(false)
    repo.git('add', 'docs/carrier-aliases.json')
    repo.git('commit', '-qm', 'alias')
    expect(runReconcile({ root: repo.root, carrierPaths: [carrier] }).ok).toBe(false)
    repo.git('push', '-q', 'origin', 'main')
    expect(runReconcile({ root: repo.root, carrierPaths: [carrier] }).ok).toBe(true)
  })

  it('an unreadable carrier is red (fail closed), only a missing one counts as empty', () => {
    // A directory where the carrier file should be: EISDIR, not ENOENT.
    const r = runReconcile({ root: repo.root, carrierPaths: [mem] })
    expect(r).toMatchObject({ ran: false, ok: false })
    expect(r.error).toMatch(/could not be read/)
    expect(runReconcile({ root: repo.root, carrierPaths: [join(mem, 'absent.md')] })).toMatchObject({ ran: true, ok: true })
  })

  it('a carrier directory that cannot be listed propagates instead of shrinking the set', () => {
    const home = mkdtempSync(join(tmpdir(), 'hoa-home-'))
    writeFileSync(join(home, '.claude'), 'not a directory')
    expect(() => repoCarrierPaths({ root: '/workspace/hoa', home, env: {} })).toThrow(/could not be listed/)
    rmSync(home, { recursive: true, force: true })
    const empty = mkdtempSync(join(tmpdir(), 'hoa-home-'))
    expect(repoCarrierPaths({ root: '/workspace/hoa', home: empty, env: {} })).toHaveLength(1)
    rmSync(empty, { recursive: true, force: true })
  })

  it('a reconciliation that cannot read origin/main does not run — and that is red', () => {
    repo.git('update-ref', '-d', 'refs/remotes/origin/main')
    const r = runReconcile({ root: repo.root, carrierPaths: [] })
    expect(r).toMatchObject({ ran: false, ok: false })
  })

  it('the doctor reports a queued-but-missing point as RED on a CLEAN tree, read-only run included', () => {
    writeFileSync(join(mem, 'findings-carrier.md'), tick(1402))
    const run = spawnSync(process.execPath, [repoPath('scripts', 'batch-doctor.mjs')], {
      cwd: repo.root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
      env: { ...process.env, HOA_REPO_ROOT: repo.root, FINDINGS_MEMORY_DIR: mem, CLAUDE_SESSION_ID: '' },
    })
    const out = `${run.stdout}${run.stderr}`
    expect(out).toMatch(/carrier reconciliation: RED/)
    expect(out).toMatch(/VERDICT: RED/)
    expect(out).not.toMatch(/VERDICT: consistent/)
    expect(run.status).toBe(1)
  }, 120000)

  it('land-point: a merge whose branch TASKS.md dropped a point is stopped before commit and push; main keeps it', () => {
    const wt = join(repo.base, 'stale')
    repo.git('worktree', 'add', '-q', '-b', 'feat/stale', wt)
    // The branch carries a stale work order without 1401; main meanwhile gains 1402.
    writeFileSync(join(wt, 'TASKS.md'), tasksWith([1400]))
    execFileSync('git', ['-C', wt, 'commit', '-qam', 'stale copy'], { stdio: 'ignore', windowsHide: true })
    appendPoint(repo.root, 1402)
    repo.git('commit', '-qam', 'main gains 1402')
    repo.git('push', '-q', 'origin', 'main')
    const preMerge = {
      tasks: readFileSync(join(repo.root, 'TASKS.md'), 'utf8'),
      archive: readFileSync(join(repo.root, 'docs', 'tasks-archive.md'), 'utf8'),
    }
    // The conflict is "resolved" in the branch's favour — the way points get dropped.
    repo.git('merge', '--no-ff', '--no-edit', '-X', 'theirs', 'feat/stale')
    const lost = postMergeLoss({
      preMerge,
      tasksText: readFileSync(join(repo.root, 'TASKS.md'), 'utf8'),
      archiveText: readFileSync(join(repo.root, 'docs', 'tasks-archive.md'), 'utf8'),
    })
    expect(lost).toContain(1401)
    expect(repo.git('show', 'origin/main:TASKS.md')).toContain('- [ ] 1401.')
    expect(repo.git('show', 'origin/main:TASKS.md')).toContain('- [ ] 1402.')
  })

  it('the land-point wiring runs the post-merge check before the gate and the push', () => {
    const src = readFileSync(repoPath('scripts', 'land-point.mjs'), 'utf8')
    const check = src.indexOf('const droppedByMerge = postMergeLoss(')
    expect(check).toBeGreaterThan(src.indexOf('// 1. MERGE.'))
    expect(check).toBeLessThan(src.indexOf('// 2. FAST GATE.'))
    expect(check).toBeLessThan(src.indexOf("git(['push', 'origin', 'main']"))
  })
})

describe('transitionAccepted refuses a landing that removes any other point', () => {
  it('a tick that loses a point besides moving N is refused', () => {
    const before = { tasks: tasksWith([1400, 1401, 1402]), archive: '' }
    const lost = lostPoints({ beforeTasks: before.tasks, afterTasks: tasksWith([1400]), afterArchive: tasksWith([1401]) })
    expect(lost).toEqual([1402])
    const verdict = transitionAccepted({ before: { findings: [] }, after: { findings: [] }, lost })
    expect(verdict.ok).toBe(false)
    expect(verdict.findings[0].rule).toBe('point-lost')
    expect(transitionAccepted({ before: { findings: [] }, after: { findings: [] }, lost: [] }).ok).toBe(true)
  })
})
