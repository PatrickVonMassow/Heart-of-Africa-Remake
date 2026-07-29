import { describe, expect, it } from 'vitest'
import { markupOnly, REQUIRED_SECTIONS, structureViolations } from './board-structure-core.mjs'

/** A minimal but structurally faithful board. */
const sect = (title, body = '') =>
  `<details class="sect"><summary><h2>${title}</h2></summary>\n${body}\n</details>`
const nowCard = (n) =>
  `<details class="now">\n  <summary><span class="t">${n} — Titel</span></summary>\n  <div class="body"><p>Text</p></div>\n</details>`
const queueCard = (n) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">Titel</span></summary>\n  <div class="body"><p>Text</p></div>\n</details>`

const board = ({ now = [400], queue = [401] } = {}) =>
  '<div class="wrap">\n' +
  sect(REQUIRED_SECTIONS[0], now.map(nowCard).join('\n')) +
  '\n' +
  sect(REQUIRED_SECTIONS[1], queueCard(1)) +
  '\n' +
  sect(REQUIRED_SECTIONS[2], queue.map(queueCard).join('\n')) +
  '\n' +
  sect(REQUIRED_SECTIONS[3], queueCard(2)) +
  '\n</div>'

const codes = (html) => structureViolations(html).map((v) => v.code)

describe('structureViolations — the intact board', () => {
  it('passes a well-formed board', () => {
    expect(structureViolations(board())).toEqual([])
  })

  it('passes with several current-work cards', () => {
    expect(structureViolations(board({ now: [395, 300, 390] }))).toEqual([])
  })

  it('does not count a tag NAMED in a css comment as markup', () => {
    const withComment = board().replace('<div class="wrap">', '<style>/* <h2> spacing */ .x{}</style>\n<div class="wrap">')
    expect(structureViolations(withComment)).toEqual([])
  })
})

describe('structureViolations — the three real breakages of 28.07.2026', () => {
  it('catches the swallowed section seam that re-parents the following cards', () => {
    // The reorder dropped `</details>\n<details class="sect"><summary><h2>` before
    // the next heading, so the heading was left bare.
    const broken = board({ now: [395, 300, 390] }).replace(
      `</details>\n<details class="sect"><summary><h2>${REQUIRED_SECTIONS[1]}`,
      `</details>\n${REQUIRED_SECTIONS[1]}`,
    )
    expect(codes(broken)).toContain('details-unbalanced')
  })

  it('catches an orphan section wrapper left behind by a cut-and-paste', () => {
    const broken = board().replace(
      `<details class="sect"><summary><h2>${REQUIRED_SECTIONS[1]}`,
      `<details class="sect"><summary><h2></details>\n<details class="sect"><summary><h2>${REQUIRED_SECTIONS[1]}`,
    )
    const c = codes(broken)
    expect(c).toContain('orphan-section')
    expect(c).toContain('section-wrappers')
  })

  it('catches a current-work card that drifted into the next section', () => {
    // Same card count, but one sits after the current-work section.
    const drifted = board({ now: [395] }).replace(
      `<details class="sect"><summary><h2>${REQUIRED_SECTIONS[1]}</h2></summary>\n`,
      `<details class="sect"><summary><h2>${REQUIRED_SECTIONS[1]}</h2></summary>\n${nowCard(300)}\n`,
    )
    expect(codes(drifted)).toContain('now-card-outside')
  })
})

describe('structureViolations — the remaining structural rules', () => {
  it('catches a missing section', () => {
    const missing = board().replace(sect(REQUIRED_SECTIONS[2], queueCard(401)), '')
    expect(codes(missing)).toContain('sections-wrong')
  })

  it('catches the sections in the wrong order', () => {
    const swapped =
      '<div class="wrap">\n' +
      sect(REQUIRED_SECTIONS[1]) +
      '\n' +
      sect(REQUIRED_SECTIONS[0]) +
      '\n' +
      sect(REQUIRED_SECTIONS[2]) +
      '\n' +
      sect(REQUIRED_SECTIONS[3]) +
      '\n</div>'
    expect(codes(swapped)).toContain('sections-wrong')
  })

  it('catches an unbalanced summary', () => {
    expect(codes(board().replace('</summary>', ''))).toContain('summary-unbalanced')
  })
})

describe('totality — a checker that blocks a publish may never throw', () => {
  it('reports rather than throws on junk input', () => {
    for (const junk of [null, undefined, 42, '', '   ', {}]) {
      expect(() => structureViolations(junk)).not.toThrow()
      expect(structureViolations(junk).length).toBeGreaterThan(0)
    }
  })

  it('markupOnly is total', () => {
    expect(markupOnly(null)).toBe('')
    expect(markupOnly('<style>x</style>abc')).toBe('abc')
  })
})
