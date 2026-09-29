// The decision log as its own collapsed board section with an archive (user
// order 22.09.2026): routing at the card writer, the vdzk-add refusal, the five
// sections, the guard reach over both capped sections, the absence of any
// open-question pressure for a record, and the rotation of both sections.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_LOG_ANCHOR,
  DECISION_LOG_TITLE,
  RESTORE_CLOSED_AFTER,
  RESTORE_CLOSED_BEFORE,
  addDecisionRecord,
  addVdzk,
  archiveLinkParagraph,
  isDecisionRecordTitle,
  migrateDecisionLog,
  removeDecisionRecord,
  removeVdzk,
  rotateBoardArchives,
} from './board-core.mjs'
import { REQUIRED_SECTIONS, structureViolations } from './board-structure-core.mjs'
import {
  COLLAPSIBLE_SECTIONS,
  ENTSCHEIDUNGEN_ON_BOARD,
  ERLEDIGT_ON_BOARD,
  SECTION_TITLES,
  auditDashboard,
  parseCards,
  parseKlaerungPoints,
  sliceSections,
} from './dashboard-guard-core.mjs'
import { topicViolations } from './dashboard-card-topic-guard-core.mjs'
import { openCardTitles } from './vdzk-answer.mjs'
import { vdzkTitles } from './decision-card-guard.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const URL = 'https://example.invalid/board/archive/'

const RECORD_BODY =
  'Entscheidung: Die Höhenkarte wird neu gerastert. Evidenz: Die Messung ist eindeutig. ' +
  'Folge: Die neue Rasterung wird bereits verwendet. Deine Möglichkeiten: die Entscheidung stehen lassen, ' +
  'oder sie zurücknehmen — exakte Veto-Aktion: antworte „Veto Rasterung".'
const QUESTION_BODY =
  'User-owned category: design-content.\nSoll die enge oder die weite Variante gelten? Entscheide bitte.'

const sect = (title, body = '') => `<details class="sect"><summary><h2>${title}</h2></summary>\n${body}</details>\n`
const card = (title, body = '<p>Text.</p>') =>
  `<details>\n  <summary><span class="t">${title}</span></summary>\n  <div class="body">\n    ${body}\n  </div>\n</details>\n`
const doneCard = (n) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">Fertig ${n}</span>` +
  `<span class="right"><span class="meta">09:00 · 10:00</span></span></summary>\n  <div class="body">\n    <p>Erledigt.</p>\n  </div>\n</details>\n`
const record = (i) => card(`Entscheidungsprotokoll: Entscheidung ${i}`, `<p>Entscheidung: ${i}.</p>`)

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
const board = ({ vdzk = '', done = '', log = '', withLog = true } = {}) =>
  `${VIEWPORT}<main>\n${sect('Woran ich gerade arbeite')}${sect('Von dir zu klären', vdzk)}` +
  `${sect('Warteschlange')}${sect('Erledigt', done)}${withLog ? sect(DECISION_LOG_TITLE, log) : ''}` +
  '<footer>Stand</footer>\n</main>\n'
const titlesIn = (html, title) => parseCards(sliceSections(html).sections[title] ?? '').map((c) => c.title)
const archivePage = (doneCards = '') =>
  `<main>\n<h1>Archiv der erledigten Punkte</h1>\n<h2>Erledigt (älter)</h2>\n${doneCards}<footer>Ausgelagert.</footer>\n</main>\n`

describe('the five sections agree everywhere', () => {
  it('names the decision log last, below Erledigt, in all three lists', () => {
    expect(REQUIRED_SECTIONS).toEqual(SECTION_TITLES)
    expect(SECTION_TITLES).toEqual([
      'Woran ich gerade arbeite',
      'Von dir zu klären',
      'Warteschlange',
      'Erledigt',
      DECISION_LOG_TITLE,
    ])
    expect(COLLAPSIBLE_SECTIONS).toEqual(SECTION_TITLES)
  })

  it('passes a five-section board and refuses one without, or with the log out of order', () => {
    expect(structureViolations(board())).toEqual([])
    const four = structureViolations(board({ withLog: false })).map((v) => v.code)
    expect(four).toEqual(expect.arrayContaining(['sections-wrong', 'section-wrappers']))
    const swapped = board().replace(sect('Erledigt'), '').replace('<footer>', `${sect('Erledigt')}<footer>`)
    expect(structureViolations(swapped).map((v) => v.code)).toContain('sections-wrong')
  })

  it('counts the fifth wrapper and names an orphan beside it', () => {
    const orphan = board().replace('<footer>', `${sect('Protokoll alt')}<footer>`)
    const codes = structureViolations(orphan).map((v) => v.code)
    expect(codes).toEqual(expect.arrayContaining(['section-wrappers', 'orphan-section']))
  })
})

describe('routing at the card writer', () => {
  it('puts a decision record into the decision log, newest first, never under "Von dir zu klären"', () => {
    const one = addVdzk(board({ log: '' }), 'Entscheidungsprotokoll: Rasterung der Höhenkarte', RECORD_BODY)
    const two = addVdzk(one, 'Entscheidungsprotokoll: Zweite Entscheidung', RECORD_BODY)
    expect(titlesIn(two, DECISION_LOG_TITLE)).toEqual([
      'Entscheidungsprotokoll: Zweite Entscheidung',
      'Entscheidungsprotokoll: Rasterung der Höhenkarte',
    ])
    expect(titlesIn(two, 'Von dir zu klären')).toEqual([])
    expect(structureViolations(two)).toEqual([])
  })

  it('still puts an open question under "Von dir zu klären"', () => {
    const out = addVdzk(board(), 'Kartenschrift wählen', QUESTION_BODY)
    expect(titlesIn(out, 'Von dir zu klären')).toEqual(['Kartenschrift wählen'])
    expect(titlesIn(out, DECISION_LOG_TITLE)).toEqual([])
  })

  it('refuses a duplicate record in the log by its own name', () => {
    const once = addDecisionRecord(board(), 'Entscheidungsprotokoll: Einmal', RECORD_BODY)
    expect(() => addDecisionRecord(once, 'Entscheidungsprotokoll: Einmal', RECORD_BODY)).toThrow(
      /decision record .* already stands under "Entscheidungsprotokoll"/,
    )
  })

  it('add/remove pair: the log command needs the prefix, and each remover sees only its section', () => {
    expect(isDecisionRecordTitle('Entscheidungsprotokoll: x')).toBe(true)
    expect(isDecisionRecordTitle('Kartenschrift wählen')).toBe(false)
    expect(() => addDecisionRecord(board(), 'Kartenschrift wählen', QUESTION_BODY)).toThrow(/vdzk-add/)
    const out = addDecisionRecord(board(), 'Entscheidungsprotokoll: Veto möglich', RECORD_BODY)
    expect(() => removeVdzk(out, 'Veto möglich')).toThrow(/no open question/)
    expect(titlesIn(removeDecisionRecord(out, 'Veto möglich'), DECISION_LOG_TITLE)).toEqual([])
  })
})

describe('vdzk-add refuses a decision record', () => {
  it('names the log command before any board write', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'board-decision-log-'))
    let failure
    try {
      execFileSync(
        process.execPath,
        [resolve(ROOT, 'scripts/board.mjs'), 'vdzk-add', 'Entscheidungsprotokoll: Punkt 5 läuft weiter', RECORD_BODY],
        {
          cwd: ROOT,
          env: { ...process.env, HOA_REPO_ROOT: emptyRoot },
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    } catch (error) {
      failure = error
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
    }
    expect(failure?.status).toBe(1)
    expect(failure?.stderr).toContain('vdzk-add REFUSED')
    expect(failure?.stderr).toContain('node scripts/board.mjs log-add')
  })
})

describe('guard reach over the decision log', () => {
  const full = (n) => Array.from({ length: n }, (_, i) => record(i + 1)).join('')
  const link = archiveLinkParagraph('log', 3, URL)

  it('judges overflow and the missing link in both capped sections', () => {
    const doneLinked = `${doneCard(1)}${archiveLinkParagraph('done', 0, URL)}\n`
    const over = auditDashboard(board({ done: doneLinked, log: `${full(ENTSCHEIDUNGEN_ON_BOARD + 1)}${link}\n` }), {})
    expect(over.map((v) => v.code)).toContain('erledigt-overflow')
    expect(over.find((v) => v.code === 'erledigt-overflow').msg).toMatch(/Entscheidungsprotokoll section holds 21/)
    const unlinked = auditDashboard(board({ done: doneLinked, log: full(2) }), {})
    expect(unlinked.find((v) => v.code === 'archive-link-missing')?.msg).toMatch(/Entscheidungsprotokoll/)
    expect(auditDashboard(board({ done: doneLinked, log: `${full(2)}${link}\n` }), {})).toEqual([])
    const doneOver = Array.from({ length: ERLEDIGT_ON_BOARD + 1 }, (_, i) => doneCard(i + 1)).join('')
    const erledigt = auditDashboard(board({ done: `${doneOver}${archiveLinkParagraph('done', 0, URL)}\n` }), {})
    expect(erledigt.find((v) => v.code === 'erledigt-overflow')?.msg).toMatch(/Erledigt section holds 21/)
  })

  it('applies the every-card checks to a record: empty body and duplicate title', () => {
    const empty = `<details>\n  <summary><span class="t">Entscheidungsprotokoll: leer</span></summary>\n</details>\n`
    const codes = auditDashboard(board({ log: `${empty}${record(1)}${record(1)}${link}\n` }), {}).map((v) => v.code)
    expect(codes).toEqual(expect.arrayContaining(['empty-body', 'duplicate-card-title']))
  })

  it('follows a record with the topic rule that held it under "Von dir zu klären"', () => {
    const foreign = card('Entscheidungsprotokoll: Punkt 5 läuft weiter', '<p>Entscheidung: auch Punkt 7 wird umgebaut.</p>')
    const found = topicViolations(board({ log: `${foreign}${link}\n` }), new Set([5, 7]))
    expect(found.map((v) => v.where)).toEqual(['record'])
  })

  it('creates NO open-question pressure for a record: no question title, no point, no demand', () => {
    const html = board({ log: `${card('Entscheidungsprotokoll: 812 — läuft weiter', `<p>${RECORD_BODY}</p>`)}${link}\n` })
    expect(openCardTitles(html)).toEqual([])
    expect(vdzkTitles(html)).toEqual([])
    expect([...parseKlaerungPoints(html, { knownPoints: new Set([812]) })]).toEqual([])
    // …while the same card standing under "Von dir zu klären" was an open question.
    const asQuestion = board({ vdzk: card('Entscheidungsprotokoll: 812 — läuft weiter', `<p>${RECORD_BODY}</p>`) })
    expect(vdzkTitles(asQuestion)).toHaveLength(1)
    expect(openCardTitles(asQuestion)).toHaveLength(1)
  })
})

describe('the one-off migration', () => {
  const SCRIPT = `<script>function restore(){if(d.classList.contains('sect')&&${RESTORE_CLOSED_BEFORE}){d.open=true;}}</script>\n`
  const legacy =
    SCRIPT +
    board({
      withLog: false,
      vdzk: `${record(1)}${card('Kartenschrift wählen')}${record(2)}`,
      done: `${doneCard(1)}<p class="archive-link">Älter im <a href="https://x.invalid/">Archiv</a>.</p>\n`,
    })

  it('adds the section below Erledigt and moves the standing records verbatim, in order', () => {
    const out = migrateDecisionLog(legacy)
    expect(structureViolations(out)).toEqual([])
    expect(titlesIn(out, 'Von dir zu klären')).toEqual(['Kartenschrift wählen'])
    expect(titlesIn(out, DECISION_LOG_TITLE)).toEqual(['Entscheidungsprotokoll: Entscheidung 1', 'Entscheidungsprotokoll: Entscheidung 2'])
    expect(out).toContain(record(1))
    expect(out).toContain(record(2))
  })

  it('keeps the new section closed on a first visit, and is idempotent', () => {
    const out = migrateDecisionLog(legacy)
    expect(out).toContain(RESTORE_CLOSED_AFTER)
    expect(out).not.toContain(RESTORE_CLOSED_BEFORE)
    expect(migrateDecisionLog(out)).toBe(out)
  })

  it('returns a damaged board unchanged rather than guess', () => {
    const damaged = legacy.replace('<details class="sect"><summary><h2>Erledigt</h2>', '<summary><h2>Erledigt</h2>')
    expect(migrateDecisionLog(damaged)).toBe(damaged)
  })
})

describe('rotation of both capped sections in one pass', () => {
  const doneCards = (from, n) => Array.from({ length: n }, (_, i) => doneCard(from + i)).join('')
  const records = (from, n) => Array.from({ length: n }, (_, i) => record(from + i)).join('')

  it('moves the overflow of both sections, each into its own archive section, and counts both links', () => {
    const r = rotateBoardArchives({
      board: board({ done: doneCards(1, ERLEDIGT_ON_BOARD + 2), log: records(1, ENTSCHEIDUNGEN_ON_BOARD + 3) }),
      archive: archivePage(doneCards(900, 5)),
      pageUrl: URL,
    })
    expect(r.moved).toEqual({ done: 2, log: 3 })
    expect(r.archived).toEqual({ done: 7, log: 3 })
    expect(titlesIn(r.board, 'Erledigt')).toHaveLength(ERLEDIGT_ON_BOARD)
    expect(titlesIn(r.board, DECISION_LOG_TITLE)).toHaveLength(ENTSCHEIDUNGEN_ON_BOARD)
    expect(r.board).toContain(
      `<p class="archive-link">Die älteren 7 erledigten Punkte stehen im <a href="${URL}">Archiv der erledigten Punkte</a>.</p>`,
    )
    expect(r.board).toContain(
      `<p class="archive-link">Die älteren 3 Entscheidungen stehen im <a href="${URL}#${ARCHIVE_LOG_ANCHOR}">Archiv des Entscheidungsprotokolls</a>.</p>`,
    )
    // The archive: done cards stay under the FIRST <h2>, newest first; the log
    // gets its own anchored section below them.
    const doneHead = r.archive.indexOf('<h2>Erledigt (älter)</h2>')
    const logHead = r.archive.indexOf(`<h2 id="${ARCHIVE_LOG_ANCHOR}">${DECISION_LOG_TITLE}</h2>`)
    expect(doneHead).toBeGreaterThan(-1)
    expect(logHead).toBeGreaterThan(doneHead)
    const doneArchive = r.archive.slice(doneHead, logHead)
    expect(doneArchive.indexOf('Fertig 21')).toBeLessThan(doneArchive.indexOf('Fertig 900'))
    expect(doneArchive).not.toContain('Entscheidungsprotokoll:')
    expect(r.archive.slice(logHead)).toContain('Entscheidung 21')
    expect(r.archive.slice(logHead)).not.toContain('Fertig')
    expect(auditDashboard(r.board, {})).toEqual([])
    expect(structureViolations(r.board)).toEqual([])
    // A second pass changes nothing.
    const again = rotateBoardArchives({ board: r.board, archive: r.archive, pageUrl: URL })
    expect(again).toMatchObject({ board: r.board, archive: r.archive, moved: { done: 0, log: 0 } })
  })

  it('words the links for one and for none, and links an empty archive only when cards stand', () => {
    expect(archiveLinkParagraph('log', 1, URL)).toContain('Die ältere Entscheidung steht im')
    expect(archiveLinkParagraph('done', 1, URL)).toContain('Der ältere erledigte Punkt steht im')
    expect(archiveLinkParagraph('log', 0, URL)).toContain('Die älteren Entscheidungen stehen im')
    const r = rotateBoardArchives({ board: board({ done: doneCards(1, 2) }), archive: archivePage(), pageUrl: URL })
    expect(r.board).toContain(archiveLinkParagraph('done', 0, URL))
    expect(r.board).not.toContain('Archiv des Entscheidungsprotokolls')
  })

  it('migrates a four-section board on the way, so one command lands the whole move', () => {
    const r = rotateBoardArchives({
      board: board({ withLog: false, vdzk: records(1, 2), done: doneCards(1, 1) }),
      archive: archivePage(),
      pageUrl: URL,
    })
    expect(titlesIn(r.board, DECISION_LOG_TITLE)).toHaveLength(2)
    expect(auditDashboard(r.board, {})).toEqual([])
  })
})
