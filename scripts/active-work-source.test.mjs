import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gatherActiveWorkSource, openPointNumbers, transitionActiveDeclaration } from './active-work-source.mjs'
import { projectNowForPublish } from './board-core.mjs'

const TASKS = '- [ ] 697. A\n- [ ] 700. B\n- [ ] 711. C\n- [ ] 712. DEFERRED later\n'

const BARE_BOARD = '<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n</details>\n' +
  '<details class="sect"><summary><h2>Von dir zu klären</h2></summary>\n</details>\n' +
  '<details class="sect"><summary><h2>Warteschlange</h2></summary>\n</details>\n' +
  '<details class="sect"><summary><h2>Erledigt</h2></summary>\n</details>\n</main>\n'

function files(values = {}) {
  return {
    exists: (path) => Object.hasOwn(values, path),
    read: (path) => values[path],
  }
}

describe('active-work source I/O boundary', () => {
  it('reads focus plus explicitly tagged strands and ignores undeclared branch noise', () => {
    const io = files({
      declaration: JSON.stringify({ evidence: [{ point: 697 }, { point: 711 }, { point: 697 }] }),
      focus: JSON.stringify({ point: 700 }),
    })
    expect(gatherActiveWorkSource({ tasksText: TASKS, declarationPath: 'declaration', focusPath: 'focus', ...io }))
      .toMatchObject({ ok: true, points: [700, 697, 711] })
  })

  it('treats missing records as verified zero but present malformed JSON as unknown', () => {
    expect(gatherActiveWorkSource({ tasksText: TASKS, declarationPath: 'd', focusPath: 'f', ...files() }))
      .toMatchObject({ ok: true, points: [] })
    expect(gatherActiveWorkSource({ tasksText: TASKS, declarationPath: 'd', focusPath: 'f', ...files({ d: '{' }) }))
      .toMatchObject({ ok: false, points: [] })
  })

  it('does not treat deferred work as open and fails unknown on a closed strand', () => {
    expect(openPointNumbers(TASKS)).toEqual(new Set([697, 700, 711]))
    const io = files({ d: JSON.stringify({ evidence: [{ point: 712 }] }) })
    expect(gatherActiveWorkSource({ tasksText: TASKS, declarationPath: 'd', focusPath: 'f', ...io }).ok).toBe(false)
  })

  it('publishes an adopted legacy declaration whose branch and worktree already name the point', () => {
    const tasksText = '- [ ] 713. Derive the now-section\n'
    const worktree = '/workspace/hoa/.claude/worktrees/point-713'
    const io = files({
      declaration: JSON.stringify({
        evidence: [
          { kind: 'branch', ref: 'refs/heads/feat/713-now-section-derived' },
          { kind: 'worktree', path: worktree },
        ],
      }),
      focus: JSON.stringify({ point: 713 }),
    })
    const activeWork = gatherActiveWorkSource({
      tasksText,
      declarationPath: 'declaration',
      focusPath: 'focus',
      worktreeRef: (path) => path === worktree ? 'refs/heads/feat/713-now-section-derived' : null,
      ...io,
    })
    const board = '<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n</details>\n' +
      '<details class="sect"><summary><h2>Von dir zu klären</h2></summary>\n</details>\n' +
      '<details class="sect"><summary><h2>Warteschlange</h2></summary>\n</details>\n' +
      '<details class="sect"><summary><h2>Erledigt</h2></summary>\n</details>\n</main>\n'

    expect(activeWork).toMatchObject({ ok: true, points: [713], focusPoint: 713 })
    expect(projectNowForPublish(board, activeWork).comparison.ok).toBe(true)
  })

  it('removes only the explicitly exited point and records the successor focus', () => {
    const declaration = { focusPoint: 700, evidence: [{ point: 700 }, { point: 697 }, { point: 700 }] }
    expect(transitionActiveDeclaration(declaration, { exitPoint: 700, focusPoint: 711 })).toEqual({
      focusPoint: 711,
      evidence: [{ point: 697 }],
    })
    expect(declaration.evidence).toHaveLength(3)
  })

  it('exits legacy branch and worktree evidence through the same resolution the read side uses', () => {
    // The real 19.08.2026 declaration: a `point`-less worktree item that the
    // gather side resolves to 713. The exit of 713 must remove it, or the
    // strand stays active on the read side while its card is already archived.
    const worktree = '/workspace/hoa/.claude/worktrees/point-713'
    const worktreeRef = (path) => (path === worktree ? 'refs/heads/feat/713-now-section-derived' : null)
    const declaration = {
      evidence: [
        { kind: 'branch', ref: 'refs/heads/feat/713-now-section-derived' },
        { kind: 'worktree', path: worktree },
        { kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' },
      ],
    }
    expect(transitionActiveDeclaration(declaration, { exitPoint: 713, focusPoint: null, worktreeRef })).toEqual({
      focusPoint: null,
      evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }],
    })
    // An item that resolves to NO point while its artefact may still exist is
    // unknown, never provably the exited one — it survives, and the gather
    // side keeps reporting it loudly.
    const unresolved = { evidence: [{ kind: 'worktree', path: '/still-there' }] }
    expect(transitionActiveDeclaration(unresolved, {
      exitPoint: 713,
      worktreeRef: () => null,
      evidenceGone: () => false,
    }).evidence).toEqual([{ kind: 'worktree', path: '/still-there' }])
  })

  it('retires an item whose artefact is provably gone, loudly and never silently', () => {
    // A worktree removed between read and exit can never resolve again: kept,
    // it would wedge every later exit and publish. It leaves via onRetire.
    const retired = []
    const declaration = {
      evidence: [
        { kind: 'worktree', path: '/vanished' },
        { kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' },
      ],
    }
    const after = transitionActiveDeclaration(declaration, {
      exitPoint: 713,
      focusPoint: null,
      worktreeRef: () => null,
      evidenceGone: (item) => item.path === '/vanished',
      onRetire: (item) => retired.push(item),
    })
    expect(after.evidence).toEqual([{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }])
    expect(retired).toEqual([{ kind: 'worktree', path: '/vanished' }])
    // An item still resolving to ANOTHER point is never retired, gone or not:
    // provably attributed evidence exits only with its own point.
    const attributed = transitionActiveDeclaration(
      { evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }] },
      { exitPoint: 713, worktreeRef: () => null, evidenceGone: () => true, onRetire: (item) => retired.push(item) },
    )
    expect(attributed.evidence).toEqual([{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }])
    expect(retired).toHaveLength(1)
  })

  it('reads the exited legacy declaration as verified zero afterwards', () => {
    const worktree = '/w/point-713'
    const worktreeRef = (path) => (path === worktree ? 'refs/heads/feat/713-now-section-derived' : null)
    const before = { evidence: [{ kind: 'worktree', path: worktree }] }
    const after = transitionActiveDeclaration(before, { exitPoint: 713, focusPoint: null, worktreeRef })
    const io = files({ declaration: JSON.stringify(after), focus: JSON.stringify({ point: null }) })
    expect(gatherActiveWorkSource({
      tasksText: '- [ ] 713. Derive the now-section\n',
      declarationPath: 'declaration',
      focusPath: 'focus',
      worktreeRef,
      ...io,
    })).toMatchObject({ ok: true, points: [] })
  })
})

// The default adapters themselves — real git, real fs, no injected probes.
// The reviewer's wedge lived exactly in the gap the fixtures skipped: what the
// exit does once the worktree has vanished, detached, or the probe fails.
describe('active-work lifecycle under the default git and fs adapters', () => {
  let root
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'active-work-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true })
  const tasksText = '- [ ] 999. Probe\n'

  it('resolves, exits and verifies zero across a real worktree — and retires it once it is gone', () => {
    const repo = join(root, 'wt')
    git('init', '-q', '-b', 'feat/999-probe', repo)
    const declarationPath = join(root, 'decl.json')
    const focusPath = join(root, 'focus.json')
    writeFileSync(declarationPath, JSON.stringify({ evidence: [{ kind: 'worktree', path: repo }] }))

    // The default git adapter resolves the legacy item on the read side…
    expect(gatherActiveWorkSource({ tasksText, declarationPath, focusPath }))
      .toMatchObject({ ok: true, points: [999] })
    // …and the exit reaches the same point through the same probe.
    const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'))
    expect(transitionActiveDeclaration(declaration, { exitPoint: 999, focusPoint: null }).evidence).toEqual([])

    // The landing removed the worktree BEFORE the exit ran: the probe can
    // never succeed again, so the item is retired loudly instead of standing
    // as a permanently unretractable strand that wedges the publish.
    rmSync(repo, { recursive: true, force: true })
    const retired = []
    const after = transitionActiveDeclaration(declaration, {
      exitPoint: 999,
      focusPoint: null,
      onRetire: (item) => retired.push(item),
    })
    expect(after.evidence).toEqual([])
    expect(retired).toEqual([{ kind: 'worktree', path: repo }])
    writeFileSync(declarationPath, JSON.stringify(after))
    const zero = gatherActiveWorkSource({ tasksText, declarationPath, focusPath })
    expect(zero).toMatchObject({ ok: true, points: [] })
    expect(projectNowForPublish(BARE_BOARD, zero).comparison.ok).toBe(true)
  })

  it('keeps a detached worktree that still exists and reports it as unknown, never as zero', () => {
    const repo = join(root, 'wt')
    git('init', '-q', '-b', 'feat/999-probe', repo)
    git('-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-q', '-m', 'x')
    git('-C', repo, 'checkout', '-q', '--detach')

    // The probe fails but the artefact still exists: it may hold real work,
    // so the exit keeps it…
    const retired = []
    const after = transitionActiveDeclaration(
      { evidence: [{ kind: 'worktree', path: repo }] },
      { exitPoint: 999, focusPoint: null, onRetire: (item) => retired.push(item) },
    )
    expect(after.evidence).toEqual([{ kind: 'worktree', path: repo }])
    expect(retired).toEqual([])
    // …and the read side reports the survivor as unknown rather than silently
    // zero, so the publish stays blocked LOUDLY until somebody looks.
    const declarationPath = join(root, 'decl.json')
    writeFileSync(declarationPath, JSON.stringify(after))
    expect(gatherActiveWorkSource({ tasksText, declarationPath, focusPath: join(root, 'focus.json') }))
      .toMatchObject({ ok: false, points: [] })
  })
})
