import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  ARCHIVE_CONTENT_URL,
  BOARD_CONTENT_URL,
  boardMissingPoints,
  checkSnapshot,
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
  readFileHash,
  readFingerprint,
  stampFileHash,
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

describe('delta D/E — the live page is compared by what the reader sees', () => {
  // The open-point set is the same on both sides; only the status line or the
  // "Stand" time moved (the 12.09.2026 case: live 14:24, local 15:13, CURRENT).
  const expected = 'sha256:aaaa'
  const sha = (t) => createHash('sha256').update(Buffer.from(t)).digest('hex')
  const repoAt = (stand, status = 'Batch läuft') =>
    board(`<section class="now"><p class="status">${status}</p><p>Stand ${stand}</p></section>\n`)
  const publish = (repo) => stampFileHash(stampFingerprint(repo, expected), sha(repo))
  const old = repoAt('14:24')
  const longAgo = { publishedAt: 1000, now: 1000 + LIVE_GRACE_MS + 1 }

  it('stamps and reads back the repo-file hash beside the fingerprint', () => {
    const page = publish(old)
    expect(readFileHash(page)).toBe(sha(old))
    expect(readFingerprint(page)).toBe(expected)
    expect(stampFileHash(page, sha(old))).toBe(page)
  })

  it('calls the board current when the local file is the one that was published', () => {
    const v = liveBoardVerdict({ liveHtml: publish(old), expected, expectedFile: sha(old), ...longAgo })
    expect(v.verdict).toBe('current')
  })

  it('reports a board that differs only in its "Stand" time as BEHIND, not CURRENT', () => {
    const local = repoAt('15:13')
    const v = liveBoardVerdict({ liveHtml: publish(old), expected, expectedFile: sha(local), ...longAgo })
    expect(v.verdict).toBe('behind')
    expect(v.reason).toMatch(/file hash/)
  })

  it('reports a board that differs only in its status line as BEHIND, not CURRENT', () => {
    const local = repoAt('14:24', 'Batch pausiert')
    const v = liveBoardVerdict({ liveHtml: publish(old), expected, expectedFile: sha(local), ...longAgo })
    expect(v.verdict).toBe('behind')
  })

  it('gives no CDN grace to a local edit that was never published', () => {
    const local = repoAt('15:13')
    const v = liveBoardVerdict({
      liveHtml: publish(old),
      expected,
      expectedFile: sha(local),
      publishedFile: sha(old),
      publishedAt: 1000,
      now: 1000 + 60_000,
    })
    expect(v.verdict).toBe('behind')
  })

  it('keeps the grace for a publish of the local file that is still settling', () => {
    const local = repoAt('15:13')
    const v = liveBoardVerdict({
      liveHtml: publish(old),
      expected,
      expectedFile: sha(local),
      publishedFile: sha(local),
      publishedAt: 1000,
      now: 1000 + 60_000,
    })
    expect(v.verdict).toBe('settling')
  })

  it('does not call a page without a file hash current once a local hash is known', () => {
    const v = liveBoardVerdict({ liveHtml: stampFingerprint(old, expected), expected, expectedFile: sha(old), ...longAgo })
    expect(v.verdict).toBe('behind')
  })
})

describe('--check never calls a board current over an unread local board', () => {
  const expected = 'sha256:aaaa'
  const page = stampFileHash(stampFingerprint(board(), expected), 'f'.repeat(64))

  it('judges an unreadable local board unknown, not current', () => {
    expect(liveBoardVerdict({ liveHtml: page, expected, expectedFile: null }).verdict).toBe('unknown')
    expect(liveBoardVerdict({ liveHtml: page, expected, expectedFile: '' }).verdict).toBe('unknown')
  })

  it('still compares only the open-point set when no local hash is asked for (the watchdog)', () => {
    expect(liveBoardVerdict({ liveHtml: page, expected }).verdict).toBe('current')
  })

  it('the CLI exits non-zero with UNKNOWN when the local board is missing, without fetching', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'hoa-board-check-'))
    try {
      writeFileSync(resolve(root, 'TASKS.md'), '# Tasks\n')
      let out = ''
      let status = 0
      try {
        out = execFileSync(process.execPath, [resolve(__dirname, 'board-publish.mjs'), '--check'], {
          cwd: root,
          env: { ...process.env, HOA_REPO_ROOT: root },
          encoding: 'utf8',
          timeout: 20000,
        })
      } catch (e) {
        status = e.status
        out = String(e.stdout ?? '')
      }
      expect(status).toBe(1)
      expect(out).toMatch(/verdict\s*: UNKNOWN — the local board could not be read/)
      expect(out).not.toMatch(/CURRENT/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 30000)
})

describe('--check reads the local board and the publish record as one snapshot', () => {
  it('re-reads the board under the newer record when a publish lands between the reads', () => {
    // Publish A is recorded; publish B rewrites the file and then its record
    // while --check is reading. The snapshot must pair B with B.
    let file = 'A'
    let reads = 0
    const states = [{ pagesPublishedHash: 'A', pagesPublishedAt: 1 }, { pagesPublishedHash: 'B', pagesPublishedAt: 2 }]
    const snap = checkSnapshot({
      readState: () => states[Math.min(reads++, 1)],
      readBoardHash: () => {
        const h = file
        file = 'B' // the concurrent publish writes its file right after the first read
        return h
      },
    })
    expect(snap).toEqual({ fileHash: 'B', publishedFile: 'B', publishedAt: 2 })
  })

  it('keeps the settling grace for that concurrent publish while the CDN still serves A', () => {
    const snap = { fileHash: 'b'.repeat(64), publishedFile: 'b'.repeat(64), publishedAt: 1000 }
    const cached = stampFileHash(stampFingerprint(board(), 'sha256:aaaa'), 'a'.repeat(64))
    const v = liveBoardVerdict({
      liveHtml: cached,
      expected: 'sha256:aaaa',
      expectedFile: snap.fileHash,
      publishedFile: snap.publishedFile,
      publishedAt: snap.publishedAt,
      now: 1000 + 30_000,
    })
    expect(v.verdict).toBe('settling')
  })

  it('reports an unreadable board as a null hash', () => {
    const snap = checkSnapshot({
      readState: () => ({}),
      readBoardHash: () => {
        throw new Error('ENOENT')
      },
    })
    expect(snap.fileHash).toBeNull()
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
    expect(d.title).toBe('Board out of date')
    expect(d.message).toContain(BOARD_PAGE_URL)
    expect(d.priority).toBe('high')
  })

  it('does not call a CURRENT page out of date when the fault is an unrun publish', () => {
    // A mislabelled alert teaches the reader to distrust the one channel that
    // still speaks while a session is wedged.
    const state = { publishDue: { at: now - WATCHDOG_TICK_MS * 2 } }
    expect(watchdogDecision({ verdict: 'current', state, now }).title).toBe('Board publish outstanding')
  })

  it('alerts on an unreachable board', () => {
    const d = watchdogDecision({ verdict: 'unreachable', reason: 'HTTP 404', state: {}, now })
    expect(d.notify).toBe(true)
    expect(d.title).toBe('Board unreachable')
    expect(d.message).toContain('HTTP 404')
    expect(d.recurring).toBe(false)
  })

  it('declares a one-transport hiccup as a recurring event, not an unanswered condition', () => {
    const d = watchdogDecision({ verdict: 'transport', reason: 'viewer answered', state: {}, now })
    expect(d.notify).toBe(true)
    expect(d.recurring).toBe(true)
  })

  it('keeps a transport hiccup plus an overdue publish condition-shaped', () => {
    const d = watchdogDecision({
      verdict: 'transport',
      reason: 'viewer answered',
      state: { publishDue: { at: now - WATCHDOG_TICK_MS * 2 } },
      now,
    })
    expect(d.message).toMatch(/fetch FAILED.*not stale/i)
    expect(d.message).toMatch(/publish has been due/i)
    expect(d.recurring).toBe(false)
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
    expect(d.message).toContain('not been retried since')
  })

  it('reports a failure that kept failing on retry with its first and latest time', () => {
    const state = { publishFailed: { at: now - WATCHDOG_TICK_MS * 3, lastAt: now - 60000 } }
    const d = watchdogDecision({ verdict: 'current', state, now })
    expect(d.priority).toBe('urgent')
    expect(d.message).toContain(`FAILING since ${Math.round((WATCHDOG_TICK_MS * 3) / 60000)} min ago`)
    expect(d.message).toContain('latest attempt failed 1 min ago')
    expect(d.message).not.toContain('never retried')
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
    expect(p.publishFailed).toEqual({ at: 11, lastAt: 11, reason: 'push rejected' })
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

describe('delta D — a publish is attested by EITHER transport', () => {
  // Four-eyes finding 1: reading only the Artifact record here refused to
  // attest a board that IS live and offered `--defer` as the way out — a false
  // deferral, and one that then makes isPublished true for those bytes.
  it('accepts the pages hash exactly as it accepts the Artifact hash', () => {
    const fp = 'sha256:aa'
    for (const state of [{ publishedHash: 'h1' }, { pagesPublishedHash: 'h1' }]) {
      expect(syncedPublishPatch({ state, fileHash: 'h1', fingerprint: fp })).toMatchObject({
        publishDue: undefined,
        publishedFingerprint: fp,
      })
    }
  })
  it('still attests nothing for bytes NEITHER transport published', () => {
    expect(syncedPublishPatch({ state: { pagesPublishedHash: 'h0' }, fileHash: 'h1', fingerprint: 'x' })).toEqual({})
  })
})

describe('delta D — the stamp may not claim a board that is missing work', () => {
  // Four-eyes finding 3: the fingerprint asserts "this board shows these
  // points". Nothing was checking that it does, so a board missing a card would
  // publish stamped current and BOTH the check and the watchdog would then be
  // green over exactly the missing-card staleness this point exists to end.
  // The queue numbers a card in its own `.num` span; a now-card and a "Von dir
  // zu klären" card carry the number at the head of the TITLE instead — the
  // three parsers this helper feeds all read the real board's shapes.
  const card = (n) =>
    `<details><summary><span class="num">${n}</span><span class="t">T</span></summary><div class="body"><p>b</p></div></details>`
  const titled = (n) =>
    `<details><summary><span class="t">${n} — T</span></summary><div class="body"><p>b</p></div></details>`
  const doc = (queue = '', now = '', k = '') => `<title>B</title>
<main>
<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>${now}</details>
<details class="sect"><summary><h2>Von dir zu klären</h2></summary>${k}</details>
<details class="sect"><summary><h2>Warteschlange</h2></summary>${queue}</details>
<details class="sect"><summary><h2>Erledigt</h2></summary></details>
</main>`

  it('names the open points no section shows', () => {
    expect(boardMissingPoints(doc(card(1)), [1, 2, 3])).toEqual([2, 3])
  })
  it('counts a now-card and a "Von dir zu klären" card as showing the point', () => {
    expect(boardMissingPoints(doc(card(1), titled(2), titled(3)), [1, 2, 3])).toEqual([])
  })
  it('is empty for an empty open set, and never throws on junk', () => {
    expect(boardMissingPoints(doc(), [])).toEqual([])
    for (const bad of [null, undefined, 42, {}]) expect(() => boardMissingPoints(bad, [1])).not.toThrow()
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
