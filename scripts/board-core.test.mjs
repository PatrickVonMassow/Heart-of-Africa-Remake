// The card edit behind `board.mjs status` (point 372): it must produce exactly
// the markup the board guard accepts — a stamped status — and refuse the cases
// where silently doing nothing would leave the reader with a stale card.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { auditDashboard, parseNowCardPoints, parseQueuePoints } from './dashboard-guard-core.mjs'
import {
  addHours,
  berlinStamp,
  estimateHours,
  hoursLabel,
  nowCard,
  promoteToNow,
  removeVdzk,
  setCardStatus,
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
describe('every move keeps the real board auditable', () => {
  const html = readFileSync(resolve(REPO_ROOT, '.batch-dashboard.html'), 'utf8')
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

describe('nowCard', () => {
  it('finds a card by its point and returns null for a stranger', () => {
    const html = fullBoard({ now: nowEntry(361, 'T', '14:34 · ~19:00') })
    expect(nowCard(html, 361)).toContain('361 — T')
    expect(nowCard(html, 999)).toBeNull()
  })
})
