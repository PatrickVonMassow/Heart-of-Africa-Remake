// THE CONTEXT WATERMARK (point 675, defeat 3) — the IO half. The decision is
// pure in scripts/context-watermark-core.mjs; this reads the transcript the
// harness writes and answers "past, below, or unreadable". CLI:
//
//   node scripts/context-watermark.mjs --status [--transcript <path>]
//
// The Stop hook hands the guard the transcript path directly; this CLI locates
// it from the session's own project directory when none is given. An
// unobtainable reading is reported LOUDLY ('unreadable') — never a silent
// "below".
import { readdirSync, openSync, readSync, closeSync, fstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { CONTEXT_WATERMARK_TOKENS, parseContextTokens, watermarkDecision } from './context-watermark-core.mjs'

/** The calibratable mark, HOA_CONTEXT_WATERMARK_TOKENS. Read here (not in the
 *  core) so the decision function stays pure. */
export function watermarkTokens(env = process.env) {
  const raw = Number(env.HOA_CONTEXT_WATERMARK_TOKENS)
  return Number.isFinite(raw) && raw > 0 ? raw : CONTEXT_WATERMARK_TOKENS
}

/** How much of the transcript tail is read. The newest usage record sits within
 *  the last few messages; half a megabyte covers even a screenshot-heavy turn. */
export const TAIL_BYTES = 512 * 1024

/** The LAST `maxBytes` of a file, as text. Null when it cannot be read. */
export function readTail(path, maxBytes = TAIL_BYTES) {
  let fd = null
  try {
    fd = openSync(String(path), 'r')
    const size = fstatSync(fd).size
    const length = Math.min(size, maxBytes)
    const buf = Buffer.alloc(length)
    readSync(fd, buf, 0, length, size - length)
    return buf.toString('utf8')
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* nothing to do */
      }
    }
  }
}

/** The harness's project slug for a checkout path: every path separator (and
 *  dot) becomes a dash. Matches the directories under ~/.claude/projects/. */
export function projectSlug(root = REPO_ROOT) {
  return String(root).replace(/[\\/.]/g, '-')
}

/**
 * The session's transcript, located rather than assumed: prefer `<sid>.jsonl`
 * in this checkout's project directory, else the newest `.jsonl` there. Null
 * when nothing is found — the caller must then FAIL VISIBLY.
 */
export function locateTranscript({ sid = '', root = REPO_ROOT, home = homedir() } = {}) {
  const dir = join(home, '.claude', 'projects', projectSlug(root))
  try {
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
      .map((e) => e.name)
    if (sid && files.includes(`${sid}.jsonl`)) return join(dir, `${sid}.jsonl`)
    let newest = null
    for (const name of files) {
      const path = join(dir, name)
      let mtime = 0
      try {
        mtime = fstatOf(path)
      } catch {
        continue
      }
      if (!newest || mtime > newest.mtime) newest = { path, mtime }
    }
    return newest ? newest.path : null
  } catch {
    return null
  }
}

const fstatOf = (path) => {
  const fd = openSync(path, 'r')
  try {
    return fstatSync(fd).mtimeMs
  } finally {
    closeSync(fd)
  }
}

/**
 * THE VERDICT, from a real reading. `transcriptPath` (the Stop hook's own
 * payload field) wins; otherwise the transcript is located. Returns the core's
 * { state, tokens, watermark, alert } plus { transcript } naming what was read
 * — 'unreadable' when no file or no usage record was found, never a guess.
 */
export function gatherWatermark({ transcriptPath = '', sid = '', env = process.env } = {}) {
  const path = String(transcriptPath ?? '').trim() || locateTranscript({ sid })
  const tail = path ? readTail(path) : null
  const reading = tail === null ? null : parseContextTokens(tail)
  return { ...watermarkDecision({ reading, watermark: watermarkTokens(env) }), transcript: path ?? null }
}

// --- CLI -----------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : ''
  }
  const sid = readOwnerLock()?.sessionId ?? ''
  const g = gatherWatermark({ transcriptPath: opt('--transcript'), sid })
  console.log(JSON.stringify({ ownerSessionId: sid || null, ...g }, null, 2))
  if (g.state === 'unreadable') {
    console.error(
      'NO CONTEXT READING COULD BE TAKEN' +
        (g.transcript ? ` (transcript: ${g.transcript} carries no usage record)` : ' (no transcript was found)') +
        ' — the watermark CANNOT fire on an assumption, so this is a loud failure, not a "below". Pass the ' +
        'real transcript with --transcript <path> (the Stop hook payload names it as transcript_path).',
    )
    process.exit(1)
  }
  console.log(
    g.state === 'past'
      ? `\nPAST THE WATERMARK: ${g.tokens} >= ${g.watermark} tokens. Finish the step you are in, then hand over: ` +
          '`node scripts/batch-boundary.mjs --prepare --context`, its bookkeeping, then `--commit --context` as ' +
          'the last repository action.'
      : `\nBelow the watermark: ${g.tokens} < ${g.watermark} tokens. Keep working.`,
  )
}
