// Refresh the retrospective's auto-generated section
// (local/retrospektive-zusammenarbeit.md — git-ignored, German).
//
// Scans the durable problem/solution-history sources (feedback/project
// memories, guard scripts, git revert trail, process/meta TASKS points — see
// retro-sources.mjs), regenerates the marker-delimited AUTO-GENERATED table
// and records the sources fingerprint + a "last refreshed" timestamp inside
// the doc. The human/agent-authored analysis prose outside the markers is
// preserved byte-identical; an absent doc gets a minimal skeleton.
//
// The timestamps are MEASURED from the OS clock at run time (fine for a
// script — the never-estimate rule targets the workflow engine, not Node).
// The companion Stop-hook (retro-currency-guard.mjs) blocks turn-end while
// the recorded fingerprint no longer matches the sources, so running this
// script — and reviewing whether a NEW problem class needs its own prose —
// is enforced, not remembered.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { computeFingerprint, refreshedDoc } from './retro-core.mjs'
import { collectSources, DOC_PATH } from './retro-sources.mjs'
import { berlinStamp } from './timestamp-guard-core.mjs'

try {
  const sources = collectSources()
  const now = new Date()
  const existing = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, 'utf8') : null
  const next = refreshedDoc(existing, sources, {
    refreshedStamp: berlinStamp(now),
    refreshedIso: now.toISOString(),
  })
  mkdirSync(dirname(DOC_PATH), { recursive: true })
  writeFileSync(DOC_PATH, next)

  const fp = computeFingerprint(sources)
  console.log(
    `${existing == null ? 'created skeleton' : 'refreshed auto section'}: ${DOC_PATH}\n` +
      `sources: ${sources.memories.length} memories, ${sources.guards.length} guard/hook scripts, ` +
      `${sources.reverts.length} revert commits, ${sources.processPoints.length} process TASKS points\n` +
      `fingerprint: ${fp}`,
  )
  console.log(
    'REVIEW: if a source added a NEW problem class, give it a prose paragraph ' +
      '(German, outside the markers) — the table row alone is not the analysis.',
  )
} catch (e) {
  console.error(`retro-refresh failed: ${e && e.message}`)
  process.exit(1)
}
