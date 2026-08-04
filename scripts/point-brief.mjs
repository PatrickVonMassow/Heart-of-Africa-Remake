// I/O wrapper for the point brief (point 365 A): print ONE ready delegation
// brief for a work-order point, so neither an agent nor the main session has to
// read TASKS.md (~59k tokens) and design.md (~46k) to find a spec of a few
// hundred words. The decision/assembly logic is pure in point-brief-core.mjs.
//
//   node scripts/point-brief.mjs 365            # the brief on stdout
//   node scripts/point-brief.mjs 365 --tokens   # + the measured size on stderr
//
// Unlike the guards here this script FAILS LOUDLY (exit 1) rather than
// fail-open: a silently thinned brief would send its reader off blind, and a
// rebuild costs far more than the failed run. Over the token ceiling is a
// failure too — a brief nobody notices is over budget is how the saving quietly
// disappears.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { ARCHIVE_PATH, readTasksAll, TASKS_PATH } from './tasks-source.mjs'
import { BriefError, buildBrief, BRIEF_TOKEN_CEILING } from './point-brief-core.mjs'
import { CLAUDE_PATH, DESIGN_PATH, REPO_ROOT, readDocCorpus } from './doc-corpus.mjs'

/**
 * The git half of the brief's provenance stamp: which commit, and whether the
 * documents it is cut from are modified on top of it. Only the SOURCE documents
 * count for the dirty flag — a modified src/ says nothing about a brief's
 * freshness, while a modified TASKS.md says everything.
 *
 * Failure is reported as unknown, never as clean: a missing git is not evidence
 * of a pristine tree, and this line exists precisely to be trusted.
 */
function gitRevision() {
  const git = (...args) =>
    spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  const rel = (p) => relative(REPO_ROOT, p).split('\\').join('/')
  try {
    const head = git('rev-parse', '--short', 'HEAD')
    const sources = [rel(TASKS_PATH), rel(ARCHIVE_PATH), rel(DESIGN_PATH), rel(CLAUDE_PATH), 'docs']
    const status = git('status', '--porcelain', '--', ...sources)
    return {
      head: head.status === 0 ? head.stdout.trim() : null,
      dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
    }
  } catch {
    return { head: null, dirty: null }
  }
}

const args = process.argv.slice(2)
const number = args.find((a) => /^\d+$/.test(a))
const showTokens = args.includes('--tokens')

if (!number) {
  console.error('usage: node scripts/point-brief.mjs <point number> [--tokens]')
  process.exit(1)
}

try {
  if (!existsSync(DESIGN_PATH)) throw new BriefError(`design.md not found at ${DESIGN_PATH}`)
  const { brief, tokens, designRefs, referenced } = buildBrief({
    tasksText: readTasksAll(),
    designText: readFileSync(DESIGN_PATH, 'utf8'),
    // CLAUDE.md is read only to RECOGNISE its own sections (§7.1/§7.2 are cited
    // without naming the file); the brief never carries its text — the harness
    // injects CLAUDE.md into every context anyway.
    claudeText: existsSync(CLAUDE_PATH) ? readFileSync(CLAUDE_PATH, 'utf8') : '',
    docs: readDocCorpus(),
    number,
    revision: gitRevision(),
  })
  process.stdout.write(brief.endsWith('\n') ? brief : `${brief}\n`)
  if (showTokens || tokens > BRIEF_TOKEN_CEILING) {
    console.error(
      `[point-brief] point ${number}: ~${tokens} estimated tokens ` +
        `(ceiling ${BRIEF_TOKEN_CEILING}), ${designRefs.length} design section(s), ` +
        `${referenced.length} cross-referenced point(s)`,
    )
  }
  if (tokens > BRIEF_TOKEN_CEILING) {
    console.error(
      '[point-brief] OVER THE CEILING — the spec or its design sections have outgrown what a brief ' +
        'can carry. Split the point or shorten the spec; do not raise the ceiling. The brief above ' +
        'is complete and usable, but it is no longer the saving it claims to be.',
    )
    process.exitCode = 2
  }
} catch (e) {
  if (e instanceof BriefError) {
    console.error(`point-brief: ${e.message}`)
  } else {
    console.error(`point-brief failed: ${e && e.stack ? e.stack : e}`)
  }
  process.exitCode = 1
}
// No process.exit() here on purpose: the brief can be 80 KB and process.exit()
// discards whatever of an ASYNCHRONOUS stdout write is still queued (pipes are
// async on macOS; only Windows and Linux make them synchronous). Letting the
// event loop drain flushes it on every platform.
