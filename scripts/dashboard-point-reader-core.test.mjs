import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pointNumbersFromChip, pointOwnershipFromTitle, taskPointNumbers } from './dashboard-point-reader-core.mjs'

const scriptsDir = dirname(fileURLToPath(import.meta.url))

describe('pointOwnershipFromTitle — the one free-title ownership grammar', () => {
  it.each([
    ['bare year', '2026 — Jahresrückblick', [], []],
    ['TASKS-confirmed four-digit point', '2026 — Echter Punkt', [2026], [2026]],
    ['five-digit point', '10000 — Uncapped', [], [10000]],
    ['date', '2026-07-25 — Rückblick', [2026], []],
    ['clock time', '14:54 — Nachtrag', [14], []],
    ['hyphenated count', '1 - 2 Tage Aufwand', [1, 2], []],
    ['plain-hyphen title', '465 - Arbeit', [465], []],
    ['colon point', '313: Arbeit', [], [313]],
    ['compound title', '287+288 — Verbundarbeit', [], [287, 288]],
  ])('%s: %s -> %j', (_shape, title, knownPoints, expected) => {
    expect(pointOwnershipFromTitle(title, { knownPoints }).points).toEqual(expected)
  })

  it('returns the prefix boundary used to derive a label', () => {
    expect(pointOwnershipFromTitle('121, 130 und 146: Familien-Dramen')).toEqual({
      points: [121, 130, 146],
      prefixEnd: 18,
    })
  })

  it('is total on malformed options and input', () => {
    expect(pointOwnershipFromTitle(null)).toEqual({ points: [], prefixEnd: 0 })
    expect(pointOwnershipFromTitle('210 — Titel', null).points).toEqual([210])
  })
})

describe('structured point provenance', () => {
  it('keeps a compound chip uncapped and independent of title ambiguity', () => {
    expect(pointNumbersFromChip('1000·1003/10000')).toEqual([1000, 1003, 10000])
  })

  it('collects DEFERRED checkbox points for the free-title provenance gate', () => {
    expect(taskPointNumbers('- [ ] 2026. Later DEFERRED until release\n- [x] 1003. Done\nprose 999.')).toEqual(
      new Set([2026, 1003]),
    )
  })
})

describe('free-title reader architecture', () => {
  it('keeps numeric title regexes out of every dashboard guard reader', () => {
    const files = readdirSync(scriptsDir).filter(
      (name) => /(?:dashboard|queue-order).*(?:guard|sync)-core\.mjs$/.test(name) && name !== 'dashboard-point-reader-core.mjs',
    )
    const offenders = files.filter((name) => {
      const source = readFileSync(join(scriptsDir, name), 'utf8')
      return (
        /class=["']t["'][^\n]{0,100}\\d/.test(source) ||
        /\b(?:title|titleField|titleNum)\b[^\n]{0,100}\.match\([^\n]{0,100}\\d/.test(source) ||
        /\b(?:POINT_HEAD|leadingPointRun)\b/.test(source)
      )
    })
    expect(offenders).toEqual([])
  })
})
