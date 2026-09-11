import { DEFAULTS } from './run-digest-core.mjs'

export const MAX_SELECTED_LINES = 400

const boundedLines = (value, fallback) => {
  const finite = Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(Math.trunc(finite), MAX_SELECTED_LINES))
}

/** Split run-logged's own flags from the arguments forwarded to run-all. The
 * three line selectors are bounded here before either --show or a verify
 * digest sees them; the character budget remains the final output ceiling.
 * `--no-ladder "<why>"` is consumed here too — run-all knows nothing about the
 * ladder, which is decided before the runner is ever spawned. */
export function parseRunLoggedArgs(argv) {
  const own = {
    show: null,
    grep: null,
    tail: DEFAULTS.tailLines,
    max: MAX_SELECTED_LINES,
    keep: DEFAULTS.maxKeptLines,
    stream: false,
    quiet: false,
    logFile: null,
    // The verification ladder's deliberate escape (point 1086). It carries a
    // REASON on purpose: a bare flag would be a habit within a week, and the
    // reason is what the run record keeps.
    noLadder: null,
  }
  const forward = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => argv[++i]
    if (a === '--show') own.show = value()
    else if (a === '--grep') own.grep = value()
    else if (a === '--tail') own.tail = Number(value())
    else if (a === '--max') own.max = Number(value())
    else if (a === '--keep') own.keep = Number(value())
    else if (a === '--log-file') own.logFile = value()
    else if (a === '--no-ladder') {
      // A REASON, NOT THE NEXT FLAG. Consuming the next argument unconditionally
      // meant `npm test -- polish --no-ladder --quiet` waived the ladder with
      // "--quiet" recorded as the explanation — and an explanation nobody wrote
      // is exactly what the reason exists to prevent. An empty reason leaves the
      // refusal standing, which the core already pins.
      const next = argv[i + 1]
      own.noLadder = next !== undefined && !next.startsWith('-') ? argv[++i] : ''
    }
    else if (a === '--stream') own.stream = true
    else if (a === '--quiet') own.quiet = true
    else forward.push(a)
  }
  own.tail = boundedLines(own.tail, DEFAULTS.tailLines)
  own.max = boundedLines(own.max, MAX_SELECTED_LINES)
  own.keep = boundedLines(own.keep, DEFAULTS.maxKeptLines)
  return { own, forward }
}
