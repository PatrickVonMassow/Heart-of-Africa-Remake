import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const LAUNCHER = join(HERE, 'tool-output-budget-launch.mjs')
const REAL_BUDGET = join(HERE, 'tool-output-budget.mjs')

function launch(command, { budgetScript, degradationLog }) {
  return spawnSync(process.execPath, [
    LAUNCHER,
    '--budget-script', budgetScript,
    '--encoded-command', Buffer.from(command).toString('base64url'),
    '--degradation-log', degradationLog,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  })
}

const ownCommand = () => (
  `${JSON.stringify(process.execPath)} -e "process.stdout.write('COMMAND OUTPUT');process.stderr.write('HIDDEN');process.exit(7)" 2>/dev/null`
)

describe('tool output budget launch boundary', () => {
  it.each([
    ['missing', (path) => join(path, 'missing-budget.mjs')],
    ['unreadable', (path) => {
      const file = join(path, 'unreadable-budget.mjs')
      writeFileSync(file, 'process.exit(0)\n')
      chmodSync(file, 0o000)
      return file
    }],
    ['syntax error', (path) => {
      const file = join(path, 'invalid-budget.mjs')
      writeFileSync(file, 'const = broken syntax\n')
      return file
    }],
  ])('fails open when the budget script is %s, preserving output and exit status', (_, makeBudget) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-budget-launch-'))
    const degradationLog = join(dir, 'degradations.jsonl')
    try {
      const result = launch(ownCommand(), { budgetScript: makeBudget(dir), degradationLog })

      expect(result.status).toBe(7)
      expect(result.stdout).toBe('COMMAND OUTPUT')
      expect(result.stderr).toContain('tool-output-budget WARNING')
      expect(result.stderr).toContain('running the command without an output budget')
      // The original command swallowed its own stderr; the launch warning is
      // outside that redirection and also survives in the durable record.
      expect(result.stderr).not.toContain('HIDDEN')
      const records = readFileSync(degradationLog, 'utf8').trim().split('\n').map(JSON.parse)
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ kind: 'not-started' })
    } finally {
      const unreadable = join(dir, 'unreadable-budget.mjs')
      if (existsSync(unreadable)) chmodSync(unreadable, 0o600)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('counts repeated fail-open launches and surfaces the occurrence number', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-budget-launch-'))
    const degradationLog = join(dir, 'degradations.jsonl')
    const missing = join(dir, 'missing-budget.mjs')
    try {
      const first = launch('printf first', { budgetScript: missing, degradationLog })
      const second = launch('printf second', { budgetScript: missing, degradationLog })

      expect(first.status).toBe(0)
      expect(second.status).toBe(0)
      expect(first.stdout).toBe('first')
      expect(second.stdout).toBe('second')
      expect(second.stderr).toContain('occurrence 2')
      expect(readFileSync(degradationLog, 'utf8').trim().split('\n')).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a genuine budget completion and preserves the command status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-budget-launch-'))
    try {
      const result = launch(
        `${JSON.stringify(process.execPath)} -e "process.stderr.write('ASSERT');process.exit(9)"`,
        { budgetScript: REAL_BUDGET, degradationLog: join(dir, 'degradations.jsonl') },
      )

      expect(result.status).toBe(9)
      expect(result.stdout).toContain('ASSERT')
      expect(result.stderr).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly without replay when a budget worker dies after consuming command output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-budget-launch-'))
    const worker = join(dir, 'dying-budget.mjs')
    const executions = join(dir, 'executions.txt')
    const degradationLog = join(dir, 'degradations.jsonl')
    const commandCode = `require('fs').appendFileSync(${JSON.stringify(executions)}, 'x');process.stdout.write('COMPLETE OUTPUT')`
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(commandCode)}`
    writeFileSync(worker, `
      import { spawnSync } from 'node:child_process'
      const at = process.argv.indexOf('--encoded-command')
      const command = Buffer.from(process.argv[at + 1], 'base64url').toString('utf8')
      process.send({ source: 'tool-output-budget', event: 'started' }, () => {
        const result = spawnSync(process.env.SHELL || '/bin/sh', ['-c', command], { encoding: 'utf8' })
        process.stdout.write(result.stdout.slice(0, 4))
        process.exit(23)
      })
    `)
    try {
      const result = launch(command, { budgetScript: worker, degradationLog })

      expect(result.status).toBe(23)
      expect(result.stdout).toBe('COMP')
      expect(result.stderr).toContain('tool-output-budget FAILURE')
      expect(result.stderr).toContain('died after capture began')
      expect(result.stderr).toContain('command was not rerun')
      expect(readFileSync(executions, 'utf8')).toBe('x')
      expect(JSON.parse(readFileSync(degradationLog, 'utf8').trim())).toMatchObject({ kind: 'after-start' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
