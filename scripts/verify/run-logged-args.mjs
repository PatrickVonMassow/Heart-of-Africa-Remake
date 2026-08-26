import { DEFAULTS } from './run-digest-core.mjs'

export const MAX_SELECTED_LINES = 400

const boundedLines = (value, fallback) => {
  const finite = Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(Math.trunc(finite), MAX_SELECTED_LINES))
}

/** Split run-logged's own flags from the arguments forwarded to run-all. The
 * three line selectors are bounded here before either --show or a verify
 * digest sees them; the character budget remains the final output ceiling. */
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
    else if (a === '--stream') own.stream = true
    else if (a === '--quiet') own.quiet = true
    else forward.push(a)
  }
  own.tail = boundedLines(own.tail, DEFAULTS.tailLines)
  own.max = boundedLines(own.max, MAX_SELECTED_LINES)
  own.keep = boundedLines(own.keep, DEFAULTS.maxKeptLines)
  return { own, forward }
}
