// The doubled-message rule (point 403), tested where it actually acts: on the
// TEXT a blocking guard hands the model. The model obeys that text, so an
// assertion on the wording is an assertion on the behaviour — a source review
// is not, which is how "write your closing reply again" survived long enough to
// deliver the user the same message at 19:18 and 19:19.
//
// Two layers here:
//  1. the helpers themselves (the demand, the comment stripper, the ratchet);
//  2. the LIVE Stop chain read out of .claude/settings.json — every guard it
//     runs, plus each guard's own `-core` sibling, must be free of any surviving
//     instruction to write the previous answer over again.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  REPEAT_DEMAND_PATTERNS,
  SHORT_ACK_DEMAND,
  findRepeatDemands,
  hookScripts,
  shortAckDemand,
  stripComments,
} from './closing-reply-core.mjs'
import { evaluate } from './timestamp-guard-core.mjs'

const SCRIPTS = resolve(process.cwd(), 'scripts')
const SETTINGS = resolve(process.cwd(), '.claude', 'settings.json')

describe('the demand a blocking guard makes', () => {
  it('asks for a SHORT acknowledgement and hands over the line to copy', () => {
    const demand = shortAckDemand('**Dienstag, 28.07.2026, 19:19**')
    expect(demand).toMatch(/SHORT acknowledgement/)
    expect(demand).toMatch(/one or two sentences/)
    expect(demand.endsWith('**Dienstag, 28.07.2026, 19:19**')).toBe(true)
  })

  it('rules the second copy out explicitly, without asking for anything less', () => {
    // The demand must still be "produce a closing message led by this line" —
    // dropping that would weaken the guard, which the fix must not do.
    expect(SHORT_ACK_DEMAND).toMatch(/never a second copy/i)
    expect(SHORT_ACK_DEMAND).toMatch(/Close the turn/)
    expect(SHORT_ACK_DEMAND).toMatch(/beginning with exactly this line/)
  })

  it('does not trip its own ratchet — a negation is not an instruction', () => {
    expect(findRepeatDemands(shortAckDemand('**x**'))).toEqual([])
  })
})

describe('findRepeatDemands', () => {
  const bad = [
    "reason: 'Write your closing reply again, beginning with this line'",
    "reason: 'Write your closing reply once more, beginning with this line'",
    "reason: 'Now repeat your previous answer with the stamp'",
    "reason: 'Please restate the last reply below'",
    "reason: 'Send the message again.'",
  ]
  for (const source of bad) {
    it(`catches: ${source.slice(9, 48)}…`, () => {
      expect(findRepeatDemands(source).length).toBeGreaterThan(0)
    })
  }

  it('leaves an honest short-acknowledgement demand alone', () => {
    expect(
      findRepeatDemands("reason: 'Close the turn with a SHORT acknowledgement — one line.'"),
    ).toEqual([])
  })

  it('reports the line number and the offending text, not just a boolean', () => {
    const [hit] = findRepeatDemands("const a = 1\nconst r = 'write your reply again now'\n")
    expect(hit.line).toBe(2)
    expect(hit.text).toContain('again')
    expect(REPEAT_DEMAND_PATTERNS.some((p) => p.id === hit.id)).toBe(true)
  })

  it('judges what the guard SAYS, not what its comments explain', () => {
    // The history has to be tellable in prose, or the next reader repeats it.
    const source = '// it used to say: write your closing reply again\nconst ok = true\n'
    expect(findRepeatDemands(source)).toEqual([])
    expect(stripComments(source)).not.toMatch(/again/)
  })

  it('strips block comments too, and keeps the code around them', () => {
    expect(stripComments('/* repeat your reply */ const keep = 1')).toContain('const keep = 1')
    expect(findRepeatDemands('/* repeat your reply */ const keep = 1')).toEqual([])
  })
})

describe('hookScripts', () => {
  it('reads the scripts a hook event runs, in order and without duplicates', () => {
    const settings = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: 'node scripts/a-guard.mjs' },
              { type: 'command', command: 'node scripts/b-guard.mjs --flag' },
              { type: 'command', command: 'node scripts/a-guard.mjs' },
            ],
          },
        ],
        PreToolUse: [{ hooks: [{ command: 'node scripts/c-guard.mjs' }] }],
      },
    }
    expect(hookScripts(settings)).toEqual(['a-guard.mjs', 'b-guard.mjs'])
    expect(hookScripts(settings, 'PreToolUse')).toEqual(['c-guard.mjs'])
  })

  it('returns nothing rather than throwing on a settings file without that event', () => {
    expect(hookScripts(null)).toEqual([])
    expect(hookScripts({ hooks: {} }, 'Stop')).toEqual([])
  })
})

describe('the LIVE Stop chain never asks for the answer a second time', () => {
  const stopScripts = hookScripts(JSON.parse(readFileSync(SETTINGS, 'utf8')))

  it('finds a real Stop chain to audit (a silent empty list would prove nothing)', () => {
    expect(stopScripts.length).toBeGreaterThan(5)
    expect(stopScripts).toContain('timestamp-guard.mjs')
  })

  for (const script of stopScripts) {
    it(`${script} (and its core) demands no repetition`, () => {
      const files = [script, script.replace(/\.mjs$/, '-core.mjs')]
        .map((f) => resolve(SCRIPTS, f))
        .filter((f) => existsSync(f))
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) {
        expect(findRepeatDemands(readFileSync(file, 'utf8')), file).toEqual([])
      }
    })
  }
})

describe('timestamp-guard: every block message it can produce', () => {
  const now = new Date('2026-07-28T17:19:00Z') // Dienstag, 28.07.2026, 19:19
  const messages = [
    ['no reply text at all', evaluate({ lastText: null, now })],
    ['no stamp at the front', evaluate({ lastText: 'Alles erledigt.', now })],
    ['a stale stamp', evaluate({ lastText: '**Dienstag, 28.07.2026, 17:05** Report.', now })],
  ]

  for (const [what, verdict] of messages) {
    it(`on ${what}: still blocks, and still hands over the exact stamp line`, () => {
      expect(verdict?.decision).toBe('block')
      expect(verdict.reason).toContain('**Dienstag, 28.07.2026, 19:19**')
      expect(verdict.reason).toMatch(/Chat-timestamp rule/)
    })

    it(`on ${what}: asks for a short acknowledgement, never for the answer over again`, () => {
      expect(verdict.reason).toContain(SHORT_ACK_DEMAND)
      expect(findRepeatDemands(verdict.reason)).toEqual([])
    })
  }

  it('still allows a correctly stamped reply — the fix changed no verdict', () => {
    expect(evaluate({ lastText: '**Dienstag, 28.07.2026, 19:19** Fertig.', now })).toBe(null)
  })
})
