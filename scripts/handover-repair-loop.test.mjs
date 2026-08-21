import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { callMayCreateCommit, commitsBetween, observeOwnerLoops } from './handover-repair-loop.mjs'

const claim = {
  claim: { claimantSid: 'visible-window', at: 100 },
  honour: true,
  claimantSid: 'visible-window',
}

const deps = (over = {}) => ({
  readHead: () => 'head-a',
  readCommits: () => [],
  readTurnKey: () => 'turn-a',
  readClaimVerdict: () => ({ assessment: claim, verdict: { verdict: 'release', reason: 'clean' } }),
  handBack: vi.fn(() => ({ released: true, stamped: true })),
  ...over,
})

describe('observeOwnerLoops', () => {
  it('releases on the bounded clean response and explains why Stop did not', () => {
    const handBack = vi.fn(() => ({ released: true, stamped: true }))
    let state
    let result
    for (const turn of ['turn-a', 'turn-b', 'turn-c']) {
      result = observeOwnerLoops(
        { sid: 'owner', ownsBatch: true, transcriptPath: '/transcript', state },
        deps({ readTurnKey: () => turn, handBack }),
      )
      state = result.state
    }
    expect(handBack).toHaveBeenCalledOnce()
    expect(result.context).toContain('HAND-BACK BOUND REACHED')
    expect(result.context).toContain('never reached its Stop hook')
  })

  it('states the dirty reason at the bound without releasing', () => {
    const handBack = vi.fn()
    let state
    let result
    for (const turn of ['turn-a', 'turn-b', 'turn-c']) {
      result = observeOwnerLoops(
        { sid: 'owner', ownsBatch: true, state },
        deps({
          readTurnKey: () => turn,
          readClaimVerdict: () => ({ assessment: claim, verdict: { verdict: 'wait', reason: 'merge' } }),
          handBack,
        }),
      )
      state = result.state
    }
    expect(handBack).not.toHaveBeenCalled()
    expect(result.context).toContain('cannot be released yet (merge)')
  })

  it('exposes a release whose reservation stamp failed', () => {
    let state
    let result
    for (const turn of ['turn-a', 'turn-b', 'turn-c']) {
      result = observeOwnerLoops(
        { sid: 'owner', ownsBatch: true, state },
        deps({ readTurnKey: () => turn, handBack: () => ({ released: true, stamped: false }) }),
      )
      state = result.state
    }
    expect(result.context).toContain('pickup reservation is unproven')
  })

  it('defers a report when another heartbeat duty already owns stdout', () => {
    let state
    for (const turn of ['turn-a', 'turn-b']) {
      state = observeOwnerLoops(
        { sid: 'owner', ownsBatch: true, state },
        deps({ readTurnKey: () => turn }),
      ).state
    }
    const deferred = observeOwnerLoops(
      { sid: 'owner', ownsBatch: true, state, mayAct: false },
      deps({ readTurnKey: () => 'turn-c' }),
    )
    expect(deferred.context).toBe('')
    const spoken = observeOwnerLoops(
      { sid: 'owner', ownsBatch: true, state: deferred.state },
      deps({ readTurnKey: () => 'turn-c' }),
    )
    expect(spoken.context).toContain('HAND-BACK BOUND REACHED')
  })

  it('stands down without reading state for non-owners and pauses', () => {
    const readHead = vi.fn()
    expect(observeOwnerLoops({ sid: 'other', ownsBatch: false }, deps({ readHead }))).toEqual({
      state: {},
      context: '',
    })
    expect(observeOwnerLoops({ sid: 'owner', ownsBatch: true, paused: true }, deps({ readHead }))).toEqual({
      state: {},
      context: '',
    })
    expect(readHead).not.toHaveBeenCalled()
  })

  it('surfaces a five-commit guard run once as later repairs extend it', () => {
    const guardCommit = (sha) => ({ sha, paths: ['scripts/example-guard-core.mjs'] })
    let state = {
      repair: {
        lastHead: 'old',
        commits: [guardCommit('c4'), guardCommit('c3'), guardCommit('c2'), guardCommit('c1')],
      },
    }
    const fifth = observeOwnerLoops(
      { sid: 'owner', ownsBatch: true, state },
      deps({
        readHead: () => 'c5',
        readCommits: () => [guardCommit('c5')],
        readClaimVerdict: () => ({ assessment: {}, verdict: { verdict: 'none' } }),
      }),
    )
    expect(fifth.context).toContain('REPAIR LOOP 5')
    const sixth = observeOwnerLoops(
      { sid: 'owner', ownsBatch: true, state: fifth.state },
      deps({
        readHead: () => 'c6',
        readCommits: () => [guardCommit('c6')],
        readClaimVerdict: () => ({ assessment: {}, verdict: { verdict: 'none' } }),
      }),
    )
    expect(sixth.context).toBe('')
  })

  it('counts the commit that first loads the new observer, instead of baselining past it', () => {
    const readCommits = vi.fn(() => [
      { sha: 'observer-landing', paths: ['scripts/example-guard.mjs'] },
    ])
    const result = observeOwnerLoops(
      {
        sid: 'owner',
        ownsBatch: true,
        toolName: 'Bash',
        command: 'git commit -m "land observer"',
      },
      deps({
        readHead: () => 'observer-landing',
        readCommits,
        readClaimVerdict: () => ({ assessment: {}, verdict: { verdict: 'none' } }),
      }),
    )
    expect(readCommits).toHaveBeenCalledWith('observer-landing^', 'observer-landing')
    expect(result.state.repair.commits).toHaveLength(1)
  })
})

describe('commitsBetween', () => {
  it('parses first-parent commit paths newest first', () => {
    const runGit = vi.fn((args) => {
      if (args[0] === 'merge-base') return ''
      return '@@new-a\nscripts/a-guard.mjs\n\n@@new-b\nscripts/a-guard-core.mjs\nsrc/x.ts'
    })
    expect(commitsBetween('old', 'new-b', { runGit })).toEqual([
      { sha: 'new-b', paths: ['scripts/a-guard-core.mjs', 'src/x.ts'] },
      { sha: 'new-a', paths: ['scripts/a-guard.mjs'] },
    ])
  })
})

describe('callMayCreateCommit', () => {
  it('recognises history writes without matching quoted mentions', () => {
    expect(callMayCreateCommit({ toolName: 'Bash', command: 'git commit -m done' })).toBe(true)
    expect(callMayCreateCommit({ toolName: 'Bash', command: 'node scripts/land-point.mjs 700' })).toBe(true)
    expect(callMayCreateCommit({ toolName: 'Bash', command: 'rg "git commit" docs' })).toBe(false)
    expect(callMayCreateCommit({ toolName: 'Read', command: 'git commit -m done' })).toBe(false)
  })
})

describe('the live event path', () => {
  it('is called by the already-wired all-tools PostToolUse hook', () => {
    const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8'))
    const postTools = settings.hooks.PostToolUse.flatMap((entry) => entry.hooks ?? [])
    expect(postTools.some((hook) => /lock-heartbeat-hook\.mjs/.test(hook.command))).toBe(true)

    const heartbeat = readFileSync(resolve(process.cwd(), 'scripts/lock-heartbeat-hook.mjs'), 'utf8')
    expect(heartbeat).toContain("import { observeOwnerLoops } from './handover-repair-loop.mjs'")
    expect(heartbeat).toContain('const observed = observeOwnerLoops({')
  })
})
