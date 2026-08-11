import { describe, expect, it } from 'vitest'
import {
  cardNamingViolations,
  looksLikeClosingTitle,
  markupOnly,
  nowCardKinds,
  nowCards,
  REQUIRED_SECTIONS,
  stageOnlyTitle,
  structureViolations,
} from './board-structure-core.mjs'
import {
  CLOSING_WORK_TITLE,
  NO_CURRENT_WORK_TITLE,
  dropStrayNowCards,
  setCardTitle,
  toClosingWork,
  toNoCurrentWork,
  toNow,
  toQueue,
  upgradeNowCards,
} from './board-core.mjs'

/** A minimal but structurally faithful board. */
const sect = (title, body = '') =>
  `<details class="sect"><summary><h2>${title}</h2></summary>\n${body}\n</details>`
// The pre-655 shape: still READ everywhere, but the publish gate demands the
// chip, and the publisher lifts such a card before it judges (four-eyes 12.08.).
const legacyNowCard = (n) =>
  `<details class="now">\n  <summary><span class="t">${n} — Titel</span></summary>\n  <div class="body"><p>Text</p></div>\n</details>`
/** The shape every current-work card carries since point 655. */
const nowCard = (n) => chipCard(n)
const chipCard = (n, title = 'Titel', state = '') =>
  `<details class="now"${state ? ` data-state="${state}"` : ''}>\n  <summary><span class="num">${n}</span>` +
  `<span class="t">${title}</span></summary>\n  <div class="body"><p>Text</p></div>\n</details>`
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
  const stateCard = (title, { state = '', point = null, body = 'Text' } = {}) =>
    `<details class="now"${state ? ` data-state="${state}"` : ''}>\n  <summary>` +
    `${point == null ? '' : `<span class="num">${point}</span>`}<span class="t">${title}</span>` +
    `<span class="right"><span class="meta">23:40</span></span></summary>\n` +
    `  <div class="body"><p>${body}</p></div>\n</details>`
  // The handover card carries no chip by design, so its BODY has to name the
  // point the successor picks up (point 655).
  const IDLE = stateCard(NO_CURRENT_WORK_TITLE, { state: 'idle', body: 'Der Nachfolger nimmt Punkt 545.' })
  const CLOSING = stateCard('Die dritte Kartenart: Abschlussarbeiten', { state: 'closing', point: 544 })
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
        `<details>\n  <summary><span class="num">543</span><span class="t">${CLOSING_WORK_TITLE}: X</span>` +
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

// ═══ Point 655 — every card names its point and its subject ═══
// The user, 11.08.2026, with a screenshot of a card titled "Abschlussarbeiten
// zum gerade beendeten Punkt": "there is not even the number of the point on it,
// let alone what the point is about. Both must always be on it, by mechanism."
// The board is read on a phone at a glance, so a card that names only the STAGE
// is, to the reader, the same as no card at all.
describe('every current-work card names its point and its subject', () => {
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

  it('accepts a card with the chip and a subject title', () => {
    expect(codes(withNow(chipCard(651, 'Das Trommelbett ist eine 1,9-Sekunden-Schleife')))).toEqual([])
    // …and the composed closing title: number, subject, THEN the stage.
    expect(
      codes(withNow(chipCard(651, 'Das Trommelbett ist eine 1,9-Sekunden-Schleife: Abschlussarbeiten', 'closing'))),
    ).toEqual([])
  })

  it('REFUSES a now-card without a numbered chip, naming the card', () => {
    const nameless =
      '<details class="now">\n  <summary><span class="t">Abschlussarbeiten zum gerade beendeten Punkt</span>' +
      '</summary>\n  <div class="body"><p>Text</p></div>\n</details>'
    const found = cardNamingViolations(withNow(nameless))
    expect(found.map((v) => v.code)).toContain('now-card-unnumbered')
    expect(found[0].msg).toContain('Abschlussarbeiten zum gerade beendeten Punkt')
  })

  it('REFUSES a title that is only a stage word, in either language', () => {
    for (const title of [
      'Abschlussarbeiten',
      // The card the user photographed: every word after the stage points back
      // at the point instead of naming it.
      'Abschlussarbeiten zum gerade beendeten Punkt',
      'Vorbereitung',
      'Aufräumen',
      'closing duties',
      'cleanup',
      'closing work on this point',
    ]) {
      expect(stageOnlyTitle(title), title).toBe(true)
      expect(codes(withNow(chipCard(651, title)))).toContain('now-card-stage-title')
    }
  })

  // A refusal costs a retitle, so it may not fire on a title that names a real
  // subject and merely happens to open on a stage word (four-eyes 12.08.2026).
  it('lets every title through that names a subject beside the stage', () => {
    for (const title of [
      'Das Trommelbett ist eine 1,9-Sekunden-Schleife: Abschlussarbeiten',
      'Vorbereitung der Karten',
      'Nacharbeit am Zweig',
      'Cleanup parser for Windows',
      'Die Vorbereitung der Karten ist der Punkt',
      // A stage word at the END is only the closing card's own shape when the
      // stage is the closing one; these are ordinary titles and must publish.
      'Karten: Vorbereitung',
      'Parser: cleanup',
      'Zweig: rework',
      '651 — Ein Betreff',
    ]) {
      expect(stageOnlyTitle(title), title).toBe(false)
      expect(codes(withNow(chipCard(651, title))), title).not.toContain('now-card-stage-title')
    }
    expect(stageOnlyTitle('')).toBe(true)
    expect(stageOnlyTitle(null)).toBe(true)
  })

  // Without the marker no command can REPLACE the card, and a state that cannot
  // be replaced is the trap the marker exists to prevent.
  // A DIAGNOSTIC IS WORTH WHAT ITS REMEDY IS (four-eyes review, 12.08.2026): the
  // first version of these cases asserted the message and never ran the command
  // it named — and two of those commands could not in fact repair the card.
  it('is repaired by the command it names: the sweep every edit performs', () => {
    const stray =
      '<details class="now">\n  <summary><span class="t">Abschlussarbeiten</span></summary>\n' +
      '  <div class="body"><p>Irgendwas.</p></div>\n</details>'
    const broken = withNow(stray)
    expect(codes(broken)).toContain('now-card-unnumbered')
    expect(cardNamingViolations(broken)[0].msg).toContain('ANY board.mjs edit')
    // The named remedy, EXECUTED — the sweep board.mjs runs on every edit.
    const swept = dropStrayNowCards(broken)
    expect(codes(swept.html)).toEqual([])
    // …and it hands back the prose it removed, so nothing vanishes unsaid.
    expect(swept.dropped).toEqual([{ title: 'Abschlussarbeiten', text: 'Abschlussarbeiten Irgendwas.' }])
    // The state writers do NOT delete it: only the one reporting path removes a card.
    const closing = toClosingWork(broken, 651, {
      subject: 'Ein Betreff',
      reason: 'Vier-Augen fehlt.',
      stamp: '23:40',
    })
    expect(closing).toContain('Irgendwas.')
  })

  // EVERY LEGACY DASH, not only the em dash (four-eyes 12.08.): a card written
  // with a hyphen was refused by the gate, upgraded by nothing and removable by
  // nothing — the one shape no sanctioned command could reach.
  it('reads, upgrades and repairs a legacy title whatever dash it uses', () => {
    for (const dash of ['—', '–', '-']) {
      const legacy =
        `<details class="now">\n  <summary><span class="t">544 ${dash} Titel</span></summary>\n` +
        '  <div class="body"><p>Text</p></div>\n</details>'
      const board = withNow(legacy)
      expect(nowCards(board)[0].point, dash).toBe('544')
      expect(codes(board), dash).toContain('now-card-unnumbered')
      const lifted = upgradeNowCards(board)
      expect(codes(lifted), dash).toEqual([])
      expect(nowCards(lifted)[0].chip, dash).toBe('544')
      // …and the point commands reach it once it is lifted.
      expect(setCardTitle(lifted, 544, 'Ein Betreff')).toContain('<span class="t">Ein Betreff</span>')
      expect(toQueue(lifted, 544, { text: 'Zurück.' })).not.toContain('class="now"')
    }
  })

  // A MARKER MUST NOT BE ABLE TO AUTHORISE A DELETION (four-eyes 12.08.): a
  // state card is REPLACED, so a false closing marker over running work would
  // cost that work at the next state write.
  it('REFUSES a closing marker over an ordinary title, and refuses to strip it', () => {
    const false_ = withNow(chipCard(651, 'Ganz normale Arbeit', 'closing'))
    expect(codes(false_)).toContain('now-card-false-closing')
    // The strip leaves it standing rather than deleting real work: the card
    // still counts as the running point it is titled as, so the state write is
    // refused instead of silently swallowing it.
    expect(() => toNoCurrentWork(false_, 'Weiter mit Punkt 656.')).toThrow(/refusing to claim/)
    // …and the card is reachable by every point command, so it is repairable.
    expect(codes(setCardTitle(false_, 651, 'Ganz normale Arbeit: Abschlussarbeiten'))).toEqual([])
  })

  // A MARKER IS HAND-WRITABLE, so neither marker may authorise a deletion on its
  // own (four-eyes 12.08.): running work wearing the wrong marker must survive.
  it('never deletes running work that merely wears a state marker', () => {
    const falseIdle =
      '<details class="now" data-state="idle">\n  <summary><span class="num">651</span>' +
      '<span class="t">Echte Arbeit</span></summary>\n' +
      '  <div class="body"><p>Läuft.</p></div>\n</details>'
    // Both state writers refuse rather than swallow it: the card counts as the
    // running point it is titled as.
    expect(() => toNoCurrentWork(withNow(falseIdle), 'Weiter mit Punkt 656.')).toThrow(/refusing to claim/)
    expect(() => toClosingWork(withNow(falseIdle), 651, { reason: 'X.' })).toThrow(/refusing to claim/)
    expect(codes(withNow(falseIdle))).toContain('handover-card-shape')
    // …and the sweep keeps it too, because it carries a number.
    expect(dropStrayNowCards(withNow(falseIdle)).dropped).toEqual([])
  })

  it('keeps a genuine state card that lost its chip — its own command reaches it', () => {
    const chipless =
      '<details class="now" data-state="closing">\n  <summary><span class="t">Ein Betreff: Abschlussarbeiten</span>' +
      '</summary>\n  <div class="body"><p>Vier-Augen fehlt.</p></div>\n</details>'
    expect(dropStrayNowCards(withNow(chipless)).dropped).toEqual([])
    // `closing <N>` replaces it, which is what makes keeping it safe.
    const rewritten = toClosingWork(withNow(chipless), 651, {
      subject: 'Ein Betreff',
      reason: 'Nur noch die Retrospektive.',
      stamp: '23:40',
    })
    expect(rewritten).not.toContain('Vier-Augen fehlt.')
    expect(codes(rewritten)).toEqual([])
  })

  it('finds a card whose chip is separated from the summary by whitespace', () => {
    const spaced =
      '<details class="now">\n  <summary>\n    <span class="num">651</span>\n    <span class="t">Ein Betreff</span>' +
      '\n  </summary>\n  <div class="body"><p>Läuft.</p></div>\n</details>'
    const board = withNow(spaced)
    expect(codes(board)).toEqual([])
    // The gate accepted it, so the point commands must reach it too.
    expect(setCardTitle(board, 651, 'Neu')).toContain('<span class="t">Neu</span>')
    expect(toQueue(board, 651, { text: 'Zurück.' })).not.toContain('class="now"')
  })

  // NO SANCTIONED WRITER MAY PRODUCE WHAT THIS GATE REFUSES (four-eyes 12.08.):
  // a command that writes an unpublishable board reports the mistake one step
  // late, and the session then has to undo an edit it was told to make.
  it('refuses at the WRITER every title this gate would refuse', () => {
    const running = withNow(chipCard(651, 'Ein Betreff'))
    expect(() => setCardTitle(running, 651, 'Abschlussarbeiten')).toThrow(/STAGE and no subject/)
    expect(() => setCardTitle(running, 651, 'Vorbereitung')).toThrow(/STAGE and no subject/)
    // …while a real subject goes through and publishes.
    expect(codes(setCardTitle(running, 651, 'Vorbereitung der Karten'))).toEqual([])
  })

  it('keeps the closing card publishable when it is retitled', () => {
    const closing = toClosingWork(withNow(''), 651, {
      subject: 'Ein Betreff',
      reason: 'Vier-Augen fehlt.',
      stamp: '23:40',
    })
    const renamed = setCardTitle(closing, 651, 'Ein besserer Betreff')
    expect(renamed).toContain('Ein besserer Betreff: Abschlussarbeiten')
    expect(codes(renamed)).toEqual([])
  })

  it('refuses a closing SUBJECT that is itself only a stage', () => {
    expect(() =>
      toClosingWork(withNow(''), 651, { subject: 'Abschlussarbeiten', reason: 'Grund.' }),
    ).toThrow(/STAGE, not a subject/)
  })

  it('drops a card that names neither a point nor a state, and says which', () => {
    const stray =
      '<details class="now">\n  <summary><span class="t">Irgendwas ohne Nummer</span></summary>\n' +
      '  <div class="body"><p>Prosa.</p></div>\n</details>'
    // Beside REAL work, where no state write could ever run.
    const board = withNow(`${chipCard(651, 'Echte Arbeit')}\n${stray}`)
    expect(codes(board)).toContain('now-card-unnumbered')
    const swept = dropStrayNowCards(board)
    expect(swept.dropped.map((d) => d.title)).toEqual(['Irgendwas ohne Nummer'])
    expect(swept.dropped[0].text).toContain('Prosa.')
    expect(codes(swept.html)).toEqual([])
    expect(swept.html).toContain('Echte Arbeit')
    // The genuine handover card and every numbered card survive it.
    const handover = toNoCurrentWork(withNow(''), 'Weiter mit Punkt 656.', { stamp: '23:55' })
    expect(dropStrayNowCards(handover).dropped).toEqual([])
    expect(dropStrayNowCards(withNow(chipCard(651))).dropped).toEqual([])
    for (const junk of [null, undefined, 42, {}]) {
      expect(() => dropStrayNowCards(junk)).not.toThrow()
      expect(dropStrayNowCards(junk).dropped).toEqual([])
    }
  })

  // The marker alone must not exempt a card from every rule (four-eyes 12.08.).
  it('REFUSES a card that wears the idle marker but is not the handover card', () => {
    const impostor =
      '<details class="now" data-state="idle">\n  <summary><span class="num">651</span>' +
      '<span class="t">Irgendein Titel</span></summary>\n' +
      '  <div class="body"><p>Weiter mit Punkt 656.</p></div>\n</details>'
    expect(codes(withNow(impostor))).toContain('handover-card-shape')
    const wrongTitle =
      '<details class="now" data-state="idle">\n  <summary><span class="t">Pause</span></summary>\n' +
      '  <div class="body"><p>Weiter mit Punkt 656.</p></div>\n</details>'
    expect(codes(withNow(wrongTitle))).toContain('handover-card-shape')
    // Its remedy holds even beside real work: the impostor carries no number, so
    // the sweep every edit performs takes it and leaves the real card.
    const beside = withNow(`${chipCard(651, 'Echte Arbeit')}\n${wrongTitle}`)
    expect(codes(dropStrayNowCards(beside).html)).toEqual([])
    // A NUMBERED impostor is sent away instead, which its message names.
    const numbered = withNow(`${chipCard(652, 'Irgendwas', 'idle')}`)
    expect(cardNamingViolations(numbered)[0].msg).toContain('board.mjs queue 652')
  })

  // A chip the point commands cannot find is no chip (four-eyes 12.08.): the gate
  // and the finders share one definition of "numbered", head-anchored.
  it('does not accept a chip that no command could find', () => {
    const buried =
      '<details class="now">\n  <summary><span class="right"><span class="meta">09:00</span></span>' +
      '<span class="num">651</span><span class="t">Ein Betreff</span></summary>\n' +
      '  <div class="body"><p>Läuft.</p></div>\n</details>'
    expect(nowCards(withNow(buried))[0].chip).toBeNull()
    expect(codes(withNow(buried))).toContain('now-card-unnumbered')
    // …and the sweep takes it, because no numbered command can repair it.
    expect(dropStrayNowCards(withNow(buried)).dropped.map((d) => d.title)).toEqual(['Ein Betreff'])
  })

  it('refuses to promote a queue card whose title is only a stage', () => {
    const queued =
      VIEWPORT +
      '<div class="wrap">\n' +
      sect(REQUIRED_SECTIONS[0], '') +
      '\n' +
      sect(REQUIRED_SECTIONS[1], '') +
      '\n' +
      sect(
        REQUIRED_SECTIONS[2],
        '<details>\n  <summary><span class="num">651</span><span class="t">Vorbereitung</span>' +
          '<span class="right"><span class="meta">~2 h</span></span></summary>\n' +
          '  <div class="body"><p>Text</p></div>\n</details>',
      ) +
      '\n' +
      sect(REQUIRED_SECTIONS[3], '') +
      '\n</div>'
    expect(() => toNow(queued, 651, 'Läuft.', { stamp: '09:00' })).toThrow(/STAGE and no subject/)
  })

  it('names a remedy that FITS the card: no title command for an unnumbered one', () => {
    const stray =
      '<details class="now">\n  <summary><span class="t">Abschlussarbeiten</span></summary>\n' +
      '  <div class="body"><p>Irgendwas.</p></div>\n</details>'
    const msgs = cardNamingViolations(withNow(stray)).map((v) => v.msg).join(' ')
    expect(msgs).not.toContain('board.mjs title')
    expect(msgs).toContain('board.mjs none')
    // …while a numbered card is retitled, which is what actually works there.
    expect(cardNamingViolations(withNow(chipCard(651, 'Abschlussarbeiten')))[0].msg).toContain(
      'board.mjs title 651',
    )
  })

  it('is repaired by the command it names: an unmarked closing title is retitled', () => {
    const broken = withNow(chipCard(651, 'Ein Betreff: Abschlussarbeiten'))
    expect(codes(broken)).toContain('now-card-unmarked-closing')
    const repaired = setCardTitle(broken, 651, 'Ein Betreff')
    expect(codes(repaired)).toEqual([])
  })

  it('REFUSES a closing-shaped title that carries no closing marker', () => {
    const unmarked = chipCard(651, 'Ein Betreff: Abschlussarbeiten')
    expect(codes(withNow(unmarked))).toContain('now-card-unmarked-closing')
    expect(codes(withNow(chipCard(651, 'Ein Betreff: Abschlussarbeiten', 'closing')))).toEqual([])
    expect(looksLikeClosingTitle('Ein Betreff: Abschlussarbeiten')).toBe(true)
    expect(looksLikeClosingTitle('Ein Betreff')).toBe(false)
    expect(looksLikeClosingTitle(null)).toBe(false)
    // Only the CLOSING stage composes a state title — the others are subjects.
    for (const title of ['Karten: Vorbereitung', 'Parser: cleanup', 'Zweig: rework']) {
      expect(looksLikeClosingTitle(title), title).toBe(false)
      expect(codes(withNow(chipCard(651, title))), title).toEqual([])
    }
  })

  // The legacy closing card cannot be upgraded — it holds neither point nor
  // subject — so the gate must name the command that REPLACES it.
  it('names the command that replaces a legacy closing card it refuses', () => {
    const legacy =
      '<details class="now" data-state="closing">\n  <summary><span class="t">' +
      'Abschlussarbeiten zum gerade beendeten Punkt</span></summary>\n' +
      '  <div class="body"><p>Text</p></div>\n</details>'
    const found = cardNamingViolations(withNow(legacy))
    expect(found.map((v) => v.code)).toContain('now-card-unnumbered')
    expect(found.map((v) => v.msg).join(' ')).toContain('board.mjs closing <N>')
  })

  it('exempts the handover card from the chip — it belongs to NO point', () => {
    const handover =
      '<details class="now" data-state="idle">\n  <summary><span class="t">Gerade keine laufende Arbeit</span>' +
      '</summary>\n  <div class="body"><p>Der Nachfolger nimmt Punkt 656 auf.</p></div>\n</details>'
    expect(codes(withNow(handover))).toEqual([])
  })

  it('takes a follow-on point of any length, and names its own remedy', () => {
    const card = (body) =>
      '<details class="now" data-state="idle">\n  <summary><span class="t">Gerade keine laufende Arbeit</span>' +
      `</summary>\n  <div class="body"><p>${body}</p></div>\n</details>`
    expect(codes(withNow(card('Weiter mit Punkt 10000.')))).toEqual([])
    expect(cardNamingViolations(withNow(card('Nichts weiter.')))[0].msg).toContain('board.mjs none')
  })

  it('…but REFUSES a handover card that names no follow-on work', () => {
    const mute =
      '<details class="now" data-state="idle">\n  <summary><span class="t">Gerade keine laufende Arbeit</span>' +
      '</summary>\n  <div class="body"><p>Die Sitzung endet hier.</p></div>\n</details>'
    expect(codes(withNow(mute))).toContain('handover-card-nameless')
  })

  it('still READS a card written before the chip, and the publish lifts it first', () => {
    const legacy = withNow(legacyNowCard(544))
    expect(nowCards(legacy)).toEqual([
      { kind: 'point', chip: null, point: '544', title: '544 — Titel' },
    ])
    // The gate asks for the chip the reader sees…
    expect(codes(legacy)).toContain('now-card-unnumbered')
    // …and the upgrade every edit and every publish performs supplies it.
    expect(codes(upgradeNowCards(legacy))).toEqual([])
  })

  it('passes what the sanctioned writers produce', () => {
    const base = withNow(chipCard(651, 'Ein Betreff'))
    const closing = toClosingWork(base.replace(chipCard(651, 'Ein Betreff'), ''), 651, {
      subject: 'Ein Betreff',
      reason: 'Das Vier-Augen-Protokoll fehlt noch.',
      stamp: '23:40',
    })
    expect(codes(closing)).toEqual([])
    const handover = toNoCurrentWork(closing, 'Abgeschlossen; der Nachfolger nimmt Punkt 652.', { stamp: '23:55' })
    expect(codes(handover)).toEqual([])
  })

  it('is total on junk rather than throwing into the publisher', () => {
    for (const junk of [null, undefined, 42, {}, '', '<main>nichts</main>']) {
      expect(() => cardNamingViolations(junk)).not.toThrow()
      expect(cardNamingViolations(junk)).toEqual([])
    }
  })
})
