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
// rebuild costs far more than the failed run.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readTasksAll, TASKS_PATH } from './tasks-source.mjs'
import { BriefError, buildBrief, BRIEF_TOKEN_CEILING } from './point-brief-core.mjs'

const REPO_ROOT = resolve(TASKS_PATH, '..')
const DESIGN_PATH = resolve(REPO_ROOT, 'design.md')
const CLAUDE_PATH = resolve(REPO_ROOT, 'CLAUDE.md')

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
    number,
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
      '[point-brief] WARNING: over the ceiling — the spec or its design sections have outgrown ' +
        'what a brief can carry. Split the point or shorten the spec.',
    )
  }
  process.exit(0)
} catch (e) {
  if (e instanceof BriefError) {
    console.error(`point-brief: ${e.message}`)
    process.exit(1)
  }
  console.error(`point-brief failed: ${e && e.stack ? e.stack : e}`)
  process.exit(1)
}
