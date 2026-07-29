// ABSENT IS NOT UNREADABLE — the one distinction the secret reader owes its
// callers.
//
// A machine that never paired a phone has no secret file, and the channel is
// meant to stay silent there. Every other failure of that read takes the whole
// channel down: the topics cannot be derived, so every message the user sends is
// dropped before it is even parsed — and until this split existed both states
// answered `null`, so the fault was indistinguishable from the opt-out and was
// reported to nobody.
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifySecret, generateSecret, readSecret, readSecretStatus } from './chat-secret.mjs'

const dirs = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'hoa-chat-secret-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const err = (code) => Object.assign(new Error(`${code}: nope`), { code })

describe('classifySecret — pure', () => {
  it('reads a real secret, trimmed the way the browser side trims it', () => {
    expect(classifySecret({ raw: '  abcde-fghij\n' })).toEqual({ state: 'ok', secret: 'abcde-fghij', reason: null })
  })

  it('calls a MISSING file absent, with no reason to report', () => {
    expect(classifySecret({ error: err('ENOENT') })).toEqual({ state: 'absent', secret: null, reason: null })
  })

  it('calls every OTHER read failure unreadable, and names it', () => {
    for (const code of ['EACCES', 'EPERM', 'EISDIR', 'EBUSY', 'EIO']) {
      const r = classifySecret({ error: err(code) })
      expect(r.state).toBe('unreadable')
      expect(r.secret).toBeNull()
      expect(r.reason).toContain(code)
    }
  })

  it('calls an EXISTING but empty file unreadable — that is a truncated write, not an opt-out', () => {
    for (const raw of ['', '   ', '\n', '\t\r\n ']) {
      expect(classifySecret({ raw }).state).toBe('unreadable')
    }
  })

  it('survives an error object with no code and no message', () => {
    const r = classifySecret({ error: {} })
    expect(r.state).toBe('unreadable')
    expect(typeof r.reason).toBe('string')
  })

  it('treats no argument at all as an empty read rather than throwing', () => {
    expect(() => classifySecret()).not.toThrow()
    expect(classifySecret().state).toBe('unreadable')
  })
})

describe('readSecretStatus — against the real filesystem', () => {
  it('reports absent for a path that does not exist', () => {
    expect(readSecretStatus(join(tmp(), 'nothing-here')).state).toBe('absent')
  })

  it('reports ok for a paired machine', () => {
    const p = join(tmp(), 'chat-secret')
    const secret = generateSecret()
    writeFileSync(p, `${secret}\n`, 'utf8')
    expect(readSecretStatus(p)).toEqual({ state: 'ok', secret, reason: null })
  })

  it('reports unreadable for a DIRECTORY where the secret should be', () => {
    const p = join(tmp(), 'chat-secret')
    mkdirSync(p)
    const r = readSecretStatus(p)
    expect(r.state).toBe('unreadable')
    expect(r.secret).toBeNull()
  })

  it('reports unreadable for a truncated (empty) secret file', () => {
    const p = join(tmp(), 'chat-secret')
    writeFileSync(p, '', 'utf8')
    expect(readSecretStatus(p).state).toBe('unreadable')
  })
})

describe('readSecret keeps its old contract', () => {
  it('is the secret when there is one and null in BOTH failure states', () => {
    const dir = tmp()
    expect(readSecret(join(dir, 'missing'))).toBeNull()
    const broken = join(dir, 'broken')
    writeFileSync(broken, '  \n', 'utf8')
    expect(readSecret(broken)).toBeNull()
    const good = join(dir, 'good')
    writeFileSync(good, 'sekrit\n', 'utf8')
    expect(readSecret(good)).toBe('sekrit')
  })
})
