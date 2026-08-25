import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentFableState } from './fable-switch.mjs'
import { mergerModel } from './fable-switch-core.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'fable-switch.mjs')
let dir
let file

const run = (...args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, FABLE_SWITCH_FILE: file, FABLE_SWITCH_SET_BY: 'test operator' },
  })
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-fable-switch-'))
  file = join(dir, 'nested', 'fable-switch.json')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('fable-switch.mjs', () => {
  it('fails loud when no decision has been recorded', () => {
    const result = run('--status')
    expect(result.status).toBe(1)
    expect(result.out).toContain('state is absent')
    expect(result.out).toContain('fable-switch.mjs --status')
    expect(existsSync(file)).toBe(false)
  })

  it('requires the reason on every flip', () => {
    expect(run('--off').status).toBe(2)
    expect(run('--off', '--why', '').status).toBe(1)
    expect(existsSync(file)).toBe(false)
  })

  it('flips off and reports the state, reason, and setter from the same write', () => {
    const result = run('--off', '--why', 'not enough volume left')
    expect(result.status).toBe(0)
    expect(result.out).toMatch(/^fable-switch: OFF/)
    expect(result.out).toContain('reason: not enough volume left')
    expect(result.out).toContain('set by test operator')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      state: 'off',
      reason: 'not enough volume left',
      setBy: 'test operator',
    })
    expect(mergerModel(currentFableState(file))).toBe('GPT-5.6 Sol')
  })

  it('makes the opposite flip visible to a fresh reader in the same run', () => {
    expect(run('--on', '--why', 'the user restored capacity').out).toMatch(/^fable-switch: ON/)
    expect(mergerModel(currentFableState(file))).toBe('Fable 5')
    expect(run('--status').out).toContain('the user restored capacity')
  })

  it('refuses a garbled record instead of silently choosing', () => {
    writeFileSync(file, '{broken')
    const result = run('--status')
    expect(result.status).toBe(1)
    expect(result.out).toContain('not valid JSON')
  })
})
