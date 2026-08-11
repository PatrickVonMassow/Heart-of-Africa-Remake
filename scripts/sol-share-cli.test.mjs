// THE SWITCH AS IT IS ACTUALLY RUN — spawned, with its exit code and its file read.
// The core above proves the decisions; this proves the command persists them, prints one
// line for the reader and never wraps around at an end. `SOL_SHARE_FILE` points it at a
// temp file, so nothing here touches the developer's own setting.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'sol-share.mjs')
let dir = ''
let file = ''

/**
 * Run the command; never throws — the exit code is part of what is under test, and BOTH
 * channels are read: the refusals go to stderr and are exactly what a reader must see.
 */
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, SOL_SHARE_FILE: file }, windowsHide: true })
  return { status: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}
const state = () => JSON.parse(readFileSync(file, 'utf8'))

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-sol-share-'))
  file = join(dir, 'nested', 'sol-share.json')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('sol-share.mjs', () => {
  it('reports the default before anything has ever been set, and writes no file to do it', () => {
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^sol-share: default —/)
    expect(existsSync(file)).toBe(false)
  })

  it('steps towards Sol, persists it, and says so in the one line', () => {
    expect(run('--more').status).toBe(0)
    expect(state().setting).toBe('prefer-sol')
    expect(run('--status').stdout).toMatch(/^sol-share: prefer-sol — to GPT-5\.6 Sol: review, diagnose/)
  })

  it('refuses to wrap past the end, leaving the setting where it was', () => {
    const r = run('--more')
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/already at `prefer-sol`/)
    expect(state().setting).toBe('prefer-sol')
  })

  it('steps back down again, two steps to the escape hatch', () => {
    run('--less')
    expect(state().setting).toBe('default')
    run('--less')
    expect(state().setting).toBe('claude-only')
    expect(run('--status').out).toMatch(/to GPT-5\.6 Sol: nothing/)
  })

  it('sets a named setting and answers --json machine-readably', () => {
    expect(run('--set', 'prefer-sol').status).toBe(0)
    const json = JSON.parse(run('--status', '--json').stdout)
    expect(json.setting).toBe('prefer-sol')
    expect(json.routing.find((r) => r.kind === 'diagnose').to).toBe('sol')
    expect(json.file).toBe(file)
  })

  it('refuses a setting that is not one, with usage and a non-zero code', () => {
    const r = run('--set', 'sol-only')
    expect(r.status).toBe(2)
    expect(r.out).toMatch(/not a setting/)
    expect(state().setting).toBe('prefer-sol')
  })

  it('DEGRADES to the default on a broken state file instead of failing the caller', () => {
    writeFileSync(file, '{ this is not json')
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^sol-share: default —/)
    expect(r.out).toMatch(/NOTE: .*not JSON/)
  })
})
