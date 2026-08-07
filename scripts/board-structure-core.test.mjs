import { describe, expect, it } from 'vitest'
import { markupOnly, nowCardKinds, REQUIRED_SECTIONS, structureViolations } from './board-structure-core.mjs'
import { CLOSING_WORK_TITLE, NO_CURRENT_WORK_TITLE } from './board-core.mjs'

/** A minimal but structurally faithful board. */
const sect = (title, body = '') =>
  `<details class="sect"><summary><h2>${title}</h2></summary>\n${body}\n</details>`
const nowCard = (n) =>
  `<details class="now">\n  <summary><span class="t">${n} — Titel</span></summary>\n  <div class="body"><p>Text</p></div>\n</details>`
const queueCard = (n) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">Titel</span></summary>\n  <div class="body"><p>Text</p></div>\n</details>`

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'

const board = ({ now = [400], queue = [401] } = {}) =>
  VIEWPORT +
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

describe('the board carries its own viewport', () => {
  // The property it used to INHERIT: as an artifact the fragment was the whole
  // document and the host set the meta. Under the Pages shell, document.write
  // discards the shell's along with the old document — and the board rendered at
  // Chrome's 980-px desktop default, unreadable on the phone it is read on.
  it('flags a board without one', () => {
    const naked = board().replace(/<meta name="viewport"[^>]*>\n/, '')
    expect(codes(naked)).toContain('viewport-missing')
  })

  it('accepts the intact board, and does not care how the meta is quoted', () => {
    expect(codes(board())).not.toContain('viewport-missing')
    const unquoted = board().replace(/name="viewport"/, 'name=viewport')
    expect(codes(unquoted)).not.toContain('viewport-missing')
  })

  it('is not satisfied by the word appearing in a card', () => {
    const decoy = board().replace(/<meta name="viewport"[^>]*>\n/, '<p>viewport</p>\n')
    expect(codes(decoy)).toContain('viewport-missing')
  })
})

// ═══ Point 544 — the section speaks in exactly ONE voice ═════════════════════
// Three kinds of current-work card exist: numbered point cards, the idle card,
// and the closing card that names the duties still owed on a point just ended.
// Any two at once is the contradiction the user read on his phone ("470 läuft"
// over "Gerade keine laufende Arbeit"). Every sanctioned writer clears the
// others, so a mixture means a hand edit — and this gate runs before the bytes
// leave, which is where a hand edit is still cheap to catch.
describe('one kind of current-work card', () => {
  const stateCard = (title) =>
    `<details class="now">\n  <summary><span class="t">${title}</span>` +
    `<span class="right"><span class="meta">23:40</span></span></summary>\n` +
    `  <div class="body"><p>Text</p></div>\n</details>`
  const IDLE = stateCard(NO_CURRENT_WORK_TITLE)
  const CLOSING = stateCard(CLOSING_WORK_TITLE)
  const withNow = (body) =>
    VIEWPORT +
    '<div class="wrap">\n' +
    sect(REQUIRED_SECTIONS[0], body) +
    '\n' +
    sect(REQUIRED_SECTIONS[1], queueCard(1)) +
    '\n' +
    sect(REQUIRED_SECTIONS[2], queueCard(401)) +
    '\n' +
    sect(REQUIRED_SECTIONS[3], queueCard(2)) +
    '\n</div>'

  it('accepts each kind standing alone', () => {
    for (const body of [nowCard(544), IDLE, CLOSING]) {
      expect(structureViolations(withNow(body))).toEqual([])
    }
    // …and any number of NUMBERED cards, which is one kind with parallel work.
    expect(structureViolations(withNow([544, 546, 550].map(nowCard).join('\n')))).toEqual([])
  })

  it('REFUSES a board carrying both an idle and a closing card', () => {
    const mixed = withNow(`${IDLE}\n${CLOSING}`)
    expect(codes(mixed)).toContain('now-card-kinds')
    expect(structureViolations(mixed)[0].msg).toMatch(/idle \+ closing|closing \+ idle/)
  })

  it('refuses either state card beside a numbered one', () => {
    expect(codes(withNow(`${nowCard(544)}\n${IDLE}`))).toContain('now-card-kinds')
    expect(codes(withNow(`${CLOSING}\n${nowCard(544)}`))).toContain('now-card-kinds')
  })

  it('refuses the same state card stacked — it is a STATE, not an entry', () => {
    expect(codes(withNow(`${IDLE}\n${IDLE}\n${IDLE}`))).toContain('now-state-card-stacked')
    expect(codes(withNow(`${CLOSING}\n${CLOSING}`))).toContain('now-state-card-stacked')
  })

  it('reads the SECTION, so the same words quoted in Erledigt are a report', () => {
    const archived =
      VIEWPORT +
      '<div class="wrap">\n' +
      sect(REQUIRED_SECTIONS[0], IDLE) +
      '\n' +
      sect(REQUIRED_SECTIONS[1], queueCard(1)) +
      '\n' +
      sect(REQUIRED_SECTIONS[2], queueCard(401)) +
      '\n' +
      sect(
        REQUIRED_SECTIONS[3],
        `<details>\n  <summary><span class="num">543</span><span class="t">${CLOSING_WORK_TITLE}</span>` +
          `</summary>\n  <div class="body"><p>Text</p></div>\n</details>`,
      ) +
      '\n</div>'
    expect(structureViolations(archived)).toEqual([])
  })

  it('nowCardKinds is total and names the kinds in document order', () => {
    expect(nowCardKinds(withNow(`${nowCard(544)}\n${IDLE}`))).toEqual(['point', 'idle'])
    for (const junk of [null, undefined, 42, {}, '', '<main>nichts</main>']) {
      expect(() => nowCardKinds(junk)).not.toThrow()
      expect(nowCardKinds(junk)).toEqual([])
    }
  })
})
