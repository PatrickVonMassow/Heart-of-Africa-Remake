// Pure housekeeping rules (point 1509): every verdict fails closed.
import { describe, expect, it } from 'vitest'
import {
  BRANCH_MAX_AGE_MS,
  DAY_MS,
  archivedPointNaming,
  branchKind,
  branchVerdict,
  outputKind,
  busyVerdict,
  createBudget,
  failuresToFile,
  gitPlan,
  heldOpen,
  isContained,
  isDenied,
  isViteCacheShape,
  localVerdict,
  lockVerdict,
  parseWorkOrder,
  parseWorktreeList,
  spawnDecision,
  tmpVerdict,
  toolLogVerdict,
  touchesWorktree,
} from './housekeeping-core.mjs'

const TASKS = [
  '# Work order',
  '## Checklist',
  '- [ ] 900. Open point',
  '  mentions local/659-keep-frames here',
  '## Other',
  'prose 659-not-a-ref',
].join('\n')
const ARCHIVE = ['# Archive', '- [x] 659. Closed', '- [x] 700. Closed', '- [x] 900. Ticked but open in TASKS'].join('\n')

describe('parseWorkOrder', () => {
  it('closed = ticked in the archive and not open; open text spans the block only', () => {
    const w = parseWorkOrder(TASKS, ARCHIVE)
    expect(w.ok).toBe(true)
    expect([...w.closed].sort()).toEqual([659, 700])
    expect(w.open.has(900)).toBe(true)
    expect(w.openText).toContain('659-keep-frames')
    expect(w.openText).not.toContain('659-not-a-ref')
  })
  it('fails closed on an unreadable or pointless file', () => {
    expect(parseWorkOrder(null, ARCHIVE).ok).toBe(false)
    expect(parseWorkOrder(TASKS, null).ok).toBe(false)
    expect(parseWorkOrder('', ARCHIVE).ok).toBe(false)
    expect(parseWorkOrder(TASKS, '# empty archive').ok).toBe(false)
  })
})

describe('local/ allowlist and denylist', () => {
  const w = parseWorkOrder(TASKS, ARCHIVE)
  const refs = [w.openText, 'docs mention 700-cited.log']
  const dir = (name) => ({ name, isDir: true, isFile: false, isSymlink: false })
  const file = (name) => ({ name, isDir: false, isFile: true, isSymlink: false })

  it('deletes only a closed, unreferenced, inventoried output', () => {
    expect(localVerdict(dir('659-evidence'), { workOrder: w, refTexts: refs })).toMatchObject({ act: true, kind: 'evidence' })
    expect(localVerdict(file('700-r2-review.log'), { workOrder: w, refTexts: refs })).toMatchObject({ act: true, kind: 'log' })
  })
  it('keeps open, unclosed, referenced, unknown-kind, unnumbered and symlinked entries', () => {
    const v = (e) => localVerdict(e, { workOrder: w, refTexts: refs }).act
    expect(v(dir('900-frames'))).toBe(false)
    expect(v(dir('901-frames'))).toBe(false)
    expect(v(dir('659-keep-frames'))).toBe(false)
    expect(v(file('700-cited.log'))).toBe(false)
    expect(v(file('700-decision-r4.md'))).toBe(false)
    expect(v(dir('700-notes'))).toBe(false)
    expect(v(dir('red-run-evidence'))).toBe(false)
    expect(v({ ...dir('659-frames'), isSymlink: true })).toBe(false)
  })
  it('never touches user material, secrets, tools or baselines even when numbered', () => {
    for (const n of [
      'bugreports',
      'x.zip',
      'Screenshots',
      'assets-src',
      'hoa-state-1.zip',
      'villager-build-1342',
      'codex-auth.json',
      'git-credential-x.sh',
      '659-token.log',
      'tools',
      'dashboard',
      'branch-archive',
      'verify-baseline',
      'verify-baseline-logs',
      'MEMORY.md',
      '700-draft-frames',
    ]) {
      expect(isDenied(n)).toBe(true)
    }
    expect(localVerdict(file('659-token.log'), { workOrder: w, refTexts: refs }).act).toBe(false)
  })
  it('an unreadable work order or reference set keeps everything', () => {
    expect(localVerdict(dir('659-evidence'), { workOrder: { ok: false }, refTexts: refs }).act).toBe(false)
    expect(localVerdict(dir('659-evidence'), { workOrder: w, refTexts: null }).act).toBe(false)
  })
  it('output kinds', () => {
    expect(outputKind('1482-baseline-frames', { isDir: true })).toBe('frames')
    expect(outputKind('1002-r2-review.log', { isFile: true })).toBe('log')
    expect(outputKind('1045-astra-r2.md', { isFile: true })).toBe('review')
    expect(outputKind('1045-plan.md', { isFile: true })).toBe(null)
  })
})

describe('tool-output-logs', () => {
  const now = 100 * DAY_MS
  const e = { name: 'a.log', isFile: true, isSymlink: false }
  it('older than 14 days and unreferenced goes; young, referenced or unknown stays', () => {
    expect(toolLogVerdict(e, { now, mtimeMs: now - 15 * DAY_MS, refTexts: [] }).act).toBe(true)
    expect(toolLogVerdict(e, { now, mtimeMs: now - 13 * DAY_MS, refTexts: [] }).act).toBe(false)
    expect(toolLogVerdict(e, { now, mtimeMs: now - 15 * DAY_MS, refTexts: ['see a.log'] }).act).toBe(false)
    expect(toolLogVerdict(e, { now, mtimeMs: NaN, refTexts: [] }).act).toBe(false)
    expect(toolLogVerdict(e, { now, mtimeMs: now - 15 * DAY_MS, refTexts: null }).act).toBe(false)
  })
})

describe('/tmp rules', () => {
  const now = 100 * DAY_MS
  const shape = { name: 'a1B2c3D4', children: [{ name: 'ssr', isDir: true, children: [{ name: 'abc123.js', isFile: true }] }] }
  const live = { ok: true, openPaths: [] }
  it('the cache shape is ssr/web of hash-named files only', () => {
    expect(isViteCacheShape(shape)).toBe(true)
    expect(
      isViteCacheShape({ ...shape, children: [...shape.children, { name: 'node_modules', isDir: true, children: [] }] }),
    ).toBe(false)
    expect(isViteCacheShape({ ...shape, children: [{ name: 'web', isDir: true, isSymlink: true, children: [] }] })).toBe(false)
    expect(isViteCacheShape({ ...shape, name: 'x' })).toBe(false)
  })
  it('old, shaped, not held open goes; young, held, or unknown liveness stays', () => {
    const facts = { name: shape.name, shape, complete: true, newestMtimeMs: now - 8 * DAY_MS, canonical: '/tmp/a1B2c3D4' }
    expect(tmpVerdict(facts, { now, liveness: live })).toMatchObject({ act: true, rule: 'tmp-vite-cache' })
    expect(tmpVerdict({ ...facts, newestMtimeMs: now - 6 * DAY_MS }, { now, liveness: live }).act).toBe(false)
    expect(tmpVerdict(facts, { now, liveness: { ok: true, openPaths: ['/tmp/a1B2c3D4/ssr/abc123.js'] } }).act).toBe(false)
    expect(tmpVerdict(facts, { now, liveness: { ok: false, openPaths: [] } }).act).toBe(false)
    expect(tmpVerdict({ ...facts, complete: false }, { now, liveness: live }).act).toBe(false)
    expect(tmpVerdict({ ...facts, isSymlink: true }, { now, liveness: live }).act).toBe(false)
    expect(
      tmpVerdict(
        { name: 'hoa-x.log', isFile: true, complete: true, newestMtimeMs: now - 8 * DAY_MS, canonical: '/tmp/hoa-x.log' },
        { now, liveness: live },
      ).rule,
    ).toBe('tmp-hoa-log')
    // A hoa-*/point-* directory is never a log (it may be a worktree).
    expect(
      tmpVerdict(
        { name: 'hoa-wt', isFile: false, complete: true, newestMtimeMs: now - 8 * DAY_MS, canonical: '/tmp/hoa-wt' },
        { now, liveness: live },
      ),
    ).toMatchObject({ act: false, reason: 'not a file' })
  })
  it('heldOpen matches the path and its descendants only', () => {
    expect(heldOpen('/tmp/ab', ['/tmp/ab'])).toBe(true)
    expect(heldOpen('/tmp/ab', ['/tmp/ab/c'])).toBe(true)
    expect(heldOpen('/tmp/ab', ['/tmp/abc'])).toBe(false)
  })
})

describe('containment and worktrees', () => {
  it('strict containment', () => {
    expect(isContained('/r/local/x', '/r/local')).toBe(true)
    expect(isContained('/r/local', '/r/local')).toBe(false)
    expect(isContained('/r/localx/y', '/r/local')).toBe(false)
  })
  it('a worktree root, its ancestor and its descendant all count', () => {
    const wts = ['/r/local/bisect-1347']
    expect(touchesWorktree('/r/local/bisect-1347', wts)).toBe(true)
    expect(touchesWorktree('/r/local', wts)).toBe(true)
    expect(touchesWorktree('/r/local/bisect-1347/x', wts)).toBe(true)
    expect(touchesWorktree('/r/local/659-frames', wts)).toBe(false)
  })
  it('parses porcelain and fails closed on garbage', () => {
    expect(parseWorktreeList('worktree /r\nHEAD abc\n\nworktree /r/local/b\nHEAD def\n')).toEqual(['/r', '/r/local/b'])
    expect(parseWorktreeList('')).toBe(null)
    expect(parseWorktreeList(null)).toBe(null)
  })
})

describe('git plan', () => {
  it('auto runs gc --auto in the foreground; busy or unknown skips', () => {
    expect(gitPlan({ mode: 'auto', busy: false }).args).toEqual(['-c', 'gc.autoDetach=false', 'gc', '--auto'])
    expect(gitPlan({ mode: 'auto', busy: true }).run).toBe(false)
    expect(gitPlan({ mode: 'auto', busy: null }).run).toBe(false)
  })
  it('full needs headroom >= .git', () => {
    expect(gitPlan({ mode: 'full', busy: false, freeBytes: 10, gitBytes: 5 }).args).toEqual(['-c', 'gc.autoDetach=false', 'gc'])
    expect(gitPlan({ mode: 'full', busy: false, freeBytes: 4, gitBytes: 5 }).run).toBe(false)
    expect(gitPlan({ mode: 'full', busy: false, freeBytes: null, gitBytes: 5 }).run).toBe(false)
  })
  it('busy means a verify suite or land-point', () => {
    expect(busyVerdict(['node scripts/verify/run-all.mjs polish'])).toBe(true)
    expect(busyVerdict(['node scripts/land-point.mjs 12'])).toBe(true)
    expect(busyVerdict(['node scripts/batch-launcher.mjs --daemon'])).toBe(false)
    expect(busyVerdict(null)).toBe(null)
  })
})

describe('budget, lock, schedule, failures', () => {
  it('budget ends on entries or time', () => {
    let t = 0
    const b = createBudget({ maxEntries: 3, maxMs: 100, clock: () => t })
    expect(b.spend(2)).toBe(true)
    expect(b.spend(1)).toBe(false)
    const c = createBudget({ maxEntries: 1000, maxMs: 100, clock: () => t })
    t = 100
    expect(c.exhausted()).toBe(true)
  })
  it('lock: absent free, live same-start held, dead or reused pid stale, unreadable held until old', () => {
    const lock = { pid: 42, pidStartedAt: 1000 }
    expect(lockVerdict({ lock: null })).toBe('free')
    expect(lockVerdict({ lock, probe: { exists: true, startedAt: 1500 } })).toBe('held')
    expect(lockVerdict({ lock, probe: { exists: true, startedAt: 9000 } })).toBe('stale')
    expect(lockVerdict({ lock, probe: { exists: false } })).toBe('stale')
    expect(lockVerdict({ lock, probe: { exists: true, startedAt: null } })).toBe('held')
    expect(lockVerdict({ lock: 'unreadable', now: DAY_MS, lockMtimeMs: DAY_MS - 1000 })).toBe('held')
    expect(lockVerdict({ lock: 'unreadable', now: 3 * DAY_MS, lockMtimeMs: 0 })).toBe('stale')
  })
  it('spawn at most once per interval, from either stamp', () => {
    const now = 10 * DAY_MS
    expect(spawnDecision({ now, lastSpawnAt: 0, lastAttemptAt: undefined }).spawn).toBe(true)
    expect(spawnDecision({ now, lastSpawnAt: now - 1000, lastAttemptAt: 0 }).spawn).toBe(false)
    expect(spawnDecision({ now, lastSpawnAt: 0, lastAttemptAt: now - 1000 }).spawn).toBe(false)
    expect(spawnDecision({ now, lastSpawnAt: now - DAY_MS, lastAttemptAt: 0 }).spawn).toBe(true)
  })
  it('one finding per failure kind until it recovers', () => {
    const a = failuresToFile({ reported: [], current: ['proc-unreadable', 'proc-unreadable'] })
    expect(a.file).toEqual(['proc-unreadable'])
    const b = failuresToFile({ reported: a.nextReported, current: ['proc-unreadable'] })
    expect(b.file).toEqual([])
    const c = failuresToFile({ reported: b.nextReported, current: [] })
    expect(c.nextReported).toEqual([])
    expect(failuresToFile({ reported: c.nextReported, current: ['proc-unreadable'] }).file).toEqual(['proc-unreadable'])
  })
})

describe('rescue/doctor and claude/* branches (point 1513)', () => {
  const now = Date.UTC(2026, 10, 30)
  const old = now - BRANCH_MAX_AGE_MS - DAY_MS
  const archive = ['# Archive', '- [x] 1485. Skirt', '  cloud branch claude/skirt-a ran here', '- [x] 1486. Other', '  text'].join('\n')
  const workOrder = parseWorkOrder('- [ ] 900. Open\n', archive)

  it('judges only rescue/doctor-* and single-segment claude/* names', () => {
    expect(branchKind('rescue/doctor-2026-10-26T18-09-42-184Z-1')).toBe('rescue')
    expect(branchKind('claude/skirt-a')).toBe('cloud')
    for (const n of ['rescue/parallel-x', 'feat/1-x', 'board', 'claude/a/b', 'main', '']) expect(branchKind(n)).toBe(null)
  })

  it('names the one archived point whose block mentions the branch exactly', () => {
    expect(archivedPointNaming('claude/skirt-a', archive)).toBe(1485)
    expect(archivedPointNaming('claude/skirt', archive)).toBe(null)
    expect(archivedPointNaming('claude/skirt-a', `${archive}\n  claude/skirt-a again`)).toBe(null)
    expect(archivedPointNaming('claude/skirt-a', null)).toBe(null)
    // A dotted continuation names another branch; a sentence full stop does not.
    expect(archivedPointNaming('claude/skirt-a', archive.replace('skirt-a ran', 'skirt-a.v2 ran'))).toBe(null)
    expect(archivedPointNaming('claude/skirt-a', archive.replace('skirt-a ran here', 'skirt-a.'))).toBe(1485)
  })

  it('deletes an old, contained rescue branch and keeps every unproven one', () => {
    const name = 'rescue/doctor-2026-10-26T18-09-42-184Z-1'
    expect(branchVerdict({ name, tipAtMs: old, now, contained: true }).act).toBe(true)
    expect(branchVerdict({ name, tipAtMs: now - DAY_MS, now, contained: true }).reason).toBe('young')
    expect(branchVerdict({ name, tipAtMs: old, now, contained: false }).reason).toBe('content missing from main')
    expect(branchVerdict({ name, tipAtMs: old, now, contained: null }).reason).toBe('containment unknown')
    expect(branchVerdict({ name, tipAtMs: NaN, now, contained: true }).reason).toBe('tip date unknown')
    expect(branchVerdict({ name: 'feat/1-x', tipAtMs: old, now, contained: true }).act).toBe(false)
  })

  it('deletes a claude/* branch only when its archived point is closed', () => {
    const v = (over) => branchVerdict({ name: 'claude/skirt-a', tipAtMs: old, now, contained: true, archiveText: archive, workOrder, ...over })
    expect(v({})).toEqual({ act: true, rule: 'branch-cloud', point: 1485 })
    expect(v({ name: 'claude/unnamed' }).act).toBe(false)
    expect(v({ workOrder: { ok: false } }).act).toBe(false)
    expect(v({ workOrder: parseWorkOrder('- [ ] 1485. Reopened\n', archive) }).reason).toBe('point 1485 not closed')
    expect(v({ contained: false }).act).toBe(false)
  })
})
