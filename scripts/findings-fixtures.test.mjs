// The findings guard, replayed against REAL turns.
//
// findings-core.test.mjs pins the decision on constructed inputs; this file pins it
// on turns that actually happened, cut from the transcript corpus by
// scripts/findings-fixtures.mjs. The distinction matters for a threshold: a hand-made
// case proves the rule is implemented as written, and only the corpus proves the rule
// is TUNED — that it fires on the turns it exists for and stays silent on the ordinary
// ones. A guard that fires on an ordinary turn trains the reader to skip it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { auditFindings, classifyCall, tallyTurn } from './findings-core.mjs'
import { FAMILIES, FIXTURE_PATH, familyOf, redactCommand } from './findings-fixtures.mjs'

const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))

describe('the calibration fixtures are real, whole and usable', () => {
  it('carries turns cut from the corpus, with the corpus size recorded', () => {
    expect(fixtures.turns.length).toBeGreaterThan(5)
    expect(fixtures.corpusTurns).toBeGreaterThan(100)
    expect(typeof fixtures.cutAt).toBe('string')
  })

  it('represents EVERY family — a family with no fixture is the case nobody notices', () => {
    const present = new Set(fixtures.turns.map((t) => t.family))
    for (const family of FAMILIES) expect(present.has(family.id)).toBe(true)
  })

  it('records no turn whose verdict contradicted its family', () => {
    // The cut skips such a turn instead of dying on it, so the skip must be visible
    // here or the tripwire would be a silent one.
    expect(fixtures.contradictions).toEqual([])
  })

  it('keeps the family counts replayable after the corpus grows', () => {
    expect(Object.keys(fixtures.measured.byFamily ?? {}).length).toBeGreaterThan(3)
    expect(fixtures.measured.byFamily['answer-only']).toBeGreaterThan(0)
  })

  it('carries no raw transcript — only the three fields the decision reads', () => {
    for (const turn of fixtures.turns) {
      for (const call of turn.calls) {
        for (const key of Object.keys(call)) expect(['name', 'command', 'filePath']).toContain(key)
      }
    }
  })

  // Names the VALUES, not only the field names (four-eyes finding 5, Fable 5): the
  // first cut passed the field check while committing a Windows username and full
  // session UUIDs, which a check on shapes alone can never see.
  it('carries no home directory, user name or session id', () => {
    const text = JSON.stringify(fixtures.turns)
    expect(text).not.toMatch(/\/(?:home|Users)\/[^/"\\]+/)
    expect(text).not.toMatch(/[A-Za-z]:\\\\Users\\\\/)
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(text).not.toMatch(/gh[pousr]_[A-Za-z0-9]{16,}/)
  })
})

describe('the decision holds on the real turns', () => {
  for (const turn of fixtures.turns) {
    it(`${turn.family} @ ${turn.at} → ${turn.expect}`, () => {
      const verdict = auditFindings({ tally: tallyTurn(turn.calls) })
      expect(verdict.ok).toBe(turn.expect === 'allow')
    })
  }

  it('classifies each fixture into the family it was cut for', () => {
    for (const turn of fixtures.turns) {
      const family = familyOf(turn, tallyTurn(turn.calls))
      expect(family && family.id).toBe(turn.family)
    }
  })
})

describe('the corpus rates the threshold is calibrated on', () => {
  // These are the figures the core header cites. They are re-measurable with
  // `node scripts/findings-fixtures.mjs --measure`; what is pinned here is the
  // SHAPE of the claim, not the exact count, so a re-cut on a grown corpus does not
  // fail the suite while a decision that quietly starts firing everywhere does.
  it('keeps the blocking rate far below the desensitisation threshold', () => {
    expect(fixtures.measured.blocks / fixtures.corpusTurns).toBeLessThan(0.03)
  })

  it('shows the shell classification is what buys that rate', () => {
    expect(fixtures.measured.naiveBlocks).toBeGreaterThan(fixtures.measured.blocks * 2)
  })

  it('shows the declared wait, not a softer trigger, is what carries the delegation turns', () => {
    // The corpus review's worry was that an Agent spawn alone would cost a `--none`
    // per delegation turn. It does not: the exemption absorbs them.
    expect(fixtures.measured.agentExemptByDeclaredWait).toBeGreaterThan(fixtures.measured.agentBlocks)
  })
})

describe('redaction never changes what a command means', () => {
  const cases = [
    'node scripts/finding.mjs --record "x" --detail "a very long detail that runs past the head cut, on and on and on"',
    'git commit -m "a subject long enough to run past the head cut, with a body that keeps going and going"',
    'grep -rn "something" src/ | head -50',
    'node scripts/batch-in-flight.mjs --waiting-on "a branch with a long descriptive name that runs past the cut"',
    'npm run test:unit && git commit -m "green"',
  ]
  for (const command of cases) {
    it(`preserves the classification of: ${command.slice(0, 40)}…`, () => {
      expect(classifyCall({ name: 'Bash', command: redactCommand(command) })).toEqual(
        classifyCall({ name: 'Bash', command }),
      )
    })
  }
})
