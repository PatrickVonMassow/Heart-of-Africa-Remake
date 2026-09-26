import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  LIVENESS_GRACE_MS,
  LIVENESS_TICK_MS,
  STANDSTILL_AFTER_MS,
  applyLivenessBlock,
  livenessVerdict,
  pointVerifyVerdict,
  progressLine,
  renderLivenessBlock,
  runningVerifications,
} from './board-liveness-core.mjs'
import { BOARD_MAX_AGE_MS, WATCHDOG_TICK_MS, pagesPublishPatch, staleBoardDue } from './board-currency-core.mjs'
import { structureViolations } from './board-structure-core.mjs'

const NOW = Date.UTC(2026, 8, 23, 8, 51) // 10:51 Berlin
const MIN = 60000
const lock = (ageMs) => ({ sessionId: 'abcdef12-3456', kind: 'session', claimedAt: NOW - ageMs })
const focus = (ageMs, point = 1195) => ({ point, setAt: NOW - ageMs - 1000, confirmedAt: NOW - ageMs })

describe('the liveness verdict the board prints', () => {
  it('stands the tick plus grace as its threshold', () => {
    expect(LIVENESS_TICK_MS).toBe(WATCHDOG_TICK_MS)
    expect(STANDSTILL_AFTER_MS).toBe(LIVENESS_TICK_MS + LIVENESS_GRACE_MS)
  })

  it('a lock absent and no focus stamp: standing, nobody holds, no measured duration', () => {
    const v = livenessVerdict({ now: NOW })
    expect(v.standing).toBe(true)
    expect(v.standingForMs).toBeNull()
    expect(v.text).toContain('BATCH STEHT')
    expect(v.text).toContain('Niemand hält die Batch')
    expect(v.text).toContain('Kein Fokusstempel')
  })

  it('a lock absent with an old focus stamp: standing for the measured time since the stamp', () => {
    const v = livenessVerdict({ focus: focus(89 * MIN), now: NOW, launcherLine: 'SKIP: nothing to spawn' })
    expect(v.standing).toBe(true)
    expect(v.standingForMs).toBe(89 * MIN)
    expect(v.text).toContain('BATCH STEHT seit 1 h 29 min')
    expect(v.text).toContain('Niemand hält die Batch')
    expect(v.text).toContain('Launcher zuletzt: SKIP: nothing to spawn')
  })

  it('a stale heartbeat: standing, with holder and heartbeat age named', () => {
    const v = livenessVerdict({ lock: lock(75 * MIN), focus: focus(90 * MIN), now: NOW })
    expect(v.standing).toBe(true)
    expect(v.standingForMs).toBe(75 * MIN)
    expect(v.text).toContain('BATCH STEHT seit 1 h 15 min — kein Lebenszeichen seit 09:36.')
    expect(v.text).toContain('Batch gehalten von session abcdef12, Herzschlag vor 1 h 15 min.')
    expect(v.text).toContain('Fokusstempel vor 1 h 30 min (Punkt 1195).')
  })

  it('a fresh heartbeat: alive, no launcher line', () => {
    const v = livenessVerdict({ lock: lock(2 * MIN), focus: focus(40 * MIN), now: NOW, launcherLine: 'x' })
    expect(v.standing).toBe(false)
    expect(v.standingForMs).toBeNull()
    expect(v.text).toMatch(/^Batch lebt\./)
    expect(v.text).toContain('Herzschlag vor 2 min')
    expect(v.text).not.toContain('Launcher zuletzt')
  })

  it('the boundary at one tick plus grace, from both sides', () => {
    const at = livenessVerdict({ lock: lock(STANDSTILL_AFTER_MS), now: NOW })
    const past = livenessVerdict({ lock: lock(STANDSTILL_AFTER_MS + 1), now: NOW })
    expect(at.standing).toBe(false)
    expect(past.standing).toBe(true)
    expect(past.standingForMs).toBe(STANDSTILL_AFTER_MS + 1)
    expect(past.text).toContain('BATCH STEHT seit 20 min')
  })

  it('a clockless user-stop says so in those words', () => {
    const pause = { reason: 'Stopp auf deinen Befehl', cause: 'user-stop', retryAfter: null }
    const v = livenessVerdict({ pause, focus: focus(30 * MIN), now: NOW })
    expect(v.standing).toBe(true)
    expect(v.paused).toBe(true)
    expect(v.text).toContain('Pausiert (user-stop): Stopp auf deinen Befehl.')
    expect(v.text).toContain('Halt ohne Uhr — er bleibt, bis du ihn aufhebst.')
  })

  it('a clocked park names its type, reason and restart clock', () => {
    const pause = { reason: 'Kontingent erschöpft\nweitere Zeile', type: 'quota', cause: null, retryAfter: NOW + 45 * MIN }
    const v = livenessVerdict({ pause, lock: lock(1 * MIN), now: NOW })
    expect(v.standing).toBe(false)
    expect(v.text).toContain('Pausiert (quota): Kontingent erschöpft.')
    expect(v.text).toContain('Wiederanlauf 11:36.')
    expect(v.text).not.toContain('weitere Zeile')
  })

  it('a clockless park that is not a user stop is not called the user\'s', () => {
    const v = livenessVerdict({ pause: { reason: 'Doktor', type: 'doctor', retryAfter: null }, now: NOW })
    expect(v.text).toContain('Halt ohne Uhr — kein Wiederanlauf geplant.')
  })
})

describe('the progress line', () => {
  it('no active point', () => {
    expect(progressLine({ point: null, now: NOW })).toBe('Fortschritt: kein aktiver Punkt.')
  })

  it('a running suite with its section, and a green last run', () => {
    const line = progressLine({
      point: 659,
      commit: { at: NOW - 12 * MIN, subject: 'Fix the water errand' },
      running: runningVerifications([
        { argv: ['node', '/w/scripts/verify/run-all.mjs', 'communication', '--section=continuous-route'] },
        { argv: ['node', '/w/scripts/other.mjs'] },
      ]),
      verdict: { status: 'green', suite: 'polish', section: null, at: NOW - 30 * MIN, firstFail: null },
      now: NOW,
    })
    expect(line).toContain('Fortschritt Punkt 659: letzter Commit 10:39 (vor 12 min) „Fix the water errand“.')
    expect(line).toContain('Läuft: communication [continuous-route].')
    expect(line).toContain('Letzter Lauf polish: grün (10:21).')
  })

  it('a red verdict carries its first FAIL line; nothing running is said', () => {
    const runs = [
      { head: 'aaa', suite: 'communication', section: 'continuous-route', exit: 1, at: NOW - 5 * MIN, reds: [{ name: 'continuous route has no browser errors' }, { name: 'second' }] },
      { head: 'aaa', suite: 'communication', exit: 0, at: NOW - 50 * MIN, reds: [] },
      { head: 'zzz', suite: 'polish', exit: 0, at: NOW - 1 * MIN, reds: [] },
    ]
    const verdict = pointVerifyVerdict(runs, ['aaa', 'bbb'])
    expect(verdict).toMatchObject({ status: 'red', suite: 'communication', section: 'continuous-route', firstFail: 'continuous route has no browser errors' })
    const line = progressLine({ point: 659, commit: { at: NOW - MIN, subject: 's' }, running: [], verdict, now: NOW })
    expect(line).toContain('Keine Verifikation läuft.')
    expect(line).toContain('Letzter Lauf communication [continuous-route]: ROT (10:46) — continuous route has no browser errors.')
  })

  it('no run on the branch yet', () => {
    expect(pointVerifyVerdict([{ head: 'x', at: NOW, exit: 0 }], ['y'])).toBeNull()
    expect(progressLine({ point: 1, now: NOW })).toContain('Noch kein Verifikationslauf.')
  })
})

describe('the age/progress publish-due decision', () => {
  const published = (ageMs, head = 'h1') => ({ pagesPublishedAt: NOW - ageMs, pagesPublishedFocusHead: head })

  it('unchanged open set and a board older than the limit is due', () => {
    expect(staleBoardDue({ state: published(BOARD_MAX_AGE_MS + MIN), focusHead: 'h1', now: NOW }).due).toBe(true)
  })

  it('a new focus-branch commit is due', () => {
    const d = staleBoardDue({ state: published(2 * MIN), focusHead: 'h2', now: NOW })
    expect(d.due).toBe(true)
    expect(d.reason).toContain('focus branch moved')
  })

  it('a fresh board with the same head is not due', () => {
    expect(staleBoardDue({ state: published(2 * MIN), focusHead: 'h1', now: NOW }).due).toBe(false)
    expect(staleBoardDue({ state: published(2 * MIN), focusHead: null, now: NOW }).due).toBe(false)
  })

  it('the age limit from both sides (25 min default)', () => {
    expect(BOARD_MAX_AGE_MS).toBe(25 * MIN)
    expect(staleBoardDue({ state: published(BOARD_MAX_AGE_MS), focusHead: 'h1', now: NOW }).due).toBe(false)
    expect(staleBoardDue({ state: published(BOARD_MAX_AGE_MS + 1), focusHead: 'h1', now: NOW }).due).toBe(true)
  })

  it('a board never published is due', () => {
    expect(staleBoardDue({ state: {}, now: NOW }).due).toBe(true)
  })

  it('the publish stamps the focus head, and clears it when there is none', () => {
    expect(pagesPublishPatch({ fileHash: 'f', fingerprint: 'sha256:a', focusHead: 'h9' }).pagesPublishedFocusHead).toBe('h9')
    const cleared = pagesPublishPatch({ fileHash: 'f', fingerprint: 'sha256:a' })
    expect(Object.prototype.hasOwnProperty.call(cleared, 'pagesPublishedFocusHead')).toBe(true)
    expect(cleared.pagesPublishedFocusHead).toBeUndefined()
  })
})

describe('the block on the page', () => {
  const doc = '<!doctype html><html><head><style>x</style></head><body><main>\n<h1>Board</h1>\n<div class="sub">Autonomer TASKS.md-Batch</div>\n<details class="sect"></details></main></body></html>'
  const block = (standing) =>
    renderLivenessBlock({
      liveness: livenessVerdict(standing ? { focus: focus(80 * MIN), now: NOW } : { lock: lock(MIN), now: NOW }),
      progress: 'Fortschritt: <kein> aktiver Punkt.',
      measuredAt: NOW,
      focusHead: 'abc',
    })

  it('sits right under the subtitle, escaped, and is replaced rather than stacked', () => {
    const once = applyLivenessBlock(doc, block(true))
    const twice = applyLivenessBlock(once, block(false))
    expect(once.indexOf('class="liveness"')).toBeGreaterThan(once.indexOf('class="sub"'))
    expect(once.indexOf('class="liveness"')).toBeLessThan(once.indexOf('class="sect"'))
    expect(once).toContain('data-liveness="standing"')
    expect(once).toContain('&lt;kein&gt;')
    expect(once).toContain('data-measured-at="' + NOW + '"')
    expect(twice.match(/class="liveness"/g)).toHaveLength(1)
    expect(twice.match(/id="board-liveness-style"/g)).toHaveLength(1)
    expect(twice.match(/id="board-liveness-age"/g)).toHaveLength(1)
    expect(twice).toContain('data-liveness="running"')
  })

  it('the page states its own age and turns stale past tick plus grace', async () => {
    const html = applyLivenessBlock(doc, block(false))
    for (const [ageMs, stale] of [[STANDSTILL_AFTER_MS - MIN, false], [STANDSTILL_AFTER_MS + MIN, true]]) {
      const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(win) { win.Date.now = () => NOW + ageMs } })
      await new Promise((done) => dom.window.addEventListener('load', done))
      const p = dom.window.document.querySelector('.liveness-age')
      expect(p.classList.contains('stale')).toBe(stale)
      expect(p.textContent).toContain(stale ? 'Diese Seite ist' : `vor ${Math.floor(ageMs / MIN)} min`)
      dom.window.close()
    }
  })

  it('adds no structure violation of its own', () => {
    expect(structureViolations(applyLivenessBlock(doc, block(true)))).toEqual(structureViolations(doc))
  })
})
