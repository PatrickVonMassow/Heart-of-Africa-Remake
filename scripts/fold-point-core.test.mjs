// The fold chain's decisions (point 614).
//
// A fold moves the WORK ORDER without anything having been built, so its failure
// modes are all quiet ones: a point folded into an archived survivor (the content
// is lost while the board claims it was kept), an Erledigt card that names no
// destination (the reader learns a point he never saw is finished), a board edit
// that empties "Woran ich gerade arbeite". The cases here are weighted towards
// those refusals rather than towards the happy chain.
//
// EVERY CASE RUNS ON FIXTURE STRINGS. The core is pure by construction, and the
// real TASKS.md, docs/tasks-archive.md and .batch-dashboard.html are never read
// or written by this file.
import { describe, it, expect } from 'vitest'
import { evaluateTasksArchive } from './tasks-archive-guard-core.mjs'
import { evaluateCommitTrailers } from './model-guard-core.mjs'
import { knownPoints, topicViolations } from './dashboard-card-topic-guard-core.mjs'
import { boardMissingPoints } from './board-currency-core.mjs'
import { doneCard, doneEntries, hasCurrentWork, nowCard, queueCard } from './board-core.mjs'
import { LandingError, VERDICT, transitionAccepted } from './land-point-core.mjs'
import {
  FOLD_STEPS,
  FOLD_STEP_IDS,
  foldBoardTransform,
  foldCardText,
  foldCommitMessage,
  foldReason,
  foldStepLabel,
  formatFoldVerdict,
  parseFoldArgs,
  planFold,
  resolveSurvivor,
  validateFold,
} from './fold-point-core.mjs'

// --- fixtures ---------------------------------------------------------------

const TASKS = [
  '# Work order',
  '',
  '## Offene Punkte',
  '',
  '- [ ] 613. Ein Punkt, der eingefaltet wird.',
  '      Zweite Zeile der Spezifikation.',
  '',
  '- [ ] 720. Der überlebende Punkt, der den Inhalt übernimmt.',
  '',
  '## Closing',
  '',
].join('\n')

const ARCHIVE = ['# Archive', '', '- [x] 12. Ein längst erledigter Punkt.', ''].join('\n')

/** A board with the four sections the project fixes, one queue card per open point. */
function board({ now = '', queue = ['613', '720'] } = {}) {
  const queueCards = queue
    .map(
      (p) =>
        `<details>\n  <summary><span class="num">${p}</span><span class="t">Betreff ${p}</span>` +
        `<span class="right"><span class="meta">~2 h · Feature</span></span></summary>\n` +
        `  <div class="body">\n    <p>Was hier zu tun ist.</p>\n  </div>\n</details>\n`,
    )
    .join('')
  return [
    '<html><body>',
    '<details class="sect">',
    '<summary><h2>Woran ich gerade arbeite</h2></summary>',
    now,
    '</details>',
    '<details class="sect">',
    '<summary><h2>Von dir zu klären</h2></summary>',
    '</details>',
    '<details class="sect">',
    '<summary><h2>Warteschlange</h2></summary>',
    queueCards,
    '</details>',
    '<details class="sect">',
    '<summary><h2>Erledigt</h2></summary>',
    '</details>',
    '</body></html>',
    '',
  ].join('\n')
}

const NOW_CARD = (p) =>
  `<details class="now">\n  <summary><span class="num">${p}</span><span class="t">Betreff ${p}</span>` +
  `<span class="right"><span class="meta">09:00 · ~11:00</span></span></summary>\n` +
  `  <div class="body">\n    <p>Läuft.</p>\n  </div>\n</details>\n`

// ---------------------------------------------------------------------------
describe('the chain itself', () => {
  it('validates before it writes and commits last', () => {
    // Every refusal a fold can produce is produced while a rollback is free, and
    // the commit carries the whole transition — so it cannot claim a fold whose
    // board edit failed.
    expect(FOLD_STEP_IDS).toEqual(['validate', 'tick', 'archive', 'board', 'commit'])
    expect(FOLD_STEP_IDS.indexOf('validate')).toBe(0)
    expect(FOLD_STEP_IDS.indexOf('commit')).toBe(FOLD_STEP_IDS.length - 1)
  })

  it('edits the board AFTER the tick, because the publish precondition demands it', () => {
    // THE ORDERING IS NOT COSMETIC. `runBoardEdit` refuses to publish a board
    // that does not show every OPEN point, so moving the card to Erledigt while
    // the point is still open in TASKS.md fires the precondition on the point
    // being folded. Proven against the very function that refuses.
    expect(FOLD_STEP_IDS.indexOf('board')).toBeGreaterThan(FOLD_STEP_IDS.indexOf('tick'))
    const { moved, cardText } = validateFold({
      tasksText: TASKS,
      archiveText: ARCHIVE,
      boardHtml: board({ now: NOW_CARD('720') }),
      number: 613,
      into: 720,
    })
    const folded = foldBoardTransform({ point: 613, cardText, stamp: '14:00' })(board({ now: NOW_CARD('720') }))
    // Against the PRE-tick work order the edited board is missing an open point…
    expect(boardMissingPoints(folded, [613, 720])).toEqual([613])
    // …and against the POST-tick one it is exactly right.
    const stillOpen = [...moved.tasks.matchAll(/^- \[ \] (\d+)\./gm)].map((m) => Number(m[1]))
    expect(stillOpen).toEqual([720])
    expect(boardMissingPoints(folded, stillOpen)).toEqual([])
  })

  it('gives every step a label', () => {
    for (const id of FOLD_STEP_IDS) expect(foldStepLabel(id)).not.toBe(id)
    expect(foldStepLabel('nonesuch')).toBe('nonesuch')
    expect(FOLD_STEPS.length).toBe(FOLD_STEP_IDS.length)
  })
})

// ---------------------------------------------------------------------------
describe('the argv', () => {
  it('reads the point, the destination, the model and the flags', () => {
    const a = parseFoldArgs(['613', '--into', '720', '--model', 'Claude Opus 5', '--dry'])
    expect(a).toMatchObject({ number: 613, into: 720, model: 'Claude Opus 5', dry: true, noCommit: false })
  })

  it('reads the delivered evidence and --no-commit', () => {
    const a = parseFoldArgs(['613', '--delivered', 'der Fix sitzt seit c0ffee in main', '--no-commit'])
    expect(a.delivered).toBe('der Fix sitzt seit c0ffee in main')
    expect(a.noCommit).toBe(true)
    expect(a.into).toBe(null)
  })

  it('reads --next <m> "<status>" and --none "<reason>" for the empty-section way out', () => {
    const next = parseFoldArgs(['613', '--into', '720', '--next', '721', 'Aufgenommen.'])
    expect(next).toMatchObject({ next: 721, nextStatus: 'Aufgenommen.' })
    const none = parseFoldArgs(['613', '--into', '720', '--none', 'Sitzungsgrenze, der Nachfolger nimmt Punkt 720.'])
    expect(none).toMatchObject({ hasNone: true, none: 'Sitzungsgrenze, der Nachfolger nimmt Punkt 720.' })
  })

  it('keeps a bare --none as a CHOICE, so the refusal it meets names the missing reason', () => {
    // The distinction matters: a bare `--none` must reach "needs a reason", never
    // the refusal for a forgotten successor — the caller DID choose this way out.
    const a = parseFoldArgs(['613', '--into', '720', '--none'])
    expect(a.hasNone).toBe(true)
    expect(a.none).toBe('')
  })

  it('refuses an unknown flag rather than ignoring it', () => {
    // A mistyped --delivered would otherwise fold the point with no evidence at all.
    expect(() => parseFoldArgs(['613', '--deliverd', 'x'])).toThrow(/unknown argument/)
    expect(() => parseFoldArgs(['613', '--into'])).toThrow(/--into needs a value/)
    expect(() => parseFoldArgs(['613', '--into', 'sieben'])).toThrow(/SURVIVING point's number/)
    expect(() => parseFoldArgs(['613', '--next', '--none', 'x'])).toThrow(/POINT NUMBER/)
    expect(() => parseFoldArgs(['613', '614', '--into', '720'])).toThrow(/a fold takes ONE/)
  })

  it('carries a repair on every argv refusal', () => {
    try {
      parseFoldArgs(['613', '--nope'])
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(LandingError)
      expect(e.step).toBe('validate')
      expect(e.repair).toMatch(/--into/)
    }
  })
})

// ---------------------------------------------------------------------------
describe('the reason a point is folded', () => {
  it('is exactly one of the two, never both and never neither', () => {
    expect(foldReason({ into: 720 })).toEqual({ kind: 'into', into: 720 })
    expect(foldReason({ delivered: 'schon gebaut' })).toEqual({ kind: 'delivered', delivered: 'schon gebaut' })
    expect(() => foldReason({ into: 720, delivered: 'schon gebaut' })).toThrow(/EITHER --into or --delivered/)
    expect(() => foldReason({})).toThrow(/must say WHERE the content went/)
    expect(() => foldReason({ delivered: '   ' })).toThrow(/must say WHERE the content went/)
  })
})

// ---------------------------------------------------------------------------
describe('the survivor', () => {
  it('accepts an OPEN point', () => {
    expect(resolveSurvivor({ tasksText: TASKS, archiveText: ARCHIVE, number: 613, into: 720 })).toEqual({ point: 720 })
  })

  it('refuses an ARCHIVED point — a closed point cannot take work on', () => {
    // This is the fold's worst quiet failure: the content is dropped while the
    // board says it was kept.
    try {
      resolveSurvivor({ tasksText: TASKS, archiveText: ARCHIVE, number: 613, into: 12 })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.message).toMatch(/ARCHIVED/)
      expect(e.repair).toMatch(/OPEN point/)
    }
  })

  it('refuses a point that is nowhere, and one that is ticked but still in TASKS.md', () => {
    expect(() => resolveSurvivor({ tasksText: TASKS, archiveText: ARCHIVE, number: 613, into: 999 })).toThrow(
      /nowhere in the work order/,
    )
    const stranded = `${TASKS}\n- [x] 800. Ein abgehakter, nicht verschobener Punkt.\n`
    expect(() => resolveSurvivor({ tasksText: stranded, archiveText: ARCHIVE, number: 613, into: 800 })).toThrow(
      /ticked but still sitting in TASKS.md/,
    )
  })

  it('refuses a point folded into itself', () => {
    expect(() => resolveSurvivor({ tasksText: TASKS, archiveText: ARCHIVE, number: 613, into: 613 })).toThrow(
      /cannot be folded into itself/,
    )
  })
})

// ---------------------------------------------------------------------------
describe('the Erledigt card text', () => {
  it('NAMES the point the content went to', () => {
    // Without the destination the card tells the reader on his phone that a point
    // he never saw worked on is finished, and nothing says what became of it.
    expect(foldCardText({ into: 720 })).toMatch(/Punkt 720/)
    expect(foldCardText({ into: 720 })).toMatch(/weitergeführt/)
  })

  it('NAMES the evidence when the work was already delivered', () => {
    const text = foldCardText({ delivered: 'der Fix sitzt seit c0ffee in main' })
    expect(text).toMatch(/der Fix sitzt seit c0ffee in main\./)
    expect(text).not.toMatch(/Punkt \d/)
  })

  it('terminates the evidence sentence without doubling an existing full stop', () => {
    expect(foldCardText({ delivered: 'schon gebaut.' })).toMatch(/schon gebaut\. /)
    expect(foldCardText({ delivered: 'schon gebaut.' })).not.toMatch(/gebaut\.\./)
  })

  it('lets a caller-supplied text override the generated one', () => {
    expect(foldCardText({ into: 720, text: 'Doppelt zu Punkt 720 gefiled.' })).toBe('Doppelt zu Punkt 720 gefiled.')
  })

  it('is German prose, not a transliteration', () => {
    // The board is read on a phone; "weitergefuehrt" reads there as damage.
    expect(foldCardText({ into: 720 })).not.toMatch(/ue|ae|oe/)
  })

  it('may name a foreign point BECAUSE the card lands in Erledigt', () => {
    // dashboard-card-topic-guard exempts the Erledigt section (history cards
    // legitimately narrate cross-point context) and flags every other section.
    // Proven against the guard itself rather than against a reading of its docs.
    const cardText = foldCardText({ into: 720 })
    const folded = foldBoardTransform({ point: 613, cardText, stamp: '14:00' })(board({ now: NOW_CARD('720') }))
    expect(topicViolations(folded, knownPoints(TASKS))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('the commit message', () => {
  it('names no point number in its subject and carries the model trailer', () => {
    const msg = foldCommitMessage({ number: 613, into: 720, model: 'Claude Opus 5' })
    expect(msg.split('\n')[0]).toBe('Move a folded point out of the open work order')
    expect(msg.split('\n')[0]).not.toMatch(/\d/)
    expect(msg).toMatch(/Co-Authored-By: Claude Opus 5 <noreply@anthropic\.com>/)
    // The trailer must satisfy the very gate that reads it.
    expect(evaluateCommitTrailers(msg).block).toBe(false)
  })

  it('states in its body where the content went', () => {
    expect(foldCommitMessage({ number: 613, into: 720, model: 'Claude Opus 5' })).toMatch(/folded into point 720/)
    expect(foldCommitMessage({ number: 613, delivered: 'schon in main', model: 'Claude Opus 5' })).toMatch(
      /already delivered: schon in main\./,
    )
  })

  it('refuses to guess the authoring model', () => {
    // The trailer is model-guard's only evidence of who authored a commit; a
    // script that filled in a plausible name would defeat that tripwire.
    try {
      foldCommitMessage({ number: 613, into: 720, model: '  ' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.message).toMatch(/no authoring model/)
      expect(e.repair).toMatch(/--model/)
    }
  })

  it('is rejected by the trailer gate when the model is not on the allowlist', () => {
    expect(evaluateCommitTrailers(foldCommitMessage({ number: 613, into: 720, model: 'Claude Haiku 4' })).block).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('the board transform', () => {
  it('promotes the queue card and closes it into Erledigt in ONE transform', () => {
    const html = board({ now: NOW_CARD('720') })
    expect(queueCard(html, 613)).toBeTruthy()
    const out = foldBoardTransform({ point: 613, cardText: foldCardText({ into: 720 }), stamp: '14:00' })(html)
    // Gone from the queue, gone from current work, standing in Erledigt.
    expect(nowCard(out, 613)).toBe(null)
    expect(doneCard(out, 613)).toBeTruthy()
    expect(doneEntries(out).map((e) => String(e.point))).toEqual(['613'])
    expect(doneCard(out, 613)).toMatch(/Punkt 720/)
    // And the point that WAS current work is still current work.
    expect(nowCard(out, 720)).toBeTruthy()
    expect(hasCurrentWork(out)).toBe(true)
  })

  it('keeps the queue card of every other point', () => {
    const out = foldBoardTransform({ point: 613, cardText: 'weg', stamp: '14:00' })(board({ now: NOW_CARD('720') }))
    // Scoped to the Warteschlange: the bare card markup is shared with Erledigt,
    // so `queueCard` alone would find the archived card it just wrote.
    const queueSection = out.slice(out.indexOf('<h2>Warteschlange'), out.indexOf('<h2>Erledigt'))
    expect(queueCard(queueSection, 613)).toBe(null)
    expect(queueCard(queueSection, 720)).toBeTruthy()
  })

  it('skips the promotion when the point ALREADY stands as current work', () => {
    // `toNow` needs a queue card, and a board listing the point in both sections
    // is the double listing the dashboard guard blocks.
    const html = board({ now: NOW_CARD('613') + NOW_CARD('720'), queue: ['720'] })
    const out = foldBoardTransform({ point: 613, cardText: 'weg', stamp: '14:00' })(html)
    expect(doneCard(out, 613)).toBeTruthy()
    expect(nowCard(out, 613)).toBe(null)
  })

  it('REFUSES to leave "Woran ich gerade arbeite" empty, and names both ways out', () => {
    // The refusal is closeCard's and it is kept, not defeated: promoting strips
    // the state cards, so a fold made while one of them was the only thing there
    // would empty the section — which the reader reads as "nothing is happening".
    const html = board()
    expect(() => foldBoardTransform({ point: 613, cardText: 'weg', stamp: '14:00' })(html)).toThrow(/EMPTY/)
    try {
      foldBoardTransform({ point: 613, cardText: 'weg', stamp: '14:00' })(html)
    } catch (e) {
      expect(e.message).toMatch(/--next/)
      expect(e.message).toMatch(/--none/)
    }
  })

  it('takes the successor as the way out, in the SAME edit', () => {
    const out = foldBoardTransform({
      point: 613,
      cardText: 'weg',
      stamp: '14:00',
      next: 720,
      nextStatus: 'Aufgenommen.',
    })(board())
    expect(doneCard(out, 613)).toBeTruthy()
    expect(nowCard(out, 720)).toBeTruthy()
    expect(hasCurrentWork(out)).toBe(true)
  })

  it('takes the idle card as the other way out', () => {
    const out = foldBoardTransform({
      point: 613,
      cardText: 'weg',
      stamp: '14:00',
      none: 'Sitzungsgrenze — der Nachfolger nimmt Punkt 720.',
    })(board())
    expect(doneCard(out, 613)).toBeTruthy()
    expect(hasCurrentWork(out)).toBe(true)
    expect(out).toMatch(/Gerade keine laufende Arbeit/)
  })

  it('lets the idle card reach its OWN refusal when --none carries no reason', () => {
    expect(() =>
      foldBoardTransform({ point: 613, cardText: 'weg', stamp: '14:00', none: ' ' })(board()),
    ).toThrow(/--none needs a reason/)
  })
})

// ---------------------------------------------------------------------------
describe('the whole validation', () => {
  it('produces the tick, the card text and where the card comes from', () => {
    const v = validateFold({
      tasksText: TASKS,
      archiveText: ARCHIVE,
      boardHtml: board({ now: NOW_CARD('720') }),
      number: 613,
      into: 720,
    })
    expect(v.number).toBe(613)
    expect(v.card).toEqual({ ok: true, from: 'queue' })
    expect(v.moved.block.startsWith('- [x] 613.')).toBe(true)
    expect(v.moved.tasks).not.toMatch(/613\./)
    expect(v.moved.archive).toMatch(/- \[x\] 613\./)
    // VERBATIM: only the checkbox changes.
    expect(v.moved.block).toMatch(/Zweite Zeile der Spezifikation\./)
  })

  it('never produces a state tasks-archive-guard would block', () => {
    const v = validateFold({
      tasksText: TASKS,
      archiveText: ARCHIVE,
      boardHtml: board({ now: NOW_CARD('720') }),
      number: 613,
      into: 720,
    })
    const accepted = transitionAccepted({
      before: evaluateTasksArchive({ tasksText: TASKS, archiveText: ARCHIVE }),
      after: evaluateTasksArchive({ tasksText: v.moved.tasks, archiveText: v.moved.archive }),
    })
    expect(accepted.ok).toBe(true)
  })

  it('refuses a point that is not open, before anything could be written', () => {
    expect(() =>
      validateFold({ tasksText: TASKS, archiveText: ARCHIVE, boardHtml: board(), number: 999, into: 720 }),
    ).toThrow(/not in TASKS.md/)
    const twice = `${TASKS}\n- [ ] 613. Noch einmal derselbe Punkt.\n`
    expect(() => validateFold({ tasksText: twice, archiveText: ARCHIVE, boardHtml: board(), number: 613, into: 720 })).toThrow(
      /appears 2 times/,
    )
    expect(() => validateFold({ tasksText: TASKS, archiveText: ARCHIVE, boardHtml: board(), number: 0, into: 720 })).toThrow(
      /not a point number/,
    )
  })

  it('refuses while the board still has a card to move — the remedy dies with the tick', () => {
    // The Warteschlange is DERIVED from the open work order, so a missing queue
    // card can be rebuilt while the point is open and never again afterwards.
    try {
      validateFold({
        tasksText: TASKS,
        archiveText: ARCHIVE,
        boardHtml: board({ now: NOW_CARD('720'), queue: ['720'] }),
        number: 613,
        into: 720,
      })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.message).toMatch(/carries no card for point 613/)
      expect(e.repair).toMatch(/board-queue\.mjs/)
      expect(e.repair).toMatch(/still OPEN/)
    }
  })

  it('accepts a point that stands as current work instead of in the queue', () => {
    const v = validateFold({
      tasksText: TASKS,
      archiveText: ARCHIVE,
      boardHtml: board({ now: NOW_CARD('613') + NOW_CARD('720'), queue: ['720'] }),
      number: 613,
      into: 720,
    })
    expect(v.card.from).toBe('now')
  })

  it('checks the survivor too', () => {
    expect(() =>
      validateFold({ tasksText: TASKS, archiveText: ARCHIVE, boardHtml: board(), number: 613, into: 12 }),
    ).toThrow(/ARCHIVED/)
  })
})

// ---------------------------------------------------------------------------
describe('the plan and the summary', () => {
  it('says what will run and what will not', () => {
    const plan = planFold({ number: 613, into: 720, cardText: 'weg', commit: false })
    expect(plan.steps.map((s) => s.id)).toEqual(FOLD_STEP_IDS)
    expect(plan.steps.find((s) => s.id === 'commit').run).toBe(false)
    expect(plan.steps.find((s) => s.id === 'commit').reason).toBe('--no-commit')
    expect(planFold({ number: 613, into: 720, commit: true }).steps.find((s) => s.id === 'commit').run).toBe(true)
  })

  it('names the destination in the verdict', () => {
    const done = FOLD_STEP_IDS.map((id) => ({ id, verdict: VERDICT.ok, detail: '' }))
    const lines = formatFoldVerdict({ number: 613, into: 720, results: done }).join('\n')
    expect(lines).toMatch(/folding point 613 into point 720/)
    expect(lines).toMatch(/FOLDED\./)
  })

  it('reports a failure with its repair and never as green', () => {
    const results = [
      { id: 'validate', verdict: VERDICT.ok, detail: '' },
      { id: 'tick', verdict: VERDICT.ok, detail: '' },
      { id: 'archive', verdict: VERDICT.ok, detail: '' },
      { id: 'board', verdict: VERDICT.failed, detail: 'the section would be empty' },
    ]
    const lines = formatFoldVerdict({
      number: 613,
      into: 720,
      results,
      error: new LandingError('the board edit failed', { step: 'board', repair: 'pass --none "<Grund>"' }),
    }).join('\n')
    expect(lines).toMatch(/FOLD FAILED at "board"/)
    expect(lines).toMatch(/repair: pass --none/)
    expect(lines).not.toMatch(/FOLDED\./)
  })

  it('calls an unfinished chain incomplete rather than done', () => {
    const lines = formatFoldVerdict({
      number: 613,
      delivered: 'schon gebaut',
      results: [{ id: 'validate', verdict: 'weird', detail: '' }],
    }).join('\n')
    expect(lines).toMatch(/FOLD INCOMPLETE/)
    expect(lines).toMatch(/as already delivered/)
  })
})
