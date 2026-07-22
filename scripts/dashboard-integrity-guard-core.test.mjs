// Decision-logic sweep of the dashboard-INTEGRITY Stop-hook guard
// (dashboard-integrity-guard-core): now-card-vs-actual-work (check A) with its
// conservative allow paths, stale/unknown queue cards (check B), the
// spec-drift snapshot heuristic (check C), and totality on malformed input
// (the wrapper's fail-open depends on the core never throwing).
import { describe, it, expect } from 'vitest'
import { parseQueueCards } from './queue-order-guard-core.mjs'
import {
  RECENT_COMMIT_COUNT,
  FOREIGN_EVIDENCE_MIN,
  parsePointSpecs,
  filesInSpec,
  pointsFromText,
  nowCardMatchesWork,
  staleQueueCards,
  hashText,
  specSnapshots,
  driftedCards,
  evaluate,
} from './dashboard-integrity-guard-core.mjs'

/** Minimal dashboard in the real board's markup (mirrors the queue-order tests).
 *  `nowTitles` renders SEVERAL now-cards (parallel feature-branch work) and
 *  overrides the single `nowTitle`. */
function boardHtml({
  nowTitle = '210 — Meereskante',
  nowTitles = null,
  nowBody = 'Status: in Arbeit.',
  queue = [],
  done = [209],
} = {}) {
  const q = queue
    .map(
      ({ n, t = `Task ${n}`, body = 'Offener Punkt.' }) =>
        `<details>\n  <summary><span class="num">${n}</span><span class="t">${t}</span></summary>\n  <div class="body"><p>${body}</p></div>\n</details>`,
    )
    .join('\n')
  const d = done
    .map((n) => `<details><summary><span class="num">${n}</span><span class="t">Done ${n}</span></summary></details>`)
    .join('\n')
  const now = (nowTitles ?? [nowTitle])
    .map(
      (t) => `<details class="now" open><summary><span class="t">${t}</span></summary>
<div class="body"><p>${nowBody}</p></div></details>`,
    )
    .join('\n')
  return `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
${now}
<h2>Von dir zu klären</h2>
<h2>Warteschlange</h2>
${q}
<h2>Erledigt</h2>
${d}
</main>`
}

/** TASKS.md with per-point spec bodies: [{n, open, spec}]. */
const tasksMd = (points) =>
  points
    .map(({ n, open = true, spec = `Point ${n} spec.` }) => `- [${open ? ' ' : 'x'}] ${n}. ${spec}`)
    .join('\n\n')

const SPECS = tasksMd([
  { n: 210, spec: 'Sea wall east of Cairo — fix in\n  `src/render/demElevation.ts` and src/world/terrain.ts.' },
  { n: 215, spec: 'Angular skyline relief — smooth\n  src/scenes/place/backdrop.ts sampling.' },
  { n: 223, spec: 'Weather x terrain audit across src/systems/season.ts.' },
  { n: 209, open: false, spec: 'Closed point.' },
])

describe('constants', () => {
  it('pin the calibratable thresholds', () => {
    expect(RECENT_COMMIT_COUNT).toBeGreaterThan(0)
    expect(FOREIGN_EVIDENCE_MIN).toBe(2)
  })
})

describe('parsePointSpecs', () => {
  it('collects open/done points with their full indented spec blocks', () => {
    const specs = parsePointSpecs(SPECS)
    expect(specs.get(210).open).toBe(true)
    expect(specs.get(210).spec).toContain('src/world/terrain.ts')
    expect(specs.get(210).spec).toContain('demElevation')
    expect(specs.get(209).open).toBe(false)
    expect(specs.size).toBe(4)
  })
  it('ends a block at the next top-level content, keeps it across blank lines', () => {
    const specs = parsePointSpecs(
      '- [ ] 210. First line.\n  indented A.\n\n  indented B.\nTop-level prose.\n  stray indent.\n- [ ] 211. Next.',
    )
    expect(specs.get(210).spec).toBe('First line.\nindented A.\nindented B.')
    expect(specs.get(211).spec).toBe('Next.')
  })
  it('marks DEFERRED, is total on non-string input', () => {
    expect(parsePointSpecs('- [ ] 205. Audit DEFERRED until the tag.').get(205).deferred).toBe(true)
    expect(parsePointSpecs(null).size).toBe(0)
  })
})

describe('filesInSpec / pointsFromText', () => {
  it('extracts src/scripts paths, stripping markdown backticks context and trailing punctuation', () => {
    const files = filesInSpec('fix `src/render/demElevation.ts`, then src/world/terrain.ts. Also docs/climate-1890.md.')
    expect(files.has('src/render/demElevation.ts')).toBe(true)
    expect(files.has('src/world/terrain.ts')).toBe(true)
    expect([...files].some((f) => f.startsWith('docs/'))).toBe(false)
  })
  it('ignores extensionless directory mentions', () => {
    expect(filesInSpec('the src/render area').size).toBe(0)
  })
  it('finds 100-299 point numbers filtered to known points; total on bad input', () => {
    expect([...pointsFromText('docs: 204(c) resolved; 1890 stays; 999 no', new Set([204, 210]))]).toEqual([204])
    expect(pointsFromText(null, new Set([204])).size).toBe(0)
  })
})

describe('nowCardMatchesWork (check A)', () => {
  const specs = parsePointSpecs(SPECS)
  const foreignEdits = ['src/render/demElevation.ts', 'src/world/terrain.ts'] // both in 210's spec only

  it('blocks when card+focus say 215 but every edit is 210 work (the real failure)', () => {
    const r = nowCardMatchesWork({ nowPoint: 215, focusPoint: 215, touchedFiles: foreignEdits, specs })
    expect(r.ok).toBe(false)
    expect(r.foreignPoints).toEqual([210])
    expect(r.evidence.join(' ')).toContain('src/world/terrain.ts')
  })
  it('blocks on a single foreign commit-subject point number', () => {
    const r = nowCardMatchesWork({ nowPoint: 215, focusPoint: 215, commitSubjects: ['wip on 210 shelf'], specs })
    expect(r.ok).toBe(false)
    expect(r.foreignPoints).toEqual([210])
  })
  it('allows when either the now-card or the focus matches the evidence', () => {
    expect(nowCardMatchesWork({ nowPoint: 210, focusPoint: 215, touchedFiles: foreignEdits, specs }).ok).toBe(true)
    expect(nowCardMatchesWork({ nowPoint: 215, focusPoint: 210, touchedFiles: foreignEdits, specs }).ok).toBe(true)
  })
  it('allows a mixed turn: one supporting file neutralizes the foreign evidence', () => {
    const r = nowCardMatchesWork({
      nowPoint: 215,
      focusPoint: 215,
      touchedFiles: [...foreignEdits, 'src/scenes/place/backdrop.ts'],
      specs,
    })
    expect(r.ok).toBe(true)
  })
  it('allows below the foreign-file threshold (single ambiguous edit)', () => {
    expect(nowCardMatchesWork({ nowPoint: 215, touchedFiles: ['src/world/terrain.ts'], specs }).ok).toBe(true)
  })
  it('never counts a CLOSED point as foreign (pivot away from finished work)', () => {
    const done = parsePointSpecs(SPECS.replace('- [ ] 210.', '- [x] 210.'))
    const r = nowCardMatchesWork({
      nowPoint: 215,
      commitSubjects: ['finish 210'],
      touchedFiles: ['src/render/demElevation.ts', 'src/world/terrain.ts'],
      specs: done,
    })
    expect(r.ok).toBe(true)
  })
  it('ignores files no spec names and non-evidence paths', () => {
    const r = nowCardMatchesWork({
      nowPoint: 215,
      touchedFiles: ['src/unrelated/a.ts', 'TASKS.md', '.batch-dashboard.html', 'docs/x.md'],
      specs,
    })
    expect(r.ok).toBe(true)
  })
  it('normalizes backslash paths (Windows git output)', () => {
    const r = nowCardMatchesWork({
      nowPoint: 215,
      touchedFiles: ['src\\render\\demElevation.ts', 'src\\world\\terrain.ts'],
      specs,
    })
    expect(r.ok).toBe(false)
  })
  it('allows non-point work and is total on malformed input', () => {
    expect(nowCardMatchesWork({ nowPoint: null, focusPoint: null, touchedFiles: foreignEdits, specs }).ok).toBe(true)
    expect(nowCardMatchesWork(null).ok).toBe(true)
    expect(nowCardMatchesWork({ nowPoint: 215, touchedFiles: 'garbage', specs: 'garbage' }).ok).toBe(true)
  })
  it('accepts evidence for ANY of several parallel now-card points (nowPoints Set)', () => {
    // Two cards in the now-section (215 and 210); every edit is 210 work —
    // supported, because 210 IS one of the parallel now-cards.
    const r = nowCardMatchesWork({ nowPoints: new Set([215, 210]), touchedFiles: foreignEdits, specs })
    expect(r.ok).toBe(true)
  })
  it('still blocks when the evidence supports NONE of the parallel now-cards', () => {
    const r = nowCardMatchesWork({ nowPoints: new Set([215, 223]), touchedFiles: foreignEdits, specs })
    expect(r.ok).toBe(false)
    expect(r.foreignPoints).toEqual([210])
  })
  it('is total on a malformed nowPoints value', () => {
    expect(nowCardMatchesWork({ nowPoints: 'garbage', focusPoint: 210, touchedFiles: foreignEdits, specs }).ok).toBe(
      true,
    )
  })
})

describe('staleQueueCards (check B)', () => {
  const specs = parsePointSpecs(SPECS)
  it('flags closed and nonexistent points, keeps open and DEFERRED cards', () => {
    const withDeferred = parsePointSpecs(SPECS + '\n\n- [ ] 205. Audit DEFERRED until the tag.')
    expect(staleQueueCards([210, 209, 999, 205], withDeferred)).toEqual({ closed: [209], unknown: [999] })
  })
  it('is total on malformed input', () => {
    expect(staleQueueCards(null, specs)).toEqual({ closed: [], unknown: [] })
    expect(staleQueueCards([210, 'x'], 'garbage')).toEqual({ closed: [], unknown: [] })
  })
})

describe('spec-drift snapshots (check C)', () => {
  const html = boardHtml({ queue: [{ n: 210, body: 'Wand-Karte.' }, { n: 223, body: 'Namib-Regen prüfen.' }] })

  it('hashText is whitespace-insensitive and total', () => {
    expect(hashText('a  b\n c')).toBe(hashText('a b c'))
    expect(hashText('a b')).not.toBe(hashText('a c'))
    expect(hashText(null)).toBeNull()
  })
  it('specSnapshots records a spec+card hash per queue card with a TASKS point', () => {
    const snaps = specSnapshots(SPECS, html)
    expect(Object.keys(snaps).sort()).toEqual(['210', '223'])
    expect(snaps[210].spec).toHaveLength(16)
    expect(snaps[210].card).toHaveLength(16)
  })
  it('flags a spec change with an unchanged card (the point-223 failure)', () => {
    const snaps = specSnapshots(SPECS, html)
    // Point 223's spec was broadened after the snapshot; the card text stayed.
    const specsNow = parsePointSpecs(SPECS.replace('Weather x terrain audit', 'EXTENDED: full plausibility audit'))
    expect(driftedCards({ cards: parseQueueCards(html), specs: specsNow, snapshots: snaps })).toEqual([223])
  })
  it('does not flag when the card was edited too (reconciled), or without a snapshot', () => {
    const snaps = specSnapshots(SPECS, html)
    const specsNow = parsePointSpecs(SPECS.replace('Weather x terrain audit', 'EXTENDED audit'))
    const editedHtml = boardHtml({
      queue: [{ n: 210, body: 'Wand-Karte.' }, { n: 223, body: 'Jetzt: genereller Wetter-x-Terrain-Audit.' }],
    })
    expect(driftedCards({ cards: parseQueueCards(editedHtml), specs: specsNow, snapshots: snaps })).toEqual([])
    expect(driftedCards({ cards: parseQueueCards(html), specs: specsNow, snapshots: {} })).toEqual([])
  })
  it('is total on malformed input', () => {
    expect(driftedCards(null)).toEqual([])
    expect(driftedCards({ cards: 'x', specs: null, snapshots: null })).toEqual([])
  })
})

describe('evaluate — end to end', () => {
  it('blocks the now-card-vs-work mismatch, naming the evidenced point', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ nowTitle: '215 — Skyline', queue: [{ n: 210 }, { n: 215 }, { n: 223 }] }),
      tasksMd: SPECS,
      focusPoint: 215,
      touchedFiles: ['src/render/demElevation.ts', 'src/world/terrain.ts'],
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CONTRADICTS THE ACTUAL WORK.*210/)
  })
  it('blocks a queue card for a closed point and for a nonexistent point', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 209 }, { n: 999 }, { n: 215 }, { n: 223 }] }),
      tasksMd: SPECS,
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/STALE QUEUE CARD.*209/)
    expect(r.reason).toMatch(/UNKNOWN QUEUE CARD.*999/)
  })
  it('blocks a drifted card via the recorded snapshots', () => {
    const html = boardHtml({ queue: [{ n: 210 }, { n: 215 }, { n: 223, body: 'Nur Namib-Regen.' }] })
    const snaps = specSnapshots(SPECS, html)
    const r = evaluate({
      dashboardHtml: html,
      tasksMd: SPECS.replace('Weather x terrain audit', 'EXTENDED: general weather-terrain audit'),
      snapshots: snaps,
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/POSSIBLY STALE AFTER A SPEC CHANGE.*223/)
  })
  it('allows a second parallel now-card to supply the work evidence (multi-now board)', () => {
    // Parallel feature-branch work: 215 AND 210 each hold a now-card; all
    // edits are 210 work. The single-card reading (first card 215 only) used
    // to block this legitimate state.
    const r = evaluate({
      dashboardHtml: boardHtml({ nowTitles: ['215 — Skyline', '210 — Meereskante'], queue: [{ n: 223 }] }),
      tasksMd: SPECS,
      focusPoint: 215,
      touchedFiles: ['src/render/demElevation.ts', 'src/world/terrain.ts'],
    })
    expect(r.block).toBe(false)
  })
  it('still blocks a multi-now board when the evidence matches NO now-card', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ nowTitles: ['215 — Skyline', '223 — Audit'], queue: [{ n: 210 }] }),
      tasksMd: SPECS,
      focusPoint: 215,
      touchedFiles: ['src/render/demElevation.ts', 'src/world/terrain.ts'],
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CONTRADICTS THE ACTUAL WORK.*210/)
  })
  it('allows a clean, in-sync board', () => {
    const html = boardHtml({ queue: [{ n: 210 }, { n: 215 }, { n: 223 }] })
    const r = evaluate({
      dashboardHtml: html,
      tasksMd: SPECS,
      focusPoint: 210,
      commitSubjects: ['Smooth the coast shelf blending'],
      touchedFiles: ['src/render/demElevation.ts'],
      snapshots: specSnapshots(SPECS, html),
    })
    expect(r.block).toBe(false)
  })
  it('fails open on malformed/missing input and with no open points', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ dashboardHtml: null, tasksMd: null }).block).toBe(false)
    expect(evaluate({ dashboardHtml: 42, tasksMd: {} }).block).toBe(false)
    expect(evaluate({ dashboardHtml: '<p>no sections</p>', tasksMd: SPECS }).block).toBe(false)
    expect(evaluate({ dashboardHtml: boardHtml({}), tasksMd: '- [x] 209. Done.' }).block).toBe(false)
  })
})
