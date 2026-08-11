import { describe, expect, it } from 'vitest'
import { decide, render } from './permission-autogrant-core.mjs'

describe('permission auto-grant', () => {
  it('grants an ordinary tool call', () => {
    const verdict = decide({ tool_name: 'Bash', tool_input: { command: 'ls' } })
    expect(verdict?.decision).toBe('allow')
    expect(verdict?.reason).toMatch(/guards/i)
  })

  it('grants every tool the harness would ask about, not just Bash', () => {
    for (const tool of ['Edit', 'Write', 'Bash', 'Agent', 'WebFetch', 'NotebookEdit']) {
      expect(decide({ tool_name: tool })?.decision).toBe('allow')
    }
  })

  it('keeps asking where a bare allow would answer the wrong question', () => {
    // AskUserQuestion IS the answer; ExitPlanMode needs the plan decision. Granting
    // either blind feeds an unattended run a hollow reply instead of unblocking it.
    for (const tool of ['AskUserQuestion', 'ExitPlanMode']) {
      expect(decide({ tool_name: tool }), tool).toBeNull()
    }
  })

  // Fail-open: each of these leaves the decision to the harness, which asks.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Bash'],
    ['a number', 7],
    ['an object without tool_name', { tool_input: {} }],
    ['a non-string tool_name', { tool_name: 42 }],
    ['an empty tool_name', { tool_name: '' }],
  ])('has no opinion on %s', (_label, input) => {
    expect(decide(input)).toBeNull()
  })

  it('renders a PermissionRequest DECISION OBJECT — not the PreToolUse field', () => {
    // The first version emitted the flat `permissionDecision`, which this event
    // ignores without complaint: the hook fired, the output was dropped, the dialog
    // appeared anyway. Only the object grants here, so the shape is asserted, not
    // just the value.
    const out = JSON.parse(render(decide({ tool_name: 'Bash' })))
    expect(out.hookSpecificOutput.hookEventName).toBe('PermissionRequest')
    expect(out.hookSpecificOutput.decision).toEqual({ behavior: 'allow' })
    expect(out.hookSpecificOutput.permissionDecision).toBeUndefined()
    expect(out.hookSpecificOutput.permissionDecisionReason).toBeTruthy()
  })

  it('never flips the session mode — the classifier is not ours to switch off', () => {
    // Both reviewers proposed adding a session-scoped setMode so the auto-mode
    // classifier stops judging. That is circumvention of a safety gate, not
    // configuration, and it stays out: this hook answers one pending question.
    const out = render(decide({ tool_name: 'Bash' }))
    expect(out).not.toMatch(/setMode|updatedPermissions|bypassPermissions/)
  })

  it('renders NOTHING when it has no opinion, so the harness falls back to asking', () => {
    expect(render(null)).toBe('')
  })
})
