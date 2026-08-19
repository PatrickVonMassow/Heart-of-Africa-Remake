// The autonomous session boundary (point 373, user 27.07.2026), pinned.
//
// The three witnesses the point names, plus the ways the mechanism could be
// abused into the two failures it must never cause:
//   - stopping mid-point (the idle stop the batch-progress-guard exists to
//     prevent), and
//   - stopping with a launcher that will never fire, which would not shorten a
//     session but END the batch.
import { describe, it, expect } from 'vitest'
import {
  BOUNDARY_DESTINATIONS,
  BOUNDARY_FRESH_MS,
  BOUNDARY_DUE_MS,
  boundaryCardText,
  boundaryDestination,
  assessBoundary,
  boundaryDueFrom,
  boundaryVerdict,
  classifyLauncherState,
  pointClosure,
  tickedPointsInDiff,
  boundaryCardCommand,
  handoverSurvivesCall,
  isClosingSetPath,
  isClosingSetCommand,
  isOutputPagerSegment,
  withoutOutputDescriptorMerges,
  describeWithdrawalTrigger,
  hookCallTimestamp,
  berlinMinuteOfDay,
  boardCarriesCard,
  cardProofFragments,
  cardRegions,
  cardStampIsCurrent,
  CARD_PROOF_WINDOW,
  markerFresh,
  markerPhase,
  preparedReceipt,
  PREPARED_RECEIPT_V,
  sealedBoundaryDeny,
  unpreparedRefusal,
  BOUNDARY_CAUSES,
  WITHDRAWAL_TRIGGER_MAX,
} from './batch-boundary-core.mjs'
import { NO_CURRENT_WORK_TITLE } from './board-core.mjs'
import {
  evaluate as evaluateTopic,
  knownPoints,
  topicViolations,
} from './dashboard-card-topic-guard-core.mjs'
import { markHandover, progressGuardDecision, readOwnerLock } from './batch-singleton.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearBoundary, commitSealedBoundary, standingCards } from './batch-boundary.mjs'
import { evaluateRuleReview } from './rule-review-core.mjs'

const NOW = 1_785_000_000_000
const SID = 'session-abc'
// A marker as `--commit` writes it — SEALED. The unphased shape the retired
// one-shot form wrote is no longer a boundary claim (Sol's review of abdde93),
// and the case below pins that.
const marker = (over = {}) => ({ v: 2, phase: 'committed', sessionId: SID, point: 373, at: NOW - 1000, ...over })

// ---------------------------------------------------------------------------
describe('classifyLauncherState — armed means "will fire again on its own"', () => {
  it('reads the Ready/Queued/Running states as armed, by name and by number', () => {
    for (const v of ['Ready', 'ready', 'Queued', 'Running', 3, '3', 2, 4]) {
      expect(classifyLauncherState(v)).toBe('armed')
    }
  })

  it('reads Disabled as disabled', () => {
    expect(classifyLauncherState('Disabled')).toBe('disabled')
    expect(classifyLauncherState(1)).toBe('disabled')
  })

  it('reads a missing, empty or unrecognised answer as unknown — never as armed', () => {
    for (const v of [null, undefined, '', '   ', 'Unknown', 0, 'ObjectNotFound']) {
      expect(classifyLauncherState(v)).toBe('unknown')
    }
  })
})

// ---------------------------------------------------------------------------
describe('pointClosure — the work order decides, not the claim', () => {
  const open = '- [ ] 374. Something still to do\n- [x] 999. leftover tick\n'
  const archive = '- [x] 373. The session boundary becomes autonomous\n'

  it('calls a point still listed open OPEN, even if the archive also has a tick', () => {
    expect(pointClosure(374, open, `${archive}- [x] 374. half-moved\n`)).toBe('open')
  })

  it('calls a point ticked in the archive CLOSED', () => {
    expect(pointClosure(373, open, archive)).toBe('closed')
  })

  it('accepts a tick that has not been archived yet (tick and move are not one commit)', () => {
    expect(pointClosure(999, open, '')).toBe('closed')
  })

  it('calls a point that appears nowhere UNKNOWN — absence is not completion', () => {
    expect(pointClosure(500, open, archive)).toBe('unknown')
  })

  it('rejects a non-point', () => {
    expect(pointClosure('x', open, archive)).toBe('unknown')
    expect(pointClosure(0, open, archive)).toBe('unknown')
  })

  it('does not confuse a point number with a longer one sharing its prefix', () => {
    expect(pointClosure(37, '- [ ] 373. open\n', '')).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
describe('assessBoundary', () => {
  it('accepts a fresh marker of this session for a closed point', () => {
    const b = assessBoundary({ marker: marker(), sid: SID, now: NOW, closure: 'closed' })
    expect(b).toEqual({ valid: true, point: 373, reason: 'boundary' })
  })

  it('reports no marker as no-marker (not as a refusal)', () => {
    expect(assessBoundary({ marker: null, sid: SID, now: NOW, closure: 'closed' }).reason).toBe(
      'no-marker',
    )
  })

  it('refuses a marker for a point that is still open', () => {
    const b = assessBoundary({ marker: marker(), sid: SID, now: NOW, closure: 'open' })
    expect(b.valid).toBe(false)
    expect(b.reason).toBe('point-still-open')
  })

  it('refuses a point whose closure cannot be verified', () => {
    expect(assessBoundary({ marker: marker(), sid: SID, now: NOW, closure: 'unknown' }).reason).toBe(
      'point-not-verifiable',
    )
  })

  it('refuses a marker left by a different session', () => {
    const b = assessBoundary({ marker: marker(), sid: 'other', now: NOW, closure: 'closed' })
    expect(b.valid).toBe(false)
    expect(b.reason).toBe('marker-foreign-session')
  })

  it('refuses when the asking session has no id at all', () => {
    expect(assessBoundary({ marker: marker(), sid: '', now: NOW, closure: 'closed' }).valid).toBe(false)
  })

  it('refuses a stale marker — an abandoned attempt must not authorise a later stop', () => {
    const old = marker({ at: NOW - BOUNDARY_FRESH_MS - 1 })
    expect(assessBoundary({ marker: old, sid: SID, now: NOW, closure: 'closed' }).reason).toBe(
      'marker-stale',
    )
  })

  it('refuses an UNPHASED point marker — the one-shot form that wrote it is retired (Sol on abdde93)', () => {
    // Such a marker would authorise a stop that skipped --prepare, its receipt,
    // the card proof, the transfer and the seal.
    const legacy = { v: 1, sessionId: SID, point: 373, at: NOW - 1000 }
    const b = assessBoundary({ marker: legacy, sid: SID, now: NOW, closure: 'closed' })
    expect(b.valid).toBe(false)
    expect(b.reason).toBe('marker-uncommitted')
    expect(boundaryVerdict({ boundary: b, launcher: 'armed' })).toBe(null)
  })

  it('refuses a malformed marker', () => {
    expect(assessBoundary({ marker: { sessionId: SID }, sid: SID, now: NOW, closure: 'closed' }).reason).toBe(
      'marker-malformed',
    )
    expect(
      assessBoundary({ marker: marker({ at: 'soon' }), sid: SID, now: NOW, closure: 'closed' }).reason,
    ).toBe('marker-stale')
  })
})

// ---------------------------------------------------------------------------
describe('boundaryVerdict', () => {
  const good = { valid: true, point: 373, reason: 'boundary' }

  it('allows the stop with an armed launcher', () => {
    expect(boundaryVerdict({ boundary: good, launcher: 'armed' })).toBe('allow-boundary')
  })

  it('blocks with a disabled or unknown launcher — a stop then ends the BATCH', () => {
    expect(boundaryVerdict({ boundary: good, launcher: 'disabled' })).toBe('block-launcher')
    expect(boundaryVerdict({ boundary: good, launcher: 'unknown' })).toBe('block-launcher')
  })

  it('stays out of the way when no boundary is claimed', () => {
    expect(boundaryVerdict({ boundary: null, launcher: 'armed' })).toBe(null)
    expect(
      boundaryVerdict({ boundary: { valid: false, reason: 'no-marker' }, launcher: 'armed' }),
    ).toBe(null)
  })

  it('falls through (→ the ordinary block) on a refused claim', () => {
    expect(
      boundaryVerdict({ boundary: { valid: false, point: 373, reason: 'point-still-open' }, launcher: 'armed' }),
    ).toBe(null)
  })
})

// ---------------------------------------------------------------------------
describe('progressGuardDecision at a point boundary (the point-373 witnesses)', () => {
  const base = {
    sid: SID,
    paused: false,
    openCount: 5,
    formatSuspect: false,
    ownership: 'mine',
    unhandledAlert: false,
  }
  const closed = { valid: true, point: 373, reason: 'boundary' }
  const stillOpen = { valid: false, point: 373, reason: 'point-still-open' }

  it('ALLOWS a boundary stop with a closed point and an armed launcher', () => {
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'armed' })).toBe(
      'allow-boundary',
    )
  })

  it('BLOCKS the same stop while the point is still open', () => {
    expect(progressGuardDecision({ ...base, boundary: stillOpen, launcher: 'armed' })).toBe(
      'block-continue',
    )
  })

  it('BLOCKS with an unarmed launcher, so a disabled task can never strand the batch', () => {
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'disabled' })).toBe(
      'block-launcher',
    )
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'unknown' })).toBe(
      'block-launcher',
    )
  })

  it('keeps every pre-existing verdict unchanged when no boundary is claimed', () => {
    expect(progressGuardDecision(base)).toBe('block-continue')
    expect(progressGuardDecision({ ...base, boundary: null, launcher: 'armed' })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, ownership: 'held', boundary: closed, launcher: 'armed' })).toBe(
      'stand-down',
    )
    expect(progressGuardDecision({ ...base, paused: true, boundary: closed, launcher: 'armed' })).toBe(
      'allow',
    )
  })

  it('never lets a boundary skip the parallel-session remediation', () => {
    expect(
      progressGuardDecision({ ...base, unhandledAlert: true, boundary: closed, launcher: 'armed' }),
    ).toBe('block-remediate')
  })

  it('never lets a boundary hide an unparseable work order', () => {
    expect(
      progressGuardDecision({ ...base, formatSuspect: true, boundary: closed, launcher: 'armed' }),
    ).toBe('block-format')
  })

  // --- point 388: the boundary is TAKEN, not offered -------------------------
  it('BLOCKS a closed point with no marker, and says so as its own verdict', () => {
    expect(progressGuardDecision({ ...base, boundaryDue: 387 })).toBe('block-take-boundary')
  })

  it('a REAL marker still outranks the reminder', () => {
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'armed', boundaryDue: 373 })).toBe(
      'allow-boundary',
    )
  })

  it('the reminder never overrides a stand-down, a pause or a remediation', () => {
    expect(progressGuardDecision({ ...base, ownership: 'held', boundaryDue: 387 })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, paused: true, boundaryDue: 387 })).toBe('allow')
    expect(progressGuardDecision({ ...base, unhandledAlert: true, boundaryDue: 387 })).toBe('block-remediate')
    expect(progressGuardDecision({ ...base, formatSuspect: true, boundaryDue: 387 })).toBe('block-format')
  })

  it('a junk due value falls back to the ordinary block', () => {
    for (const bad of [null, 0, -3, '387', 1.5]) {
      expect(progressGuardDecision({ ...base, boundaryDue: bad })).toBe('block-continue')
    }
  })
})

// ---------------------------------------------------------------------------
// LIVE FINDING 2 (28.07.2026): the boundary was withdrawn by the very work the
// Stop chain demanded. `.claude/boundary.log` shows it to the second —
// `HANDOVER point 378` at 08:56:12, `WITHDRAWN point 378` at 08:56:16 — and
// three such rounds happened on the first live run. A boundary that only
// survives a turn with nothing left to do is not a mechanism, because finding
// something left to do is the Stop chain's whole purpose.
describe('handoverSurvivesCall — closing work keeps the boundary, anything else ends it', () => {
  const call = (over) => handoverSurvivesCall({ toolName: 'Bash', ...over })

  it('keeps it for the board, the review ledger and the work order itself', () => {
    for (const f of [
      'C:\\repo\\.claude\\batch-dashboard.html',
      '/tmp/scratch/hoa-batch-dashboard.html',
      '.claude/dashboard-state.json',
      '.claude/mechanism-reviews.jsonl',
      'TASKS.md',
      'docs/tasks-archive.md',
    ]) {
      expect(handoverSurvivesCall({ toolName: 'Edit', filePath: f })).toMatchObject({ survives: true })
    }
  })

  it('keeps it for the commands the Stop guards demand', () => {
    for (const c of [
      'node scripts/dashboard-publish.mjs',
      'node scripts/focus.mjs confirm',
      'node scripts/mechanism-review.mjs --record --verdict ok',
      'node scripts/batch-boundary.mjs 388',
      'cd /repo && node scripts/board.mjs move 388 done',
      'node "C:/repo/scripts/retro-refresh.mjs"',
      'node scripts/board-queue.mjs',
      'node scripts/finding.mjs --drain',
    ]) {
      expect(call({ command: c })).toMatchObject({ survives: true })
    }
  })

  it('ENDS it for ordinary work — the batch is being carried on', () => {
    for (const c of ['npm test', 'git commit -m x', 'node scripts/point-brief.mjs 389', 'npm run build']) {
      expect(call({ command: c }).survives).toBe(false)
    }
    expect(handoverSurvivesCall({ toolName: 'Write', filePath: 'src/world/world.ts' }).survives).toBe(false)
  })

  it('ONE non-closing segment ends it, however much closing work rides along', () => {
    expect(call({ command: 'node scripts/dashboard-publish.mjs && git push' }).survives).toBe(false)
    expect(call({ command: 'npm test; node scripts/focus.mjs confirm' }).survives).toBe(false)
  })

  it('a single & is a separator too — it hid real work behind a closing head', () => {
    // Four-eyes review (Fable 5): with `&&` and `;` as the only separators this
    // parsed as ONE segment, matched the closing head and KEPT the handover
    // through `npm test` — a successor could then spawn beside a working session.
    expect(call({ command: 'node scripts/board.mjs & npm test' }).survives).toBe(false)
    expect(call({ command: 'npm test & node scripts/board.mjs' }).survives).toBe(false)
    // …and a genuine chain of closing commands still survives it.
    expect(call({ command: 'node scripts/focus.mjs confirm & node scripts/dashboard-publish.mjs' }).survives).toBe(true)
  })

  it('a segment that can run or write something unseen is not closing', () => {
    for (const c of [
      'node scripts/board.mjs $(rm -rf src)',
      'node scripts/dashboard-publish.mjs `npm test`',
      'node scripts/board.mjs > src/world.ts',
      'node scripts/focus.mjs confirm < payload.txt',
    ]) {
      expect(call({ command: c }).survives).toBe(false)
    }
  })

  it('THE WAY OUT SURVIVES harmless output decoration', () => {
    for (const command of [
      'node scripts/batch-boundary.mjs --clear',
      'node scripts/batch-boundary.mjs --clear 2>&1',
      'node scripts/batch-boundary.mjs --clear | tail -3',
      'node scripts/batch-boundary.mjs --clear 2>&1 | tail -3',
      'node scripts/board.mjs attest 2>&1 | tail -3',
      'node scripts/board-queue.mjs 2>&1 | head -3',
      'node scripts/finding.mjs --drain 2>&1 | more',
    ]) {
      expect(call({ command }).survives, command).toBe(true)
    }
  })

  it('keeps file writes, substitutions and second work outside the closing set', () => {
    for (const command of [
      'node scripts/batch-boundary.mjs --clear > boundary.txt',
      'node scripts/batch-boundary.mjs --clear 2> errors.txt',
      'node scripts/batch-boundary.mjs --clear $(git status)',
      'node scripts/batch-boundary.mjs --clear && git commit -m carry-on',
    ]) {
      expect(call({ command }).survives, command).toBe(false)
    }
  })

  it('recognises only descriptor merges as harmless redirection', () => {
    expect(withoutOutputDescriptorMerges('x 2>&1 1>&2')).toBe('x  ')
    expect(withoutOutputDescriptorMerges('x > out 2> err')).toBe('x > out 2> err')
    expect(withoutOutputDescriptorMerges('x >& out')).toBe('x >& out')
  })

  it('is CONSERVATIVE where it cannot tell: unknown tool, no target, empty command', () => {
    expect(handoverSurvivesCall({}).survives).toBe(false)
    expect(handoverSurvivesCall({ toolName: 'Agent' }).survives).toBe(false)
    expect(handoverSurvivesCall({ toolName: 'Bash', command: '   ' }).survives).toBe(false)
    expect(call({ command: 'node' }).survives).toBe(false)
    expect(handoverSurvivesCall({ toolName: 'Edit', filePath: '.claude/settings.json' }).survives).toBe(false)
  })

  it('a lookalike path outside the closing set does not pass', () => {
    expect(isClosingSetPath('docs/tasks-archive.md.bak')).toBe(false)
    expect(isClosingSetPath('my-tasks.md')).toBe(false)
    expect(isClosingSetPath('')).toBe(false)
    expect(isClosingSetCommand('node scripts/focus-something-else.mjs')).toBe(false)
  })

  // --- A PAGER IS NOT WORK (point 426 (a), measured live 29.07.2026) ----------
  // `node scripts/focus.mjs set … | tail -2` reported "boundary recorded", silently
  // deleted the marker, and the next Stop hook demanded the boundary again with no
  // record anywhere of why. Shortening the OUTPUT is not carrying on.
  it('A TRAILING PAGER SURVIVES — it only looks at what the closing script printed', () => {
    expect(call({ command: 'node scripts/focus.mjs set 1 x | tail -2' }).survives).toBe(true)
    expect(call({ command: 'node scripts/focus.mjs set 1 x | head -5' }).survives).toBe(true)
    expect(call({ command: 'node scripts/batch-boundary.mjs 426 | more' }).survives).toBe(true)
    expect(call({ command: 'node scripts/board.mjs attest | cat' }).survives).toBe(true)
    // …after a whole chain of closing work, too.
    expect(
      call({ command: 'node scripts/focus.mjs confirm && node scripts/dashboard-publish.mjs | tail -2' }).survives,
    ).toBe(true)
  })

  it('but a pager NEVER launders real work', () => {
    expect(call({ command: 'npm test | tail -2' }).survives).toBe(false)
    expect(call({ command: 'node scripts/board.mjs attest && npm test' }).survives).toBe(false)
    expect(call({ command: 'node scripts/focus.mjs show | grep x | node other.mjs' }).survives).toBe(false)
    // A pager in the MIDDLE would hide whatever follows it.
    expect(call({ command: 'node scripts/focus.mjs show | tail -2 | npm test' }).survives).toBe(false)
    expect(call({ command: 'node scripts/focus.mjs show | tail -2 && git push' }).survives).toBe(false)
  })

  it('a pager ALONE is not a closing line', () => {
    expect(call({ command: 'tail -2' }).survives).toBe(false)
    expect(call({ command: 'cat .claude/boundary.log' }).survives).toBe(false)
    expect(call({ command: 'tail -2 | head -1' }).survives).toBe(false)
  })

  it('the opaque-segment ban is UNTOUCHED by the widening', () => {
    expect(call({ command: 'node scripts/focus.mjs set 1 x | cat > src/world.ts' }).survives).toBe(false)
    expect(call({ command: 'node scripts/focus.mjs set 1 x | tail $(npm test)' }).survives).toBe(false)
    expect(call({ command: 'node scripts/focus.mjs set 1 x | tail -2 > out.txt' }).survives).toBe(false)
  })

  it('a command merely BEGINNING like a pager is not one', () => {
    expect(isOutputPagerSegment('tail -2')).toBe(true)
    expect(isOutputPagerSegment('head')).toBe(true)
    expect(isOutputPagerSegment('catalogue --build')).toBe(false)
    expect(isOutputPagerSegment('headless-run.mjs')).toBe(false)
    expect(isOutputPagerSegment('')).toBe(false)
    expect(isOutputPagerSegment()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('describeWithdrawalTrigger — the record names the call that took it back', () => {
  it('names the tool and the command', () => {
    expect(describeWithdrawalTrigger({ toolName: 'Bash', command: 'npm test' })).toBe('Bash: npm test')
  })

  it('collapses whitespace so a heredoc stays one log line', () => {
    expect(describeWithdrawalTrigger({ toolName: 'Bash', command: 'git commit -F -\n\n  body\n' })).toBe(
      'Bash: git commit -F - body',
    )
  })

  it('falls back to the file path, then to the bare tool', () => {
    expect(describeWithdrawalTrigger({ toolName: 'Edit', filePath: 'src/App.tsx' })).toBe('Edit: src/App.tsx')
    expect(describeWithdrawalTrigger({ toolName: 'Agent' })).toBe('Agent')
    expect(describeWithdrawalTrigger({})).toBe('unknown tool')
    expect(describeWithdrawalTrigger()).toBe('unknown tool')
  })

  it('truncates — this is a log entry, not a transcript', () => {
    const long = describeWithdrawalTrigger({ toolName: 'Bash', command: 'x'.repeat(5000) })
    expect(long.length).toBeLessThanOrEqual(WITHDRAWAL_TRIGGER_MAX + 'Bash: '.length + 1)
    expect(long.endsWith('…')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe("hookCallTimestamp — when the payload knows WHEN, point 396 uses it", () => {
  it('accepts milliseconds and an ISO string', () => {
    expect(hookCallTimestamp({ timestamp: 1_785_000_000_000 })).toBe(1_785_000_000_000)
    expect(hookCallTimestamp({ timestamp: '2026-07-28T11:42:00.469Z' })).toBe(Date.parse('2026-07-28T11:42:00.469Z'))
    expect(hookCallTimestamp({ tool_use_at: 1_785_000_000_001 })).toBe(1_785_000_000_001)
    expect(hookCallTimestamp({ tool_response: { timestamp: 1_785_000_000_002 } })).toBe(1_785_000_000_002)
  })

  it('answers NULL rather than guessing — the settle window then decides', () => {
    expect(hookCallTimestamp({})).toBe(null)
    expect(hookCallTimestamp()).toBe(null)
    expect(hookCallTimestamp({ timestamp: 'shortly' })).toBe(null)
    expect(hookCallTimestamp({ timestamp: 0 })).toBe(null)
    expect(hookCallTimestamp({ timestamp: {} })).toBe(null)
  })
})

// ---------------------------------------------------------------------------
describe('tickedPointsInDiff — a tick, not the archive housekeeping', () => {
  it('reads the points a commit newly ticked', () => {
    expect(tickedPointsInDiff('+- [x] 386. A thing\n+- [x] 387. Another\n context')).toEqual([386, 387])
  })

  it('ignores an open point and a mere mention', () => {
    expect(tickedPointsInDiff('+- [ ] 390. Still open\n+see - [x] 12. in the prose')).toEqual([])
  })

  it('MOVING an already-ticked point into the archive is not a fresh close', () => {
    const move = '--- a/TASKS.md\n-- [x] 380. Older point\n+++ b/docs/tasks-archive.md\n+- [x] 380. Older point'
    expect(tickedPointsInDiff(move)).toEqual([])
  })

  it('a commit that ticks one point while archiving another reports only the tick', () => {
    expect(tickedPointsInDiff('-- [x] 380. moved\n+- [x] 380. moved\n+- [x] 388. closed now')).toEqual([388])
  })
})

// ---------------------------------------------------------------------------
describe('boundaryDueFrom — only for a point THIS session closed, and only while fresh', () => {
  const ownerSince = NOW - 3 * 3600_000

  it('a point ticked during this ownership, minutes ago → due', () => {
    expect(boundaryDueFrom({ tick: { point: 388, at: NOW - 60_000 }, ownerSince, now: NOW })).toBe(388)
  })

  it('THE PING-PONG GUARD: a successor is never sent home for its predecessor\'s tick', () => {
    // The launcher spawns a fresh session minutes after the previous one ticked.
    // Without this rule it would take a boundary for a point it never closed and
    // end having done nothing — session ping-pong instead of work.
    expect(boundaryDueFrom({ tick: { point: 388, at: NOW - 20 * 60_000 }, ownerSince: NOW - 60_000, now: NOW })).toBe(
      null,
    )
  })

  it('an old tick stops nagging — a session an hour and a half on has moved to other work', () => {
    expect(boundaryDueFrom({ tick: { point: 388, at: NOW - BOUNDARY_DUE_MS - 1 }, ownerSince, now: NOW })).toBe(null)
  })

  it('no tick, an unusable tick or an unknown ownership start → nothing', () => {
    expect(boundaryDueFrom({ tick: null, ownerSince, now: NOW })).toBe(null)
    expect(boundaryDueFrom({ tick: { point: 0, at: NOW }, ownerSince, now: NOW })).toBe(null)
    expect(boundaryDueFrom({ tick: { point: 388, at: 'yesterday' }, ownerSince, now: NOW })).toBe(null)
    expect(boundaryDueFrom({ tick: { point: 388, at: NOW - 60_000 }, ownerSince: undefined, now: NOW })).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// POINT 434 (7), found 29.07.2026 20:06: the card said "Ich übergebe an eine
// frische Sitzung … Sie nimmt den nächsten Punkt der Warteschlange auf" while a
// user window held an HONOURED claim — and `batch-autostart.mjs` reserves the
// batch for a live claim and SKIPS the spawn, so the batch went to that window.
// The text told the user his takeover had been overtaken. One case per state.
describe('the boundary card names where the batch actually goes', () => {
  it('WITH an honoured claim: the claiming window, and the launcher skips the spawn', () => {
    const where = boundaryDestination({ claimHonoured: true, claimantSid: 'session-window-1' })
    expect(where).toEqual({ destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW, claimantSid: 'session-window-1' })
    const text = boundaryCardText({ point: 434, ...where })
    expect(text).toContain('Der Punkt ist abgeschlossen.')
    expect(text).toContain('NICHT an eine frische Sitzung')
    expect(text).toContain('Fenster session-window-1 hat ihn beansprucht')
    expect(text).toContain('Launcher hält den Start deshalb zurück')
    expect(text).toContain('--session session-window-1')
    // The sentence the incident was made of must not appear in this state.
    expect(text).not.toContain('nächsten Punkt der Warteschlange')
  })

  it('WITHOUT a claim: a fresh session, which takes the next queued point', () => {
    const where = boundaryDestination({})
    expect(where).toEqual({ destination: BOUNDARY_DESTINATIONS.FRESH_SESSION, claimantSid: null })
    const text = boundaryCardText({ point: 434, ...where })
    expect(text).toContain('Ich übergebe an eine frische Sitzung')
    expect(text).toContain('nächsten Punkt der Warteschlange')
    expect(text).toContain('Kein Fenster hat den Stapel beansprucht')
  })

  it('a claim that is merely RECORDED changes nothing — the card follows `honour`', () => {
    // Expired, dead, or already released: the launcher spawns, so the card says
    // so. It reads the same predicate the launcher bails on, never the file.
    expect(boundaryDestination({ claimHonoured: false, claimantSid: 'session-window-1' }).destination).toBe(
      BOUNDARY_DESTINATIONS.FRESH_SESSION,
    )
    expect(boundaryDestination({ claimHonoured: true, claimantSid: '  ' }).destination).toBe(
      BOUNDARY_DESTINATIONS.FRESH_SESSION,
    )
  })

  it('is total, and never prints a point number at all', () => {
    for (const point of [undefined, 'vier', 0, 434]) {
      expect(boundaryCardText({ point }).startsWith('Der Punkt ist abgeschlossen.')).toBe(true)
    }
  })

  // POINT 439: two sanctioned mechanisms used to contradict each other. This text
  // is prescribed for VERBATIM use in the gap card `done <n> --none` writes — a
  // card that owns no point number, so the topic guard read every "Punkt N" in it
  // as a reference to a foreign point and blocked the turn end. The loser was
  // always the boundary: the block costs a turn, and every remedy command counts
  // as work and deletes the marker, so the handover had to be re-taken.
  it('AGREES WITH THE TOPIC GUARD: the prescribed text passes in the card it is written into', () => {
    const tasks = '- [ ] 434. Etwas Offenes.\n- [ ] 439. Noch etwas.\n- [x] 400. Erledigt.\n'
    const gapCard = (text) =>
      '<h2>Woran ich gerade arbeite</h2>\n' +
      `<details class="now"><summary><span class="t">${NO_CURRENT_WORK_TITLE}</span></summary>` +
      `<div class="body"><p><span class="stamp">Stand 21:10</span> ${text}</p></div></details>\n` +
      '<h2>Erledigt</h2>\n'
    for (const where of [
      boundaryDestination({}),
      boundaryDestination({ claimHonoured: true, claimantSid: 'session-window-1' }),
    ]) {
      const card = gapCard(boundaryCardText({ point: 434, ...where }))
      expect(topicViolations(card, knownPoints(tasks))).toEqual([])
      expect(evaluateTopic({ dashboardHtml: card, tasksText: tasks }).block).toBe(false)
    }
  })

  // POINT 470: the printed instruction must be a command that WORKS. Printing
  // `done <n> --none` for a point whose card was already archived left the
  // session with no working command at all, so it hand-edited the board file —
  // and a hand-edit appends, which is how three idle cards came to stand stacked.
  it('names the command that fits the board it is printed for', () => {
    expect(boundaryCardCommand({ point: 434, pointCardStanding: true })).toBe(
      'node scripts/board.mjs done 434 --none --text-stdin',
    )
    expect(boundaryCardCommand({ point: 434, pointCardStanding: false })).toBe(
      'node scripts/board.mjs none --text-stdin',
    )
    // The point-less form is the DEFAULT: it works in either board state, while
    // `done` is the one that can fail.
    expect(boundaryCardCommand({ point: 434 })).toBe('node scripts/board.mjs none --text-stdin')
    expect(boundaryCardCommand()).toContain('board.mjs none')
    // Only a real true counts — a truthy string must not select the fragile form.
    expect(boundaryCardCommand({ point: 434, pointCardStanding: 'yes' })).toContain('board.mjs none --text-stdin')
  })

  it('INDEPENDENCE: the card is decided with no lock, no launcher probe and no work order', () => {
    // Nothing but the claim verdict reaches this decision, so a stale or missing
    // input from any other layer cannot silence it or make it lie.
    expect(boundaryCardText({ point: 1, ...boundaryDestination({ claimHonoured: true, claimantSid: 's' }) })).toContain(
      'Fenster s hat ihn beansprucht',
    )
  })
})

// ---------------------------------------------------------------------------
// THE TWO-PHASE BOUNDARY (point 675, defeat 1): a committed marker is SEALED —
// a later mutation is an explicit, loud DENY, never a silent marker deletion,
// and everything `--prepare` prescribes stays inside the closing set so the
// bookkeeping can never delete a marker either.
// ---------------------------------------------------------------------------
describe('markerPhase — only a committed marker is sealed', () => {
  it('distinguishes none / legacy / committed', () => {
    expect(markerPhase(null)).toBe('none')
    expect(markerPhase(undefined)).toBe('none')
    expect(markerPhase(marker({ phase: undefined }))).toBe('legacy')
    expect(markerPhase(marker())).toBe('committed')
    expect(markerPhase(marker({ phase: 'prepared' }))).toBe('legacy') // unknown phases are not sealed
  })
})

describe('sealedBoundaryDeny — a mutation after --commit errors loudly (point 675)', () => {
  const sealed = marker({ phase: 'committed' })
  const call = { toolName: 'Bash', command: 'git commit -m x' }

  it('DENIES a non-closing mutation after commit, naming --clear as the way back', () => {
    const d = sealedBoundaryDeny({ marker: sealed, sid: SID, now: NOW, ...call })
    expect(d.deny).toBe(true)
    expect(d.reason).toContain('COMMITTED')
    expect(d.reason).toContain('--clear')
  })

  it('a file edit outside the closing set is denied too', () => {
    expect(
      sealedBoundaryDeny({ marker: sealed, sid: SID, now: NOW, toolName: 'Write', filePath: 'src/App.tsx' }).deny,
    ).toBe(true)
  })

  it('NEVER denies the closing set — the card publish, the board, --clear itself', () => {
    for (const command of [
      'node scripts/board.mjs none --text-stdin',
      'node scripts/board-publish.mjs',
      'node scripts/batch-boundary.mjs --clear',
      'node scripts/batch-boundary.mjs --status',
      'node scripts/batch-in-flight.mjs --status',
      'node scripts/guard-preflight.mjs --for answer --session s',
    ]) {
      expect(sealedBoundaryDeny({ marker: sealed, sid: SID, now: NOW, toolName: 'Bash', command }).deny).toBe(false)
    }
  })

  it('a legacy (un-phased) marker denies nothing — it authorises nothing either', () => {
    expect(sealedBoundaryDeny({ marker: marker({ phase: undefined }), sid: SID, now: NOW, ...call }).deny).toBe(false)
  })

  it('a stale or foreign committed marker denies nothing — the seal is not a trap', () => {
    expect(
      sealedBoundaryDeny({
        marker: marker({ phase: 'committed', at: NOW - BOUNDARY_FRESH_MS - 1 }),
        sid: SID,
        now: NOW,
        ...call,
      }).deny,
    ).toBe(false)
    expect(sealedBoundaryDeny({ marker: sealed, sid: 'other-session', now: NOW, ...call }).deny).toBe(false)
    expect(sealedBoundaryDeny({ marker: sealed, sid: '', now: NOW, ...call }).deny).toBe(false)
    expect(sealedBoundaryDeny({ marker: null, sid: SID, now: NOW, ...call }).deny).toBe(false)
  })

  it('names the context watermark when that is what was committed', () => {
    const d = sealedBoundaryDeny({
      marker: marker({ phase: 'committed', cause: 'context', point: null, tokens: 160_000 }),
      sid: SID,
      now: NOW,
      ...call,
    })
    expect(d.deny).toBe(true)
    expect(d.reason).toContain('context watermark')
  })
})

describe('the marker survives everything --prepare prescribes (point 675)', () => {
  it('every bookkeeping command the prepare phase names is in the closing set', () => {
    // These are the commands `batch-boundary.mjs --prepare` prints. If one of
    // them ever left the closing set, running it would withdraw a taken
    // boundary again — the exact measured defeat of 13.08.2026 (board-publish
    // was the missing one).
    for (const command of [
      'node scripts/board.mjs done 675 --none --text-stdin',
      'node scripts/board.mjs none --text-stdin',
      'node scripts/board-publish.mjs',
      'node scripts/guard-preflight.mjs --for answer --session s',
      'node scripts/batch-boundary.mjs --prepare 675',
      'node scripts/batch-boundary.mjs --commit 675',
      'node scripts/batch-in-flight.mjs --handover-check',
      'node scripts/batch-in-flight.mjs --adopt',
      'node scripts/context-watermark.mjs --status',
    ]) {
      expect(handoverSurvivesCall({ toolName: 'Bash', command }).survives, command).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// THE CONTEXT BOUNDARY (point 675, defeat 3): valid without a closed point,
// but ONLY on a recorded real measurement.
// ---------------------------------------------------------------------------
describe('assessBoundary — the context-watermark cause', () => {
  const ctx = (over = {}) =>
    marker({ phase: 'committed', cause: 'context', point: null, tokens: 165_000, watermark: 150_000, ...over })

  it('is valid without any point closure, on a recorded measurement', () => {
    const b = assessBoundary({ marker: ctx(), sid: SID, now: NOW, closure: 'unknown' })
    expect(b).toEqual({ valid: true, point: null, reason: 'context-boundary' })
  })

  it('REFUSES a context marker with no recorded token reading — assumption is not measurement', () => {
    expect(assessBoundary({ marker: ctx({ tokens: undefined }), sid: SID, now: NOW, closure: 'unknown' }).valid).toBe(
      false,
    )
    expect(assessBoundary({ marker: ctx({ tokens: 0 }), sid: SID, now: NOW, closure: 'unknown' }).reason).toBe(
      'context-marker-unmeasured',
    )
    // …and the recorded MARK is as mandatory as the reading (Sol finding 5).
    expect(assessBoundary({ marker: ctx({ watermark: undefined }), sid: SID, now: NOW, closure: 'unknown' }).reason).toBe(
      'context-marker-unmeasured',
    )
  })

  it('an UNPHASED context marker authorises nothing — only --commit writes one (Sol re-review, finding 3)', () => {
    expect(assessBoundary({ marker: ctx({ phase: undefined }), sid: SID, now: NOW, closure: 'unknown' })).toEqual({
      valid: false,
      point: null,
      reason: 'context-marker-uncommitted',
    })
    expect(assessBoundary({ marker: ctx({ phase: 'prepared' }), sid: SID, now: NOW, closure: 'unknown' }).valid).toBe(
      false,
    )
  })

  it('RE-JUDGES the claim: a reading below the recorded mark authorises nothing (Sol finding 5)', () => {
    const b = assessBoundary({ marker: ctx({ tokens: 1 }), sid: SID, now: NOW, closure: 'unknown' })
    expect(b).toEqual({ valid: false, point: null, reason: 'context-below-watermark' })
    expect(
      assessBoundary({ marker: ctx({ tokens: 149_999 }), sid: SID, now: NOW, closure: 'unknown' }).valid,
    ).toBe(false)
    // At the mark exactly is past it — the same >= the live decision uses.
    expect(assessBoundary({ marker: ctx({ tokens: 150_000 }), sid: SID, now: NOW, closure: 'unknown' }).valid).toBe(true)
  })

  it('keeps the freshness and session binding of every marker', () => {
    expect(
      assessBoundary({ marker: ctx({ at: NOW - BOUNDARY_FRESH_MS - 1 }), sid: SID, now: NOW, closure: 'unknown' })
        .reason,
    ).toBe('marker-stale')
    expect(assessBoundary({ marker: ctx(), sid: 'other', now: NOW, closure: 'unknown' }).reason).toBe(
      'marker-foreign-session',
    )
  })

  it('the claim may not bring its own yardstick — the CURRENT mark is judged too (Sol final round)', () => {
    // {tokens: 1, watermark: 1} is internally consistent and must still fail.
    expect(
      assessBoundary({ marker: ctx({ tokens: 1, watermark: 1 }), sid: SID, now: NOW, closure: 'unknown', watermarkNow: 150_000 })
        .reason,
    ).toBe('context-below-watermark')
    expect(
      assessBoundary({ marker: ctx(), sid: SID, now: NOW, closure: 'unknown', watermarkNow: 150_000 }).valid,
    ).toBe(true)
    // A mark recalibrated DOWN since the commit still honours the recorded, higher one.
    expect(
      assessBoundary({ marker: ctx({ tokens: 120_000 }), sid: SID, now: NOW, closure: 'unknown', watermarkNow: 100_000 })
        .valid,
    ).toBe(false)
    // …and a broken watermarkNow input falls back to the recorded mark alone.
    expect(
      assessBoundary({ marker: ctx(), sid: SID, now: NOW, closure: 'unknown', watermarkNow: NaN }).valid,
    ).toBe(true)
  })

  it('feeds boundaryVerdict exactly like a point boundary', () => {
    const boundary = assessBoundary({ marker: ctx(), sid: SID, now: NOW, closure: 'unknown' })
    expect(boundaryVerdict({ boundary, launcher: 'armed' })).toBe('allow-boundary')
    expect(boundaryVerdict({ boundary, launcher: 'disabled' })).toBe('block-launcher')
  })
})

describe('commitSealedBoundary — the marker and ownership handover are one commit', () => {
  it('records the transfer, writes the marker, then hands the lock over', () => {
    const order = []
    const out = commitSealedBoundary({
      transfer: { commit: () => (order.push('transfer'), 'feat/x@abcd') },
      marker: { v: 2 },
      write: () => order.push('marker'),
      handover: () => (order.push('handover'), { handed: true }),
    })
    expect(order).toEqual(['transfer', 'marker', 'handover'])
    expect(out).toBe('feat/x@abcd')
  })

  it('a THROWING transfer leaves NO marker behind, and names its stage', () => {
    let wrote = false
    let caught = null
    try {
      commitSealedBoundary({
        transfer: {
          commit: () => {
            throw new Error('declaration unwritable')
          },
        },
        marker: { v: 2 },
        write: () => {
          wrote = true
        },
      })
    } catch (e) {
      caught = e
    }
    expect(caught?.message).toBe('declaration unwritable')
    expect(caught?.stage).toBe('transfer')
    expect(wrote).toBe(false)
  })

  it('a THROWING marker write is reported as the MARKER stage, with the transfer kept (Sol round 3)', () => {
    let caught = null
    try {
      commitSealedBoundary({
        transfer: { commit: () => 'feat/x@abcd' },
        marker: { v: 2 },
        write: () => {
          throw new Error('disk says no')
        },
      })
    } catch (e) {
      caught = e
    }
    // The transfer already stands — reporting "nothing recorded" here would
    // send the session to redo a done transfer and distrust a half-taken state.
    expect(caught?.stage).toBe('marker')
    expect(caught?.transferred).toBe('feat/x@abcd')
    expect(caught?.message).toBe('disk says no')
  })

  it('no transfer at all still writes the marker', () => {
    let marker = null
    expect(commitSealedBoundary({ transfer: null, marker: { v: 2, point: 675 }, write: (m) => (marker = m) })).toBeNull()
    expect(marker).toEqual({ v: 2, point: 675 })
  })

  it('a failed ownership handover names the stage and leaves the committed marker explicit', () => {
    let marker = null
    let caught = null
    try {
      commitSealedBoundary({
        marker: { v: 2, cause: 'context' },
        write: (m) => (marker = m),
        handover: () => ({ handed: false, reason: 'write-failed', error: new Error('lock busy') }),
      })
    } catch (e) {
      caught = e
    }
    expect(marker).toEqual({ v: 2, cause: 'context' })
    expect(caught?.stage).toBe('handover')
    expect(caught?.message).toBe('lock busy')
  })

  it('leaves the lock handed over even when an unrelated Stop duty blocks afterwards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'boundary-handover-'))
    const lockPath = join(dir, 'batch-lock.json')
    writeFileSync(lockPath, JSON.stringify({ sessionId: SID, claimedAt: NOW - 10_000, pid: process.pid }))
    try {
      commitSealedBoundary({
        marker: marker({ cause: 'context', point: null }),
        write: () => {},
        handover: () => markHandover(SID, { lockPath, point: null, now: NOW }),
      })
      const unrelated = evaluateRuleReview({ now: NOW, lastReviewedAt: null, sessionId: SID })
      expect(unrelated?.decision).toBe('block')
      expect(readOwnerLock(lockPath)).toMatchObject({ handedOver: true, handedOverAt: NOW, handoverPoint: null })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('boundaryCardText — the watermark variant says WHY (point 675)', () => {
  it('a context boundary names the watermark, not a closed point', () => {
    const text = boundaryCardText({ ...boundaryDestination({}), cause: 'context' })
    expect(text).toContain('Wasserstandsmarke')
    expect(text).not.toContain('Der Punkt ist abgeschlossen')
  })

  it('the point variant is untouched, and the claiming-window variant carries the head too', () => {
    expect(boundaryCardText({ ...boundaryDestination({}) })).toContain('Der Punkt ist abgeschlossen')
    expect(
      boundaryCardText({ ...boundaryDestination({ claimHonoured: true, claimantSid: 's' }), cause: 'context' }),
    ).toContain('Wasserstandsmarke')
  })
})

describe('progressGuardDecision — the context watermark demands a handover (point 675)', () => {
  const base = { sid: SID, paused: false, openCount: 3, formatSuspect: false, ownership: 'mine', unhandledAlert: false }

  it('past the watermark, an owner with no other verdict is told to hand over', () => {
    expect(progressGuardDecision({ ...base, contextPastWatermark: true })).toBe('block-context-handover')
  })

  it('a TRANSFERABLE wait does not shield the session from the watermark — the successor adopts', () => {
    expect(progressGuardDecision({ ...base, contextPastWatermark: true, inFlight: true })).toBe(
      'block-context-handover',
    )
  })

  it('NON-transferable work drains first — the safe degraded mode', () => {
    expect(
      progressGuardDecision({ ...base, contextPastWatermark: true, inFlight: true, inFlightTransferable: false }),
    ).toBe('allow-in-flight')
  })

  it('a due POINT boundary outranks the watermark, and a valid boundary still hands over', () => {
    expect(progressGuardDecision({ ...base, contextPastWatermark: true, boundaryDue: 675 })).toBe(
      'block-take-boundary',
    )
    expect(
      progressGuardDecision({
        ...base,
        contextPastWatermark: true,
        boundary: { valid: true, point: null, reason: 'context-boundary' },
        launcher: 'armed',
      }),
    ).toBe('allow-boundary')
  })

  it('never fires for a non-owner, a paused batch or an empty queue', () => {
    expect(progressGuardDecision({ ...base, ownership: 'held', contextPastWatermark: true })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, paused: true, contextPastWatermark: true })).toBe('allow')
    expect(progressGuardDecision({ ...base, openCount: 0, contextPastWatermark: true })).toBe('allow')
  })
})

// ---------------------------------------------------------------------------
// THE PREPARE RECEIPT (Sol's review of 4e93933): two phases are only two phases
// if the first one is required. `--commit --context` could be called with no
// `--prepare` at all — so the board card that says WHY the batch handed over
// could be skipped in silence — and the point commit checked only that the OLD
// current-work card was gone.
// ---------------------------------------------------------------------------
describe('unpreparedRefusal — --commit refuses what --prepare never prepared (point 675)', () => {
  const fresh = (over = {}) => ({ ...preparedReceipt({ sid: SID, point: 675, now: NOW - 1000 }), ...over })

  it('lets the matching receipt through, for both causes', () => {
    expect(unpreparedRefusal({ receipt: fresh(), sid: SID, point: 675, now: NOW })).toBeNull()
    expect(
      unpreparedRefusal({
        receipt: preparedReceipt({ sid: SID, cause: BOUNDARY_CAUSES.CONTEXT, now: NOW - 1000 }),
        sid: SID,
        cause: BOUNDARY_CAUSES.CONTEXT,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('refuses a MISSING receipt and names the one command that fixes it', () => {
    const point = unpreparedRefusal({ receipt: null, sid: SID, point: 675, now: NOW })
    expect(point).toContain('NOT PREPARED')
    expect(point).toContain('--prepare 675')
    // The context refusal must name the context form, or it sends the session
    // to a command that cannot prepare a watermark boundary.
    expect(
      unpreparedRefusal({ receipt: null, sid: SID, cause: BOUNDARY_CAUSES.CONTEXT, now: NOW }),
    ).toContain('--prepare --context --transcript')
  })

  it('reads the board through standingCards, and tells a failed reading from an empty one', () => {
    // Through the real function, not an injected shape: reverting it to a bare
    // array must fail here (Sol on 68d6b5e).
    const dir = mkdtempSync(join(tmpdir(), 'hoa-board-'))
    try {
      const path = join(dir, 'board.html')
      const cause = BOUNDARY_CAUSES.CONTEXT
      const destination = BOUNDARY_DESTINATIONS.FRESH_SESSION
      // A board that is not there at all — not the same as one without cards.
      expect(standingCards({ cause, destination, path })).toEqual({ readable: false, cards: [] })
      writeFileSync(path, '<details class="sect"><summary>Leer</summary></details>')
      expect(standingCards({ cause, destination, path })).toEqual({ readable: true, cards: [] })
      writeFileSync(
        path,
        `<details class="card"><p>${boundaryCardText({ destination, cause })}</p></details>`,
      )
      const seen = standingCards({ cause, destination, path })
      expect(seen.readable).toBe(true)
      expect(seen.cards).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('records WHETHER the board was read, not merely what it held (Sol on 456be8f)', () => {
    const read = preparedReceipt({
      sid: SID,
      point: 675,
      now: NOW,
      board: { readable: true, cards: ['<details class="card">…</details>'] },
    })
    expect(read.boardRead).toBe(true)
    expect(read.cardsBefore).toHaveLength(1)
    // An unreadable board leaves an empty list — and says that it is not the
    // same thing as a board with no cards on it.
    const unread = preparedReceipt({ sid: SID, point: 675, now: NOW, board: { readable: false, cards: [] } })
    expect(unread.boardRead).toBe(false)
    expect(unread.cardsBefore).toEqual([])
  })

  it('refuses a receipt of an OLDER SHAPE, and one whose destination has since changed (Sol on 7ecebed)', () => {
    // A v1 receipt carries no board reading, so the stale-card check would have
    // nothing to compare against — refused rather than silently downgraded.
    const legacy = { v: 1, sessionId: SID, cause: BOUNDARY_CAUSES.POINT, point: 675, at: NOW - 1000 }
    expect(unpreparedRefusal({ receipt: legacy, sid: SID, point: 675, now: NOW })).toContain('older shape')
    // …and so is a receipt of the PREVIOUS version, whose recorded regions were
    // cut differently and would no longer equal the ones read now.
    expect(
      unpreparedRefusal({ receipt: { ...fresh(), v: PREPARED_RECEIPT_V - 1 }, sid: SID, point: 675, now: NOW }),
    ).toContain('older shape')
    expect(
      unpreparedRefusal({ receipt: { ...fresh(), cardsBefore: 'nope' }, sid: SID, point: 675, now: NOW }),
    ).toContain('older shape')
    // …including an ARRAY whose contents are not card text: a Set built from it
    // would match no region, and every standing card would count as new.
    expect(
      unpreparedRefusal({ receipt: { ...fresh(), cardsBefore: [{ card: 'x' }] }, sid: SID, point: 675, now: NOW }),
    ).toContain('older shape')
    // A claim appearing between the phases changes the card's text, so the old
    // board reading no longer covers it.
    const prepared = preparedReceipt({
      sid: SID,
      point: 675,
      now: NOW - 1000,
      destination: BOUNDARY_DESTINATIONS.FRESH_SESSION,
    })
    expect(
      unpreparedRefusal({
        receipt: prepared,
        sid: SID,
        point: 675,
        destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW,
        now: NOW,
      }),
    ).toContain('goes elsewhere')
    expect(
      unpreparedRefusal({
        receipt: prepared,
        sid: SID,
        point: 675,
        destination: BOUNDARY_DESTINATIONS.FRESH_SESSION,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('refuses a FOREIGN, a STALE, a WRONG-CAUSE and a WRONG-POINT receipt', () => {
    expect(unpreparedRefusal({ receipt: fresh({ sessionId: 'other' }), sid: SID, point: 675, now: NOW })).toContain(
      'belongs to session other',
    )
    expect(
      unpreparedRefusal({ receipt: fresh({ at: NOW - BOUNDARY_FRESH_MS - 1 }), sid: SID, point: 675, now: NOW }),
    ).toContain('stale')
    // A context commit may not ride on a point preparation, whose bookkeeping
    // names a closed point rather than the watermark — and the reverse.
    expect(
      unpreparedRefusal({ receipt: fresh(), sid: SID, cause: BOUNDARY_CAUSES.CONTEXT, now: NOW }),
    ).toContain('POINT boundary')
    expect(unpreparedRefusal({ receipt: fresh(), sid: SID, point: 676, now: NOW })).toContain('point 675, not point 676')
  })

  it('is not satisfied by a receipt with no time at all', () => {
    expect(unpreparedRefusal({ receipt: fresh({ at: 'now-ish' }), sid: SID, point: 675, now: NOW })).toContain('stale')
    expect(unpreparedRefusal({ receipt: fresh({ at: NaN }), sid: SID, point: 675, now: NOW })).toContain('stale')
  })

  it('refuses a FUTURE-dated receipt — a forward stamp is not freshness', () => {
    expect(
      unpreparedRefusal({
        receipt: preparedReceipt({ sid: SID, point: 675, now: NOW + 60_000 }),
        sid: SID,
        point: 675,
        now: NOW,
      }),
    ).toContain('stale')
  })
})

describe('clearBoundary — a partial withdrawal leaves the SEAL, never the receipt (Sol on 389bbc7)', () => {
  const run = (failOn) => {
    const removed = []
    const out = clearBoundary('marker.json', {
      preparedPath: 'receipt.json',
      remove: (p) => {
        if (p === failOn) throw new Error('EPERM')
        removed.push(p)
      },
    })
    return { out, removed }
  }

  it('removes both, receipt first', () => {
    const { out, removed } = run(null)
    expect(out).toEqual({ marker: true, prepared: true })
    expect(removed).toEqual(['receipt.json', 'marker.json'])
  })

  it('keeps the MARKER when the receipt cannot go — the bypass is the other order', () => {
    // Marker gone + fresh receipt = no seal and a prepared commit: exactly what
    // the withdrawal must never leave behind.
    const { out, removed } = run('receipt.json')
    expect(out).toEqual({ marker: false, prepared: false })
    expect(removed).toEqual([])
  })

  it('reports a marker that could not be removed', () => {
    const { out } = run('marker.json')
    expect(out).toEqual({ marker: false, prepared: true })
  })
})

describe('markerFresh / boardCarriesCard — a forged stamp, an unannounced handover (Sol on ffa0a78)', () => {
  it('calls a FUTURE-dated marker unfresh at every predicate that reads one', () => {
    const future = marker({ at: NOW + 60_000 })
    expect(markerFresh(future, NOW)).toBe(false)
    // …so it authorises no stop…
    expect(assessBoundary({ marker: future, sid: SID, now: NOW, closure: 'closed' }).reason).toBe('marker-stale')
    // …and holds no seal either, which is the direction that cannot trap a session.
    expect(
      sealedBoundaryDeny({
        marker: { ...future, phase: 'committed' },
        sid: SID,
        now: NOW,
        toolName: 'Bash',
        command: 'git commit -m x',
      }).deny,
    ).toBe(false)
    expect(markerFresh(marker(), NOW)).toBe(true)
    expect(markerFresh({ at: 'soon' }, NOW)).toBe(false)
    expect(markerFresh(null, NOW)).toBe(false)
  })

  it('proves each real card by fragments that are actually in it — for both causes and both destinations', () => {
    for (const cause of [BOUNDARY_CAUSES.CONTEXT, BOUNDARY_CAUSES.POINT]) {
      for (const destination of [BOUNDARY_DESTINATIONS.FRESH_SESSION, BOUNDARY_DESTINATIONS.CLAIMING_WINDOW]) {
        const card = boundaryCardText({ destination, claimantSid: 'window-7', cause })
        const proof = boardCarriesCard(`<div><p>${card}</p></div>`, cardProofFragments({ cause, destination }))
        expect(proof).toEqual({ carries: true, verifiable: true, missing: [] })
      }
    }
    // The fragments stay ASCII: the card crosses the board's HTML, and a check
    // hanging on an umlaut would block a correct boundary the day it is escaped.
    for (const cause of [BOUNDARY_CAUSES.CONTEXT, BOUNDARY_CAUSES.POINT]) {
      for (const f of cardProofFragments({ cause, destination: BOUNDARY_DESTINATIONS.FRESH_SESSION })) {
        expect(f).toMatch(/^[\x20-\x7e]+$/)
      }
    }
  })

  it('refuses the WRONG card, and the wrong destination', () => {
    const pointCard = boundaryCardText({ destination: BOUNDARY_DESTINATIONS.FRESH_SESSION, cause: BOUNDARY_CAUSES.POINT })
    // A point card is no watermark card: it claims a closure that never happened.
    const asContext = boardCarriesCard(
      pointCard,
      cardProofFragments({ cause: BOUNDARY_CAUSES.CONTEXT, destination: BOUNDARY_DESTINATIONS.FRESH_SESSION }),
    )
    expect(asContext.carries).toBe(false)
    expect(asContext.missing[0]).toContain('Wasserstandsmarke')
    // …and a card announcing a fresh session does not prove one that must name
    // the claiming window the launcher will actually hand the batch to.
    expect(
      boardCarriesCard(
        pointCard,
        cardProofFragments({ cause: BOUNDARY_CAUSES.POINT, destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW }),
      ).carries,
    ).toBe(false)
  })

  it('will not assemble a card out of TWO ADJACENT cards on the board (Sol on 9f93aeb/1589da5)', () => {
    // A watermark card announcing a fresh session, IMMEDIATELY followed by a
    // point card that names a claiming window — the real markup, with no gap
    // manufactured between them. No card on this board is a watermark handover
    // to a claiming window, and the proof must not add the two together.
    const card = (cause, destination) =>
      `<details class="card"><summary>Übergabe</summary><p>${boundaryCardText({ destination, claimantSid: 'window-7', cause })}</p></details>`
    const board =
      `<details class="sect"><summary><h2>Aktuell</h2></summary>` +
      card(BOUNDARY_CAUSES.CONTEXT, BOUNDARY_DESTINATIONS.FRESH_SESSION) +
      card(BOUNDARY_CAUSES.POINT, BOUNDARY_DESTINATIONS.CLAIMING_WINDOW) +
      '</details>'
    const proof = boardCarriesCard(
      board,
      cardProofFragments({ cause: BOUNDARY_CAUSES.CONTEXT, destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW }),
    )
    expect(proof.carries).toBe(false)
    expect(proof.split).toBe(true)
    // …while each card that IS on it proves itself.
    expect(
      boardCarriesCard(
        board,
        cardProofFragments({ cause: BOUNDARY_CAUSES.CONTEXT, destination: BOUNDARY_DESTINATIONS.FRESH_SESSION }),
      ).carries,
    ).toBe(true)
    expect(
      boardCarriesCard(
        board,
        cardProofFragments({ cause: BOUNDARY_CAUSES.POINT, destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW }),
      ).carries,
    ).toBe(true)
  })

  it('reads the board stamp in BERLIN, whatever the machine is set to', () => {
    // 12:00 UTC on a summer day is 14:00 in Berlin; the board stamps that.
    expect(berlinMinuteOfDay(Date.UTC(2026, 7, 13, 12, 0))).toBe(14 * 60)
    expect(berlinMinuteOfDay(Date.UTC(2026, 0, 13, 12, 0))).toBe(13 * 60)
  })

  it('falls back to one card\'s length on a board with no card markup', () => {
    const plain =
      boundaryCardText({ destination: BOUNDARY_DESTINATIONS.FRESH_SESSION, cause: BOUNDARY_CAUSES.CONTEXT }) +
      '\n'.padEnd(CARD_PROOF_WINDOW, '.') +
      boundaryCardText({ destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW, claimantSid: 'w', cause: BOUNDARY_CAUSES.POINT })
    expect(
      boardCarriesCard(
        plain,
        cardProofFragments({ cause: BOUNDARY_CAUSES.CONTEXT, destination: BOUNDARY_DESTINATIONS.CLAIMING_WINDOW }),
      ).carries,
    ).toBe(false)
    expect(
      boardCarriesCard(
        plain,
        cardProofFragments({ cause: BOUNDARY_CAUSES.CONTEXT, destination: BOUNDARY_DESTINATIONS.FRESH_SESSION }),
      ).carries,
    ).toBe(true)
  })

  const stamped = (hhmm) =>
    `<details class="card"><summary>Übergabe</summary><p><span class="stamp">Stand ${hhmm}</span> ` +
    `${boundaryCardText({ destination: BOUNDARY_DESTINATIONS.FRESH_SESSION, cause: BOUNDARY_CAUSES.CONTEXT })}</p></details>`
  const frags = cardProofFragments({
    cause: BOUNDARY_CAUSES.CONTEXT,
    destination: BOUNDARY_DESTINATIONS.FRESH_SESSION,
  })

  it('refuses the card the preparation ALREADY SAW, whatever its stamp reads (Sol on bcf820c)', () => {
    // The undated `HH:MM` can alias — the rollback night has two 02:10s, and
    // yesterday's card can fall inside today's interval. What cannot alias is
    // that the preparation already found this exact card on the board.
    const leftover = stamped('02:10')
    const prepared = Date.UTC(2026, 9, 25, 0, 55)
    const now = Date.UTC(2026, 9, 25, 1, 10)
    const known = cardRegions(leftover, frags)
    expect(known.length).toBe(1)
    const stale = boardCarriesCard(leftover, frags, { sinceMs: prepared, nowMs: now, knownRegions: known })
    expect(stale.carries).toBe(false)
    expect(stale.stale).toBe(true)
    // The card put up AFTER the preparation is a different region — even one
    // minute later, since the stamp is part of it.
    expect(
      boardCarriesCard(stamped('02:11'), frags, { sinceMs: prepared, nowMs: now, knownRegions: known }).carries,
    ).toBe(true)
    // A board that carried no such card at preparation time proves it outright.
    expect(boardCarriesCard(leftover, frags, { sinceMs: prepared, nowMs: now, knownRegions: [] }).carries).toBe(true)
    // …but a reading that records something which is no card at all is BROKEN,
    // not empty: it would match nothing and wave every leftover through.
    // Every fragment must be there, not just the head: a recorded string that
    // carries only the head matches no real region either.
    for (const bogus of [['not a card'], [''], [42], [frags[0]]]) {
      const broken = boardCarriesCard(leftover, frags, { sinceMs: prepared, nowMs: now, knownRegions: bogus })
      expect(broken.carries).toBe(false)
      expect(broken.malformedKnown).toBe(true)
    }
  })

  it('cuts the region back to the CARD, so an edit around it does not make a stale card look new (Sol on 04cea00)', () => {
    const section = (head) => `<details class="sect"><summary><h2>${head}</h2></summary>${stamped('02:10')}</details>`
    const known = cardRegions(section('Aktuell'), frags)
    expect(known.length).toBe(1)
    expect(known[0].startsWith('<details class="card"')).toBe(true)
    // The section header changes; the card does not — and it is still the card
    // the preparation saw.
    const proof = boardCarriesCard(section('Aktuelle Arbeit'), frags, {
      sinceMs: Date.UTC(2026, 9, 25, 0, 55),
      nowMs: Date.UTC(2026, 9, 25, 1, 10),
      knownRegions: known,
    })
    expect(proof.carries).toBe(false)
    expect(proof.stale).toBe(true)
  })

  it('refuses the card the PREVIOUS handover left standing (Sol on 9096fb7)', () => {
    // 13.08.2026, 14:30 Berlin (CEST = UTC+2) — the preparation; the commit
    // seventeen minutes later.
    const prepared = Date.UTC(2026, 7, 13, 12, 30)
    const now = Date.UTC(2026, 7, 13, 12, 47)
    const at = (hhmm) => boardCarriesCard(stamped(hhmm), frags, { sinceMs: prepared, nowMs: now })
    // Stamped before this preparation → the last handover's card.
    expect(at('11:05').carries).toBe(false)
    expect(at('11:05').stale).toBe(true)
    // Stamped between the preparation and the commit → this handover's.
    expect(at('14:30').carries).toBe(true)
    expect(at('14:38').carries).toBe(true)
    expect(at('14:47').carries).toBe(true)
    // A stamp AFTER the commit resolves to the day BEFORE and is refused, as is
    // yesterday's card at the very same minute — the arc the fixed window let
    // through (Sol on 46c994e).
    expect(at('14:52').carries).toBe(false)
    expect(at('15:40').carries).toBe(false)
    // Across midnight the card is still the newer one.
    expect(
      boardCarriesCard(stamped('00:10'), frags, {
        sinceMs: Date.UTC(2026, 7, 13, 21, 55),
        nowMs: Date.UTC(2026, 7, 13, 22, 15),
      }).carries,
    ).toBe(true)
    // …and with no preparation time to compare against, the stamp decides nothing.
    expect(boardCarriesCard(stamped('01:00'), frags, { sinceMs: null }).carries).toBe(true)
  })

  it('survives the DST ROLLBACK, where 02:00–03:00 happens twice (Sol on 9dcc783)', () => {
    // 25.10.2026: 03:00 CEST becomes 02:00 CET. Preparation at the FIRST 02:55
    // (00:55 UTC), commit at the SECOND 02:10 (01:10 UTC) — fifteen real
    // minutes, which a clock-face arc reads as almost a whole day.
    const prepared = Date.UTC(2026, 9, 25, 0, 55)
    const now = Date.UTC(2026, 9, 25, 1, 10)
    const at = (hhmm) => boardCarriesCard(stamped(hhmm), frags, { sinceMs: prepared, nowMs: now })
    // The card written in those fifteen minutes counts…
    expect(at('02:10').carries).toBe(true)
    expect(at('02:55').carries).toBe(true)
    // …and the stale card of the same night does not.
    expect(at('01:00').carries).toBe(false)
    expect(at('23:30').carries).toBe(false)
  })

  it('does not let an UNSTAMPED card prove currency where the board stamps at all', () => {
    const prepared = Date.UTC(2026, 7, 13, 12, 30)
    // The board stamps its cards, so a matching region without one is not proof.
    expect(cardStampIsCurrent('<p>no stamp here</p>', { sinceMs: prepared, boardStamps: true })).toBe(false)
    // A board that stamps nothing at all is a format without stamps — passing
    // there, because a boundary check may not trap a session on a format change.
    expect(cardStampIsCurrent('<p>no stamp here</p>', { sinceMs: prepared, boardStamps: false })).toBe(true)
    const card =
      `<details class="card"><p>${boundaryCardText({ destination: BOUNDARY_DESTINATIONS.FRESH_SESSION, cause: BOUNDARY_CAUSES.CONTEXT })}</p></details>`
    const frags = cardProofFragments({
      cause: BOUNDARY_CAUSES.CONTEXT,
      destination: BOUNDARY_DESTINATIONS.FRESH_SESSION,
    })
    expect(boardCarriesCard(card, frags, { sinceMs: prepared, nowMs: prepared }).carries).toBe(true)
    expect(
      boardCarriesCard(`<details class="card"><p><span class="stamp">Stand 09:00</span> x</p></details>${card}`, frags, {
        sinceMs: prepared,
        nowMs: prepared,
      }).carries,
    ).toBe(false)
  })

  it('never traps on a board it cannot read — but says it could not verify', () => {
    for (const text of ['', '   ', null, undefined, 42]) {
      expect(boardCarriesCard(text, cardProofFragments({}))).toEqual({
        carries: true,
        verifiable: false,
        missing: [],
      })
    }
  })
})
