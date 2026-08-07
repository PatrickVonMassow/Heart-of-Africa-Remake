// The LOGGED verify invocation (point 373 e): run the regression, write its
// WHOLE output to a file, and hand the caller a BOUNDED digest of it.
//
// The problem it solves is a context one, not a testing one. `npm test` streams
// its transcript into the session that started it — and into every poll of a
// background run — so one red regression can cost tens of thousands of tokens
// for output that is 95 % vitest dump. The session boundary (point 373) fires
// between POINTS and never reaches inside a heavy one; this does.
//
// WHAT THE CALLER STILL SEES, because a digest that hides a failure is worse
// than the cost it saves:
//   - LIVE, while the run goes: the runner's own structured lines only — the
//     per-suite PASS/FAIL/SKIP verdicts, the stage headings, the retry notices
//     and the indented FAIL/ERR echoes (vitest's own ` FAIL  file > case` lines
//     among them). About one line per suite, so a background poller sees
//     progress and a red suite names itself the moment it goes red.
//   - AT THE END: exit code, duration, how much was captured, WHERE the log is,
//     the FAILING units by name with their first failing checks, and — only on
//     a failure — the last few dozen raw lines, which catch a crash stack the
//     patterns have no name for.
//   - ON DEMAND: `--show <log>` reads a bounded WINDOW back (tail/grep/max), so
//     the way to the detail is never `cat`.
//
// Usage:
//   node scripts/verify/run-logged.mjs [<run-all args…>]   (npm test / test:small / test:large)
//   node scripts/verify/run-logged.mjs --show <log> [--tail 120] [--grep "FAIL|ERR:"] [--max 400]
// Flags consumed here (everything else is forwarded to run-all.mjs verbatim):
//   --stream        echo every raw line as well (the pre-373 behaviour)
//   --quiet         no live echo; the end digest then carries the structured lines
//   --keep N        the structured-line budget of the end digest (default 120)
//   --tail N        raw tail lines on a failure (default 40)
//   --log-file P    write the log here instead of local/verify-logs/<stamp>.log
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULTS, buildDigest, createSelector, showWindow } from './run-digest-core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/** Split our own flags out of the argv; everything else goes to run-all. */
function parseOwnArgs(argv) {
  const own = { show: null, grep: null, tail: DEFAULTS.tailLines, max: 400, keep: DEFAULTS.maxKeptLines, stream: false, quiet: false, logFile: null }
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
  if (!Number.isFinite(own.tail)) own.tail = DEFAULTS.tailLines
  if (!Number.isFinite(own.max)) own.max = 400
  if (!Number.isFinite(own.keep)) own.keep = DEFAULTS.maxKeptLines
  return { own, forward }
}

/** `2026-08-07T14-31-09-large.log` — sortable, and it says what it ran. */
function logPathFor(args, own) {
  if (own.logFile) return isAbsolute(own.logFile) ? own.logFile : join(ROOT, own.logFile)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
  const label = args.filter((a) => !a.startsWith('-')).join('-').replace(/[^\w.-]/g, '_') || 'verify'
  const dir = process.env.VERIFY_LOG_DIR ? join(ROOT, process.env.VERIFY_LOG_DIR) : join(ROOT, 'local', 'verify-logs')
  return join(dir, `${stamp}-${label}.log`)
}

/** A path the digest can print without a machine-specific prefix. */
function forDisplay(path) {
  const rel = relative(ROOT, path)
  return rel && !rel.startsWith('..') ? rel.replace(/\\/g, '/') : path
}

// ── `--show`: read a bounded window back out of a saved log ────────────────
// Its own function, and the run below is in an `else`: neither may fall into
// the other. Written the first way — a `--show` branch that merely printed and
// ran on — the reader started a full LARGE regression behind the answer.
function showLog(path) {
  const full = isAbsolute(path) ? path : join(ROOT, path)
  let text
  try {
    text = readFileSync(full, 'utf8')
  } catch (err) {
    console.log(`no such log: ${forDisplay(full)} (${err.code ?? err.message})`)
    return 1
  }
  const all = text.split(/\r?\n/)
  const win = showWindow(all, { grep: own.grep, tail: own.tail, max: own.max })
  const what = own.grep ? `${win.matched} line(s) matching /${own.grep}/i of ${all.length}` : `${all.length} line(s)`
  console.log(`── ${forDisplay(full)} — ${what}; showing the last ${win.lines.length}${win.truncated > 0 ? ` (${win.truncated} not shown)` : ''}`)
  for (const l of win.lines) console.log(l)
  return 0
}

/** Run the regression, log all of it, print the bounded digest. */
function runVerify() {
  const logPath = logPathFor(forward, own)
  mkdirSync(dirname(logPath), { recursive: true })
  const log = createWriteStream(logPath, { flags: 'a' })
  const shown = forDisplay(logPath)
  const command = `verify ${forward.join(' ') || '(default: LARGE)'}`

  console.log(`# ${command} — full output → ${shown}`)

  const started = Date.now()
  const child = spawn(process.execPath, [join(HERE, 'run-all.mjs'), ...forward], {
    windowsHide: true,
    cwd: ROOT,
    // stdin inherited so nothing can silently block on input; stdout/stderr piped
    // through us into the log.
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  })

  const lines = []
  const select = createSelector()
  let rawChars = 0
  let pending = ''

  function consume(chunk) {
    const text = String(chunk)
    rawChars += text.length
    log.write(text)
    pending += text
    const parts = pending.split(/\r?\n/)
    pending = parts.pop() ?? ''
    for (const line of parts) {
      lines.push(line)
      const kind = select(line)
      if (own.stream) console.log(line)
      else if (!own.quiet && kind) console.log(line)
    }
  }

  child.stdout.on('data', consume)
  child.stderr.on('data', consume)

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      try {
        child.kill(sig)
      } catch {
        /* already gone */
      }
    })
  }

  child.on('close', (code, signal) => {
    if (pending !== '') {
      lines.push(pending)
      if (own.stream || (!own.quiet && select(pending))) console.log(pending)
      pending = ''
    }
    log.end()
    const exitCode = code === null ? 1 : code
    const digest = buildDigest({
      lines,
      command: signal ? `${command} (killed by ${signal})` : command,
      exitCode,
      durationMs: Date.now() - started,
      logPath: shown,
      rawChars,
      // The structured lines already went out live; repeating them would pay for
      // them twice. `--quiet` trades the live view for a single end block.
      includeKept: own.quiet,
      maxKeptLines: own.keep,
      tailLines: own.tail,
    })
    console.log(digest.text)
    // NOT process.exit(): stdout may be a pipe, and an explicit exit can drop
    // what is still buffered in it — which is the digest itself. Setting the code
    // and letting the loop drain keeps the caller's copy complete.
    process.exitCode = exitCode
  })

  child.on('error', (err) => {
    console.log(`FAIL  run-logged   could not start the runner: ${err.message}`)
    log.end()
    process.exitCode = 1
  })
}

const { own, forward } = parseOwnArgs(process.argv.slice(2))
if (own.show) process.exitCode = showLog(own.show)
else runVerify()
