// Stop hook (user mandate 23.07.2026, ninth escalation of the chat-timestamp
// rule): GUARANTEE every chat reply begins with the bold Europe/Berlin
// timestamp ("**Donnerstag, 23.07.2026, 09:55**"). Reminders, memory entries
// and the soft user-global nudge hook all failed repeatedly, so this guard
// BLOCKS turn-end while the last assistant reply lacks a current stamp — the
// block reason hands the exact line to copy verbatim, so compliance is one
// paste away. The decision logic lives in timestamp-guard-core.mjs (pure,
// Vitest-covered, same ICU formatting as the UserPromptSubmit injection hook
// scripts/hooks/berlin-timestamp.cjs).
//
// Fail-direction (explicit user requirement): err toward BLOCKING, not toward
// letting a missing stamp slip. A missing or stale stamp blocks every time,
// including repeats — the assistant must fix the reply, never wait the guard
// out. The ONE bounded escape exists only for a transcript the guard cannot
// read/parse at all (the assistant cannot fix that by complying): after
// MAX_UNVERIFIABLE_BLOCKS consecutive unverifiable blocks in the same session
// it allows LOUDLY (stderr + systemMessage), so a broken harness path cannot
// trap the session in an infinite block loop.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { berlinStamp, evaluate, extractLastAssistantText } from './timestamp-guard-core.mjs'

// Overridable for the test harness so tests never touch the live state file.
const STATE_PATH =
  process.env.TIMESTAMP_GUARD_STATE ||
  fileURLToPath(new URL('../.claude/timestamp-guard-state.json', import.meta.url))
const MAX_UNVERIFIABLE_BLOCKS = 3

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    writeFileSync(STATE_PATH, JSON.stringify(state))
  } catch {
    // state is only the loop-escape counter — losing it means blocking again,
    // which is the safe direction here
  }
}

/** Block turn-end because the transcript could not be verified — bounded per
 *  session so an unreadable transcript can never loop forever. */
function blockUnverifiable(sessionId, detail) {
  const state = readState()
  const failures = state.sessionId === sessionId ? Number(state.failures) || 0 : 0
  const expected = `**${berlinStamp()}**`
  if (failures >= MAX_UNVERIFIABLE_BLOCKS) {
    console.error(
      `timestamp-guard: transcript still unverifiable after ${failures} blocks ` +
        `(${detail}) — allowing stop to avoid an infinite loop. FIX THE GUARD/TRANSCRIPT PATH.`,
    )
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          `timestamp-guard could not verify the reply timestamp (${detail}) and ` +
          `has released the block after ${failures} attempts. The chat-timestamp ` +
          `rule still binds: begin every reply with e.g. ${expected}`,
      }) + '\n',
    )
    return
  }
  writeState({ sessionId, failures: failures + 1, lastFailureAt: Date.now() })
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `Chat-timestamp rule: the guard could not read the transcript to verify ` +
        `your reply (${detail}). Do not end the turn silently — write your closing ` +
        `reply to the user, beginning with exactly this line: ${expected}`,
    }) + '\n',
  )
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    // garbled/missing stdin is itself an unverifiable state — handled below
  }
  const sessionId = (payload && payload.session_id) || ''
  const transcriptPath = payload && payload.transcript_path

  if (!transcriptPath || !existsSync(transcriptPath)) {
    blockUnverifiable(sessionId, 'transcript path missing or not found')
    return
  }

  let lastText
  try {
    lastText = extractLastAssistantText(readFileSync(transcriptPath, 'utf8'))
  } catch (e) {
    blockUnverifiable(sessionId, `transcript unreadable: ${e && e.message}`)
    return
  }
  if (lastText === null) {
    blockUnverifiable(sessionId, 'no assistant reply text found in the transcript')
    return
  }

  // Transcript readable — reset the escape counter; from here the guard
  // blocks unconditionally on every violation (the fix is always in the
  // assistant's power: prepend the stamp handed over in the reason).
  writeState({ sessionId, failures: 0 })
  const verdict = evaluate({ lastText })
  if (verdict) process.stdout.write(JSON.stringify(verdict) + '\n')
}

try {
  main()
} catch (e) {
  // Even an internal guard bug must not let the rule slip silently: block
  // once through the bounded path (so a persistent bug still cannot trap
  // the session past the escape counter).
  try {
    blockUnverifiable('', `internal guard error: ${e && e.message}`)
  } catch {
    process.stdout.write(
      JSON.stringify({
        decision: 'block',
        reason:
          'Chat-timestamp rule: the timestamp guard failed internally. Begin your ' +
          'closing reply with the current bold Berlin timestamp ' +
          '(**Wochentag, TT.MM.JJJJ, HH:MM**).',
      }) + '\n',
    )
  }
}
