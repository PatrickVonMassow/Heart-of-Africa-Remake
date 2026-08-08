// DID THE POINT BOUNDARY ACTUALLY BUY ANYTHING (point 373)? The IO half.
//
// Point 373's acceptance condition is a MEASUREMENT, not a mechanism: "report the %/h
// rate for the first full day after the change against today's 1.25 %/h. The point
// counts as delivered when the rate is measured, not when the mechanism runs." This is
// the command that measures it, so the answer can be re-checked rather than remembered.
//
//   node scripts/measure-context-cost.mjs            # before/after the first handover
//   node scripts/measure-context-cost.mjs --json
//   node scripts/measure-context-cost.mjs --boundary 2026-07-28T08:56:12Z
//   node scripts/measure-context-cost.mjs --boundary 2026-08-07T03:48:17Z --anchor 1.11
//
// It reports BOTH scopes side by side (08.08.2026) — the folder's own session
// transcripts, which the 30.07.2026 anchor was measured on, and the full count
// including the delegated agents under <session>/subagents/, which is the honest total.
//
// The transcripts live OUTSIDE the repository (~/.claude/projects/…), which is why this
// reads them rather than shipping their numbers: a figure in a document cannot be
// re-derived, and this project has already been bitten by an estimated number presented
// as a measured one. WHICH folder that is, is DERIVED from the checkout (the harness
// keys it by project path, so it differs per host) and a run that finds none FAILS —
// the hard-coded slug used to make an empty container run look like a measurement.
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  measureScopes,
  mainCheckoutOf,
  resolveTranscriptDir,
  transcriptCandidates,
  transcriptScope,
  LARGE_CONTEXT_TOKENS,
  SCOPE_ORDER,
  SCOPE_LABELS,
  SCOPE_NOTES,
} from './measure-context-cost-core.mjs'

/** The smallest file that can hold a real turn; anything under it is a stub. */
const MIN_TRANSCRIPT_BYTES = 1000

/**
 * Every transcript under a project folder, as { path, rel, scope }. The folder's own
 * `*.jsonl` are the session transcripts; `<session>/subagents/agent-*.jsonl` are the
 * DELEGATED AGENTS', which bill against the same quota and were invisible to this tool
 * until 08.08.2026.
 *
 * Top-level files come FIRST, so if a turn ever appeared in both places the dedup in
 * `readTurns` keeps the top-level one — that direction cannot inflate the difference
 * between the two scopes.
 */
export function listTranscripts(dir, { maxDepth = 3 } = {}) {
  const found = []
  const walk = (abs, rel, depth) => {
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    for (const f of files) {
      const path = join(abs, f.name)
      try {
        if (statSync(path).size < MIN_TRANSCRIPT_BYTES) continue
      } catch {
        continue
      }
      const r = rel ? `${rel}/${f.name}` : f.name
      found.push({ path, rel: r, scope: transcriptScope(r) })
    }
    if (depth >= maxDepth) return
    for (const d of entries.filter((e) => e.isDirectory())) {
      walk(join(abs, d.name), rel ? `${rel}/${d.name}` : d.name, depth + 1)
    }
  }
  walk(dir, '', 0)
  return found
}

/** Does this folder hold at least one usable transcript — in EITHER scope? A folder
 *  holding only subagent transcripts is still the right folder. */
function hasTranscripts(dir) {
  return listTranscripts(dir).length > 0
}

/**
 * The transcript folder for THIS machine and checkout, or a throw naming what was
 * tried (see the core module for why the old hard-coded slug had to go).
 * `MEASURE_TRANSCRIPTS_DIR` overrides everything, for a copied-off archive.
 */
export function transcriptDir({ repoRoot = REPO_ROOT, home = homedir(), env = process.env } = {}) {
  if (env.MEASURE_TRANSCRIPTS_DIR) {
    return resolveTranscriptDir([env.MEASURE_TRANSCRIPTS_DIR], hasTranscripts)
  }
  const projectsDir = join(home, '.claude', 'projects')
  return resolveTranscriptDir(transcriptCandidates({ repoRoot, projectsDir, join }), hasTranscripts)
}

/** The boundary log, which lives in the MAIN checkout — a worktree has its own
 *  `.claude/` and none of the batch's history in it. */
const BOUNDARY_LOGS = [REPO_ROOT, mainCheckoutOf(REPO_ROOT)]
  .filter(Boolean)
  .map((root) => join(root, '.claude', 'boundary.log'))

/** WHEN the boundary mechanism first fired, read from the log that records it. Falls
 *  back to null, in which case the caller must name a moment — guessing a calendar day
 *  would make the whole comparison a coincidence. */
export function firstHandoverAt(logPaths = BOUNDARY_LOGS) {
  for (const logPath of [logPaths].flat()) {
    try {
      for (const line of readFileSync(logPath, 'utf8').split('\n')) {
        if (!line.includes('HANDOVER')) continue
        const at = Date.parse(line.slice(1, line.indexOf(']')))
        if (Number.isFinite(at)) return at
      }
    } catch {
      /* no log here — try the next, else the caller decides */
    }
  }
  return null
}

/**
 * Every assistant turn with usage, deduplicated. A transcript repeats one turn's usage
 * across its streamed lines, so counting lines would multiply the spend by three.
 */
export async function readTurns(dir = transcriptDir()) {
  const turns = []
  const seen = new Set()
  if (!existsSync(dir)) return turns
  for (const { path, rel, scope } of listTranscripts(dir)) {
    const stream = createReadStream(path, { encoding: 'utf8' })
    const lines = createInterface({ input: stream, crlfDelay: Infinity })
    for await (const line of lines) {
      if (!line.includes('"usage"')) continue
      let rec
      try {
        rec = JSON.parse(line)
      } catch {
        continue
      }
      const usage = rec?.message?.usage
      const at = Date.parse(rec?.timestamp ?? '')
      if (!usage || !Number.isFinite(at)) continue
      // The message id is the turn's identity; requestId is the fallback for a record
      // that carries no id.
      const id = rec.message?.id ?? rec.requestId ?? `${rel}:${rec.uuid ?? at}`
      if (seen.has(id)) continue
      seen.add(id)
      // The transcript file IS the session — one file per session id. A DELEGATED
      // agent's records carry the PARENT's sessionId, so its own agentId is what
      // separates it; without that, every subagent's context would be folded into its
      // parent's peak and the per-session profile would read as one huge session.
      const session = rec.agentId
        ? `${rec.sessionId ?? rel}/agent-${rec.agentId}`
        : (rec.sessionId ?? rel.replace(/\.jsonl$/, ''))
      turns.push({ at, usage, session, scope })
    }
  }
  return turns.sort((a, b) => a.at - b.at)
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const at = argv.indexOf('--boundary')
  const boundaryAt = at >= 0 ? Date.parse(argv[at + 1] ?? '') : firstHandoverAt()
  if (!Number.isFinite(boundaryAt)) {
    console.error(
      'no boundary moment: .claude/boundary.log holds no HANDOVER line and none was given.\n' +
        'Pass one explicitly: --boundary 2026-07-28T08:56:12Z',
    )
    process.exit(1)
  }
  const dir = transcriptDir()
  const turns = await readTurns(dir)
  // A folder that holds files but yields no usable turn is the same miss one step
  // later — say so instead of printing a table of `n/a`.
  if (turns.length === 0) {
    console.error(`no assistant turns with usage in ${dir} — nothing to measure.`)
    process.exit(1)
  }
  // The anchor the derived %/h is carried through. It DEFAULTS to the point's own
  // 1.25 %/h, which belongs to the pre-boundary loop; a run that splits at a LATER
  // moment must name the anchor of the regime it is comparing against (1.11 %/h for
  // the state measured on 30.07.2026), or the derived figure means nothing.
  const an = argv.indexOf('--anchor')
  const anchorRatePerHour = an >= 0 ? Number(argv[an + 1]) : 1.25
  if (!Number.isFinite(anchorRatePerHour) || anchorRatePerHour <= 0) {
    console.error(`--anchor needs a positive %/h figure, got "${argv[an + 1]}".`)
    process.exit(1)
  }
  const scopes = measureScopes({ turns, boundaryAt, anchorRatePerHour })
  const files = listTranscripts(dir)
  const out = {
    transcriptDir: dir,
    transcripts: {
      topLevel: files.filter((f) => f.scope === 'top-level').length,
      subagent: files.filter((f) => f.scope === 'subagent').length,
    },
    turnsRead: turns.length,
    boundaryAt: new Date(boundaryAt).toISOString(),
    largeContextTokens: LARGE_CONTEXT_TOKENS,
    anchorRatePerHour,
    scopes,
  }
  if (asJson) {
    console.log(JSON.stringify(out, null, 2))
  } else {
    const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)} %`)
    const row = (name, s) =>
      `  ${name.padEnd(7)} ${String(s.turns).padStart(6)} turns  ${String(s.activeHours).padStart(7)} active h  ` +
      `${String(s.weightedPerHour ?? 'n/a').padStart(9)} weighted/h  large-context share ${pct(s.largeShare)}`
    const k = (v) => (v == null ? 'n/a' : `${Math.round(v / 1000)}k`)
    const srow = (name, s) =>
      `  ${name.padEnd(7)} ${String(s.sessions).padStart(4)} sessions  median peak ${k(s.medianPeak).padStart(6)}  ` +
      `p90 peak ${k(s.p90Peak).padStart(6)}  median ${String(s.medianTurns ?? 'n/a').padStart(4)} turns  ` +
      `crossed the threshold: ${pct(s.overLarge)}`
    console.log(`read ${turns.length} turns from ${dir}`)
    console.log(
      `  ${out.transcripts.topLevel} session transcripts + ${out.transcripts.subagent} delegated-agent ` +
        'transcripts under <session>/subagents/ — both bill against the same quota',
    )
    console.log(`boundary first fired ${out.boundaryAt}; "large" context is ≥ ${LARGE_CONTEXT_TOKENS.toLocaleString('en-US')} tokens`)
    for (const scope of SCOPE_ORDER) {
      const s = scopes[scope]
      console.log('')
      console.log(`SCOPE ${SCOPE_LABELS[scope]} — ${SCOPE_NOTES[scope]}`)
      console.log(`  ${s.turnsRead} turns counted, of which ${s.subagentTurns} from delegated agents`)
      console.log(row('BEFORE', s.before))
      console.log(row('AFTER', s.after))
      console.log(`  ratio after/before: ${s.ratio ?? 'n/a'}`)
      console.log(
        `  carried through the ${anchorRatePerHour} %/h anchor: ${s.rate ?? 'n/a'} %/h ` +
          `(${s.underCeiling == null ? 'n/a' : s.underCeiling ? 'UNDER' : 'OVER'} the ~0.6 %/h that fits)`,
      )
      console.log('  per SESSION — how far the context climbed before the session ended:')
      console.log(srow('BEFORE', s.sessions.before))
      console.log(srow('AFTER', s.sessions.after))
    }
    console.log('')
    console.log('  the weighted number is a PROXY (COST_WEIGHTS in the core), not a bill.')
    console.log(`  the verdict is read off the ${SCOPE_LABELS.full} scope; ${SCOPE_LABELS.topLevel} is the older, comparable one.`)
  }
}
