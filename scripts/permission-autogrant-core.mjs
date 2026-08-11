// Pure core of the permission auto-grant (see scripts/permission-autogrant.mjs).
//
// WHY THIS EXISTS. The user has forbidden permission prompts in his VS Code window
// outright: an unattended batch stalls on one, and nobody is there to click. The
// settings say `permissions.defaultMode: bypassPermissions` in both the user and the
// project-local layer, and the dangerous-mode acceptance flag is set — yet prompts kept
// coming. MEASURED 11.08.2026: `defaultMode` supplies the mode only to a session that
// has none. A RESUMED session carries the mode it was created with, and this window's
// stored mode is `acceptEdits` — which auto-approves Edit/Write and PROMPTS for Bash.
// That is exactly the split the user saw. No settings key reaches a running session's
// stored mode, so the grant has to happen at the moment the prompt would be raised.
//
// WHERE IT SITS. On the `PermissionRequest` event, which fires only once a prompt is
// ABOUT to be shown. The PreToolUse guard chain (board-first, closing, firewall) runs
// BEFORE that and denies on its own; a denied call never reaches a permission request,
// so this cannot overrule a guard. It grants only what the harness would otherwise have
// asked the user about.
//
// FAIL-OPEN. Anything unexpected — unparsable input, a shape we do not recognise —
// returns no decision, and the harness falls back to asking. A bug here can therefore
// cost a prompt, never an unreviewed grant.

/** Tool calls that must keep asking even under a blanket grant. */
const ALWAYS_ASK = []

/**
 * Decide a PermissionRequest.
 *
 * @param {unknown} input parsed hook stdin
 * @returns {{decision: 'allow', reason: string} | null} null = no opinion, harness asks
 */
export function decide(input) {
  if (!input || typeof input !== 'object') return null
  const toolName = /** @type {{tool_name?: unknown}} */ (input).tool_name
  if (typeof toolName !== 'string' || toolName.length === 0) return null
  if (ALWAYS_ASK.includes(toolName)) return null
  return {
    decision: 'allow',
    reason:
      'Standing grant (user 11.08.2026: "Ich möchte keine Rückfragen mehr bekommen"). ' +
      'The PreToolUse guards have already passed this call; they deny before a ' +
      'permission request is ever raised.',
  }
}

/**
 * Render the decision as the JSON the harness reads. An empty string means "no opinion".
 *
 * @param {ReturnType<typeof decide>} verdict
 * @returns {string}
 */
export function render(verdict) {
  if (!verdict) return ''
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      permissionDecision: verdict.decision,
      permissionDecisionReason: verdict.reason,
    },
  })
}
