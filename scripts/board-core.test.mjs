// The card edit behind `board.mjs status` (point 372): it must produce exactly
// the markup the board guard accepts — a stamped status — and refuse the cases
// where silently doing nothing would leave the reader with a stale card.
import { describe, it, expect } from 'vitest'
import { berlinStamp, setCardStatus } from './board-core.mjs'

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
