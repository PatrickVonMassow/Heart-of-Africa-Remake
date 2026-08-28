import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const claude = readFileSync(resolve(process.cwd(), 'CLAUDE.md'), 'utf8')
const audit = readFileSync(resolve(process.cwd(), 'docs/rule-corpus-audit.md'), 'utf8')

function section(text, heading, nextHeading) {
  return text.slice(text.indexOf(heading), text.indexOf(nextHeading))
}

describe('the stated-recommendation authorization', () => {
  it('keeps the grant and every boundary in one CLAUDE.md §6 sentence', () => {
    const workingMethod = section(claude, '## 6. Working Method', '## 7. Acceptance')
    const sentence = workingMethod
      .replace(/\n\s*/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .find((candidate) =>
        candidate.includes('a stated recommendation on a “Von dir zu klären” card'),
      )

    expect(sentence).toBeDefined()
    expect(sentence).toContain('authorizes its decision, execution, and recorded closure')
    expect(sentence).toContain('what, why, veto effect')
    expect(sentence).toContain('tags, publishes, force-pushes, user-data deletions')
    expect(sentence).toContain('unrecommended genuine choices')
  })

  it('records the dated user ruling in the corpus audit', () => {
    const row = audit.split('\n').find((line) => line.startsWith('| A67 | recommendation-is-a-decision |'))

    expect(row).toContain('24.08.2026')
    expect(row).toContain('“Mach es so, wie du es empfohlen hast”')
    expect(row).toContain('“Ja, das sollst du künftig dürfen.”')
    expect(row).toContain('linked from `no-standstill-decide-and-record`')
  })
})
