// Pure decision logic for the CI-status Stop hook (ci-status-guard.mjs).
// Classifies the GitHub Actions runs for the pushed HEAD sha and decides
// block/notify. No I/O, never throws — Vitest-covered in
// ci-status-guard-core.test.mjs. Accepts both the `gh run list --json` field
// names (databaseId/headSha/workflowName/url) and the REST API's
// (id/head_sha/name/html_url), since the wrapper feeds the REST shape today
// and gh's shape if that CLI ever gets installed.

const FAILED_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure'])
const OK_CONCLUSIONS = new Set(['success', 'neutral', 'skipped'])

function runSha(r) {
  return String((r && (r.headSha ?? r.head_sha)) ?? '')
}
function runId(r) {
  return (r && (r.databaseId ?? r.id)) ?? null
}
function runName(r) {
  return String((r && (r.workflowName ?? r.name)) ?? 'workflow')
}
function runUrl(r) {
  return String((r && (r.url ?? r.html_url)) ?? '')
}

/**
 * Classify the CI state for `headSha` from a list of workflow runs.
 * Per workflow only the NEWEST run counts (a green re-run supersedes its red
 * predecessor). Across workflows: any red → 'failed'; else any unfinished →
 * 'pending'; else any green → 'success'; else 'none' (fail-open).
 * @returns {{state:'failed'|'pending'|'success'|'none', runId?, workflowName?, conclusion?, url?}}
 */
export function classifyRuns(runs, headSha) {
  try {
    if (!Array.isArray(runs) || !headSha) return { state: 'none' }
    const mine = runs.filter((r) => runSha(r) === headSha)
    if (mine.length === 0) return { state: 'none' }

    const newestPerWorkflow = new Map()
    for (const r of mine) {
      const key = runName(r)
      const prev = newestPerWorkflow.get(key)
      if (!prev || Number(runId(r) ?? 0) > Number(runId(prev) ?? 0)) newestPerWorkflow.set(key, r)
    }

    let pending = null
    let success = null
    for (const r of newestPerWorkflow.values()) {
      const status = String(r?.status ?? '')
      const conclusion = String(r?.conclusion ?? '')
      if (status !== 'completed') {
        pending = r // queued / in_progress / waiting — CI still deciding
        continue
      }
      if (FAILED_CONCLUSIONS.has(conclusion)) {
        return {
          state: 'failed',
          runId: runId(r),
          workflowName: runName(r),
          conclusion,
          url: runUrl(r),
        }
      }
      if (OK_CONCLUSIONS.has(conclusion)) success = r
      // unknown conclusion (stale, action_required, …) → counts as nothing (fail-open)
    }
    if (pending) return { state: 'pending', runId: runId(pending), workflowName: runName(pending) }
    if (success) return { state: 'success', runId: runId(success), workflowName: runName(success) }
    return { state: 'none' }
  } catch {
    return { state: 'none' } // pure fail-open — a guard bug never blocks
  }
}

/** Only a confirmed red blocks; pending/success/none/unknown all allow. */
export function shouldBlock(state) {
  return state === 'failed'
}

/** Push exactly once per failing sha (the state file remembers the last one). */
export function shouldNotify(state, alreadyNotifiedSha, headSha) {
  return state === 'failed' && Boolean(headSha) && alreadyNotifiedSha !== headSha
}

/** The Stop-block reason: name the run, the evidence trail and the way out. */
export function blockReason(classification, headSha) {
  const sha7 = String(headSha ?? '').slice(0, 7)
  const c = classification ?? {}
  return (
    `GitHub CI is RED for the pushed HEAD ${sha7}: workflow "${c.workflowName ?? '?'}" ` +
    `run ${c.runId ?? '?'} concluded "${c.conclusion ?? '?'}"${c.url ? ` — ${c.url}` : ''}. ` +
    `Reproduce the fast gate locally (npm run build && npm run lint && ` +
    `node scripts/audit-check.mjs && npm run test:unit), fix the cause, commit and push — ` +
    `CI green is part of done. (With gh installed: gh run view ${c.runId ?? '<id>'} --log-failed.) ` +
    `Only a fixing push (or the user pausing the batch via .claude/batch-paused) clears this.`
  )
}
