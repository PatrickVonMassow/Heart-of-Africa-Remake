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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { ARCHIVE_PATH, readTasksAll, TASKS_PATH } from './tasks-source.mjs'
import { BriefError, buildBrief, BRIEF_TOKEN_CEILING, ORIENTATION_LIMITS } from './point-brief-core.mjs'
import { CLAUDE_PATH, DESIGN_PATH, REPO_ROOT, readDocCorpus } from './doc-corpus.mjs'

/**
 * The suites' own section parser, loaded ONLY if scripts/verify/ is there.
 * A static import would tie this script to that directory, and it is spawned in
 * places that carry the top-level scripts alone (the guard-hooks fixture stages
 * exactly that tree). The orientation's section names are a convenience; the
 * brief is not, so their parser is optional and never duplicated here.
 */
let listSections = null
try {
  ;({ listSections } = await import('./verify/sections.mjs'))
} catch {
  /* no verify tree in this checkout — the suite lines simply carry no sections */
}

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

/**
 * THE TREE HALF OF THE ORIENTATION (point 598). Called by buildBrief with the
 * paths the spec named and the suites its mapping resolved to; everything here
 * is read at generation time, so nothing in the block can be stale.
 *
 * Three readings, each cheap and each bounded:
 *  - the named file's OWN first header line. These files open with a comment
 *    saying what they are for, which is a better one-liner than anything a
 *    generator could invent — and a path that is NOT in the tree is said so,
 *    because "the spec names a file that does not exist" is worth knowing before
 *    the search rather than after it.
 *  - the directory around it: how many files, and either its README's first
 *    line or its siblings' names. That is the "what lives here" a reader would
 *    otherwise buy with a listing and a couple of opens.
 *  - the suites' declared `--section` names, read out of each suite's source by
 *    the same parser the runner uses (scripts/verify/sections.mjs), so the
 *    cheapest rung of the ladder is NAMED rather than merely available.
 *
 * Every step is guarded: an unreadable file costs its line, never the brief.
 */
function readTree({ paths = [], suites = [] } = {}) {
  const abs = (p) => resolve(REPO_ROOT, p)
  /** The first line of a file's leading comment — its own statement of purpose. */
  const headerLine = (file) => {
    try {
      const head = readFileSync(file, 'utf8').slice(0, 4000).split('\n')
      for (const raw of head) {
        const line = raw.trim()
        if (line === '') continue
        const m = /^(?:\/\/|\/\*\*?|\*|#)\s?(.*)$/.exec(line)
        if (!m) return null // the file opens with code: it states no purpose
        const text = m[1].trim()
        if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text
      }
    } catch {
      /* unreadable — the line is simply left off */
    }
    return null
  }
  const isDirPath = (p) => p.endsWith('/')
  const files = []
  const dirsSeen = new Map()
  for (const p of paths) {
    const target = abs(p)
    let exists = false
    let dir = p.replace(/[^/]*$/, '')
    try {
      const st = statSync(target)
      exists = true
      if (st.isDirectory()) dir = p.endsWith('/') ? p : `${p}/`
      else files.push({ path: p, exists: true, header: headerLine(target) })
    } catch {
      exists = false
    }
    if (!exists && !isDirPath(p)) files.push({ path: p, exists: false, header: null })
    if (dir && !dirsSeen.has(dir)) dirsSeen.set(dir, true)
  }
  const dirs = []
  for (const dir of dirsSeen.keys()) {
    try {
      const entries = readdirSync(abs(dir), { withFileTypes: true })
      const names = entries.filter((e) => e.isFile()).map((e) => e.name)
      const readme = names.includes('README.md') ? headerLine(abs(join(dir, 'README.md'))) : null
      const siblings = names
        .filter((n) => !/\.test\.[cm]?[jt]sx?$/.test(n))
        .slice(0, ORIENTATION_LIMITS.siblings)
      dirs.push({
        dir,
        count: names.length,
        note: readme ? `README: ${readme}` : siblings.join(', ') + (names.length > siblings.length ? ', …' : ''),
      })
    } catch {
      /* a directory the spec names but the tree does not have — the file line above already says so */
    }
  }
  const sections = {}
  for (const suite of listSections ? suites : []) {
    try {
      const list = listSections(readFileSync(abs(`scripts/verify/${suite}.mjs`), 'utf8'))
      if (list.length) sections[suite] = list
    } catch {
      /* not a suite file, or not sectioned — the suite line stands on its own */
    }
  }
  return { files, dirs, sections }
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
    readTree,
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
