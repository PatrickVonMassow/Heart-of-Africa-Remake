// Stop hook (user mandate 21.07.2026, hardened 22.07.2026): GUARANTEE the batch
// dashboard stays current — reminders alone repeatedly failed, so this BLOCKS a
// turn from ending while the dashboard is out of sync with the real batch state.
// The decision logic lives in dashboard-guard-core.mjs (pure, Vitest-covered);
// this wrapper only gathers the inputs and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session.
//
// Enforced invariants (see the core for the full comments):
//   (1) registered   (2) fresh vs HEAD          (3) no ticked point in the queue
//   (4) every open point visible                (5) focus declared (focus.mjs)
//   (6) now-card title point == declared focus  (7) reconcile after a user prompt
//   (8) re-affirm after ~30 min of work         (8b) full-consistency audit (313)
//   (9) repo file == published content
//
// The companion flow after every dashboard edit:
//   node scripts/board-publish.mjs              # push the board to the live page
//   node scripts/dashboard-guard.mjs --synced <dashboard.html path>
// --synced VALIDATES FIRST (point 313): while auditDashboard() reports
// violations it records NOTHING and exits 1 — the board cannot be attested
// inconsistent. On a clean pass it records the reviewed HEAD, refreshes the
// integrity snapshots, advances the doneSeen baseline (newly ticked points must
// have shown their Erledigt card to get here), and — when the now-card matches
// the declared focus — doubles as the focus confirmation. Emergency bypass for
// a genuinely unfixable finding: --waive-audit "<reason>" waives exactly the
// CURRENT file hash (any further edit re-arms the audit); the waiver is logged
// in dashboard-state.json.
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  REPO_ROOT,
  STATE_PATH,
  FOCUS_PATH,
  PENDING_PATH,
  ACTIVITY_PATH,
  readJson,
  writeJsonAtomic,
  mergeState,
  removeFile,
  sha256File,
} from './dashboard-state.mjs'
import { createHash } from 'node:crypto'
import {
  parseTasks,
  parseNowCardPoint,
  auditDashboard,
  etaRevisionPatch,
  parseCards,
  sliceSections,
  nowCardText,
  evaluate,
} from './dashboard-guard-core.mjs'

/** Hash of the now-card BODIES — the text the reader sees (invariant 8c). */
const nowHash = (html) => createHash('sha256').update(nowCardText(html)).digest('hex')
import { heldByOtherLiveOwner, readOwnerLock } from './batch-singleton.mjs'
import { openFingerprintOfTasks, syncedPublishPatch } from './board-currency-core.mjs'
import { specSnapshots } from './dashboard-integrity-guard-core.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { isMainModule } from './is-main.mjs'
import { PUBLISH_CMD } from './board-remedy.mjs'

const TASKS = resolve(REPO_ROOT, 'TASKS.md')
const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

/**
 * Minutes since midnight in Europe/Berlin — the clock the board is written
 * against, so a card's expected end is judged in the reader's timezone rather
 * than the machine's. Returns null when the locale data is unavailable, and the
 * pure check then simply does not run. Exported as the ONE copy of this clock:
 * batch-in-flight.mjs (the wait refusal) and board-watchdog.mjs (the published
 * ETA alert) judge the same "~HH:MM" promises and must read the same clock.
 */
export function berlinMinutes() {
  try {
    const s = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date())
    const m = /(\d{1,2}):(\d{2})/.exec(s)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  } catch {
    return null
  }
}

function head() {
  try {
    return execSync('git rev-parse HEAD', { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/**
 * Everything evaluate() needs, gathered from disk and git — exported so the
 * preflight (point 365 D) can ask "would the dashboard guard block?" from the
 * SAME inputs the Stop hook uses. This gathering is where a reimplementation
 * would drift and report a false "clean", so there is exactly one of it.
 */
export function gatherDashboardInputs({ sessionId = '' } = {}) {
  // Hard singleton: a session that does not own the live batch lock has no
  // dashboard duty — it must stand down entirely, not be pushed to publish.
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }

  const marker = readJson(STATE_PATH)
  const dashboardFile = marker && marker.dashboardPath ? resolve(REPO_ROOT, marker.dashboardPath) : null
  const markerFileExists = !!(dashboardFile && existsSync(dashboardFile))
  const html = markerFileExists ? readFileSync(dashboardFile, 'utf8') : null

  // Only THIS session's tool activity drives the focus-freshness invariant —
  // a parallel chat window's calls must not nag the batch session (and vice versa).
  const activity = readJson(ACTIVITY_PATH)
  const lastToolAt =
    activity && (!activity.sessionId || !sessionId || activity.sessionId === sessionId)
      ? Number(activity.lastToolAt ?? 0)
      : 0

  return {
    applicable: true,
    inputs: {
      paused: existsSync(PAUSE),
      ...parseTasks(readTasksAll(TASKS)),
      marker,
      markerFileExists,
      head: head(),
      html,
      repoHash: markerFileExists ? sha256File(dashboardFile) : null,
      focus: readJson(FOCUS_PATH),
      pending: readJson(PENDING_PATH),
      sessionId,
      lastToolAt,
      nowCardHash: html ? nowHash(html) : null,
      now: Date.now(),
      // The board's own clock, for the expected-end rule. Gathered HERE and not
      // only at --synced: the Stop chain is where the rule has to bite, because
      // a card whose status text is refreshed and whose HEAD has not moved
      // satisfies every other invariant while its header ages (Fable 5, four-eyes).
      nowMinutes: berlinMinutes(),
      // Calibratable without a code change: minutes in dashboard-state.json.
      freshMs: marker && marker.focusFreshMinutes ? Number(marker.focusFreshMinutes) * 60000 : undefined,
    },
  }
}

// Everything below is the CLI/hook behaviour and must not run on import (the
// preflight imports this file for gatherDashboardInputs).
const RUN_AS_SCRIPT = isMainModule(import.meta.url)

// --waive-audit "<reason>": emergency bypass for the consistency audit, bound
// to exactly the CURRENT registered file's hash (point 313 escape hatch — the
// only alternative used to be pausing the whole batch).
if (RUN_AS_SCRIPT && process.argv[2] === '--waive-audit') {
  const reason = process.argv[3]
  const marker = readJson(STATE_PATH)
  // Falls back to the default board path so the hatch also works BEFORE the
  // first registration (a fresh clone with a violation would otherwise have no
  // way out but pausing the whole batch).
  const rel = (marker && marker.dashboardPath) || '.batch-dashboard.html'
  const file = resolve(REPO_ROOT, process.argv[4] || rel)
  if (!reason || !existsSync(file)) {
    console.error('usage: node scripts/dashboard-guard.mjs --waive-audit "<reason>" [dashboard.html]')
    process.exit(1)
  }
  const waiver = { repoHash: sha256File(file), reason, at: Date.now() }
  mergeState({ auditWaived: waiver })
  console.log(`audit waived for the CURRENT file hash only (${String(waiver.repoHash).slice(0, 12)}…): ${reason}`)
  process.exit(0)
}

// --synced <path>: record that the dashboard at <path> was reviewed at this HEAD.
if (RUN_AS_SCRIPT && process.argv[2] === '--synced') {
  const p = process.argv[3]
  if (!p || !existsSync(p)) {
    console.error(`dashboard-guard --synced: file not found: ${p}`)
    process.exit(1)
  }

  // VALIDATE FIRST (point 313): a board that fails the consistency audit can
  // not be attested — nothing is written, the violations are the work list.
  const { open, done } = parseTasks(readTasksAll(TASKS))
  const priorState = readJson(STATE_PATH) ?? {}
  const violations = auditDashboard(readFileSync(p, 'utf8'), {
    open,
    done,
    doneSeen: priorState.doneSeen ?? null,
    nowMinutes: berlinMinutes(),
    etaRevisions: priorState.etaRevisions ?? null,
  })
  const waived = priorState.auditWaived && priorState.auditWaived.repoHash === sha256File(p)
  if (violations.length && !waived) {
    console.error(`dashboard-guard --synced REFUSED — ${violations.length} consistency violation(s):`)
    for (const x of violations) console.error(`  [${x.code}] ${x.msg}`)
    console.error('Fix the board, republish, then re-run --synced. Emergency only: --waive-audit "<reason>".')
    process.exit(1)
  }

  // THEN: was this exact board actually PUBLISHED? (four-eyes finding
  // 28.07.2026.) attest used to register a board no publish had ever accepted —
  // the file was consistent, so it printed "registered" over a phone still
  // showing the previous board. The publish record is only evidence if it names
  // THIS content; a deferred publish (offline) is the documented exception and
  // passes with a loud line instead.
  const fileHash = sha256File(p)
  // The pages push is the transport (point 400, delta D); a legacy mirror hash
  // still counts where an old record stands. Reading only that record would
  // refuse to attest a board that IS live and offer `--defer` as the way out —
  // a false deferral over a published board.
  const livePublished = !!fileHash && (priorState.publishedHash === fileHash || priorState.pagesPublishedHash === fileHash)
  if (priorState.publishFailed && !livePublished) {
    console.error('dashboard-guard --synced REFUSED — the last publish attempt FAILED:')
    console.error(`  ${priorState.publishFailed.reason}${priorState.publishFailed.path ? ` (${priorState.publishFailed.path})` : ''}`)
    console.error(`Publish again — ${PUBLISH_CMD} — then re-run --synced.`)
    process.exit(1)
  }
  if (priorState.publishDeferred) {
    const why = priorState.publishDeferred.reason ?? priorState.publishDeferred
    console.warn(`dashboard-guard --synced: publish DEFERRED — ${why}`)
    console.warn('  the board file is current, the LIVE page is not. The watchdog reports this.')
  } else if (fileHash && !livePublished) {
    console.error('dashboard-guard --synced REFUSED — this board was never published:')
    console.error(
      `  file ${String(fileHash).slice(0, 12)}… vs last published ${String(priorState.pagesPublishedHash ?? priorState.publishedHash ?? 'none').slice(0, 12)}…`,
    )
    console.error(`Publish it: ${PUBLISH_CMD} — then re-run --synced.`)
    console.error('Unreachable — e.g. offline: node scripts/dashboard-publish.mjs --defer "<reason>".')
    process.exit(1)
  }

  // Advance the doneSeen baseline — but a WAIVED pass must not absorb an
  // erledigt-missing finding forever: it only advances over points that
  // actually have a card (plus everything already seen). A clean pass has no
  // such finding, so it advances over the full done set. The waiver itself is
  // consumed here: reverting to previously waived bytes must not revive it.
  const prevSeen = Array.isArray(priorState.doneSeen) ? priorState.doneSeen : null
  const carded = new Set(
    parseCards(sliceSections(readFileSync(p, 'utf8')).sections['Erledigt'] ?? '').flatMap((c) => c.points),
  )
  const doneSeen =
    violations.length && prevSeen
      ? [...new Set([...prevSeen, ...done.filter((n) => carded.has(n))])]
      : done
  // THE PUBLISH-DUE MARK IS CLEARED HERE, and only by a REAL publish (point
  // 400, delta B) — the decision is pure (syncedPublishPatch), the fingerprint
  // comes from the SAME single source the due mark is written from, so a
  // publish can never re-arm the mark it just cleared.
  let publishPatch = {}
  try {
    publishPatch = syncedPublishPatch({
      state: priorState,
      fileHash,
      fingerprint: openFingerprintOfTasks(readFileSync(TASKS, 'utf8')),
    })
  } catch {
    /* an unreadable work order must not fail an otherwise clean attestation */
  }
  // The attestation is where an estimate is (re)written, so it is where the
  // revisions are counted (point 411): a third move in one session says the
  // estimating METHOD is off, and the next flag says so with the card.
  let etaPatch = {}
  try {
    etaPatch = etaRevisionPatch({
      state: priorState,
      // The attesting session, read from the batch lock: `--synced` is a CLI call
      // with no hook payload. Unknown identity resets the counter, which only
      // ever WITHHOLDS the observation — the safe direction for a hint.
      sessionId: readOwnerLock()?.sessionId ?? '',
      cards: parseCards(sliceSections(readFileSync(p, 'utf8')).sections['Woran ich gerade arbeite'] ?? ''),
    })
  } catch {
    /* the counter is an OBSERVATION — never a reason to refuse an attestation */
  }
  mergeState({
    dashboardPath: p,
    head: head(),
    syncedAt: Date.now(),
    doneSeen,
    ...etaPatch,
    auditWaived: undefined,
    // A failure record that the live bytes have overtaken is spent: leaving it
    // would wedge every later attestation AND keep the launcher watchdog
    // reporting a publish that has since happened.
    ...(livePublished ? { publishFailed: undefined } : {}),
    ...publishPatch,
    // The now-card text as reviewed; (8c) blocks when work happens and this
    // never changes — a stale card cannot pass by confirming the focus alone.
    nowCardHash: nowHash(readFileSync(p, 'utf8')),
  })
  console.log(`dashboard registered at HEAD ${head().slice(0, 7)}: ${p}`)

  // Record the card/spec drift baselines for the integrity guard (check C):
  // per queue card, a hash of the card text and of its TASKS spec block. A
  // later spec change with an unchanged card then flags at turn end until the
  // next reviewed --synced refreshes these snapshots.
  try {
    const snaps = specSnapshots(readTasksAll(TASKS), readFileSync(p, 'utf8'))
    mergeState({ integritySnapshots: snaps })
    console.log(`integrity snapshots recorded for ${Object.keys(snaps).length} queue card(s)`)
  } catch (e) {
    console.log(`note: integrity snapshots skipped (${e && e.message})`)
  }

  // The re-sync IS the forced review of all four sections — when the reviewed
  // now-card matches the declared focus it doubles as the focus confirmation.
  try {
    const focus = readJson(FOCUS_PATH)
    const nowPoint = parseNowCardPoint(readFileSync(p, 'utf8'))
    if (focus && (focus.point == null || focus.point === nowPoint)) {
      writeJsonAtomic(FOCUS_PATH, { ...focus, confirmedAt: Date.now() })
      removeFile(PENDING_PATH)
      console.log(`focus confirmed by the review (point ${focus.point ?? '-'}: ${focus.note ?? ''})`)
    } else if (focus) {
      console.log(
        `WARNING: now-card point ${nowPoint ?? '<none>'} != declared focus ${focus.point} — ` +
          'fix the stale side (card edit + republish, or node scripts/focus.mjs set).',
      )
    } else {
      console.log('note: no focus declared yet — run node scripts/focus.mjs set <N> "<what>"')
    }
  } catch (e) {
    console.log(`note: focus cross-check skipped (${e && e.message})`)
  }
  process.exit(0)
}

// Stop-hook mode.
if (RUN_AS_SCRIPT) {
  try {
    let sessionId = ''
    try {
      sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      // no/non-JSON stdin (manual run) — invariant 7 then binds regardless of session
    }

    const gathered = gatherDashboardInputs({ sessionId })
    if (!gathered.applicable) process.exit(0)

    const result = evaluate(gathered.inputs)
    if (result.decision === 'block') process.stdout.write(JSON.stringify(result))
    process.exit(0)
  } catch (e) {
    console.error(`dashboard-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
