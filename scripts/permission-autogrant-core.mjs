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

// WHAT THIS DELIBERATELY DOES NOT DO (11.08.2026). Both reviewers proposed going
// further and having the hook flip the SESSION's permission mode, so the auto-mode
// classifier stops judging at all. That is refused: the classifier is a safety gate
// above our allowlist, and a hook that switches it off is circumvention, not
// configuration. This hook only answers the question the harness was about to put to
// the user, with the answer the user has standing on record. Where the classifier
// DENIES a call outright, that denial stands — it never becomes a permission request
// and never reaches here. Turning the classifier off is the user's own decision to
// make in his editor settings, knowingly, not something a script does behind him.

/**
 * Tool calls that keep asking even under a blanket grant.
 *
 * A bare "allow" answers the question "may this run?" — which is not what these two
 * ask. `AskUserQuestion` IS the user's answer, and an approval without one grants an
 * empty reply; `ExitPlanMode` needs the plan decision itself. Granting them blind
 * would not unblock an unattended run, it would feed it a hollow answer, which is
 * worse than the stall it was meant to prevent (found by GPT-5.6 Sol, 11.08.2026).
 */
const ALWAYS_ASK = ['AskUserQuestion', 'ExitPlanMode']

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
 * THE SHAPE IS THE WHOLE POINT, and the first version got it wrong. `PermissionRequest`
 * grants through a `decision` OBJECT; the flat `permissionDecision` field belongs to
 * `PreToolUse`. Emitting the flat field here is not an error the harness reports — the
 * output is simply ignored and the dialog appears anyway, which is exactly what happened:
 * the hook was registered and firing while the user kept being asked. Both reviewers
 * (GPT-5.6 Sol and Fable 5, independently, 11.08.2026) named this before anything else.
 *
 * @param {ReturnType<typeof decide>} verdict
 * @returns {string}
 */
export function render(verdict) {
  if (!verdict) return ''
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: verdict.decision },
      permissionDecisionReason: verdict.reason,
    },
  })
}
