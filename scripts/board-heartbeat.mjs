// The I/O half of the IN-TURN BOARD HEARTBEAT (point 848). The rules live in
// scripts/board-heartbeat-core.mjs; this reads the declared focus and the board's
// last live publish, and where the core says so, restamps the now-card through
// the ordinary board command and republishes.
//
// CALLED BY THE RECORDING STEPS, NEVER BY A CLOCK: review-sol.mjs when a round
// comes back, mechanism-review.mjs when a verdict is recorded, batch-in-flight.mjs
// when a wait is declared or refreshed. Each of those already happens repeatedly
// inside the long turns that used to leave the board standing still.
//
// IT FAILS SOFT, ALWAYS. A heartbeat is bookkeeping about work, never the work:
// a board that cannot be published must not take a recorded review down with it.
// Every failure is reported on stderr and swallowed, and the caller's own exit
// status is untouched.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { REPO_ROOT, STATE_PATH, FOCUS_PATH, readJson, writeJsonAtomic } from './dashboard-state.mjs'
import { parseNowCardPoint } from './dashboard-guard-core.mjs'
import { nowCard } from './board-core.mjs'
import { mainCheckoutFrom } from './main-checkout-core.mjs'
import { cardAge, decideHeartbeat, TRIGGERS } from './board-heartbeat-core.mjs'

export { TRIGGERS }

/**
 * The checkout that OWNS the board.
 *
 * The board file and its state live in the main working tree, while review
 * rounds are routinely run from a delegated worktree — and there the heartbeat
 * would find no board, decide nothing and silently do nothing at all. This is
 * the same resolution `review-sol` uses for the saved login: `--git-common-dir`
 * points at the one real `.git` directory from every worktree alike, and with
 * no git answer the current checkout is the honest fallback.
 */
export function boardRoot({ root = REPO_ROOT, run = gitCommonDir } = {}) {
  return mainCheckoutFrom(run(root), root) ?? root
}

/** `git rev-parse --git-common-dir`, absolute, or '' when git cannot answer. */
function gitCommonDir(root) {
  try {
    return String(
      execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      }),
    ).trim()
  } catch {
    return ''
  }
}

/**
 * The now-card as the board actually shows it: its title point, and how long its
 * own `Stand HH:MM` status stamp has stood.
 *
 * READ FROM THE CARD, NEVER FROM A PUBLISH TIMESTAMP. A transport-wide stamp
 * such as `pagesPublishedAt` moves whenever ANY board write publishes — a queue
 * render, a done-card rotation, an open question — so an untouched now-card
 * would read as current and the restamp this exists for would be suppressed
 * (cross-vendor review, 24.08.2026). The card's own stamp answers the only
 * question that matters: when was THIS status written.
 */
export function readCard(state, root) {
  try {
    if (!state?.dashboardPath) return { ok: false, point: null, digest: '' }
    const html = readFileSync(resolve(root, state.dashboardPath), 'utf8')
    const point = parseNowCardPoint(html)
    const card = point == null ? null : nowCard(html, point)
    // `ok` MEANS THE NOW-CARD WAS FOUND, not merely that the file opened. A
    // board whose markup names no card the reader can identify is exactly as
    // unusable as one that would not open: acting on it would mean writing to
    // the focus point without knowing which card the board actually names, and
    // that is the mismatch refusal bypassed (fifth cross-vendor round).
    if (card == null) return { ok: false, point, digest: '' }
    // The WHOLE card is the content: its status line, its stamp and its title.
    // Anything that rewrites any of them is a card the reader has not seen.
    return { ok: true, point, digest: createHash('sha256').update(card).digest('hex') }
  } catch {
    // FAIL CLOSED, and say which failure this is. A board that could not be read
    // is not a board without a now-card: collapsing the two let an unreadable
    // file bypass the card/focus mismatch refusal and restamp the focus point
    // while the real now-card named another (third cross-vendor round).
    return { ok: false, point: null, digest: '' }
  }
}

/**
 * How long the board write may take before it is abandoned.
 *
 * CALIBRATABLE. A publish is a git push and an HTTPS read-back, so seconds are
 * normal and a minute is already pathological — and the whole point of the cap
 * is that the recording step it hangs off never waits longer than that.
 */
export const BOARD_WRITE_TIMEOUT_MS = 60_000

/** Where this module remembers the card it last saw. Its OWN file: the shared
 *  dashboard state is written by many commands, and a read-modify-write from
 *  here would race them for no reason. */
const memoryPath = (root) => resolve(root, '.claude', 'board-heartbeat.json')

/**
 * Restamp the now-card through the ordinary board command, which owns the edit,
 * the archive rotation and the publish in one step.
 *
 * The spawn is injectable so this adapter is exercised for real rather than
 * replaced wholesale by the tests around it (cross-vendor review, 24.08.2026):
 * the argv it builds, the text it hands over on stdin and its refusal to treat
 * a non-zero exit as success are the behaviour, not incidental detail.
 */
export function runBoardStatus(
  point,
  status,
  { spawn = spawnSync, root = boardRoot(), timeout = BOARD_WRITE_TIMEOUT_MS } = {},
) {
  const result = spawn(
    process.execPath,
    [resolve(root, 'scripts', 'board.mjs'), 'status', String(point), '--text-stdin'],
    // windowsHide: the Stop chain and every recording step run unattended;
    // a console window here would steal the focus on each round (point 401).
    // timeout: this call is optional bookkeeping awaited by the command that
    // just recorded real work. A wedged publish, git call or child must not be
    // able to hold that command short of its exit (fourth cross-vendor round).
    { cwd: root, input: status, encoding: 'utf8', windowsHide: true, timeout },
  )
  if (result.error) throw result.error
  // A killed-on-timeout child reports its signal, not an error object.
  if (result.signal) throw new Error(`board.mjs status was killed after ${timeout} ms (${result.signal})`)
  if (result.status !== 0) {
    throw new Error(String(result.stderr ?? '').trim() || `board.mjs status exited ${result.status}`)
  }
  return String(result.stdout ?? '')
}

/**
 * Carry the board on one recording step.
 *
 * @param {object}   a
 * @param {string}   a.trigger  one of TRIGGERS
 * @param {string}   a.detail   one line: what this step just recorded
 * @returns {{refreshed: boolean, reason: string, status?: string, error?: string}}
 */
export function heartbeat({
  trigger,
  detail = '',
  root = undefined,
  state = undefined,
  focus = undefined,
  now = Date.now(),
  card = undefined,
  memory = undefined,
  remember = undefined,
  writeStatus = runBoardStatus,
  stderr = (line) => console.error(line),
} = {}) {
  try {
    const owner = root ?? boardRoot()
    // In a worktree the state and focus files of the OWNING checkout are the
    // ones that matter; the worktree has none of its own. The names are derived
    // from the canonical paths rather than repeated, so moving either file here
    // cannot leave this reading behind.
    const owned = (path) => resolve(owner, relative(REPO_ROOT, path))
    const seenState = state ?? readJson(owned(STATE_PATH))
    const seenFocus = focus ?? readJson(owned(FOCUS_PATH))
    const keep = (value) => {
      const write = remember ?? ((v) => writeJsonAtomic(memoryPath(owner), v))
      try {
        write(value)
      } catch (error) {
        // Never worth failing a recorded review — but never silent either. A
        // record that cannot be written leaves every later look with no memory
        // of this card, so each one finds its age unknown, calls it stale and
        // publishes again: a refresh loop nothing would otherwise explain
        // (eighth cross-vendor round).
        stderr(
          'board heartbeat: the card record could not be written — every trigger will republish ' +
            `until this is fixed (${String(error?.message ?? error)})`,
        )
      }
    }
    const seen = card === undefined ? readCard(seenState, owner) : { ok: true, ...card }
    // Nothing may be written against a board this could not read: the mismatch
    // refusal below rests on knowing which point the now-card actually names.
    if (!seen.ok) {
      // REPORTED, not merely returned: callers discard the reason, and the
      // module promises that a board which stopped following is said out loud.
      stderr('board heartbeat: no now-card could be read from the board — it is not being carried')
      return { refreshed: false, reason: 'board-unreadable' }
    }
    const record = memory === undefined ? readJson(memoryPath(owner)) : memory
    const aged = cardAge({ record, digest: seen.digest, now })
    // Remembered BEFORE the decision, so a refusal further down still leaves the
    // reader able to age this card next time instead of answering UNKNOWN forever.
    const decision = decideHeartbeat({
      focus: seenFocus,
      cardPoint: seen.point,
      ageMs: aged.ageMs,
      trigger,
      detail,
    })
    if (!decision.refresh) {
      // Nothing will be written, so a BOUND is worth keeping — it is what ages
      // this card at the next look. A FIRST SIGHT is not: writing it down would
      // claim the card was current now, and the next valid trigger would find
      // it fresh and skip the refresh this refusal never performed.
      if (aged.remember && !aged.firstSight) keep(aged.remember)
      return { refreshed: false, reason: decision.reason }
    }

    // FROM HERE THE RECORD WAITS FOR THE WRITE (sixth cross-vendor round).
    // Persisting the observation first would stamp the STALE card as seen just
    // now, so a write that then failed would leave the next heartbeat calling
    // the unchanged card current — the refresh suppressing its own retry for
    // ten minutes. Nothing is recorded unless the board really moved.

    // The card is addressed by NUMBER, so a refresh needs one. A non-point focus
    // is legitimate work, but there is no card here to carry it.
    const target = seenFocus?.point ?? seen.point
    if (target == null) {
      // The same rule as the other no-write path: a bound is kept, a first
      // sight is not.
      if (aged.remember && !aged.firstSight) keep(aged.remember)
      return { refreshed: false, reason: 'no-target' }
    }

    writeStatus(target, decision.status, { root: owner })
    // NOW the card's age is known exactly rather than bounded: this wrote it.
    // Re-read so the digest recorded is the one the board actually carries.
    const written = card === undefined ? readCard(seenState, owner) : null
    if (written && !written.ok) {
      // The write went through, but what it produced cannot be read back. The
      // record is left ALONE rather than filled with an empty digest: the next
      // observation then finds content it has no record of and treats the age as
      // unknown, which is the stale-and-safe direction. Saying so is the point —
      // a silent success here would claim a reread that did not happen.
      stderr('board heartbeat: the now-card was written but could not be read back — its age is unknown again')
      return { refreshed: true, reason: decision.reason, status: decision.status, reread: false }
    }
    if (written) keep({ digest: written.digest, seenAt: now })
    return { refreshed: true, reason: decision.reason, status: decision.status }
  } catch (error) {
    // NEVER fatal: see the header. The caller recorded real work; the board
    // failing to follow is worth saying out loud and nothing more.
    const message = String(error?.message ?? error)
    stderr(`board heartbeat: the now-card could not be carried — ${message}`)
    return { refreshed: false, reason: 'failed', error: message }
  }
}
