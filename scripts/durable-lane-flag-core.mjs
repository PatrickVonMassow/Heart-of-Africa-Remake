// THE ACTIVATION FLAG OF THE DURABLE AUTHORING LANE, and the interlock that keeps
// it off (work-order point 891, step 1; docs/handover-architecture.md, mechanism 2
// "Rollback: the REGIME IS THE DAEMON'S EXISTENCE").
//
// WHAT THE FLAG IS. It decides ONE thing: whether a daemon may be STARTED. It is
// not consulted per call and it never switches a caller's path — a flag read on
// each call lets a single mutation cross regimes, which is why the regime is a fact
// about the world (a live daemon means the new path, no daemon means today's) and
// the flag is only the door in front of it.
//
// WHY THE INTERLOCK EXISTS. Steps 1 to 4 deliver DURABLE EXECUTION: a worker that
// is not killed with its session. They do not deliver TRANSFERABLE SUPERVISION —
// fenced discovery, adoption and reconciliation are step 8, and a landing a
// successor can finish is step 9. Enabling the lane in between is worse than
// today's path, because a surviving worker whose work no successor can prove or
// land is work that looks alive and cannot be finished. So the refusal is CODE, not
// a habit: controlling what the board advertises does not control what somebody
// switches on.
//
// WHY THE MANIFEST IS A CONSTANT AND NOT A PROBE. A step is green when its
// mechanism review and its suites say so, and neither is readable at the moment a
// daemon starts. Marking a step green is therefore a reviewed code change carrying
// its evidence — which is exactly the gate this project already uses for a claim
// nobody can measure at runtime.

// The remainder of point 676 adds the checkpoint barrier and planned handover;
// their reviewed manifest evidence changes the allowed boundary mode below.

/** Every step of the ordered work, and what actually stands today. `evidence` is
 *  the commit-visible reason a step is green; a green step without one is a claim,
 *  and `activationDecision` refuses to count it. */
export const DURABLE_LANE_STEPS = Object.freeze({
  1: Object.freeze({ title: 'schemas and invariants', green: true, evidence: 'batch-schema-core unit invariants' }),
  2: Object.freeze({ title: 'durable state store', green: true, evidence: 'checksummed journal and atomic snapshot durability suites' }),
  3: Object.freeze({ title: 'daemon and Astra adapter', green: true, evidence: 'daemon lifecycle and detached-agent suites' }),
  4: Object.freeze({ title: 'transferable declarations and fencing', green: true, evidence: 'attempt lease and epoch fencing suites' }),
  8: Object.freeze({ title: 'successor startup and reconciliation', green: true, evidence: 'successor boundary, reconciliation, and adoption suites' }),
  9: Object.freeze({ title: 'crash-recoverable serial landing', green: true, evidence: 'staged landing recovery and serial lock suites' }),
  12: Object.freeze({ title: 'staged failure trials', green: true, evidence: 'parent-death negative control plus real daemon, worker, remote, worktree, marker, restart, and checkpoint-timeout drills' }),
})

/** The steps without which survivability may not be CLAIMED, and therefore may not
 *  be switched on. Steps 1 to 4 are necessary too, but they are not sufficient, and
 *  this list is the sufficiency condition. Steps 8 and 9 make survivability
 *  CLAIMABLE; step 12 makes it PROVEN on the real path by killing the spawning
 *  parent session and showing a fresh session discover, adopt and reconcile. Green
 *  mechanisms that have never faced a real session death are still an untested
 *  claim, and this file records which claims the project will make. */
export const STEPS_REQUIRED_FOR_ACTIVATION = Object.freeze([1, 2, 3, 4, 8, 9, 12])

/** The only mode the completed checkpoint and boundary mechanisms authorize. */
export const REQUIRED_BOUNDARY_MODE = 'checkpointed-handover'

/** Commit-visible evidence that the REQUIRED boundary mode is enforced, not
 *  merely named by the flag. This is separate from the ordered-work steps: the
 *  mode is an activation condition in its own right, and a reviewed change must
 *  turn this entry green only when the daemon-side admission fence exists. */
export const DURABLE_LANE_BOUNDARY_MECHANISM = Object.freeze({
  title: 'checkpointed two-phase boundary enforcement',
  green: true,
  evidence: 'checkpoint barrier, daemon epoch seal, durable receipts, and successor reconciliation suites',
})

/** Refuses enabling while any required step is not green, and names every step it
 *  is waiting for rather than the first one — an operator who fixes one at a time
 *  learns nothing from a refusal that moves. */
export function activationDecision({
  steps = DURABLE_LANE_STEPS,
  required = STEPS_REQUIRED_FOR_ACTIVATION,
  boundaryMode = null,
  boundaryMechanism = DURABLE_LANE_BOUNDARY_MECHANISM,
} = {}) {
  // AFFIRMATIVE, the same rule the liveness probes follow: `green` must BE `true`,
  // not merely truthy, and evidence must be a real string — a manifest that says
  // green: 'yes' is a claim in the wrong shape, and the wrong shape does not open
  // this door.
  const missing = required.filter((n) => {
    const step = steps[n]
    return !step || step.green !== true || typeof step.evidence !== 'string' || !step.evidence.trim()
  })
  if (missing.length) {
    const named = missing.map((n) => `${n} (${steps[n]?.title ?? 'unknown step'})`).join(', ')
    return { ok: false, missing, reason: `the durable lane may not be enabled while these steps are not green: ${named}` }
  }
  if (
    boundaryMechanism?.green !== true ||
    typeof boundaryMechanism?.evidence !== 'string' ||
    !boundaryMechanism.evidence.trim()
  ) {
    return {
      ok: false,
      missingBoundaryMechanism: true,
      reason: `the durable lane may not be enabled without green evidence for the boundary mechanism: ${boundaryMechanism?.title ?? 'checkpointed boundary enforcement'}`,
    }
  }
  if (boundaryMode !== REQUIRED_BOUNDARY_MODE) {
    return {
      ok: false,
      reason: `the durable lane may be enabled only with boundary mode ${REQUIRED_BOUNDARY_MODE}`,
    }
  }
  return { ok: true }
}

/** The one question the flag answers. A daemon may be started only when the flag is
 *  on AND the interlock allows the flag to be on — the second condition is checked
 *  again here, so a hand-edited flag file cannot open the door the interlock closed. */
export function mayStartDaemon({
  flag = null,
  steps = DURABLE_LANE_STEPS,
  boundaryMechanism = DURABLE_LANE_BOUNDARY_MECHANISM,
} = {}) {
  // A flag file is hand-editable, so only the affirmative value counts: anything
  // that is not exactly `true` — including a truthy 1 or 'yes' — reads as off.
  if (flag?.enabled !== true) return { ok: false, reason: 'the durable lane is off; today\'s authoring path runs unchanged' }
  const interlock = activationDecision({ steps, boundaryMode: flag.boundaryMode, boundaryMechanism })
  if (!interlock.ok) return { ok: false, reason: interlock.reason, missing: interlock.missing }
  return { ok: true }
}

/** Turning it OFF is always allowed and needs no evidence: the flag is set off
 *  BEFORE a drain, where its only effect is to stop a new daemon starting behind the
 *  one that is leaving. Only turning it ON is gated. */
export function flagChange({
  flag = null,
  enable = false,
  steps = DURABLE_LANE_STEPS,
  boundaryMechanism = DURABLE_LANE_BOUNDARY_MECHANISM,
  boundaryMode = flag?.boundaryMode ?? null,
  at = null,
  by = null,
} = {}) {
  // Anything that is not the affirmative `true` DISABLES: turning off is the safe
  // direction, so a malformed request lands there rather than at the gated one.
  if (enable !== true) return { ok: true, flag: { enabled: false, changedAt: at, changedBy: by } }
  const interlock = activationDecision({ steps, boundaryMode, boundaryMechanism })
  if (!interlock.ok) return { ok: false, reason: interlock.reason, missing: interlock.missing }
  return { ok: true, flag: { ...flag, enabled: true, boundaryMode, changedAt: at, changedBy: by } }
}
