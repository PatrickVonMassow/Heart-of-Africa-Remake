import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ARCHIVE_CONTENT_URL,
  BOARD_CONTENT_URL,
  BOARD_PAGE_URL,
  BOARD_REF,
  LIVE_GRACE_MS,
  WATCHDOG_TICK_MS,
  isPublishDue,
  liveBoardVerdict,
  liveCheckUrl,
  normaliseOpenSet,
  openFingerprintOfTasks,
  openSetFingerprint,
  pagesFailurePatch,
  pagesPublishPatch,
  publishCapability,
  publishDuePatch,
  readFingerprint,
  stampFingerprint,
  syncedPublishPatch,
  watchdogDecision,
} from './board-currency-core.mjs'

const board = (extra = '') => `﻿<title>HoA Batch-Dashboard</title>\n<style>x</style>\n${extra}<main><h1>Board</h1></main>`

describe('the open-point fingerprint', () => {
  it('is order-independent and duplicate-proof', () => {
    expect(openSetFingerprint([3, 1, 2])).toBe(openSetFingerprint([1, 2, 3, 3]))
  })

  it('changes when a point is added, removed or ticked', () => {
    const base = openSetFingerprint([1, 2, 3])
    expect(openSetFingerprint([1, 2, 3, 4])).not.toBe(base)
    expect(openSetFingerprint([1, 2])).not.toBe(base)
  })

  it('normalises away everything that is not a point number', () => {
    expect(normaliseOpenSet([5, '4', null, undefined, -1, 0, 2.5, NaN, 4])).toEqual([4, 5])
    expect(normaliseOpenSet('nonsense')).toEqual([])
    expect(openSetFingerprint(null)).toBe(openSetFingerprint([]))
  })

  it('is a short, stable, prefixed digest', () => {
    expect(openSetFingerprint([400])).toMatch(/^sha256:[0-9a-f]{16}$/)
    expect(openSetFingerprint([400])).toBe(openSetFingerprint([400]))
  })
})

describe('stamping the fingerprint into a board document', () => {
  it('writes the meta after the title and reads it back', () => {
    const stamped = stampFingerprint(board(), 'sha256:abc')
    expect(readFingerprint(stamped)).toBe('sha256:abc')
    expect(stamped.indexOf('<meta name="hoa-board-open"')).toBeGreaterThan(stamped.indexOf('</title>'))
    expect(stamped).toContain('<main>')
  })

  it('is idempotent and replaces an older stamp rather than stacking metas', () => {
    const once = stampFingerprint(board(), 'sha256:one')
    expect(stampFingerprint(once, 'sha256:one')).toBe(once)
    const twice = stampFingerprint(once, 'sha256:two')
    expect(readFingerprint(twice)).toBe('sha256:two')
    expect(twice.match(/hoa-board-open/g)).toHaveLength(1)
  })

  it('still stamps a document without a title, and reads nothing from junk', () => {
    expect(readFingerprint(stampFingerprint('<main>x</main>', 'sha256:z'))).toBe('sha256:z')
    expect(readFingerprint('<main>x</main>')).toBeNull()
    expect(readFingerprint(null)).toBeNull()
  })
})

describe('delta A — the due mark is set only on a real change', () => {
  const fp = openSetFingerprint([1, 2])

  it('writes nothing when the open set is unchanged', () => {
    expect(publishDuePatch({ state: { openFingerprint: fp }, fingerprint: fp })).toBeNull()
  })

  it('records the FIRST observation without demanding a publish', () => {
    const patch = publishDuePatch({ state: {}, fingerprint: fp, at: 10 })
    expect(patch).toEqual({ openFingerprint: fp, openFingerprintAt: 10 })
    expect(patch.publishDue).toBeUndefined()
  })

  it('marks a publish due when the set actually changed', () => {
    const next = openSetFingerprint([1, 2, 3])
    const patch = publishDuePatch({ state: { openFingerprint: fp }, fingerprint: next, at: 99 })
    expect(patch.openFingerprint).toBe(next)
    expect(patch.publishDue).toEqual({ at: 99, fingerprint: next, previous: fp })
  })

  it('does not demand a publish for a set the live board already shows', () => {
    const next = openSetFingerprint([1, 2, 3])
    const patch = publishDuePatch({
      state: { openFingerprint: fp, publishedFingerprint: next },
      fingerprint: next,
    })
    expect(patch.publishDue).toBeUndefined()
  })

  it('CLEARS a standing due mark once the live board caught up', () => {
    const patch = publishDuePatch({
      state: { openFingerprint: fp, publishedFingerprint: fp, publishDue: { at: 1, fingerprint: fp } },
      fingerprint: fp,
    })
    expect(patch).toEqual({ publishDue: undefined })
  })

  it('never throws on partial or hostile input', () => {
    expect(publishDuePatch()).toBeNull()
    expect(publishDuePatch({ fingerprint: '' })).toBeNull()
    expect(publishDuePatch({ state: 'nonsense', fingerprint: fp })).toEqual(
      expect.objectContaining({ openFingerprint: fp }),
    )
    expect(isPublishDue(null)).toBe(false)
    expect(isPublishDue({ publishDue: { at: 1 } })).toBe(true)
    expect(isPublishDue({ publishDue: 'yes' })).toBe(false)
    expect(isPublishDue({ publishDue: [] })).toBe(false)
  })
})

describe('delta B — one fingerprint source, one place that clears the mark', () => {
  const TASKS = [
    '## Checklist',
    '- [ ] 400. the board is current',
    '- [x] 399. an older point',
    '- [ ] 401. DEFERRED — waiting on the user',
    'not a checkbox line at all',
  ].join('\n')

  it('derives the fingerprint from the work order exactly as the audit parses it', () => {
    // Open = 400 only: the tick is done, the DEFERRED line is not counted.
    expect(openFingerprintOfTasks(TASKS)).toBe(openSetFingerprint([400]))
    expect(openFingerprintOfTasks(null)).toBe(openSetFingerprint([]))
  })

  it('the mark the heartbeat sets is exactly the one an attestation clears', () => {
    // The regression this guards: two derivations of "the open set" would let a
    // publish clear a mark that the next tool call immediately re-armed.
    const fingerprint = openFingerprintOfTasks(TASKS)
    const armed = publishDuePatch({ state: { openFingerprint: openSetFingerprint([1]) }, fingerprint, at: 5 })
    expect(armed.publishDue).toEqual({ at: 5, fingerprint, previous: openSetFingerprint([1]) })
    const state = { ...armed, publishedHash: 'h1' }
    const cleared = syncedPublishPatch({ state, fileHash: 'h1', fingerprint, at: 9 })
    expect(cleared).toEqual({ publishDue: undefined, publishedFingerprint: fingerprint, publishedFingerprintAt: 9 })
    // …and with the mark cleared and the live fingerprint recorded, the next
    // observation of the SAME set demands nothing again.
    expect(publishDuePatch({ state: { ...state, ...cleared }, fingerprint })).toBeNull()
  })

  it('a DEFERRED publish leaves the mark standing — the live board is still behind', () => {
    const state = { publishedHash: 'h1', publishDeferred: { repoHash: 'h1', reason: 'headless' } }
    expect(syncedPublishPatch({ state, fileHash: 'h1', fingerprint: 'sha256:x' })).toEqual({})
  })

  it('attesting bytes that were never published clears nothing', () => {
    expect(syncedPublishPatch({ state: { publishedHash: 'other' }, fileHash: 'h1', fingerprint: 'sha256:x' })).toEqual({})
    expect(syncedPublishPatch({ state: { publishedHash: 'h1' }, fileHash: null, fingerprint: 'sha256:x' })).toEqual({})
  })

  it('clears the mark even when no fingerprint could be computed, and never throws', () => {
    expect(syncedPublishPatch({ state: { publishedHash: 'h1' }, fileHash: 'h1' })).toEqual({ publishDue: undefined })
    expect(syncedPublishPatch()).toEqual({})
    expect(syncedPublishPatch({ state: 'nonsense', fileHash: 'h1' })).toEqual({})
  })
})

describe('delta B — who is allowed to be denied', () => {
  it('the pages transport makes every session capable, headless included', () => {
    expect(publishCapability({ transport: 'pages', state: null })).toEqual({ canPublish: true, how: 'pages' })
  })

  it('an Artifact call seen in THIS session counts', () => {
    const state = { artifactToolSeen: { sessionId: 's1', at: 1 } }
    expect(publishCapability({ state, sessionId: 's1' }).canPublish).toBe(true)
    expect(publishCapability({ state, sessionId: 's2' }).canPublish).toBe(false)
  })

  it('a session with neither transport nor Artifact tool is NOT capable', () => {
    expect(publishCapability({ state: {}, sessionId: 's1' })).toEqual({ canPublish: false, how: null })
    expect(publishCapability()).toEqual({ canPublish: false, how: null })
  })
})

describe('delta D/E — judging the LIVE page', () => {
  const expected = 'sha256:aaaa'
  const live = (fp) => stampFingerprint(board(), fp)

  it('calls a matching page current', () => {
    expect(liveBoardVerdict({ liveHtml: live(expected), expected }).verdict).toBe('current')
  })

  it('tolerates the deploy/CDN latency instead of flapping', () => {
    const v = liveBoardVerdict({ liveHtml: live('sha256:old'), expected, publishedAt: 1000, now: 1000 + 60_000 })
    expect(v.verdict).toBe('settling')
  })

  it('calls a page behind once the grace has passed', () => {
    const v = liveBoardVerdict({
      liveHtml: live('sha256:old'),
      expected,
      publishedAt: 1000,
      now: 1000 + LIVE_GRACE_MS + 1,
    })
    expect(v.verdict).toBe('behind')
    expect(v.live).toBe('sha256:old')
  })

  it('treats a page that was never published as behind, not as settling', () => {
    expect(liveBoardVerdict({ liveHtml: live('sha256:old'), expected, publishedAt: 0 }).verdict).toBe('behind')
  })

  it('NEVER claims current when the page cannot be read', () => {
    expect(liveBoardVerdict({ fetchError: new Error('ENOTFOUND'), expected }).verdict).toBe('unreachable')
    expect(liveBoardVerdict({ liveHtml: '', expected }).verdict).toBe('unreachable')
    expect(liveBoardVerdict({ liveHtml: board(), expected }).verdict).toBe('unreachable')
    expect(liveBoardVerdict({ liveHtml: null, expected }).verdict).toBe('unreachable')
  })

  it('says so honestly when there is nothing to compare against', () => {
    expect(liveBoardVerdict({ liveHtml: live(expected), expected: null }).verdict).toBe('unknown')
  })
})

describe('delta E — the watchdog alert decision', () => {
  const now = 10_000_000

  it('stays silent on a current board', () => {
    expect(watchdogDecision({ verdict: 'current', state: {}, now }).notify).toBe(false)
  })

  it('alerts on a board that is behind, and names the page', () => {
    const d = watchdogDecision({ verdict: 'behind', live: 'sha256:old', expected: 'sha256:new', state: {}, now })
    expect(d.notify).toBe(true)
    expect(d.message).toContain(BOARD_PAGE_URL)
    expect(d.priority).toBe('high')
  })

  it('alerts on an unreachable board', () => {
    const d = watchdogDecision({ verdict: 'unreachable', reason: 'HTTP 404', state: {}, now })
    expect(d.notify).toBe(true)
    expect(d.title).toBe('Board unreachable')
    expect(d.message).toContain('HTTP 404')
  })

  it('repeats itself at most once per fault', () => {
    const args = { verdict: 'behind', live: 'a', expected: 'b', state: {}, now }
    const first = watchdogDecision(args)
    expect(watchdogDecision({ ...args, lastKey: first.key }).notify).toBe(false)
  })

  it('alerts on a publishDue that survived a whole tick, and not before', () => {
    const state = { publishDue: { at: now - WATCHDOG_TICK_MS + 1000 } }
    expect(watchdogDecision({ verdict: 'current', state, now }).notify).toBe(false)
    const late = { publishDue: { at: now - WATCHDOG_TICK_MS - 1000 } }
    expect(watchdogDecision({ verdict: 'current', state: late, now }).notify).toBe(true)
  })

  it('escalates a publish that failed and was never retried', () => {
    const state = { publishFailed: { at: now - WATCHDOG_TICK_MS * 2 } }
    const d = watchdogDecision({ verdict: 'current', state, now })
    expect(d.notify).toBe(true)
    expect(d.priority).toBe('urgent')
  })

  it('never throws on junk', () => {
    expect(watchdogDecision().notify).toBe(false)
    expect(watchdogDecision({ state: 'nope', verdict: 'weird' }).notify).toBe(false)
  })
})

describe('the transport constants are the ones the docs name', () => {
  it('points at a branch of this repository, never at main', () => {
    expect(BOARD_REF).toBe('refs/heads/board')
    expect(BOARD_CONTENT_URL).toBe(
      'https://raw.githubusercontent.com/PatrickVonMassow/Heart-of-Africa-Remake/board/board.html',
    )
    expect(BOARD_PAGE_URL).toBe('https://patrickvonmassow.github.io/Heart-of-Africa-Remake/board/')
  })
})

describe('delta D — what a pages publish records', () => {
  it('clears the due mark, the deferral and the last failure in one patch', () => {
    const p = pagesPublishPatch({ fileHash: 'h1', fingerprint: 'sha256:aa', at: 7 })
    expect(p.publishDue).toBeUndefined()
    expect(p.publishDeferred).toBeUndefined()
    expect(p.publishFailed).toBeUndefined()
    expect(p.pagesPublishedHash).toBe('h1')
    expect(p.pagesPublishedAt).toBe(7)
    expect(p.publishedFingerprint).toBe('sha256:aa')
    // Every one of those keys must be PRESENT, or mergeState (which deletes on
    // an explicit undefined) would leave the mark it was meant to clear.
    for (const k of ['publishDue', 'publishDeferred', 'publishFailed']) {
      expect(Object.prototype.hasOwnProperty.call(p, k)).toBe(true)
    }
  })

  it('never claims an ARTIFACT publish that did not happen', () => {
    // The Artifact mirror is attested by `publishedHash`. A pages publish that
    // wrote that key would make the mirror look current while it is not — the
    // exact dishonesty this point exists to end.
    expect(pagesPublishPatch({ fileHash: 'h1', fingerprint: 'sha256:aa' }).publishedHash).toBeUndefined()
  })

  it('records a failure with its reason and leaves the due mark standing', () => {
    const p = pagesFailurePatch({ reason: 'push rejected', at: 11 })
    expect(p.publishFailed).toEqual({ at: 11, reason: 'push rejected' })
    expect(Object.prototype.hasOwnProperty.call(p, 'publishDue')).toBe(false)
  })

  it('survives junk on both patches', () => {
    expect(() => pagesPublishPatch()).not.toThrow()
    expect(() => pagesPublishPatch({ fileHash: 5, fingerprint: {} })).not.toThrow()
    expect(pagesPublishPatch({}).publishedFingerprint).toBeUndefined()
    expect(pagesFailurePatch().publishFailed.reason).toBe('unknown')
  })

  it('busts the CDN cache with a fresh query on every check', () => {
    expect(liveCheckUrl(BOARD_CONTENT_URL, 1234)).toBe(`${BOARD_CONTENT_URL}?t=1234`)
    expect(liveCheckUrl('https://x/y?a=1', 9)).toBe('https://x/y?a=1&t=9')
    expect(liveCheckUrl(BOARD_CONTENT_URL, 1)).not.toBe(liveCheckUrl(BOARD_CONTENT_URL, 2))
  })
})

describe('delta D — the viewer pages fetch the branch this module names', () => {
  // The URL exists twice by necessity: once here, once as a literal inside the
  // deployed viewer, which cannot import a Node module. A drift between them
  // would leave the reader on a page that quietly shows nothing, so it is
  // pinned rather than trusted.
  const read = (...p) => readFileSync(resolve(process.cwd(), 'public', 'board', ...p), 'utf8')

  it('the board viewer reads BOARD_CONTENT_URL', () => {
    expect(read('index.html')).toContain(BOARD_CONTENT_URL)
  })

  it('the archive viewer reads ARCHIVE_CONTENT_URL', () => {
    expect(read('archive', 'index.html')).toContain(ARCHIVE_CONTENT_URL)
  })

  it('both cache-bust, and neither renders an empty body as a board', () => {
    for (const html of [read('index.html'), read('archive', 'index.html')]) {
      expect(html).toMatch(/\?t=' \+ Date\.now\(\)/)
      expect(html).toMatch(/cache: 'no-store'/)
      expect(html).toMatch(/if \(!html\.trim\(\)\)/)
    }
  })
})
