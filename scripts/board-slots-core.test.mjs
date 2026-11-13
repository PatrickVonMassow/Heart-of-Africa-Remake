// The board's slot line (user order 11.11.2026): beside "Woran ich gerade
// arbeite" the board always says why fewer than POOL_CAP points are worked in
// parallel. One case per line variant, plus the section contract the heading
// keeps while it carries the line.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { promoteToNow, projectNowForPublish } from './board-core.mjs'
import {
  UNMEASURABLE_FINDING_TITLE,
  UNMEASURABLE_TEXT,
  applySlotLine,
  idleLabel,
  readSlotLine,
  slotLine,
} from './board-slots-core.mjs'
import { closedPointNumbers, fileUnmeasurableFinding, freshActivePoints, measureOwner } from './board-slots.mjs'
import { structureViolations } from './board-structure-core.mjs'
import { auditDashboard, parseNowCardPoints, sliceSections } from './dashboard-guard-core.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'
import { carrierEntry } from './findings-core.mjs'

const DAY = 24 * 60 * 60 * 1000
const branch = (point, ageDays = 0, ref = `feat/${point}-x`) => ({ ref, point, ageMs: ageDays * DAY })
const spec = (point, files = [`scripts/p${point}.mjs`], gated = false) => ({ point, files, gated })

// The 11.11.2026 state: five branches, cap 3, only 327 worked on.
const ELEVENTH = {
  branches: [branch(1341, 3), branch(1482, 2), branch(1485, 1), branch(1463, 10), branch(327, 0)],
  activePoints: [327],
  openPoints: [327, 1463, 1490],
  closedPoints: [1341, 1482, 1485],
  specs: [spec(327), spec(1463), spec(1490, ['scripts/p327.mjs'])],
  runningFiles: ['scripts/p327.mjs'],
}

describe('slotLine — every variant of the heading line', () => {
  it('full use: "3/3 Slots in Arbeit"', () => {
    const r = slotLine({
      branches: [branch(1), branch(2), branch(3)],
      activePoints: [1, 2, 3],
      openPoints: [1, 2, 3],
    })
    expect(r).toEqual({ text: '3/3 Slots in Arbeit', unmeasurable: false })
  })

  it('over the cap: no x/y above the cap, idle branches with their measured state, active point not repeated', () => {
    const r = slotLine(ELEVENTH)
    expect(r.text).toBe(
      '0/3 Slots frei · blockiert durch: 1341, 1482, 1485 (erledigt, Branch nicht gelöscht) · 1463 (ruht seit 10 Tagen)',
    )
    expect(r.text).not.toMatch(/\b327\b/)
    expect(r.text).not.toMatch(/5 von 3|5\/3/)
    expect(r.unmeasurable).toBe(false)
  })

  it('a free slot with no independent point names the active work it collides with', () => {
    const r = slotLine({ ...ELEVENTH, branches: [branch(1463, 10), branch(327, 0)] })
    expect(r.text).toBe('1/3 Slots frei: kein offener Punkt unabhängig von 327 · blockiert durch: 1463 (ruht seit 10 Tagen)')
  })

  it('closing freeze: "Abschluss läuft, Code eingefroren"', () => {
    const r = slotLine({ ...ELEVENTH, branches: [branch(327)], closingFreeze: true })
    expect(r).toEqual({ text: '2/3 Slots frei: Abschluss läuft, Code eingefroren', unmeasurable: false })
  })

  it('paused batch', () => {
    expect(slotLine({ ...ELEVENTH, branches: [], paused: true }).text).toBe('3/3 Slots frei: Batch pausiert')
  })

  it('every open point waits on the user', () => {
    const r = slotLine({ branches: [], specs: [spec(5, ['scripts/a.mjs'], true)], openPoints: [5] })
    expect(r).toEqual({ text: '3/3 Slots frei: alle offenen Punkte warten auf deine Entscheidung', unmeasurable: false })
  })

  it('no open point at all', () => {
    expect(slotLine({ branches: [] }).text).toBe('3/3 Slots frei: kein weiterer offener Punkt')
  })

  it('no open point names its files', () => {
    const r = slotLine({ branches: [branch(7)], activePoints: [7], specs: [spec(8, [])], runningFiles: ['x/y.mjs'] })
    expect(r.text).toBe('2/3 Slots frei: kein offener Punkt nennt seine Dateien, Unabhängigkeit nicht prüfbar')
    expect(r.unmeasurable).toBe(false)
  })

  it('an independent point ready and nothing explaining the idle slot: "Grund nicht messbar", flagged', () => {
    const r = slotLine({
      branches: [branch(327)],
      activePoints: [327],
      openPoints: [327, 1490],
      specs: [spec(327), spec(1490, ['scripts/other.mjs'])],
      runningFiles: ['scripts/p327.mjs'],
    })
    expect(r).toEqual({ text: `2/3 Slots frei: ${UNMEASURABLE_TEXT} (unabhängig bereit: 1490)`, unmeasurable: true })
  })

  it('running work whose files could not be read is no measurement of independence', () => {
    const r = slotLine({ branches: [branch(327)], activePoints: [327], specs: [spec(1490)], runningFiles: [] })
    expect(r.text).toBe(`2/3 Slots frei: ${UNMEASURABLE_TEXT} (Dateien der laufenden Arbeit nicht lesbar)`)
    expect(r.unmeasurable).toBe(true)
  })

  it('an unreadable branch census says so instead of a slot count', () => {
    const r = slotLine({ branchesReadable: false })
    expect(r.text).toBe(`Slotbelegung nicht messbar: ${UNMEASURABLE_TEXT} (Branch-Liste nicht lesbar)`)
    expect(r.unmeasurable).toBe(true)
    expect(slotLine({ recordReadable: false }).text).toContain('Park-Liste nicht lesbar')
  })

  it('a point that already holds a slot is no candidate for a free one', () => {
    const r = slotLine({
      branches: [branch(327), branch(1463, 2)],
      activePoints: [327],
      openPoints: [327, 1463],
      specs: [spec(327), spec(1463, ['scripts/elsewhere.mjs'])],
      runningFiles: ['scripts/p327.mjs'],
    })
    expect(r.text).toBe('1/3 Slots frei: kein weiterer offener Punkt · blockiert durch: 1463 (ruht seit 2 Tagen)')
  })

  // Point 1518: the owner's measured state and fresh branches replace "Grund nicht messbar".
  const READY = {
    branches: [branch(327)],
    activePoints: [327],
    openPoints: [327, 1490],
    specs: [spec(327), spec(1490, ['scripts/other.mjs'])],
    runningFiles: ['scripts/p327.mjs'],
  }
  // 13.11.2026 11:49 and 15:49 Berlin (CET, UTC+1).
  const WAIT_AT = Date.UTC(2026, 10, 13, 10, 49)
  const WAIT_UNTIL = Date.UTC(2026, 10, 13, 14, 49)

  it('no live batch owner: "keine Batch-Session aktiv"', () => {
    const r = slotLine({ ...READY, owner: { alive: false } })
    expect(r).toEqual({ text: '2/3 Slots frei: keine Batch-Session aktiv', unmeasurable: false })
  })

  it('the owner holds a declared wait: "Batch-Session wartet seit HH:MM (bis HH:MM)"', () => {
    const r = slotLine({ ...READY, owner: { alive: true, waitAt: WAIT_AT, waitUntil: WAIT_UNTIL } })
    expect(r).toEqual({ text: '2/3 Slots frei: Batch-Session wartet seit 11:49 (bis 15:49)', unmeasurable: false })
  })

  it('a live owner without a wait names nothing, and an unmeasured owner changes nothing', () => {
    const flagged = { text: `2/3 Slots frei: ${UNMEASURABLE_TEXT} (unabhängig bereit: 1490)`, unmeasurable: true }
    expect(slotLine({ ...READY, owner: { alive: true } })).toEqual(flagged)
    expect(slotLine({ ...READY, owner: null })).toEqual(flagged)
  })

  it('an active branch without own commits: "<N> hat noch keine Commits, …"', () => {
    const r = slotLine({ branches: [branch(327)], activePoints: [327], specs: [spec(1490)], runningFiles: [], freshActive: [327] })
    expect(r).toEqual({ text: '2/3 Slots frei: 327 hat noch keine Commits, Unabhängigkeit erst danach prüfbar', unmeasurable: false })
  })

  it('a measured reason is not overwritten by the owner state', () => {
    const r = slotLine({ branches: [], owner: { alive: false } })
    expect(r.text).toBe('3/3 Slots frei: kein weiterer offener Punkt')
    expect(slotLine({ branchesReadable: false, owner: { alive: false } }).unmeasurable).toBe(true)
  })

  it('branches without a point or outside the work order keep a measured label', () => {
    const r = slotLine({
      branches: [branch(null, 1, 'feat/cleanup'), branch(999, 1)],
      activePoints: [],
      openPoints: [],
      closedPoints: [],
    })
    expect(r.text).toContain('feat/cleanup (kein Punkt zuordenbar)')
    expect(r.text).toContain('999 (Punkt nicht im Arbeitsauftrag)')
  })
})

describe('idleLabel', () => {
  it('says days, hours and the unknown age', () => {
    expect(idleLabel(DAY)).toBe('ruht seit 1 Tag')
    expect(idleLabel(10 * DAY + 5)).toBe('ruht seit 10 Tagen')
    expect(idleLabel(60 * 60 * 1000)).toBe('ruht seit 1 Stunde')
    expect(idleLabel(5 * 60 * 60 * 1000)).toBe('ruht seit 5 Stunden')
    expect(idleLabel(1000)).toBe('ruht seit weniger als 1 Stunde')
    expect(idleLabel(null)).toBe('ruht, Alter nicht messbar')
  })
})

describe('applySlotLine — the heading carries the line, the section contract holds', () => {
  const HEADING = '<summary><h2>Woran ich gerade arbeite</h2></summary>'

  it('writes the line on the heading row, replaces it on the next render and removes it on empty text', () => {
    const once = applySlotLine(boardHtml(), '1/3 Slots frei: x')
    expect(once).toContain('<summary><h2>Woran ich gerade arbeite</h2><span class="slots">1/3 Slots frei: x</span></summary>')
    const twice = applySlotLine(once, '3/3 Slots in Arbeit')
    expect(readSlotLine(twice)).toBe('3/3 Slots in Arbeit')
    expect(twice.match(/class="slots"/g)).toHaveLength(1)
    expect(applySlotLine(twice, '')).toContain(HEADING)
  })

  it('escapes markup and leaves a board without the heading unchanged', () => {
    expect(readSlotLine(applySlotLine(boardHtml(), 'a <b> & c'))).toBe('a <b> & c')
    expect(applySlotLine('<main>x</main>', 'y')).toBe('<main>x</main>')
  })

  it('keeps the guards green: structure, collapsible sections, now-card points', () => {
    const plain = boardHtml({ nowCards: [210] })
    const html = applySlotLine(plain, '0/3 Slots frei · blockiert durch: 1341 (erledigt, Branch nicht gelöscht)')
    const codes = (h) => auditDashboard(h, { open: [210, 211, 204], done: [209] }).map((v) => v.code)
    expect(codes(html)).toEqual(codes(plain))
    expect(codes(html)).not.toContain('section-not-collapsible')
    expect(structureViolations(html)).toEqual(structureViolations(plain))
    expect(sliceSections(html).order).toEqual(sliceSections(plain).order)
    // Point numbers in the line are no now-card points.
    expect(parseNowCardPoints(html)).toEqual(parseNowCardPoints(plain))
  })

  it('keeps the board writers working on a heading that carries the line', () => {
    const tokens = applySlotLine(boardHtml({ nowCards: [210] }), "blockiert durch: feat/$'x · $& · $1")
    expect(readSlotLine(tokens)).toBe("blockiert durch: feat/$'x · $& · $1")
    const html = applySlotLine(boardHtml({ nowCards: [210] }), '2/3 Slots frei: kein offener Punkt')
    const { html: projected } = projectNowForPublish(html, { ok: true, points: [210], focusPoint: 210 }, { stamp: '12:00' })
    expect(readSlotLine(projected)).toBe('2/3 Slots frei: kein offener Punkt')
    const promoted = promoteToNow(html, 211, { title: 'Task 211', status: 'läuft', stamp: '12:00' })
    expect(parseNowCardPoints(promoted)).toEqual(new Set([211, 210]))
    expect(readSlotLine(promoted)).toBe('2/3 Slots frei: kein offener Punkt')
  })
})

describe('the I/O half', () => {
  it('reads closed points from the whole work order', () => {
    expect(closedPointNumbers('- [x] 12. a\n- [ ] 13. b\n- [X] 14. c\n  - [x] 15. nested')).toEqual(new Set([12, 14]))
  })

  it('files the unmeasurable state once, not on every render', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slots-'))
    const carrier = join(dir, 'carrier.md')
    const calls = []
    const record = (title, detail) => calls.push({ title, detail })
    expect(fileUnmeasurableFinding('x', { carrier, record })).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].title).toBe(UNMEASURABLE_FINDING_TITLE)
    writeFileSync(carrier, `${carrierEntry({ at: '2026-11-12T00:00:00Z', session: 's', title: UNMEASURABLE_FINDING_TITLE, detail: 'd' })}\n`)
    expect(fileUnmeasurableFinding('x', { carrier, record })).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('measures the owner: no lock, dead owner, live owner, declared wait', () => {
    const now = 1000
    const alive = () => ({ alive: true })
    expect(measureOwner({ now, readLock: () => null })).toEqual({ alive: false })
    expect(measureOwner({ now, readLock: () => ({}), assess: () => ({ alive: false }) })).toEqual({ alive: false })
    expect(measureOwner({ now, readLock: () => ({}), assess: alive })).toEqual({ alive: true })
    const waiting = { declaredWait: { at: 500, until: 2000 } }
    expect(measureOwner({ now, readLock: () => waiting, assess: alive })).toEqual({ alive: true, waitAt: 500, waitUntil: 2000 })
    expect(measureOwner({ now: 3000, readLock: () => waiting, assess: alive })).toEqual({ alive: true })
    expect(measureOwner({ now, readLock: () => { throw new Error('torn') } })).toBeNull()
  })

  it('a branch is fresh only when every readable spelling has no own diff', () => {
    const verdicts = { 'feat/1-a': true, 'origin/feat/1-a': null, 'feat/2-b': true, 'origin/feat/2-b': false, 'feat/3-c': null, 'origin/feat/3-c': null }
    const isEmpty = (ref) => verdicts[ref]
    const branches = [{ ref: 'feat/1-a', point: 1 }, { ref: 'feat/2-b', point: 2 }, { ref: 'feat/3-c', point: 3 }]
    expect(freshActivePoints(branches, { isEmpty })).toEqual([1])
  })

  it('does not re-file a drained entry (every publish re-filed it and blocked the session end)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slots-'))
    const carrier = join(dir, 'carrier.md')
    const calls = []
    const record = (title, detail) => calls.push({ title, detail })
    writeFileSync(carrier, `- [x] 2026-11-12T14:45:15.581Z · s · ${UNMEASURABLE_FINDING_TITLE}\n      d\n`)
    expect(fileUnmeasurableFinding('x', { carrier, record })).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
