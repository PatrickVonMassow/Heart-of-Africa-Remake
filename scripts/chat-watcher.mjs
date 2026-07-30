// THE MESSAGE WAKES THE MACHINE — stage 3 of the board chat, the IO half.
// The whole decision logic is pure in scripts/chat-watcher-core.mjs.
//
//   node scripts/chat-watcher.mjs             # subscribe and wake a responder
//   node scripts/chat-watcher.mjs --dry-run   # subscribe, DECIDE, spawn nothing
//   node scripts/chat-watcher.mjs --status    # is a watcher running, and what does it hold
//   node scripts/chat-watcher.mjs --stop      # stop the running watcher
//
// WHAT IT COSTS WHILE NOTHING HAPPENS: one open HTTPS connection. No model, no
// tokens, no timer that wakes anything. That is the whole reason it is a
// subscription and not a poll — and the second reason is ntfy's free-tier rate
// limit, which a process polling every few seconds walks straight into.
//
// THE DRY RUN IS NOT A TOY. The live path can only ever be observed from a
// machine with NO session running, which is precisely the machine nobody is
// sitting at. `--dry-run` opens the real subscription, verifies every arriving
// envelope through the same scripts/chat-core.mjs path, prints one JSON line per
// event saying what it WOULD do and why — and spawns nothing, claims nothing,
// spools nothing. It is how the subscription itself gets proven from a session
// that is holding the batch lock.
//
// IT REFUSES TO RUN FROM A WORKTREE. A watcher started inside a git worktree
// would write its claim and its pidfile into that worktree's `.claude/`, where
// the launcher and the guards never look, and would spawn a responder whose cwd
// is a throwaway checkout. Same treatment scripts/retro-refresh.mjs got after it
// rewrote a document as empty from one: loud and free, rather than silently
// wrong. The dry run is exempt — it changes nothing, and being able to watch the
// channel from a worktree is exactly what it is for.
import { closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { readSecretStatus } from './chat-secret.mjs'
import {
  DEFAULT_MAX_AGE_MS,
  SEEN_MAX,
  assessEvent,
  deriveTopics,
  envelopeKeys,
  envelopeRetentionMs,
  parseNtfyLine,
  pruneIdLedger,
  seenKeys,
  sinceParam,
  streamUrl,
} from './chat-core.mjs'
import { knownMessages, claimMessage, readPending, spoolMessage } from './chat-spool.mjs'
import { readReplyReceipt } from './chat-reply.mjs'
import { assessOwner, bootTimeMs, probePid, readOwnerLock } from './batch-singleton.mjs'
import { clearClaim, maxAgeMs as claimMaxAgeMs, readClaim, writeClaim } from './batch-claim.mjs'
import { assessClaim, reservationDecision } from './batch-claim-core.mjs'
import { isPaused } from './batch-lock.mjs'
import { openPointStatus, ARCHIVE_PATH, TASKS_PATH } from './tasks-source.mjs'
import { buildSpawnArgs, buildSpawnOptions, claudeExeBase, findClaudeExe } from './batch-autostart-core.mjs'
import {
  CLAIM_SESSION_PREFIX,
  DEFERRAL_MS,
  RESPONDER_MAX_MESSAGES,
  RESPONDER_MAX_MS,
  WATCHER_PID_FILE,
  ackPlan,
  adoptDecision,
  buildResponderPrompt,
  claimIsOurs,
  reconnectDelayMs,
  responderClaim,
  sweepPlan,
  wakeDecision,
} from './chat-watcher-core.mjs'

export const PID_PATH = repoPath('.claude', WATCHER_PID_FILE)
const LOG_PATH = repoPath('.claude', 'chat-watcher.log')
const RUN_LOG_PATH = repoPath('.claude', 'chat-responder-run.log')

/** On a COLD start the stream replays only this far back. The full 12-hour
 *  retention would be correct but not safe: a first-ever start with an empty
 *  spool would wake a responder for every instruction of the last half day. One
 *  launcher tick is the honest bound — anything older has already been through a
 *  launcher poll, so missing it costs exactly the pre-407 behaviour and nothing
 *  more. A RECONNECT does not use this: it resumes from its own cursor. */
const COLD_START_WINDOW_MS = 15 * 60 * 1000

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const dryRun = has('--dry-run')

const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

/** One line into `.claude/chat-watcher.log`. A log we cannot write is never a
 *  reason to stop watching, and the DRY RUN writes no file at all — it must
 *  leave the repository exactly as it found it. */
function appendLog(line) {
  if (dryRun) return
  try {
    const fd = openSync(LOG_PATH, 'a')
    try {
      writeSync(fd, `${line}\n`)
    } finally {
      closeSync(fd)
    }
  } catch {
    /* best effort */
  }
}

const log = (o) => {
  const line = JSON.stringify({ at: new Date().toISOString(), ...o })
  process.stdout.write(`${line}\n`)
  appendLog(line)
}

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** `.git` is a DIRECTORY in the real checkout and a FILE inside a worktree. */
function inWorktree() {
  try {
    return !statSync(join(REPO_ROOT, '.git')).isDirectory()
  } catch {
    return false
  }
}

/** This process, by identity — the claim and the pidfile both record it, so a
 *  recycled pid can never be mistaken for this watcher. */
function ownIdentity() {
  const probe = probePid(process.pid)
  const startedAt =
    probe && typeof probe.startedAt === 'number'
      ? probe.startedAt
      : Date.now() - Math.round(process.uptime() * 1000)
  return { pid: process.pid, pidStartedAt: startedAt }
}

// --- The state every decision is taken against --------------------------------

/** The work-order format alarm, read the way the launcher reads it. */
function formatAlarm() {
  try {
    const tasksText = readFileSync(TASKS_PATH, 'utf8')
    const archiveText = existsSync(ARCHIVE_PATH) ? readFileSync(ARCHIVE_PATH, 'utf8') : ''
    return openPointStatus({ tasksText, archiveText }).alarm
  } catch {
    // Unreadable is not "fine": the launcher bails on it, and so does this.
    return true
  }
}

/**
 * Everything `wakeDecision` needs, gathered from disk. The owner assessment is
 * the launcher's own (`assessOwner`) with the same probes — nothing about
 * liveness is re-invented here. It is deliberately asked WITHOUT the in-flight
 * work declaration: omitting it can only make an owner read MORE alive, and
 * "there is a session, do not wake a second one" is the safe direction.
 */
function gatherState(sessionId, responderLive) {
  const now = Date.now()
  const lock = readOwnerLock()
  const probe = lock && lock.pid ? probePid(lock.pid) : null
  const ownerAlive = lock ? assessOwner(lock, { now, bootTime: bootTimeMs(), probe }).alive === true : false
  const claim = readClaim()
  // Our OWN claim is not a reason to stand down — `responderLive` already covers
  // the responder it belongs to, and it says so in a more useful word.
  const foreignClaim = claimIsOurs(claim, sessionId) ? null : claim
  // A claim stands in the way while it is honoured AND while it merely RESERVES a
  // freed lock (point 461) — `reservationDecision` is the shared reading of both,
  // so the watcher cannot wake a responder into a lock that is being handed to the
  // user's window. The field keeps the name `wakeDecision` knows it by: what it
  // has always meant here is "a claim speaks for that lock", not the honour flag.
  const claimHonoured = foreignClaim
    ? reservationDecision({
        assessment: assessClaim({ claim: foreignClaim, now, maxAgeMs: claimMaxAgeMs(), probePid }),
      }).acquire === false
    : false
  return { paused: isPaused(), formatAlarm: formatAlarm(), ownerAlive, responderLive, claimHonoured }
}

// --- The responder ------------------------------------------------------------

// The identity is resolved in `run()`, never at module load: `ownIdentity`
// probes the OS, and nothing about merely importing this file may do that.
const state = {
  sessionId: `${CLAIM_SESSION_PREFIX}-${randomUUID()}`,
  identity: { pid: process.pid, pidStartedAt: null },
  child: null,
  childTimer: null,
  sweepTimer: null,
  handed: [],
  /** Envelope ids this watcher already handed to a responder. The sweep skips
   *  them, so a responder that answered nothing leaves its messages pending
   *  (deliberately) without being woken for them again every window. */
  woken: [],
  /** When the live responder was spawned — the floor a reply receipt must beat
   *  to count as ITS answer rather than an earlier session's. */
  spawnedAt: null,
  cursor: 0,
  /** Transport ids, count-capped and disposable. */
  seen: [],
  /** Accepted ENVELOPE ids under their own age-bounded retention — a stream of
   *  junk lines may evict a transport id, never one of these (see
   *  `envelopeRetentionMs`), so a captured envelope cannot be replayed into a
   *  second responder by flooding the topic first. */
  envelopes: [],
}

/** Clear the claim, but only ever OUR OWN (a user's claim must survive us). */
function releaseClaim(why) {
  try {
    if (!claimIsOurs(readClaim(), state.sessionId)) return false
    clearClaim()
    log({ event: 'claim-released', why })
    return true
  } catch {
    return false
  }
}

/**
 * Mark the handed messages consumed — ONLY against EVIDENCE that this responder
 * actually answered: a reply the transport accepted, recorded after the spawn by
 * `recordReplyReceipt` in scripts/chat-reply.mjs. The exit code proves nothing —
 * a responder that stands down and ends its turn exits 0 as well, and acking on
 * that took the user's instruction off the spool with nobody having answered it.
 */
function ackHanded() {
  const receipt = readReplyReceipt()
  const plan = ackPlan({
    handed: state.handed,
    pending: readPending(),
    spawnedAt: state.spawnedAt,
    actedAt: receipt?.at ?? null,
  })
  let acked = 0
  for (const m of plan) if (claimMessage(m.file)) acked++
  return acked
}

function onResponderExit(code) {
  if (state.childTimer) clearTimeout(state.childTimer)
  state.childTimer = null
  state.child = null
  const handed = state.handed.length
  const acked = ackHanded()
  // A responder that sent NO reply leaves its messages PENDING, on purpose — and
  // says so here, because that is the one shape in which a message could
  // otherwise pass unnoticed. The next session is handed it.
  log({ event: 'responder-exit', code, handed, acked, stillPending: handed - acked })
  state.handed = []
  state.spawnedAt = null
  releaseClaim('responder-exit')
}

/** Wake a responder for `messages`. Returns true when a process was started. */
function spawnResponder(messages) {
  const prompt = buildResponderPrompt(messages)
  if (!prompt) return false
  const exe = findClaudeExe({ base: claudeExeBase(), readdir: readdirSync, exists: existsSync, join })
  if (!exe) {
    log({ event: 'spawn-failed', reason: 'no bundled claude.exe found' })
    return false
  }
  let child
  try {
    const out = openSync(RUN_LOG_PATH, 'a')
    // windowsHide + detached + the background-task ceiling all come from the
    // launcher's own builder (point 401: a popping console window steals the
    // user's focus, and this process wakes while the user is elsewhere).
    child = spawn(exe, buildSpawnArgs({ prompt }), buildSpawnOptions({ cwd: REPO_ROOT, stdio: ['ignore', out, out] }))
  } catch (e) {
    log({ event: 'spawn-failed', reason: (e && e.message) || String(e) })
    return false
  }
  state.child = child
  state.handed = messages
  state.spawnedAt = Date.now()
  state.woken.push(...messages.map((m) => m?.id).filter(Boolean))
  if (state.woken.length > SEEN_MAX) state.woken = state.woken.slice(-SEEN_MAX)

  // THE HANDLERS AND THE TIMEOUT GO ON BEFORE THE CLAIM WRITE (four-eyes review
  // 29.07.2026, finding 2). They used to be attached AFTER it, so a `writeClaim`
  // throw left a LIVE responder with no claim, no exit handler and no timeout —
  // and `state.child` set for ever, which made the watcher refuse every further
  // wake until it was restarted. Attached first, every one of those paths is
  // covered whatever the claim write does.
  child.on('exit', (code) => onResponderExit(code))
  child.on('error', () => onResponderExit(1))
  // A responder is LIGHT. Past the ceiling it is killed and the reservation
  // released, whatever it was doing — a stuck answer may not hold the batch.
  state.childTimer = setTimeout(() => {
    log({ event: 'responder-timeout', pid: child.pid })
    try {
      process.kill(child.pid)
    } catch {
      /* already gone */
    }
  }, RESPONDER_MAX_MS)

  // The claim records the responder's pid, so it can only be written now — but
  // nothing AWAITS in between, so the window in which a launcher tick could see
  // an unreserved batch beside a live responder is a few milliseconds wide.
  try {
    writeClaim(
      responderClaim({
        sessionId: state.sessionId,
        watcherPid: state.identity.pid,
        watcherStartedAt: state.identity.pidStartedAt,
        responderPid: child.pid,
        now: Date.now(),
      }),
    )
  } catch (e) {
    // NO CLAIM, NO RESPONDER. An unreserved responder is exactly the parallel
    // top-level session this design exists to avoid, so it is killed rather than
    // left running. The exit handler above then clears the state and the
    // message stays pending — for the next wake, or for the next launcher tick.
    log({ event: 'claim-write-failed', reason: (e && e.message) || String(e), pid: child.pid })
    releaseClaim('claim-write-failed')
    try {
      process.kill(child.pid)
    } catch {
      /* already gone */
    }
    return false
  }
  log({ event: 'responder-spawned', pid: child.pid, messages: messages.length })
  return true
}

// --- Shutdown: the claim goes on EVERY path ------------------------------------
//
// The handlers below cover the paths a process can still run code on. The one
// they cannot — SIGKILL, a power cut, a reboot — is covered by the claim's own
// shape: it names THIS process, and `assessClaim` honours it only while that pid
// exists and started when the claim says it did. A watcher that dies without
// warning therefore releases the claim by dying.

let shuttingDown = false
function shutdown(why, code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  try {
    if (state.childTimer) clearTimeout(state.childTimer)
    if (state.sweepTimer) clearInterval(state.sweepTimer)
    // A responder is OURS, so an orderly stop takes it with us: the launcher
    // stops this process precisely when the batch is paused, and leaving a
    // headless session behind under a claim nobody holds any more is the exact
    // orphan the pause is meant to prevent.
    if (state.child) {
      try {
        process.kill(state.child.pid)
      } catch {
        /* already gone */
      }
      log({ event: 'responder-killed', why, pid: state.child.pid })
    }
    releaseClaim(why)
    log({ event: 'shutdown', why })
  } catch {
    /* never let a shutdown throw */
  }
  clearPidFile()
  process.exit(code)
}
/** Registered from `run()` only — importing this module must install nothing. */
function installShutdownHandlers() {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    try {
      process.on(sig, () => shutdown(sig))
    } catch {
      /* not every signal exists on every platform */
    }
  }
  process.on('uncaughtException', (e) => {
    log({ event: 'crash', reason: (e && e.stack) || String(e) })
    shutdown('uncaught-exception', 1)
  })
  process.on('unhandledRejection', (e) => {
    log({ event: 'crash', reason: (e && (e.stack ?? e.message)) || String(e) })
    shutdown('unhandled-rejection', 1)
  })
  process.on('exit', () => releaseClaim('exit'))
}

function writePidFile() {
  writeJsonAtomic(PID_PATH, { ...state.identity, at: Date.now(), sessionId: state.sessionId })
}
function clearPidFile() {
  try {
    const rec = readJson(PID_PATH)
    if (rec && rec.pid === process.pid) rmSync(PID_PATH, { force: true })
  } catch {
    /* best effort */
  }
}

// --- The subscription ----------------------------------------------------------

async function consumeStream(url, onEvent, signal) {
  const res = await fetch(url, { cache: 'no-store', signal })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const decoder = new TextDecoder()
  let buffer = ''
  let sawAnything = false
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line.trim() === '') continue
      sawAnything = true
      await onEvent(line)
    }
  }
  return sawAnything
}

/** One arrived line → verified, decided, and (live only) acted on. */
async function handleLine(secret, maxAgeMs, line) {
  const event = parseNtfyLine(line)
  if (!event) return
  if (event.event === 'message' && Number.isFinite(event.time)) {
    state.cursor = Math.max(state.cursor, Number(event.time))
  }
  const now = Date.now()
  const verdict = await assessEvent({
    event,
    secret,
    // The topic this line came FROM, and therefore the direction the signature
    // must have been made for. Never read a direction off the wire.
    direction: 'inbox',
    now,
    maxAgeMs,
    // Both ledgers: the count-capped transport ids and every envelope id still
    // inside the window in which the transport could replay it.
    seen: [...state.seen, ...envelopeKeys(state.envelopes)],
  })
  // `keepalive` and `open` frames arrive every few seconds; reporting them would
  // drown the dry run's output in noise and say nothing.
  if (verdict.reason === 'not-a-message') return

  // THE LEDGER IS WHAT MAKES A RECONNECT FREE. A dropped connection is resumed
  // from the cursor with one second of overlap, and ntfy replays whatever it
  // still holds — so the same message arrives again and MUST decide nothing.
  // Every event that got this far is remembered, accepted or not: a mis-signed
  // one re-read from the cache is not re-reported either.
  if (verdict.accept) {
    state.seen.push(...seenKeys({ ntfyId: verdict.message.ntfyId, envelopeId: verdict.message.id }))
    state.envelopes.push({ id: verdict.message.id, at: verdict.message.ts })
  } else if (verdict.ntfyId) {
    // Transport id only. This is the path a flood comes down, and it may not
    // reach the envelope ledger.
    state.seen.push(`n:${verdict.ntfyId}`)
  }
  if (state.seen.length > SEEN_MAX) state.seen = state.seen.slice(-SEEN_MAX)
  state.envelopes = pruneIdLedger(state.envelopes, { now, retentionMs: envelopeRetentionMs(maxAgeMs) })

  const gathered = gatherState(state.sessionId, state.child !== null)
  const decision = wakeDecision({
    accepted: verdict.accept === true,
    dropReason: verdict.reason,
    ...gathered,
  })
  const record = { event: verdict.accept ? verdict.message.id : (verdict.ntfyId ?? null), ...decision }
  say(dryRun ? { ...record, dryRun: true } : record)
  appendLog(JSON.stringify({ at: new Date().toISOString(), ...record }))
  if (dryRun || !verdict.accept) return

  // SPOOL FIRST, whatever the decision. The spool is the shared record the
  // launcher's poll dedupes against (`seededLedger`), so a message this watcher
  // saw and did NOT act on must still be there for the session that will —
  // otherwise the next poll would accept it again and deliver it twice.
  spoolMessage(verdict.message)
  if (decision.decision !== 'spawn') return
  spawnResponder([verdict.message])
}

// --- The deferral deadline (point 424) -----------------------------------------
//
// A message left to a live owner is left to its NEXT TOOL CALL, and a session that
// declared a wait makes none — measured, a message sat pending for 34 minutes
// under a correctly logged `skip / owner-live`. So the skip is revisited: every
// tick the pending spool is re-read, and anything past `DEFERRAL_MS` is decided
// again with the owner gate lifted. Every other stand-down still binds, and the
// responder runs under the same bounded claim as any other wake.

/** How often the pending spool is re-examined. A third of the window, so an
 *  overdue message waits at most a third of it longer than the deadline. */
const sweepIntervalMs = () => Math.max(15_000, Math.round(deferralMs() / 3))

/** The deadline, calibratable — the env var is read once per call so a test can
 *  set it, and a nonsense value falls back to the default rather than to zero
 *  (which would spawn beside every live owner). */
function deferralMs() {
  const raw = Number(process.env.HOA_CHAT_DEFER_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFERRAL_MS
}

/** One sweep: take what the owner did not. Total — a sweep must never throw
 *  inside a timer and take the watcher down with it. */
function sweepDeferred() {
  try {
    if (state.child) return // our own responder is answering; `woken` covers its messages
    const plan = sweepPlan({ pending: readPending(), now: Date.now(), windowMs: deferralMs(), wokenIds: state.woken })
    if (plan.overdue.length === 0) return
    const gathered = gatherState(state.sessionId, false)
    const decision = wakeDecision({ accepted: true, ...gathered, deferralExpired: true })
    const record = { event: 'defer-sweep', pending: plan.overdue.length, windowMs: plan.windowMs, ...decision }
    log(record)
    if (decision.decision !== 'spawn') return
    spawnResponder(plan.overdue.slice(-RESPONDER_MAX_MESSAGES))
  } catch (e) {
    log({ event: 'defer-sweep-failed', reason: (e && e.message) || String(e) })
  }
}

async function run() {
  // The worktree refusal comes FIRST, before the channel is even looked at: a
  // run from the wrong checkout must be loud whether or not a secret happens to
  // be paired there.
  if (!dryRun && inWorktree()) {
    console.error(
      'scripts/chat-watcher.mjs must not run from a git WORKTREE: its claim and its pidfile would land in a ' +
        "checkout the launcher and the guards never read, and the responder's cwd would be a throwaway tree. " +
        'Run it from the main checkout, or use --dry-run, which changes nothing.',
    )
    process.exit(1)
  }
  const status = readSecretStatus()
  if (status.state === 'absent') {
    say({ ok: true, configured: false, reason: 'no chat secret — run: node scripts/chat-secret.mjs --init' })
    process.exit(0)
  }
  if (status.state !== 'ok') {
    // A secret that EXISTS and cannot be read is a fault, not an unpaired
    // machine — it is said loudly rather than mistaken for "nothing to watch".
    say({ ok: false, configured: true, reason: `chat secret unreadable (${status.reason})` })
    process.exit(1)
  }
  const secret = status.secret
  const maxAge = Number(process.env.HOA_CHAT_MAX_AGE_MS) > 0 ? Number(process.env.HOA_CHAT_MAX_AGE_MS) : DEFAULT_MAX_AGE_MS
  state.identity = ownIdentity()
  installShutdownHandlers()
  const { inbox } = await deriveTopics(secret)
  // The ledger the spool already holds: what is waiting AND what was consumed.
  // It is what makes a watcher restart free — a message on the spool is a
  // message some session will be handed, so re-reading it must wake nobody.
  const known = knownMessages()
  state.seen = known.flatMap((m) => seenKeys({ ntfyId: m.ntfyId, envelopeId: m.id }))
  state.envelopes = pruneIdLedger(
    known.map((m) => ({ id: m.id, at: m.ts })),
    { now: Date.now(), retentionMs: envelopeRetentionMs(maxAge) },
  )

  if (!dryRun) {
    // A responder orphaned by a crashed predecessor is ADOPTED rather than
    // duplicated: re-file the claim under this process and wait for it.
    const adopt = adoptDecision({ claim: readClaim(), probe: probePid })
    if (adopt.adopt) {
      writeClaim(
        responderClaim({
          sessionId: state.sessionId,
          watcherPid: state.identity.pid,
          watcherStartedAt: state.identity.pidStartedAt,
          responderPid: adopt.responderPid,
          now: Date.now(),
          why: 'adopted an orphaned responder from a previous watcher',
        }),
      )
      log({ event: 'adopted', responderPid: adopt.responderPid })
    }
    writePidFile()
    // The deferral deadline, on its own clock: the arrival decision cannot know
    // how long the owner will stay idle, so the skip is revisited here. The DRY
    // RUN gets no sweep — it decides and reports, and spawns nothing.
    state.sweepTimer = setInterval(sweepDeferred, sweepIntervalMs())
    if (typeof state.sweepTimer.unref === 'function') state.sweepTimer.unref()
  }
  log({ event: 'watching', mode: dryRun ? 'dry-run' : 'live', sessionId: state.sessionId, deferralMs: deferralMs() })

  let attempt = 0
  for (;;) {
    const since =
      state.cursor > 0
        ? sinceParam({ cursor: state.cursor }, { maxAgeMs: maxAge })
        : `${Math.round(COLD_START_WINDOW_MS / 1000)}s`
    const ac = new AbortController()
    try {
      const sawAnything = await consumeStream(streamUrl(inbox, since), (l) => handleLine(secret, maxAge, l), ac.signal)
      // The stream ENDED. ntfy does that on its own schedule; it is not a fault.
      attempt = sawAnything ? 0 : attempt + 1
      log({ event: 'stream-ended', reconnectInMs: reconnectDelayMs(Math.max(1, attempt)) })
    } catch (e) {
      attempt += 1
      log({ event: 'stream-error', reason: (e && e.message) || String(e), reconnectInMs: reconnectDelayMs(attempt) })
    } finally {
      ac.abort()
    }
    await new Promise((r) => setTimeout(r, reconnectDelayMs(Math.max(1, attempt))))
  }
}

// --- CLI -----------------------------------------------------------------------

const isCli = Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/chat-watcher.mjs'))

if (isCli) {
  if (has('--status')) {
    const rec = readJson(PID_PATH)
    const probe = rec && rec.pid ? probePid(rec.pid) : null
    say({
      record: rec,
      alive: probe?.exists === true,
      claim: readClaim(),
      pending: readPending().length,
    })
    process.exit(0)
  } else if (has('--stop')) {
    const rec = readJson(PID_PATH)
    if (!rec || !rec.pid || probePid(rec.pid)?.exists !== true) {
      say({ ok: true, stopped: false, reason: 'no watcher running' })
    } else {
      try {
        process.kill(rec.pid)
        say({ ok: true, stopped: true, pid: rec.pid })
      } catch (e) {
        say({ ok: false, stopped: false, reason: (e && e.message) || String(e) })
      }
    }
    process.exit(0)
  } else {
    await run()
  }
}
