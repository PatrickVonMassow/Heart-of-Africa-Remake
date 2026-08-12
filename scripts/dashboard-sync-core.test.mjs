// Decision-logic sweep of the dashboard SYNC Stop-hook guard (point 308):
// the »Woran ich gerade arbeite« card is held against the REAL state — HEAD
// branch, worktree agent pool, TASKS.md ticks — one test per decision path,
// plus totality on malformed input (the wrapper's fail-open rests on the core
// never throwing). The motivating regression — the card silently describing
// the finished point-306 work while the state had moved on — is pinned.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  DRIFTS,
  branchPoint,
  formatDriftReport,
  parseWorktreeBranches,
  parseTasksPoints,
  parseCardTitle,
  nowCardTitles,
  cardTitle,
  labelTokens,
  branchMatchesLabel,
  claimsAgents,
  matches,
  evaluate,
} from './dashboard-sync-core.mjs'

/** Minimal board in the real markup: now-cards (with the real meta span whose
 *  time must NOT read as a point), a numbered VDZK card and a queue card that
 *  the bounded now-section parse must ignore. */
function boardHtml(nowTitles = ['306 — Closing-Completeness-Guard']) {
  const now = nowTitles
    .map(
      (t) => `<details class="now" open>
  <summary><span class="t">${t}</span><span class="right"><span class="meta">22:29 · ~1 h</span></span></summary>
  <div class="body"><p>Status.</p></div>
</details>`,
    )
    .join('\n')
  return `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
${now}
<h2>Von dir zu klären</h2>
<details><summary><span class="t">206 — Frage</span></summary></details>
<h2>Warteschlange</h2>
<details><summary><span class="num">305</span><span class="t">305 — Queue card</span></summary></details>
</main>`
}

const state = (over = {}) => ({
  headBranch: 'main',
  agentBranches: [],
  open: [305, 306, 308],
  done: [289, 290],
  tasksReadable: true,
  ...over,
})

describe('parseCardTitle / cardTitle', () => {
  it('extracts the leading point of »306 — Closing-Completeness-Guard«', () => {
    const c = parseCardTitle('306 — Closing-Completeness-Guard')
    expect(c.point).toBe(306)
    expect(c.points).toEqual([306])
    expect(c.label).toBe('Closing-Completeness-Guard')
  })

  it('extracts »224 — workflow« → 224', () => {
    expect(parseCardTitle('224 — workflow').point).toBe(224)
  })

  it('parses a label-only title (»Closing-Aufräum + Fable«) to point null with the full label', () => {
    const c = parseCardTitle('Closing-Aufräum (Dead-Code/Stale-Doc) + Fable-Verifikationen')
    expect(c.point).toBeNull()
    expect(c.points).toEqual([])
    expect(c.label).toContain('Closing-Aufräum')
  })

  it('collects every standalone point of a combined title but skips version- and time-fragments', () => {
    const c = parseCardTitle('306 + 308 parallel (v0.2, seit 22:29)')
    expect(c.points).toEqual([306, 308])
  })

  it('reads the »NNN: …« card form the board actually uses', () => {
    const c = parseCardTitle('337: Ladebild friert beim Start ein')
    expect(c.point).toBe(337)
    expect(c.points).toEqual([337])
    expect(c.label).toBe('Ladebild friert beim Start ein')
  })

  // Regression witness: a number inside the PROSE is not a point reference. The
  // old "every standalone number" rule read the 15 of »~15 Sekunden« as point
  // 15, found it ticked done, and blocked the turn calling a current card stale.
  it('ignores numbers inside the prose, so a current card is not called stale', () => {
    expect(parseCardTitle('337: Ladebild steht ~15 Sekunden still').points).toEqual([337])
    expect(parseCardTitle('312: Flucht ins Wasser zündet in 3 von 10 Fällen').points).toEqual([312])
  })

  it('accepts the other list forms of a combined card', () => {
    expect(parseCardTitle('316/319 — Mündung und Krokodil').points).toEqual([316, 319])
    expect(parseCardTitle('121, 130 und 146: Familien-Dramen').points).toEqual([121, 130, 146])
  })

  it('does not take a clock time or a version at the start for a point', () => {
    expect(parseCardTitle('22:29 Uhr weitergemacht').points).toEqual([])
    expect(parseCardTitle('0.2 nachgezogen').points).toEqual([])
  })

  it('cardTitle reads the FIRST now-card of the real markup, never the meta time or other sections', () => {
    const c = cardTitle(boardHtml(['306 — Closing-Completeness-Guard', '308 — Sync-Guard']))
    expect(c.point).toBe(306)
    expect(c.points).toEqual([306]) // not 22/29 from the meta span, not 206/305
  })

  it('nowCardTitles returns all now-cards in order and stays bounded to the section', () => {
    const all = nowCardTitles(boardHtml(['306 — A', 'Closing-Aufräum']))
    expect(all.map((c) => c.point)).toEqual([306, null])
  })

  // Point 655: the number moved into the numbered chip, so the point and the
  // label now live in two spans and are re-joined before parsing.
  it('reads the point from a now-card CHIP and keeps the label free of it', () => {
    const chipBoard = boardHtml(['A']).replace('<span class="t">A</span>', '<span class="num">655</span><span class="t">Jede Karte nennt ihren Punkt</span>')
    const [card] = nowCardTitles(chipBoard)
    expect(card.point).toBe(655)
    expect(card.label).toBe('Jede Karte nennt ihren Punkt')
  })

  it('is total on malformed input: missing .now section and non-string → null/[]', () => {
    expect(cardTitle('<main><h2>Warteschlange</h2></main>')).toBeNull()
    expect(cardTitle(null)).toBeNull()
    expect(nowCardTitles(undefined)).toEqual([])
    expect(parseCardTitle(42)).toBeNull()
  })
})

describe('reality parsing', () => {
  it('branchPoint reads feat/chore point slugs and nothing else', () => {
    expect(branchPoint('feat/306-cleanup')).toBe(306)
    expect(branchPoint('fix/12-water')).toBe(12)
    expect(branchPoint('main')).toBeNull()
    expect(branchPoint('chore/closing-cleanup')).toBeNull()
    expect(branchPoint('worktree-agent-a72f2b')).toBeNull()
    expect(branchPoint(null)).toBeNull()
  })

  it('parseWorktreeBranches reads the porcelain branch lines in order, skipping detached worktrees', () => {
    const porcelain = `worktree C:/hoa
HEAD 3404a4d
branch refs/heads/main

worktree C:/hoa/.claude/worktrees/agent-a1
HEAD dcacc72
branch refs/heads/feat/289-fire-shadows

worktree C:/hoa/.claude/worktrees/agent-a2
HEAD ae23e91
detached
`
    expect(parseWorktreeBranches(porcelain)).toEqual(['main', 'feat/289-fire-shadows'])
    expect(parseWorktreeBranches(12)).toEqual([])
  })

  it('parseTasksPoints reads open/done ticks and tolerates garbage', () => {
    const md = '- [ ] 306. GUARD\n- [x] 290. DONE\n- [ ] 999. DEFERRED to later\nnoise'
    expect(parseTasksPoints(md)).toEqual({ open: [306], done: [290] })
    expect(parseTasksPoints(null)).toEqual({ open: [], done: [] })
  })

  it('labelTokens folds umlauts and drops short fragments; branchMatchesLabel is a slug containment', () => {
    expect(labelTokens('Closing-Aufräum + QA')).toEqual(['closing', 'aufraum'])
    expect(branchMatchesLabel('chore/closing-cleanup', 'Closing-Aufräum')).toBe(true)
    expect(branchMatchesLabel('feat/224-workflow', 'Closing-Aufräum')).toBe(false)
    expect(branchMatchesLabel(null, 'Closing')).toBe(false)
  })

  it('claimsAgents detects delegated-work claims in the title', () => {
    expect(claimsAgents('Fable Point 308 delegiert')).toBe(true)
    expect(claimsAgents('Agent läuft auf 306')).toBe(true)
    expect(claimsAgents('Closing-Aufräum')).toBe(false)
  })
})

describe('matches', () => {
  it('card »306« + HEAD feat/306-cleanup → match', () => {
    expect(matches('306 — Guard', state({ headBranch: 'feat/306-cleanup' }))).toBe(true)
  })

  it('card »306« + HEAD main, no agents → no match (main confirms nothing)', () => {
    expect(matches('306 — Guard', state())).toBe(false)
  })

  it('card »306« + an agent worktree on feat/306-… → match', () => {
    expect(matches('306 — Guard', state({ agentBranches: ['feat/306-closing-guard'] }))).toBe(true)
  })

  it('label card ↔ branch slug token overlap (»Closing-Aufräum« vs chore/closing-cleanup) → match', () => {
    expect(
      matches('Closing-Aufräum (Dead-Code)', state({ agentBranches: ['chore/closing-cleanup'] })),
    ).toBe(true)
  })

  it('agent-claim card + non-empty pool → match; + empty pool → no match', () => {
    const card = 'Fable-Verifikationen laufen'
    expect(matches(card, state({ agentBranches: ['worktree-agent-a1'] }))).toBe(true)
    expect(matches(card, state())).toBe(false)
  })

  it('is total: null card / null state → false, never throws', () => {
    expect(matches(null, state())).toBe(false)
    expect(matches('306 — Guard', null)).toBe(false)
  })
})

describe('evaluate — blocks on real drift', () => {
  const cards = (titles) => nowCardTitles(boardHtml(titles))

  it('blocks the point-306 slip: card only names a DONE point, nothing still works it', () => {
    const r = evaluate({ cards: cards(['306 — Closing-Guard']), state: state({ done: [290, 306], open: [305, 308] }) })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('306')
    expect(r.reason).toMatch(/stale/i)
  })

  it('does NOT block a done-point card while a merged-but-uncleaned worktree still carries the branch', () => {
    const r = evaluate({
      cards: cards(['306 — Closing-Guard']),
      state: state({ done: [290, 306], open: [305, 308], agentBranches: ['feat/306-closing-guard'] }),
    })
    expect(r.block).toBe(false)
  })

  it('blocks HEAD drift: HEAD moved to feat/224-… but no card names 224', () => {
    const r = evaluate({ cards: cards(['306 — Closing-Guard']), state: state({ headBranch: 'feat/224-workflow', open: [224, 306] }) })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('feat/224-workflow')
    expect(r.reason).toContain('306')
  })

  it('allows when a second now-card covers the HEAD point (parallel work)', () => {
    const r = evaluate({
      cards: cards(['306 — Closing-Guard', '224 — Workflow']),
      state: state({ headBranch: 'feat/224-workflow', open: [224, 306] }),
    })
    expect(r.block).toBe(false)
  })

  it('allows a label card whose tokens match the HEAD work branch', () => {
    const r = evaluate({
      cards: cards(['Dashboard-Sync-Guard bauen']),
      state: state({ headBranch: 'feat/308-dashboard-sync-guard' }),
    })
    expect(r.block).toBe(false)
  })

  it('blocks an unknown point: card »999« exists nowhere in TASKS.md or on a branch', () => {
    const r = evaluate({ cards: cards(['999 — Phantom']), state: state() })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('999')
  })

  it('blocks a missing now-card while open points exist', () => {
    const r = evaluate({ cards: [], state: state() })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/no »Woran ich gerade arbeite« card/)
  })

  it('blocks an agent-claim card when the pool is empty and HEAD sits on main', () => {
    const r = evaluate({ cards: cards(['Fable-Verifikationen + Agent-Pool']), state: state() })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/agent/i)
  })

  it('never tells the assistant to fix anything but the CARD (read-only guard)', () => {
    const r = evaluate({ cards: cards(['999 — Phantom']), state: state() })
    expect(r.reason).toContain('Fix the CARD')
  })
})

// Point 308's last deliverable: the REPORT of what this guard catches. It is a
// table the verdicts are stamped from rather than prose in a document, so these
// cases pin the one thing that can rot — the tie between the two.
describe('the drift catalogue is the code, not a description of it', () => {
  const cards = (titles) => nowCardTitles(boardHtml(titles))

  /** One scenario per catalogued drift, so the table cannot list a check the
   *  guard does not have. */
  const scenarios = {
    'no-card': { cards: [], state: state() },
    'head-drift': { cards: cards(['306 — Closing-Guard']), state: state({ headBranch: 'feat/224-workflow', open: [224, 306] }) },
    'unknown-point': { cards: cards(['999 — Phantom']), state: state() },
    'stale-done': { cards: cards(['306 — Closing-Guard']), state: state({ done: [290, 306], open: [305, 308] }) },
    'agent-claim': { cards: cards(['Fable-Verifikationen + Agent-Pool']), state: state() },
  }

  it('every catalogued drift is actually producible, and stamps its own id', () => {
    for (const d of DRIFTS) {
      const scenario = scenarios[d.id]
      expect(scenario, `no scenario for catalogued drift ${d.id}`).toBeDefined()
      const r = evaluate(scenario)
      expect(r.block, d.id).toBe(true)
      expect(r.drift, d.id).toBe(d.id)
    }
  })

  it('no block path produces a drift the catalogue does not list', () => {
    const known = new Set(DRIFTS.map((d) => d.id))
    for (const scenario of Object.values(scenarios)) {
      const r = evaluate(scenario)
      expect(known.has(r.drift), `uncatalogued drift ${r.drift}`).toBe(true)
    }
    // An allow carries no drift at all.
    expect(evaluate({ cards: cards(['306 — Closing-Guard']), state: state() }).drift).toBeNull()
  })

  // The producibility direction needs a scenario per id, i.e. a human. This one
  // does not: it reads the SOURCE, so a block path added tomorrow with a new id —
  // or with none — fails here without anybody remembering to add a case
  // (four-eyes review 30.07.2026, finding 1).
  it('every block() call site in the core stamps a CATALOGUED id', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts', 'dashboard-sync-core.mjs'), 'utf8')
    // The call sites inside `evaluate` only — the helper's own definition aside.
    const sites = [...source.matchAll(/\n(\s+)return block\(([\s\S]*?)\n\1\)/g)]
    expect(sites.length).toBeGreaterThanOrEqual(DRIFTS.length)
    const known = new Set(DRIFTS.map((d) => d.id))
    for (const site of sites) {
      const stamped = [...site[2].matchAll(/'([a-z-]+)',\s*$/gm)].pop()
      expect(stamped, `a block() call stamps no drift id:\n${site[0]}`).toBeTruthy()
      expect(known.has(stamped[1]), `uncatalogued drift id ${stamped?.[1]}`).toBe(true)
    }
  })

  it('each catalogued entry says what it detects AND gives a concrete example', () => {
    for (const d of DRIFTS) {
      expect(d.detects.length, d.id).toBeGreaterThan(20)
      expect(d.example.length, d.id).toBeGreaterThan(10)
    }
    // The ids are unique — a duplicate would make the report lie about coverage.
    expect(new Set(DRIFTS.map((d) => d.id)).size).toBe(DRIFTS.length)
  })

  it('renders every entry into the report, and is total', () => {
    const report = formatDriftReport()
    for (const d of DRIFTS) {
      expect(report).toContain(`[${d.id}]`)
      expect(report).toContain(d.example)
    }
    // It says the one thing a reader must not get wrong about this guard.
    expect(report).toMatch(/never edits the card/i)
    expect(() => formatDriftReport(null)).not.toThrow()
    expect(() => formatDriftReport([{}])).not.toThrow()
  })
})

describe('evaluate — allows legitimate states and fails open', () => {
  const cards = (titles) => nowCardTitles(boardHtml(titles))

  it('green: card names an OPEN point, HEAD on main, agents elsewhere', () => {
    const r = evaluate({ cards: cards(['306 — Closing-Guard']), state: state({ agentBranches: ['feat/305-low-preset'] }) })
    expect(r.block).toBe(false)
  })

  it('green: the live combined label card (agent claim) with a non-empty pool', () => {
    const r = evaluate({
      cards: cards(['Closing-Aufräum (Dead-Code/Stale-Doc) + Fable-Verifikationen']),
      state: state({ agentBranches: ['worktree-agent-a72f2b'] }),
    })
    expect(r.block).toBe(false)
  })

  it('fail-open: unreadable dashboard (cards null) → allow', () => {
    expect(evaluate({ cards: null, state: state() }).block).toBe(false)
  })

  it('fail-open: unreadable state → allow', () => {
    expect(evaluate({ cards: cards(['306 — X']), state: null }).block).toBe(false)
  })

  it('fail-open: unreadable/empty TASKS.md never flags points unknown or stale', () => {
    const r = evaluate({
      cards: cards(['306 — Closing-Guard']),
      state: state({ open: [], done: [], tasksReadable: false }),
    })
    expect(r.block).toBe(false)
  })

  it('paused batch → allow regardless of drift', () => {
    const r = evaluate({ cards: [], state: state(), paused: true })
    expect(r.block).toBe(false)
  })

  it('is total: no input at all / malformed cards → allow, never throws', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate(null).block).toBe(false)
    expect(evaluate({ cards: [{}, { points: 'x' }], state: state() }).block).toBe(false)
  })
})
