import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandSegments, headAndArgs } from './command-classify-core.mjs'
import {
  GREP_RESULT_BUDGET,
  READ_LINE_BUDGET,
  interceptToolOutput,
  interceptionEnvelope,
} from './tool-output-intercept-core.mjs'

const call = (tool_name, tool_input) => interceptToolOutput({ tool_name, tool_input }, { expandSegments, headAndArgs })

function decodedCommand(interception) {
  const encoded = interception.updatedInput.command.match(/--encoded-command ([A-Za-z0-9_-]+)$/)?.[1]
  return encoded ? Buffer.from(encoded, 'base64url').toString('utf8') : null
}

describe('PreToolUse output interception', () => {
  it.each([
    ['git diff', 'git diff HEAD~1', 'git diff'],
    ['grep', 'grep -R "needle" src', 'grep'],
    ['npm ls', 'npm ls --all', 'npm ls'],
    ['gh run view', 'gh run view 12345 --log', 'gh run view'],
  ])('budgets a direct %s without the caller routing it through a project script', (label, command, producer) => {
    const interception = call('Bash', { command, timeout: 30_000 })
    expect(interception?.producer).toBe(producer)
    expect(decodedCommand(interception)).toBe(command)
    expect(interception.updatedInput.command).toContain('scripts/tool-output-budget.mjs')
    expect(interception.updatedInput.timeout).toBe(30_000)
    expect(interception.reason).toContain('per-call budget')
  })

  it('budgets a direct whole-file Read by injecting its native offset/limit bound', () => {
    const interception = call('Read', { file_path: '/workspace/hoa/large.log' })
    expect(interception).toMatchObject({
      producer: 'file read',
      updatedInput: { file_path: '/workspace/hoa/large.log', limit: READ_LINE_BUDGET },
    })
    expect(interception.reason).toContain('offset/limit')
  })

  it('caps caller-supplied Read and Grep bounds rather than trusting a giant limit', () => {
    expect(call('Read', { file_path: 'x', offset: 401, limit: 50_000 }).updatedInput).toEqual({
      file_path: 'x',
      offset: 401,
      limit: READ_LINE_BUDGET,
    })
    expect(call('Grep', { pattern: 'x', path: 'src', head_limit: 50_000 }).updatedInput).toEqual({
      pattern: 'x',
      path: 'src',
      head_limit: GREP_RESULT_BUDGET,
    })
  })

  it('does not mistake producer names in quoted prose for an executed producer', () => {
    expect(call('Bash', { command: 'node -e "console.log(\'git diff and npm ls\')"' })).toBeNull()
    expect(call('Bash', { command: 'echo "grep needle"' })).toBeNull()
  })

  it.each([
    ['env CI=1 git diff', 'git diff'],
    ['sudo npm ls --all', 'npm ls'],
    ['bash -c "gh run view 123 --log"', 'gh run view'],
    ['echo $(grep -R needle src)', 'grep'],
  ])('cannot bypass interception through a shell carrier: %s', (command, producer) => {
    expect(call('Bash', { command })?.producer).toBe(producer)
  })

  it('emits the documented PreToolUse updatedInput envelope', () => {
    const interception = call('Bash', { command: 'git diff' })
    expect(interceptionEnvelope(interception)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: interception.reason,
        updatedInput: interception.updatedInput,
      },
    })
  })

  it('is wired at the existing path-scope PreToolUse hook for every named tool family', () => {
    const settings = JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8'))
    const entry = settings.hooks.PreToolUse.find((candidate) =>
      candidate.hooks?.some((hook) => hook.command.includes('path-scope-guard.mjs')),
    )
    expect(entry).toBeTruthy()
    const matcher = new RegExp(`^(?:${entry.matcher})$`)
    for (const tool of ['Bash', 'PowerShell', 'Read', 'Grep']) expect(matcher.test(tool), tool).toBe(true)
  })

  it('rewrites a direct producer through the real registered guard process', () => {
    const result = spawnSync(process.execPath, [resolve('scripts/path-scope-guard.mjs')], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
      input: JSON.stringify({
        session_id: 'tool-output-interception-test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git diff' },
        cwd: process.cwd(),
      }),
    })
    expect(result.status, result.stderr).toBe(0)
    const output = JSON.parse(result.stdout).hookSpecificOutput
    expect(output.hookEventName).toBe('PreToolUse')
    expect(output.permissionDecision).toBe('allow')
    expect(output.updatedInput.command).toContain('tool-output-budget.mjs')
    expect(Buffer.from(output.updatedInput.command.split(' ').at(-1), 'base64url').toString('utf8')).toBe('git diff')
  })
})
