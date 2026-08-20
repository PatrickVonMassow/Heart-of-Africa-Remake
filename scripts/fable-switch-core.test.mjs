import { describe, expect, it } from 'vitest'
import {
  FABLE_MODEL,
  SOL_MODEL,
  fableIsOn,
  isSwitchFallbackReason,
  mergeFallbackReason,
  mergerModel,
  readState,
  requireState,
  servingChain,
  statePathFrom,
  statusReport,
  unreadableState,
  writeState,
} from './fable-switch-core.mjs'

const on = () => readState(JSON.stringify(writeState('on', { why: 'capacity restored', by: 'the user', now: 1_700_000_000_000 })))
const off = () => readState(JSON.stringify(writeState('off', { why: 'not enough volume left', by: 'the user', now: 1_700_000_000_000 })))

describe('the Fable state record', () => {
  it('round-trips a complete record and reports every decision field', () => {
    const state = off()
    expect(state).toMatchObject({ ok: true, state: 'off', reason: 'not enough volume left', setBy: 'the user' })
    expect(statusReport(state)).toBe(
      'fable-switch: OFF — reason: not enough volume left — set by the user at 2023-11-14T22:13:20.000Z',
    )
  })

  it.each([
    ['absent', readState(null)],
    ['unreadable', unreadableState(new Error('EACCES'))],
    ['garbled JSON', readState('{not json')],
    ['incomplete', readState('{"state":"off"}')],
  ])('%s state fails loud instead of choosing a direction', (_name, state) => {
    expect(state.ok).toBe(false)
    expect(state.state).toBeNull()
    expect(state.problem).toContain('node scripts/fable-switch.mjs --status')
    expect(() => fableIsOn(state)).toThrow(/fable-switch\.mjs --status/)
    expect(() => mergerModel(state)).toThrow(/fable-switch\.mjs --status/)
  })

  it('refuses incomplete writes', () => {
    expect(() => writeState('sideways', { why: 'x', by: 'y' })).toThrow(/on or off/)
    expect(() => writeState('off', { why: '', by: 'y' })).toThrow(/--why/)
    expect(() => writeState('off', { why: 'x', by: '' })).toThrow(/setter/)
    expect(() => requireState({ state: 'off' })).toThrow(/fable-switch\.mjs/)
  })

  it('lives in the main checkout shared by delegated worktrees', () => {
    expect(statePathFrom('/workspace/hoa/.git', '/workspace/hoa/.claude/worktrees/p788')).toBe(
      '/workspace/hoa/.claude/fable-switch.json',
    )
  })
})

describe('decisions derived from the state', () => {
  it('includes Fable in the serving chain only while on', () => {
    expect(servingChain(on())).toEqual(['Opus 5', FABLE_MODEL, 'Opus 4.8'])
    expect(servingChain(off())).toEqual(['Opus 5', 'Opus 4.8'])
  })

  it('selects Fable as merger while on and Sol while off', () => {
    expect(mergerModel(on())).toBe(FABLE_MODEL)
    expect(mergerModel(off())).toBe(SOL_MODEL)
  })

  it('emits one checkable switch fallback without accepting a bare claim', () => {
    const reason = mergeFallbackReason(off())
    expect(reason).toContain('Fable 5 is switched off')
    expect(reason).toContain('not enough volume left')
    expect(isSwitchFallbackReason(reason)).toBe(true)
    expect(isSwitchFallbackReason('Fable 5 was there')).toBe(false)
    expect(mergeFallbackReason(on())).toBe('')
  })
})
