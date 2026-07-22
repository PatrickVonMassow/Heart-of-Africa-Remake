// Decision-logic sweep of the worktree-reminder PreToolUse hook
// (worktree-reminder-core): fires only for a background Agent spawn without
// worktree isolation, stays silent everywhere else, and is total on malformed
// input (the wrapper's fail-open depends on the core never throwing).
import { describe, it, expect } from 'vitest'
import { REMINDER, worktreeReminder } from './worktree-reminder-core.mjs'

/** The non-blocking PreToolUse reminder shape the hook must emit. */
const fired = (result) => {
  expect(result).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: REMINDER,
    },
  })
}

describe('worktreeReminder', () => {
  it('fires for a background Agent spawn without isolation', () => {
    fired(worktreeReminder({ toolName: 'Agent', toolInput: { prompt: 'fix the sea wall' } }))
    // explicit background flag fires too
    fired(
      worktreeReminder({ toolName: 'Agent', toolInput: { prompt: 'x', run_in_background: true } }),
    )
  })

  it('fires for a non-worktree isolation value', () => {
    fired(worktreeReminder({ toolName: 'Agent', toolInput: { prompt: 'x', isolation: 'none' } }))
  })

  it('the reminder names worktree isolation and the uncommitted fallback', () => {
    expect(REMINDER).toContain("isolation:'worktree'")
    expect(REMINDER).toContain('NON-OVERLAPPING')
    expect(REMINDER).toContain('UNCOMMITTED')
  })

  it('is silent for a foreground Agent', () => {
    expect(
      worktreeReminder({ toolName: 'Agent', toolInput: { prompt: 'x', run_in_background: false } }),
    ).toEqual({})
  })

  it('is silent for an Agent already using worktree isolation', () => {
    expect(
      worktreeReminder({ toolName: 'Agent', toolInput: { prompt: 'x', isolation: 'worktree' } }),
    ).toEqual({})
    expect(
      worktreeReminder({
        toolName: 'Agent',
        toolInput: { prompt: 'x', isolation: 'worktree', run_in_background: true },
      }),
    ).toEqual({})
  })

  it('is silent for non-Agent tools', () => {
    expect(worktreeReminder({ toolName: 'Bash', toolInput: { command: 'ls' } })).toEqual({})
    expect(worktreeReminder({ toolName: 'Edit', toolInput: { file_path: 'a.ts' } })).toEqual({})
  })

  it('is a no-op on malformed input (never throws)', () => {
    expect(worktreeReminder()).toEqual({})
    expect(worktreeReminder(null)).toEqual({})
    expect(worktreeReminder({})).toEqual({})
    expect(worktreeReminder({ toolName: 'Agent' })).toEqual({}) // no toolInput
    expect(worktreeReminder({ toolName: 'Agent', toolInput: 'not-an-object' })).toEqual({})
    expect(worktreeReminder({ toolName: 42, toolInput: {} })).toEqual({})
  })
})
