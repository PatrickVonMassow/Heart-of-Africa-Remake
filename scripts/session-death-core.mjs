// Pure reading of "why did the interactive session die" out of the batch
// journal and the machine's own counters (user question, 05.09.2026 — the
// fourth time the same exit 143 was investigated by hand).
//
// It DECIDES NOTHING and blocks nothing: it lines up the facts that separate the
// three explanations the transcript keeps confusing with one another —
//   · a container/VS Code restart   → PID 1 is younger than the death
//   · the machine running out       → cgroup oom_kill counted something
//   · our own boundary or a signal  → neither of the above, and the journal's
//                                     cause row says which of the two it was
// A clean SessionEnd hook proves NOTHING about who started the shutdown: an
// external SIGTERM runs the same path as a deliberate exit, so `owner-release`
// is the shutdown doing its job, never evidence that the session chose to stop.
import { parseActivityJournal } from './batch-activity-journal-core.mjs'

/** The exit-shaped rows, newest first. PURE. */
export function sessionExits(journalText = '', { limit = 10 } = {}) {
  return (parseActivityJournal(journalText).records ?? [])
    .filter((row) => row?.event === 'process-exit' || row?.event === 'handover')
    .sort((a, b) => Date.parse(b?.at ?? 0) - Date.parse(a?.at ?? 0))
    .slice(0, Math.max(0, limit))
    .map((row) => ({
      at: row.at ?? '',
      event: row.event,
      pid: row.pid ?? null,
      session: row.session ?? '',
      cause: row.cause ?? '',
      explicit: row?.evidence?.explicit === true,
    }))
}

/** What the three explanations say about ONE death. PURE — every input is
 *  measured by the caller, so the verdict can be re-derived from the numbers
 *  the report prints beside it. */
export function explainDeath({ death = null, containerStartedAtMs = 0, oomKills = 0, freeMb = null } = {}) {
  if (!death?.at) return { verdict: 'no-death-row', reasons: ['the journal carries no exit row to explain'] }
  const deathMs = Date.parse(death.at)
  const reasons = []
  const restarted = containerStartedAtMs > 0 && containerStartedAtMs > deathMs
  if (restarted) reasons.push('the container started AFTER this exit — everything inside it was torn down')
  else if (containerStartedAtMs > 0) {
    reasons.push(`the container predates the exit by ${Math.round((deathMs - containerStartedAtMs) / 60000)} min — no restart`)
  }
  if (Number(oomKills) > 0) reasons.push(`the cgroup counted ${oomKills} OOM kill(s) — the machine ran out`)
  else reasons.push('the cgroup counted no OOM kill — the machine did not run out')
  if (freeMb != null) reasons.push(`${freeMb} MB were still available`)
  const verdict = restarted
    ? 'container-restart'
    : Number(oomKills) > 0
      ? 'out-of-memory'
      : death.cause === 'context-boundary'
        ? 'our-own-boundary'
        : 'signalled-or-self-exit'
  if (verdict === 'signalled-or-self-exit') {
    reasons.push(
      `the journal's cause is "${death.cause || 'none'}"${death.explicit ? ' (explicit)' : ''} — the shutdown path ran, ` +
        'which an external SIGTERM does exactly as a deliberate exit does, so this row names the shutdown, not its sender',
    )
  }
  return { verdict, reasons }
}
