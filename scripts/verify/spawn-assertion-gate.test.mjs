// THE GATE that keeps "non-zero, therefore it rejected" from coming back
// (point 573 d).
//
// Repairing the one place this was found would only mean waiting for the next
// one, and this defect's dangerous half never announces itself: a false GREEN
// looks exactly like a pass. So the pattern itself is refused, in the FAST layer
// — the same build as the frame-subject gate, not another Stop hook.
//
// The detector is pure in `spawnAssertion.mjs` (with its limits written down
// there); this file pins its behaviour and runs it over every test file in the
// repository.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  caseAt,
  caseRanges,
  establishesRun,
  expectCalls,
  formatSpawnAssertionFindings,
  spawnAssertionFindings,
} from './spawnAssertion.mjs'
import { REPO_ROOT } from '../repo-paths.mjs'

/** The shape, reduced to what the detector must see: a spawn, and a case that
 *  reads its exit code as a verdict without ever establishing a run. */
const BARE = `import { spawnSync } from 'node:child_process'
const run = (...args) => spawnSync('some-tool', args, { encoding: 'utf8' })
it('refuses a bad flag', () => {
  const r = run('--nope')
  expect(r.status).not.toBe(0)
  expect(r.stderr).not.toContain('unexpected')
})
`

describe('an exit code read as a verdict', () => {
  it('is REPORTED, with its line and the case it sits in', () => {
    const found = spawnAssertionFindings(BARE)
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(5)
    expect(found[0].case).toBe('refuses a bad flag')
    expect(found[0].subject).toBe('r.status')
  })

  it('names the defect and BOTH ways to fix it', () => {
    const msg = formatSpawnAssertionFindings(spawnAssertionFindings(BARE), 'x.test.mjs')
    expect(msg).toContain('x.test.mjs')
    expect(msg).toContain('never started')
    expect(msg).toContain('toContain')
    expect(msg).toContain('didRun')
    // The trap worth spelling out, since it is what the caught case had.
    expect(msg).toContain('.not.toContain')
  })

  it('is content once the case asserts something POSITIVE about the output', () => {
    const fixed = BARE.replace("expect(r.stderr).not.toContain('unexpected')", "expect(r.stderr).toContain('unknown flag')")
    expect(spawnAssertionFindings(fixed)).toEqual([])
  })

  it('is content once the case goes through didRun', () => {
    const fixed = BARE.replace('expect(r.status).not.toBe(0)', 'expect(didRun(r)).toBe(true)\n  expect(r.status).not.toBe(0)')
    expect(spawnAssertionFindings(fixed)).toEqual([])
  })

  it('reads every spelling of "it failed"', () => {
    for (const chain of ['.not.toBe(0)', '.not.toEqual(0)', '.not.toStrictEqual(0)', '.toBeGreaterThan(0)', '.toBeTruthy()']) {
      const src = BARE.replace('.not.toBe(0)', chain)
      expect(spawnAssertionFindings(src), chain).toHaveLength(1)
    }
  })

  it('reads the status under its other names, and through a message argument', () => {
    for (const subject of ['r.status', 'r.code', 'r.exitCode', 'code', 'r.status, r.stderr']) {
      const src = BARE.replace('r.status', subject)
      expect(spawnAssertionFindings(src), subject).toHaveLength(1)
    }
  })

  it('leaves a NON-exit assertion alone — this gate is about one sentence only', () => {
    // The noise that would end it: a file full of `expect(x.length).toBeGreaterThan(0)`.
    const src = BARE.replace('expect(r.status).not.toBe(0)', 'expect(r.stdout.length).toBeGreaterThan(0)')
    expect(spawnAssertionFindings(src)).toEqual([])
    expect(spawnAssertionFindings(BARE.replace('r.status', 'codeLines'))).toEqual([])
    expect(spawnAssertionFindings(BARE.replace('r.status', 'found.length'))).toEqual([])
  })

  it('says nothing about a file that spawns NOTHING, whatever it asserts', () => {
    const pure = "it('x', () => { const r = classify('a')\n  expect(r.status).not.toBe(0) })\n"
    expect(spawnAssertionFindings(pure)).toEqual([])
  })

  it('is not fooled by an assertion written in a STRING or a comment', () => {
    const prose = `import { spawnSync } from 'node:child_process'
spawnSync('x')
it('documents the old shape', () => {
  // expect(r.status).not.toBe(0)
  const doc = "expect(r.status).not.toBe(0)"
  expect(doc).toContain('status')
})
`
    expect(spawnAssertionFindings(prose)).toEqual([])
  })

  it('is total on junk rather than throwing inside a gate', () => {
    expect(spawnAssertionFindings(null)).toEqual([])
    expect(spawnAssertionFindings(undefined)).toEqual([])
    expect(spawnAssertionFindings('')).toEqual([])
    expect(formatSpawnAssertionFindings([])).toBe('')
    expect(formatSpawnAssertionFindings(null)).toBe('')
  })
})

describe('the case a finding is attributed to', () => {
  it('is the case the assertion sits in, so a sibling case cannot vouch for it', () => {
    // THE FAILURE MODE OF A FILE-WIDE SEARCH: one case that does it right would
    // silently excuse every other case in the file.
    const twoCases = `import { spawnSync } from 'node:child_process'
const run = (...a) => spawnSync('t', a)
it('good', () => {
  const r = run('--a')
  expect(r.stderr).toContain('unknown flag')
  expect(r.status).not.toBe(0)
})
it('bad', () => {
  const r = run('--b')
  expect(r.status).not.toBe(0)
})
`
    const found = spawnAssertionFindings(twoCases)
    expect(found).toHaveLength(1)
    expect(found[0].case).toBe('bad')
  })

  it('is the OUTER case where cases nest, so establishment is not split away', () => {
    const ranges = caseRanges("it('outer', () => {\n  it('inner', () => {})\n})\n")
    expect(ranges.map((r) => r.name)).toEqual(['outer'])
  })

  it('survives a case declared with a modifier — skipIf, each, concurrent', () => {
    for (const head of ['it.skip', 'it.only', 'it.concurrent', 'test', "it.skipIf(NO_LINTER !== null)"]) {
      const src = BARE.replace(/\bit\(/, `${head}(`)
      expect(spawnAssertionFindings(src), head).toHaveLength(1)
    }
  })

  it('falls back to module level rather than losing an assertion outside any case', () => {
    const loose = "import { spawnSync } from 'node:child_process'\nconst r = spawnSync('t')\nexpect(r.status).not.toBe(0)\n"
    expect(spawnAssertionFindings(loose)[0].case).toBe('(module level)')
    expect(caseAt([], 0)).toBe(null)
  })
})

describe('what counts as establishing the run', () => {
  it('accepts a positive claim about an output channel', () => {
    expect(establishesRun("expect(r.stderr).toContain('x')")).toBe(true)
    expect(establishesRun("expect(r.stdout).toMatch(/x/)")).toBe(true)
    expect(establishesRun("expect(out).toContain('x')")).toBe(true)
  })

  it('REFUSES a negative claim — empty output satisfies it, which IS the defect', () => {
    expect(establishesRun("expect(r.stderr).not.toContain('x')")).toBe(false)
    expect(establishesRun("expect(r.stdout.trim()).toBe('')")).toBe(false)
  })

  it('REFUSES a positive claim about something that is not the process output', () => {
    // A case can assert plenty about its fixtures and still not know whether the
    // process ever started.
    expect(establishesRun("expect(readFileSync(ledger, 'utf8')).toContain('merge')")).toBe(false)
  })

  it('accepts the explicit helpers by name', () => {
    for (const name of ['didRun(r)', 'expectRejected(result, "x")', 'assertRan(r)', 'NOT_RUN("linter", r)']) {
      expect(establishesRun(name), name).toBe(true)
    }
  })

  it('reads an expect() argument over BALANCED parens, not to the next comma', () => {
    // The bug this replaced: a regex argument crossed statements in a codebase
    // written without semicolons and swallowed a whole file.
    const calls = expectCalls("expect(fn(a, (b) => c)).toContain('x')\nexpect(z).not.toBe(0)\n")
    expect(calls).toHaveLength(2)
    expect(calls[0].argument).toBe('fn(a, (b) => c)')
    expect(calls[1].argument).toBe('z')
  })
})

// THE LIVE GATE over the repository, which is the whole reason the detector
// exists. Everything above proves it works; this proves the tree is clean now.
describe('the repository', () => {
  const testFiles = () => {
    const out = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.test\.(mjs|ts|tsx)$/.test(entry.name)) out.push(full)
      }
    }
    walk(join(REPO_ROOT, 'scripts'))
    walk(join(REPO_ROOT, 'src'))
    return out
  }

  it('concludes no rejection from a bare exit code, in any test file', () => {
    const files = testFiles()
    const reports = []
    for (const file of files) {
      const found = spawnAssertionFindings(readFileSync(file, 'utf8'))
      if (found.length > 0) reports.push(formatSpawnAssertionFindings(found, relative(REPO_ROOT, file)))
    }
    expect(reports.join('\n\n'), `\n${reports.join('\n\n')}\n`).toBe('')
    // A gate over nothing would pass forever.
    expect(files.length).toBeGreaterThan(100)
  })

  it('still sees the shape when it is planted in a real file from this tree', () => {
    // The disarmament check: a detector that quietly stopped matching would pass
    // the live gate above every time. So the live corpus is re-run with the
    // defect injected, and it MUST be found.
    const victim = join(REPO_ROOT, 'scripts', 'mechanism-review-cli.test.mjs')
    const planted = `${readFileSync(victim, 'utf8')}
it('a planted false green', () => {
  const r = run('--whatever')
  expect(r.status).not.toBe(0)
})
`
    const found = spawnAssertionFindings(planted)
    expect(found).toHaveLength(1)
    expect(found[0].case).toBe('a planted false green')
  })
})
