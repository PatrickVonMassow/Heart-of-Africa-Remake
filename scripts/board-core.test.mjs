// The card edit behind `board.mjs status` (point 372): it must produce exactly
// the markup the board guard accepts — a stamped status — and refuse the cases
// where silently doing nothing would leave the reader with a stale card.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  auditDashboard,
  parseCards,
  parseNowCardPoints,
  parseQueuePoints,
  parseTasks,
  sliceSections,
  QUEUE_STUB_META,
} from './dashboard-guard-core.mjs'
import { concisenessOffenders } from './dashboard-conciseness-guard-core.mjs'
import { structureViolations } from './board-structure-core.mjs'
import {
  ERLEDIGT_ANCHOR,
  NO_CURRENT_WORK_TITLE,
  TEXT_STDIN_FLAG,
  addHours,
  addVdzk,
  berlinStamp,
  cardParagraphs,
  claimsNoCurrentWork,
  closeCard,
  erledigtSectionStart,
  noCurrentWorkCards,
  toNoCurrentWork,
  estimateHours,
  hasCurrentWork,
  normaliseLineEndings,
  parseDoneArgs,
  promotionEstimateWarning,
  queueEstimateHours,
  renderCardBody,
  resolveCardText,
  hoursLabel,
  nowCard,
  promoteToNow,
  refreshFooter,
  removeVdzk,
  setCardStatus,
  setCardTitle,
  toDone,
  toNow,
  toQueue,
} from './board-core.mjs'

const board = (point = 361) =>
  `<main>\n<details class="now">\n  <summary><span class="t">${point} — Etwas</span>` +
  `<span class="right"><span class="meta">10:00 · ~12:00</span></span></summary>\n` +
  `  <div class="body">\n    <p>alter Text</p>\n  </div>\n</details>\n</main>`

describe('setCardStatus', () => {
  it('replaces the body with one stamped paragraph', () => {
    const out = setCardStatus(board(), 361, 'Neuer Stand.', '14:48')
    expect(out).toContain('<span class="stamp">Stand 14:48</span> Neuer Stand.')
    expect(out).not.toContain('alter Text')
    // The header keeps its own times — the stamp belongs to the status text.
    expect(out).toContain('10:00 · ~12:00')
  })

  it('leaves the card structure the guard reads intact', () => {
    const out = setCardStatus(board(), 361, 'X', '09:00')
    expect(out).toMatch(/<details class="now">\s*<summary>/)
    expect(out).toMatch(/<div class="body">\s*<p>/)
    expect(out.match(/<\/details>/g)).toHaveLength(1)
  })

  it('refuses a point that has no current-work card', () => {
    expect(() => setCardStatus(board(361), 999, 'X', '09:00')).toThrow(/no current-work card/)
  })

  it('refuses an empty status rather than writing a blank card', () => {
    expect(() => setCardStatus(board(), 361, '   ', '09:00')).toThrow(/empty status/)
  })

  it('refuses a non-numeric point and an empty document', () => {
    expect(() => setCardStatus(board(), 'abc', 'X', '09:00')).toThrow(/not a point number/)
    expect(() => setCardStatus('', 361, 'X', '09:00')).toThrow(/empty document/)
  })
})

describe('berlinStamp', () => {
  it('reads HH:MM in Berlin time regardless of the machine zone', () => {
    // 2026-07-27T12:48Z is 14:48 in Berlin (CEST).
    expect(berlinStamp(new Date('2026-07-27T12:48:00Z'))).toBe('14:48')
    // …and in winter the same UTC hour is 13:48 (CET).
    expect(berlinStamp(new Date('2026-01-27T12:48:00Z'))).toBe('13:48')
  })
})

describe('promoteToNow', () => {
  const withQueue = (n = 369) =>
    `<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n</details>\n` +
    `<details class="sect"><summary><h2>Warteschlange</h2></summary>\n` +
    `<details>\n  <summary><span class="num">${n}</span><span class="t">Titel</span>` +
    `<span class="right"><span class="meta">~2 h</span></span></summary>\n` +
    `  <div class="body"><p>Text</p></div>\n</details>\n</details>\n</main>`

  it('moves the queue card into the current-work section as a stamped now-card', () => {
    const out = promoteToNow(withQueue(), 369, {
      title: 'Etwas',
      times: '15:41 · ~17:30',
      status: 'läuft',
      stamp: '15:41',
    })
    expect(out).toContain('<span class="t">369 — Etwas</span>')
    expect(out).toContain('<span class="stamp">Stand 15:41</span> läuft')
    // the queue card is gone, and the now-card sits inside the first section
    expect(out.match(/class="num">369/g)).toBeNull()
    const nowAt = out.indexOf('369 — Etwas')
    expect(nowAt).toBeGreaterThan(out.indexOf('Woran ich gerade arbeite'))
    expect(nowAt).toBeLessThan(out.indexOf('Warteschlange'))
  })

  it('throws instead of silently matching nothing when the point is not queued', () => {
    expect(() => promoteToNow(withQueue(369), 999, { title: 'X', status: 'y' })).toThrow(/no queue card/)
  })

  it('demands a title and a status', () => {
    expect(() => promoteToNow(withQueue(), 369, { title: '', status: 'y' })).toThrow(/title and a status/)
  })
})

// The four moves a board update really is (point 372). Each one used to be a
// hand-written regex plus five follow-up calls; what is pinned here is that the
// generated markup is the one the dashboard guard reads back.
const sect = (name, body) =>
  `<details class="sect"><summary><h2>${name}</h2></summary>\n${body}</details>\n`

const fullBoard = ({ now = '', vdzk = '', queue = '', done = '' } = {}) =>
  `<main>\n${sect('Woran ich gerade arbeite', now)}${sect('Von dir zu klären', vdzk)}` +
  `${sect('Warteschlange', queue)}${sect('Erledigt', done)}</main>\n`

const queueEntry = (n, title, meta) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">${title}</span>` +
  (meta ? `<span class="right"><span class="meta">${meta}</span></span>` : '') +
  `</summary>\n  <div class="body">\n    <p>Warum das ansteht.</p>\n  </div>\n</details>\n`

const nowEntry = (n, title, times, status = 'läuft') =>
  `<details class="now">\n  <summary><span class="t">${n} — ${title}</span>` +
  `<span class="right"><span class="meta">${times}</span></span></summary>\n` +
  `  <div class="body">\n    <p><span class="stamp">Stand 16:20</span> ${status}</p>\n  </div>\n</details>\n`

const vdzkEntry = (title) =>
  `<details>\n  <summary><span class="t">${title}</span></summary>\n` +
  `  <div class="body">\n    <p>Die Frage.</p>\n  </div>\n</details>\n`

// Point 410: the shell is what broke the umlauts, so the text must be able to
// skip it. These cases pin the seam between the argv and the stdin path.
describe('resolveCardText — the way German prose gets in', () => {
  it('carries a stdin text through byte for byte, umlauts and all', () => {
    const text = 'Stand 12:40: Die Prüfung läuft, künftig fällt der Umweg über die Shell weg — größer als 90 %.'
    expect(resolveCardText([TEXT_STDIN_FLAG], `${text}\n`)).toBe(text)
    // A Windows pipe's CRLF is the only thing normalised.
    expect(resolveCardText([TEXT_STDIN_FLAG], `${text}\r\n`)).toBe(text)
  })

  it('keeps the argument form for ASCII', () => {
    expect(resolveCardText(['Tests', 'green,', 'merging'], '')).toBe('Tests green, merging')
    expect(resolveCardText([], '')).toBe('')
  })

  it('refuses to guess when both forms are given', () => {
    expect(() => resolveCardText([TEXT_STDIN_FLAG, 'auch', 'Text'], 'Der Text.')).toThrow(/WHOLE text/)
  })

  it('refuses an empty stdin rather than writing an empty card', () => {
    expect(() => resolveCardText([TEXT_STDIN_FLAG], '   \n')).toThrow(/nothing arrived on stdin/)
    expect(() => resolveCardText([TEXT_STDIN_FLAG], undefined)).toThrow(/nothing arrived on stdin/)
  })
})

describe('the stamp arithmetic behind the headers', () => {
  it('reads an estimate out of the queue header, decimal comma and tag included', () => {
    expect(estimateHours('~2 h')).toBe(2)
    expect(estimateHours('~2,5 h · Vier-Augen')).toBe(2.5)
    expect(estimateHours('16:20 · ~18:30')).toBeNull()
  })

  it('writes an estimate back in the same notation', () => {
    expect(hoursLabel(2)).toBe('~2 h')
    expect(hoursLabel(2.4)).toBe('~2,5 h')
    // Never "~0 h": a card still in work has time left, however little.
    expect(hoursLabel(0.1)).toBe('~0,5 h')
  })

  it('projects an end time and wraps past midnight', () => {
    expect(addHours('16:20', 2.5)).toBe('18:50')
    expect(addHours('23:30', 2)).toBe('01:30')
    expect(() => addHours('spät', 1)).toThrow(/HH:MM/)
  })
})

describe('toNow — queue card in, current-work card out', () => {
  const board = () => fullBoard({ queue: queueEntry(369, 'Ein verwaistes Jungtier', '~2 h') })

  it('derives title and projected end from the queue card the caller never retypes', () => {
    const out = toNow(board(), 369, 'Neu angesetzt.', { stamp: '16:20' })
    expect(out).toContain('<span class="t">369 — Ein verwaistes Jungtier</span>')
    expect(out).toContain('<span class="meta">16:20 · ~18:20</span>')
    expect(out).toContain('<span class="stamp">Stand 16:20</span> Neu angesetzt.')
  })

  it('leaves no queue card behind — the double-listing the guard blocks on', () => {
    const out = toNow(board(), 369, 'x', { stamp: '16:20' })
    expect(out).not.toContain('class="num">369')
    expect(out.indexOf('369 — ')).toBeLessThan(out.indexOf('Warteschlange'))
  })

  it('leads the section, because the focus guard reads the FIRST now-card', () => {
    const busy = fullBoard({
      now: nowEntry(365, 'Läuft schon', '10:07 · ~14:30'),
      queue: queueEntry(369, 'Ein verwaistes Jungtier', '~2 h'),
    })
    const out = toNow(busy, 369, 'x', { stamp: '16:20' })
    expect(out.indexOf('369 — ')).toBeLessThan(out.indexOf('365 — '))
  })

  it('falls back to the bare start time when the queue card carries no estimate', () => {
    const out = toNow(fullBoard({ queue: queueEntry(369, 'Ohne Schätzung') }), 369, 'x', { stamp: '09:05' })
    expect(out).toContain('<span class="meta">09:05</span>')
  })

  it('throws instead of writing nothing when the point is not queued', () => {
    expect(() => toNow(board(), 999, 'x')).toThrow(/no queue card/)
  })
})

describe('toQueue — the move that had to be done by hand', () => {
  const board = () => fullBoard({ now: nowEntry(373, 'Die Sitzungsgrenze', '16:20 · ~18:30') })

  it('recovers the original estimate from the card own span', () => {
    const out = toQueue(board(), 373)
    expect(out).toContain('<span class="num">373</span><span class="t">Die Sitzungsgrenze</span>')
    expect(out).toContain('<span class="meta">~2 h</span>')
    expect(out).not.toContain('class="now"')
    expect(out.indexOf('373')).toBeGreaterThan(out.indexOf('Warteschlange'))
  })

  it('carries the last status over as the queue body, stamp stripped', () => {
    const out = toQueue(fullBoard({ now: nowEntry(373, 'T', '16:20 · ~18:30', 'Wartet auf den Starter.') }), 373)
    expect(out).toContain('<p>Wartet auf den Starter.</p>')
    expect(out).not.toContain('Stand 16:20')
  })

  it('takes a new body and a new estimate when the caller states them', () => {
    const out = toQueue(board(), 373, { text: 'Zurückgestellt.', estimate: '~4 h' })
    expect(out).toContain('<p>Zurückgestellt.</p>')
    expect(out).toContain('<span class="meta">~4 h</span>')
  })

  it('throws when the point is not in current work', () => {
    expect(() => toQueue(board(), 999)).toThrow(/no current-work card/)
  })

  // A point promoted straight from a STUB queue card has a start time and no
  // end, so nothing can be recovered on the way back. Emitting no meta at all
  // was a queue-meta violation, and the live-board sweep below turned the whole
  // unit layer red on it — an omitted estimate must SAY it is missing.
  it('falls back to the named stub estimate when the card has no span', () => {
    const out = toQueue(fullBoard({ now: nowEntry(406, 'Die Zustellung', '06:47') }), 406)
    expect(out).toContain(`<span class="meta">${QUEUE_STUB_META}</span>`)
    expect(auditDashboard(out, { open: [], done: [] }).map((x) => x.code)).not.toContain('queue-meta')
  })
})

describe('toDone — current work into the archive', () => {
  const board = () => fullBoard({ now: nowEntry(365, 'Der Preis eines Punktes', '10:07 · ~14:30') })

  it('keeps the start time and stamps the end', () => {
    const out = toDone(board(), 365, { text: 'Geschlossen.', end: '16:45' })
    expect(out).toContain('<span class="num">365</span><span class="t">Der Preis eines Punktes</span>')
    expect(out).toContain('<span class="meta">10:07 · 16:45</span>')
    expect(out).toContain('<p>Geschlossen.</p>')
    expect(out).not.toContain('class="now"')
  })

  it('lands inside the Erledigt section, newest first', () => {
    const out = toDone(fullBoard({
      now: nowEntry(365, 'Neu', '10:07 · ~14:30'),
      done: queueEntry(364, 'Älteres', '09:00 · 09:30'),
    }), 365, { end: '16:45' })
    const at = out.indexOf('class="num">365')
    expect(at).toBeGreaterThan(out.indexOf('<h2>Erledigt'))
    expect(at).toBeLessThan(out.indexOf('class="num">364'))
  })

  it('refuses an empty archive body rather than filing a blank card', () => {
    const bare = fullBoard({ now: `<details class="now">\n  <summary><span class="t">365 — T</span>` +
      `<span class="right"><span class="meta">10:07 · ~14:30</span></span></summary>\n` +
      `  <div class="body">\n  </div>\n</details>\n` })
    expect(() => toDone(bare, 365, { end: '16:45' })).toThrow(/empty body/)
  })
})

// Point 416: the user reported an empty current-work section TWICE in one hour,
// and the same window turned the unit layer red and blocked a green merge.
// Archiving and the successor therefore land in ONE document.
describe('closeCard — archiving a point never empties the board', () => {
  const archiveLink = '<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>\n'
  const board = () =>
    fullBoard({
      now: nowEntry(300, 'Der abgeschlossene Punkt', '10:07 · ~14:30'),
      queue: queueEntry(416, 'Die leere Tafel', '~2 h'),
      done: archiveLink,
    })

  it('pins the hole the two-step move opened — the intermediate document HAS no current work', () => {
    const intermediate = toDone(board(), 300, { text: 'Fertig.', end: '16:45' })
    expect(hasCurrentWork(intermediate)).toBe(false)
    expect(hasCurrentWork(board())).toBe(true)
  })

  it('archives and promotes the successor in one document, with no empty state in between', () => {
    const out = closeCard(board(), 300, { text: 'Fertig.', end: '16:45', next: 416, nextStatus: 'Angefangen.' })
    expect(hasCurrentWork(out)).toBe(true)
    expect(out).toContain('<span class="t">416 — Die leere Tafel</span>')
    expect(out).toContain('<span class="meta">10:07 · 16:45</span>') // the archived card
    expect(out).not.toContain('class="num">416') // …and the queue card is gone
  })

  it('names the gap with --none when there is genuinely nothing to promote', () => {
    const out = closeCard(board(), 300, { end: '16:45', text: 'Fertig.', none: 'Sitzungsgrenze, der Nachfolger übernimmt.' })
    expect(hasCurrentWork(out)).toBe(true)
    expect(out).toContain(NO_CURRENT_WORK_TITLE)
    expect(out).toContain('Sitzungsgrenze, der Nachfolger übernimmt.')
  })

  it('REFUSES a bare close that would empty the section, naming both ways out', () => {
    expect(() => closeCard(board(), 300, { text: 'Fertig.', end: '16:45' })).toThrow(/--next <m>[\s\S]*--none/)
  })

  it('allows a bare close while another card keeps the section populated', () => {
    const parallel = fullBoard({
      now: nowEntry(300, 'Fertig', '10:07 · ~14:30') + nowEntry(301, 'Läuft weiter', '11:00 · ~15:00'),
      queue: queueEntry(416, 'Die leere Tafel', '~2 h'),
    })
    const out = closeCard(parallel, 300, { text: 'Fertig.', end: '16:45' })
    expect(hasCurrentWork(out)).toBe(true)
    expect(out).toContain('301 — Läuft weiter')
  })

  it('refuses the contradictory pair and an unstated successor status', () => {
    expect(() => closeCard(board(), 300, { end: '16:45', next: 416, nextStatus: 'x', none: 'y' })).toThrow(/never both/)
    expect(() => closeCard(board(), 300, { text: 'F.', end: '16:45', next: 416, nextStatus: '  ' })).toThrow(/status text/)
    // A blank reason is not a way out either — it would name nothing.
    expect(() => closeCard(board(), 300, { text: 'F.', end: '16:45', none: '   ' })).toThrow(/needs a reason/)
  })

  it('leaves the produced board free of new audit violations', () => {
    const before = new Set(auditDashboard(board(), { open: [416], done: [300] }).map((v) => v.code))
    for (const out of [
      closeCard(board(), 300, { text: 'Fertig.', end: '16:45', next: 416, nextStatus: 'Angefangen.' }),
      closeCard(board(), 300, { text: 'Fertig.', end: '16:45', none: 'Warteschlange leer.' }),
    ]) {
      const added = auditDashboard(out, { open: [416], done: [300] })
        .map((v) => v.code)
        .filter((c) => !before.has(c))
      expect(added).toEqual([])
    }
  })
})

describe('parseDoneArgs — the flags behind one closing call', () => {
  it('splits text, successor and its status', () => {
    expect(parseDoneArgs(['300', 'Fertig', 'und', 'gemerged', '--next', '416', 'Angefangen.'])).toEqual({
      point: '300',
      words: ['Fertig', 'und', 'gemerged'],
      next: '416',
      nextWords: ['Angefangen.'],
      noneWords: [],
      hasNone: false,
    })
  })

  it('reads --none as its own bucket, and remembers a bare one', () => {
    const out = parseDoneArgs(['300', '--none', 'Warteschlange', 'leer.'])
    expect(out.next).toBeNull()
    expect(out.noneWords).toEqual(['Warteschlange', 'leer.'])
    expect(out.hasNone).toBe(true)
    expect(parseDoneArgs(['300', '--none'])).toMatchObject({ hasNone: true, noneWords: [] })
  })

  it('insists that --next names a point number', () => {
    expect(() => parseDoneArgs(['300', '--next', 'Angefangen.'])).toThrow(/POINT NUMBER/)
    expect(() => parseDoneArgs(['300', '--next'])).toThrow(/needs a point number/)
  })

  it('never throws on nothing at all', () => {
    expect(parseDoneArgs(undefined).point).toBeUndefined()
    expect(parseDoneArgs([]).words).toEqual([])
  })
})

// Point 421: the board could only DROP an open question, so the rule that every
// decision asked of the user STANDS there had to be hand-edited into the HTML —
// and `decision-card-guard`'s remedy could not name a command.
describe('addVdzk — a decision asked of the user gets a card', () => {
  it('puts the card at the TOP of the section, with the title alone in the header', () => {
    const out = addVdzk(fullBoard({ vdzk: vdzkEntry('Ältere Frage') }), 'Kartenschrift wählen', 'Enge, weite oder gemischte Variante?')
    const { sections } = sliceSections(out)
    const cards = parseCards(sections['Von dir zu klären'])
    expect(cards.map((c) => c.title)).toEqual(['Kartenschrift wählen', 'Ältere Frage'])
    expect(cards[0].body).toContain('Enge, weite oder gemischte Variante?')
    // The card must be the shape the board's own audit reads — a collapsed
    // <details> with no `open`, exactly like the ones already there.
    expect(out).toMatch(/<details>\s*<summary><span class="t">Kartenschrift wählen<\/span><\/summary>/)
    expect(out).not.toMatch(/<details open/)
  })

  it('escapes the markup characters, so a pasted placeholder cannot hide the card', () => {
    // The guard's remedy hands out a literal "<Titel der Frage>", and an
    // unescaped `<` produced a card whose title parses as empty — an invisible
    // open question (four-eyes review 30.07.2026).
    const out = addVdzk(fullBoard({}), '<Titel der Frage>', 'A & B <oder> C?')
    const cards = parseCards(sliceSections(out).sections['Von dir zu klären'])
    expect(cards[0].title).toBe('&lt;Titel der Frage&gt;')
    expect(cards[0].body).toContain('&amp;')
  })

  it('refuses a card with no title or no question — an empty card asks nothing', () => {
    const b = fullBoard({ vdzk: '' })
    expect(() => addVdzk(b, '', 'Die Frage.')).toThrow(/needs a title/)
    expect(() => addVdzk(b, 'Ein Titel', '   ')).toThrow(/needs the question itself/)
  })

  it('never touches another section', () => {
    const out = addVdzk(fullBoard({ queue: queueEntry(372, 'Ein Befehl', '~2 h') }), 'Eine Frage', 'Wie weiter?')
    const { sections } = sliceSections(out)
    expect(parseCards(sections['Warteschlange']).map((c) => c.title)).toEqual(['Ein Befehl'])
    expect(parseCards(sections['Von dir zu klären']).map((c) => c.title)).toEqual(['Eine Frage'])
  })
})

describe('removeVdzk — an answered question disappears', () => {
  const board = () =>
    fullBoard({ vdzk: vdzkEntry('Autostart wieder scharf schalten') + vdzkEntry('Auf Pull Requests umstellen?') })

  it('removes the one card whose title matches the fragment', () => {
    const out = removeVdzk(board(), 'autostart')
    expect(out).not.toContain('Autostart wieder scharf schalten')
    expect(out).toContain('Auf Pull Requests umstellen?')
  })

  it('refuses an ambiguous fragment and names the candidates', () => {
    expect(() => removeVdzk(board(), 'a')).toThrow(/matches 2:.*Autostart.*Pull Requests/s)
  })

  it('refuses a fragment that matches nothing, rather than reporting success', () => {
    expect(() => removeVdzk(board(), 'Kommunikationssystem')).toThrow(/no open question matching/)
  })

  it('never reaches into another section for its match', () => {
    const withQueueCard = fullBoard({ vdzk: vdzkEntry('Eine Frage'), queue: queueEntry(372, 'Ein Befehl', '~2 h') })
    expect(() => removeVdzk(withQueueCard, 'Ein Befehl')).toThrow(/no open question/)
  })
})

// The fixtures above pin the shape; this pins that the shape is the LIVE one.
// A card generator that drifts from the board the guard reads would pass every
// synthetic test and block the next turn instead.
//
// The board is a LOCAL artefact — .gitignore keeps it out of the repository —
// so it exists on a working machine and never in CI. The sweep therefore skips
// where there is no board rather than failing the pipeline for a missing file,
// and the fixtures above (which run everywhere) carry the shape on their own.
const BOARD_PATH = resolve(REPO_ROOT, '.batch-dashboard.html')
const hasBoard = existsSync(BOARD_PATH)

const boardHtml = hasBoard ? readFileSync(BOARD_PATH, 'utf8') : ''
// A board whose now-section is DELIBERATELY empty is a sanctioned state, not a
// defect: `board.mjs done <n> --none "<reason>"` closes the last point of a
// session by putting an unnumbered gap card where the work would be. This sweep
// needs a NUMBERED now-card to have anything to move around, so it skips that
// state instead of reddening the suite — otherwise taking the documented path to
// end a session blocks the push that same path exists to reach (measured
// 30.07.2026, at the boundary of point 434).
const nowSectionEmpty = hasBoard && [...parseNowCardPoints(boardHtml)].length === 0

describe.skipIf(!hasBoard || nowSectionEmpty)('every move keeps the real board auditable', () => {
  const html = boardHtml
  const audit = (doc) => new Set(auditDashboard(doc, { open: [], done: [] }).map((v) => v.code))
  const baseline = audit(html)
  const [aNowPoint] = [...parseNowCardPoints(html)]
  const [aQueuePoint] = [...parseQueuePoints(html)]

  it('has a board worth checking — a now-card and a queue card exist', () => {
    expect(aNowPoint, 'the live board must carry current work for this sweep to mean anything').toBeTruthy()
    expect(aQueuePoint).toBeTruthy()
  })

  it('promotes, returns, archives and answers without a new violation', () => {
    const moves = {
      now: () => toNow(html, aQueuePoint, 'Angefangen.', { stamp: '16:20' }),
      queue: () => toQueue(html, aNowPoint),
      done: () => toDone(html, aNowPoint, { text: 'Fertig.', end: '17:00' }),
      status: () => setCardStatus(html, aNowPoint, 'Neuer Stand.', '16:30'),
    }
    // `done` legitimately pushes the archive one card past its on-board cap —
    // that is what board-archive-rotate.mjs, which the wrapper runs right after
    // every edit, exists for. Any OTHER new violation is a real defect.
    const rotated = { done: new Set(['erledigt-overflow']) }
    for (const [name, move] of Object.entries(moves)) {
      const after = audit(move())
      const added = [...after].filter((c) => !baseline.has(c) && !rotated[name]?.has(c))
      expect(added, `board.mjs ${name} introduced ${added.join(', ')}`).toEqual([])
    }
  })
})

describe('refreshFooter — the count the repository already knows', () => {
  const foot = (inner) => `<main>x</main>\n<footer>${inner}</footer>\n`
  const live = '27.07.2026, 10:45 (Europe/Berlin) · 74 offene Punkte · Tags v0.2/poc unverändert · lädt sich alle 30 s selbst neu.'
  const at = new Date('2026-07-27T14:32:00Z') // 16:32 Berlin

  it('derives the count from the work order rather than from the old line', () => {
    const out = refreshFooter(foot(`Stand: ${live}`), { openCount: 73, now: at })
    expect(out).toContain('Stand: 27.07.2026, 16:32 (Europe/Berlin) · 73 offene Punkte')
    expect(out).not.toContain('74 offene Punkte')
  })

  it('keeps the statement segments, which are not counts', () => {
    const out = refreshFooter(foot(`Stand: ${live}`), { openCount: 73, now: at })
    expect(out).toContain('Tags v0.2/poc unverändert')
    expect(out).toContain('lädt sich alle 30 s selbst neu.')
  })

  it('writes the German singular rather than "1 offene Punkte"', () => {
    expect(refreshFooter(foot(`Stand: ${live}`), { openCount: 1, now: at })).toContain('1 offener Punkt ·')
  })

  it('replaces a footer that does not match the expected shape', () => {
    const out = refreshFooter(foot('irgendwas'), { openCount: 5, now: at })
    expect(out).toContain('Stand: 27.07.2026, 16:32 (Europe/Berlin) · 5 offene Punkte · irgendwas')
  })

  it('fails loudly on a board without a footer and on a nonsense count', () => {
    expect(() => refreshFooter('<main>x</main>', { openCount: 3 })).toThrow(/no footer/)
    expect(() => refreshFooter(foot(`Stand: ${live}`), { openCount: -1 })).toThrow(/open-point count/)
    expect(() => refreshFooter(foot(`Stand: ${live}`), { openCount: '73' })).toThrow(/open-point count/)
  })

  // Same reason as the sweep above: no board on a CI checkout.
  it.skipIf(!hasBoard)('leaves the live board free of the audit stale-footer finding', () => {
    const html = readFileSync(BOARD_PATH, 'utf8')
    const { open } = parseTasks(readFileSync(resolve(REPO_ROOT, 'TASKS.md'), 'utf8'))
    const codes = auditDashboard(refreshFooter(html, { openCount: open.length }), { open, done: [] }).map((v) => v.code)
    expect(codes).not.toContain('footer-stale')
  })
})

// ═══ Point 439 — what the sanctioned commands could NOT do, so it was done by
// hand instead: retitle a card, split a body into paragraphs, keep the line
// endings. Each hand edit is what then broke the next mechanism along.
describe('cardParagraphs / renderCardBody — a blank line is a paragraph boundary', () => {
  it('splits on a blank line and joins a wrapped one', () => {
    expect(cardParagraphs('Erster Absatz.\n\nZweiter Absatz.')).toEqual(['Erster Absatz.', 'Zweiter Absatz.'])
    expect(cardParagraphs('Eine Zeile,\nnoch dieselbe.')).toEqual(['Eine Zeile, noch dieselbe.'])
    expect(cardParagraphs('Nur einer.')).toEqual(['Nur einer.'])
    expect(cardParagraphs('  \n\n  ')).toEqual([])
  })

  it('renders one <p> per paragraph, the stamp leading the FIRST only', () => {
    const two = renderCardBody('Erster.\n\nZweiter.', { stamp: '16:20' })
    expect(two.match(/<p>/g)).toHaveLength(2)
    expect(two).toContain('<p><span class="stamp">Stand 16:20</span> Erster.</p>')
    expect(two).toContain('<p>Zweiter.</p>')
    expect(renderCardBody('Nur einer.').match(/<p>/g)).toHaveLength(1)
  })

  it('lets NO bare blank line reach the file inside a tag', () => {
    for (const text of ['A.\n\nB.', 'A.\r\n\r\nB.', 'A.\n\n\n\nB.', 'A.\n \nB.']) {
      const body = renderCardBody(text)
      expect(body).not.toMatch(/<p>[^<]*\n\s*\n/)
      expect(body.match(/<p>/g)).toHaveLength(2)
    }
  })

  // The whole reason this exists: `board.mjs status` wrapped whatever it was
  // given into ONE <p>, while dashboard-conciseness-guard blocks the turn end on
  // "one long unbroken paragraph — split into paragraphs". The only way out was
  // hand-editing the board HTML, which is what wrecked the line endings.
  it('lets the sanctioned command produce what the conciseness guard demands', () => {
    const long = `${'Wort '.repeat(40).trim()}.\n\n${'Wort '.repeat(40).trim()}.`
    const html = setCardStatus(board(), 361, long, '16:20')
    expect(concisenessOffenders(`<h2>Woran ich gerade arbeite</h2>${html}`)).toEqual([])
    // Piped through as ONE paragraph it is exactly the block the guard refuses.
    const squashed = setCardStatus(board(), 361, long.replace(/\n\n/g, ' '), '16:20')
    expect(concisenessOffenders(`<h2>Woran ich gerade arbeite</h2>${squashed}`)[0].reason).toMatch(/unbroken paragraph/)
  })

  it('carries a multi-paragraph status over intact when the card MOVES', () => {
    const card = nowEntry(373, 'T', '16:20 · ~18:30', 'x')
    const withBody = setCardStatus(fullBoard({ now: card }), 373, 'Erster.\n\nZweiter.', '16:20')
    const queued = toQueue(withBody, 373)
    expect(queued).toContain('<p>Erster.</p>')
    expect(queued).toContain('<p>Zweiter.</p>')
    expect(queued).not.toContain('Stand 16:20')
  })
})

describe('normaliseLineEndings — the board is LF, whatever wrote it', () => {
  it('collapses CRLF and a lone CR', () => {
    expect(normaliseLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
    expect(normaliseLineEndings(null)).toBe('')
  })

  // 30.07.2026: a now-card had to be retitled by hand, the editor wrote the file
  // back in Windows text mode, later node writes left it MIXED — and the archive
  // rotation could not find the Erledigt section at all, so `attest` crashed with
  // a stack trace on a board that looked perfect in the browser.
  it('lets the archive rotation find its section in a board written with CRLF', () => {
    // The anchor the rotation matches by is LITERAL, newline included — which is
    // exactly why a CRLF file defeated it.
    const lf = `<main>\n${ERLEDIGT_ANCHOR}\n<details><summary><span class="num">1</span></summary></details>\n</details>\n`
    expect(erledigtSectionStart(lf)).toBeGreaterThan(-1)
    const crlf = lf.replace(/\n/g, '\r\n')
    expect(crlf.indexOf(ERLEDIGT_ANCHOR)).toBe(-1) // the failure, reproduced
    expect(erledigtSectionStart(crlf)).toBeGreaterThan(-1) // …and repaired
    expect(normaliseLineEndings(crlf)).toContain(ERLEDIGT_ANCHOR)
  })
})

describe('setCardTitle — the command a now-card never had', () => {
  const withBoth = () =>
    fullBoard({
      now: nowEntry(373, 'DER ALTE TITEL', '16:20 · ~18:30'),
      queue: queueEntry(369, 'AN OLD HEADLINE', '~2 h'),
    })

  it('retitles a now-card, keeping its number, times and body', () => {
    const out = setCardTitle(withBoth(), 373, 'Die Sitzungsgrenze')
    expect(out).toContain('<span class="t">373 — Die Sitzungsgrenze</span>')
    expect(out).toContain('<span class="meta">16:20 · ~18:30</span>')
    expect(out).toContain('<span class="stamp">Stand 16:20</span> läuft')
    expect(out).not.toContain('DER ALTE TITEL')
  })

  it('retitles a queue card, keeping its estimate and body', () => {
    const out = setCardTitle(withBoth(), 369, 'Ein verwaistes Jungtier')
    expect(out).toContain('<span class="num">369</span><span class="t">Ein verwaistes Jungtier</span>')
    expect(out).toContain('<span class="meta">~2 h</span>')
    expect(out).toContain('<p>Warum das ansteht.</p>')
  })

  it('leaves the OTHER card untouched — one point, one card', () => {
    const out = setCardTitle(withBoth(), 373, 'Neu')
    expect(out).toContain('AN OLD HEADLINE')
  })

  it('refuses rather than silently matching nothing', () => {
    expect(() => setCardTitle(withBoth(), 999, 'Neu')).toThrow(/no current-work or queue card/)
    expect(() => setCardTitle(withBoth(), 373, '  ')).toThrow(/empty title/)
    expect(() => setCardTitle(withBoth(), 'x', 'Neu')).toThrow(/not a point number/)
    expect(() => setCardTitle('', 373, 'Neu')).toThrow(/empty document/)
  })

  it('leaves the board free of new audit violations', () => {
    const before = auditDashboard(withBoth(), { open: [], done: [] }).map((x) => x.code)
    const after = auditDashboard(setCardTitle(withBoth(), 373, 'Neu'), { open: [], done: [] }).map((x) => x.code)
    expect(after).toEqual(before)
  })
})

describe('the promoted card carries its estimate, or the promotion is REPORTED', () => {
  it('renders the queue estimate beside the start time', () => {
    const out = toNow(fullBoard({ queue: queueEntry(369, 'Ein Titel', '~2 h') }), 369, 'x', { stamp: '16:20' })
    expect(out).toContain('<span class="meta">16:20 · ~18:20</span>')
  })

  it('reports a promotion with no estimate rather than rendering the card bare', () => {
    const bare = fullBoard({ queue: queueEntry(369, 'Ohne Schätzung', QUEUE_STUB_META) })
    expect(queueEstimateHours(bare, 369)).toBeNull()
    expect(promotionEstimateWarning(bare, 369)).toMatch(/NO estimate/)
    expect(promotionEstimateWarning(bare, 369)).toMatch(/--estimate/)
    // …and the card really does come out with a start time alone.
    expect(toNow(bare, 369, 'x', { stamp: '09:05' })).toContain('<span class="meta">09:05</span>')
  })

  it('says nothing when the estimate is there', () => {
    const good = fullBoard({ queue: queueEntry(369, 'Mit Schätzung', '~2 h') })
    expect(queueEstimateHours(good, 369)).toBe(2)
    expect(promotionEstimateWarning(good, 369)).toBeNull()
  })

  it('reports a point that has no queue card at all rather than throwing', () => {
    expect(promotionEstimateWarning(fullBoard({}), 999)).toMatch(/NO estimate/)
  })
})

describe('a flag never reaches a card as prose', () => {
  it('refuses an argv word beginning with -- and names the flag it knows', () => {
    expect(() => resolveCardText(['--text-stdinn'], '')).toThrow(/refusing to write the flag/)
    expect(() => resolveCardText(['--none'], '')).toThrow(/--text-stdin/)
  })
  it('accepts one after a bare -- separator', () => {
    expect(resolveCardText(['--', '--so', 'beginnt', 'der', 'Text'], '')).toBe('--so beginnt der Text')
  })
  it('leaves the stdin path alone — that text was never near a shell', () => {
    expect(resolveCardText([TEXT_STDIN_FLAG], '--kein Flag, sondern Prosa\n')).toBe('--kein Flag, sondern Prosa')
  })
  it('keeps the blank lines a piped text carries — they are the paragraph breaks', () => {
    expect(resolveCardText([TEXT_STDIN_FLAG], '\r\nErster.\r\n\r\nZweiter.\r\n')).toBe('Erster.\n\nZweiter.')
  })
})

describe('nowCard', () => {
  it('finds a card by its point and returns null for a stranger', () => {
    const html = fullBoard({ now: nowEntry(361, 'T', '14:34 · ~19:00') })
    expect(nowCard(html, 361)).toContain('361 — T')
    expect(nowCard(html, 999)).toBeNull()
  })
})

// ═══ Point 470 — the idle card is a STATE, not an entry ══════════════════════
// Observed 30.07.2026, reported by the user four times in one evening: THREE
// "Gerade keine laufende Arbeit" cards stood stacked in the current-work
// section, the last time beside a live now-card. The cause is mechanical — the
// only sanctioned writer needed a point to close, so at a boundary (where the
// point is already ticked) the session hand-edited the board file, and a
// hand-edit APPENDS.
describe('the no-work card replaces rather than appends', () => {
  const emptyBoard = () => fullBoard({ queue: queueEntry(470, 'Die leere Karte', '~1 h') })

  it('leaves exactly ONE idle card however often it is written', () => {
    let html = emptyBoard()
    for (const reason of ['Sitzungsgrenze.', 'Immer noch Sitzungsgrenze.', 'Der Nachfolger übernimmt.']) {
      html = toNoCurrentWork(html, reason, { stamp: '22:27' })
      expect(noCurrentWorkCards(html)).toHaveLength(1)
    }
    // …and the LAST reason is the one standing: it is a state, so it is current.
    expect(html).toContain('Der Nachfolger übernimmt.')
    expect(html).not.toContain('Immer noch Sitzungsgrenze.')
  })

  it('is writable with NO point to close — the boundary case that forced the hand edit', () => {
    const out = toNoCurrentWork(emptyBoard(), 'Der Punkt ist abgeschlossen.', { stamp: '22:27' })
    expect(hasCurrentWork(out)).toBe(true)
    expect(claimsNoCurrentWork(out)).toBe(true)
  })

  it('produces markup the board guards accept — structurally and by audit', () => {
    const out = toNoCurrentWork(emptyBoard(), 'Der Punkt ist abgeschlossen.', { stamp: '22:27' })
    const before = new Set(structureViolations(emptyBoard()).map((v) => v.code))
    expect(structureViolations(out).map((v) => v.code).filter((c) => !before.has(c))).toEqual([])
    const auditBefore = new Set(auditDashboard(emptyBoard(), { open: [470], done: [] }).map((v) => v.code))
    const added = auditDashboard(out, { open: [470], done: [] })
      .map((v) => v.code)
      .filter((c) => !auditBefore.has(c))
    expect(added).toEqual([])
  })

  it('refuses to claim idleness while a numbered card stands — the pair the user read', () => {
    const busy = fullBoard({ now: nowEntry(470, 'Läuft', '22:30 · ~23:00') })
    expect(() => toNoCurrentWork(busy, 'Nichts läuft.')).toThrow(/refusing to claim that nothing is running/)
    // …and it names both sanctioned ways out rather than leaving a hand edit as the only one.
    expect(() => toNoCurrentWork(busy, 'Nichts läuft.')).toThrow(/done 470 --none[\s\S]*queue 470/)
  })

  it('is swept away the moment real work is promoted — the claim is then false', () => {
    const idle = toNoCurrentWork(emptyBoard(), 'Sitzungsgrenze.', { stamp: '22:27' })
    const out = toNow(idle, 470, 'Angefangen.', { stamp: '22:30' })
    expect(noCurrentWorkCards(out)).toHaveLength(0)
    expect(claimsNoCurrentWork(out)).toBe(false)
    expect(out).toContain('<span class="t">470 — Die leere Karte</span>')
  })

  it('closeCard --none still names the gap, and still only once', () => {
    const board = fullBoard({ now: nowEntry(300, 'Fertig', '10:07 · ~14:30') })
    const once = closeCard(board, 300, { text: 'Fertig.', end: '16:45', none: 'Sitzungsgrenze.' })
    expect(noCurrentWorkCards(once)).toHaveLength(1)
    // Writing it again over the standing one does not stack it.
    expect(noCurrentWorkCards(toNoCurrentWork(once, 'Immer noch.'))).toHaveLength(1)
  })

  it('claimsNoCurrentWork reads the SECTION, not the whole document', () => {
    // The same words quoted in the archive are a report, not a claim.
    const archived = fullBoard({
      now: nowEntry(470, 'Läuft', '22:30 · ~23:00'),
      done:
        `<details>\n  <summary><span class="num">300</span><span class="t">${NO_CURRENT_WORK_TITLE}</span>` +
        `</summary>\n  <div class="body">\n    <p>Text</p>\n  </div>\n</details>\n`,
    })
    expect(claimsNoCurrentWork(archived)).toBe(false)
  })

  it('is total on junk input rather than throwing into a guard', () => {
    for (const junk of [null, undefined, 42, {}, '']) {
      expect(() => claimsNoCurrentWork(junk)).not.toThrow()
      expect(claimsNoCurrentWork(junk)).toBe(false)
      expect(noCurrentWorkCards(junk)).toEqual([])
    }
  })
})
