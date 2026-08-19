import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  gatherActiveWorkSource,
  openPointNumbers,
  transitionActiveDeclaration,
} from './active-work-source.mjs'
import { UNATTRIBUTABLE_EVIDENCE_REMEDY, withRecordedEvidencePoint } from './batch-in-flight-core.mjs'
import { clearDeclaration, tagEvidencePoint, writeDeclaration } from './batch-in-flight.mjs'
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
    expect(activeWork).toMatchObject({ ok: true, points: [713], focusPoint: 713 })
    expect(projectNowForPublish(BARE_BOARD, activeWork).comparison.ok).toBe(true)
  })

  it('removes only the explicitly exited point and records the successor focus', () => {
    const declaration = { focusPoint: 700, evidence: [{ point: 700 }, { point: 697 }, { point: 700 }] }
    expect(transitionActiveDeclaration(declaration, { exitPoint: 700, focusPoint: 711 }))
      .toEqual({ focusPoint: 711, evidence: [{ point: 697 }] })
    expect(declaration.evidence).toHaveLength(3)
  })

  it('exits on the recorded point alone and persists the migrated mapping for the survivors', () => {
    // The real 19.08.2026 declaration: `point`-less legacy items the read side
    // resolves from the refs they declare. The exit filters on that SAME
    // resolution — and because the exit is a WRITE, every surviving legacy
    // item leaves it with its point RECORDED, so the legacy shape is gone
    // after one pass (fifth cross-vendor round: the mapping is written down,
    // never re-guessed).
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
      evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting', point: 697 }],
    })
    // A RECORDED point decides by itself: no ref is consulted once it stands.
    const recorded = { evidence: [{ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting', point: 713 }] }
    expect(transitionActiveDeclaration(recorded, { exitPoint: 713, worktreeRef: () => null }).evidence).toEqual([])
  })

  it('migrates a legacy declaration on a write that exits nothing — the focus path is a write too', () => {
    // Sixth cross-review: the early return on `exitPoint == null` skipped the
    // migration on focus writes, so a legacy declaration never gained its
    // recorded mapping until something exited. Every write migrates.
    const worktree = '/workspace/hoa/.claude/worktrees/point-713'
    const worktreeRef = (path) => (path === worktree ? 'refs/heads/feat/713-now-section-derived' : null)
    const declaration = {
      evidence: [
        { kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' },
        { kind: 'worktree', path: worktree },
      ],
    }
    expect(transitionActiveDeclaration(declaration, { focusPoint: 700, worktreeRef })).toEqual({
      focusPoint: 700,
      evidence: [
        { kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting', point: 697 },
        { kind: 'worktree', path: worktree, point: 713 },
      ],
    })
    // The input declaration is never mutated in place.
    expect(declaration.evidence[0]).toEqual({ kind: 'branch', ref: 'refs/heads/feat/697-goat-foot-planting' })
  })

  it('keeps an unattributable item unchanged and has the read side name the human way out', () => {
    // No recorded point, no resolvable ref: the item is neither guessed at nor
    // dropped — it survives every exit, and the gather side blocks loudly with
    // `batch-in-flight.mjs --clear` as the only sanctioned exit.
    const unresolved = { evidence: [{ kind: 'worktree', path: '/still-there' }] }
    const out = transitionActiveDeclaration(unresolved, { exitPoint: 713, focusPoint: null, worktreeRef: () => null })
    expect(out.evidence).toEqual([{ kind: 'worktree', path: '/still-there' }])
    const io = files({ d: JSON.stringify(out), f: JSON.stringify({ point: null }) })
    const gathered = gatherActiveWorkSource({
      tasksText: TASKS,
      declarationPath: 'd',
      focusPath: 'f',
      worktreeRef: () => null,
      ...io,
    })
    expect(gathered).toMatchObject({ ok: false, points: [] })
    expect(gathered.errors.join(' ')).toContain(UNATTRIBUTABLE_EVIDENCE_REMEDY)
    expect(UNATTRIBUTABLE_EVIDENCE_REMEDY).toContain('batch-in-flight.mjs --clear')
  })

  it('keeps a branch item that names no point, whatever exit runs', () => {
    // `main` parses to no point: it is never provably the exited strand, so it
    // stands until a human clears the declaration.
    const out = transitionActiveDeclaration(
      { evidence: [{ kind: 'branch', ref: 'main' }] },
      { exitPoint: 999, focusPoint: null, worktreeRef: () => null },
    )
    expect(out.evidence).toEqual([{ kind: 'branch', ref: 'main' }])
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

// The recorded evidence→point mapping itself: stamped at the write, migrated
// once on a legacy item, and never invented for what resolves to nothing.
describe('the write side records the evidence→point mapping', () => {
  it('stamps the point on every evidence kind at declaration time', () => {
    expect(tagEvidencePoint({ kind: 'branch', ref: 'feat/713-now-section-derived' }))
      .toMatchObject({ point: 713, phase: 'authoring' })
    expect(tagEvidencePoint({ kind: 'worktree', path: '/w' }, { worktreeRef: 'refs/heads/feat/697-goat' }))
      .toMatchObject({ point: 697 })
    expect(tagEvidencePoint({ kind: 'pid', pid: 4 }, { currentPoint: 711, phase: 'verification' }))
      .toMatchObject({ point: 711, phase: 'verification' })
    // Nothing known: recorded as unattributed, never guessed.
    expect(tagEvidencePoint({ kind: 'log', path: '/l' }).point).toBeNull()
  })

  it('migrates a legacy item once and leaves recorded or unresolvable items untouched', () => {
    const legacy = { kind: 'branch', ref: 'feat/713-x' }
    expect(withRecordedEvidencePoint(legacy)).toEqual({ ...legacy, point: 713 })
    // An item that already carries the field is NEVER re-derived — the record
    // is the source, not the ref.
    const recorded = { kind: 'branch', ref: 'feat/713-x', point: 700 }
    expect(withRecordedEvidencePoint(recorded)).toBe(recorded)
    // What resolves to nothing stays byte-identical: no field is invented.
    const unresolvable = { kind: 'worktree', path: '/x' }
    expect(withRecordedEvidencePoint(unresolvable, { worktreeRef: () => null })).toBe(unresolvable)
  })

  it('clearDeclaration removes the declaration file — the named human way out', () => {
    const root = mkdtempSync(join(tmpdir(), 'in-flight-clear-'))
    try {
      const path = join(root, 'in-flight.json')
      writeFileSync(path, JSON.stringify({ evidence: [{ kind: 'worktree', path: '/still-there' }] }))
      expect(clearDeclaration(path)).toBe(true)
      expect(existsSync(path)).toBe(false)
      // Clearing what is already gone stays a success: the wedge is open either way.
      expect(clearDeclaration(path)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('repairs an unattributable item the intended way: block loudly, clear, re-declare the real work', () => {
    // The whole repair path, not only the file removal (sixth cross-review,
    // finding on the destructive-only test): a declaration carrying one
    // unattributable item beside a real strand is UNKNOWN as a whole — the
    // read side blocks loudly naming --clear and never publishes the good
    // half alone. The human then clears and RE-DECLARES what is really
    // running through the stamping write path, and the source resolves again
    // with the real points — the repair ends in a working declaration, not
    // an empty one.
    const root = mkdtempSync(join(tmpdir(), 'in-flight-repair-'))
    try {
      const declarationPath = join(root, 'in-flight.json')
      const focusPath = join(root, 'focus.json')
      const tasksText = '- [ ] 700. A\n- [ ] 697. B\n'
      writeFileSync(declarationPath, JSON.stringify({
        evidence: [
          { kind: 'branch', ref: 'feat/700-context-fence' },
          { kind: 'worktree', path: '/gone-forever' },
        ],
      }))
      const blocked = gatherActiveWorkSource({ tasksText, declarationPath, focusPath, worktreeRef: () => null })
      expect(blocked).toMatchObject({ ok: false, points: [] })
      expect(blocked.errors.join(' ')).toContain(UNATTRIBUTABLE_EVIDENCE_REMEDY)
      // The named way out, then the re-declaration of the surviving strand.
      expect(clearDeclaration(declarationPath)).toBe(true)
      writeDeclaration({ evidence: [tagEvidencePoint({ kind: 'branch', ref: 'feat/700-context-fence' })] }, declarationPath)
      expect(gatherActiveWorkSource({ tasksText, declarationPath, focusPath, worktreeRef: () => null }))
        .toMatchObject({ ok: true, points: [700] })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// The default adapters themselves — real git, real fs, no injected probes.
describe('active-work lifecycle under the default git and fs adapters', () => {
  let root
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'active-work-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true })
  const tasksText = '- [ ] 999. Probe\n'

  it('resolves and exits a real worktree, and hands a vanished one to the human instead of guessing', () => {
    const repo = join(root, 'point-999')
    git('init', '-q', '-b', 'feat/999-probe', repo)
    const declarationPath = join(root, 'decl.json')
    const focusPath = join(root, 'focus.json')
    writeFileSync(declarationPath, JSON.stringify({ evidence: [{ kind: 'worktree', path: repo }] }))

    // The default git adapter resolves the legacy item on the read side…
    expect(gatherActiveWorkSource({ tasksText, declarationPath, focusPath }))
      .toMatchObject({ ok: true, points: [999] })
    // …and the exit reaches the same point through the same resolution.
    const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'))
    const exited = transitionActiveDeclaration(declaration, { exitPoint: 999, focusPoint: null })
    expect(exited.evidence).toEqual([])
    writeFileSync(declarationPath, JSON.stringify(exited))
    const zero = gatherActiveWorkSource({ tasksText, declarationPath, focusPath })
    expect(zero).toMatchObject({ ok: true, points: [] })
    expect(projectNowForPublish(BARE_BOARD, zero).comparison.ok).toBe(true)

    // The worktree vanished BEFORE its exit ran: no probe declares it gone any
    // more — the item survives the exit unchanged and the read side blocks
    // loudly, naming the explicit human command as the way out.
    rmSync(repo, { recursive: true, force: true })
    const kept = transitionActiveDeclaration(declaration, { exitPoint: 999, focusPoint: null })
    expect(kept.evidence).toEqual([{ kind: 'worktree', path: repo }])
    writeFileSync(declarationPath, JSON.stringify(kept))
    const blocked = gatherActiveWorkSource({ tasksText, declarationPath, focusPath })
    expect(blocked).toMatchObject({ ok: false, points: [] })
    expect(blocked.errors.join(' ')).toContain(UNATTRIBUTABLE_EVIDENCE_REMEDY)
  })

  it('keeps a detached worktree that still exists and reports it as unknown, never as zero', () => {
    const repo = join(root, 'wt')
    git('init', '-q', '-b', 'feat/999-probe', repo)
    git('-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-q', '-m', 'x')
    git('-C', repo, 'checkout', '-q', '--detach')

    // The ref probe fails, so the item cannot be attributed: it survives the
    // exit…
    const after = transitionActiveDeclaration(
      { evidence: [{ kind: 'worktree', path: repo }] },
      { exitPoint: 999, focusPoint: null },
    )
    expect(after.evidence).toEqual([{ kind: 'worktree', path: repo }])
    // …and the read side reports the survivor as unknown rather than silently
    // zero, so the publish stays blocked LOUDLY until somebody looks.
    const declarationPath = join(root, 'decl.json')
    writeFileSync(declarationPath, JSON.stringify(after))
    expect(gatherActiveWorkSource({ tasksText, declarationPath, focusPath: join(root, 'focus.json') }))
      .toMatchObject({ ok: false, points: [] })
  })
})
