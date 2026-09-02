// The BROWSER suites speak utterances too, and theirs are plain string literals
// in a .mjs file that imports nothing from the game. Point 686 shortened every
// word from five syllables to four and those literals stayed behind: because the
// heard store is keyed by the spoken TEXT, `scripts/verify/settings.mjs` and
// `scripts/verify/polish.mjs` kept passing while proving the audio and label
// paths for a shape the game can no longer produce, and covering the shipped one
// nowhere. Nothing failed, which is why it went unnoticed for a whole point.
//
// This pins them from the unit layer, the one place that can read both: every
// utterance-shaped literal in a verification suite must be a word the shipped
// lexicon really beats.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONCEPT_IDS, utteranceOf } from './lexicon'

const SUITE_DIR = join(process.cwd(), 'scripts', 'verify')

/** `'ba-BA-ba-BA'` and nothing else: two or more ba/BA syllables, quoted.
 *
 *  ALL THREE QUOTE FORMS, because the point is to catch a literal that drifted
 *  out of the lexicon and a suite may write one any way JavaScript allows: a
 *  single-quote-only pattern let a double-quoted or templated utterance through
 *  unseen, which is precisely the silent pass this file exists to prevent
 *  (cross-vendor review, 29.08.2026). */
const UTTERANCE_LITERAL = /['"`]((?:ba|BA)(?:-(?:ba|BA))+)['"`]/g

/** The same source with its comments blanked out.
 *
 *  A commented-out utterance is not one the suite SPEAKS. Left in, a stale
 *  literal parked in a comment fails the stray sweep for no reason, and — worse —
 *  a lexicon nobody exercises any more can still satisfy "the suites must speak
 *  at all" from inside a comment. Replacing each comment with spaces of the same
 *  length keeps every offset intact for anything that later wants them. */
function withoutComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)))
}

function suiteFiles(): string[] {
  return readdirSync(SUITE_DIR).filter((f) => f.endsWith('.mjs')).sort()
}

describe('the verification suites speak the shipped lexicon', () => {
  const spoken = new Set(CONCEPT_IDS.map((c) => utteranceOf(c)))

  it('finds the suites at all — an empty sweep would pin nothing', () => {
    expect(suiteFiles().length).toBeGreaterThan(10)
  })

  it('uses no utterance a village could never say', () => {
    const strays: string[] = []
    for (const file of suiteFiles()) {
      const source = withoutComments(readFileSync(join(SUITE_DIR, file), 'utf8'))
      for (const [, utterance] of source.matchAll(UTTERANCE_LITERAL)) {
        if (!spoken.has(utterance)) strays.push(`${file}: ${utterance}`)
      }
    }
    expect(strays).toEqual([])
  })

  it('covers the shipped shape somewhere — the suites must speak at all', () => {
    const found = new Set<string>()
    for (const file of suiteFiles()) {
      const source = withoutComments(readFileSync(join(SUITE_DIR, file), 'utf8'))
      for (const [, utterance] of source.matchAll(UTTERANCE_LITERAL)) found.add(utterance)
    }
    expect(found.size).toBeGreaterThan(0)
    for (const utterance of found) expect(spoken.has(utterance), utterance).toBe(true)
  })
})
