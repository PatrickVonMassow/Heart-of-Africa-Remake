// AN ANSWER NOBODY GAVE MUST NEVER BE REPORTED AS AN ANSWER (point 654) — the review
// path's rule, carried over to the other read-only kinds. The specific ways this one
// could lie, each pinned below:
//   - an answer without its shape read as an answer, so a caller acts on nothing;
//   - a model that says it could not see the material counted as having looked;
//   - the placeholders of the answer shape echoed back and taken for content;
//   - material silently cut, so the model diagnoses the half it saw;
//   - an ENUMERATE half that cannot enter the blind-merge accounting for want of ids.
import { describe, it, expect } from 'vitest'
import {
  ANSWER_SHAPES,
  KINDS,
  KIND_TASKS,
  buildAskPrompt,
  entryPrefix,
  formatAnswerReport,
  formatAskMaterial,
  formatUnavailable,
  normaliseKind,
  parseAnswer,
} from './ask-sol-core.mjs'

describe('the kinds', () => {
  it('are the four read-only ones, each with a task and an answer shape', () => {
    expect(KINDS).toEqual(['diagnose', 'audit', 'enumerate', 'explain'])
    for (const kind of KINDS) {
      expect(KIND_TASKS[kind]).toBeTruthy()
      expect(ANSWER_SHAPES[kind]).toBeDefined()
    }
    expect(normaliseKind(' Diagnose ')).toBe('diagnose')
    expect(normaliseKind('author')).toBeNull()
  })

  it('numbers an audit A and an enumeration B — the ids blind-merge counts', () => {
    expect(entryPrefix('audit')).toBe('A')
    expect(entryPrefix('enumerate')).toBe('B')
    expect(entryPrefix('explain')).toBe('')
  })
})

describe('the prompt', () => {
  it('states the task, the question and that the material is ATTACHED, never fetched', () => {
    const p = buildAskPrompt({ kind: 'diagnose', brief: 'why did the place suite go red?' })
    expect(p).toContain(KIND_TASKS.diagnose)
    expect(p).toContain('why did the place suite go red?')
    expect(p).toMatch(/ATTACHED/)
    expect(p).toMatch(/cannot create user namespaces/)
    expect(p).toMatch(/TRUNCATED/)
    expect(p).toMatch(/CAUSE:/)
    expect(p).toMatch(/EVIDENCE:/)
  })

  it('tells an ENUMERATE it is a divergent half that a third model will merge by id', () => {
    const p = buildAskPrompt({ kind: 'enumerate', brief: 'what could go wrong here?' })
    expect(p).toMatch(/DIVERGENT/)
    expect(p).toMatch(/your OWN complete list/)
    expect(p).toMatch(/B<n> \| <file>/)
    expect(p).toMatch(/without one\s*\n?\s*cannot be counted/)
  })

  it('says that nothing is authored, and refuses a kind that is not one', () => {
    expect(buildAskPrompt({ kind: 'explain', brief: 'x' })).toMatch(/You author nothing here/)
    expect(() => buildAskPrompt({ kind: 'author', brief: 'x' })).toThrow()
  })

  it('names a missing question rather than inventing one', () => {
    expect(buildAskPrompt({ kind: 'audit', brief: '' })).toMatch(/none given/)
  })
})

describe('the material', () => {
  it('keeps every section under the budget and CUTS VISIBLY', () => {
    const out = formatAskMaterial({ sections: [{ title: 'LOG: a', text: 'x'.repeat(5000) }], budget: 1000 })
    expect(out).toContain('=== LOG: a ===')
    expect(out).toMatch(/TRUNCATED: \d+ characters not shown/)
    expect(out.length).toBeLessThan(1400)
  })

  it('says which section fell out entirely rather than dropping it silently', () => {
    const out = formatAskMaterial({
      sections: [
        { title: 'FIRST', text: 'y'.repeat(900) },
        { title: 'SECOND', text: 'z'.repeat(900) },
      ],
      budget: 1000,
    })
    expect(out).toContain('OMITTED ENTIRELY (material budget spent): SECOND')
  })

  it('is empty for nothing at all, which is what the command refuses to send', () => {
    expect(formatAskMaterial({ sections: [] }).trim()).toBe('')
  })
})

describe('reading the answer', () => {
  const end = (...lines) => `some reasoning here\n\n${lines.join('\n')}`

  it('takes a DIAGNOSE from the two closing lines', () => {
    const parsed = parseAnswer({ kind: 'diagnose', text: end('CAUSE: the fixture writes the frame before the shutter', 'EVIDENCE: scripts/verify/place.mjs:212 writes outside frameSubject') })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.cause).toMatch(/before the shutter/)
    expect(parsed.summary).toBe(parsed.answer.cause)
  })

  it('refuses a DIAGNOSE without its pair, and the placeholders echoed back', () => {
    expect(parseAnswer({ kind: 'diagnose', text: 'it is probably the timing' }).ok).toBe(false)
    expect(parseAnswer({ kind: 'diagnose', text: end('CAUSE: <the one cause, named>', 'EVIDENCE: <the lines>') }).ok).toBe(false)
    expect(parseAnswer({ kind: 'diagnose', text: end('CAUSE: x', 'EVIDENCE: short') }).ok).toBe(false)
  })

  it('reads the numbered entries of an AUDIT and an ENUMERATE, markdown and bullets included', () => {
    const audit = parseAnswer({ kind: 'audit', text: '- **A1** | src/a.ts | the ribbon tears at the delta\nA2 | src/b.ts | the badge overlaps the date' })
    expect(audit.ok).toBe(true)
    expect(audit.answer.entries).toHaveLength(2)
    expect(audit.answer.entries[0]).toMatchObject({ id: 'A1', file: 'src/a.ts' })
    expect(audit.summary).toBe('2 entries')
    const list = parseAnswer({ kind: 'enumerate', text: 'B1 | scripts/x.mjs | the lock is not renewed while a suite runs' })
    expect(list.answer.entries[0].id).toBe('B1')
    expect(list.summary).toBe('1 entry')
  })

  it('refuses a list that carries no id — it could not be counted in a merge', () => {
    expect(parseAnswer({ kind: 'enumerate', text: '- the lock is not renewed\n- the fence is off' }).ok).toBe(false)
    expect(parseAnswer({ kind: 'audit', text: 'B1 | x | wrong prefix for an audit' }).ok).toBe(false)
  })

  it('takes an EXPLAIN as prose, but not two words of it', () => {
    expect(parseAnswer({ kind: 'explain', text: 'The board core renders the cards; board-publish pushes the bytes to the orphan branch.' }).ok).toBe(true)
    expect(parseAnswer({ kind: 'explain', text: 'It renders.' }).ok).toBe(false)
  })

  it('refuses ANY answer that says the model could not see the material', () => {
    for (const kind of KINDS) {
      const parsed = parseAnswer({ kind, text: 'none of my commands reached the repository, so I could not inspect the change' })
      expect(parsed.ok).toBe(false)
      expect(parsed.error).toMatch(/could not see/)
    }
  })

  it('refuses an empty run, and a kind that is not one', () => {
    expect(parseAnswer({ kind: 'diagnose', text: '' }).error).toMatch(/no answer at all/)
    expect(() => parseAnswer({ kind: 'author', text: 'x' })).toThrow()
  })
})

describe('what the command says', () => {
  it('names the cause in ONE line and hands the work back — never records it as Sol’s', () => {
    const out = formatUnavailable({ kind: 'diagnose', cause: 'the ChatGPT allowance for this account is exhausted' })
    expect(out.split('\n')[0]).toMatch(/did NOT answer this diagnose: the ChatGPT allowance/)
    expect(out).toMatch(/Do it in the Claude chain/)
    expect(out).not.toMatch(/sol-share\.mjs --more/)
  })

  it('names the switch where the switch is what stopped it', () => {
    expect(formatUnavailable({ kind: 'audit', cause: 'x', setting: 'claude-only' })).toMatch(/sol-share\.mjs --more/)
  })

  it('prints a diagnosis as its pair and a list as its entries', () => {
    const diag = formatAnswerReport({ kind: 'diagnose', parsed: { summary: 'the shutter', answer: { cause: 'the shutter', evidence: 'line 212' } }, elapsedMs: 42_000 })
    expect(diag).toMatch(/answered the diagnose in 42s/)
    expect(diag).toMatch(/CAUSE:\s+the shutter/)
    const list = formatAnswerReport({ kind: 'enumerate', parsed: { summary: '1 entry', answer: { entries: [{ id: 'B1', file: 'x.mjs', text: 'the lock' }] } } })
    expect(list).toMatch(/B1 \| x\.mjs \| the lock/)
  })
})
