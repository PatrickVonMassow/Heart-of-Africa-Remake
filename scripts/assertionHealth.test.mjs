import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { findTautologies, formatTautologies } from './assertionHealth.mjs'

describe('findTautologies', () => {
  it('catches a literal compared with itself', () => {
    // The witness from the degraded-model night.
    expect(findTautologies('expect(true).toBe(true)')).toHaveLength(1)
    expect(findTautologies("expect('a').toEqual('a')")).toHaveLength(1)
    expect(findTautologies('expect(42).toStrictEqual(42)')).toHaveLength(1)
  })

  it('catches a presence check on a literal', () => {
    for (const s of [
      'expect(true).toBeTruthy()',
      'expect(false).toBeFalsy()',
      'expect(1).toBeDefined()',
      'expect([]).toBeDefined()',
    ]) {
      expect(findTautologies(s), s).toHaveLength(1)
    }
  })

  it('catches a bare assert(true)', () => {
    expect(findTautologies('assert(true, "reached")')).toHaveLength(1)
    expect(findTautologies('assert.ok(true)')).toHaveLength(1)
  })

  it('leaves real assertions alone', () => {
    for (const s of [
      'expect(result).toBe(true)',
      'expect(count).toEqual(3)',
      'expect(parseCardTitle(raw).points).toEqual([307])',
      'expect(ok).toBeTruthy()',
      'expect(value).toBeDefined()',
      "expect(a).toBe('b')",
      'expect(2).toBe(3)', // wrong, but it CAN fail — not this detector's business
    ]) {
      expect(findTautologies(s), s).toHaveLength(0)
    }
  })

  it('reports the line so the finding can be opened', () => {
    const hits = findTautologies('a\nb\nexpect(true).toBe(true)\n')
    expect(hits[0].line).toBe(3)
  })

  it('is total on missing input', () => {
    expect(findTautologies(null)).toEqual([])
    expect(findTautologies(undefined)).toEqual([])
  })
})

describe('formatTautologies', () => {
  it('is empty when clean and otherwise says what to do instead', () => {
    expect(formatTautologies({})).toBe('')
    expect(formatTautologies({ 'a.ts': [] })).toBe('')
    const msg = formatTautologies({ 'a.ts': findTautologies('expect(true).toBe(true)') })
    expect(msg).toContain('a.ts:1')
    expect(msg).toMatch(/lösche ihn/)
  })
})

// THE GATE: no test in this repository may assert something that cannot fail.
// Runs in the ordinary unit layer, so every regression enforces it.
describe('the real test suites', () => {
  const root = process.cwd()
  const walk = (dir, out = []) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.test\.(ts|tsx|mjs)$/.test(f)) out.push(p)
    }
    return out
  }

  it('assert nothing that is true by construction', () => {
    const byFile = {}
    for (const f of [...walk(resolve(root, 'src')), ...walk(resolve(root, 'scripts'))]) {
      // This file states the patterns it looks for.
      if (f.endsWith('assertionHealth.test.mjs')) continue
      const hits = findTautologies(readFileSync(f, 'utf8'))
      if (hits.length) byFile[relative(root, f).replace(/\\/g, '/')] = hits
    }
    expect(Object.keys(byFile), `\n${formatTautologies(byFile)}\n`).toEqual([])
  })
})
