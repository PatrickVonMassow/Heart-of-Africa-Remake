// THE ACTIVATION FLAG OF THE DURABLE AUTHORING LANE, and the interlock that keeps
// it off (work-order point 834, step 1; docs/handover-architecture.md, mechanism 2
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

/** Every step of the ordered work, and what actually stands today. `evidence` is
 *  the commit-visible reason a step is green; a green step without one is a claim,
 *  and `activationDecision` refuses to count it. */
export const DURABLE_LANE_STEPS = Object.freeze({
  1: Object.freeze({ title: 'schemas and invariants', green: false, evidence: null }),
  2: Object.freeze({ title: 'durable state store', green: false, evidence: null }),
  3: Object.freeze({ title: 'daemon and Sol adapter', green: false, evidence: null }),
  4: Object.freeze({ title: 'transferable declarations and fencing', green: false, evidence: null }),
  8: Object.freeze({ title: 'successor startup and reconciliation', green: false, evidence: null }),
  9: Object.freeze({ title: 'crash-recoverable serial landing', green: false, evidence: null }),
})

/** The steps without which survivability may not be CLAIMED, and therefore may not
 *  be switched on. Steps 1 to 4 are necessary too, but they are not sufficient, and
 *  this list is the sufficiency condition. */
export const STEPS_REQUIRED_FOR_ACTIVATION = Object.freeze([1, 2, 3, 4, 8, 9])

/** Refuses enabling while any required step is not green, and names every step it
 *  is waiting for rather than the first one — an operator who fixes one at a time
 *  learns nothing from a refusal that moves. */
export function activationDecision({ steps = DURABLE_LANE_STEPS, required = STEPS_REQUIRED_FOR_ACTIVATION } = {}) {
  const missing = required.filter((n) => {
    const step = steps[n]
    return !step || !step.green || !step.evidence
  })
  if (missing.length) {
    const named = missing.map((n) => `${n} (${steps[n]?.title ?? 'unknown step'})`).join(', ')
    return { ok: false, missing, reason: `the durable lane may not be enabled while these steps are not green: ${named}` }
  }
  return { ok: true }
}

/** The one question the flag answers. A daemon may be started only when the flag is
 *  on AND the interlock allows the flag to be on — the second condition is checked
 *  again here, so a hand-edited flag file cannot open the door the interlock closed. */
export function mayStartDaemon({ flag = null, steps = DURABLE_LANE_STEPS } = {}) {
  const interlock = activationDecision({ steps })
  if (!interlock.ok) return { ok: false, reason: interlock.reason, missing: interlock.missing }
  if (!flag?.enabled) return { ok: false, reason: 'the durable lane is off; today\'s authoring path runs unchanged' }
  return { ok: true }
}

/** Turning it OFF is always allowed and needs no evidence: the flag is set off
 *  BEFORE a drain, where its only effect is to stop a new daemon starting behind the
 *  one that is leaving. Only turning it ON is gated. */
export function flagChange({ flag = null, enable = false, steps = DURABLE_LANE_STEPS, at = null, by = null } = {}) {
  if (!enable) return { ok: true, flag: { enabled: false, changedAt: at, changedBy: by } }
  const interlock = activationDecision({ steps })
  if (!interlock.ok) return { ok: false, reason: interlock.reason, missing: interlock.missing }
  return { ok: true, flag: { ...flag, enabled: true, changedAt: at, changedBy: by } }
}
