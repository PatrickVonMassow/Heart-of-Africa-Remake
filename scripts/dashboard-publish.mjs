// LEGACY (claude.ai artifact, retired 29.07.2026) — the board's transport is
// `scripts/board-publish.mjs`, which pushes the live page from every session.
// The user moved their bookmark on 29.07.2026 and the mirror is no longer kept,
// so nothing in the normal loop calls this script. It survives for ONE reason:
// `--defer` is the logged escape valve an offline session uses to satisfy the
// publish invariant, and `--confirm-published` still honours an old mirror
// record. Do not send a session here to publish — see the board contract
// (memory batch-dashboard-artifact).
//
//   node scripts/dashboard-publish.mjs --defer "<reason>"   # offline valve
//   node scripts/dashboard-publish.mjs                      # repo copy → local copy
//
// The default copy targets an explicit `--to` path or the session scratchpad;
// it is what remains of the two-file sync the mirror needed.
//
//   --confirm-published   manual attestation fallback (only if the automatic
//                         detection missed a REAL publish — never to skip one)
//   --defer "<reason>"    logged escape valve for a session that cannot reach
//                         the live page; covers the CURRENT content only —
//                         any further edit re-blocks.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT, STATE_PATH, readJson, mergeState, sha256File } from './dashboard-state.mjs'
import { refreshFooter } from './board-core.mjs'
import { structureViolations } from './board-structure-core.mjs'
import { parseTasks } from './dashboard-guard-core.mjs'

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
  console.log('Use this ONLY after a real publish the automatic detection missed.')
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

// The footer's date and open-point count are derived, not typed: every tick
// otherwise left a stale figure that the audit refused two steps later, after
// the publish. Same parse as the audit, so the two cannot disagree.
try {
  const html = readFileSync(repoFile, 'utf8')
  const { open } = parseTasks(readFileSync(resolve(REPO_ROOT, 'TASKS.md'), 'utf8'))
  const refreshed = refreshFooter(html, { openCount: open.length })
  if (refreshed !== html) {
    writeFileSync(repoFile, refreshed)
    console.log(`footer refreshed: ${open.length} open point(s)`)
  }
} catch (e) {
  // A publish must never be blocked by the footer; the audit still catches a
  // stale one, and saying why beats failing silently.
  console.error(`dashboard-publish: footer not refreshed (${e.message})`)
}

// STRUCTURE BEFORE PUBLISH (28.07.2026): the consistency audit runs at
// --synced, which is AFTER the publish, so a board broken by an edit reached the
// reader and was repaired afterwards — three times in one evening. A malformed
// board must not be copyable out at all, so the gate sits here too. Structure
// only; the audit keeps owning content and freshness.
const broken = structureViolations(readFileSync(repoFile, 'utf8'))
if (broken.length) {
  console.error(`dashboard-publish REFUSED — the board is structurally broken (${broken.length}):`)
  for (const v of broken) console.error(`  [${v.code}] ${v.msg}`)
  console.error('Repair the markup first. Do NOT reorder cards with text replacement —')
  console.error('use scripts/board.mjs, which edits whole cards and cannot move a closing tag.')
  process.exit(1)
}

copyFileSync(repoFile, target)
const hash = sha256File(repoFile)
mergeState({ scratchpadPath: target, syncHash: hash, fileSyncedAt: Date.now() })
console.log(`synced ${repoFile}\n    -> ${target} (sha256 ${String(hash).slice(0, 12)}…)`)
console.log('NEXT (the live transport, not this copy): node scripts/board-publish.mjs, then run:')
console.log(`  node scripts/dashboard-guard.mjs --synced ${state.dashboardPath ?? repoFile}`)
