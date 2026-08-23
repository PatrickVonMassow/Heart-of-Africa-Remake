import { describe, expect, it } from 'vitest'
import {
  REMINDER_INTERVAL,
  carrierBellDecision,
  oldestFinding,
  renderCarrierBell,
} from './carrier-bell-core.mjs'

const NOW = 1_800_000_000_000
const finding = (over = {}) => ({
  at: '2026-08-18T13:00:00.000Z',
  session: 'window-1',
  title: 'The finding that waited',
  ...over,
})

describe('the carrier bell decision', () => {
  it('rings for waiting entries when this session owns the batch', () => {
    const decision = carrierBellDecision({ waiting: [finding()], ownsBatch: true, now: NOW })
    expect(decision.line).toBe(
      'FINDINGS CARRIER: 1 waiting; oldest [2026-08-18T13:00:00.000Z] "The finding that waited". ' +
        'Drain: node scripts/finding.mjs --drain',
    )
  })

  it('emits zero text for an empty carrier', () => {
    expect(carrierBellDecision({ waiting: [], ownsBatch: true, now: NOW }).line).toBe('')
    expect(renderCarrierBell([])).toBe('')
  })

  it('emits nothing for a non-owner or a paused owner', () => {
    expect(carrierBellDecision({ waiting: [finding()], ownsBatch: false, now: NOW }).line).toBe('')
    expect(carrierBellDecision({ waiting: [finding()], ownsBatch: true, paused: true, now: NOW }).line).toBe('')
  })

  it('gives a chat message the call and rings on the next call', () => {
    const chatCall = carrierBellDecision({
      waiting: [finding()],
      ownsBatch: true,
      chatDelivered: true,
      now: NOW,
    })
    expect(chatCall.line).toBe('')
    expect(chatCall.reason).toBe('chat-first')

    const nextCall = carrierBellDecision({
      waiting: [finding()],
      ownsBatch: true,
      now: NOW + 1,
      state: chatCall.state,
    })
    expect(nextCall.line).toContain('FINDINGS CARRIER: 1 waiting')
    expect(nextCall.reason).toBe('deferred')
  })

  it('does not repeat inside the reminder interval', () => {
    const first = carrierBellDecision({ waiting: [finding()], ownsBatch: true, now: NOW })
    const second = carrierBellDecision({
      waiting: [finding()],
      ownsBatch: true,
      now: NOW + REMINDER_INTERVAL - 1,
      state: first.state,
    })
    expect(second.line).toBe('')
    expect(second.reason).toBe('throttled')

    const due = carrierBellDecision({
      waiting: [finding()],
      ownsBatch: true,
      now: NOW + REMINDER_INTERVAL,
      state: second.state,
    })
    expect(due.line).toContain('FINDINGS CARRIER: 1 waiting')
  })

  it('rings immediately when the waiting count rises', () => {
    const first = carrierBellDecision({ waiting: [finding()], ownsBatch: true, now: NOW })
    const risen = carrierBellDecision({
      waiting: [finding(), finding({ title: 'A new finding' })],
      ownsBatch: true,
      now: NOW + 1,
      state: first.state,
    })
    expect(risen.line).toContain('FINDINGS CARRIER: 2 waiting')
    expect(risen.reason).toBe('count-risen')
  })

  it('recognises a rise after the carrier count first fell', () => {
    const first = carrierBellDecision({ waiting: [finding(), finding()], ownsBatch: true, now: NOW })
    const fell = carrierBellDecision({
      waiting: [finding()],
      ownsBatch: true,
      now: NOW + 1,
      state: first.state,
    })
    const risen = carrierBellDecision({
      waiting: [finding(), finding({ title: 'Replacement finding' })],
      ownsBatch: true,
      now: NOW + 2,
      state: fell.state,
    })
    expect(fell.line).toBe('')
    expect(risen.line).toContain('FINDINGS CARRIER: 2 waiting')
  })
})

describe('the oldest entry named by the bell', () => {
  it('uses timestamps rather than relying on file order', () => {
    const later = finding({ at: '2026-08-18T14:00:00.000Z', title: 'later' })
    const earlier = finding({ at: '2026-08-18T12:00:00.000Z', title: 'earlier' })
    expect(oldestFinding([later, earlier])).toBe(earlier)
    expect(renderCarrierBell([later, earlier])).toContain('[2026-08-18T12:00:00.000Z] "earlier"')
  })

  it('flattens a hand-written title so the bell stays one line', () => {
    const line = renderCarrierBell([finding({ title: 'first\nforged line' })])
    expect(line.split('\n')).toHaveLength(1)
    expect(line).toContain('"first forged line"')
  })
})
