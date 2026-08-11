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

  it('renders the shape the harness reads', () => {
    const out = JSON.parse(render(decide({ tool_name: 'Bash' })))
    expect(out.hookSpecificOutput).toMatchObject({
      hookEventName: 'PermissionRequest',
      permissionDecision: 'allow',
    })
    expect(out.hookSpecificOutput.permissionDecisionReason).toBeTruthy()
  })

  it('renders NOTHING when it has no opinion, so the harness falls back to asking', () => {
    expect(render(null)).toBe('')
  })
})
