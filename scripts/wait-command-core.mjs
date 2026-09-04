// THE WAIT THAT CAN NEVER RETURN (point 1048, union entry U14) — the pure half.
//
// WHY THIS EXISTS (measured 02./03.09.2026, 00:55–01:15, live in the stalled
// session). The owning session woke roughly every ten minutes and each time
// spawned another background watcher of the form
//
//     while pgrep -f "npm exec vitest" >/dev/null; do sleep 30; done
//
// and blocked again. Ten such shells stood at 01:00. The loop cannot terminate:
// the shell that runs it carries the literal pattern in its OWN command line, so
// `pgrep -f` matches the watcher itself — and, once a second watcher exists, its
// siblings. Every one of those waits was for a run that had already finished.
// The batch advanced nothing for 107 minutes while every safeguard reported
// health.
//
// The session's own instructions already name `scripts/verify/run-wait.mjs
// --await` as THE blocking wait; the defect is that nothing refused the
// hand-rolled alternative. This core recognises the shape so a guard can.
//
// TWO SEPARATE VERDICTS, deliberately. A poll loop is WASTEFUL and is refused
// because one blocking call is always available. A SELF-MATCHING poll loop is
// worse in kind: it is non-terminating by construction, and it is the one that
// cost the night. The caller reports which, because "you wrote a loop that can
// never end" is a different sentence from "use the blocking wait".
//
// PURE and TOTAL: any input at all answers, and anything unparseable answers
// "allowed". A guard built on this must fail open — a classifier bug may never
// stop a session from working.

/** The command that replaces every hand-rolled wait. */
export const BLOCKING_WAIT = 'node scripts/verify/run-wait.mjs --await'

/** Ways a shell asks "is that process still there?". Each one, inside a loop
 *  that sleeps, is a poll. */
const PROCESS_PROBES = /\b(pgrep|pidof|pkill\s+-0|ps\s+-|ps\s+aux|jobs\b|kill\s+-0)/

/** The loop forms a poll can take. `while`/`until` cover the written incident;
 *  `for`-with-sleep covers the bounded retry that is the same thing with a cap. */
const LOOP_HEAD = /\b(while|until|for)\b/

/** A body that waits between probes. Without a sleep it is not a poll but a
 *  busy loop, which is a different (and louder) problem. */
const SLEEPS = /\bsleep\s+[\d.]+/

/**
 * Does this ONE shell segment poll for a process in a loop? PURE.
 * @returns {boolean}
 */
export function isProcessPollLoop(segment = '') {
  const text = typeof segment === 'string' ? segment : ''
  if (!LOOP_HEAD.test(text) || !SLEEPS.test(text)) return false
  return PROCESS_PROBES.test(text)
}

/**
 * The patterns a `pgrep -f` / `pkill -f` in this segment searches for. PURE.
 * Quoted arguments only: a bare word is usually a program name and matching it
 * against the segment would flag every loop that mentions `sleep`.
 * @returns {string[]}
 */
export function searchedPatterns(segment = '') {
  const text = typeof segment === 'string' ? segment : ''
  const out = []
  const call = /\b(?:pgrep|pkill)\b((?:\s+-{1,2}[A-Za-z-]+)*)\s+(?:(["'])([^"']+)\2)/g
  let match
  while ((match = call.exec(text)) !== null) {
    const flags = match[1] ?? ''
    // Only `-f` matches the FULL command line, and only that can match the
    // watcher's own argv. A plain `pgrep "node"` matches the executable name.
    if (/f/.test(flags.replace(/-{1,2}/g, ''))) out.push(match[3])
  }
  return out
}

/**
 * Would this segment's own command line satisfy its own search? PURE.
 *
 * That is the whole defect: the pattern is a substring of the very text that
 * will become the watcher's `/proc/<pid>/cmdline`, so the probe finds the
 * watcher and the loop never ends.
 * @returns {string|null} the self-matching pattern, or null
 */
export function selfMatchingPattern(segment = '') {
  const text = typeof segment === 'string' ? segment : ''
  for (const pattern of searchedPatterns(text)) {
    // Compare against the segment with the pattern's own quoted occurrence
    // still in place — that IS the command line the shell will carry.
    if (text.includes(pattern)) return pattern
  }
  return null
}

/**
 * THE VERDICT on one shell segment. PURE, TOTAL.
 * @returns {{allowed: boolean, kind: 'ok'|'poll-loop'|'self-matching-poll-loop',
 *            pattern: string|null, message: string|null}}
 */
export function judgeWaitCommand(segment = '') {
  const ok = { allowed: true, kind: 'ok', pattern: null, message: null }
  if (typeof segment !== 'string' || segment.trim().length === 0) return ok
  if (!isProcessPollLoop(segment)) return ok
  const pattern = selfMatchingPattern(segment)
  if (pattern !== null) {
    return {
      allowed: false,
      kind: 'self-matching-poll-loop',
      pattern,
      message:
        `THIS WAIT CAN NEVER RETURN. The loop searches for ${JSON.stringify(pattern)} with ` +
        '`-f`, which matches the FULL command line — and that pattern is part of this very ' +
        'command, so the watcher finds ITSELF and the condition stays true for ever. This is ' +
        'the shape that stalled the batch for 107 minutes on 03.09.2026 with every monitor ' +
        `green. Use the one blocking wait instead: \`${BLOCKING_WAIT}\`, which returns with the ` +
        'run\'s receipt. Ask `--plan <tier>` first if you need to know whether one blocking ' +
        'call is long enough.',
    }
  }
  return {
    allowed: false,
    kind: 'poll-loop',
    message:
      'POLLING FOR A PROCESS IS NOT HOW THIS REPOSITORY WAITS. A loop that probes for a ' +
      'process and sleeps burns a turn per iteration and can outlive what it waits for. ' +
      `\`${BLOCKING_WAIT}\` is ONE call that comes back with the run's receipt; ` +
      '`--plan <tier>` says beforehand whether one blocking call suffices, and ' +
      '`node scripts/batch-in-flight.mjs --waiting-on …` declares a wait that must outlast it.',
    pattern: null,
  }
}
