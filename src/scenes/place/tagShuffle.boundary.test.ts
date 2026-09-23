// THE DELETION`S OWN BOUNDARY (work-order 1094, split out of `tagShuffle.test.ts`
// under work-order 1178). It reads SOURCE rather than replaying a settlement, so
// it costs nothing and needs none of the harness — which is why it is the first
// case to move out of the file it was slowing down.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// THE DELETION'S OWN BOUNDARY (work-order 1094). The teaching checks in this
// file give their VILLAGE spread up for a SEED spread in `ROCK_VILLAGE_ID`: the
// communication slice runs in that one settlement, while the world seed is drawn
// at every start, so the seed is the axis that really varies for the player and
// the village is not. What must NOT travel with that deletion is the statement a
// foreign village IS. `riverBank.test.ts` asserts that a village away from every
// river grows no bank, and it can only say so by NAMING such a village; a later
// sweep that replaced every foreign id in the tree would empty that assertion
// while leaving it green. So the boundary is pinned rather than remembered.
describe('the seed spread stops where a foreign village IS the statement (work-order 1094)', () => {
  // COMMENTED OUT IS DELETED, as far as this boundary is concerned
  // (cross-vendor findings, GPT-6 Astra, 20.09.2026). Matching the raw source
  // accepted `// expect(withBank)…` — the three assertions would still read as
  // present while nothing ran them, which is exactly the silent emptying this
  // check exists to catch. The stripping runs over the WHOLE file BEFORE the
  // case is located, because the second gap was the case itself wrapped in a
  // block comment: cutting the body out first threw the `/*` away and handed
  // the stripper a body that looked like live code. With the whole file
  // stripped, a commented-out case simply has no name left to find.
  const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  /** Every runner switch in `text` that would keep a case from running. The
   *  modifier chain is matched WHOLE — `describe.sequential.skip` is as much a
   *  skip as `describe.skip` (fourth cross-vendor round). */
  const disablers = (text: string) =>
    text.match(/\b(?:x(?:describe|it|test)|(?:describe|it|test)(?:\.[A-Za-z]+)*\.(?:skip|todo|only|skipIf|runIf))\b/g) ?? []
  it('leaves riverBank.test.ts naming the riverless villages', () => {
    const src = stripComments(readFileSync(resolve(process.cwd(), 'src/scenes/place/riverBank.test.ts'), 'utf8'))
    const start = src.indexOf("it('a village away from every river has none")
    expect(start, 'the boundary assertion has been renamed, removed or commented out in riverBank.test.ts').toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf('\n  })', start))
    expect(body, 'the riverless village it names').toContain("expect(withBank).not.toContain('maasai-village')")
    expect(body, 'the second riverless village it names').toContain("expect(withBank).not.toContain('san-village')")
    expect(body, 'and the riverside village it contrasts them with').toContain('expect(withBank).toContain(ROCK_VILLAGE_ID)')
    // A SKIPPED CASE IS A DELETED ONE TOO (third cross-vendor round, GPT-6
    // Astra, 20.09.2026): `describe.skip` leaves every text above in place
    // while nothing runs. The whole file is held to it rather than the one
    // case, because the switch can sit on any enclosing block — and `.only`
    // counts as well, since it disables every OTHER case in the file.
    expect(disablers(src), 'riverBank.test.ts disables cases').toEqual([])
  })

  // AND THE STRIPPER ITSELF IS PINNED, on the SAME function the check uses, so
  // the check above cannot quietly lose its teeth again.
  it('reads a commented-out assertion as gone', () => {
    const line = "    expect(withBank).not.toContain('san-village')"
    expect(stripComments(`  //${line}`)).not.toContain('expect(withBank)')
    expect(stripComments(`  /*${line} */`)).not.toContain('expect(withBank)')
    // The shape the second round found: a `//` the old guard let through
    // because a colon stood in front of it.
    expect(stripComments(`  disabled://${line}`)).not.toContain('expect(withBank)')
    // ...and a whole case wrapped in a block comment loses its NAME, which is
    // what the check above looks the body up by.
    expect(stripComments(`  /* it('a village away from every river has none') {\n${line}\n  } */`))
      .not.toContain('a village away from every river has none')
    expect(stripComments(`${line} // kept`)).toContain('expect(withBank)')
  })

  // AND THE SWITCH DETECTOR THE SAME WAY, on the same function the check calls.
  it('reads a skipped or narrowed case as disabled', () => {
    expect(disablers("describe.skip('a village away from every river has none', () => {")).toEqual(['describe.skip'])
    expect(disablers("  it.only('a village away from every river has none', () => {")).toEqual(['it.only'])
    expect(disablers("  xit('a village away from every river has none', () => {")).toEqual(['xit'])
    expect(disablers("  it.todo('a village away from every river has none')")).toEqual(['it.todo'])
    expect(disablers("describe.sequential.skip('a village away from every river has none', () => {")).toEqual([
      'describe.sequential.skip',
    ])
    expect(disablers("  it.concurrent.only('a village away from every river has none', () => {")).toEqual([
      'it.concurrent.only',
    ])
    expect(disablers("  it('a village away from every river has none', () => {")).toEqual([])
    expect(disablers("  it.each(RIVERLESS)('%s has no bank', () => {")).toEqual([])
  })
})
