import { describe, expect, it } from 'vitest'
import { ROW_STAGING, restageReason } from './rowStaging.mjs'

describe('re-staging the dress row', () => {
  const clear = { score: 16, of: 16 }
  const blocked = { score: 14, of: 16 }
  it('stands a clear, unhidden row', () => {
    expect(restageReason(clear, false, 0, 0)).toBeNull()
  })
  it('stands it again when a passer-by hides it or no bearing is fully clear', () => {
    expect(restageReason(clear, true, 0, 0)).toBe('hidden')
    expect(restageReason(blocked, false, 0, 0)).toBe('blocked')
    expect(restageReason(blocked, true, 2, 1000)).toBe('hidden')
  })
  it('stops at the attempt and time bound, leaving the verdict to the strict check', () => {
    expect(restageReason(blocked, false, ROW_STAGING.attempts - 1, 0)).toBeNull()
    expect(restageReason(blocked, true, 0, ROW_STAGING.maxMs)).toBeNull()
  })
})
