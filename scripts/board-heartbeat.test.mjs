// The heartbeat's I/O half (point 848): what it reads, what it writes, and the
// promise that it never takes its caller down. Every dependency is injected, so
// no case touches the real board, its branch or the network.
import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boardRoot, heartbeat, readCard, runBoardStatus, TRIGGERS } from './board-heartbeat.mjs'
import { REASONS, STALE_AFTER_MS } from './board-heartbeat-core.mjs'
import { BOARD_WRITE_TIMEOUT_MS } from './board-heartbeat.mjs'

const FOCUS = { point: 847, note: 'Sol-Prüfrunden zu Punkt 847' }
const NOW = 1_700_000_000_000

/** A now-card of `point` that has stood unchanged for `ms`. The age is a record
 *  of when this exact content was first seen, never a stamp read off the card —
 *  see the core's cardAge for why a time-only stamp cannot carry it. */
const stood = (ms, point = 847) => ({
  card: { point, digest: 'd' },
  memory: Number.isFinite(ms) ? { digest: 'd', seenAt: NOW - ms } : null,
  now: NOW,
  remember: () => {},
})

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
      ...stood(STALE_AFTER_MS + 1),
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
      ...stood(1_000),
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
      state: { pagesPublishedAt: NOW, dashboardPath: '.batch-dashboard.html' },
      focus: FOCUS,
      ...stood(60 * 60_000),
      writeStatus: write,
    })
    expect(result.refreshed).toBe(true)
    expect(result.reason).toBe(REASONS.STALE)
    expect(calls).toHaveLength(1)
  })

})

describe('the production card reader, against real board markup', () => {
  // THE GAP THE SECOND ROUND FOUND: every behavioural case above injects `card`,
  // so breaking the real reader — or swapping it back for a publish timestamp —
  // would have left this suite green. These cases drive readCard and heartbeat
  // through an actual board file on disk.
  const board = (point, status, stamp) =>
    `<main>
<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>
<details class="now">
  <summary><span class="num">${point}</span><span class="t">Ein Titel</span><span class="right"><span class="meta">10:02 · ~12:02</span></span></summary>
  <div class="body">
    <p><span class="stamp">Stand ${stamp}</span> ${status}</p>
  </div>
</details>
</details>
</main>`

  const withBoard = (html) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-heartbeat-'))
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.batch-dashboard.html'), html)
    return dir
  }

  it('reads the now-card\'s point and a digest of its content', () => {
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    try {
      const seen = readCard({ dashboardPath: '.batch-dashboard.html' }, dir)
      expect(seen.ok).toBe(true)
      expect(seen.point).toBe(848)
      expect(seen.digest).toMatch(/^[0-9a-f]{64}$/)
      // The digest follows the card's TEXT, not just its identity.
      const other = readCard({ dashboardPath: '.batch-dashboard.html' }, withBoard(board(848, 'ein anderer Stand', '10:17')))
      expect(other.digest).not.toBe(seen.digest)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('drives the whole read path: unseen card, then unchanged, then stale', () => {
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    try {
      const NOW = 1_700_000_000_000
      const state = { dashboardPath: '.batch-dashboard.html' }
      const focus = { point: 848, note: 'Fokus' }
      const kept = []
      const calls = []
      const run = (now, memory) =>
        heartbeat({
          trigger: TRIGGERS.REVIEW_ROUND,
          detail: 'Runde',
          root: dir,
          state,
          focus,
          now,
          memory,
          remember: (value) => kept.push(value),
          writeStatus: (point, status) => calls.push({ point, status }),
        })

      // Never looked: unprovable, so it refreshes — and records ONLY after the
      // board moved, stamping the moment it knows because it just wrote it.
      const first = run(NOW, null)
      expect(first.refreshed).toBe(true)
      expect(first.reason).toBe(REASONS.NEVER_STAMPED)
      expect(kept).toHaveLength(1)
      expect(kept[0].seenAt).toBe(NOW)
      const seen = kept.at(-1)

      // The same card a minute later: current, nothing written.
      expect(run(NOW + 60_000, seen).reason).toBe(REASONS.CURRENT)
      expect(calls).toHaveLength(1)

      // The same card long after: stale, and carried.
      expect(run(NOW + STALE_AFTER_MS + 1, seen).reason).toBe(REASONS.STALE)
      expect(calls).toHaveLength(2)
      expect(calls[1]).toEqual({ point: 848, status: 'Fokus · Runde' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses readable HTML that names no now-card it can identify', () => {
    // FIFTH ROUND: "the file opened" is not "I know which card the board shows".
    // Acting on this would write to the focus point without ever having read a
    // card — the mismatch refusal bypassed by a parse failure instead of an
    // unreadable file.
    const dir = withBoard('<main><p>kein Karten-Markup</p></main>')
    try {
      const seen = readCard({ dashboardPath: '.batch-dashboard.html' }, dir)
      expect(seen.ok).toBe(false)

      const calls = []
      const said = []
      const result = heartbeat({
        trigger: TRIGGERS.REVIEW_ROUND,
        detail: 'Runde',
        root: dir,
        state: { dashboardPath: '.batch-dashboard.html' },
        focus: { point: 848, note: 'Fokus' },
        now: 1_700_000_000_000,
        memory: null,
        remember: () => {},
        writeStatus: (point, status) => calls.push({ point, status }),
        stderr: (line) => said.push(line),
      })
      expect(result.refreshed).toBe(false)
      expect(result.reason).toBe('board-unreadable')
      expect(calls).toEqual([])
      expect(said.join('\n')).toMatch(/no now-card could be read/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('says so when the card was written but cannot be read back', () => {
    // The write succeeded; the reread did not. Claiming a silent success here
    // would assert a reread that never happened, and recording an empty digest
    // would be worse than recording nothing (fifth cross-vendor round).
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    try {
      const kept = []
      const said = []
      const result = heartbeat({
        trigger: TRIGGERS.REVIEW_ROUND,
        detail: 'Runde',
        root: dir,
        state: { dashboardPath: '.batch-dashboard.html' },
        focus: { point: 848, note: 'Fokus' },
        now: 1_700_000_000_000,
        memory: null,
        remember: (value) => kept.push(value),
        // A writer that leaves the board unreadable behind it.
        writeStatus: () => writeFileSync(join(dir, '.batch-dashboard.html'), '<main>weg</main>'),
        stderr: (line) => said.push(line),
      })
      expect(result.refreshed).toBe(true)
      expect(result.reread).toBe(false)
      expect(said.join('\n')).toMatch(/written but could not be read back/)
      // NOTHING was recorded: the pre-write observation waits for the write, and
      // the reread that would have replaced it failed. The next look therefore
      // has no record at all and treats the age as unknown.
      expect(kept).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a failed write records NOTHING, so the next trigger retries at once', () => {
    // SIXTH ROUND: recording the observation before the write stamped the stale
    // card as seen just now, so a failed write made the next heartbeat call it
    // current and suppressed the retry for ten minutes — the refresh silencing
    // itself precisely when it had not happened.
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    try {
      const NOW = 1_700_000_000_000
      const kept = []
      const attempts = []
      const run = (memory, fail) =>
        heartbeat({
          trigger: TRIGGERS.REVIEW_ROUND,
          detail: 'Runde',
          root: dir,
          state: { dashboardPath: '.batch-dashboard.html' },
          focus: { point: 848, note: 'Fokus' },
          now: NOW,
          memory,
          remember: (value) => kept.push(value),
          writeStatus: () => {
            attempts.push(1)
            if (fail) throw new Error('publish refused')
          },
          stderr: () => {},
        })

      const failed = run(null, true)
      expect(failed.refreshed).toBe(false)
      expect(failed.reason).toBe('failed')
      expect(kept).toEqual([])

      // The very next trigger tries again rather than waiting out a threshold.
      const retried = run(null, false)
      expect(retried.refreshed).toBe(true)
      expect(attempts).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('SAYS SO when the record cannot be written — that is a republish loop', () => {
    // A record that never persists leaves every later look with no memory of the
    // card, so each finds the age unknown, calls it stale and publishes again.
    // Swallowing that silently hides a loop nothing else explains.
    const said = []
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    let result
    try {
      result = heartbeat({
        trigger: TRIGGERS.REVIEW_ROUND,
        detail: 'Runde',
        root: dir,
        state: { dashboardPath: '.batch-dashboard.html' },
        focus: { point: 848, note: 'Fokus' },
        now: 1_700_000_000_000,
        memory: null,
        remember: () => {
          throw new Error('EROFS: read-only file system')
        },
        writeStatus: () => {},
        stderr: (line) => said.push(line),
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    // The work still counts: the board was written, only the memory of it failed.
    expect(result.refreshed).toBe(true)
    expect(said.join('\n')).toMatch(/card record could not be written/)
    expect(said.join('\n')).toMatch(/republish/)
    expect(said.join('\n')).toMatch(/EROFS/)
  })

  it('a refusal does not make the next valid trigger skip its refresh', () => {
    // NINTH ROUND: a no-focus or mismatched refusal used to persist its first
    // sight as "seen now". The next trigger — with a proper focus — then found
    // the unchanged card fresh and published nothing, so the refusal had
    // silently consumed the refresh it never performed.
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    try {
      const NOW = 1_700_000_000_000
      const state = { dashboardPath: '.batch-dashboard.html' }
      let stored = null
      const calls = []
      const run = (focus) =>
        heartbeat({
          trigger: TRIGGERS.REVIEW_ROUND,
          detail: 'Runde',
          root: dir,
          state,
          focus,
          now: NOW,
          memory: stored,
          remember: (value) => {
            stored = value
          },
          writeStatus: (point, status) => calls.push({ point, status }),
        })

      // Refused: the focus names another card than the board does.
      expect(run({ point: 720, note: 'anderswo' }).reason).toBe(REASONS.CARD_MISMATCH)
      expect(calls).toEqual([])

      // The very next valid trigger still refreshes: the age was never proven.
      const valid = run({ point: 848, note: 'Fokus' })
      expect(valid.refreshed).toBe(true)
      expect(calls).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a card rewritten by somebody else reads as current, not as stale', () => {
    const dir = withBoard(board(848, 'ein Stand', '10:17'))
    try {
      const calls = []
      const result = heartbeat({
        trigger: TRIGGERS.MECHANISM_RECORD,
        detail: 'Prüfung',
        root: dir,
        state: { dashboardPath: '.batch-dashboard.html' },
        focus: { point: 848, note: 'Fokus' },
        now: 1_700_000_000_000,
        // A record of a DIFFERENT card written moments ago: the change is bounded
        // to that span, so the card is current.
        memory: { digest: 'ein anderer Kartenstand', seenAt: 1_700_000_000_000 - 1_000 },
        remember: () => {},
        writeStatus: (point, status) => calls.push({ point, status }),
      })
      expect(result.refreshed).toBe(false)
      expect(result.reason).toBe(REASONS.CURRENT)
      expect(calls).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('what it refuses, and what it survives', () => {
  it('has no card to carry when neither the focus nor the board names a point', () => {
    const { calls, write } = recorder()
    const kept = []
    const result = heartbeat({
      trigger: TRIGGERS.MECHANISM_RECORD,
      detail: 'Prüfung aufgezeichnet',
      focus: { point: null, note: 'Abschluss vorbereiten' },
      ...stood(STALE_AFTER_MS + 1, null),
      // No record yet, so this observation IS new information worth keeping.
      memory: null,
      remember: (value) => kept.push(value),
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('no-target')
    expect(calls).toEqual([])
    // A FIRST SIGHT is not written down on a no-write path: that would claim the
    // card was current now and let the next valid trigger skip its refresh.
    expect(kept).toEqual([])
  })

  it('NEVER throws when the board write fails — the caller recorded real work', () => {
    const said = []
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
      focus: FOCUS,
      ...stood(STALE_AFTER_MS + 1),
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
      ...stood(null),
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
      ...stood(STALE_AFTER_MS + 1, 720),
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe(REASONS.CARD_MISMATCH)
    expect(calls).toEqual([])
  })

  it('writes NOTHING against a board it could not read', () => {
    // FAIL CLOSED (third cross-vendor round, 24.08.2026). An unreadable board is
    // not a board without a now-card: if the two collapse, the mismatch refusal
    // is bypassed and the focus point gets restamped while the real now-card
    // names another. This case used to assert the opposite.
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.IN_FLIGHT,
      detail: 'Wartestellung',
      state: { dashboardPath: 'does/not/exist.html' },
      focus: FOCUS,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('board-unreadable')
    expect(calls).toEqual([])
  })

  it('SAYS SO when the board cannot be read — a silent refusal is not reporting', () => {
    const said = []
    heartbeat({
      trigger: TRIGGERS.IN_FLIGHT,
      detail: 'Wartestellung',
      state: { dashboardPath: 'does/not/exist.html' },
      focus: FOCUS,
      writeStatus: () => {},
      stderr: (line) => said.push(line),
    })
    expect(said.join('\n')).toMatch(/no now-card could be read/)
  })

  it('refuses a state that names no board at all', () => {
    const { calls, write } = recorder()
    const result = heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde',
      state: {},
      focus: FOCUS,
      writeStatus: write,
    })
    expect(result.refreshed).toBe(false)
    expect(result.reason).toBe('board-unreadable')
    expect(calls).toEqual([])
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

  it('caps the wait, so a wedged publish cannot hold the recording step', () => {
    // The caller awaits this. Without a cap a hung git push or child would keep
    // a recorded review from reaching its exit (fourth cross-vendor round).
    const { seen, spawn } = capture({ status: 0, stdout: '' })
    runBoardStatus(848, 'x', { spawn })
    expect(seen[0].opts.timeout).toBe(BOARD_WRITE_TIMEOUT_MS)
  })

  it('treats a child killed on the timeout as a failure, not as success', () => {
    // spawnSync reports a timeout kill as a signal with no error object, so a
    // bare status check would read SIGTERM-with-status-null as "fine".
    const { spawn } = capture({ status: null, signal: 'SIGTERM' })
    expect(() => runBoardStatus(848, 'x', { spawn, timeout: 5 })).toThrow(/killed after 5 ms/)
  })
})

describe('the board belongs to the owning checkout', () => {
  // A review round is routinely run from a DELEGATED WORKTREE, which holds no
  // board, no dashboard state and no focus of its own. Resolving to the main
  // checkout is what keeps the heartbeat from silently doing nothing there —
  // the same resolution review-sol uses for its saved login.
  it('resolves a worktree to the main checkout that holds the board', () => {
    const root = boardRoot({
      root: '/repo/.worktrees/point-848',
      run: () => '/repo/.git',
    })
    expect(root).toBe('/repo')
  })

  it('stays in the current checkout when it IS the main one', () => {
    expect(boardRoot({ root: '/repo', run: () => '/repo/.git' })).toBe('/repo')
  })

  it('falls back to the current checkout when git cannot answer', () => {
    expect(boardRoot({ root: '/repo/x', run: () => '' })).toBe('/repo/x')
  })

  it('hands the owning checkout to the writer, so the board is edited where it lives', () => {
    const seen = []
    heartbeat({
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
      root: '/repo',
      state: { dashboardPath: '.batch-dashboard.html' },
      focus: FOCUS,
      ...stood(STALE_AFTER_MS + 1),
      writeStatus: (point, status, opts) => seen.push({ point, root: opts?.root }),
    })
    expect(seen).toEqual([{ point: 847, root: '/repo' }])
  })
})
