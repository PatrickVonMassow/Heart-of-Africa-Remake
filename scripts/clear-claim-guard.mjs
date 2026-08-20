// Stop hook: refuse a turn that invites a `/clear` while this session still
// claims the batch (user mandate 20.08.2026, after he caught exactly that state
// by hand). The decision is pure and lives in clear-claim-guard-core.mjs.
//
// FAIL DIRECTION, opposite to the timestamp guard's: this one allows whenever it
// cannot see the state. It refuses ONE specific combination — a live claim of
// THIS session plus an invitation in the reply — and both halves have to be read
// to know it. A guard that blocked on an unreadable transcript would stop turns
// that have nothing to do with the batch.
//
// It reuses `extractLastAssistantText` rather than copying the transcript rule.
// That helper can return the previous text block when the final reply has not
// been flushed yet (filed 20.08.2026); here the cost of that race is a missed
// block, never a false one, and the claim state — the half that actually
// matters — is read live from disk.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractLastAssistantText } from './timestamp-guard-core.mjs'
import { evaluate } from './clear-claim-guard-core.mjs'

const CLAIM_PATH =
  process.env.BATCH_CLAIM_PATH ||
  fileURLToPath(new URL('../.claude/batch-claim.json', import.meta.url))

function readClaim() {
  try {
    return JSON.parse(readFileSync(CLAIM_PATH, 'utf8'))
  } catch {
    // No claim file is the ordinary state: a withdrawn claim is a deleted file.
    return null
  }
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return // nothing readable to judge
  }
  const sessionId = (payload && payload.session_id) || ''
  const claim = readClaim()
  // Cheapest half first: without a standing claim of this session there is
  // nothing to refuse, and the transcript need not be read at all.
  if (!claim || !sessionId) return
  const transcriptPath = payload && payload.transcript_path
  if (!transcriptPath || !existsSync(transcriptPath)) return
  let lastText
  try {
    lastText = extractLastAssistantText(readFileSync(transcriptPath, 'utf8'))
  } catch {
    return
  }
  const verdict = evaluate({ lastText: lastText ?? '', claim, sessionId })
  if (verdict) process.stdout.write(JSON.stringify(verdict) + '\n')
}

try {
  main()
} catch {
  // A guard that cannot run must not stop unrelated work: see the fail
  // direction above. The state it watches is re-read every turn, so a
  // transient failure costs at most one unguarded turn.
}
