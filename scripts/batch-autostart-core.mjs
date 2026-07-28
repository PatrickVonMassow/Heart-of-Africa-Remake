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
