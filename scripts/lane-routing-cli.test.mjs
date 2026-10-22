// THE SWITCH AS IT IS ACTUALLY RUN — spawned, with its exit code and its file read.
// The core above proves the decisions; this proves the command persists them, prints one
// line for the reader and never wraps around at an end. `LANE_ROUTING_FILE` points it at a
// temp file, so nothing here touches the developer's own setting.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CROSS, LEGACY } from './model-lanes.mjs'

// The older spellings, derived from the registry's LEGACY map rather than written out.
const legacySettingFor = (setting) => Object.keys(LEGACY.routingSettings).find((key) => LEGACY.routingSettings[key] === setting)
const crossName = CROSS.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'lane-routing.mjs')
let dir = ''
let file = ''

/**
 * Run the command; never throws — the exit code is part of what is under test, and BOTH
 * channels are read: the refusals go to stderr and are exactly what a reader must see.
 */
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, LANE_ROUTING_FILE: file }, windowsHide: true })
  return { status: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}
const state = () => JSON.parse(readFileSync(file, 'utf8'))

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-lane-routing-'))
  file = join(dir, 'nested', 'lane-routing.json')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('lane-routing.mjs', () => {
  it('reports the default before anything has ever been set, and writes no file to do it', () => {
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout.split('\n')[0]).toBe(`lane-routing: default — to ${CROSS.displayName}: review, enumerate · to the main chain: diagnose, audit, explain, author`)
    const json = run('--status', '--json')
    expect(json.status).toBe(0)
    expect(JSON.parse(json.stdout).routing.map(({ kind, to }) => ({ kind, to }))).toEqual([
      { kind: 'review', to: 'cross' },
      { kind: 'diagnose', to: 'main' },
      { kind: 'audit', to: 'main' },
      { kind: 'enumerate', to: 'cross' },
      { kind: 'explain', to: 'main' },
      { kind: 'author', to: 'main' },
    ])
    expect(existsSync(file)).toBe(false)
  })

  // The mutation's OWN output is read, not a later --status (audit, 12.08.2026): asserting
  // the file and then asking again would pass even if the command printed one setting and
  // saved another.
  it('steps towards the cross lane, persists it, and says so in the SAME invocation', () => {
    const r = run('--more')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^lane-routing: prefer-cross —/)
    expect(state().setting).toBe('prefer-cross')
    expect(run('--status').stdout).toMatch(new RegExp(`^lane-routing: prefer-cross — to ${crossName}: review, diagnose`))
  })

  it('refuses to wrap past the end, leaving the setting where it was', () => {
    const r = run('--more')
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/already at `prefer-cross` — no setting further towards the cross lane/)
    expect(state().setting).toBe('prefer-cross')
  })

  it('steps back down again, two steps to the escape hatch, printing what it saved', () => {
    expect(run('--less').stdout).toMatch(/^lane-routing: default —/)
    expect(state().setting).toBe('default')
    expect(run('--less').stdout).toMatch(/^lane-routing: main-only —/)
    expect(state().setting).toBe('main-only')
    expect(run('--status').out).toMatch(new RegExp(`to ${crossName}: nothing`))
  })

  it('sets a named setting and answers --json machine-readably', () => {
    expect(run('--set', 'prefer-cross').stdout).toMatch(/^lane-routing: prefer-cross —/)
    const json = JSON.parse(run('--status', '--json').stdout)
    expect(json.setting).toBe('prefer-cross')
    expect(json.routing.find((r) => r.kind === 'diagnose').to).toBe('cross')
    expect(json.file).toBe(file)
  })

  it('refuses a setting that is not one, with usage and a non-zero code', () => {
    const r = run('--set', 'cross-only')
    expect(r.status).toBe(2)
    expect(r.out).toMatch(/not a setting/)
    expect(state().setting).toBe('prefer-cross')
  })

  it('takes no older spelling as a setting to write — writers emit only the new ones', () => {
    const r = run('--set', legacySettingFor('prefer-cross'))
    expect(r.status).toBe(2)
    expect(state().setting).toBe('prefer-cross')
  })

  // Cross-vendor review, 12.08.2026: a broken file used to read as `default`, which
  // sends reviews to the cross lane — so corrupting a `main-only` state started spending the very
  // allowance the operator had moved away from.
  it('DEGRADES to the setting that spends nothing on a broken state file, and says so', () => {
    writeFileSync(file, '{ this is not json')
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^lane-routing: main-only —/)
    expect(r.stdout).toMatch(new RegExp(`to ${crossName}: nothing`))
    expect(r.out).toMatch(/NOTE: .*not JSON/)
  })

  // Audit finding, 12.08.2026: only MALFORMED JSON was covered, so the unreadable-file
  // branch could have been changed back to `default` — resuming cross-lane spending — with the
  // suite still green. A directory is a file that exists and cannot be read.
  it('DEGRADES the same way when the file cannot be read at all', () => {
    rmSync(file, { force: true })
    mkdirSync(file, { recursive: true })
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^lane-routing: main-only —/)
    expect(r.stdout).toMatch(/NOTE: .*could not be read/)
    rmSync(file, { recursive: true, force: true })
  })

  // U9: the older state file is read while the new one is absent, and never rewritten.
  it('reads the OLDER state file while the new one is absent, and writes only the new one', () => {
    const legacy = join(dirname(file), LEGACY.files.routing)
    const old = JSON.stringify({ setting: legacySettingFor('prefer-cross'), changedAt: 1_700_000_000_000, changedBy: 'old' })
    writeFileSync(legacy, old)
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/^lane-routing: prefer-cross —/)
    expect(existsSync(file)).toBe(false)
    expect(run('--less').stdout).toMatch(/^lane-routing: default —/)
    expect(state().setting).toBe('default')
    expect(readFileSync(legacy, 'utf8')).toBe(old)
    // …and once the new file exists it wins over the old one.
    expect(run('--status').stdout).toMatch(/^lane-routing: default —/)
    rmSync(legacy, { force: true })
  })
})

// Fourth cross-vendor round: the fallback LABEL was pinned on the pure functions only, so
// a consumer could stop forwarding it with every test still green. This runs the real
// brief command against a broken state file — the guarantee where a reader meets it.
describe('the delegation brief carries the switch', () => {
  const BRIEF = join(dirname(fileURLToPath(import.meta.url)), 'point-brief.mjs')
  const brief = (share) => {
    const f = join(dir, 'brief-share.json')
    writeFileSync(f, share)
    const r = spawnSync(process.execPath, [BRIEF, '654'], { encoding: 'utf8', env: { ...process.env, LANE_ROUTING_FILE: f }, windowsHide: true })
    return `${r.stdout ?? ''}${r.stderr ?? ''}`
  }

  it('states the routing, and SAYS when that routing is a fallback rather than a choice', () => {
    const chosen = brief(JSON.stringify({ setting: 'main-only' }))
    expect(chosen).toMatch(/LANE ROUTING is at `main-only`/)
    expect(chosen).not.toMatch(/FALLBACK/)
    const fallen = brief('{ not json at all')
    expect(fallen).toMatch(/LANE ROUTING is at `main-only`/)
    expect(fallen).toMatch(/FALLBACK — the share state file is unusable/)
    expect(fallen).toMatch(/share setting is UNUSABLE/)
  })
})

// Audit finding, 12.08.2026: nothing asserted the sentence the consumers print, so they
// could have stopped saying that a routed setting was not the operator's choice.
describe('settingProblemLine', () => {
  it('names the problem and the repair, and says nothing when there is none', async () => {
    const { settingProblemLine } = await import('./lane-routing.mjs')
    const line = settingProblemLine({ setting: 'main-only', problem: 'the state file is not JSON', corrupt: true }, 'cross-review')
    expect(line).toMatch(/^cross-review: the share setting is UNUSABLE — the state file is not JSON/)
    expect(line).toMatch(/lane-routing\.mjs --set/)
    expect(settingProblemLine({ setting: 'default', problem: '' })).toBe('')
    expect(settingProblemLine(null)).toBe('')
  })

  it('names an active outage fallback in --status, and an operator --set keeps it', () => {
    const now = Date.now()
    const fallback = { outage: 'unreachable', signature: 'stream disconnected before completion', kind: 'review', since: now, probeAt: now + 600_000, probes: 1 }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ setting: 'prefer-cross', changedAt: now, changedBy: 'test', fallback }))
    const r = run('--status')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(new RegExp(`^lane-routing: prefer-cross \\(outage FALLBACK until .+\\) — to ${crossName}: nothing`))
    expect(r.stdout).toMatch(new RegExp(`FALLBACK ACTIVE — ${crossName} unreachable`))
    expect(r.stdout).toMatch(/author {5}→ the main chain/)
    expect(run('--set', 'default').status).toBe(0)
    expect(state().fallback).toEqual(fallback)
  })
})
