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
    const { text } = formatAskMaterial({ sections: [{ title: 'LOG: a', text: 'x'.repeat(5000) }], budget: 1000 })
    expect(text).toContain('=== LOG: a ===')
    expect(text).toMatch(/TRUNCATED: \d+ characters not shown/)
    expect(text.length).toBeLessThan(1400)
  })

  it('says which section fell out entirely rather than dropping it silently', () => {
    const { text, carried, omitted } = formatAskMaterial({
      sections: [
        { title: 'FIRST', text: 'y'.repeat(900) },
        { title: 'SECOND', text: 'z'.repeat(900) },
      ],
      budget: 1250,
    })
    expect(text).toContain('OMITTED ENTIRELY (material budget spent): SECOND')
    expect(carried).toEqual(['FIRST'])
    expect(omitted).toEqual(['SECOND'])
  })

  // Fourth cross-vendor round: charging the markers made the budget honest, but the
  // sections beyond THEM then vanished in silence — and a model that cannot see that
  // something is missing answers as if nothing were.
  it('COUNTS what did not even fit a marker — the real number, not just a number', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ title: `FILE: ${'p'.repeat(80)}/${i}.ts`, text: 'q'.repeat(300) }))
    const { text, carried, omitted } = formatAskMaterial({ sections: many, budget: 1200 })
    const written = (text.match(/OMITTED ENTIRELY \(material budget spent\)/g) ?? []).length
    const counted = Number(/… \[(\d+) further section\(s\) omitted entirely/.exec(text)?.[1] ?? -1)
    // The closing line accounts for exactly what neither travelled nor got a marker.
    expect(counted).toBe(many.length - carried.length - written)
    expect(counted).toBeGreaterThan(0)
    expect(carried.length + omitted.length).toBe(many.length)
    expect(text.length).toBeLessThanOrEqual(1200)
  })

  // Fifth cross-vendor round: the closing line was pushed unconditionally, so a budget
  // smaller than that one line returned a non-empty string — the cap must win.
  it('writes NOTHING at a budget too small even for its closing line', () => {
    const { text, omitted } = formatAskMaterial({ sections: [{ title: 'FIRST', text: 'x'.repeat(50) }], budget: 0 })
    expect(text).toBe('')
    expect(omitted).toEqual(['FIRST'])
  })

  // Second cross-vendor round: the caller decides whether a request carries any real
  // artefact, and it cannot decide that from the sections it HANDED IN — a readable but
  // empty file and a section the budget dropped both carry nothing.
  it('counts an EMPTY section as carrying nothing, however readable it was', () => {
    const { carried, omitted } = formatAskMaterial({ sections: [{ title: 'FILE: empty.ts', text: '   \n' }], budget: 1000 })
    expect(carried).toEqual([])
    expect(omitted).toEqual(['FILE: empty.ts'])
  })

  // Final round: `carried` judged the SOURCE, not the slice that travelled — a file whose
  // first characters are blank goes out as a header, whitespace and a truncation marker,
  // which is nothing to answer about.
  it('counts what TRAVELLED, not what was held: a blank prefix carries nothing', () => {
    const { carried, omitted, text } = formatAskMaterial({
      sections: [{ title: 'FILE: late.ts', text: `${' '.repeat(2000)}the real content is far past the cut` }],
      budget: 800,
    })
    expect(text).toMatch(/TRUNCATED/)
    expect(carried).toEqual([])
    expect(omitted).toEqual(['FILE: late.ts'])
  })

  // Third cross-vendor round: the omission markers were free, so enough of them — or long
  // enough titles — pushed the SENT request past the ceiling it advertises.
  it('never exceeds its budget, however many sections it has to omit', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ title: `FILE: ${'p'.repeat(60)}/${i}.ts`, text: 'q'.repeat(400) }))
    const { text, carried, omitted } = formatAskMaterial({ sections: many, budget: 2000 })
    expect(text.length).toBeLessThanOrEqual(2000)
    // What did not travel is still REPORTED, so the caller can name it without sending it.
    expect(carried.length + omitted.length).toBe(many.length)
    expect(omitted.length).toBeGreaterThan(300)
  })

  it('is empty for nothing at all, which is what the command refuses to send', () => {
    expect(formatAskMaterial({ sections: [] }).text.trim()).toBe('')
  })
})

describe('the markdown strip reads shapes, not characters (round-7 pass 1)', () => {
  it('keeps an underscore inside a path — content is not decoration', () => {
    const parsed = parseAnswer({
      kind: 'diagnose',
      text: 'reasoning\n\nCAUSE: the fixture writes early\nEVIDENCE: src/foo_bar.mjs:12 writes outside the shutter',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.evidence).toContain('src/foo_bar.mjs')
  })

  it('a mid-word marker CAN admit through the net-only spelling — the deliberate fail-closed cost', () => {
    // Final round, pass 1: mixed nesting defeated both the raw scan and the
    // pair strip, so the admission net gained a third spelling with every
    // marker deleted outright. That spelling fabricates 'no material' out of
    // 'no ma*terial' — a REFUSED round (work handed on), never a cleared one,
    // which is the direction the net may err in.
    const parsed = parseAnswer({
      kind: 'explain',
      text: 'The token no ma*terial appears verbatim in the fixture and is asserted by the failing case there.',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('could not see the material')
  })

  it('keeps an UNMATCHED word-edge marker in QUOTED output — a lone marker is content (round 8)', () => {
    // `src/foo_.mjs` names a file: quoting and matching never mangle it. (The
    // ADMISSION net's net-only spelling is the one deliberate exception — see
    // the fail-closed case above.)
    const parsed = parseAnswer({
      kind: 'diagnose',
      text: 'reasoning\n\nCAUSE: the underscore is load-bearing\nEVIDENCE: src/foo_.mjs:3 exports the checked symbol',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.evidence).toContain('src/foo_.mjs')
  })

  it('still UNSHIELDS an emphasised admission at word edges', () => {
    const parsed = parseAnswer({
      kind: 'explain',
      text: 'I checked nothing because **no** material was supplied to this run at all, sadly.',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('could not see the material')
  })

  it('unshields NESTED emphasis too — the pair rule iterates to its fixpoint (closing round)', () => {
    const parsed = parseAnswer({
      kind: 'explain',
      text: 'I read *no **material*** from this range because none arrived with the request at all.',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('could not see the material')
  })

  it('admits on EITHER the raw or the stripped scan — no shape can shield both (final convergence)', () => {
    // Every shape that defeated the stripped scan alone in an earlier round,
    // plus the plain phrase: the double scan must catch each one.
    for (const text of [
      // plain, no decoration at all — the raw scan's own bread and butter
      'I could not read the material for this range, so nothing here was judged by me.',
      // flat emphasis (round 7)
      'I checked nothing because **no** material was supplied to this run at all, sadly.',
      // nested emphasis (round 8)
      'I read *no **material*** from this range because none arrived with the request at all.',
      // quote-adjacent emphasis (round 9 — the shape the enumerated boundary missed)
      'It ended early: "**no** material was supplied" is the whole story of this run, regrettably.',
      // MIXED nesting (final round, pass 1): opening **_ never equals closing _**,
      // so the pair strip keeps it and the raw word boundary is broken — only
      // the net-only spelling sees it.
      'I checked **_no_** material from this range because none arrived with the request, sadly.',
    ]) {
      const parsed = parseAnswer({ kind: 'explain', text })
      expect(parsed.ok, text).toBe(false)
      expect(parsed.error).toContain('could not see the material')
    }
  })

  it('quotes fields from the RAW text — src/__init__.py reaches the caller byte-exact', () => {
    // The finding that closed the loop: the stripped copy rewrote matched
    // word-edge pairs, so diagnose evidence cited src/init.py for a file
    // named src/__init__.py. Matching runs on the stripped line; the VALUE
    // is cut from the raw one.
    const parsed = parseAnswer({
      kind: 'diagnose',
      text: 'reasoning\n\nCAUSE: the __init__ module writes early\nEVIDENCE: src/__init__.py:3 writes the frame outside the shutter',
    })
    expect(parsed.ok).toBe(true)
    // BYTE-IDENTICAL to the raw input, not merely containing the token.
    expect(parsed.answer.cause).toBe('the __init__ module writes early')
    expect(parsed.answer.evidence).toBe('src/__init__.py:3 writes the frame outside the shutter')
  })

  it('rules the diagnose placeholder on the STRIPPED capture — decoration cannot smuggle it', () => {
    const parsed = parseAnswer({
      kind: 'diagnose',
      text: 'reasoning\n\nCAUSE: **<the one cause, named>**\nEVIDENCE: **<the lines in the material>**',
    })
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('placeholders')
  })

  it('still recognises a DECORATED label — the stripped line matches, the raw line is quoted', () => {
    const parsed = parseAnswer({
      kind: 'diagnose',
      text: 'reasoning\n\n**CAUSE:** the fixture writes early\n**EVIDENCE:** src/__init__.py:9 exports the checked symbol',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.cause).toBe('the fixture writes early')
    expect(parsed.answer.evidence).toContain('src/__init__.py:9')
  })

  it('carries a list entry’s file and finding byte-for-byte from the raw line', () => {
    const parsed = parseAnswer({
      kind: 'audit',
      text: 'sweep done\n\nA1 | src/__init__.py | the __slots__ list drops the flag field entirely',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.entries).toEqual([
      { id: 'A1', file: 'src/__init__.py', text: 'the __slots__ list drops the flag field entirely' },
    ])
  })

  it('an ENUMERATE entry quotes raw too — every list kind obeys the one rule', () => {
    const parsed = parseAnswer({
      kind: 'enumerate',
      text: 'my own list\n\nB1 | src/__init__.py | the __all__ export omits the loader symbol',
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.entries).toEqual([
      { id: 'B1', file: 'src/__init__.py', text: 'the __all__ export omits the loader symbol' },
    ])
  })

  it('an EXPLAIN answer is the raw text byte-for-byte, never the stripped copy', () => {
    // WITH boundary whitespace: a fidelity test whose input cannot expose the
    // loss is not a test — the old .trim() ate exactly these bytes.
    const text =
      '\n  The module src/__init__.py wires the loader: it re-exports __all__ from the package and keeps the flag literal.\n\n'
    const parsed = parseAnswer({ kind: 'explain', text })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.text).toBe(text)
    expect(parsed.summary).toContain('src/__init__.py')
  })

  it('rules entry PRESENCE on the stripped captures — decoration-only fields are empty fields', () => {
    // 'A1 | a.mjs | ```' strips to an empty finding: refused, not accepted.
    const noFinding = parseAnswer({ kind: 'audit', text: 'sweep\n\nA1 | a.mjs | ```' })
    expect(noFinding.ok).toBe(false)
    expect(noFinding.error).toContain('carries no finding')
    // A decoration-only FILE field is an unnamed file, never a quoted marker.
    const noFile = parseAnswer({ kind: 'audit', text: 'sweep\n\nA1 | ``` | the loader drops the flag field' })
    expect(noFile.ok).toBe(true)
    expect(noFile.answer.entries[0].file).toBe('(unspecified)')
    // …and the NO-FINDINGS explanation obeys the same rule (landing round):
    // an unpaired marker survives the pair strip, so `NO FINDINGS: _` read as
    // an explained clean audit while naming nothing checked.
    const bare = parseAnswer({ kind: 'audit', text: 'sweep\n\nNO FINDINGS: _' })
    expect(bare.ok).toBe(false)
    const explained = parseAnswer({ kind: 'audit', text: 'sweep\n\nNO FINDINGS: checked the loader end to end' })
    expect(explained.ok).toBe(true)
    // …and the PROMPT'S OWN TEMPLATE names nothing checked (fourth landing
    // round): the echoed placeholder is not an explanation.
    expect(parseAnswer({ kind: 'audit', text: 'sweep\n\nNO FINDINGS: <what you checked>' }).ok).toBe(false)
  })

  it('refuses marker-only and marker-shielded DIAGNOSE fields (fourth landing round)', () => {
    expect(parseAnswer({ kind: 'diagnose', text: 'looked.\n\nCAUSE: _\nEVIDENCE: __________' }).ok).toBe(false)
    expect(
      parseAnswer({ kind: 'diagnose', text: 'looked.\n\nCAUSE: _<the one cause>\nEVIDENCE: _<the two lines that prove it>' }).ok,
    ).toBe(false)
    expect(
      parseAnswer({ kind: 'diagnose', text: 'looked.\n\nCAUSE: the poller drops the lock\nEVIDENCE: the stamp is written before the rename lands' }).ok,
    ).toBe(true)
  })

  it('does not admit a genuine review that merely SPEAKS the net’s vocabulary, raw or stripped', () => {
    const parsed = parseAnswer({
      kind: 'explain',
      text: 'Checked the **splitter** against quoted paths; the patch was not supplied in the failing fixture, which is the defect.',
    })
    expect(parsed.ok).toBe(true)
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

  // Final cross-vendor round: blind-merge settles every entry BY ITS ID, so a repeated id
  // merges two findings into one ledger line — the disappearance the counting exists to
  // prevent. And an entry with no finding in it is not an entry.
  it('refuses a duplicated id and an empty entry, naming which', () => {
    const dup = parseAnswer({ kind: 'enumerate', text: 'B1 | a.mjs | the lease is not renewed\nB1 | b.mjs | the fence is off' })
    expect(dup.ok).toBe(false)
    expect(dup.error).toMatch(/B1 is used twice/)
    const empty = parseAnswer({ kind: 'audit', text: 'A1 | a.mjs | a real finding\nA2 | b.mjs |   ' })
    expect(empty.ok).toBe(false)
    expect(empty.error).toMatch(/A2 carries no finding/)
  })

  it('keeps a finding that names no file, marked rather than dropped', () => {
    const parsed = parseAnswer({ kind: 'audit', text: 'A1 |  | the two guards disagree about who owns the lock' })
    expect(parsed.ok).toBe(true)
    expect(parsed.answer.entries[0].file).toBe('(unspecified)')
  })

  // Same round: a sweep may honestly find nothing, and refusing that reported a CLEAN
  // audit as "Sol did not answer" after the allowance had already been spent.
  it('accepts an audit that found nothing, but only when it SAYS so', () => {
    const clean = parseAnswer({ kind: 'audit', text: 'I read every line of both files.\n\nNO FINDINGS: the switch table, the fallback and the three consumers' })
    expect(clean.ok).toBe(true)
    expect(clean.answer.entries).toEqual([])
    expect(clean.summary).toBe('no findings')
    // Silence is still no answer, and an ENUMERATION with nothing in it is no half.
    expect(parseAnswer({ kind: 'audit', text: 'I looked at it and it seems fine to me.' }).ok).toBe(false)
    expect(parseAnswer({ kind: 'enumerate', text: 'NO FINDINGS: nothing could go wrong here' }).ok).toBe(false)
  })

  // Final round: an answer that lists findings AND claims there are none says two things,
  // and whichever half the caller acts on, it acted on half an answer.
  it('refuses an answer that both lists findings and claims there are none', () => {
    const both = parseAnswer({ kind: 'audit', text: 'A1 | a.mjs | the lease is not renewed\n\nNO FINDINGS: everything else looked fine' })
    expect(both.ok).toBe(false)
    expect(both.error).toMatch(/says two things/)
    // …and a BARE marker is the same contradiction: the claim is what contradicts, not
    // its explanation, which the acceptance path still demands (last round).
    const bare = parseAnswer({ kind: 'audit', text: 'A1 | a.mjs | the lease is not renewed\nNO FINDINGS:' })
    expect(bare.ok).toBe(false)
    expect(bare.error).toMatch(/says two things/)
    expect(parseAnswer({ kind: 'audit', text: 'NO FINDINGS:' }).ok).toBe(false)
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
