// The card edit behind `board.mjs status` (point 372): it must produce exactly
// the markup the board guard accepts — a stamped status — and refuse the cases
// where silently doing nothing would leave the reader with a stale card.
import { describe, it, expect } from 'vitest'
import { berlinStamp, promoteToNow, setCardStatus } from './board-core.mjs'

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
