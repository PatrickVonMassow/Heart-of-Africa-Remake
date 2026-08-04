// Stop hook (user 04.08.2026, memory container-work-is-mine): the outgoing
// answer may not hand the USER a step that runs inside the dev container. He
// granted this session full rights for it; an install, a package manager, a
// script invocation or a file edit under the workspace is ours to perform. What
// stays allowed is asking for a CAPABILITY the container does not have at all —
// a right, a device, a mount, a line in the image — because a guard that
// blocked those would push the session into failing silently instead of asking.
//
// The decision logic lives in container-ask-guard-core.mjs (pure,
// Vitest-covered). This wrapper only reads the hook payload and the transcript,
// and is fail-OPEN: any missing input, any throw at all allows the stop, so a
// guard bug can never trap the session. It is deliberately NOT the timestamp
// guard's block-on-unverifiable shape — an unreadable transcript here means the
// guard has nothing to judge, not that a rule was broken.
//
// Manual check (the four-eyes review's way in):
//   node scripts/container-ask-guard.mjs --check <file-with-answer-text>
import { existsSync, readFileSync } from 'node:fs'
import { evaluate } from './container-ask-guard-core.mjs'
import { extractLastAssistantText } from './timestamp-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { repoPath } from './repo-paths.mjs'

const PAUSE = repoPath('.claude', 'batch-paused')

/**
 * The guard's I/O half: the last assistant message of this session's transcript.
 *
 * Stands down for a paused batch and for a session that does not own the batch
 * lock — the house rule every guard here follows. The second one also keeps the
 * guard off SUBAGENT turns, whose "answer" goes to the parent session and not to
 * the user, so a command handed over there is a work instruction, not a
 * hand-back.
 *
 * Registered with guard-preflight.mjs so the Stop chain stays spawn-tested, but
 * it can only ever stand down there: the answer this judges is composed AFTER a
 * preflight runs, and a preflight has no transcript path to hand it. The `why`
 * says so rather than reading as a clean bill.
 */
export function gatherContainerAskInputs({ sessionId = '', transcriptPath = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  if (!transcriptPath) {
    return {
      applicable: false,
      why: 'no transcript handed over — the answer this judges is composed after a preflight runs, ' +
        'so only the Stop hook itself can judge it',
    }
  }
  if (!existsSync(transcriptPath)) {
    return { applicable: false, why: 'no readable transcript — nothing to judge' }
  }
  // KNOWN AND ACCEPTED (four-eyes review, 04.08.2026): this returns the FIRST
  // text block of the last assistant message, so a demand in a second text block
  // of the same message is not seen. The shared reader is the timestamp guard's,
  // which needs exactly the reply's OPENING, and forking it here would give this
  // project two answers to "what did the assistant say". The miss direction is
  // ALLOW, so the gap costs a missed block, never a false one.
  const lastText = extractLastAssistantText(readFileSync(transcriptPath, 'utf8'))
  if (lastText === null) return { applicable: false, why: 'no assistant reply text in the transcript' }
  return { applicable: true, inputs: { lastText } }
}

if (isMainModule(import.meta.url)) {
  try {
    const checkAt = process.argv.indexOf('--check')
    if (checkAt >= 0) {
      const file = process.argv[checkAt + 1]
      const verdict = evaluate({ lastText: file ? readFileSync(file, 'utf8') : '' })
      console.log(verdict.block ? `WOULD BLOCK: ${verdict.reason}` : 'container-ask-guard: OK')
      process.exit(0)
    }

    let payload = {}
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      /* no/garbled stdin (manual run) — there is then no transcript to judge */
    }

    const gathered = gatherContainerAskInputs({
      sessionId: (payload && payload.session_id) || '',
      transcriptPath: (payload && payload.transcript_path) || '',
    })
    if (!gathered.applicable) process.exit(0)

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`container-ask-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
