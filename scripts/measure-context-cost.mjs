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
//
// The transcripts live OUTSIDE the repository (~/.claude/projects/…), which is why this
// reads them rather than shipping their numbers: a figure in a document cannot be
// re-derived, and this project has already been bitten by an estimated number presented
// as a measured one.
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { measureCost, derivedRate, sessionProfile, LARGE_CONTEXT_TOKENS } from './measure-context-cost-core.mjs'

const TRANSCRIPTS = join(homedir(), '.claude', 'projects', 'c--Users-Patri-Documents-Developing-hoa')
const BOUNDARY_LOG = join(REPO_ROOT, '.claude', 'boundary.log')

/** WHEN the boundary mechanism first fired, read from the log that records it. Falls
 *  back to null, in which case the caller must name a moment — guessing a calendar day
 *  would make the whole comparison a coincidence. */
export function firstHandoverAt(logPath = BOUNDARY_LOG) {
  try {
    for (const line of readFileSync(logPath, 'utf8').split('\n')) {
      if (!line.includes('HANDOVER')) continue
      const at = Date.parse(line.slice(1, line.indexOf(']')))
      if (Number.isFinite(at)) return at
    }
  } catch {
    /* no log — the caller decides */
  }
  return null
}

/**
 * Every assistant turn with usage, deduplicated. A transcript repeats one turn's usage
 * across its streamed lines, so counting lines would multiply the spend by three.
 */
export async function readTurns(dir = TRANSCRIPTS) {
  const turns = []
  const seen = new Set()
  if (!existsSync(dir)) return turns
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const path = join(dir, file)
    if (statSync(path).size < 1000) continue
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
      const id = rec.message?.id ?? rec.requestId ?? `${file}:${rec.uuid ?? at}`
      if (seen.has(id)) continue
      seen.add(id)
      // The transcript file IS the session — one file per session id.
      turns.push({ at, usage, session: rec.sessionId ?? file.replace(/\.jsonl$/, '') })
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
  const turns = await readTurns()
  const result = measureCost({ turns, boundaryAt })
  const rate = derivedRate({ ratio: result.ratio })
  const profile = sessionProfile({ turns, boundaryAt })
  const out = {
    boundaryAt: new Date(boundaryAt).toISOString(),
    largeContextTokens: LARGE_CONTEXT_TOKENS,
    ...result,
    ...rate,
    sessions: profile,
  }
  if (asJson) {
    console.log(JSON.stringify(out, null, 2))
  } else {
    const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)} %`)
    const row = (name, s) =>
      `  ${name.padEnd(7)} ${String(s.turns).padStart(6)} turns  ${String(s.activeHours).padStart(7)} active h  ` +
      `${String(s.weightedPerHour ?? 'n/a').padStart(9)} weighted/h  large-context share ${pct(s.largeShare)}`
    console.log(`boundary first fired ${out.boundaryAt}; "large" context is ≥ ${LARGE_CONTEXT_TOKENS.toLocaleString('en-US')} tokens`)
    console.log(row('BEFORE', result.before))
    console.log(row('AFTER', result.after))
    console.log(`  ratio after/before: ${result.ratio ?? 'n/a'}`)
    console.log(
      `  carried through the point's own 1.25 %/h anchor: ${rate.rate ?? 'n/a'} %/h ` +
        `(${rate.underCeiling == null ? 'n/a' : rate.underCeiling ? 'UNDER' : 'OVER'} the ~0.6 %/h that fits)`,
    )
    const k = (v) => (v == null ? 'n/a' : `${Math.round(v / 1000)}k`)
    const srow = (name, s) =>
      `  ${name.padEnd(7)} ${String(s.sessions).padStart(4)} sessions  median peak ${k(s.medianPeak).padStart(6)}  ` +
      `p90 peak ${k(s.p90Peak).padStart(6)}  median ${String(s.medianTurns ?? 'n/a').padStart(4)} turns  ` +
      `crossed the threshold: ${pct(s.overLarge)}`
    console.log('per SESSION — how far the context climbed before the session ended:')
    console.log(srow('BEFORE', profile.before))
    console.log(srow('AFTER', profile.after))
    console.log('  the weighted number is a PROXY (COST_WEIGHTS in the core), not a bill.')
  }
}
