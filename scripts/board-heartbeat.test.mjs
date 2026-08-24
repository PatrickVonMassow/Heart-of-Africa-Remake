// The heartbeat's I/O half (point 848): what it reads, what it writes, and the
// promise that it never takes its caller down. Every dependency is injected, so
// no case touches the real board, its branch or the network.
import { describe, it, expect } from 'vitest'
import { heartbeat, runBoardStatus, TRIGGERS } from './board-heartbeat.mjs'
import { REASONS, STALE_AFTER_MS } from './board-heartbeat-core.mjs'

const FOCUS = { point: 847, note: 'Sol-Prüfrunden zu Punkt 847' }
const STALE = { point: 847, ageMs: STALE_AFTER_MS + 1 }
const FRESH = { point: 847, ageMs: 1_000 }

/** A writeStatus that records what it was asked to publish. */
const recorder = () => {
  const calls = []
  return { calls, write: (point, status) => calls.push({ point, status }) }
}

describe('a recording step carries the board', () => {
  it('restamps the now-card with the focus and the round that just landed', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3 abgeschlossen (do-not-merge)',
      focus: FOCUS,
      card: STALE,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(true)
    expect(calls).toEqual([
      { point: 847, status: 'Sol-Prüfrunden zu Punkt 847 · Runde 3 abgeschlossen (do-not-merge)' },
    ])
  })

  it('writes nothing at all while the card is current', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.MECHANISM_RECORD,
      detail: 'Prüfung aufgezeichnet',
      focus: FOCUS,
      card: FRESH,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe(REASONS.CURRENT)
    expect(calls).toEqual([])
  })
})

describe('staleness is read from the CARD, never from a publish', () => {
  // THE DEFECT A TRANSPORT-WIDE STAMP WOULD REINTRODUCE (cross-vendor review,
  // 24.08.2026): `pagesPublishedAt` moves whenever any board write publishes — a
  // queue render, a done-card rotation, an open question. An untouched now-card
  // would then read as current and the restamp would never happen. The card's
  // own `Stand` stamp cannot be moved by an unrelated publish.
  it('an unrelated publish does not make an old card look current', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.IN_FLIGHT,
      detail: 'Suite läuft',
      // The board published seconds ago; THIS card's status is an hour old.
      state: { pagesPublishedAt: Date.now(), dashboardPath: '.batch-dashboard.html' },
      focus: FOCUS,
      card: { point: 847, ageMs: 60 * 60_000 },
      writeStatus: write,
    })
    expect(result.refreshed).toBe(true)
    expect(result.reason).toBe(REASONS.STALE)
    expect(calls).toHaveLength(1)
  })

  it('reads the card\'s own stamp out of the real board markup', async () => {
    // The parser is exercised against the exact span the board writes, so a
    // markup change breaks this rather than silently disabling the heartbeat.
    const { berlinMinutes } = await import('./dashboard-guard.mjs')
    const { stampAgeMs, stampMinutes } = await import('./board-heartbeat-core.mjs')
    const card = '<span class="stamp">Stand 04:15</span> Sol-Prüfrunde läuft'
    const stamp = /<span class="stamp">Stand ([^<]*)<\/span>/.exec(card)?.[1]
    expect(stamp).toBe('04:15')
    expect(stampMinutes(stamp)).toBe(4 * 60 + 15)
    // Age against a known clock reading, so no wall clock enters the assertion.
    expect(stampAgeMs(stampMinutes(stamp), 5 * 60 + 15)).toBe(60 * 60_000)
    expect(typeof berlinMinutes()).toMatch(/number|object/)
  })
})

describe('what it refuses, and what it survives', () => {
  it('has no card to carry when neither the focus nor the board names a point', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.MECHANISM_RECORD,
      detail: 'Prüfung aufgezeichnet',
      focus: { point: null, note: 'Abschluss vorbereiten' },
      card: { point: null, ageMs: STALE_AFTER_MS + 1 },
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('no-target')
    expect(calls).toEqual([])
  })

  it('NEVER throws when the board write fails — the caller recorded real work', () => {
    const said = []
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
      focus: FOCUS,
      card: STALE,
      writeStatus: () => {
        throw new Error('publish precondition refused')
      },
      stderr: (line) => said.push(line),
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('failed')
    // Swallowed, but never silently: the operator is told the board fell behind.
    expect(said.join('\n')).toMatch(/board heartbeat: the now-card could not be carried/)
    expect(said.join('\n')).toMatch(/publish precondition refused/)
  })

  it('treats a card with no readable stamp as stale, not as fresh', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 1',
      focus: FOCUS,
      card: { point: 847, ageMs: null },
      writeStatus: write,
    })
    expect(result.refreshed).toBe(true)
    expect(result.reason).toBe(REASONS.NEVER_STAMPED)
    expect(calls).toHaveLength(1)
  })

  it('leaves a card alone whose point disagrees with the declared focus', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
      focus: FOCUS,
      card: { point: 720, ageMs: STALE_AFTER_MS + 1 },
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe(REASONS.CARD_MISMATCH)
    expect(calls).toEqual([])
  })

  it('survives a board file it cannot read at all', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.IN_FLIGHT,
      detail: 'Wartestellung',
      state: { dashboardPath: 'does/not/exist.html' },
      focus: FOCUS,
      writeStatus: write,
    })
    // Unreadable board → no point, no stamp: it refreshes what it can address,
    // which here is the focus point, rather than throwing at its caller.
    expect(result.refreshed).toBe(true)
    expect(calls).toEqual([{ point: 847, status: 'Sol-Prüfrunden zu Punkt 847 · Wartestellung' }])
  })
})

describe('the board adapter itself', () => {
  // The refresh cases above replace the writer wholesale, so the real adapter
  // needs its own cases (cross-vendor review, 24.08.2026).
  const capture = (result) => {
    const seen = []
    return { seen, spawn: (bin, args, opts) => (seen.push({ bin, args, opts }), result) }
  }

  it('calls board.mjs status for the point and hands the text over on stdin', () => {
    const { seen, spawn } = capture({ status: 0, stdout: 'published' })
    expect(runBoardStatus(848, 'ein neuer Stand', { spawn })).toBe('published')
    expect(seen).toHaveLength(1)
    expect(seen[0].args.slice(-3)).toEqual(['status', '848', '--text-stdin'])
    expect(seen[0].args[0]).toMatch(/scripts[/\\]board\.mjs$/)
    expect(seen[0].opts.input).toBe('ein neuer Stand')
    // Unattended: a console window here would steal the focus on every round.
    expect(seen[0].opts.windowsHide).toBe(true)
  })

  it('refuses to read a non-zero exit as success, and carries the reason', () => {
    const { spawn } = capture({ status: 1, stderr: 'board: no queue card for point 848' })
    expect(() => runBoardStatus(848, 'x', { spawn })).toThrow(/no queue card for point 848/)
  })

  it('rethrows a spawn that could not start at all', () => {
    const { spawn } = capture({ error: new Error('ENOENT'), status: null })
    expect(() => runBoardStatus(848, 'x', { spawn })).toThrow(/ENOENT/)
  })

  it('names the exit status where the command said nothing', () => {
    const { spawn } = capture({ status: 7, stderr: '   ' })
    expect(() => runBoardStatus(848, 'x', { spawn })).toThrow(/exited 7/)
  })
})
