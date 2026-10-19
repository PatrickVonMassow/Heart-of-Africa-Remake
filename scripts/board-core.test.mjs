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
  QUEUE_STUB_BODY,
  QUEUE_STUB_META,
} from './dashboard-guard-core.mjs'
import { concisenessOffenders } from './dashboard-conciseness-guard-core.mjs'
import { structureViolations } from './board-structure-core.mjs'
import { AUTOMATIC_DECISION_TITLE, PAUSED_TITLE } from './board-state-core.mjs'
import {
  CLOSING_WORK_TITLE,
  ERLEDIGT_ANCHOR,
  NO_CURRENT_WORK_TITLE,
  STATE_CARD_TITLES,
  TEXT_STDIN_FLAG,
  claimsClosingWork,
  closingWorkCards,
  isStateCardTitle,
  toClosingWork,
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
  parseClosingArgs,
  pointSubject,
  queueCard,
  upgradeNowCards,
  closingCardTitle,
  CLOSING_STAGE,
  promoteToNow,
  refreshFooter,
  removeVdzk,
  setCardStatus,
  applyDerivedStateCard,
  stripDerivedStateCard,
  setCardTimes,
  setCardTitle,
  toDone,
  doneEntries,
  doneCards,
  doneStart,
  earliestStart,
  mergeDoneDuplicates,
  toNow,
  toQueue,
  compareNowProjection,
  reconcileNowProjection,
  NOW_EMPTY_STATE_MARKUP,
  NOW_EMPTY_STATE_TEXT,
  projectNowForPublish,
  renderCardCriticalities,
} from './board-core.mjs'
import {
  DESCRIPTION_MISSING_TEXT,
  doneCard,
  descriptionOf,
  migrateCardDescriptions,
  queuedDescription,
  renderCardSections,
  setCardDescription,
} from './board-core.mjs'
import {
  applyCardTimes,
  backfillCardTimes,
  backfillTransaction,
  cardSpanBand,
  runCardTimesBackfill,
  spanHours,
  cardTimeLine,
  formatCardSpan,
  recordPromotion,
  resolveBerlinClock,
  spanOf,
  timedCards,
  timesEndClock,
} from './board-core.mjs'
import { etaMinutes } from './dashboard-guard-core.mjs'

// A minimal document WITH the section heading: since the sixth cross-review
// there is no fragment fallback — a writer on a document without the
// now-section heading refuses instead of treating the whole text as the
// section.
const board = (point = 361) =>
  '<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n' +
  `<details class="now">\n  <summary><span class="t">${point} — Etwas</span>` +
  `<span class="right"><span class="meta">10:00 · ~12:00</span></span></summary>\n` +
  `  <div class="body">\n    <p>alter Text</p>\n  </div>\n</details>\n</details>\n</main>`

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
    expect(out).toMatch(/<div class="body">\s*<p class="desc-missing">Beschreibung fehlt<\/p>\s*<hr class="split">\s*<p class="status-head">/)
    // The card plus its section wrapper — exactly what the fixture carries.
    expect(out.match(/<\/details>/g)).toHaveLength(2)
  })

  it('refuses a point that has no current-work card', () => {
    expect(() => setCardStatus(board(361), 999, 'X', '09:00')).toThrow(/no current-work card/)
  })

  it('refuses a document without the now-section heading instead of scanning it whole', () => {
    // Sixth cross-review: the fragment fallback is gone — a missing section
    // refuses in every consumer of the slice, not only in render and compare.
    const fragment =
      '<details class="now">\n  <summary><span class="t">361 — Etwas</span></summary>\n' +
      '  <div class="body">\n    <p>alter Text</p>\n  </div>\n</details>'
    expect(() => setCardStatus(fragment, 361, 'X', '09:00')).toThrow(/section not found: now/)
  })

  it('refuses an empty status rather than writing a blank card', () => {
    expect(() => setCardStatus(board(), 361, '   ', '09:00')).toThrow(/empty status/)
  })

  it('refuses a non-numeric point and an empty document', () => {
    expect(() => setCardStatus(board(), 'abc', 'X', '09:00')).toThrow(/not a point number/)
    expect(() => setCardStatus('', 361, 'X', '09:00')).toThrow(/empty document/)
  })
})

describe('setCardTimes — the projected end the eta audit demands', () => {
  it('moves the end and keeps the start the work actually began at', () => {
    const out = setCardTimes(board(), 361, '15:15')
    expect(out).toContain('10:00 · ~15:15')
    expect(out).not.toContain('~12:00')
  })

  it('accepts the remedy text verbatim, tilde and all', () => {
    expect(setCardTimes(board(), 361, '~15:15')).toContain('10:00 · ~15:15')
  })

  it('leaves the body alone', () => {
    expect(setCardTimes(board(), 361, '15:15')).toContain('alter Text')
  })

  it('rewrites only its OWN card when an earlier card carries no header times', () => {
    // The bound `setCardStatus` needed: a free run to the next `<span
    // class="meta">` would land in the FOLLOWING card's header.
    const two =
      '<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n' +
      '<details class="now">\n  <summary><span class="t">361 — Ohne Zeiten</span></summary>\n' +
      '  <div class="body">\n    <p>a</p>\n  </div>\n</details>\n' +
      '<details class="now">\n  <summary><span class="t">362 — Mit Zeiten</span>' +
      '<span class="right"><span class="meta">10:00 · ~12:00</span></span></summary>\n' +
      '  <div class="body">\n    <p>b</p>\n  </div>\n</details>\n</details>\n</main>'
    expect(() => setCardTimes(two, 361, '15:15')).toThrow(/no current-work card|no start time/)
    expect(two).toContain('10:00 · ~12:00')
  })

  it('refuses a point that has no current-work card', () => {
    expect(() => setCardTimes(board(361), 999, '15:15')).toThrow(/no current-work card/)
  })

  it('refuses anything that is not a time of day', () => {
    expect(() => setCardTimes(board(), 361, 'bald')).toThrow(/not a time of day/)
    expect(() => setCardTimes(board(), 361, '')).toThrow(/not a time of day/)
    expect(() => setCardTimes(board(), 'abc', '15:15')).toThrow(/not a point number/)
    expect(() => setCardTimes('', 361, '15:15')).toThrow(/empty document/)
  })
})

describe('applyDerivedStateCard — the machine reports state instead of asking', () => {
  const derived = { title: 'Batch pausiert', body: 'Umgebungsausfall. Nächster Versuch 25.08.2026, 15:10.' }
  const running = () => fullBoard({ now: nowEntry(361, 'Etwas', '10:00 · ~12:00'), vdzk: vdzkEntry('Eine echte Frage') })

  it('stands BESIDE a running point card instead of overwriting its status', () => {
    const out = applyDerivedStateCard(running(), derived, { stamp: '14:49' })
    expect(out).toContain('Batch pausiert')
    expect(out).toContain('data-state="derived"')
    // The point's own status survives — the reader still learns what is running.
    expect(out).toContain('läuft')
    expect(out.match(/<details class="now"/g)).toHaveLength(2)
  })

  it('DISAPPEARS again when there is no state to report — no hand edit needed', () => {
    const paused = applyDerivedStateCard(running(), derived, { stamp: '14:49' })
    const cleared = applyDerivedStateCard(paused, null, { stamp: '15:20' })
    expect(cleared).not.toContain('Batch pausiert')
    expect(cleared).not.toContain('data-state="derived"')
    expect(cleared.match(/<details class="now"/g)).toHaveLength(1)
  })

  it('is idempotent: two derivations leave ONE card, restamped', () => {
    const once = applyDerivedStateCard(running(), derived, { stamp: '14:49' })
    const twice = applyDerivedStateCard(once, derived, { stamp: '14:52' })
    expect(twice.match(/data-state="derived"/g)).toHaveLength(1)
    expect(twice).toContain('Stand 14:52')
  })

  it('never puts the state under "Von dir zu klären"', () => {
    const out = applyDerivedStateCard(running(), derived, { stamp: '14:49' })
    const vdzk = out.slice(out.indexOf('Von dir zu klären'))
    expect(vdzk).not.toContain('Batch pausiert')
  })

  it('leaves a NUMBERED card wearing the marker alone — a marker authorises no deletion', () => {
    const impostor = running().replace('<details class="now">', '<details class="now" data-state="derived">')
    expect(stripDerivedStateCard(impostor)).toContain('361')
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
    // The number rides in the SAME chip the queue cards use (point 655).
    expect(out).toContain('<summary><span class="num">369</span><span class="t">Etwas</span>')
    expect(out).toContain('<span class="stamp">Stand 15:41</span> läuft')
    // the queue card is gone, and the now-card sits inside the first section
    expect(queueCard(out, 369)).toBeNull()
    const nowAt = out.indexOf('<span class="t">Etwas</span>')
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

const fullBoard = ({ now = '', vdzk = '', queue = '', done = '', log = null } = {}) =>
  `<main>\n${sect('Woran ich gerade arbeite', now)}${sect('Von dir zu klären', vdzk)}` +
  `${sect('Warteschlange', queue)}${sect('Erledigt', done)}` +
  `${log === null ? '' : sect('Entscheidungsprotokoll', log)}</main>\n`

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

describe('four-digit point lifecycle', () => {
  it('preserves a legacy title-only card through the destructive projection path', () => {
    const source = fullBoard({ now: nowEntry(1000, 'Große Übergabe', '10:00 · ~12:00') })
    expect(compareNowProjection(source, [1000])).toMatchObject({ ok: true, missing: [], extra: [], strayCards: 0 })
    expect(reconcileNowProjection(source, [1000], { focusPoint: 1000, stamp: '12:00' })).toBe(source)
    expect(
      projectNowForPublish(source, { ok: true, points: [1000], focusPoint: 1000 }, { stamp: '12:00' }),
    ).toMatchObject({ html: source, comparison: { ok: true } })
  })

  it('returns a legacy title-only now-card to the queue', () => {
    const source = fullBoard({ now: nowEntry(1000, 'Große Übergabe', '10:00 · ~12:00') })
    expect(parseNowCardPoints(source, { knownPoints: [1000] })).toEqual(new Set([1000]))
    const out = toQueue(source, 1000)
    expect(out).toContain('<span class="num">1000</span><span class="t">Große Übergabe</span>')
    expect(parseQueuePoints(out)).toEqual(new Set([1000]))
    expect(parseNowCardPoints(out)).toEqual(new Set())
  })

  it('archives a legacy title-only now-card', () => {
    const out = toDone(fullBoard({ now: nowEntry(1000, 'Großer Abschluss', '10:00 · ~12:00') }), 1000, {
      text: 'Fertig.',
      end: '12:15',
    })
    expect(doneCards(out, 1000)).toHaveLength(1)
    expect(out).toContain('<span class="num">1000</span><span class="t">Großer Abschluss</span>')
  })

  it('archives one four-digit point and promotes the next atomically', () => {
    const source = fullBoard({
      now: nowEntry(1000, 'Großer Abschluss', '10:00 · ~12:00'),
      queue: queueEntry(1001, 'Großer Nachfolger', '~2 h'),
      done: '<p class="archive-link">\u00c4ltere im <a href="https://example.invalid/archiv">Archiv</a>.</p>\n',
    })
    const out = closeCard(source, 1000, {
      text: 'Fertig.',
      end: '12:15',
      next: 1001,
      nextStatus: 'Angefangen.',
    })
    expect(doneCards(out, 1000)).toHaveLength(1)
    expect(parseNowCardPoints(out)).toEqual(new Set([1001]))
    expect(queueCard(out, 1001)).toBeNull()
    const structureBefore = new Set(structureViolations(source).map((v) => v.code))
    expect(structureViolations(out).map((v) => v.code).filter((code) => !structureBefore.has(code))).toEqual([])
    const auditBefore = new Set(
      auditDashboard(source, { open: [1000, 1001], done: [], doneSeen: [] }).map((v) => v.code),
    )
    expect(
      auditDashboard(out, { open: [1001], done: [1000], doneSeen: [] })
        .map((v) => v.code)
        .filter((code) => !auditBefore.has(code)),
    ).toEqual([])
  })

  it('writes four-digit closing work from the queued subject', () => {
    const queued = fullBoard({
      queue: queueEntry(1000, 'Großer Abschluss', '~2 h'),
      done: '<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>\n',
    })
    const running = toNow(queued, 1000, 'Läuft.', { stamp: '10:00' })
    const board = toDone(running, 1000, { text: 'Zusammengeführt.', end: '12:15' })
    const out = toClosingWork(board, 1000, {
      reason: 'Das Vier-Augen-Protokoll fehlt noch.',
      stamp: '12:20',
    })
    expect(out).toContain('<span class="num">1000</span><span class="t">Großer Abschluss: Abschlussarbeiten</span>')
    expect(parseNowCardPoints(out)).toEqual(new Set([1000]))
    const structureBefore = new Set(structureViolations(board).map((v) => v.code))
    expect(structureViolations(out).map((v) => v.code).filter((code) => !structureBefore.has(code))).toEqual([])
    const auditBefore = new Set(auditDashboard(board, { open: [], done: [1000], doneSeen: [] }).map((v) => v.code))
    expect(
      auditDashboard(out, { open: [], done: [1000], doneSeen: [] })
        .map((v) => v.code)
        .filter((code) => !auditBefore.has(code)),
    ).toEqual([])
  })

  it('retitles and upgrades four-digit legacy now-cards without losing ownership', () => {
    const legacy = fullBoard({ now: nowEntry(1000, 'Alter Titel', '10:00 · ~12:00') })
    const retitled = setCardTitle(legacy, 1000, 'Neuer Titel')
    expect(retitled).toContain('<span class="num">1000</span><span class="t">Neuer Titel</span>')
    expect(parseNowCardPoints(retitled)).toEqual(new Set([1000]))

    const upgraded = upgradeNowCards(legacy)
    expect(upgraded).toContain('<span class="num">1000</span><span class="t">Alter Titel</span>')
    expect(parseNowCardPoints(upgraded)).toEqual(new Set([1000]))
  })

  it('merges duplicate four-digit archive cards', () => {
    const html = fullBoard({
      done: queueEntry(1000, 'Neu', '11:00 · 12:00') + queueEntry(1000, 'Alt', '09:00 · 10:00'),
    })
    const out = mergeDoneDuplicates(html)
    expect(out.merged).toEqual(['1000'])
    expect(doneCards(out.html, 1000)).toHaveLength(1)
    expect(out.html).toContain('<span class="meta">09:00 · 12:00</span>')
  })
})

describe('derived now-section membership', () => {
  const handover =
    '<details class="now" data-state="handover">\n  <summary><span class="t">Sitzungsübergabe</span></summary>\n' +
    '  <div class="body"><p>Die Arbeit wird übergeben.</p></div>\n</details>\n'

  it('reports the measured partial and empty boards with the missing point numbers', () => {
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'Kontext', '20:07') }), [700, 697, 711]))
      .toMatchObject({ ok: false, missing: [697, 711], extra: [] })
    expect(compareNowProjection(fullBoard(), [700, 697, 711]))
      .toMatchObject({ ok: false, missing: [700, 697, 711] })
  })

  it('reports stale and duplicate numbered cards even when set equality would hide them', () => {
    const duplicate = fullBoard({ now: nowEntry(700, 'A', '20:07') + nowEntry(700, 'B', '20:08') })
    expect(compareNowProjection(duplicate, [700])).toMatchObject({ ok: false, duplicates: [700] })
    const stale = fullBoard({ now: nowEntry(700, 'A', '20:07') + nowEntry(699, 'Alt', '19:00') })
    expect(compareNowProjection(stale, [700])).toMatchObject({ ok: false, extra: [699] })
  })

  it('allows an unnumbered handover beside numbered work but never instead of it', () => {
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') + handover }), [700]).ok).toBe(true)
    expect(compareNowProjection(fullBoard({ now: handover }), [700])).toMatchObject({ ok: false, missing: [700] })
  })

  // Sixth cross-vendor round: only the IDLE form was counted beside active
  // work, so any other hand-written unnumbered card stood visibly in the
  // section, belonged to no active point, and the fail-closed preflight
  // blessed it. The render refuses the same state, so the two cannot disagree.
  it('refuses a stray unnumbered card beside active work, in the check and in the render alike', () => {
    const stray =
      '<details class="now">\n  <summary><span class="t">Handnotiz</span></summary>\n' +
      '  <div class="body"><p>Von Hand eingefügt.</p></div>\n</details>\n'
    const board = fullBoard({ now: nowEntry(700, 'A', '20:07') + stray })
    expect(compareNowProjection(board, [700])).toMatchObject({ ok: false, strayCards: 1 })
    expect(() => reconcileNowProjection(board, [700], { stamp: '20:10' }))
      .toThrow(/unnumbered current-work card\(s\) stand beside active point\(s\) 700/)
    // The one sanctioned unnumbered card is still no stray.
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') + handover }), [700]))
      .toMatchObject({ ok: true, strayCards: 0 })
  })

  // Eighth cross-vendor round: the stray rule exempted only the idle claim and
  // anything WEARING the handover marker, so it rejected this module's own
  // derived state card — unnumbered by design and documented to stand beside
  // running work — while letting a hand-marked card buy the exemption.
  // Point 935, measured on the live board twenty minutes after the derived
  // now-section landed: the exemption above existed ONLY beside active work, so
  // a standing machine decision made the section unpublishable in the exact
  // state every session ends in — the render refused the card, the empty
  // element was then never inserted because the card filled the remainder, and
  // the comparison demanded a single unnumbered card.
  it('lets the derived state card stand while nothing runs, and still makes the zero claim', () => {
    const idleReason =
      `<details class="now" data-state="idle">\n  <summary><span class="t">${NO_CURRENT_WORK_TITLE}</span>` +
      '<span class="right"><span class="meta">10:17</span></span></summary>\n' +
      '  <div class="body"><p>Ich übergebe an eine frische Sitzung.</p></div>\n</details>\n'
    const decision = { title: AUTOMATIC_DECISION_TITLE, body: 'Der Batch läuft trotz der Meldung weiter.' }

    // SLICED INDEPENDENTLY of the production comparison (the reviewer of this
    // very case): a substring found anywhere in the document proves nothing
    // about the section it is supposed to stand in, and leaning on
    // `compareNowProjection` for placement would let one changed path vouch
    // for the other.
    // …and the slice ENDS AT THE SECTION'S OWN CLOSER (the confirming pass of
    // this case): cutting at the next section's opening tag left everything
    // between the two inside the slice, so an element inserted BETWEEN sections
    // satisfied an assertion that claims to prove it is inside this one.
    // …and the slice is found by COUNTING the section wrapper's own tags (two
    // confirming passes of this case). Cutting at the next section's opening
    // tag left everything between the two inside the slice; cutting at the LAST
    // closer in that stretch was fooled by a misplaced `<details>` card standing
    // between the sections — whose closer then became the last one. Depth
    // counting is the only reading neither can fool.
    const nowSectionOf = (html) => {
      const heading = html.indexOf('Woran ich gerade arbeite')
      const from = heading < 0 ? -1 : html.lastIndexOf('<details', heading)
      // A SECTION ORACLE MAY NOT FAIL OPEN (the third confirming pass of this
      // case): returning the rest of the document when the wrapper never
      // balances let later sections satisfy the placement assertions — the one
      // thing this helper exists to rule out.
      if (from < 0) throw new Error('no now-section wrapper in this board')
      const tag = /<(\/?)details\b/g
      tag.lastIndex = from
      let depth = 0
      for (let m = tag.exec(html); m; m = tag.exec(html)) {
        depth += m[1] ? -1 : 1
        if (depth === 0) return html.slice(from, m.index)
      }
      throw new Error('the now-section wrapper never closes')
    }

    // (a) Beside the authored idle claim: both stand, and NOTHING is rewritten
    // — the render is a byte-for-byte identity here, which is the only reading
    // a moved or silently edited card cannot satisfy.
    const withIdle = applyDerivedStateCard(fullBoard({ now: idleReason }), decision, { stamp: '10:17' })
    expect(compareNowProjection(withIdle, [])).toMatchObject({ ok: true, idleCards: 1, emptyStateCount: 0 })
    const renderedIdle = reconcileNowProjection(withIdle, [], { stamp: '10:17' })
    expect(renderedIdle).toBe(withIdle)
    const idleSection = nowSectionOf(renderedIdle)
    expect(idleSection).toContain('Ich übergebe an eine frische Sitzung.')
    expect(idleSection).toContain('data-state="derived"')
    expect(compareNowProjection(renderedIdle, []).ok).toBe(true)

    // (b) ALONE: the card must not swallow the zero claim — the empty element
    // stands INSIDE the section beside it, so "nothing is running" is still
    // said out loud, exactly once.
    const alone = applyDerivedStateCard(fullBoard({ now: '' }), decision, { stamp: '10:17' })
    const renderedAlone = reconcileNowProjection(alone, [], { stamp: '10:17' })
    const aloneSection = nowSectionOf(renderedAlone)
    expect(aloneSection).toContain(NOW_EMPTY_STATE_MARKUP.trim())
    expect(aloneSection).toContain('data-state="derived"')
    expect(renderedAlone.split(NOW_EMPTY_STATE_TEXT)).toHaveLength(2)
    expect(compareNowProjection(renderedAlone, [])).toMatchObject({ ok: true, emptyStateCount: 1 })
    // …and rendering again changes nothing: no second element, no drift.
    expect(reconcileNowProjection(renderedAlone, [], { stamp: '10:17' })).toBe(renderedAlone)

    // (c) THE EXEMPTION DOES NOT WIDEN: a hand-written unnumbered card, and one
    // wearing the reserved title WITHOUT the marker, still refuse with nothing
    // running — the ninth round's hardening is untouched.
    const handWritten =
      '<details class="now">\n  <summary><span class="t">Von Hand</span></summary>\n' +
      '  <div class="body"><p>Text.</p></div>\n</details>\n'
    expect(compareNowProjection(fullBoard({ now: handWritten }), []).ok).toBe(false)
    expect(() => reconcileNowProjection(fullBoard({ now: handWritten }), [], { stamp: '10:17' })).toThrow(
      /authored unnumbered non-idle card/,
    )
    const impostor = handWritten.replace('<span class="t">Von Hand</span>', `<span class="t">${AUTOMATIC_DECISION_TITLE}</span>`)
    expect(compareNowProjection(fullBoard({ now: impostor }), []).ok).toBe(false)
    expect(() => reconcileNowProjection(fullBoard({ now: impostor }), [], { stamp: '10:17' })).toThrow(
      /authored unnumbered non-idle card/,
    )
  })

  // Point 935's own reviewer, on the repair above: the exemption authenticated
  // the card with `summaryPoint`, which reads only a CANONICAL LEADING chip —
  // so a derived-marked card carrying its number further along the summary
  // passed as unnumbered, and beside an empty expected set that publishes a
  // visible point chip under the claim that nothing is running. And subtracting
  // every derived card without bounding the count let a STACK of them cancel
  // the zero claim out.
  it('authenticates the derived card by the whole summary, and tolerates only one of it', () => {
    const derivedCard = (summaryExtra = '', body = 'Der Batch läuft weiter.') =>
      '<details class="now" data-state="derived">\n  <summary><span class="t">' +
      `${AUTOMATIC_DECISION_TITLE}</span>${summaryExtra}` +
      '<span class="right"><span class="meta">10:17</span></span></summary>\n' +
      `  <div class="body"><p>${body}</p></div>\n</details>\n`

    // (a) A NON-LEADING chip is still a chip: the card is not the machine's —
    // and the reading is of MARKUP, not of one spelling of it, so an ordinary
    // attribute or a second class token does not walk past it.
    const chipShapes = [
      '<span class="num">935</span>',
      '<span class="num" aria-label="Punkt">935</span>',
      '<span class="chip num">935</span>',
      "<span class='num'>935</span>",
      '<span class=num>935</span>',
      '<SPAN CLASS="num">935</SPAN>',
      '<div class="num">935</div>',
      '<span class="num chip">935</span>',
      '<span class="num\tchip">935</span>',
      '<span class="chip\nnum">935</span>',
      '<span class="num">&#57;35</span>',
      '<span class="num">&#x39;35</span>',
      '<span class="num"><b>935</b></span>',
      '<span class="num">9<b>35</b></span>',
      // The shapes the negative test never caught and never will — a browser
      // shows a number, a regex does not (fourth confirming pass). The card is
      // authenticated against the ONE shape this module writes, so each of
      // these fails on its own account rather than on a spelling.
      '<span class="num">9<wbr>35</span>',
      '<span class=num><i title=">">935</i></span>',
      '<span class="num">&nbsp;935&nbsp;</span>',
      '<span class="num">9&#x200b;35</span>',
      '<span class=num/>935',
      `<span class="t">935 ${'\u2014'} Getarnt</span>`,
    ]
    for (const shape of chipShapes) {
      const smuggled = derivedCard(shape)
      const board = fullBoard({ now: smuggled })
      expect(compareNowProjection(board, []).ok).toBe(false)
      expect(() => reconcileNowProjection(board, [], { stamp: '10:17' })).toThrow(
        /authored unnumbered non-idle card/,
      )
      // …and it is not laundered into the section beside real work either —
      // BOTH halves say so, for EVERY shape (the second confirming pass of this
      // case: the loop had left only the last shape standing for this half).
      const beside = fullBoard({ now: nowEntry(700, 'A', '20:07') + smuggled })
      expect(compareNowProjection(beside, [700])).toMatchObject({ ok: false, strayCards: 1 })
      expect(() => reconcileNowProjection(beside, [700], { stamp: '20:10' })).toThrow(
        /unnumbered current-work card/,
      )
    }
    // (b) TWO genuine derived cards are damaged machine state, not two facts.
    // THE TWO ARE DISTINGUISHABLE ON PURPOSE (the confirming pass of this case):
    // byte-identical cards cannot tell keeping the FIRST from keeping the last.
    const stacked = fullBoard({ now: derivedCard('', 'Die erste Entscheidung.') + derivedCard('', 'Die zweite.') })
    expect(compareNowProjection(stacked, [])).toMatchObject({ ok: false, duplicateDerived: true })
    // The render normalises the stack away — the card holds nothing of its own —
    // and what it leaves behind is the state the comparison accepts.
    const normalised = reconcileNowProjection(stacked, [], { stamp: '10:17' })
    expect(normalised.match(/data-state="derived"/g)).toHaveLength(1)
    expect(normalised).toContain('Die erste Entscheidung.')
    expect(normalised).not.toContain('Die zweite.')
    expect(compareNowProjection(normalised, [])).toMatchObject({ ok: true, duplicateDerived: false })
    // The same stack beside active work is refused rather than blessed.
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') + derivedCard() + derivedCard() }), [700]))
      .toMatchObject({ ok: false, duplicateDerived: true })
  })

  // The same round found the widening REFUSING legitimate cards, which is the
  // worse failure: a number inside an HTML COMMENT is invisible in a browser,
  // and `data-class` is an ordinary authored attribute — both used to retire a
  // card that was exactly what the machine had written.
  it('keeps a state card whose summary only LOOKS numbered to a regex', () => {
    const commented =
      '<details class="now" data-state="idle">\n  <summary><span class="t">' +
      `${NO_CURRENT_WORK_TITLE}</span><!-- <span class="num">935</span> -->` +
      '<span class="right"><span class="meta">10:17</span></span></summary>\n' +
      '  <div class="body"><p>Ich übergebe.</p></div>\n</details>\n'
    const commentedBoard = fullBoard({ now: commented })
    expect(compareNowProjection(commentedBoard, [])).toMatchObject({ ok: true, idleCards: 1 })
    // BOTH halves, and the card survives byte for byte — "retire a card" is a
    // thing the RENDER does, so comparing alone cannot pin it (the final pass).
    const commentedRendered = reconcileNowProjection(commentedBoard, [], { stamp: '10:17' })
    expect(commentedRendered).toBe(commentedBoard)
    expect(commentedRendered).toContain('Ich übergebe.')

    const dataClass =
      '<details class="now" data-state="handover">\n  <summary><span class="t">Übergabe</span>' +
      `<span data-class="t">2026 ${'\u2014'} Übergabe</span>` +
      '<span class="right"><span class="meta">10:17</span></span></summary>\n' +
      '  <div class="body"><p>Weiter mit Punkt 734.</p></div>\n</details>\n'
    const dataClassBoard = fullBoard({ now: nowEntry(700, 'A', '20:07') + dataClass })
    expect(compareNowProjection(dataClassBoard, [700])).toMatchObject({ ok: true, strayCards: 0 })
    const dataClassRendered = reconcileNowProjection(dataClassBoard, [700], { stamp: '20:10' })
    expect(dataClassRendered).toContain('Weiter mit Punkt 734.')
    expect(dataClassRendered).toContain('data-state="handover"')
  })

  // The final pass of the same review, on the positive predicate: the meta
  // field went into the markup uninterpolated, so a caller-supplied stamp could
  // carry entity-encoded digits a browser renders as a point number — or markup
  // that this writer emits and its own authentication then refuses.
  it('gives the state card stamp one shape, at the writer and at the reader', () => {
    const decision = { title: AUTOMATIC_DECISION_TITLE, body: 'Der Batch läuft weiter.' }
    // A stamp that is not a clock time never reaches the markup — asserted on
    // what the meta field IS, not on the absence of one raw spelling: a writer
    // that merely ESCAPED the hostile stamp would still have embedded it and
    // still have passed a substring check (the closing pass of this case).
    const metaOf = (html) => (html.match(/<span class="meta">([\s\S]*?)<\/span>/) ?? [])[1]
    const smuggledStamp = applyDerivedStateCard(fullBoard({ now: '' }), decision, {
      stamp: 'Punkt &#57;&#51;&#53;',
    })
    expect(metaOf(smuggledStamp)).toMatch(/^\d{1,2}:\d{2}$/)
    expect(smuggledStamp).not.toMatch(/Punkt (&|&amp;)#57;/)
    // …and markup in the stamp neither ships nor breaks the card's own reading.
    const markupStamp = applyDerivedStateCard(fullBoard({ now: '' }), decision, { stamp: '<b>12:34</b>' })
    expect(metaOf(markupStamp)).toMatch(/^\d{1,2}:\d{2}$/)
    expect(markupStamp).not.toMatch(/(<|&lt;)b(>|&gt;)12:34/)
    // Both are still the machine's card: the render keeps them and adds the
    // zero claim beside them, and the comparison then agrees.
    for (const board of [smuggledStamp, markupStamp]) {
      const rendered = reconcileNowProjection(board, [], { stamp: '10:17' })
      expect(rendered).toContain('data-state="derived"')
      expect(compareNowProjection(rendered, [])).toMatchObject({ ok: true, emptyStateCount: 1 })
    }
    // An ordinary stamp is kept exactly as given.
    expect(applyDerivedStateCard(fullBoard({ now: '' }), decision, { stamp: '10:17' }))
      .toContain('<span class="meta">10:17</span>')
  })

  it('exempts the derived state card and demands the handover card really be one', () => {
    const board = applyDerivedStateCard(
      fullBoard({ now: nowEntry(700, 'A', '20:07') }),
      { title: PAUSED_TITLE, body: 'Der Stapel ist pausiert.' },
      { stamp: '20:10' },
    )
    expect(compareNowProjection(board, [700])).toMatchObject({ ok: true, strayCards: 0 })
    expect(() => reconcileNowProjection(board, [700], { stamp: '20:10' })).not.toThrow()

    const marked =
      '<details class="now" data-state="handover">\n  <summary><span class="num">700</span>' +
      '<span class="t">Getarnt</span></summary>\n  <div class="body"><p>Text.</p></div>\n</details>\n'
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') + marked }), [700]).ok).toBe(false)
    const empty =
      '<details class="now" data-state="handover">\n  <summary><span class="t">Leer</span></summary>\n' +
      '  <div class="body"></div>\n</details>\n'
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') + empty }), [700]))
      .toMatchObject({ ok: false, strayCards: 1 })

    // …and the derived card is held to the same standard (ninth round): the
    // reserved title alone used to buy the exemption, so any hand-written
    // unnumbered card could wear it and stand beside active work.
    const titleOnly =
      `<details class="now">\n  <summary><span class="t">${PAUSED_TITLE}</span></summary>\n` +
      '  <div class="body"><p>Von Hand.</p></div>\n</details>\n'
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') + titleOnly }), [700]))
      .toMatchObject({ ok: false, strayCards: 1 })
  })

  // Sixth cross-vendor round: the reorder ran over the SURVIVING cards alone,
  // so the moment the focus moved to a strand that was only now being opened,
  // the older card stayed first and contradicted the stated order.
  it('puts the focused card first even when that point is only now getting its card', () => {
    const before = fullBoard({ now: nowEntry(711, 'Älter', '19:00') })
    const out = reconcileNowProjection(before, [711, 713], { focusPoint: 713, stamp: '20:10' })
    // The surviving card keeps its legacy "711 — …" title shape, so both forms
    // are read out of the section by position rather than by one markup.
    const order = [...out.matchAll(/<span class="(?:num|t)">\s*(711|713)\b/g)].map((m) => Number(m[1]))
    expect(order).toEqual([713, 711])
    expect(out).toContain('Älter')
  })

  it('accepts verified zero only through the parser-distinct non-card state', () => {
    const idle = fullBoard({ now: NOW_EMPTY_STATE_MARKUP })
    expect(compareNowProjection(idle, [])).toMatchObject({ ok: true, emptyStateCount: 1 })
    expect(claimsNoCurrentWork(idle)).toBe(true)
    expect(idle).toContain(NOW_EMPTY_STATE_TEXT)
    expect(compareNowProjection(fullBoard(), []).ok).toBe(false)
    expect(compareNowProjection(fullBoard({ now: handover }), []).ok).toBe(false)
  })

  it('accepts verified zero through the one authored idle card, never a mixed or stacked form', () => {
    const idleReason =
      `<details class="now" data-state="idle">\n  <summary><span class="t">${NO_CURRENT_WORK_TITLE}</span>` +
      '<span class="right"><span class="meta">16:45</span></span></summary>\n' +
      '  <div class="body">\n<p><span class="stamp">Stand 16:45</span> Sitzungsgrenze; der Nachfolger nimmt ' +
      'Punkt 707.</p>\n  </div>\n</details>\n'
    expect(compareNowProjection(fullBoard({ now: idleReason }), []))
      .toMatchObject({ ok: true, idleCards: 1, emptyStateCount: 0 })
    // The written card and the generic element side by side contradict each other,
    // and a stacked pair is the point-470 defect — both stay unpublishable.
    expect(compareNowProjection(fullBoard({ now: idleReason + NOW_EMPTY_STATE_MARKUP }), []).ok).toBe(false)
    expect(compareNowProjection(fullBoard({ now: idleReason + idleReason }), []).ok).toBe(false)
    // An idle card claims a stop; beside expected active work it is wrong —
    // even when the numbered set is exactly right, the board would say two
    // things at once, so the pair is unpublishable (second cross-vendor round).
    expect(compareNowProjection(fullBoard({ now: idleReason }), [700])).toMatchObject({ ok: false, missing: [700] })
    expect(compareNowProjection(fullBoard({ now: nowEntry(700, 'Kontext', '20:07') + idleReason }), [700]))
      .toMatchObject({ ok: false, idleCards: 1 })
    expect(() => reconcileNowProjection(fullBoard({ now: nowEntry(700, 'Kontext', '20:07') + idleReason }), [700]))
      .toThrow(/beside the standing[\s\S]*nothing is running/)
  })

  it('replaces a LONE idle card when work resumes — the publish path renders the transition', () => {
    // Idleness ends, work resumes: the declaration names a point while the
    // board still carries only the handover card. The render must produce the
    // derived stub — a throw here killed exactly this transition for
    // board-publish and land-point (fourth cross-vendor round).
    const idleReason =
      `<details class="now" data-state="idle">\n  <summary><span class="t">${NO_CURRENT_WORK_TITLE}</span>` +
      '<span class="right"><span class="meta">16:45</span></span></summary>\n' +
      '  <div class="body">\n<p><span class="stamp">Stand 16:45</span> Sitzungsgrenze; der Nachfolger nimmt ' +
      'Punkt 700.</p>\n  </div>\n</details>\n'
    const { html, comparison } = projectNowForPublish(
      fullBoard({ now: idleReason, queue: queueEntry(700, 'Wartend', '~2 h') }),
      { ok: true, points: [700], focusPoint: 700 },
    )
    expect(comparison).toMatchObject({ ok: true, idleCards: 0, emptyStateCount: 0 })
    // The stub keeps the name its queue card gave the point (user 05.10.2026).
    expect(html).toContain('<span class="num">700</span><span class="t">Wartend</span>')
    expect(html).not.toContain('Text für diesen Punkt fehlt noch')
    expect(html).not.toContain(NO_CURRENT_WORK_TITLE)
    // The AUTHORED handover prose survives the transition — carried into the
    // created stub, never dropped with the idle card (point 491's lesson;
    // fifth cross-vendor round, pass 2).
    expect(html).toContain('Sitzungsgrenze; der Nachfolger nimmt Punkt 700.')
  })

  it('carries the idle prose into the FIRST stub only when several points resume at once', () => {
    const idleReason =
      `<details class="now" data-state="idle">\n  <summary><span class="t">${NO_CURRENT_WORK_TITLE}</span>` +
      '<span class="right"><span class="meta">16:45</span></span></summary>\n' +
      '  <div class="body">\n<p><span class="stamp">Stand 16:45</span> Sitzungsgrenze; der Nachfolger nimmt ' +
      'Punkt 700.</p>\n  </div>\n</details>\n'
    const out = reconcileNowProjection(fullBoard({ now: idleReason }), [700, 697], { focusPoint: 700, stamp: '20:10' })
    expect(out.match(/Sitzungsgrenze; der Nachfolger nimmt Punkt 700\./g)).toHaveLength(1)
    const at = out.indexOf('Sitzungsgrenze')
    expect(at).toBeGreaterThan(out.indexOf('<span class="num">700</span>'))
    expect(at).toBeLessThan(out.indexOf('<span class="num">697</span>'))
    expect(compareNowProjection(out, [700, 697]).ok).toBe(true)
  })

  // Ninth cross-vendor round: an unclosed now-section quietly swallowed the
  // rest of the document — a fail-open under a preflight that must fail closed.
  // The section end is COUNTED now, so a card's own closer cannot pass for the
  // wrapper's: the second case keeps one card and removes only the wrapper's
  // close, which the `lastIndexOf('</details>')` reading accepted.
  it('refuses a now-section that is never closed instead of swallowing the rest', () => {
    const damaged =
      `<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n` +
      `${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`
    expect(() => reconcileNowProjection(damaged, [700])).toThrow(/is never closed/)
    expect(compareNowProjection(damaged, [700]).ok).toBe(false)

    // …and a CARD's closer is not the wrapper's: the section holds one card and
    // its own close is gone, which the last-closer reading blessed.
    const cardButNoClose =
      `<main>\n<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n` +
      `${nowEntry(700, 'A', '20:07')}${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`
    expect(() => reconcileNowProjection(cardButNoClose, [700])).toThrow(/is never closed/)
    expect(compareNowProjection(cardButNoClose, [700]).ok).toBe(false)
  })

  // Ninth cross-vendor round: the render puts the focused strand first, but the
  // comparison never looked at the focus — so the fail-closed preflight blessed
  // a board whose focus named a point with no card, or stood behind another.
  it('checks the focus the render orders by, in both halves of the invariant', () => {
    const two = fullBoard({ now: `${nowEntry(711, 'B', '20:07')}${nowEntry(700, 'A', '20:07')}` })

    expect(compareNowProjection(two, [711, 700], { focusPoint: 711 })).toMatchObject({ ok: true })
    expect(compareNowProjection(two, [711, 700], { focusPoint: 700 })).toMatchObject({
      ok: false,
      focusMisplaced: true,
      focusPoint: 700,
    })
    expect(compareNowProjection(two, [711, 700], { focusPoint: 697 })).toMatchObject({
      ok: false,
      focusUnrepresented: true,
    })
    // …and the fail-closed preflight refuses the same state by name.
    expect(() => projectNowForPublish(two, { ok: true, points: [711, 700], focusPoint: 697 }))
      .toThrow(/the focus names point 697, which has no card/)
  })

  it('refuses a document without the now-section heading in both render and comparison', () => {
    // The lenient slice used to treat the WHOLE document as the now-section:
    // the render mutated foreign sections and the comparison blessed the
    // result, so the fail-closed preflight was open (fifth cross-vendor
    // round, pass 2). A missing heading refuses in both halves.
    const noSection =
      `<main>\n${sect('Von dir zu klären', '')}${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`
    expect(() => reconcileNowProjection(noSection, [700])).toThrow(/section not found: now/)
    expect(() => reconcileNowProjection(noSection, [])).toThrow(/section not found: now/)
    expect(compareNowProjection(noSection, [700]))
      .toMatchObject({ ok: false, error: expect.stringMatching(/section heading is missing/) })
    // A bare card fragment no longer passes as its own section either.
    expect(compareNowProjection(nowEntry(700, 'A', '20:07'), [700]).ok).toBe(false)
    expect(() => projectNowForPublish(noSection, { ok: true, points: [700], focusPoint: 700 }))
      .toThrow(/refusing to project the now-section/)
  })

  it('a findable heading OUTSIDE its sect wrapper is no section — the foreign region after it is never sliced', () => {
    // Seventh cross-review: the fail-closed path checked only indexOf(HEAD.now),
    // so a heading orphaned by damage — or standing unescaped inside a card's
    // prose — made the FOREIGN region after it the "now-section": the render
    // could project there and the comparison confirmed it.
    const heading = '<summary><h2>Woran ich gerade arbeite</h2></summary>'
    // (1) Orphaned: the heading stands bare, its wrapper gone; the queue
    // section follows it.
    const orphaned =
      `<main>\n${heading}\n${sect('Von dir zu klären', '')}` +
      `${sect('Warteschlange', queueEntry(700, 'Wartend', '~2 h'))}${sect('Erledigt', '')}</main>\n`
    expect(() => reconcileNowProjection(orphaned, [700])).toThrow(/stands outside its <details class="sect"> wrapper/)
    const compared = compareNowProjection(orphaned, [700])
    expect(compared).toMatchObject({ ok: false, error: expect.stringMatching(/section heading is missing/) })
    // (2) Inside card prose: the real section is gone, a card in another
    // section QUOTES the heading unescaped — still no section.
    const quoted = fullBoard({
      vdzk: `<details>\n  <summary><span class="t">Zitat</span></summary>\n` +
        `  <div class="body">\n    <p>${heading}</p>\n  </div>\n</details>\n`,
    }).replace(sect('Woran ich gerade arbeite', ''), '')
    expect(() => reconcileNowProjection(quoted, [700])).toThrow(/refusing to project the now-section/)
    expect(compareNowProjection(quoted, [700]).ok).toBe(false)
    // (3) Beside the intact section, a quoted duplicate changes nothing: the
    // wrapper decides, so the real section still renders and compares.
    const intact = fullBoard({
      now: nowEntry(700, 'Echt', '20:07'),
      vdzk: `<details>\n  <summary><span class="t">Zitat</span></summary>\n` +
        `  <div class="body">\n    <p>${heading}</p>\n  </div>\n</details>\n`,
    })
    expect(compareNowProjection(intact, [700]).ok).toBe(true)
  })

  it('accepts a heading behind ANY amount of whitespace inside its wrapper — depth of indent is not damage', () => {
    // Eighth cross-review: the orphan check capped its lookback at 32
    // characters, so a legitimately deep indent between `<details
    // class="sect">` and its heading was refused as structural damage. Only
    // the CONTENT between wrapper and heading decides: whitespace of any
    // length is formatting, one non-whitespace character is an orphan.
    const heading = '<summary><h2>Woran ich gerade arbeite</h2></summary>'
    const rest = `${sect('Von dir zu klären', '')}${sect('Warteschlange', '')}${sect('Erledigt', '')}`
    const withGap = (gap) =>
      `<main>\n<details class="sect">${gap}${heading}\n${nowEntry(700, 'Echt', '20:07')}</details>\n${rest}</main>\n`
    // The everyday pretty-print form: newline plus a small indent.
    expect(compareNowProjection(withGap('\n  '), [700]).ok).toBe(true)
    // The reviewer's exact failing layout: more than 32 whitespace characters.
    expect(compareNowProjection(withGap(`\n${' '.repeat(48)}`), [700]).ok).toBe(true)
    expect(() => reconcileNowProjection(withGap(`\n${' '.repeat(48)}`), [700])).not.toThrow()
    // Mixed whitespace far beyond the old cap stays formatting too.
    expect(compareNowProjection(withGap(`\n\t${'  \t'.repeat(20)}\n`), [700]).ok).toBe(true)
    // The other direction holds: ONE non-whitespace character between wrapper
    // and heading is still an orphaned heading, however far back the wrapper.
    expect(compareNowProjection(withGap(`\n<p>x</p>\n${' '.repeat(48)}`), [700]))
      .toMatchObject({ ok: false, error: expect.stringMatching(/section heading is missing/) })
  })

  it('creates missing stubs, removes stale cards and preserves surviving prose byte for byte', () => {
    const authored = nowEntry(700, 'Die Übergabe', '20:07', 'Umlaute, <a href="/x">Link</a> und Text.')
    const before = fullBoard({
      now: authored + nowEntry(699, 'Alt', '19:00'),
      queue: queueEntry(697, 'Wartend', '~2 h') + queueEntry(711, 'Wartend', '~1 h'),
    })
    const out = reconcileNowProjection(before, [700, 697, 711], { focusPoint: 700, stamp: '20:10' })
    expect(out).toContain(authored)
    expect(out).not.toContain('699 — Alt')
    expect(out.match(/data-state="stub"/g)).toHaveLength(2)
    expect(out.match(/<span class="t">Wartend<\/span>/g)).toHaveLength(2)
    expect(parseQueuePoints(out)).toEqual(new Set())
    expect(compareNowProjection(out, [700, 697, 711]).ok).toBe(true)
  })

  it('refuses any reconciliation path that would rewrite or blank authored prose', () => {
    const before = fullBoard({ now: nowEntry(700, 'Text', '20:07', 'Bleibt erhalten.') })
    expect(() => reconcileNowProjection(before, [700], {
      transformExisting: (card) => card.replace('Bleibt erhalten.', ''),
    })).toThrow(/rewrite or blank authored prose.*700/)
  })

  // User 05.10.2026: a stub titled only "Text für diesen Punkt fehlt noch"
  // hid for hours what was being worked on, although the queue card the
  // projection removed had named the point.
  it('names a new stub from its queue card and carries the queue prose into its description', () => {
    const before = fullBoard({ queue: queueEntry(1295, 'Laufende Dorfbewohner', '~3 h') })
    const out = reconcileNowProjection(before, [1295], {
      focusPoint: 1295,
      stamp: '11:00',
      queueData: { points: { 1295: { title: 'Anderer Titel', body: ['Anderer Text.'] } } },
      titles: { 1295: 'Walking villagers' },
    })
    expect(out).toContain('<span class="num">1295</span><span class="t">Laufende Dorfbewohner</span>')
    expect(out).toContain('data-state="stub"')
    expect(out).toContain('<p class="desc">Warum das ansteht.</p>')
    expect(out).not.toContain('Text für diesen Punkt fehlt noch')
    expect(out).not.toContain('Anderer')
    expect(parseQueuePoints(out)).toEqual(new Set())
    expect(compareNowProjection(out, [1295]).ok).toBe(true)
    expect(reconcileNowProjection(out, [1295], { focusPoint: 1295, stamp: '12:00' })).toBe(out)
  })

  it('keeps decimal and hexadecimal entities of a copied queue title intact', () => {
    const before = fullBoard({ queue: queueEntry(700, 'Ma&#xDF;nahmen &#223; &amp; mehr', '~1 h') })
    const out = reconcileNowProjection(before, [700], { stamp: '11:00' })
    expect(out).toContain('<span class="num">700</span><span class="t">Ma&#xDF;nahmen &#223; &amp; mehr</span>')
    expect(out).not.toContain('&amp;#')
  })

  it('names a stub from the queue data file when no queue card stands, title else first body line', () => {
    const queueData = {
      points: {
        700: { title: 'Titel aus der Datei', body: ['Erster Absatz.', 'Zweiter <Absatz>.'] },
        697: { body: ['Nur ein Text, der als Titel dient.'] },
      },
    }
    const out = reconcileNowProjection(fullBoard(), [700, 697], { focusPoint: 700, stamp: '11:00', queueData })
    expect(out).toContain('<span class="num">700</span><span class="t">Titel aus der Datei</span>')
    expect(out).toContain('<p class="desc">Erster Absatz.</p>')
    expect(out).toContain('Zweiter &lt;Absatz&gt;.')
    expect(out).toContain('<span class="num">697</span><span class="t">Nur ein Text, der als Titel dient.</span>')
    expect(out).not.toContain('Text für diesen Punkt fehlt noch')
    expect(compareNowProjection(out, [700, 697]).ok).toBe(true)
  })

  it('falls back to the work-order headline, then to the placeholder', () => {
    const out = reconcileNowProjection(fullBoard(), [700, 697], {
      focusPoint: 700,
      stamp: '11:00',
      titles: { 700: 'Board now-card stub keeps the point name' },
    })
    expect(out).toContain('<span class="num">700</span><span class="t">Board now-card stub keeps the point name</span>')
    expect(out).toContain('<span class="num">697</span><span class="t">Text für diesen Punkt fehlt noch</span>')
    expect(out.match(/Text für diesen Punkt fehlt noch/g)).toHaveLength(1)
    expect(out).not.toContain('Aus der Warteschlange')
    expect(compareNowProjection(out, [700, 697]).ok).toBe(true)
  })

  it('skips a queue card that names nothing — the "Punkt N" fallback and the stub body', () => {
    const escaped = QUEUE_STUB_BODY.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const stubCard = queueEntry(700, 'Punkt 700', '~? h').replace('Warum das ansteht.', escaped)
    const out = reconcileNowProjection(fullBoard({ queue: stubCard }), [700], {
      stamp: '11:00',
      titles: { 700: 'Headline' },
    })
    expect(out).toContain('<span class="num">700</span><span class="t">Headline</span>')
    expect(out).not.toContain('Aus der Warteschlange')
  })

  it('passes the queue data and headlines through the publish preflight', () => {
    const { html, comparison } = projectNowForPublish(
      fullBoard(),
      { ok: true, points: [700], focusPoint: 700 },
      { stamp: '11:00', queueData: { points: { 700: { title: 'Aus der Datei' } } }, titles: { 700: 'Headline' } },
    )
    expect(html).toContain('<span class="t">Aus der Datei</span>')
    expect(comparison).toMatchObject({ ok: true })
  })

  it('puts focus first, keeps other survivors stable and is byte-idempotent', () => {
    const before = fullBoard({
      now: nowEntry(700, 'A', '20:07') + nowEntry(697, 'B', '20:08'),
      queue: queueEntry(711, 'C', '~1 h'),
    })
    const once = reconcileNowProjection(before, [700, 697, 711], { focusPoint: 697, stamp: '20:10' })
    expect([...parseNowCardPoints(once)]).toEqual([697, 700, 711])
    expect(reconcileNowProjection(once, [700, 697, 711], { focusPoint: 697, stamp: '20:10' })).toBe(once)
  })

  it('renders verified zero by removing stale numbered cards', () => {
    const out = reconcileNowProjection(fullBoard({ now: nowEntry(700, 'A', '20:07') }), [])
    expect(out).not.toContain('700 — A')
    expect(out).toContain(NOW_EMPTY_STATE_MARKUP)
    expect(compareNowProjection(out, []).ok).toBe(true)
  })

  it('reports an active point duplicated into a WAITING section, never into the archive', () => {
    const queued = fullBoard({ now: nowEntry(700, 'A', '20:07'), queue: queueEntry(700, 'A', '20:09') })
    expect(compareNowProjection(queued, [700])).toMatchObject({
      ok: false,
      crossSection: [{ point: 700, sections: ['Warteschlange'] }],
    })
    // Sixth cross-vendor round: Erledigt is HISTORY. `toDone` states that a
    // point comes back into current work when a boundary or a follow-up
    // reopens it and keeps its one archive card, so reading that card as a
    // conflict made every reopened point unpublishable.
    const reopened = fullBoard({ now: nowEntry(700, 'A', '20:07'), done: queueEntry(700, 'A', '20:09') })
    expect(compareNowProjection(reopened, [700])).toMatchObject({ ok: true, crossSection: [] })
  })

  it('fails publish closed on an unreadable source without mutating the input', () => {
    const before = fullBoard({ now: nowEntry(700, 'A', '20:07') })
    expect(() => projectNowForPublish(before, { ok: false, points: [], errors: ['broken JSON'] }))
      .toThrow(/source unresolved.*broken JSON/)
    expect(before).toContain('700 — A')
  })

  it('projects the publish-time active set and keeps the surviving authored prose', () => {
    const authored = nowEntry(700, 'Kontext', '20:07', 'Bleibt genau so stehen.')
    const before = fullBoard({ now: authored, queue: queueEntry(697, 'Wartend', '~2 h') + queueEntry(711, 'Wartend', '~1 h') })
    const { html, comparison } = projectNowForPublish(before, { ok: true, points: [700, 697, 711], focusPoint: 700 })
    expect(html).toContain('<span class="t">700 — Kontext</span>')
    expect(html).toContain('Bleibt genau so stehen.')
    expect(html.match(/data-state="stub"/g)).toHaveLength(2)
    expect(html.match(/<span class="t">Wartend<\/span>/g)).toHaveLength(2)
    expect(comparison).toMatchObject({ ok: true })
  })

  it('refuses verified zero when only an authored handover card stands there', () => {
    expect(() => projectNowForPublish(fullBoard({ now: handover }), { ok: true, points: [], focusPoint: null }))
      .toThrow(/refusing to replace an authored unnumbered non-idle card/)
  })

  it('publishes the handover reason written by done --none instead of blanking it', () => {
    const before = fullBoard({ now: nowEntry(713, 'Abgeleitete Jetzt-Sektion', '10:07 · ~14:30') })
    const edited = closeCard(before, 713, {
      text: 'Fertig.',
      end: '16:45',
      none: 'Sitzungsgrenze; der Nachfolger nimmt Punkt 707.',
    })

    expect(claimsNoCurrentWork(edited)).toBe(true)
    const { html, comparison } = projectNowForPublish(edited, { ok: true, points: [], focusPoint: null })
    // The render never blanks text a session wrote: the authored idle card
    // survives with its reason, and the generic element stays the fallback
    // for a section where nobody wrote anything.
    expect(html).toContain(NO_CURRENT_WORK_TITLE)
    expect(html).toContain('Sitzungsgrenze; der Nachfolger nimmt Punkt 707.')
    expect(html).not.toContain(NOW_EMPTY_STATE_MARKUP)
    expect(comparison).toMatchObject({ ok: true, emptyStateCount: 0, unnumberedCards: 1, idleCards: 1 })
  })
})

// The closing card is a STATE the publish projection must carry (point 544;
// regression via point 713): it wears the chip of a point that is ticked by
// design, and reading that chip as numbered work made the render delete the
// one card whose whole job is to stand after the tick — board.mjs closing
// reported success while the published board claimed idleness, and the
// board-first gate then denied every closing duty.
describe('the closing card survives the derived publish projection', () => {
  const closingBoard = (extra = '') =>
    toClosingWork(fullBoard({ now: extra }), 967, {
      subject: 'Kompakter Kartenkopf',
      reason: 'Branch-Cleanup und Punktgrenze stehen noch aus.',
      stamp: '12:16',
    })

  it('keeps the closing card byte for byte and adds no empty element', () => {
    const { html, comparison } = projectNowForPublish(closingBoard(), { ok: true, points: [], focusPoint: null })
    expect(html).toContain('data-state="closing"')
    expect(html).toContain('Branch-Cleanup und Punktgrenze stehen noch aus.')
    expect(html).not.toContain(NOW_EMPTY_STATE_MARKUP)
    expect(comparison).toMatchObject({ ok: true, closingCards: 1, extra: [], unknown: [] })
    expect(claimsNoCurrentWork(html)).toBe(false)
    expect(claimsClosingWork(html)).toBe(true)
  })

  it('lets the focus still naming the ticked point be represented by its closing card', () => {
    const { comparison } = projectNowForPublish(closingBoard(), { ok: true, points: [], focusPoint: 967 })
    expect(comparison).toMatchObject({ ok: true, focusUnrepresented: false, focusMisplaced: false })
  })

  it('refuses to render active work beside the standing closing card', () => {
    const beside = closingBoard()
    expect(() => reconcileNowProjection(beside, [700]))
      .toThrow(/beside the standing closing card/)
    expect(compareNowProjection(beside, [700])).toMatchObject({ ok: false, closingBesideWork: true })
  })

  it('normalises a duplicated closing card to one and refuses the stack in the comparison', () => {
    const single = closingBoard()
    const card = closingWorkCards(single)[0]
    const doubled = single.replace(card, card + card)
    expect(compareNowProjection(doubled, [])).toMatchObject({ ok: false, duplicateClosing: true })
    const { html, comparison } = projectNowForPublish(doubled, { ok: true, points: [], focusPoint: null })
    expect(closingWorkCards(html)).toHaveLength(1)
    expect(comparison).toMatchObject({ ok: true })
  })

  it('still refuses the empty element stacked beside the closing card', () => {
    const stacked = closingBoard().replace(
      '<details class="now" data-state="closing"',
      `${NOW_EMPTY_STATE_MARKUP}\n<details class="now" data-state="closing"`,
    )
    expect(compareNowProjection(stacked, [])).toMatchObject({ ok: false })
  })
})

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
    expect(out).toContain('<span class="num">369</span><span class="t">Ein verwaistes Jungtier</span>')
    expect(out).toContain('<span class="meta">16:20 · ~18:20</span>')
    expect(out).toContain('<span class="stamp">Stand 16:20</span> Neu angesetzt.')
  })

  it('writes a numeric chip for a four-digit point that the bounded free-title reader would reject', () => {
    const source = fullBoard({ queue: queueEntry(1002, 'Verbundarbeit', '~2 h') })
    const out = toNow(source, 1002, 'Angefangen.', { stamp: '16:20' })
    expect(out).toContain('<span class="num">1002</span><span class="t">Verbundarbeit</span>')
    const now = parseCards(sliceSections(out).sections['Woran ich gerade arbeite'])
    expect(now[0].points).toEqual([1002])
  })

  it('leaves no queue card behind — the double-listing the guard blocks on', () => {
    const out = toNow(board(), 369, 'x', { stamp: '16:20' })
    expect(queueCard(out, 369)).toBeNull()
    expect(out.indexOf('class="num">369')).toBeLessThan(out.indexOf('Warteschlange'))
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

  it('throws only when the point is NOWHERE on the board — the typo case', () => {
    expect(() => toQueue(board(), 999)).toThrow(/nowhere on the board/)
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

  it('folds a SECOND archiving into the card that is already there (user 18.08.2026)', () => {
    // Point 700 stood in Erledigt four times: it came back into current work at
    // every session boundary, and each archiving appended another card.
    const first = toDone(board(), 365, { text: 'Erste Runde.', end: '11:00' })
    const reopened = fullBoard({
      now: nowEntry(365, 'Der Preis eines Punktes', '12:00 · ~13:00'),
      done: doneCards(first, 365)[0],
    })
    const again = toDone(reopened, 365, { text: 'Zweite Runde.', end: '13:30' })
    expect(doneCards(again, 365)).toHaveLength(1)
    // The EARLIEST start survives and the newest end and text win.
    expect(again).toContain('<span class="meta">10:07 · 13:30</span>')
    expect(again).toContain('<p>Zweite Runde.</p>')
    expect(again).not.toContain('<p>Erste Runde.</p>')
  })

  it('replaces an archive card after publishing grouped its header', () => {
    const source = fullBoard({
      now: nowEntry(365, 'Der Preis eines Punktes', '12:00 · ~14:30'),
      done: queueEntry(365, 'Vorige Runde', '08:00 · 09:00'),
    })
    const grouped = renderCardCriticalities(
      source,
      '- [x] 365. Der Preis eines Punktes\n  Criticality: high — reviewed.',
    )
    const entries = doneEntries(grouped)
    const doneHead = '<summary><h2>Erledigt</h2></summary>'
    const section = grouped.slice(grouped.indexOf(doneHead) + doneHead.length)

    expect(entries).toHaveLength(1)
    expect(entries[0].text).toContain('<span class="card-header-left"><span class="num">365</span>')
    // `at` remains an offset into the grouped source section; parsing through
    // an unwrapped copy would make every slicing consumer edit the wrong bytes.
    expect(section.slice(entries[0].at, entries[0].at + entries[0].text.length)).toBe(entries[0].text)

    const out = toDone(grouped, 365, { text: 'Zweite Runde.', end: '16:45' })
    expect(doneCards(out, 365)).toHaveLength(1)
    expect(out).toContain('<span class="meta">08:00 · 16:45</span>')
    expect(out).toContain('<p>Zweite Runde.</p>')
    expect(out).not.toContain('<p>Warum das ansteht.</p>')
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
    expect(out).toContain('<span class="num">416</span><span class="t">Die leere Tafel</span>')
    expect(out).toContain('<span class="meta">10:07 · 16:45</span>') // the archived card
    expect(queueCard(out, 416)).toBeNull() // …and the queue card is gone
  })

  it('names the gap with --none when there is genuinely nothing to promote', () => {
    const out = closeCard(board(), 300, { end: '16:45', text: 'Fertig.', none: 'Sitzungsgrenze; der Nachfolger nimmt Punkt 417.' })
    expect(hasCurrentWork(out)).toBe(true)
    expect(out).toContain(NO_CURRENT_WORK_TITLE)
    expect(out).toContain('Sitzungsgrenze; der Nachfolger nimmt Punkt 417.')
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
      closeCard(board(), 300, { text: 'Fertig.', end: '16:45', none: 'Warteschlange leer; als Nächstes Punkt 416.' }),
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
  const designQuestion = (question) => `User-owned category: design-content.\n${question}`

  it('puts the card at the TOP of the section, with the title alone in the header', () => {
    const out = addVdzk(fullBoard({ vdzk: vdzkEntry('Ältere Frage') }), 'Kartenschrift wählen', designQuestion('Enge, weite oder gemischte Variante?'))
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
    const out = addVdzk(fullBoard({}), '<Titel der Frage>', designQuestion('Soll die Fassung A & B <oder> C gelten?'))
    const cards = parseCards(sliceSections(out).sections['Von dir zu klären'])
    expect(cards[0].title).toBe('&lt;Titel der Frage&gt;')
    expect(cards[0].body).toContain('&amp;')
  })

  it('REFUSES a status report from either call shape and names the section it belongs in', () => {
    const b = fullBoard({ vdzk: '' })
    const report = 'Der Batch hat sich selbst pausiert, weil ein Alarm fünfmal unbeantwortet blieb.'
    expect(() => addVdzk(b, 'Batch pausiert', report, { automated: true })).toThrow(/not an admissible user decision/)
    expect(() => addVdzk(b, 'Batch pausiert', report, { automated: true })).toThrow(/Woran ich gerade arbeite/)
    expect(() => addVdzk(b, 'Batch pausiert', report)).toThrow(/User-owned category/)
  })

  it('admits the point-864 decision record from an automated caller', () => {
    const out = addVdzk(
      fullBoard({ vdzk: '', log: '' }),
      'Entscheidungsprotokoll: Rasterung der Höhenkarte',
      'Entscheidung: Die Höhenkarte wird neu gerastert. Evidenz: Die Messung ist eindeutig. ' +
        'Folge: Die neue Rasterung wird bereits verwendet. Deine Möglichkeiten: die Entscheidung stehen lassen, ' +
        'oder sie zurücknehmen — exakte Veto-Aktion: antworte „Veto Rasterung".',
      { automated: true },
    )
    expect(out).toContain('Entscheidungsprotokoll: Rasterung der Höhenkarte')
  })

  it('judges the authority tag but keeps it off the German card', () => {
    const out = addVdzk(fullBoard({}), 'Kartenschrift wählen', designQuestion('Soll die enge oder die weite Variante gelten?'))
    const cards = parseCards(sliceSections(out).sections['Von dir zu klären'])
    expect(cards[0].body).toContain('Soll die enge oder die weite Variante gelten?')
    expect(cards[0].body).not.toContain('User-owned category')
    expect(cards[0].body).not.toContain('design-content')
  })

  it('refuses a card with no title or no question — an empty card asks nothing', () => {
    const b = fullBoard({ vdzk: '' })
    expect(() => addVdzk(b, '', 'Die Frage.')).toThrow(/needs a title/)
    expect(() => addVdzk(b, 'Ein Titel', '   ')).toThrow(/needs the question itself/)
  })

  it('refuses a title that already stands, names it, and accepts a distinguishable one', () => {
    const once = addVdzk(fullBoard({}), 'Kartenschrift wählen', designQuestion('Soll die enge oder die weite Variante gelten?'))
    expect(() => addVdzk(once, 'Kartenschrift wählen', designQuestion('Soll dieselbe enge oder weite Variante gelten?'))).toThrow(
      /"Kartenschrift wählen" already stands/,
    )

    const distinct = addVdzk(once, 'Kartenschrift für Überschriften wählen', designQuestion('Soll die enge oder die weite Variante gelten?'))
    const cards = parseCards(sliceSections(distinct).sections['Von dir zu klären'])
    expect(cards.map((card) => card.title)).toEqual([
      'Kartenschrift für Überschriften wählen',
      'Kartenschrift wählen',
    ])
  })

  it('never touches another section', () => {
    const out = addVdzk(fullBoard({ queue: queueEntry(372, 'Ein Befehl', '~2 h') }), 'Eine Frage', designQuestion('Soll die erste oder die zweite Fassung gelten?'))
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

// ═══ Point 700 — THE HANDOVER STATE IS LEGITIMATE, and the audit knows it ═══
// Measured 17.08.2026, twice, on the live board: while the unnumbered handover
// card stood where a numbered now-card had been, the unit layer went red
// (`dup-in-section`) — and because the pre-push gate runs this layer, the
// refusal landed on the session's LAST bookkeeping, the most expensive moment
// there is; one commit was dropped rather than fought for. THE DECISION PINNED
// HERE: the unnumbered gap card is the SANCTIONED state of a board whose
// session is ending (points 439/470/655 built it deliberately) — the audit
// passes it, the live-board sweep SKIPS it (no now-point to move), and the
// sanctioned moves into that state cannot mint a duplicate. A numbered card is
// NOT owed during a handover.
describe('point 700 — the handover state cannot block the handover', () => {
  const running = () =>
    `<details class="now">\n  <summary><span class="num">700</span><span class="t">Die Kontextmarke</span>` +
    `<span class="right"><span class="meta">18:04 · ~23:04</span></span></summary>\n` +
    `  <div class="body">\n    <p><span class="stamp">Stand 16:20</span> läuft</p>\n  </div>\n</details>\n`
  const audit = (doc) => auditDashboard(doc, { open: [], done: [] }).map((v) => v.code)

  it('a POINT handover (done --none) leaves a board the audit passes, the gap card standing', () => {
    const before = fullBoard({ now: running(), queue: queueEntry(701, 'Nächster Punkt', '~2 h') })
    const after = closeCard(before, 700, {
      text: 'Fertig; übergeben.',
      end: '19:00',
      none: 'Der Punkt ist abgeschlossen; der Nachfolger nimmt Punkt 701.',
    })
    // `archive-link-missing` is the fixture's, not the move's: the synthetic
    // Erledigt section has no archive link for its first-ever card to sit under.
    const added = audit(after).filter((c) => !audit(before).includes(c) && c !== 'archive-link-missing')
    expect(added).toEqual([])
    expect(claimsNoCurrentWork(after)).toBe(true)
  })

  it('a CONTEXT handover (queue back, then the gap card) duplicates nothing', () => {
    const before = fullBoard({ now: running(), queue: queueEntry(701, 'Nächster Punkt', '~2 h') })
    const returned = toQueue(before, 700)
    const after = toNoCurrentWork(returned, 'Wasserstandsmarke erreicht; der Nachfolger nimmt Punkt 700 wieder auf.', {
      stamp: '19:01',
    })
    expect(audit(after)).not.toContain('dup-in-section')
    expect([...parseQueuePoints(after)]).toEqual([700, 701])
  })

  it('the gap card contributes NO now-point, so the live sweep skips instead of moving a card that is not there', () => {
    const after = toNoCurrentWork(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }),
      'Übergabe; der Nachfolger nimmt Punkt 701.', { stamp: '19:01' })
    expect([...parseNowCardPoints(after)]).toEqual([])
  })

  it('toQueue HONOURS text and estimate on the standing card — an update is never swallowed (Sol finding 5)', () => {
    const drifted = fullBoard({
      now: running(),
      queue: queueEntry(700, 'Die Kontextmarke', '~5 h') + queueEntry(701, 'Nächster Punkt', '~2 h'),
    })
    const updated = toQueue(drifted, 700, { text: 'Zurückgestellt: Übergabe an den Nachfolger.', estimate: '~3 h' })
    expect([...parseQueuePoints(updated)]).toEqual([700, 701])
    // Judged on the 700 CARD, not the document — the 701 fixture card shares
    // the stub body, which must survive untouched.
    const card700 = queueCard(updated, 700)
    expect(card700).toContain('Zurückgestellt: Übergabe an den Nachfolger.')
    expect(card700).toContain('~3 h')
    expect(card700).not.toContain('~5 h')
    // The standing card's prose is its DESCRIPTION, which an update keeps;
    // the text replaces its status.
    expect(card700).toContain('<p class="desc">Warum das ansteht.</p>')
    expect(card700.split('<hr class="split">')[1]).not.toContain('Warum das ansteht.')
    expect(queueCard(updated, 701)).toContain('Warum das ansteht.')
    // A partial update keeps the standing card's OTHER half.
    const textOnly = queueCard(toQueue(drifted, 700, { text: 'Nur neuer Text.' }), 700)
    expect(textOnly).toContain('Nur neuer Text.')
    expect(textOnly).toContain('~5 h')
    // …and the SECOND identical call is a NO-OP SUCCESS (Sol review of
    // 534c2ba, finding 5): the desired end state already holds, and the last
    // bookkeeping of a session must never be blocked by the session ending.
    const once = toQueue(drifted, 700)
    expect(toQueue(once, 700)).toBe(once)
    // A repeat WITH an update still lands on the standing card.
    const repeatUpdated = queueCard(toQueue(once, 700, { text: 'Doch noch ein Nachtrag.' }), 700)
    expect(repeatUpdated).toContain('Doch noch ein Nachtrag.')
    // Only a point NOWHERE on the board — no now-card, no queue card — throws.
    expect(() => toQueue(once, 999)).toThrow(/nowhere on the board/)
  })

  it('toQueue is IDEMPOTENT against board drift — a standing queue card is kept, never doubled', () => {
    // The measured red: the queue already lists the point while its now-card
    // stands; a second card is the dup-in-section that blocked the handover.
    const drifted = fullBoard({
      now: running(),
      queue: queueEntry(700, 'Die Kontextmarke', '~5 h') + queueEntry(701, 'Nächster Punkt', '~2 h'),
    })
    const after = toQueue(drifted, 700)
    expect(audit(after)).not.toContain('dup-in-section')
    expect([...parseNowCardPoints(after)]).toEqual([])
    expect([...parseQueuePoints(after)]).toEqual([700, 701])
    // …and an Erledigt card of the same bare shape does NOT masquerade as the
    // standing queue entry: with no queue card, the move still inserts one.
    const redelivered = fullBoard({
      now: running(),
      queue: queueEntry(701, 'Nächster Punkt', '~2 h'),
      done:
        `<details>\n  <summary><span class="num">700</span><span class="t">Die Kontextmarke</span>` +
        `<span class="right"><span class="meta">10:00 · 11:00</span></span></summary>\n` +
        `  <div class="body">\n    <p>Frühere Lieferung.</p>\n  </div>\n</details>\n`,
    })
    expect([...parseQueuePoints(toQueue(redelivered, 700))]).toEqual([700, 701])
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
    // board() carries the section heading itself since the fragment fallback
    // ended (sixth cross-review), so the document goes to the guard as is.
    const html = setCardStatus(board(), 361, long, '16:20')
    expect(concisenessOffenders(html)).toEqual([])
    // Piped through as ONE paragraph it is exactly the block the guard refuses.
    const squashed = setCardStatus(board(), 361, long.replace(/\n\n/g, ' '), '16:20')
    expect(concisenessOffenders(squashed)[0].reason).toMatch(/unbroken paragraph/)
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
    // A card still written in the pre-655 shape is lifted into the chip.
    expect(out).toContain('<span class="num">373</span><span class="t">Die Sitzungsgrenze</span>')
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
    for (const reason of ['Sitzungsgrenze; weiter mit Punkt 471.', 'Immer noch Sitzungsgrenze; Punkt 471 folgt.', 'Der Nachfolger nimmt Punkt 471.']) {
      html = toNoCurrentWork(html, reason, { stamp: '22:27' })
      expect(noCurrentWorkCards(html)).toHaveLength(1)
    }
    // …and the LAST reason is the one standing: it is a state, so it is current.
    expect(html).toContain('Der Nachfolger nimmt Punkt 471.')
    expect(html).not.toContain('Immer noch Sitzungsgrenze;')
  })

  it('is writable with NO point to close — the boundary case that forced the hand edit', () => {
    const out = toNoCurrentWork(emptyBoard(), 'Punkt 470 ist abgeschlossen.', { stamp: '22:27' })
    expect(hasCurrentWork(out)).toBe(true)
    expect(claimsNoCurrentWork(out)).toBe(true)
  })

  it('produces markup the board guards accept — structurally and by audit', () => {
    // The handover card names the follow-on point in PROSE — it is the one card
    // without a chip, and the publish gate refuses it when it names none (655).
    const out = toNoCurrentWork(emptyBoard(), 'Abgeschlossen; der Nachfolger nimmt Punkt 471.', { stamp: '22:27' })
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
    expect(() => toNoCurrentWork(busy, 'Nichts läuft; Punkt 471 folgt.')).toThrow(/refusing to claim that nothing is running/)
    // …and it names both sanctioned ways out rather than leaving a hand edit as the only one.
    expect(() => toNoCurrentWork(busy, 'Nichts läuft; Punkt 471 folgt.')).toThrow(/done 470 --none[\s\S]*queue 470/)
  })

  it('is swept away the moment real work is promoted — the claim is then false', () => {
    const idle = toNoCurrentWork(emptyBoard(), 'Sitzungsgrenze; weiter mit Punkt 471.', { stamp: '22:27' })
    const out = toNow(idle, 470, 'Angefangen.', { stamp: '22:30' })
    expect(noCurrentWorkCards(out)).toHaveLength(0)
    expect(claimsNoCurrentWork(out)).toBe(false)
    expect(out).toContain('<span class="num">470</span><span class="t">Die leere Karte</span>')
  })

  it('closeCard --none still names the gap, and still only once', () => {
    const board = fullBoard({ now: nowEntry(300, 'Fertig', '10:07 · ~14:30') })
    const once = closeCard(board, 300, { text: 'Fertig.', end: '16:45', none: 'Sitzungsgrenze; weiter mit Punkt 301.' })
    expect(noCurrentWorkCards(once)).toHaveLength(1)
    // Writing it again over the standing one does not stack it.
    expect(noCurrentWorkCards(toNoCurrentWork(once, 'Immer noch; Punkt 301 folgt.'))).toHaveLength(1)
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

// ═══ Point 544 — the third thing a session can truthfully say ════════════════
// Measured 07.08.2026: a session that had merged and ticked its point still owed
// its closing duties — the four-eyes record on the tick commit, the
// retrospective's new problem class — and the board could only say "idle" or "a
// numbered point". Under the idle card the point-470 deny stopped every one of
// those calls, and neither remedy it names reaches the state. The deny is right;
// what was missing is this card.
describe('the closing card — a state that is NOT a claim to stop', () => {
  const emptyBoard = () => fullBoard({ queue: queueEntry(544, 'Die dritte Kartenart', '~2 h') })
  const REASON = 'Der Punkt ist gemergt und abgehakt; das Vier-Augen-Protokoll und die Retrospektive fehlen noch.'

  // POINT 655: the card NAMES its point — the chip, the subject, the stage —
  // and its body says what the point was about before what is left of it.
  it('stands under its point: the chip, the subject, then the stage', () => {
    const out = toClosingWork(emptyBoard(), 544, { reason: REASON, stamp: '23:40' })
    expect(out).toContain('<span class="num">544</span><span class="t">Die dritte Kartenart: Abschlussarbeiten</span>')
    expect(out).toContain(REASON)
    expect(hasCurrentWork(out)).toBe(true)
    expect(parseNowCardPoints(out)).toEqual(new Set([544]))
    expect(closingWorkCards(out)).toHaveLength(1)
  })

  it('leads its body with the subject and only then with the stage', () => {
    const out = toClosingWork(emptyBoard(), 544, { reason: REASON, stamp: '23:40' })
    const body = out.slice(out.indexOf('<div class="body">'), out.indexOf('</div>'))
    expect(body.indexOf('Die dritte Kartenart')).toBeLessThan(body.indexOf(REASON))
    expect(body).toContain(CLOSING_STAGE)
  })

  it('takes the subject the board already knows — from the queue, Erledigt or a now-card', () => {
    expect(pointSubject(emptyBoard(), 544)).toBe('Die dritte Kartenart')
    expect(pointSubject(emptyBoard(), 999)).toBeNull()
    // A card composed twice must not stack its stage word.
    expect(closingCardTitle('X: Abschlussarbeiten')).toBe('X: Abschlussarbeiten')
  })

  it('refuses a point it can name no subject for, rather than writing a stage alone', () => {
    expect(() => toClosingWork(fullBoard({}), 999, { reason: REASON })).toThrow(/--title/)
    // …and takes one when the caller supplies it.
    const out = toClosingWork(fullBoard({}), 999, { subject: 'Ein Betreff', reason: REASON, stamp: '23:40' })
    expect(out).toContain('<span class="num">999</span><span class="t">Ein Betreff: Abschlussarbeiten</span>')
  })

  it('refuses a call with no point at all — the shape that lost the number', () => {
    expect(() => toClosingWork(emptyBoard(), REASON)).toThrow(/takes the POINT it closes/)
  })

  it('is NOT the idle claim — that is the whole reason it exists', () => {
    const out = toClosingWork(emptyBoard(), 544, { reason: REASON, stamp: '23:40' })
    expect(claimsNoCurrentWork(out)).toBe(false)
    expect(claimsClosingWork(out)).toBe(true)
  })

  it('leaves exactly ONE card however often it is written, like the idle card', () => {
    let html = emptyBoard()
    for (const reason of ['Vier-Augen-Protokoll fehlt.', 'Retrospektive fehlt.', 'Nur noch der Nachtrag.']) {
      html = toClosingWork(html, 544, { reason, stamp: '23:40' })
      expect(closingWorkCards(html)).toHaveLength(1)
    }
    expect(html).toContain('Nur noch der Nachtrag.')
    expect(html).not.toContain('Retrospektive fehlt.')
  })

  it('REPLACES a standing idle card rather than joining it', () => {
    const idle = toNoCurrentWork(emptyBoard(), 'Sitzungsgrenze; weiter mit Punkt 545.', { stamp: '23:30' })
    const out = toClosingWork(idle, 544, { reason: REASON, stamp: '23:40' })
    expect(noCurrentWorkCards(out)).toHaveLength(0)
    expect(closingWorkCards(out)).toHaveLength(1)
    expect(claimsNoCurrentWork(out)).toBe(false)
  })

  it('is swept away the moment a numbered point is promoted', () => {
    const closing = toClosingWork(emptyBoard(), 544, { reason: REASON, stamp: '23:40' })
    const out = toNow(closing, 544, 'Angefangen.', { stamp: '23:45' })
    expect(closingWorkCards(out)).toHaveLength(0)
    expect(out).toContain('<span class="num">544</span><span class="t">Die dritte Kartenart</span>')
  })

  // THE BOUNDARY STILL ENDS THE SAME WAY: `batch-boundary.mjs` prints
  // `board.mjs none`, and the claim to stop is made exactly once, at the end.
  it('gives way to the idle card at the boundary, which then stands ALONE', () => {
    // The closing card is NUMBERED since point 655, and the boundary's handover
    // card must still be writable over it — it is a state, not running work.
    const closing = toClosingWork(emptyBoard(), 544, { reason: REASON, stamp: '23:40' })
    const out = toNoCurrentWork(closing, 'Punkt 544 ist abgeschlossen; der Nachfolger nimmt Punkt 545.', {
      stamp: '23:55',
    })
    expect(closingWorkCards(out)).toHaveLength(0)
    expect(noCurrentWorkCards(out)).toHaveLength(1)
    expect(claimsNoCurrentWork(out)).toBe(true)
    expect(claimsClosingWork(out)).toBe(false)
  })

  it('refuses to claim it while a numbered card stands, naming both ways out', () => {
    const busy = fullBoard({ now: nowEntry(544, 'Läuft', '22:30 · ~23:00') })
    expect(() => toClosingWork(busy, 544, { reason: REASON })).toThrow(
      /refusing to claim that only closing duties are left/,
    )
    expect(() => toClosingWork(busy, 544, { reason: REASON })).toThrow(/done 544 --none[\s\S]*queue 544/)
  })

  it('demands a reason — a bare card would say nothing the reader can act on', () => {
    expect(() => toClosingWork(emptyBoard(), 544, { reason: '   ' })).toThrow(/WHICH duties are still owed/)
  })

  it('produces markup the board guards accept — structurally and by audit', () => {
    // AT THE STATE IT IS ACTUALLY WRITTEN IN (four-eyes review, 12.08.2026): the
    // point is merged AND TICKED by then, so it is archived and DONE — judging
    // this card against `open: [544]` would test a state that cannot occur, and
    // the number it now carries is exactly what such a test would hide.
    const running = toNow(emptyBoard(), 544, 'Läuft.', { stamp: '21:00' })
    const board = toDone(running, 544, { text: 'Zusammengeführt.', end: '23:30' })
    const out = toClosingWork(board, 544, { reason: REASON, stamp: '23:40' })
    const before = new Set(structureViolations(board).map((v) => v.code))
    expect(structureViolations(out).map((v) => v.code).filter((c) => !before.has(c))).toEqual([])
    const auditBefore = new Set(auditDashboard(board, { open: [], done: [544] }).map((v) => v.code))
    const added = auditDashboard(out, { open: [], done: [544] })
      .map((v) => v.code)
      .filter((c) => !auditBefore.has(c))
    expect(added).toEqual([])
    // The point IS current work while its closing duties run — that is what the
    // card says, and the focus check reads exactly this set.
    expect(parseNowCardPoints(out)).toEqual(new Set([544]))
    // …and the conciseness guard passes over it: one short, glanceable paragraph.
    expect(concisenessOffenders(out)).toEqual([])
  })

  it('is total on junk input rather than throwing into a guard', () => {
    for (const junk of [null, undefined, 42, {}, '']) {
      expect(() => claimsClosingWork(junk)).not.toThrow()
      expect(claimsClosingWork(junk)).toBe(false)
      expect(closingWorkCards(junk)).toEqual([])
    }
  })

  // The board is ONE living file that is never checked out fresh, so on the day
  // the chip lands every card on it is still in the old shape — and the publish
  // gate refuses a card without a chip. Every board.mjs edit lifts them.
  it('upgrades a card written before the chip, on any edit', () => {
    const old =
      fullBoard({
        now: nowEntry(648, 'Die Kinder hängen', '23:39 · ~03:39'),
        queue: queueEntry(369, 'Ein verwaistes Jungtier', '~2 h'),
      }) +
      '\n<details class="now">\n  <summary><span class="t">Gerade keine laufende Arbeit</span></summary>\n' +
      '  <div class="body"><p>Punkt 649 folgt.</p></div>\n</details>'
    const out = upgradeNowCards(old)
    expect(out).toContain('<span class="num">648</span><span class="t">Die Kinder hängen</span>')
    expect(out).toContain('<details class="now" data-state="idle">')
    // Idempotent: a second pass changes nothing, and a queue card is untouched.
    expect(upgradeNowCards(out)).toBe(out)
    expect(out).toContain('<span class="num">369</span>')
    for (const junk of [null, undefined, 42, {}]) expect(() => upgradeNowCards(junk)).not.toThrow()
  })

  it('finds and replaces a legacy state card by its title, so the state still REPLACES', () => {
    const legacy =
      fullBoard({}) +
      `\n<details class="now">\n  <summary><span class="t">${CLOSING_WORK_TITLE}</span></summary>\n` +
      '  <div class="body"><p>Alt.</p></div>\n</details>'
    expect(closingWorkCards(legacy)).toHaveLength(1)
    expect(closingWorkCards(upgradeNowCards(legacy))).toHaveLength(1)
  })

  it('splits its argv into point, subject and reason', () => {
    expect(parseClosingArgs(['544', 'Vier-Augen fehlt.'])).toEqual({
      point: '544',
      subject: null,
      words: ['Vier-Augen fehlt.'],
    })
    expect(parseClosingArgs(['544', '--title', 'Der Betreff', 'Grund'])).toEqual({
      point: '544',
      subject: 'Der Betreff',
      words: ['Grund'],
    })
    expect(() => parseClosingArgs(['544', '--title'])).toThrow(/needs the point SUBJECT/)
    expect(() => parseClosingArgs(['544', '--title', 'a', '--title', 'b'])).toThrow(/twice/)
    expect(parseClosingArgs(undefined)).toEqual({ point: '', subject: null, words: [] })
  })

  it('names both unnumbered state cards for the guards that must know them', () => {
    expect(STATE_CARD_TITLES).toEqual([NO_CURRENT_WORK_TITLE, CLOSING_WORK_TITLE])
    expect(isStateCardTitle(CLOSING_WORK_TITLE)).toBe(true)
    expect(isStateCardTitle(` ${NO_CURRENT_WORK_TITLE} `)).toBe(true)
    for (const other of ['544 — Die dritte Kartenart', '', null, undefined, 42]) {
      expect(isStateCardTitle(other)).toBe(false)
    }
  })
})


describe('mergeDoneDuplicates — a board that already carries them', () => {
  const card = (point, title, meta) =>
    `<details>\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
    `<span class="right"><span class="meta">${meta}</span></span></summary>\n` +
    `  <div class="body">\n    <p>${title}</p>\n  </div>\n</details>\n`

  it('folds four cards for one point into one, newest text, earliest start', () => {
    // The real shape of point 700 on 18.08.2026, newest first — and note that
    // 21:17 is the EARLIEST although its clock face is the largest: the archive
    // is ordered, the stamps carry no date.
    const html = fullBoard({
      done:
        card(700, 'Vierte', '01:04 · 01:10') +
        card(700, 'Dritte', '01:00 · 01:02') +
        card(700, 'Zweite', '00:45 · 00:58') +
        card(700, 'Erste', '21:17 · 00:44'),
    })
    const out = mergeDoneDuplicates(html)
    expect(out.merged).toEqual(['700'])
    expect(doneCards(out.html, 700)).toHaveLength(1)
    expect(out.html).toContain('<span class="meta">21:17 · 01:10</span>')
    expect(out.html).toContain('<p>Vierte</p>')
    expect(out.html).not.toContain('<p>Zweite</p>')
  })

  it('leaves a board with one card per point exactly as it is', () => {
    const html = fullBoard({ done: card(700, 'Eins', '10:00 · 11:00') + card(701, 'Zwei', '11:00 · 12:00') })
    const out = mergeDoneDuplicates(html)
    expect(out.merged).toEqual([])
    expect(out.html).toBe(html)
  })

  it('keeps the newest card at its POSITION even when the duplicates are identical', () => {
    // Byte-identical cards made a whole-document replace delete the FIRST
    // occurrence — the survivor — and leave the older one in its place. A card
    // BETWEEN the two is what makes the difference visible (second review round:
    // with adjacent duplicates the broken version passed the assertion too).
    const same = card(700, 'Gleich', '10:00 · 11:00')
    const between = card(702, 'Dazwischen', '11:30 · 11:45')
    const html = fullBoard({ done: card(701, 'Neuster', '12:00 · 12:30') + same + between + same })
    const out = mergeDoneDuplicates(html)
    expect(doneCards(out.html, 700)).toHaveLength(1)
    expect(out.html.indexOf('class="num">701')).toBeLessThan(out.html.indexOf('class="num">700'))
    // The survivor is the NEWER one, so it stands BEFORE the card between them.
    expect(out.html.indexOf('class="num">700')).toBeLessThan(out.html.indexOf('class="num">702'))
  })

  it('never deletes a card from ANOTHER section that happens to be identical', () => {
    const same = card(700, 'Gleich', '10:00 · 11:00')
    const html = fullBoard({ queue: same, done: same + same })
    const out = mergeDoneDuplicates(html)
    // Scoped, not counted over the whole document (second review round): the old
    // implementation deleted the QUEUE copy and left both archive copies, which
    // a total of two chips could not tell apart.
    expect(doneCards(out.html, 700)).toHaveLength(1)
    // SCOPED to the queue section (third review round): a document-wide lookup
    // could return the surviving ARCHIVE card and call the queue card intact.
    const queueSection = out.html.slice(
      out.html.indexOf('<h2>Warteschlange</h2>'),
      out.html.indexOf('<h2>Erledigt</h2>'),
    )
    expect(queueSection).toContain('class="num">700')
  })

  it('folds a DAMAGED newest stamp whole, numeric or not (rounds 3 and 5)', () => {
    for (const damaged of ['12:345', 'oops', '12x:34', '']) {
      const html = fullBoard({ done: card(700, 'Neu', `${damaged} · 01:10`) + card(700, 'Alt', '21:17 · 00:44') })
      const out = mergeDoneDuplicates(html).html
      expect(out, damaged).toContain('<span class="meta">21:17 · 01:10</span>')
      expect(out, damaged).not.toContain('21:175')
      expect(out, damaged).not.toContain('21:17x')
      expect(out, damaged).not.toContain('oops')
    }
  })

  it('leaves the section’s own markup untouched around and BETWEEN the cards', () => {
    // Section-local sentinels (third review round): a heading that exists
    // somewhere proves nothing — the archive link and a note between two cards
    // are what a rebuild would silently drop.
    const html = fullBoard({
      done:
        '<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>\n' +
        card(700, 'Neu', '01:04 · 01:10') +
        '<!-- Notiz zwischen zwei Karten -->\n' +
        card(700, 'Alt', '21:17 · 00:44'),
    })
    const out = mergeDoneDuplicates(html).html
    expect(out).toContain('<summary><h2>Erledigt</h2></summary>')
    expect(out).toContain('<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>')
    expect(out).toContain('<!-- Notiz zwischen zwei Karten -->')
    expect(out.match(/<details class="sect">/g)).toHaveLength(html.match(/<details class="sect">/g).length)
    expect(out.endsWith(html.slice(html.lastIndexOf('</main>')))).toBe(true)
  })

  it('skips a damaged stamp instead of falling back to the newest card', () => {
    const html = fullBoard({
      done: card(700, 'Neu', '01:04 · 01:10') + card(700, 'Kaputt', '99:99 · 00:58') + card(700, 'Alt', '21:17 · 00:44'),
    })
    expect(mergeDoneDuplicates(html).html).toContain('<span class="meta">21:17 · 01:10</span>')
  })

  it('never throws on a board without an Erledigt section', () => {
    expect(mergeDoneDuplicates('<main></main>')).toEqual({ html: '<main></main>', merged: [] })
    expect(mergeDoneDuplicates()).toEqual({ html: '', merged: [] })
  })
})

describe('doneStart / earliestStart', () => {
  const meta = (m) => `<summary><span class="right"><span class="meta">${m}</span></span></summary>`

  it('reads a real time of day and refuses an impossible one', () => {
    expect(doneStart(meta('21:17 · 00:44'))).toBe('21:17')
    expect(doneStart(meta('99:99 · 00:44'))).toBe('')
    expect(doneStart(meta('12:75 · 00:44'))).toBe('')
    // Anything but the separator or the closing tag after HH:MM is damage:
    // `12:345`, `12:34:56` and `12:34x` all used to read as a time.
    expect(doneStart(meta('12:345 · 00:44'))).toBe('')
    expect(doneStart(meta('12:34:56 · 00:44'))).toBe('')
    expect(doneStart(meta('12:34x · 00:44'))).toBe('')
    // Only the separator or the CLOSING TAG may follow (fifth round): `<b>` and
    // an unterminated field used to pass.
    expect(doneStart('class="meta">12:34')).toBe('')
    expect(doneStart('class="meta">12:34<b>')).toBe('')
    // …while both real shapes still answer.
    expect(doneStart(meta('12:34 · 00:44'))).toBe('12:34')
    expect(doneStart(meta('12:34'))).toBe('12:34')
    expect(doneStart('no meta at all')).toBe('')
    expect(doneStart()).toBe('')
  })

  it('takes the OLDEST usable start, scanning past a damaged one', () => {
    expect(earliestStart([meta('01:04 · 01:10'), meta('00:45 · 00:58'), meta('21:17 · 00:44')])).toBe('21:17')
    expect(earliestStart([meta('01:04 · 01:10'), meta('99:99 · 00:44')])).toBe('01:04')
    expect(earliestStart([])).toBe('')
    expect(earliestStart()).toBe('')
  })
})

// User 05.10.2026: the card text was a status that hid what the point is about.
describe('card description and status are separate sections', () => {
  const TASKS = [
    '- [ ] 701. Nächster Punkt headline',
    '  Why: something broke.',
    '  Final state: the card shows two sections. It never loses the description. See point 700 for the rest.',
    '- [x] 702. Archived headline that says what it delivered.',
    '  Bundle: Hygiene.',
    '',
  ].join('\n')
  // The German card texts `.claude/board-queue.json` keeps (user 19.10.2026).
  const QUEUE_DATA = {
    points: {
      701: { title: 'Nächster Punkt', body: ['Die Karte zeigt zwei Abschnitte.'] },
      702: { title: 'Alt', body: ['Archivierter Punkt, auf Deutsch beschrieben.'] },
    },
  }
  const statusSection = (card) => card.slice(card.indexOf('<hr class="split">'))
  const descSection = (card) => card.slice(card.indexOf('<div class="body">'), card.indexOf('<hr class="split">'))

  it('renders the description, a visible divider, then the stamped status', () => {
    const body = renderCardSections({ description: 'Was der Punkt liefert.', status: 'Erster Schritt.', stamp: '09:00' })
    expect(body).toBe(
      '    <p class="desc">Was der Punkt liefert.</p>\n' +
        '    <hr class="split">\n' +
        '    <p class="status-head">Stand der Umsetzung</p>\n' +
        '    <p><span class="stamp">Stand 09:00</span> Erster Schritt.</p>',
    )
  })

  it('renders the visible placeholder when the description is missing', () => {
    expect(renderCardSections({ status: 'X' })).toContain(`<p class="desc-missing">${DESCRIPTION_MISSING_TEXT}</p>`)
  })

  it('promote takes the queue prose as the description and the given text as the status', () => {
    const out = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const card = nowCard(out, 701)
    expect(descSection(card)).toContain('<p class="desc">Warum das ansteht.</p>')
    expect(statusSection(card)).toContain('<span class="stamp">Stand 10:00</span> Begonnen.')
    expect(statusSection(card)).not.toContain('Warum das ansteht.')
  })

  it('promote of a stub queue card takes the German text from the queue data, never the work order', () => {
    const stub = queueEntry(701, 'Nächster Punkt', '~2 h').replace('Warum das ansteht.', QUEUE_STUB_BODY.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    const out = toNow(fullBoard({ queue: stub }), 701, 'Begonnen.', { stamp: '10:00', queueData: QUEUE_DATA })
    expect(descriptionOf(nowCard(out, 701))).toBe('Die Karte zeigt zwei Abschnitte.')
    const bare = toNow(fullBoard({ queue: stub }), 701, 'Begonnen.', { stamp: '10:00', tasksText: TASKS })
    expect(nowCard(bare, 701)).toContain(`<p class="desc-missing">${DESCRIPTION_MISSING_TEXT}</p>`)
    expect(bare).not.toContain('two sections')
  })

  it('a status update leaves the description byte-identical', () => {
    const promoted = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const updated = setCardStatus(promoted, 701, 'Zweiter Stand.\n\nMit Absatz.', '11:00')
    const before = nowCard(promoted, 701)
    const after = nowCard(updated, 701)
    expect(descSection(after)).toBe(descSection(before))
    expect(statusSection(after)).toContain('<span class="stamp">Stand 11:00</span> Zweiter Stand.')
    expect(statusSection(after)).toContain('<p>Mit Absatz.</p>')
    expect(after).not.toContain('Begonnen.')
    expect(setCardStatus(updated, 701, 'Dritter.', '12:00').split('<hr class="split">')).toHaveLength(2)
  })

  it('describe changes only the description; the status stays', () => {
    const promoted = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const out = setCardDescription(promoted, 701, 'Neue Anforderung.')
    expect(descriptionOf(nowCard(out, 701))).toBe('Neue Anforderung.')
    expect(statusSection(nowCard(out, 701))).toBe(statusSection(nowCard(promoted, 701)))
    expect(() => setCardDescription(promoted, 701, 'wort '.repeat(61))).toThrow(/1-3 sentences/)
    expect(() => setCardDescription(promoted, 999, 'X.')).toThrow(/no card/)
  })

  it('moves to the queue and to Erledigt carry both sections', () => {
    const promoted = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const queued = queueCard(toQueue(promoted, 701), 701)
    expect(descriptionOf(queued)).toBe('Warum das ansteht.')
    expect(statusSection(queued)).toContain('Begonnen.')
    const done = doneCard(toDone(promoted, 701, { end: '12:00' }), 701)
    expect(descriptionOf(done)).toBe('Warum das ansteht.')
    expect(statusSection(done)).toContain('Begonnen.')
  })

  it('status readers read the status section, never the description', () => {
    const promoted = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const done = doneCard(toDone(promoted, 701, { end: '12:00' }), 701)
    expect(done.match(/Warum das ansteht\./g)).toHaveLength(1)
  })

  it('the queued description is the German body, escaped; empty for an unknown point', () => {
    expect(queuedDescription(QUEUE_DATA, 701)).toBe('Die Karte zeigt zwei Abschnitte.')
    expect(queuedDescription({ points: { 5: { body: ['A < B', 'Zweiter.'] } } }, 5)).toBe('A &lt; B\n\nZweiter.')
    expect(queuedDescription(QUEUE_DATA, 999)).toBe('')
    expect(queuedDescription(null, 701)).toBe('')
  })

  it('status and describe cut at the divider element even on an inline body (review finding 1)', () => {
    const inline = fullBoard({
      now:
        '<details class="now">\n  <summary><span class="num">701</span><span class="t">X</span>' +
        '<span class="right"><span class="meta">10:00</span></span></summary>\n' +
        '  <div class="body"><p class="desc">Inline-Beschreibung.</p><hr class="split"><p class="status-head">Stand der Umsetzung</p><p>Alter Stand.</p></div>\n</details>\n',
    })
    const updated = nowCard(setCardStatus(inline, 701, 'Neuer Stand.', '11:00'), 701)
    expect(descriptionOf(updated)).toBe('Inline-Beschreibung.')
    expect(updated).toContain('Neuer Stand.')
    expect(updated).not.toContain('Alter Stand.')
    const described = nowCard(setCardDescription(inline, 701, 'Neu.'), 701)
    expect(descriptionOf(described)).toBe('Neu.')
    expect(described).toContain('<p>Alter Stand.</p>')
  })

  it('a description-only carry-over keeps the standing status markup byte for byte', () => {
    const promoted = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const status = '<p>Waiting.</p><ul><li>Required prerequisite</li></ul>'
    const standing =
      '<details>\n  <summary><span class="num">701</span><span class="t">Nächster Punkt</span>' +
      '<span class="right"><span class="meta">~2 h</span></span></summary>\n  <div class="body">\n' +
      `    <p class="desc-missing">Beschreibung fehlt</p>\n    <hr class="split">\n    <p class="status-head">Stand der Umsetzung</p>\n    ${status}` +
      '\n  </div>\n</details>\n'
    const drifted = promoted.replace('<summary><h2>Warteschlange</h2></summary>', (m) => `${m}\n${standing}`)
    const card = queueCard(toQueue(drifted, 701), 701)
    expect(descriptionOf(card)).toBe('Warum das ansteht.')
    const afterSplit = (html) => html.slice(html.indexOf('<hr class="split">'), html.indexOf('</details>'))
    expect(afterSplit(card)).toBe(afterSplit(standing))
    expect(card.split(status)).toHaveLength(2)
    expect(card).toContain('~2 h')
  })

  it('the migration leaves a queue card whose body is more than paragraphs untouched (review finding 2)', () => {
    const listCard = queueEntry(704, 'Liste', '~1 h').replace('<p>Warum das ansteht.</p>', '<p>Scope.</p><ul><li>eins</li></ul>')
    const source = fullBoard({ queue: listCard })
    const r = migrateCardDescriptions(source, '')
    expect(r.html).toBe(source)
    expect(r.skipped).toEqual(['704'])
    expect(r.counts.queue).toBe(0)
  })

  it('an argument-free move to the queue carries the description onto a standing card that lacks one (review finding 3)', () => {
    const promoted = toNow(fullBoard({ queue: queueEntry(701, 'Nächster Punkt', '~2 h') }), 701, 'Begonnen.', { stamp: '10:00' })
    const standing =
      '<details>\n  <summary><span class="num">701</span><span class="t">Nächster Punkt</span>' +
      '<span class="right"><span class="meta">~2 h</span></span></summary>\n  <div class="body">\n' +
      renderCardSections({ status: 'Noch nicht begonnen.' }) + '\n  </div>\n</details>\n'
    const drifted = promoted.replace('<summary><h2>Warteschlange</h2></summary>', (m) => `${m}\n${standing}`)
    const out = toQueue(drifted, 701)
    expect(nowCard(out, 701)).toBeNull()
    expect(descriptionOf(queueCard(out, 701))).toBe('Warum das ansteht.')
  })

  it('the one-time migration keeps each body as the status and takes the German queue text', () => {
    const legacyDone =
      '<details>\n  <summary><span class="num">702</span><span class="t">Alt</span>' +
      '<span class="right"><span class="meta">09:00 · 10:00</span></span></summary>\n' +
      '  <div class="body">\n    <p>Punkt erledigt, Abschlussarbeiten stehen noch aus.</p>\n  </div>\n</details>\n'
    const unknownDone = legacyDone.replace(/702/g, '703')
    const source = fullBoard({
      now: nowEntry(701, 'Nächster Punkt', '10:00 · ~12:00'),
      queue: queueEntry(704, 'Wartet', '~1 h'),
      done: legacyDone + unknownDone,
    })
    const { html, counts, missing } = migrateCardDescriptions(source, QUEUE_DATA)
    expect(counts).toEqual({ now: 1, queue: 1, done: 2 })
    expect(missing).toEqual({ now: [], queue: [], done: ['703'] })
    const now = nowCard(html, 701)
    expect(descriptionOf(now)).toBe('Die Karte zeigt zwei Abschnitte.')
    expect(statusSection(now)).toContain('<p><span class="stamp">Stand 16:20</span> läuft</p>')
    const done = doneCard(html, 702)
    expect(descriptionOf(done)).toBe('Archivierter Punkt, auf Deutsch beschrieben.')
    expect(statusSection(done)).toContain('<p>Punkt erledigt, Abschlussarbeiten stehen noch aus.</p>')
    expect(doneCard(html, 703)).toContain(`<p class="desc-missing">${DESCRIPTION_MISSING_TEXT}</p>`)
    expect(descriptionOf(queueCard(html, 704))).toBe('Warum das ansteht.')
    // Idempotent: a second run changes nothing.
    expect(migrateCardDescriptions(html, QUEUE_DATA).html).toBe(html)
  })
})

// User 05.10.2026: a successor session wrote its takeover time over the card's
// start, and a span over 24 h showed no date. Berlin is UTC+2 in early October.
describe('card times', () => {
  const at = (iso) => new Date(iso)
  const min = 60000

  describe('time-span bands (Europe/Berlin)', () => {
    it('shows times only up to 24 h, across midnight too', () => {
      expect(formatCardSpan(at('2026-10-03T07:12:00Z'), at('2026-10-03T12:30:00Z'))).toBe('09:12 – 14:30')
      expect(formatCardSpan(at('2026-10-03T21:10:00Z'), at('2026-10-03T23:40:00Z'))).toBe('23:10 – 01:40')
    })

    it('treats exactly 24 h as times only and one minute more as dated', () => {
      const start = at('2026-10-03T07:12:00Z')
      const day = new Date(start.getTime() + 24 * 60 * min)
      expect(cardSpanBand(start, day)).toBe('time')
      expect(formatCardSpan(start, day)).toBe('09:12 – 09:12')
      const over = new Date(day.getTime() + min)
      expect(cardSpanBand(start, over)).toBe('date')
      expect(formatCardSpan(start, over)).toBe('03.10. 09:12 – 04.10. 09:13')
      expect(formatCardSpan(start, at('2026-10-05T12:30:00Z'))).toBe('03.10. 09:12 – 05.10. 14:30')
    })

    it('treats exactly one year as DD.MM. and one minute more as DD.MM.YY', () => {
      const start = at('2025-10-03T07:12:00Z')
      const year = at('2026-10-03T07:12:00Z')
      expect(cardSpanBand(start, year)).toBe('date')
      expect(formatCardSpan(start, year)).toBe('03.10. 09:12 – 03.10. 09:12')
      expect(cardSpanBand(start, new Date(year.getTime() + min))).toBe('year')
      expect(formatCardSpan(start, at('2026-10-05T12:30:00Z'))).toBe('03.10.25 09:12 – 05.10.26 14:30')
    })

    it('puts the estimate tilde before the clock, where the eta audit reads it', () => {
      const line = cardTimeLine({ start: '2026-10-03T07:12:00Z', end: '2026-10-05T12:30:00Z', projected: true, sessions: 2 })
      expect(line).toBe('03.10. 09:12 – 05.10. ~14:30 · 2 Sitzungen')
      expect(etaMinutes(line)).toEqual({ eta: 14 * 60 + 30, start: 9 * 60 + 12 })
    })

    it('dates a running card without an end by its distance to now', () => {
      expect(cardTimeLine({ start: '2026-10-03T07:12:00Z', now: at('2026-10-03T12:00:00Z') })).toBe('09:12')
      expect(cardTimeLine({ start: '2026-10-03T07:12:00Z', now: at('2026-10-05T12:00:00Z') })).toBe('03.10. 09:12')
    })
  })

  describe('session count', () => {
    it('appends the count only when more than one session worked the card', () => {
      const span = { start: '2026-10-03T07:12:00Z', end: '2026-10-03T12:30:00Z' }
      expect(cardTimeLine({ ...span, sessions: 1 })).toBe('09:12 – 14:30')
      expect(cardTimeLine({ ...span, sessions: 3 })).toBe('09:12 – 14:30 · 3 Sitzungen')
    })

    it('counts a promotion by another session, not a repeat by the same one', () => {
      const first = recordPromotion(undefined, { now: at('2026-10-03T07:12:00Z'), session: 'A' })
      expect(first.sessions).toBe(1)
      expect(recordPromotion(first, { now: at('2026-10-03T08:00:00Z'), session: 'A' }).sessions).toBe(1)
      const second = recordPromotion(first, { now: at('2026-10-03T12:00:00Z'), session: 'B' })
      expect(second.sessions).toBe(2)
      expect(recordPromotion(second, { now: at('2026-10-03T13:00:00Z'), session: '' }).sessions).toBe(3)
    })

    it('counts distinct sessions: A, then B, then A again is two', () => {
      const a = recordPromotion(undefined, { now: at('2026-10-03T07:12:00Z'), session: 'A' })
      const b = recordPromotion(a, { now: at('2026-10-03T08:00:00Z'), session: 'B' })
      const back = recordPromotion(b, { now: at('2026-10-03T09:00:00Z'), session: 'A' })
      expect(back.sessions).toBe(2)
      expect(back.sessionIds).toEqual(['A', 'B'])
    })

    it('does not count again a session the retroactive trace already named', () => {
      const traces = { 5: { firstCommit: '2026-10-03T07:00:00Z', sessionIds: ['A', 'B'], sessions: 2 } }
      const cards = [{ point: '5', meta: '09:00 · ~11:00', finished: false }]
      const entry = backfillCardTimes({ cards, traces, now: at('2026-10-03T08:00:00Z') }).store.points['5']
      expect(entry.sessions).toBe(2)
      expect(recordPromotion(entry, { now: at('2026-10-03T09:00:00Z'), session: 'B' }).sessions).toBe(2)
      expect(recordPromotion(entry, { now: at('2026-10-03T09:00:00Z'), session: 'C' }).sessions).toBe(3)
    })
  })

  describe('handover keeps the original start', () => {
    const queued = () =>
      fullBoard({ now: nowEntry(900, 'Anderes', '08:00 · ~18:00'), queue: queueEntry(1303, 'Kartenzeiten', '~2 h') })

    it('renders the recorded start after a return to the queue and a successor promotion', () => {
      const t1 = at('2026-10-03T07:12:00Z')
      let entry = recordPromotion(undefined, { now: t1, session: 'A', eta: new Date(t1.getTime() + 120 * min) })
      let html = toNow(queued(), 1303, 'Begonnen.', { stamp: '09:12', span: spanOf(entry, { now: t1 }) })
      expect(html).toContain('<span class="meta">09:12 – ~11:12</span>')

      html = toQueue(html, 1303)
      expect(queueCard(html, 1303)).toContain('~2 h')

      const t2 = at('2026-10-03T12:00:00Z')
      entry = recordPromotion(entry, { now: t2, session: 'B', eta: new Date(t2.getTime() + 30 * min) })
      html = toNow(html, 1303, 'Übernommen.', { stamp: '14:00', span: spanOf(entry, { now: t2 }) })
      expect(nowCard(html, 1303)).toContain('<span class="meta">09:12 – ~14:30 · 2 Sitzungen</span>')
      expect(entry.start).toBe(t1.toISOString())
    })

    it('ignores the start of a free "<times>" string once a record exists', () => {
      const t1 = at('2026-10-03T07:12:00Z')
      const t2 = at('2026-10-03T12:00:00Z')
      const entry = recordPromotion(recordPromotion(undefined, { now: t1, session: 'A' }), {
        now: t2,
        session: 'B',
        eta: resolveBerlinClock(timesEndClock('14:00 · ~14:30'), t2, { future: true }),
      })
      const html = promoteToNow(queued(), 1303, {
        title: 'Kartenzeiten',
        times: '14:00 · ~14:30',
        status: 'Übernommen.',
        stamp: '14:00',
        span: spanOf(entry, { now: t2 }),
      })
      expect(nowCard(html, 1303)).toContain('<span class="meta">09:12 – ~14:30 · 2 Sitzungen</span>')
    })

    it('takes the first branch commit as the start when it is earlier than the promotion', () => {
      const now = at('2026-10-05T12:00:00Z')
      expect(recordPromotion(undefined, { now, fallbackStart: '2026-10-03T07:12:00Z' }).start).toBe('2026-10-03T07:12:00.000Z')
      expect(recordPromotion(undefined, { now, fallbackStart: '2026-10-06T07:12:00Z' }).start).toBe(now.toISOString())
    })

    it('archives with the recorded start, a dated span and the session count', () => {
      const start = at('2026-10-03T07:12:00Z')
      const entry = { ...recordPromotion(undefined, { now: start }), sessions: 3, end: '2026-10-05T12:30:00Z' }
      const html = fullBoard({ now: nowEntry(1303, 'Kartenzeiten', '14:00 · ~14:30') + nowEntry(900, 'Anderes', '08:00') })
      const out = toDone(html, 1303, { end: '14:30', span: spanOf(entry) })
      expect(doneCard(out, 1303)).toContain('<span class="meta">03.10. 09:12 – 05.10. 14:30 · 3 Sitzungen</span>')
    })

    it('keeps the legacy readers working on the new notation', () => {
      const html = fullBoard({ now: nowEntry(1303, 'Kartenzeiten', '03.10. 09:12 – 05.10. ~11:12 · 2 Sitzungen') })
      // The full dated duration, 03.10. 09:12 → 05.10. 11:12, not the clock difference.
      expect(queueCard(toQueue(html, 1303), 1303)).toContain('<span class="meta">~50 h</span>')
      expect(doneStart('<span class="meta">09:12 – 14:30</span>')).toBe('09:12')
    })

    it('re-estimates a dated card without a record, keeping start, date notation and sessions', () => {
      const html = fullBoard({ now: nowEntry(1303, 'Kartenzeiten', '03.10. 09:12 – 05.10. ~11:12 · 2 Sitzungen') })
      const out = setCardTimes(html, 1303, '15:00', { now: at('2026-10-05T10:00:00Z') })
      expect(nowCard(out, 1303)).toContain('<span class="meta">03.10. 09:12 – 05.10. ~15:00 · 2 Sitzungen</span>')
      const year = fullBoard({ now: nowEntry(1303, 'K', '03.10.25 09:12 – 05.10.26 ~11:12') })
      expect(nowCard(setCardTimes(year, 1303, '15:00', { now: at('2026-10-05T10:00:00Z') }), 1303)).toContain(
        '<span class="meta">03.10.25 09:12 – 05.10.26 ~15:00</span>',
      )
    })

    it('places a yearless dated span by context: leap years and an exact calendar year', () => {
      const leap = at('2028-03-02T08:00:00Z')
      expect(spanHours('28.02. 09:00 – 01.03. ~09:00', { now: leap })).toBe(48)
      expect(spanHours('28.02. 09:00 – 01.03. ~09:00', { now: at('2027-03-02T08:00:00Z') })).toBe(24)
      // Same date and time in the DD.MM. notation is exactly one year (the band rule).
      expect(spanHours('05.10. 09:00 – 05.10. ~09:00', { now: at('2026-10-05T08:00:00Z') })).toBe(8760)
      // A start date later in the year than now lies in the previous year.
      expect(spanHours('28.12. 09:00 – 02.01. ~09:00', { now: at('2027-01-02T08:00:00Z') })).toBe(120)
      // A start a day after now lies in the previous year, across its leap day.
      expect(spanHours('28.02. 09:00 – 01.03. ~10:00', { now: at('2025-02-27T12:00:00Z') })).toBe(49)
      // A 29.02. start lies in the latest leap year, never rolled to 01.03.
      expect(spanHours('29.02. 10:00 – 02.03. ~10:00', { now: at('2025-03-01T09:00:00Z') })).toBe(48)
      // A date no year has is no span.
      expect(spanHours('31.02. 10:00 – 02.03. ~10:00', { now: at('2025-03-01T09:00:00Z') })).toBe(null)
      expect(spanHours('28.02.25 10:00 – 29.02.25 ~10:00')).toBe(null)
      expect(spanHours('01.13. 10:00 – 02.13. ~10:00', { now: at('2026-10-15T12:00:00Z') })).toBe(null)
      // DD.MM.YY names its years: a full year, and a leap year's full year.
      expect(spanHours('05.10.25 09:00 – 05.10.26 ~09:00')).toBe(8760)
      expect(spanHours('05.10.27 09:00 – 05.10.28 ~09:00')).toBe(8784)
      const html = fullBoard({ now: nowEntry(1303, 'K', '05.10. 09:00 – 05.10. ~09:00') })
      expect(queueCard(toQueue(html, 1303, { now: at('2026-10-05T08:00:00Z') }), 1303)).toContain('<span class="meta">~8760 h</span>')
    })

    it('takes the queue estimate from the record when there is one', () => {
      const recorded = { start: '2028-02-28T08:00:00Z', eta: '2028-03-01T08:00:00Z', end: null }
      expect(spanHours('28.02. 09:00 – 01.03. ~09:00', { now: at('2027-01-01T00:00:00Z'), recorded })).toBe(48)
      const html = fullBoard({ now: nowEntry(1303, 'K', '09:00 – ~09:00') })
      expect(queueCard(toQueue(html, 1303, { recorded }), 1303)).toContain('<span class="meta">~48 h</span>')
    })

    it('reads a dated span over a year boundary as its full duration', () => {
      const html = fullBoard({ now: nowEntry(1303, 'K', '31.12. 22:00 – 02.01. ~00:00') })
      expect(queueCard(toQueue(html, 1303, { now: at('2027-01-02T08:00:00Z') }), 1303)).toContain('<span class="meta">~26 h</span>')
    })

    it('keeps a dated original start when duplicate Erledigt cards are merged', () => {
      const card = (meta, text) =>
        `<details>\n  <summary><span class="num">700</span><span class="t">Punkt</span>` +
        `<span class="right"><span class="meta">${meta}</span></span></summary>\n  <div class="body">\n    <p>${text}</p>\n  </div>\n</details>\n`
      expect(doneStart(card('03.10. 09:12 – 05.10. 14:30', 'x'))).toBe('03.10. 09:12')
      expect(doneStart(card('03.10.25 09:12 – 05.10.26 14:30', 'x'))).toBe('03.10.25 09:12')
      expect(doneStart(card('33.10. 09:12 – 05.10. 14:30', 'x'))).toBe('')
      const html = fullBoard({
        now: nowEntry(900, 'Anderes', '08:00'),
        done: card('06.10. 10:00 – 08.10. 12:00', 'neu') + card('03.10. 09:12 – 05.10. 14:30', 'alt'),
      })
      const merged = mergeDoneDuplicates(html)
      expect(merged.merged).toEqual(['700'])
      expect(doneCard(merged.html, 700)).toContain('<span class="meta">03.10. 09:12 – 08.10. 12:00</span>')
    })
  })

  describe('resolveBerlinClock', () => {
    it('finds the nearest moment or the next one for an estimate', () => {
      const ref = at('2026-10-03T21:50:00Z') // 23:50 Berlin
      expect(resolveBerlinClock('00:10', ref).toISOString()).toBe('2026-10-03T22:10:00.000Z')
      expect(resolveBerlinClock('23:00', ref).toISOString()).toBe('2026-10-03T21:00:00.000Z')
      // An hour of slack: 23:00 is still today's, 22:30 already tomorrow's.
      expect(resolveBerlinClock('23:00', ref, { future: true }).toISOString()).toBe('2026-10-03T21:00:00.000Z')
      expect(resolveBerlinClock('22:30', ref, { future: true }).toISOString()).toBe('2026-10-04T20:30:00.000Z')
      expect(resolveBerlinClock('23:30', ref, { future: true }).toISOString()).toBe('2026-10-03T21:30:00.000Z')
      expect(resolveBerlinClock('nope', ref)).toBeNull()
    })
  })

  describe('retroactive pass', () => {
    const done = (n, meta) =>
      `<details>\n  <summary><span class="num">${n}</span><span class="t">Fertig ${n}</span>` +
      `<span class="right"><span class="meta">${meta}</span></span></summary>\n  <div class="body">\n    <p>Erledigt.</p>\n  </div>\n</details>\n`
    const html = () =>
      fullBoard({ now: nowEntry(900, 'Anderes', '08:00 · ~18:00'), done: done(1302, '00:49 · 00:49') + done(11, '10:00 · 11:00') })

    it('records traceable cards from their first branch commit and keeps the rest', () => {
      const now = at('2026-10-15T08:00:00Z')
      const cards = timedCards(html())
      // The title-only legacy now-card is no numbered card; the board upgrades those on every edit.
      expect(cards.map((c) => [c.point, c.finished])).toEqual([['1302', true], ['11', true]])
      const traces = {
        1302: { firstCommit: '2026-10-14T18:05:00Z', lastCommit: '2026-10-14T22:48:00Z', sessions: 2 },
      }
      const result = backfillCardTimes({ store: { v: 1, points: {} }, cards, traces, now })
      expect(result.added).toEqual(['1302'])
      expect(result.untraceable).toEqual(['11'])
      expect(result.store.points['1302']).toMatchObject({ start: '2026-10-14T18:05:00.000Z', sessions: 2, end: '2026-10-14T22:49:00.000Z' })
      const rendered = applyCardTimes(html(), result.store, { now })
      expect(rendered.rendered).toBe(1)
      expect(doneCard(rendered.html, 1302)).toContain('<span class="meta">20:05 – 00:49 · 2 Sitzungen</span>')
      expect(doneCard(rendered.html, 11)).toContain('<span class="meta">10:00 · 11:00</span>')
    })

    it('leaves a recorded card alone even when a conflicting trace exists, and renders archive pages too', () => {
      const record = { start: '2026-10-01T08:00:00Z', end: '2026-10-03T09:00:00Z', sessions: 1 }
      const store = { v: 1, points: { 11: { ...record } } }
      const traces = { 11: { firstCommit: '2026-09-20T08:00:00Z', lastCommit: '2026-09-21T08:00:00Z', sessions: 4 } }
      const result = backfillCardTimes({ store, cards: timedCards(html()), traces })
      expect(result.added).toEqual([])
      expect(result.store.points['11']).toEqual(record)
      const page = applyCardTimes(done(11, '10:00 · 11:00'), store, { archive: true })
      expect(page.html).toContain('<span class="meta">01.10. 10:00 – 03.10. 11:00</span>')
    })

    it('reads the end clock of a done card that carries a session suffix', () => {
      const traces = { 12: { firstCommit: '2026-10-03T07:00:00Z', lastCommit: '2026-10-03T09:05:00Z', sessions: 2 } }
      const cards = [{ point: '12', meta: '09:00 – 11:00 · 2 Sitzungen', finished: true }]
      const entry = backfillCardTimes({ cards, traces }).store.points['12']
      expect(entry.end).toBe('2026-10-03T09:00:00.000Z')
    })

    it('runs as one transaction that merges a promotion recorded meanwhile and renders both pages', () => {
      const now = at('2026-10-15T08:00:00Z')
      // The LATEST record holds a promotion of 1302 made after the pass gathered
      // its points; its trace says otherwise and must not win.
      const latest = { v: 1, points: { 1302: { start: '2026-10-14T06:00:00.000Z', sessions: 3, sessionIds: [], eta: null, end: '2026-10-14T22:49:00.000Z' } } }
      const traceOf = (points) => {
        expect(points).toEqual(['1302', '11', '40'])
        return {
          1302: { firstCommit: '2026-10-14T18:05:00Z', lastCommit: '2026-10-14T22:48:00Z', sessions: 1 },
          40: { firstCommit: '2026-10-02T08:00:00Z', lastCommit: '2026-10-04T09:30:00Z', sessions: 1 },
        }
      }
      const tx = backfillTransaction({ html: html(), archiveHtml: done(40, '10:00 · 11:30'), store: latest, traceOf, now })
      expect(tx.store.points['1302']).toEqual(latest.points['1302'])
      expect(tx.added).toEqual(['40'])
      expect(tx.untraceable).toEqual(['11'])
      expect(doneCard(tx.html, 1302)).toContain('<span class="meta">08:00 – 00:49 · 3 Sitzungen</span>')
      expect(tx.archiveHtml).toContain('<span class="meta">02.10. 10:00 – 04.10. 11:30</span>')
      expect(tx.rendered).toBe(2)
    })

    it('keeps a promotion recorded between the start of the pass and the lock', () => {
      const now = at('2026-10-15T08:00:00Z')
      // The persisted record and the pages, as the files hold them.
      let persisted = { v: 1, points: {} }
      let board = html()
      let archive = done(40, '10:00 · 11:30')
      const promoted = { start: '2026-10-14T06:00:00.000Z', sessions: 2, sessionIds: ['A', 'B'], eta: null, end: '2026-10-14T22:49:00.000Z' }
      const order = []
      const tx = runCardTimesBackfill({
        now,
        readBoard: () => board,
        readArchive: () => archive,
        readStore: () => structuredClone(persisted),
        traceOf: () => ({
          1302: { firstCommit: '2026-10-14T18:05:00Z', lastCommit: '2026-10-14T22:48:00Z', sessions: 1 },
          40: { firstCommit: '2026-10-02T08:00:00Z', lastCommit: '2026-10-04T09:30:00Z', sessions: 1 },
        }),
        editBoard: (transform, afterWrite) => {
          // Another session records its promotion while this one waits for the lock.
          persisted = { v: 1, points: { ...persisted.points, 1302: promoted } }
          order.push('lock')
          const out = transform(board)
          board = out.html
          persisted = out.store
          order.push('write')
          afterWrite()
          order.push('publish')
        },
        writeArchive: (page) => {
          order.push('archive')
          archive = page
        },
      })
      expect(persisted.points['1302']).toEqual(promoted)
      expect(persisted.points['40']).toMatchObject({ start: '2026-10-02T08:00:00.000Z' })
      expect(tx.added).toEqual(['40'])
      expect(doneCard(board, 1302)).toContain('<span class="meta">08:00 – 00:49 · 2 Sitzungen</span>')
      expect(archive).toContain('<span class="meta">02.10. 10:00 – 04.10. 11:30</span>')
      expect(order).toEqual(['lock', 'write', 'archive', 'publish'])
    })

    it('writes nothing on a dry run', () => {
      let wrote = false
      const tx = runCardTimesBackfill({
        dryRun: true,
        readBoard: () => html(),
        readStore: () => ({ v: 1, points: {} }),
        traceOf: () => ({}),
        editBoard: () => {
          wrote = true
        },
      })
      expect(wrote).toBe(false)
      expect(tx.untraceable).toEqual(['1302', '11'])
    })
  })
})

// Point 1363: the landing whose projection discards the now card must still
// leave the done card with its description.
describe('description survives a landing through the discarded now card', () => {
  const queueData = { points: { 1342: { body: ['Dorfbewohner gehen, knien und tragen mit natürlichem Gang.'] } } }

  it('focus cleared -> projection -> closing --title -> done keeps the description', () => {
    const queued = fullBoard({
      queue: queueEntry(1342, 'Natürliche Bewegung', '~2 h'),
      done: '<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>\n',
    })
    const running = toNow(queued, 1342, 'Läuft.', { stamp: '10:00', queueData })
    expect(descriptionOf(nowCard(running, 1342))).toBeTruthy()
    const projected = reconcileNowProjection(running, [], { stamp: '12:00' })
    expect(nowCard(projected, 1342)).toBeFalsy()
    const closing = toClosingWork(projected, 1342, {
      subject: 'Natürliche Bewegung',
      reason: 'Das Vier-Augen-Protokoll fehlt noch.',
      stamp: '12:05',
      queueData,
    })
    const out = closeCard(closing, 1342, {
      text: 'Zusammengeführt.',
      end: '12:30',
      none: 'Übergabe — der Nachfolger nimmt Punkt 1364.',
      queueData,
    })
    const card = doneCard(out, 1342)
    expect(descriptionOf(card)).toContain('natürlichem Gang')
    expect(card).not.toContain(DESCRIPTION_MISSING_TEXT)
  })
})
