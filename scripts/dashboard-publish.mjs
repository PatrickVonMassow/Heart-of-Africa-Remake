// One-step dashboard publish preparation — kills the two-file staleness class:
// the repo copy (.batch-dashboard.html, the working copy) and the scratchpad
// copy (what the Artifact tool actually publishes) are two files, so "I updated
// the file" could silently mean "the phone still shows the old board". This
// script makes the sync mechanical and the publish state OBSERVABLE:
//
//   node scripts/dashboard-publish.mjs            # repo copy → scratchpad copy
//   <Artifact tool: publish the scratchpad file, same artifact url>
//   node scripts/dashboard-guard.mjs --synced <repo dashboard path>
//
// The PostToolUse heartbeat (lock-heartbeat-hook.mjs) sees the Artifact call
// and records the published content's hash in dashboard-state.json; the Stop
// guard then requires repo-file hash == published hash (invariant 9), so an
// edited-but-unpublished board blocks the turn from ending.
//
//   --confirm-published   manual attestation fallback (only if the automatic
//                         detection missed a REAL publish — never to skip one)
//   --defer "<reason>"    logged escape valve for sessions that genuinely lack
//                         the Artifact tool (headless resume); covers the
//                         CURRENT content only — any further edit re-blocks.
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT, STATE_PATH, readJson, mergeState, sha256File } from './dashboard-state.mjs'

const state = readJson(STATE_PATH) ?? {}
const repoFile = resolve(REPO_ROOT, state.dashboardPath ?? '.batch-dashboard.html')
const arg = process.argv[2]

if (!existsSync(repoFile)) {
  console.error(`dashboard-publish: repo dashboard not found: ${repoFile}`)
  process.exit(1)
}

if (arg === '--confirm-published') {
  const hash = sha256File(repoFile)
  mergeState({ publishedHash: hash, publishedAt: Date.now(), publishedBy: 'manual', publishDeferred: undefined })
  console.log(`published content attested manually (sha256 ${String(hash).slice(0, 12)}…).`)
  console.log('Use this ONLY after a real Artifact publish the automatic detection missed.')
  process.exit(0)
}

if (arg === '--defer') {
  const reason = process.argv[3]
  if (!reason) {
    console.error('dashboard-publish --defer: a reason is required')
    process.exit(1)
  }
  mergeState({ publishDeferred: { at: Date.now(), reason, repoHash: sha256File(repoFile) } })
  console.log(`publish DEFERRED (${reason}) — covers the current content only; republish at the first chance.`)
  process.exit(0)
}

if (arg && arg !== '--to') {
  console.error(
    'usage: node scripts/dashboard-publish.mjs [--to <scratchpad path>] | --confirm-published | --defer "<reason>"',
  )
  process.exit(1)
}

// Default: sync repo → scratchpad. Target resolution order: explicit --to, the
// session's scratchpad (env), the last recorded target (kept current by the
// UserPromptSubmit hook, so a plain Bash call works without the env).
const target =
  (arg === '--to' && process.argv[3]) ||
  (process.env.CLAUDE_SCRATCHPAD_DIR ? resolve(process.env.CLAUDE_SCRATCHPAD_DIR, 'hoa-batch-dashboard.html') : null) ||
  state.scratchpadPath
if (!target) {
  console.error(
    'dashboard-publish: no scratchpad target known — pass --to <path> (the session scratchpad file ' +
      'hoa-batch-dashboard.html).',
  )
  process.exit(1)
}

copyFileSync(repoFile, target)
const hash = sha256File(repoFile)
mergeState({ scratchpadPath: target, syncHash: hash, fileSyncedAt: Date.now() })
console.log(`synced ${repoFile}\n    -> ${target} (sha256 ${String(hash).slice(0, 12)}…)`)
console.log('NEXT: publish that file via the Artifact tool (same artifact url), then run:')
console.log(`  node scripts/dashboard-guard.mjs --synced ${state.dashboardPath ?? repoFile}`)
