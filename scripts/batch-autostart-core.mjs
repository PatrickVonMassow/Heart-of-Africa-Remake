// HOW THE LAUNCHER SPAWNS A SESSION — the pure half of scripts/batch-autostart.mjs.
//
// It lives in its own file because the launcher itself CANNOT be imported: every
// line of it runs at module load, so a test that merely imported it would spawn a
// headless claude session (it throws on purpose, pinned by
// scripts/batch-autostart.test.mjs). The spawn arguments and options are the part
// that must be provable, so they are built here, purely, and the CLI only hands
// them to `spawn`.
//
// THE ONE THING THIS FILE EXISTS FOR (point 402, 28.07.2026, four measured
// deaths in one afternoon): the spawn environment. `.claude/autostart-run.log`
// carries the executioner's own words four times over —
//
//     Background tasks still running after 600s; terminating.
//     Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.
//
// A print-mode session (`claude -p`, which is how every resurrected worker is
// spawned) waits at most ten minutes for its background tasks after a turn ends
// and is then TERMINATED by the runtime. The batch's designed steady state is
// "delegate the point to a worktree-isolated agent and wait for it" (CLAUDE.md
// §6), and a delegated agent routinely runs longer than that — the point 398
// agent took 12.7 minutes. So the session was killed WHILE ITS AGENT WAS STILL
// BUILDING, every single time the agent was slower than the ceiling, which is the
// whole of that afternoon's "frequent session deaths": three takeovers without a
// handover (`no owner lock — taking over`) and the `failCount` bumps that
// followed.
//
// The ceiling therefore goes to INFINITE, deliberately: the runtime knows nothing
// about the work, so it must not hold the policy. What bounds a wait instead is
// PROGRESS — `assessOwnerWork` in scripts/batch-in-flight-core.mjs feeding
// `assessOwner`, which reads an owner as stalled only when nothing has advanced
// for two launcher ticks. `0` is the value the runtime's own message documents.

/** The launcher's own override, deliberately NOT the runtime's variable name: an
 *  inherited `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` from some other context must
 *  never silently re-arm the ten-minute execution. Set HOA_BG_WAIT_CEILING_MS to
 *  a millisecond value to put a ceiling back. */
export const BG_WAIT_CEILING_ENV = 'CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS'
export const BG_WAIT_CEILING_OVERRIDE_ENV = 'HOA_BG_WAIT_CEILING_MS'
/** 0 = wait indefinitely (the runtime's own documented value). */
export const BG_WAIT_CEILING_DEFAULT = '0'

/** Model policy (CLAUDE.md §6, 25.07.2026): Opus 5 is the worker at any
 *  difficulty, the fallback CHAIN is Opus 5 → Fable 5 → Opus 4.8. The CLI takes a
 *  single --fallback-model, so Fable is wired as the first fallback; the
 *  model-guard Stop hook enforces the allowlist from inside either way. */
export const SPAWN_MODEL = 'claude-opus-5[1m]'
export const SPAWN_FALLBACK_MODEL = 'claude-fable-5'

export const RESUME_PROMPT =
  'Autonome Batch-Wiederaufnahme (vom OS-Scheduler gestartet, weil keine Claude-Session aktiv war). ' +
  'Setze den "Heart of Africa"-Batch fort. Lies ZUERST die Handoff-Memory resume-184-qa-framework. ' +
  'Pruefe als erstes den ausgecheckten Git-Branch und ob ein Merge halb fertig ist. Arbeite die offenen ' +
  'TASKS-Punkte in Reihenfolge ab — Feature-Branch-Workflow (CLAUDE.md §6): jeder Punkt auf seinem ' +
  'EIGENEN feat/<punkt>-<slug>-Branch von main, atomare Commits, den BRANCH nach jedem Commit pushen, ' +
  'Merge nach main NUR wenn der Punkt fertig und verifiziert ist (Tests gruen; Render-/GUI-Aenderungen ' +
  'auf BEIDEN Backends am Bild geprueft); TASKS.md nur auf main abhaken (beim Merge); ' +
  'Querschnitts-Aenderungen (Guards, Docs, Dashboard, Prozessdateien) direkt auf main. Dashboard-Guard + ' +
  'prep-guard gruen halten, Vorarbeit waehrend jeder Validierung. WARTEN IST SICHTBAR (28.07.2026): ' +
  'waehrend ein delegierter Agent baut, POLLE innerhalb des Zuges (TaskOutput, Branch-Tip, Logdatei) ' +
  'statt still zu sitzen — jeder Werkzeugaufruf frischt den Heartbeat, und eine still wartende Sitzung ' +
  'ist von einer toten nicht zu unterscheiden; kannst du im Zug nicht weiter pollen, deklariere die ' +
  'Wartestellung mit `node scripts/batch-in-flight.mjs --waiting-on ...`. PUNKT-GRENZE (27.07.2026): der ' +
  'Kontext ist der groesste Kostenfaktor des Batches — wenn der gemergte und abgehakte Punkt fertig ist ' +
  'UND kein delegierter Agent mehr laeuft (Pool erst leerlaufen lassen), fuehre `node ' +
  'scripts/batch-boundary.mjs <punkt>` aus und BEENDE die Session, statt den naechsten Punkt in denselben ' +
  'Kontext zu ziehen; der OS-Task startet die naechste Session. Halte sonst NICHT still an. Wenn ein git ' +
  'push scheitert, schreibe .claude/push-failed und benachrichtige via scripts/notify.mjs. WICHTIG: Wenn ' +
  'der SessionStart-Hook meldet, dass eine ANDERE Session den Batch-Lock haelt (STAND DOWN), dann arbeite ' +
  'NICHT am Batch und beende dich sofort. Wenn alles erledigt ist: Closing fahren.'

/**
 * The argv the launcher hands to claude.exe. PURE.
 *
 * --dangerously-skip-permissions: the resurrected session is HEADLESS (-p) and
 * unattended, so it can neither show a permission prompt nor have one answered. A
 * bare "Bash" allow does NOT blanket-approve novel command shapes in this harness,
 * and defaultMode "dontAsk" is the settings ceiling.
 */
export function buildSpawnArgs({ prompt = RESUME_PROMPT, model = SPAWN_MODEL, fallbackModel = SPAWN_FALLBACK_MODEL } = {}) {
  return ['-p', prompt, '--model', model, '--fallback-model', fallbackModel, '--dangerously-skip-permissions']
}

/**
 * The spawn options, ENVIRONMENT INCLUDED. PURE.
 *
 * The launcher passed no `env` at all until point 402, so the spawned session
 * inherited the runtime's 600-second background-task ceiling and shot itself ten
 * minutes into every delegated build. The child now always carries the ceiling
 * explicitly — `0` (wait indefinitely) unless HOA_BG_WAIT_CEILING_MS names
 * another value.
 */
export function buildSpawnOptions({ cwd, stdio, env = process.env } = {}) {
  const override = env?.[BG_WAIT_CEILING_OVERRIDE_ENV]
  const ceiling = typeof override === 'string' && override.trim() !== '' ? override.trim() : BG_WAIT_CEILING_DEFAULT
  return {
    cwd,
    detached: true,
    stdio,
    windowsHide: true,
    env: { ...env, [BG_WAIT_CEILING_ENV]: ceiling },
  }
}

// --- THE LEDGER OF SPAWNS (four-eyes review 28.07.2026, finding 1.4) ----------
//
// "Wait indefinitely" has a cost the ceiling used to pay for: a `claude -p` whose
// turn ended while a background task never exits — a dev server left running is
// routine here — used to be terminated at 600 s. Now it waits forever, and after
// a HANDOVER the launcher OVERWRITES `state.lastPid`, so nothing tracks it any
// more. A leaked session holds ports, which breaks the next session's verify
// suites, and holds memory for as long as the machine is up.
//
// So the launcher keeps a short LEDGER of what it spawned, with the moment it
// spawned it, and reaps from that instead of from a single overwritten pid. It is
// deliberately narrow: identity is pid AND start time (`isOwnSpawn`), an entry
// must be well past its boot window, it must not be the lock owner or the child a
// pending-spawn lock names, and it must be SUPERSEDED — either someone else holds
// the lock now, or the launcher has spawned again since. That last clause is what
// keeps a lock file that merely went missing from turning a healthy worker into a
// target.

/** How many spawns the ledger remembers. Small on purpose: it exists to find a
 *  leak within a tick or two, not to keep a history. */
export const SPAWN_LEDGER_MAX = 8

/** A spawn may not be reaped until it is well past its boot window — the same
 *  bound the pre-existing rogue-spawn remediation uses. */
export const SPAWN_REAP_MIN_AGE_MS = 10 * 60 * 1000

/** Append a spawn to the ledger. PURE: returns a new array, newest last, one
 *  entry per pid (a recycled pid replaces the stale entry), capped. */
export function recordSpawn(spawns, { pid, at }) {
  const kept = (Array.isArray(spawns) ? spawns : []).filter(
    (s) => s && typeof s.pid === 'number' && typeof s.at === 'number' && s.pid !== pid,
  )
  kept.push({ pid, at })
  return kept.slice(-SPAWN_LEDGER_MAX)
}

/**
 * WHICH LEDGER ENTRIES ARE LEAKED PROCESSES THE LAUNCHER MAY REAP? PURE —
 * `probePid` and `isOwnSpawn` are injected.
 *
 * Inputs: the ledger, `now`, the current lock (for its pid and its pending-spawn
 * child), and the probe. Returns [{ pid, at, ageMs }] — every one of them a
 * process this launcher started, that is still alive under the same identity, and
 * that is provably not the session doing the work.
 */
export function reapableSpawns({
  spawns,
  now,
  lock = null,
  probePid,
  isOwnSpawn,
  minAgeMs = SPAWN_REAP_MIN_AGE_MS,
} = {}) {
  const entries = (Array.isArray(spawns) ? spawns : []).filter(
    (s) => s && typeof s.pid === 'number' && s.pid > 0 && typeof s.at === 'number',
  )
  const lockPid = typeof lock?.pid === 'number' && lock.pid > 0 ? lock.pid : null
  const pendingChild = lock?.kind === 'pending-spawn' && typeof lock.spawnedPid === 'number' ? lock.spawnedPid : null
  const newest = entries.reduce((m, s) => Math.max(m, s.at), 0)
  const out = []
  for (const s of entries) {
    if (s.pid === lockPid || s.pid === pendingChild) continue
    if (now - s.at <= minAgeMs) continue
    // Superseded: somebody else owns the batch now, or a later spawn exists. A
    // sole, unsuperseded spawn with no readable lock is left alone — it may be a
    // healthy worker whose lock file the launcher simply could not read.
    if (!(lockPid !== null || s.at < newest)) continue
    if (!isOwnSpawn({ pid: s.pid, probe: probePid(s.pid), lastSpawnPid: s.pid, lastSpawnAt: s.at })) continue
    out.push({ pid: s.pid, at: s.at, ageMs: now - s.at })
  }
  return out
}

/** Drop entries whose process is gone, so the ledger does not accumulate. PURE. */
export function pruneSpawns({ spawns, probePid } = {}) {
  return (Array.isArray(spawns) ? spawns : []).filter(
    (s) => s && typeof s.pid === 'number' && typeof s.at === 'number' && probePid(s.pid)?.exists === true,
  )
}
