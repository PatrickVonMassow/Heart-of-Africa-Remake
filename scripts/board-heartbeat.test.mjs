// The heartbeat's I/O half (point 848): what it reads, what it writes, and the
// promise that it never takes its caller down. Every dependency is injected, so
// no case touches the real board, its branch or the network.
import { describe, it, expect } from 'vitest'
import { heartbeat, TRIGGERS } from './board-heartbeat.mjs'
import { REASONS, STALE_AFTER_MS } from './board-heartbeat-core.mjs'

const NOW = 1_700_000_000_000
const FOCUS = { point: 847, note: 'Sol-Prüfrunden zu Punkt 847' }
const stale = { pagesPublishedAt: NOW - STALE_AFTER_MS - 1 }
const fresh = { pagesPublishedAt: NOW - 1_000 }

/** A writeStatus that records what it was asked to publish. */
const recorder = () => {
  const calls = []
  return { calls, write: (point, status) => calls.push({ point, status }) }
}

describe('a recording step carries the board', () => {
  it('restamps the now-card with the focus and the round that just landed', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3 abgeschlossen (do-not-merge)',
      now: NOW,
      state: stale,
      focus: FOCUS,
      cardPoint: 847,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(true)
    expect(calls).toEqual([
      { point: 847, status: 'Sol-Prüfrunden zu Punkt 847 · Runde 3 abgeschlossen (do-not-merge)' },
    ])
  })

  it('writes nothing at all while the card is current', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.MECHANISM_RECORD,
      detail: 'Prüfung aufgezeichnet',
      now: NOW,
      state: fresh,
      focus: FOCUS,
      cardPoint: 847,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe(REASONS.CURRENT)
    expect(calls).toEqual([])
  })

  it('reads staleness from the LIVE publish stamp, not from the retired mirror', () => {
    // `publishedAt` belongs to the transport retired on 29.07.2026 and is never
    // written any more. Reading it would make every trigger publish.
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.IN_FLIGHT,
      detail: 'Suite läuft',
      now: NOW,
      state: { pagesPublishedAt: NOW - 1_000, publishedAt: NOW - 30 * 24 * 3_600_000 },
      focus: FOCUS,
      cardPoint: 847,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('what it refuses, and what it survives', () => {
  it('has no card to carry when neither the focus nor the board names a point', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.MECHANISM_RECORD,
      detail: 'Prüfung aufgezeichnet',
      now: NOW,
      state: stale,
      focus: { point: null, note: 'Abschluss vorbereiten' },
      cardPoint: null,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('no-target')
    expect(calls).toEqual([])
  })

  it('NEVER throws when the board write fails — the caller recorded real work', () => {
    const said = []
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
      now: NOW,
      state: stale,
      focus: FOCUS,
      cardPoint: 847,
      writeStatus: () => {
        throw new Error('publish precondition refused')
      },
      stderr: (line) => said.push(line),
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('failed')
    // Swallowed, but never silently: the operator is told the board fell behind.
    expect(said.join('\n')).toMatch(/board heartbeat: the now-card could not be carried/)
    expect(said.join('\n')).toMatch(/publish precondition refused/)
  })

  it('treats a board that has never been published as stale, not as fresh', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 1',
      now: NOW,
      state: {},
      focus: FOCUS,
      cardPoint: 847,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(true)
    expect(result.reason).toBe(REASONS.NEVER_STAMPED)
    expect(calls).toHaveLength(1)
  })

  it('leaves a card alone whose point disagrees with the declared focus', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
      now: NOW,
      state: stale,
      focus: FOCUS,
      cardPoint: 720,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe(REASONS.CARD_MISMATCH)
    expect(calls).toEqual([])
  })
})
