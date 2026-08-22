import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { expandSegments, headAndArgs } from './command-classify-core.mjs'
import {
  GREP_RESULT_BUDGET,
  READ_LINE_BUDGET,
  interceptToolOutput,
  interceptionEnvelope,
  toolOutputCommand,
} from './tool-output-intercept-core.mjs'
import { preToolUseEnvelope } from './path-scope-guard.mjs'

const call = (tool_name, tool_input) => interceptToolOutput({ tool_name, tool_input }, { expandSegments, headAndArgs })

function decodedCommand(interception) {
  const encoded = interception.updatedInput.command.match(/--encoded-command ([A-Za-z0-9_-]+)$/)?.[1]
  return encoded ? Buffer.from(encoded, 'base64url').toString('utf8') : null
}

describe('PreToolUse output interception', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['relative', '../wrong-project'],
  ])('builds and runs an absolute hook-relative budget path when CLAUDE_PROJECT_DIR is %s', (_, projectDir) => {
    const command = toolOutputCommand(`${JSON.stringify(process.execPath)} -e "process.stdout.write('OWN OUTPUT')"`, {
      hookUrl: pathToFileURL(resolve('scripts/path-scope-guard.mjs')).href,
    })
    const env = { ...process.env }
    if (projectDir === undefined) delete env.CLAUDE_PROJECT_DIR
    else env.CLAUDE_PROJECT_DIR = projectDir
    const result = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', env, windowsHide: true })

    expect(command).not.toContain('CLAUDE_PROJECT_DIR')
    expect(command).toContain(resolve('scripts/tool-output-budget-launch.mjs'))
    expect(command).toContain(resolve('scripts/tool-output-budget.mjs'))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('OWN OUTPUT')
  })

  it('quotes a hook path containing spaces so the shell receives both absolute script paths whole', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa output hook '))
    const launcher = join(dir, 'budget launcher.mjs')
    const budget = join(dir, 'budget worker.mjs')
    try {
      writeFileSync(launcher, `process.stdout.write(JSON.stringify(process.argv.slice(2)))\n`)
      const command = toolOutputCommand('printf untouched', { launcherPath: launcher, budgetScriptPath: budget })
      const result = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8', windowsHide: true })

      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual([
        '--budget-script',
        budget,
        '--encoded-command',
        Buffer.from('printf untouched').toString('base64url'),
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each([
    ['git diff', 'git diff HEAD~1', 'git diff'],
    ['git show', 'git --no-pager show HEAD', 'git show'],
    ['git log -p', 'git log -p --all', 'git log --patch'],
    ['git log --patch', 'git --no-pager log --patch -2', 'git log --patch'],
    ['grep', 'grep -R "needle" src', 'grep'],
    ['cat', 'cat a.log b.log', 'cat file read'],
    ['head', 'head -n 100000 a.log', 'head file read'],
    ['tail', 'tail -n 100000 a.log', 'tail file read'],
    ['sed -n', "sed -n '1,99999p' a.log", 'sed selective file read'],
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

  it('leaves unlisted and output-consumed shell commands outside the named-producer bound', () => {
    expect(call('Bash', { command: 'git log --oneline -5' })).toBeNull()
    expect(call('Bash', { command: 'node scripts/custom-reporter.mjs' })).toBeNull()
    expect(call('Bash', { command: 'npm run test:unit' })).toBeNull()
  })

  it.each([
    ['env CI=1 git diff', 'git diff'],
    ['sudo npm ls --all', 'npm ls'],
    ['bash -c "gh run view 123 --log"', 'gh run view'],
    ['echo $(grep -R needle src)', 'grep'],
    ['bash -c "git log -p -1"', 'git log --patch'],
    ['echo $(cat a.log)', 'cat file read'],
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

  it('still budgets a named producer when path enforcement stands down for a paused batch', () => {
    const envelope = preToolUseEnvelope(
      {
        session_id: 'paused-session',
        tool_name: 'Bash',
        tool_input: { command: 'git diff' },
        cwd: process.cwd(),
      },
      { gather: () => ({ applicable: false, why: 'the batch is paused' }) },
    )
    expect(envelope?.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    })
    expect(envelope.hookSpecificOutput.updatedInput.command).toContain('tool-output-budget.mjs')
  })
})
