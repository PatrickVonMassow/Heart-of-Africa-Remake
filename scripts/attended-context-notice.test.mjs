import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { markAttendedContextNotice, prepareAttendedContextNotice } from './attended-context-notice.mjs'
import { CONTEXT_SESSION_CLASS } from './session-context-ceiling-core.mjs'

const roots = []
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true })
})

const fixture = () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'hoa-attended-context-notice-'))
  roots.push(dir)
  return dir
}

describe('the durable attended notice', () => {
  it('speaks once in one session and does not silence another session', () => {
    const dir = fixture()
    const input = {
      sessionClass: CONTEXT_SESSION_CLASS.ATTENDED,
      sessionId: 'window-a',
      tokens: 150_001,
    }
    const first = prepareAttendedContextNotice(input, { dir })
    expect(first).toMatchObject({ speak: true, reason: 'past-ceiling' })
    expect(markAttendedContextNotice(first, { now: () => 123 })).toBe(true)
    expect(prepareAttendedContextNotice(input, { dir })).toMatchObject({
      speak: false,
      reason: 'already-notified',
    })
    expect(prepareAttendedContextNotice({ ...input, sessionId: 'window-b' }, { dir })).toMatchObject({ speak: true })
  })

  it('does not consume a suppression', () => {
    const dir = fixture()
    const input = {
      sessionClass: CONTEXT_SESSION_CLASS.ATTENDED,
      sessionId: 'window-a',
      tokens: 170_000,
    }
    const busy = prepareAttendedContextNotice({ ...input, gitBusy: true }, { dir })
    expect(busy).toMatchObject({ speak: false, reason: 'git-busy' })
    expect(markAttendedContextNotice(busy)).toBe(false)
    expect(prepareAttendedContextNotice(input, { dir })).toMatchObject({ speak: true })
  })
})
