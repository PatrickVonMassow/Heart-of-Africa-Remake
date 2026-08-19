import { describe, expect, it } from 'vitest'
import { gatherActiveWorkSource, openPointNumbers, transitionActiveDeclaration } from './active-work-source.mjs'
import { projectNowForPublish } from './board-core.mjs'

const TASKS = '- [ ] 697. A\n- [ ] 700. B\n- [ ] 711. C\n- [ ] 712. DEFERRED later\n'

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
})
