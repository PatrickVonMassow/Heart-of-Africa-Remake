// NO TWO GUARDS MAY JOINTLY DEMAND AND FORBID ONE ACTION (point 1048, union
// entry U18) — the pure half.
//
// WHY THIS EXISTS (measured 03.09.2026, 17:45–17:47). Each guard in this
// repository was written on its own and judged on its own, and that is how a
// state arose in which two of them were both right and the session was wedged:
// after `batch-boundary --commit` the boundary refuses every tool call — the
// 90-second wait and the clock included — while `ci-status-guard` refused every
// turn end until the pushed ref's CI concluded, and its refusal PRESCRIBED
// exactly that refused wait. The session could neither work nor stop, emitted
// identical farewell messages, and only a person broke the loop.
//
// Point 1048 fixed that one pair by standing `ci-status-guard` down for a
// committed boundary. This core exists so the CLASS cannot come back: it takes
// what a Stop-side guard prescribes and asks whether the boundary would permit
// it, and a guard that prescribes a refused remedy without standing down is a
// test failure rather than a night.
//
// PURE and TOTAL. The IO — reading each registered guard's source — belongs to
// the test, which is also where the list of Stop guards is read from
// `.claude/settings.json`, so a NEW guard is covered the moment it is
// registered rather than when somebody remembers to add it to a table.

/** How a guard may legally behave in the sealed-boundary state. */
export const SEALED_BOUNDARY_POSTURES = Object.freeze({
  /** It refuses nothing there — the stand-down `ci-status-guard` gained. */
  STANDS_DOWN: 'stands-down',
  /** It may still refuse, because everything it prescribes is permitted. */
  PRESCRIBES_PERMITTED: 'prescribes-permitted',
  /** It refuses AND prescribes something the boundary forbids: the deadlock. */
  DEADLOCK: 'deadlock',
})

/** The cause string a guard returns when it stands down for a committed
 *  boundary. One spelling, so the test can find it in any guard's source. */
export const SEALED_BOUNDARY_CAUSE = 'committed-boundary'

/**
 * Every command a guard's own text PRESCRIBES. PURE.
 *
 * A refusal message is written for a reader, so its remedy is a literal command
 * line; that is what makes this mechanical. Two families are extracted: this
 * repository's own `node scripts/…` commands, and a bare `sleep N` — the second
 * because the incident's prescribed remedy WAS a sleep, and because a guard that
 * tells a sealed session to wait is telling it to do the one thing it may not.
 * A prescribed `git status` or `npm run build` is left alone: the boundary does
 * not reason about those, and a false positive would be a test failing for the
 * wrong reason.
 *
 * @param {string} source the guard's source text
 * @returns {string[]} the distinct command lines it prescribes
 */
export function prescribedCommands(source = '') {
  const text = typeof source === 'string' ? source : ''
  const out = new Set()
  const scriptCall = /node\s+(?:"|')?(?:\$\{?CLAUDE_PROJECT_DIR\}?[\\/])?scripts[\\/][A-Za-z0-9/_-]+\.mjs/g
  let match
  while ((match = scriptCall.exec(text)) !== null) {
    // Normalise the wrapper forms away so the boundary sees the plain command.
    out.add(`node ${match[0].slice(match[0].search(/scripts[\\/]/))}`.replace(/\\\\/g, '/'))
  }
  for (const sleep of text.match(/\bsleep\s+\d+(?:\.\d+)?/g) ?? []) out.add(sleep)
  return [...out]
}

/**
 * HOW DOES ONE GUARD BEHAVE IN THE SEALED-BOUNDARY STATE? PURE, TOTAL.
 *
 * @param {object} input
 * @param {boolean} input.standsDown does it return `applicable:false` there?
 * @param {string[]} input.prescribes the commands its refusals name
 * @param {(command: string) => boolean} input.permitted the boundary's own
 *        allow predicate — passed in so this core never imports the boundary
 * @returns {{posture: string, forbidden: string[]}}
 */
export function sealedBoundaryPosture({ standsDown = false, prescribes = [], permitted = () => true } = {}) {
  if (standsDown === true) return { posture: SEALED_BOUNDARY_POSTURES.STANDS_DOWN, forbidden: [] }
  const list = Array.isArray(prescribes) ? prescribes : []
  const forbidden = list.filter((command) => {
    try {
      return permitted(command) !== true
    } catch {
      return false // an unjudgeable command is not evidence of a deadlock
    }
  })
  return {
    posture: forbidden.length > 0 ? SEALED_BOUNDARY_POSTURES.DEADLOCK : SEALED_BOUNDARY_POSTURES.PRESCRIBES_PERMITTED,
    forbidden,
  }
}

/**
 * THE WHOLE INVARIANT over every registered Stop guard. PURE, TOTAL.
 * @returns {{ok: boolean, deadlocks: {guard: string, forbidden: string[]}[]}}
 */
export function guardCompatibility(guards = [], permitted = () => true) {
  const deadlocks = []
  for (const guard of Array.isArray(guards) ? guards : []) {
    const verdict = sealedBoundaryPosture({ ...guard, permitted })
    if (verdict.posture === SEALED_BOUNDARY_POSTURES.DEADLOCK) {
      deadlocks.push({ guard: guard?.name ?? '<unnamed>', forbidden: verdict.forbidden })
    }
  }
  return { ok: deadlocks.length === 0, deadlocks }
}
