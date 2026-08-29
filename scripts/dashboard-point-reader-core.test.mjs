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
    ['comma count', '1, 2 Tage Aufwand', [1, 2], []],
    ['word-joined count', '1 und 2 Tage Aufwand', [1, 2], []],
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

  it('attributes a suffixed sub-delivery chip to its base point', () => {
    expect(pointNumbersFromChip('203A')).toEqual([203])
    expect(pointNumbersFromChip('CI')).toEqual([])
  })

  it('collects DEFERRED checkbox points for the free-title provenance gate', () => {
    expect(taskPointNumbers('- [ ] 2026. Later DEFERRED until release\n- [x] 1003. Done\nprose 999.')).toEqual(
      new Set([2026, 1003]),
    )
  })
})

describe('free-title reader architecture', () => {
  it('routes every title-aware core through the shared reader unless it only classifies state', () => {
    const coreFiles = readdirSync(scriptsDir).filter((name) => name.endsWith('-core.mjs'))
    const titleAwareFiles = coreFiles.filter((name) => /class=["']t["']/.test(readFileSync(join(scriptsDir, name), 'utf8')))

    // Non-vacuity is part of the contract: a moved directory or narrowed glob
    // must fail instead of congratulating an empty scan.
    expect(coreFiles.length).toBeGreaterThan(40)
    expect(titleAwareFiles.length).toBeGreaterThan(7)
    expect(titleAwareFiles).toEqual(expect.arrayContaining(['board-core.mjs', 'board-queue-core.mjs']))

    // board-structure reads title TEXT solely to classify named state cards; it
    // never derives point ownership. Every ownership-capable title reader must
    // name the shared module, regardless of regex spelling or local variable.
    const nonOwnershipReaders = new Set(['board-structure-core.mjs'])
    const offenders = titleAwareFiles.filter((name) => {
      if (nonOwnershipReaders.has(name)) return false
      const source = readFileSync(join(scriptsDir, name), 'utf8')
      return !source.includes("from './dashboard-point-reader-core.mjs'")
    })
    expect(offenders).toEqual([])
  })
})
