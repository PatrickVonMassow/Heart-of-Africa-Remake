// Refresh the retrospective's auto-generated section
// (docs/analysis_de/retrospektive-zusammenarbeit.md — git-ignored, German).
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
import { computeFingerprint, refreshedDoc, GUIDE_FINGERPRINT_RE } from './retro-core.mjs'
import { collectSources, DOC_PATH, GUIDE_PATH } from './retro-sources.mjs'
import { berlinStamp } from './timestamp-guard-core.mjs'

// --guide-reviewed: attest that the BEGINNER GUIDE was read against the current
// sources and corrected where it had gone stale. Deliberately a separate act,
// never a side effect of the refresh: the guide is pure prose, so a stamp set
// automatically would certify a review nobody performed (25.07.2026 — the guide
// carried a superseded rule for a day while the retrospective was current).
if (process.argv[2] === '--guide-reviewed') {
  try {
    if (!existsSync(GUIDE_PATH)) {
      console.error(`guide not found: ${GUIDE_PATH}`)
      process.exit(1)
    }
    const fp = computeFingerprint(collectSources())
    const stamp = `<!-- GUIDE-FINGERPRINT: ${fp} -->`
    const text = readFileSync(GUIDE_PATH, 'utf8')
    const next = GUIDE_FINGERPRINT_RE.test(text)
      ? text.replace(GUIDE_FINGERPRINT_RE, stamp)
      : `${text.replace(/\s*$/, '')}\n\n${stamp}\n`
    writeFileSync(GUIDE_PATH, next)
    console.log(`guide reviewed against the current sources (${fp.slice(0, 12)}…): ${GUIDE_PATH}`)
    process.exit(0)
  } catch (e) {
    console.error(`guide attestation failed: ${e && e.message}`)
    process.exit(1)
  }
}

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
  console.log(
    'THEN review the beginner guide (docs/analysis_de/vibe-coding-anleitung.md) against the same ' +
      'sources — it is prose only and cannot regenerate; when it is current, attest with: ' +
      'node scripts/retro-refresh.mjs --guide-reviewed',
  )
} catch (e) {
  console.error(`retro-refresh failed: ${e && e.message}`)
  process.exit(1)
}
