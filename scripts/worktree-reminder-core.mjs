// Pure decision logic of the worktree-reminder PreToolUse hook
// (worktree-reminder.mjs is the thin fail-open I/O wrapper). Kept
// side-effect-free and total so the Vitest layer can sweep every branch
// (scripts/worktree-reminder-core.test.mjs).
//
// Built 22.07.2026 after a session ran two parallel file-mutating subagents in
// the ONE shared working tree: both left uncommitted edits, the files
// entangled, and selective commits became fragile. The durable fix is
// `isolation: 'worktree'` on parallel implementation agents — each gets its own
// git worktree and can commit independently. This hook is the event-triggered
// reminder at the exact decision point (a memory note proved insufficient): it
// NEVER blocks a spawn, it only injects the rule into the model's context when
// a background Agent is spawned without worktree isolation.

/** The reminder injected as the PreToolUse permissionDecisionReason. */
export const REMINDER =
  "Parallel/background subagent: if it will EDIT files and another agent is " +
  "also editing, spawn it with isolation:'worktree' so each commits in its " +
  'own tree; otherwise keep agents on NON-OVERLAPPING files and have them ' +
  'leave work UNCOMMITTED for the parent to commit selectively.'

/**
 * Decide on a PreToolUse call: {toolName, toolInput}. Fires (non-blocking
 * allow + reminder) only for a BACKGROUND Agent spawn (`run_in_background`
 * absent or true — foreground spawns are serial and safe) that does not
 * already set `isolation: 'worktree'`. Everything else — other tools,
 * foreground agents, already-isolated agents, malformed input — is a silent
 * no-op ({}). Total: never throws.
 */
export function worktreeReminder(input) {
  try {
    const { toolName, toolInput } = input ?? {}
    if (toolName !== 'Agent') return {}
    if (!toolInput || typeof toolInput !== 'object') return {}
    if (toolInput.run_in_background === false) return {} // foreground: serial, no tree contention
    if (toolInput.isolation === 'worktree') return {} // already isolated — nothing to remind
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: REMINDER,
      },
    }
  } catch {
    return {} // total by contract — the wrapper's fail-open must never depend on luck
  }
}
