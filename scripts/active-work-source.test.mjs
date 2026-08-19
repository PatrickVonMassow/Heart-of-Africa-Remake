import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  branchEvidenceGone,
  gatherActiveWorkSource,
  openPointNumbers,
  transitionActiveDeclaration,
  worktreeEvidenceGone,
} from './active-work-source.mjs'
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
      declaration: { focusPoint: 711, evidence: [{ point: 697 }] },
      retired: [],
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
      declaration: {
        focusPoint: null,
        evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }],
      },
      retired: [],
    })
    // An item that resolves to NO point while its artefact may still exist is
    // unknown, never provably the exited one — it survives, and the gather
    // side keeps reporting it loudly.
    const unresolved = { evidence: [{ kind: 'worktree', path: '/still-there' }] }
    expect(transitionActiveDeclaration(unresolved, {
      exitPoint: 713,
      worktreeRef: () => null,
      evidenceGone: () => false,
    }).declaration.evidence).toEqual([{ kind: 'worktree', path: '/still-there' }])
  })

  it('retires a provably gone item as part of the RESULT, so no caller can lose it silently', () => {
    // A worktree removed between read and exit can never resolve again: kept,
    // it would wedge every later exit and publish. The retired list is part of
    // the return value — the promise does not depend on anyone's callback.
    const declaration = {
      evidence: [
        { kind: 'worktree', path: '/vanished' },
        { kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' },
      ],
    }
    expect(transitionActiveDeclaration(declaration, {
      exitPoint: 713,
      focusPoint: null,
      worktreeRef: () => null,
      evidenceGone: (item) => item.path === '/vanished',
    })).toEqual({
      declaration: {
        focusPoint: null,
        evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }],
      },
      retired: [{ kind: 'worktree', path: '/vanished' }],
    })
    // An item still resolving to ANOTHER point is never retired, gone or not:
    // provably attributed evidence exits only with its own point.
    const attributed = transitionActiveDeclaration(
      { evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }] },
      { exitPoint: 713, worktreeRef: () => null, evidenceGone: () => true },
    )
    expect(attributed.declaration.evidence).toEqual([{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' }])
    expect(attributed.retired).toEqual([])
  })

  it('never retires a gone worktree that still names ANOTHER point on its path', () => {
    // The `point-<N>` directory name is what is left of a vanished worktree's
    // testimony: on a different point's exit the item stays; only its own
    // point's exit may retire it (fourth cross-vendor round).
    const declaration = { evidence: [{ kind: 'worktree', path: '/w/.claude/worktrees/point-697' }] }
    const options = { worktreeRef: () => null, evidenceGone: () => true }
    const otherExit = transitionActiveDeclaration(declaration, { exitPoint: 713, ...options })
    expect(otherExit.declaration.evidence).toEqual([{ kind: 'worktree', path: '/w/.claude/worktrees/point-697' }])
    expect(otherExit.retired).toEqual([])
    const ownExit = transitionActiveDeclaration(declaration, { exitPoint: 697, ...options })
    expect(ownExit.declaration.evidence).toEqual([])
    expect(ownExit.retired).toEqual([{ kind: 'worktree', path: '/w/.claude/worktrees/point-697' }])
  })

  it('reads the exited legacy declaration as verified zero afterwards', () => {
    const worktree = '/w/point-713'
    const worktreeRef = (path) => (path === worktree ? 'refs/heads/feat/713-now-section-derived' : null)
    const before = { evidence: [{ kind: 'worktree', path: worktree }] }
    const { declaration: after } = transitionActiveDeclaration(before, { exitPoint: 713, focusPoint: null, worktreeRef })
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
    const repo = join(root, 'point-999')
    git('init', '-q', '-b', 'feat/999-probe', repo)
    const declarationPath = join(root, 'decl.json')
    const focusPath = join(root, 'focus.json')
    writeFileSync(declarationPath, JSON.stringify({ evidence: [{ kind: 'worktree', path: repo }] }))

    // The default git adapter resolves the legacy item on the read side…
    expect(gatherActiveWorkSource({ tasksText, declarationPath, focusPath }))
      .toMatchObject({ ok: true, points: [999] })
    // …and the exit reaches the same point through the same probe.
    const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'))
    expect(transitionActiveDeclaration(declaration, { exitPoint: 999, focusPoint: null }).declaration.evidence)
      .toEqual([])

    // The landing removed the worktree BEFORE the exit ran: the probe can
    // never succeed again (positive ENOENT), so the item is retired instead of
    // standing as a permanently unretractable strand that wedges the publish.
    rmSync(repo, { recursive: true, force: true })
    const { declaration: after, retired } = transitionActiveDeclaration(declaration, {
      exitPoint: 999,
      focusPoint: null,
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
    const { declaration: after, retired } = transitionActiveDeclaration(
      { evidence: [{ kind: 'worktree', path: repo }] },
      { exitPoint: 999, focusPoint: null },
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

  it('never mistakes a dangling symlink or a symlink loop for a vanished worktree', () => {
    // A dangling symlink lstats fine — the link itself exists on disk.
    const link = join(root, 'dangling')
    symlinkSync(join(root, 'no-such-target'), link)
    expect(worktreeEvidenceGone(link)).toBe(false)
    // ELOOP is a real error on a real fs, and it proves nothing about absence.
    symlinkSync(join(root, 'loop-b'), join(root, 'loop-a'))
    symlinkSync(join(root, 'loop-a'), join(root, 'loop-b'))
    const looping = join(root, 'loop-a', 'x')
    expect(worktreeEvidenceGone(looping)).toBe(false)
    // Both survive the exit as unresolved-but-present evidence.
    const { declaration: after, retired } = transitionActiveDeclaration(
      { evidence: [{ kind: 'worktree', path: link }, { kind: 'worktree', path: looping }] },
      { exitPoint: 999, focusPoint: null },
    )
    expect(after.evidence).toHaveLength(2)
    expect(retired).toEqual([])
  })

  it('retires a stray branch ref only once git verifies its absence', () => {
    // `main` parses to no point but EXISTS in this repository: kept on any
    // exit, whatever gone-check runs — the wedge closes only on real absence.
    const standing = transitionActiveDeclaration(
      { evidence: [{ kind: 'branch', ref: 'main' }] },
      { exitPoint: 999, focusPoint: null },
    )
    expect(standing.declaration.evidence).toEqual([{ kind: 'branch', ref: 'main' }])
    expect(standing.retired).toEqual([])
    // A stray name that never existed is verified absent (exit 1) and retired,
    // closing the branch-item wedge of the fourth cross-vendor round.
    const stray = { kind: 'branch', ref: 'stray-never-existed-hoa-713' }
    expect(branchEvidenceGone(stray.ref)).toBe(true)
    const goneBranch = transitionActiveDeclaration(
      { evidence: [stray] },
      { exitPoint: 999, focusPoint: null },
    )
    expect(goneBranch.declaration.evidence).toEqual([])
    expect(goneBranch.retired).toEqual([stray])
  })
})

// The absence classifier itself: which probe outcomes PROVE a path gone.
describe('worktreeEvidenceGone — positive proof only', () => {
  const throwing = (code) => () => {
    const error = new Error(code)
    error.code = code
    throw error
  }

  it('treats only ENOENT and ENOTDIR as proof, never a denied or failing probe', () => {
    expect(worktreeEvidenceGone('/x', { lstat: throwing('ENOENT') })).toBe(true)
    expect(worktreeEvidenceGone('/x', { lstat: throwing('ENOTDIR') })).toBe(true)
    for (const code of ['EACCES', 'EPERM', 'EIO', 'ELOOP', 'ENAMETOOLONG', 'EMFILE']) {
      expect(worktreeEvidenceGone('/x', { lstat: throwing(code) })).toBe(false)
    }
    expect(worktreeEvidenceGone('/x', { lstat: () => ({}) })).toBe(false)
    expect(worktreeEvidenceGone('', { lstat: throwing('ENOENT') })).toBe(false)
    expect(worktreeEvidenceGone(null, { lstat: throwing('ENOENT') })).toBe(false)
  })

  it('absolutises a relative path against the repository root, never the cwd', () => {
    const probed = []
    const lstat = (path) => {
      probed.push(path)
      const error = new Error('ENOENT')
      error.code = 'ENOENT'
      throw error
    }
    worktreeEvidenceGone('rel/tree', { lstat, root: '/repo-base' })
    expect(probed).toEqual(['/repo-base/rel/tree'])
    worktreeEvidenceGone('/abs/tree', { lstat, root: '/repo-base' })
    expect(probed[1]).toBe('/abs/tree')
  })
})
