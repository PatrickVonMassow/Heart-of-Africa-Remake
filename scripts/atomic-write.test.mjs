// The atomic write that survives a Windows moment (point 388, live finding 1).
// The measured failure: `EPERM: operation not permitted, rename
// batch-lock.json.tmp-9904 -> batch-lock.json` — an antivirus or the indexer
// holding the target for a few milliseconds — after which the guard failed open
// and the handover was silently not written.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isTransientWriteError,
  writeJsonAtomic,
  tryWriteJsonAtomic,
  TRANSIENT_WRITE_CODES,
  WRITE_RETRY_DELAYS_MS,
} from './atomic-write.mjs'

const err = (code) => Object.assign(new Error(`${code}: nope`), { code })
/** A rename that fails `failures` times with `code`, then succeeds. */
const flakyRename = (failures, code = 'EPERM') => {
  const state = { calls: 0, names: [] }
  const rename = (from, to) => {
    state.calls++
    state.names.push(from)
    if (state.calls <= failures) throw err(code)
    state.to = to
  }
  return { rename, state }
}

describe('isTransientWriteError — retry a held file, never a full disk', () => {
  it('treats the Windows holding codes as transient', () => {
    for (const c of ['EPERM', 'EBUSY', 'EACCES', 'EAGAIN', 'ETXTBSY']) {
      expect(isTransientWriteError(err(c))).toBe(true)
      expect(TRANSIENT_WRITE_CODES.has(c)).toBe(true)
    }
  })

  it('never retries a write that cannot succeed', () => {
    for (const c of ['ENOSPC', 'EROFS', 'EISDIR', 'ENOENT', undefined]) {
      expect(isTransientWriteError(err(c))).toBe(false)
    }
    expect(isTransientWriteError(null)).toBe(false)
  })
})

describe('writeJsonAtomic — the retry', () => {
  const noop = () => {}
  const deps = (over = {}) => ({
    delays: [1, 1, 1, 1],
    sleep: noop,
    write: noop,
    remove: noop,
    ...over,
  })

  it('an EPERM that clears on the third attempt still lands', () => {
    const { rename, state } = flakyRename(2)
    const res = writeJsonAtomic('lock.json', { a: 1 }, deps({ rename }))
    expect(res.ok).toBe(true)
    expect(res.attempts).toBe(3)
    expect(state.to).toBe('lock.json')
  })

  it('each attempt uses a FRESH temp name — retrying into the held file is no retry', () => {
    const { rename, state } = flakyRename(2)
    writeJsonAtomic('lock.json', { a: 1 }, deps({ rename }))
    expect(new Set(state.names).size).toBe(3)
  })

  it('backs off between attempts', () => {
    const slept = []
    const { rename } = flakyRename(2)
    writeJsonAtomic('lock.json', { a: 1 }, deps({ rename, sleep: (ms) => slept.push(ms) }))
    expect(slept).toEqual([1, 1])
  })

  it('gives up after the ladder and throws the LAST error', () => {
    const { rename, state } = flakyRename(99, 'EBUSY')
    expect(() => writeJsonAtomic('lock.json', { a: 1 }, deps({ rename }))).toThrow(/EBUSY/)
    expect(state.calls).toBe(5) // one attempt + four retries
  })

  it('does not retry a permanent error at all', () => {
    const { rename, state } = flakyRename(99, 'ENOSPC')
    expect(() => writeJsonAtomic('lock.json', { a: 1 }, deps({ rename }))).toThrow(/ENOSPC/)
    expect(state.calls).toBe(1)
  })

  it('the shipped ladder is short enough to sit inside a Stop hook', () => {
    expect(WRITE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThan(1000)
    expect(WRITE_RETRY_DELAYS_MS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('tryWriteJsonAtomic — the failure as DATA, so a caller can say so', () => {
  it('reports a persistent failure instead of throwing', () => {
    const { rename } = flakyRename(99)
    const res = tryWriteJsonAtomic('lock.json', { a: 1 }, { delays: [1], sleep: () => {}, write: () => {}, remove: () => {}, rename })
    expect(res.ok).toBe(false)
    expect(String(res.error?.code)).toBe('EPERM')
  })

  it('really writes on a real filesystem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-atomic-'))
    try {
      const p = join(dir, 'x.json')
      expect(tryWriteJsonAtomic(p, { a: 1 }).ok).toBe(true)
      expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual({ a: 1 })
      expect(tryWriteJsonAtomic(p, { a: 2 }).ok).toBe(true) // overwrite
      expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual({ a: 2 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
