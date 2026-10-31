import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentLaneState, usage } from './lane-switch.mjs'
import { mergerModel, SWITCH_ROLES } from './lane-switch-core.mjs'
import { usage as askUsage } from './ask-lane.mjs'
import { EXECUTION_ROLES } from './model-lanes.mjs'
import { CROSS, LEGACY, SCARCE } from './model-lanes.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'lane-switch.mjs')
let dir
let file

const run = (...args) => {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, LANE_SWITCH_FILE: file, LANE_SWITCH_SET_BY: 'test operator' },
  })
  return { status: result.status ?? -1, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-lane-switch-'))
  file = join(dir, 'nested', 'lane-switch.json')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('lane-switch.mjs', () => {
  it('fails loud when no decision has been recorded for the scarce lane', () => {
    const result = run('--lane', 'scarce', '--status')
    expect(result.status).toBe(1)
    expect(result.out).toContain('state is absent')
    expect(result.out).toContain('lane-switch.mjs --status')
    expect(existsSync(file)).toBe(false)
    // The other lanes are on by default, and the all-lanes status names the unusable one.
    expect(run('--lane', 'cross', '--status')).toMatchObject({ status: 0 })
    const all = run('--status')
    expect(all.status).toBe(1)
    expect(all.out).toContain('lane-switch: scarce UNUSABLE')
    expect(all.out).toContain(`lane-switch: cross (${CROSS.displayName}) ON`)
  })

  it('demands a lane for every flip', () => {
    expect(run('--off', '--why', 'x').status).toBe(2)
    expect(run('--lane', 'nobody', '--status').status).toBe(2)
    expect(existsSync(file)).toBe(false)
  })

  it('requires the reason on every flip', () => {
    expect(run('--lane', 'scarce', '--off').status).toBe(2)
    expect(run('--lane', 'scarce', '--off', '--why', '').status).toBe(1)
    expect(existsSync(file)).toBe(false)
  })

  it('flips off and reports the state, reason, and setter from the same write', () => {
    const result = run('--lane', 'scarce', '--off', '--why', 'not enough volume left')
    expect(result.status).toBe(0)
    expect(result.out).toMatch(/^lane-switch: scarce \(.*\) OFF/)
    expect(result.out).toContain('reason: not enough volume left')
    expect(result.out).toContain('set by test operator')
    expect(JSON.parse(readFileSync(file, 'utf8')).lanes.scarce).toMatchObject({
      state: 'off',
      reason: 'not enough volume left',
      setBy: 'test operator',
    })
    expect(mergerModel(currentLaneState('scarce', { file }))).toBe(CROSS.displayName)
  })

  it('makes the opposite flip visible to a fresh reader in the same run', () => {
    expect(run('--lane', 'scarce', '--on', '--why', 'the user restored capacity').out).toMatch(/^lane-switch: scarce \(.*\) ON/)
    expect(mergerModel(currentLaneState('scarce', { file }))).toBe(SCARCE.displayName)
    expect(run('--status').out).toContain('the user restored capacity')
  })

  it('switches one lane without touching another', () => {
    expect(run('--lane', 'cross', '--off', '--why', 'pause the cross lane').status).toBe(0)
    const lanes = JSON.parse(readFileSync(file, 'utf8')).lanes
    expect(lanes.cross).toMatchObject({ state: 'off', reason: 'pause the cross lane' })
    expect(lanes.scarce).toMatchObject({ state: 'on', reason: 'the user restored capacity' })
    expect(currentLaneState('cross', { file })).toMatchObject({ ok: true, role: 'cross', state: 'off' })
  })

  it('reads the legacy file as the scarce entry while the new file is absent, never rewriting it', () => {
    const legacyDir = join(dir, 'legacy')
    const newFile = join(legacyDir, 'lane-switch.json')
    const legacyFile = join(legacyDir, LEGACY.files.switch)
    mkdirSync(legacyDir, { recursive: true })
    const legacyText = JSON.stringify({ state: 'off', reason: 'old decision', setBy: 'the user', changedAt: 1 })
    writeFileSync(legacyFile, legacyText)
    expect(currentLaneState('scarce', { file: newFile })).toMatchObject({ ok: true, state: 'off', reason: 'old decision' })
    expect(currentLaneState('cross', { file: newFile })).toMatchObject({ ok: true, state: 'on' })
    const flip = spawnSync(process.execPath, [CLI, '--lane', 'cross', '--off', '--why', 'pause'], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, LANE_SWITCH_FILE: newFile, LANE_SWITCH_SET_BY: 'test operator' },
    })
    expect(flip.status).toBe(0)
    expect(readFileSync(legacyFile, 'utf8')).toBe(legacyText)
    expect(JSON.parse(readFileSync(newFile, 'utf8')).lanes.scarce).toMatchObject({ state: 'off', reason: 'old decision' })
  })

  it('refuses a garbled record instead of silently choosing', () => {
    writeFileSync(file, '{broken')
    const result = run('--status')
    expect(result.status).toBe(1)
    expect(result.out).toContain('not valid JSON')
  })
})

// The command index is generated from the usage SOURCE text, so the role lists
// are literal there; these pins keep them equal to the registry.
describe('literal role lists in usage text', () => {
  it('lane-switch names every switch role', () => {
    expect(usage()).toContain(`<${SWITCH_ROLES.join('|')}>`)
  })
  it('ask-lane names every execution role', () => {
    expect(askUsage()).toContain(`--lane ${EXECUTION_ROLES.join('|')}]`)
  })
})
