// LAYER 5 — RETRY A CHILD, NOT AN OUTAGE (point 434 part 3), the I/O half.
// Every decision lives in scripts/child-retry-core.mjs; this file only reads the
// state, runs the git probe, writes the decision record, clocks shared outages
// and notifies.
//
// WHO CALLS IT. The main session is the party that spawns children, so this is
// not a hook — it is the command the MAIN SESSION runs the moment a delegated
// agent dies:
//
//   node scripts/child-retry.mjs --point 421 --branch feat/421-slug \
//        --death "API Error: 500 {…}" [--child <agent id>] [--brief-revision <sha>] \
//        [--reported-complete] [--committed|--no-committed] [--tokens N] \
//        [--session <id>] [--json]
//
//   node scripts/child-retry.mjs --status              what the state file holds
//   node scripts/child-retry.mjs --complete --point N  the child reported a step done
//   node scripts/child-retry.mjs --forget --point N    explicitly re-open a point's budget
//
// It answers exactly one of RETRY (with the backoff to wait and a
// continue-or-repeat prompt hint), RECOVER, OUTAGE-PROBE, SCHEDULED or STAND-DOWN, and it
// NEVER spawns anything itself — one spawner is enough (docs/batch-resilience.md
// §5). The session reads the answer and acts.
//
// EXIT CODE IS ALWAYS 0 for a decision (usage errors exit 2): the verdict is the
// output, not the status, and a non-zero exit here would make an ordinary
// scheduling decision look like a broken command in every log that reads exits.
//
// FAIL-OPEN, in the sense the other guards use: an internal error never traps
// the session. It degrades to a clocked exchange record with the error named —
// never to a person-only terminal and never to an immediate blind retry.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { writeJsonAtomic } from './atomic-write.mjs'
import { ownsLock, readOwnerLock } from './batch-singleton.mjs'
import { resolveSessionId } from './guard-preflight.mjs'
import { notify } from './notify.mjs'
import {
  POINT_TOKEN_CAP,
  describeDecision,
  emptyState,
  fallbackRecoveryDecision,
  outageProbeReason,
  recordCompletion,
  recordDeath,
  recordRetry,
  recordRecovery,
  retryDecision,
} from './child-retry-core.mjs'

// Both resilience layers keep their runtime state in ONE gitignored directory,
// so the repository's ignore list grows by a single path rather than by a line
// per file — this branch shares .gitignore with two parallel ones.
export const STATE_PATH = repoPath('.claude/resilience/child-retry.json')
export const LOG_PATH = repoPath('.claude/resilience/child-retry.log')

/** The state directory is created on demand: a fresh checkout has no .claude/
 *  resilience/, and a layer that only works after somebody manually made a folder
 *  is not a layer. */
function ensureDir(path) {
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    /* already there, or unwritable — the caller's own try/catch decides */
  }
}

/** The state document, or an empty one. A corrupt file is NOT fatal: the core
 *  tolerates a garbage document, and this layer must answer while every other
 *  layer's input is missing or stale. */
export function readState(path = STATE_PATH) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'))
    return s && typeof s === 'object' ? s : emptyState()
  } catch {
    return emptyState()
  }
}

export function writeState(state, path = STATE_PATH) {
  ensureDir(path)
  writeJsonAtomic(path, state)
}

/** The calibratable per-point token ceiling (HOA_POINT_TOKEN_CAP). Read here so
 *  the decision core stays pure. */
export function tokenCap(env = process.env) {
  const raw = Number(env.HOA_POINT_TOKEN_CAP)
  return Number.isFinite(raw) && raw > 0 ? raw : POINT_TOKEN_CAP
}

/**
 * DID THE CHILD COMMIT? — judged by OUTPUT, never by a log (the rule of
 * docs/batch-resilience.md §Layer 5b, which was broken by declaring a working
 * agent dead because its transcript was quiet). Commits on the branch that are
 * not yet on `main` are the child's product; one of them means the retry prompt
 * must say CONTINUE. Any git failure answers `false` — evidence that cannot be
 * established never counts as established.
 */
export function committedOnBranch(branch, { cwd = REPO_ROOT } = {}) {
  if (!branch) return false
  try {
    const out = execFileSync('git', ['rev-list', '--count', `main..${branch}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    return Number(out.trim()) > 0
  } catch {
    return false
  }
}

/** Durable branch evidence for a terminal child diagnosis. */
export function diagnoseBranch(branch, { cwd = REPO_ROOT } = {}) {
  if (!branch) return { exists: false, committedSinceSpawn: false, branch: null }
  try {
    execFileSync('git', ['rev-parse', '--verify', `${branch}^{commit}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    return { exists: true, committedSinceSpawn: committedOnBranch(branch, { cwd }), branch }
  } catch {
    return { exists: false, committedSinceSpawn: false, branch }
  }
}

/** One line per decision, where the morning reader finds it. */
export function logLine(text, path = LOG_PATH) {
  try {
    appendFileSync(path, `${new Date().toISOString()} ${text}\n`)
  } catch {
    /* a log that cannot be written must not break the decision */
  }
}

/** German timestamp for the user-facing pause text. */
function berlinStamp(now = new Date()) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now)
}

/** The board card for an outage pause — best effort. A card that cannot be
 *  written must not stop the pause; the log and the notification still carry
 *  the reason. */
export function boardCard(title, question, { cwd = REPO_ROOT } = {}) {
  try {
    execFileSync(process.execPath, ['scripts/board.mjs', 'vdzk-add', title, question], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    return true
  } catch (error) {
    if (/open question .* already stands under/i.test(String(error?.stderr ?? ''))) return true
    return false
  }
}

/**
 * The pause marker is read through batch-lock.mjs, LAZILY. That module resolves
 * its paths with `fileURLToPath(new URL(…, import.meta.url))`, which THROWS
 * under a test runner (the reason scripts/repo-paths.mjs exists) — a top-level
 * import would take this whole module down before a single test could load it.
 * The CLI is the only caller, and it is never the test runner.
 */
async function pauseApi() {
  return import('./batch-lock.mjs')
}

// --- CLI ------------------------------------------------------------------------

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const flag = (f, fallback = null) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
// An ABSENT --tokens must stay absent, not become 0: Number(null) is 0 and 0 is
// finite, so the naive form would tell the core "this point has spent nothing"
// and silently erase the budget the state file remembers.
const numFlag = (f) => {
  const v = flag(f)
  return v == null ? undefined : Number(v)
}

const USAGE = `usage:
  node scripts/child-retry.mjs --point <n> --branch <ref> --death "<what the harness said>"
        [--child <id>] [--brief-revision <sha>] [--reported-complete]
        [--committed|--no-committed] [--critical] [--tokens <n>] [--session <id>] [--json]
  node scripts/child-retry.mjs --status
  node scripts/child-retry.mjs --complete --point <n>
  node scripts/child-retry.mjs --forget --point <n>`

async function main() {
  if (has('--help') || argv.length === 0) {
    console.log(USAGE)
    return 0
  }

  const state = readState()

  if (has('--status')) {
    const points = Object.entries(state.points ?? {})
    console.log(`child-retry state (${STATE_PATH})`)
    console.log(`  deaths on record: ${(state.deaths ?? []).length}`)
    for (const [p, rec] of points) {
      console.log(
        `  point ${p}: ${rec.retries ?? 0} retries, ${rec.tokens ?? 0} tokens, branch ${rec.branch ?? '—'}, ` +
          `completed steps ${rec.completedSteps ?? 0}` +
          `${rec.recovery ? `, ${rec.recovery.action} probe ${new Date(rec.recovery.nextAttemptAt).toISOString()}` : ''}`,
      )
    }
    if (!points.length) console.log('  no point has spent a retry')
    return 0
  }

  const point = Number(flag('--point'))
  if (!Number.isFinite(point)) {
    console.error(USAGE)
    return 2
  }

  if (has('--complete')) {
    writeState(recordCompletion(state, { point, tokensUsed: numFlag('--tokens') }))
    logLine(`point ${point}: a child reported a step complete — it is never retried from here on`)
    console.log(`point ${point}: completion recorded; a later death of this point will not be retried.`)
    return 0
  }

  if (has('--forget')) {
    const next = { ...state, points: { ...(state.points ?? {}) } }
    delete next.points[String(point)]
    writeState(next)
    logLine(`point ${point}: retry budget cleared by explicit command`)
    console.log(`point ${point}: retry budget and completion flag cleared.`)
    return 0
  }

  const branch = flag('--branch')
  const death = flag('--death', '')
  const briefRevision = flag('--brief-revision')
  const childId = flag('--child')
  const tokensRaw = numFlag('--tokens')
  const { sessionId } = resolveSessionId(argv)
  const { isPaused, setPaused } = await pauseApi()

  // OWNERSHIP AND PAUSE — the stand-down every guard here shares. An unreadable
  // lock is NOT treated as "someone else owns it": with no lock at all the batch
  // is un-owned and the session in front of the keyboard is the one asking.
  let owns = true
  try {
    owns = readOwnerLock() ? ownsLock(sessionId) : true
  } catch {
    owns = true
  }

  const branchEvidence = diagnoseBranch(branch)
  const committed = has('--committed') ? true : has('--no-committed') ? false : branchEvidence.committedSinceSpawn

  const decision = retryDecision({
    point,
    branch,
    briefRevision,
    childId,
    death,
    reportedComplete: has('--reported-complete'),
    committedSinceSpawn: committed,
    branchExists: branchEvidence.exists,
    critical: has('--critical'),
    state,
    now: Date.now(),
    paused: isPaused(),
    ownsLock: owns,
    tokensUsed: Number.isFinite(tokensRaw) ? tokensRaw : null,
    tokenCap: tokenCap(),
  })

  // Stand-down changes nothing and records nothing: a session that may not act
  // must not leave footprints in the state either.
  if (!['stand-down', 'scheduled'].includes(decision.verdict)) {
    let next = recordDeath(state, { point, branch, childId, signature: decision.signature, verdict: decision.verdict, at: Date.now() })
    // A reported completion is PERSISTED here, not only used for this verdict
    // (four-eyes review): otherwise a later death of the same point would be
    // retried unless the caller happened to run --complete as well, and the
    // "never retry a child that reported a step complete" rule would hold for
    // exactly one invocation.
    if (has('--reported-complete')) next = recordCompletion(next, { point, tokensUsed: tokensRaw })
    if (decision.verdict === 'retry') next = recordRetry(next, { point, branch, briefRevision, tokensUsed: Number.isFinite(tokensRaw) ? tokensRaw : undefined })
    if (['recover', 'outage-probe'].includes(decision.verdict)) next = recordRecovery(next, decision)
    writeState(next)
  }

  logLine(`point ${point} (${branch ?? 'no branch'}) died: ${decision.signature} → ${decision.verdict} — ${decision.reason}`)

  if (decision.verdict === 'outage-probe') {
    const reason = outageProbeReason(decision, berlinStamp())
    if (!isPaused()) setPaused(reason, { cause: 'outage', retryAfter: decision.retryAt })
    const recorded = boardCard(decision.decisionRecord.title, decision.decisionRecord.body)
    // AWAITED, not fired and forgotten: process.exit() below would kill the
    // pending POST and the pause would happen with nobody told about it.
    await notify('Umgebungsausfall — Probe eingeplant', `${reason} Entscheidungsprotokoll ${recorded ? 'geschrieben' : 'noch nicht auf dem Board'}.`, 'urgent', { key: 'child-retry-outage' })
  } else if (decision.verdict === 'recover') {
    const recorded = boardCard(decision.decisionRecord.title, decision.decisionRecord.body)
    await notify(
      `Punkt ${point}: ${decision.recoveryAction} eingeplant`,
      `${decision.reason} Nächster Versuch ${new Date(decision.retryAt).toISOString()}; Entscheidungsprotokoll ${recorded ? 'geschrieben' : 'im Retry-State erhalten'}.`,
      'default',
      { key: `child-retry-recovery-${point}`, recurring: true },
    )
  }

  if (has('--json')) console.log(JSON.stringify(decision, null, 2))
  else console.log(describeDecision(decision))
  return 0
}

const isCli = process.argv[1]?.endsWith('child-retry.mjs')
if (isCli) {
  let code = 0
  try {
    code = await main()
  } catch (e) {
    // FAIL-OPEN: never trap the session and never manufacture a human terminal.
    const decision = fallbackRecoveryDecision({
      point: Number(flag('--point')) || null,
      branch: flag('--branch'),
      briefRevision: flag('--brief-revision'),
      error: e?.message ?? e,
    })
    try { writeState(recordRecovery(readState(), decision)) } catch { /* the board/log still retain the same decision */ }
    boardCard(decision.decisionRecord.title, decision.decisionRecord.body)
    console.log(describeDecision(decision))
    logLine(`internal error → exchange; next attempt ${new Date(decision.retryAt).toISOString()}: ${e?.message ?? e}`)
    code = 0
  }
  process.exit(code)
}
