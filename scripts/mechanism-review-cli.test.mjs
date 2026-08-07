// THE RECORD COMMAND'S OWN SURFACE (point 437 H).
//
// Every unrecognised flag used to fall through to the record path with an empty
// sha, so `--status` — which this tool does not have, but three of its siblings
// do — answered `fatal: ambiguous argument '^{commit}'` from deep inside git
// instead of naming what it wants. Hit while preparing a merge on 31.07.2026.
//
// The spawned cases are all READ-ONLY: `--list` reads the tracked ledger and the
// refusals exit before any write, so this suite can run against the real
// checkout without touching it.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { KNOWN_FLAGS, usage } from './mechanism-review.mjs'
import { VERDICTS } from './mechanism-review-core.mjs'

const SCRIPT = resolve(process.cwd(), 'scripts', 'mechanism-review.mjs')
const run = (...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    cwd: process.cwd(),
    input: '',
  })

describe('the flag surface', () => {
  it('knows every flag its usage documents', () => {
    for (const flag of ['--record', '--model', '--verdict', '--evidence', '--point', '--list']) {
      expect(KNOWN_FLAGS.has(flag), `${flag} must be accepted`).toBe(true)
    }
  })

  it('states the record form, the list form and where --status actually lives', () => {
    const text = usage()
    expect(text).toContain('--record <sha>')
    expect(text).toContain('--list')
    for (const v of VERDICTS) expect(text).toContain(v)
    // The flag that started this: the tool has no --status, and saying so is
    // the difference between a usage block and a git error.
    expect(text).toContain('mechanism-review-guard.mjs --status')
    expect(text).toContain('criticality-review-guard.mjs --status')
  })
})

describe('an unrecognised flag', () => {
  it('prints the usage and exits non-zero — never a git error', () => {
    const r = run('--status')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown flag --status')
    expect(r.stderr).toContain('--record <sha>')
    expect(r.stderr).not.toMatch(/ambiguous argument/)
  })

  it('names every unknown flag at once, not just the first', () => {
    const r = run('--frobnicate', '--wibble')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--frobnicate')
    expect(r.stderr).toContain('--wibble')
  })

  it('writes nothing to stdout — a refusal is not a report', () => {
    expect(run('--status').stdout.trim()).toBe('')
  })
})

describe('the paths that must stay untouched', () => {
  it('--list still lists the ledger', () => {
    const r = run('--list')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })

  it('a bare invocation still lists the ledger', () => {
    const r = run()
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })

  it('a well-formed --record is never mistaken for an unknown flag', () => {
    // The sha is deliberately nonsense, so nothing is ever appended: what is
    // asserted is only that the recognised flags reached the record path.
    const r = run('--record', 'not-a-commit', '--model', 'Fable 5', '--verdict', 'merge', '--evidence', 'x')
    expect(r.status).not.toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })
})
