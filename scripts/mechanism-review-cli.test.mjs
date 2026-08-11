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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { appendRecord, buildRecord, KNOWN_FLAGS, readRecords, usage } from './mechanism-review.mjs'
import { MODES, VERDICTS } from './mechanism-review-core.mjs'

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
    const flags = ['--record', '--model', '--verdict', '--evidence', '--point', '--mode', '--framing', '--list']
    for (const flag of flags) {
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
    // THE ORDER MATTERS (point 573). `not.toContain` is satisfied by the EMPTY
    // output of a script that never started, and so is a non-zero exit — this
    // case would have stayed green with the CLI deleted. What it must establish
    // first is that the tool ran at all, and only git's own complaint about the
    // nonsense sha proves that.
    expect(r.stderr).toMatch(/not-a-commit|ambiguous argument|unknown revision|fatal:/)
    expect(r.status).not.toBe(0)
    expect(r.stderr).not.toContain('unknown flag')
  })
})

// THE FLAG THAT WAS DROPPED (point 540). `--point 298` was handed to a CLI that
// did not know it; nothing warned, and the criticality gate later refused the
// tick for a point whose verdict was in the ledger all along.
describe('a misspelled or abbreviated flag', () => {
  it('is REPORTED with the flag it was meant to be, never silently ignored', () => {
    const r = run('--record', 'HEAD', '--poin', '298')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown flag --poin')
    expect(r.stderr).toContain('did you mean --point')
  })

  it('refuses the --flag=value form rather than reading it as a different flag', () => {
    const r = run('--record', 'HEAD', '--point=298')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--point <value>')
  })

  it('refuses a stray argument, and writes nothing while doing so', () => {
    const r = run('--record', 'HEAD', 'leftover')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('leftover')
    expect(r.stdout.trim()).toBe('')
  })
})

describe('a run that omits a REQUIRED flag', () => {
  // The one path that must read exactly as it always did: the usage block, not
  // a git error from deep inside resolveCommit.
  it('prints the existing usage line unchanged, and never a git error', () => {
    const r = run('--record', 'HEAD', '--model', 'Fable 5')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain(usage())
    expect(r.stderr).toContain('--verdict')
    expect(r.stderr).toContain('--evidence')
    expect(r.stderr).not.toMatch(/ambiguous argument|fatal:/)
  })

  it('answers a missing --record with the usage too, not with a git failure', () => {
    const r = run('--model', 'Fable 5', '--verdict', 'merge', '--evidence', 'a whole honest line here')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain(usage())
    expect(r.stderr).toContain('--record <sha>')
    expect(r.stderr).not.toMatch(/ambiguous argument|fatal:/)
  })
})

// THE FOUR-EYES MODE, END TO END (point 541). buildRecord + appendRecord +
// readRecords are exercised against a TEMP ledger: the round trip is the claim
// (the mode reaches the file and comes back), and the tracked ledger stays
// untouched.
describe('the mode round-trips into the ledger', () => {
  const stub = (over = {}) => ({
    sha: 'b'.repeat(40),
    subject: 'sharpen a guard',
    authoredBy: 'Claude Opus 5 <noreply@anthropic.com>',
    ...over,
  })
  const build = (over = {}) =>
    buildRecord({
      sha: 'b'.repeat(40),
      model: 'Fable 5',
      verdict: 'merge',
      evidence: 'read the core against the spec and ran the pure cases',
      now: 1_700_000_000_000,
      resolve: () => stub(),
      ...over,
    })

  const withLedger = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-review-'))
    try {
      return fn(join(dir, 'ledger.jsonl'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  /** A blind-parallel record also names the third model that folded the two
   *  lists AND carries the count of that union (point 634); a review has neither. */
  const ACCOUNTED =
    // The numbers ADD UP — the receipt is checked, not just shaped: 4 + 3 inputs,
    // each one merged or standing alone, 2 folds plus 3 singles = 5 union entries.
    '4 A + 3 B entries → 5 union entries (4 merged, 2 only A, 1 only B): every input entry accounted for'
  const merged = { mergedBy: 'GPT-5.6 Sol', accounting: ACCOUNTED }
  const forMode = (mode) => (mode === 'blind-parallel' ? { mode, ...merged } : { mode })

  it('writes the mode and reads it back, for both modes', () => {
    for (const mode of MODES) {
      const built = build(forMode(mode))
      expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
      expect(built.record.mode).toBe(mode)
      withLedger((path) => {
        appendRecord(built.record, path)
        const back = readRecords(path)
        expect(back).toHaveLength(1)
        expect(back[0].mode).toBe(mode)
        expect(back[0].verdict).toBe('merge')
      })
    }
  })

  it('carries the same-model fallback framing through with a blind-parallel mode', () => {
    const framing = 'the second run was framed as a maintainer inheriting the code'
    const built = build({ mode: 'blind-parallel', framing, ...merged })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    withLedger((path) => {
      appendRecord(built.record, path)
      expect(readRecords(path)[0].framing).toBe(framing)
    })
  })

  it('carries the MERGING model and the COUNT into the ledger, fallback beside them', () => {
    const built = build({ mode: 'blind-parallel', ...merged })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    withLedger((path) => {
      appendRecord(built.record, path)
      const back = readRecords(path)[0]
      expect(back.mergedBy).toBe('GPT-5.6 Sol')
      expect(back.accounting).toBe(ACCOUNTED)
      expect(back.mergeFallback).toBeUndefined()
    })
    const two = build({
      mode: 'blind-parallel',
      ...merged,
      mergedBy: 'Fable 5',
      mergeFallback: 'GPT-5.6 Sol was unreachable, so only two models were in this session',
    })
    expect(two.ok, (two.errors ?? []).join('\n')).toBe(true)
    expect(two.record.mergeFallback).toMatch(/only two models/)
  })

  it('refuses a blind-parallel record with no merger, no count, or a merger that wrote a list', () => {
    expect(build({ mode: 'blind-parallel' }).ok).toBe(false)
    expect(build({ mode: 'blind-parallel', mergedBy: 'GPT-5.6 Sol' }).ok).toBe(false)
    const own = build({ mode: 'blind-parallel', ...merged, mergedBy: 'Opus 5' })
    expect(own.ok).toBe(false)
    expect(own.errors.join('\n')).toMatch(/may not merge them/i)
  })

  it('COUNTS the union itself when handed the files, instead of believing a line', () => {
    // A typed receipt is a claim; given the three files the recorder measures it
    // (four-eyes review, third round).
    const dir = mkdtempSync(join(tmpdir(), 'hoa-union-'))
    try {
      const w = (name, value) => {
        const path = join(dir, name)
        writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
        return path
      }
      const listA = w('A.json', {
        model: 'Opus 5',
        entries: [
          { id: 'A1', file: 'x.ts', defect: 'the first defect' },
          { id: 'A2', file: 'y.ts', defect: 'the second defect' },
        ],
      })
      const listB = w('B.json', { model: 'GPT-5.6 Sol', entries: [{ id: 'B1', file: 'y.ts', defect: 'the second' }] })
      const union = w('U.json', {
        entries: [
          { id: 'U1', from: ['A1'] },
          { id: 'U2', from: ['A2', 'B1'], defect: 'the second defect, both said it' },
        ],
      })
      const built = build({
        mode: 'blind-parallel',
        mergedBy: 'GPT-5.6 Sol',
        unionPath: union,
        listAPath: listA,
        listBPath: listB,
      })
      expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
      expect(built.record.accounting).toMatch(/^2 A \+ 1 B entries → 2 union entries .*every input entry accounted for$/)
      expect(built.record.accountingSource).toBe('computed')

      // A union that drops an entry cannot be recorded at all.
      const dropped = w('U-bad.json', { entries: [{ id: 'U1', from: ['A1'] }] })
      const bad = build({ mode: 'blind-parallel', mergedBy: 'Fable 5', unionPath: dropped, listAPath: listA, listBPath: listB })
      expect(bad.ok).toBe(false)
      expect(bad.errors.join('\n')).toMatch(/is in NO union entry/)

      // Half the files is a mistake, not a shortcut.
      const half = build({ mode: 'blind-parallel', mergedBy: 'Fable 5', unionPath: union })
      expect(half.ok).toBe(false)
      expect(half.errors.join('\n')).toMatch(/--list-a and --list-b/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marks a typed receipt as stated, so the ledger says which it was', () => {
    expect(build({ mode: 'blind-parallel', ...merged }).record.accountingSource).toBe('stated')
  })

  it('a review record carries no merging model at all', () => {
    expect(build({ mode: 'review' }).record.mergedBy).toBeUndefined()
  })

  it('REFUSES to build a record that names no mode, and says which two there are', () => {
    const built = build({})
    expect(built.ok).toBe(false)
    const text = built.errors.join('\n')
    expect(text).toContain('--mode')
    for (const mode of MODES) expect(text).toContain(mode)
  })

  it('refuses the framing under --mode review as meaningless there', () => {
    const built = build({ mode: 'review', framing: 'framed as a hostile tester' })
    expect(built.ok).toBe(false)
    expect(built.errors.join('\n')).toMatch(/--framing is meaningless under --mode review/)
  })

  it('leaves out the framing key entirely when none was given', () => {
    const built = build({ mode: 'review' })
    expect(built.ok, (built.errors ?? []).join('\n')).toBe(true)
    expect(Object.hasOwn(built.record, 'framing')).toBe(false)
  })

  it('still reads a legacy row that predates the flag', () => {
    withLedger((path) => {
      appendRecord({ sha: 'c'.repeat(40), model: 'Fable 5', verdict: 'merge', evidence: 'older row' }, path)
      const back = readRecords(path)
      expect(back).toHaveLength(1)
      expect(back[0].mode).toBeUndefined()
    })
  })
})

describe('the mode at the command line', () => {
  it('refuses a record without --mode, printing the usage', () => {
    const r = run(
      '--record', 'HEAD',
      '--model', 'Fable 5',
      '--verdict', 'merge',
      '--evidence', 'read the core against the spec and ran the pure cases',
    )
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('--mode')
    expect(r.stderr).toContain(usage())
    expect(r.stdout.trim()).toBe('')
  })

  it('refuses a mode that is neither of the two', () => {
    const r = run(
      '--record', 'HEAD',
      '--model', 'Fable 5',
      '--verdict', 'merge',
      '--evidence', 'read the core against the spec and ran the pure cases',
      '--mode', 'skimmed',
    )
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('skimmed')
    expect(r.stdout.trim()).toBe('')
  })

  it('reports --mdoe as the misspelling it is, rather than dropping it', () => {
    // Point 540 is what makes a mistyped --mode visible instead of silent — the
    // whole reason these two land together.
    const r = run('--record', 'HEAD', '--mdoe', 'review')
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unknown flag --mdoe')
    expect(r.stderr).toContain('did you mean --mode')
  })

  it('documents both modes and the framing in its usage', () => {
    const text = usage()
    expect(text).toContain('--mode')
    expect(text).toContain('--framing')
    for (const mode of MODES) expect(text).toContain(mode)
  })
})
