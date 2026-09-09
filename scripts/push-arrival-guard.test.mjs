// The wrapper's one piece of judgement: what this session declared it is
// waiting on, and only while that declaration is still fresh. The four-eyes
// review of 08.09.2026 asked for these three real states by name — no file, a
// damaged file, an aged declaration — because the decision core's own tests
// hand the value in and never reach the reader.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { declaredWait } from './push-arrival-guard.mjs'
import { IN_FLIGHT_MAX_AGE_MS } from './batch-in-flight-core.mjs'

const dir = mkdtempSync(join(tmpdir(), 'push-arrival-'))
const write = (name, body) => {
  const p = join(dir, name)
  writeFileSync(p, body)
  return p
}

describe('declaredWait', () => {
  const now = 1_700_000_000_000

  it('names a fresh declaration', () => {
    const p = write('fresh.json', JSON.stringify({ waitingOn: 'große Regression 1065', at: now - 60_000 }))
    expect(declaredWait(p, now)).toBe('große Regression 1065')
  })

  it('ignores one that has aged past the in-flight window', () => {
    const p = write('stale.json', JSON.stringify({ waitingOn: 'alter Lauf', at: now - IN_FLIGHT_MAX_AGE_MS - 1 }))
    expect(declaredWait(p, now)).toBeNull()
  })

  it('falls back to null when the file is missing', () => {
    expect(declaredWait(join(dir, 'does-not-exist.json'), now)).toBeNull()
  })

  it('falls back to null on a damaged file rather than throwing', () => {
    expect(declaredWait(write('broken.json', '{not json'), now)).toBeNull()
  })

  it('falls back to null when the declaration carries no wait or no timestamp', () => {
    expect(declaredWait(write('empty.json', JSON.stringify({ at: now })), now)).toBeNull()
    expect(declaredWait(write('undated.json', JSON.stringify({ waitingOn: 'x' })), now)).toBeNull()
  })
})
