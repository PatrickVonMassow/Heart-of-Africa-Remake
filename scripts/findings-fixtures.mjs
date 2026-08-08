#!/usr/bin/env node
// Cut the findings-guard's calibration fixtures out of the REAL transcript corpus,
// and re-measure the rates findings-core.mjs claims.
//
// WHY THIS EXISTS. The core's threshold carries a calibration claim — "a guard that
// fires on an ordinary turn trains the reader to skip it, so the rate must stay
// low" — and a claim about a corpus is worth exactly what can be replayed. Until
// now the cases it cited lived only in a review message. `--cut` writes them into
// `findings-fixtures.json`, where `findings-fixtures.test.mjs` replays them on every
// unit run, so a refactor that quietly re-tunes the decision fails a test instead of
// a turn end.
//
// WHAT IS COMMITTED. Never a raw transcript: one entry per turn, holding only the
// three fields the decision reads (tool name, shell command, written path), with
// home directories folded to `~`, anything token-shaped removed, and every long
// shell segment shortened — but ONLY as far as the shortened text still classifies
// exactly like the original, which the cutter verifies call by call.
//
// Usage:
//   node scripts/findings-fixtures.mjs --measure   # rates over the local corpus
//   node scripts/findings-fixtures.mjs --cut       # rewrite findings-fixtures.json
//   …    [--dir <transcript dir>] [--limit <per family>]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { auditFindings, classifyCall, DEFAULT_THRESHOLD, tallyTurn } from './findings-core.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { resolveTranscriptDir, transcriptCandidates } from './measure-context-cost-core.mjs'
import { isMainModule } from './is-main.mjs'

export const FIXTURE_PATH = repoPath('scripts/findings-fixtures.json')

/** The transcript folder, resolved exactly like measure-context-cost does — never a
 *  hard-coded host slug, which is what once made a MISS read as a measurement. */
function transcriptDir(env = process.env, home = homedir()) {
  const hasTranscripts = (dir) => {
    try {
      return readdirSync(dir).some((f) => f.endsWith('.jsonl') && statSync(join(dir, f)).size >= 1000)
    } catch {
      return false
    }
  }
  if (env.MEASURE_TRANSCRIPTS_DIR) return resolveTranscriptDir([env.MEASURE_TRANSCRIPTS_DIR], hasTranscripts)
  const projectsDir = join(home, '.claude', 'projects')
  return resolveTranscriptDir(transcriptCandidates({ repoRoot: REPO_ROOT, projectsDir, join }), hasTranscripts)
}

/**
 * The turns of one transcript, as the plain call data the core takes.
 *
 * A turn starts at a real user prompt (a string message that is not a tool result)
 * and ends at the next one — the same boundary the Stop hook measures against, read
 * from the transcript rather than from the shared clock, because a historical turn
 * has no live stamp. Sidechain entries (a subagent's own transcript) are skipped:
 * they are the AGENT's turns, not the parent's.
 */
export function turnsOfTranscript(text, source = '') {
  const turns = []
  let current = null
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.isSidechain) continue
    const content = entry.message && entry.message.content
    if (entry.type === 'user' && typeof content === 'string' && content.trim()) {
      current = { source, at: entry.timestamp ?? '', calls: [] }
      turns.push(current)
      continue
    }
    if (entry.type === 'assistant' && Array.isArray(content) && current) {
      for (const part of content) {
        if (part.type !== 'tool_use') continue
        const input = part.input ?? {}
        current.calls.push({
          name: part.name,
          ...(typeof input.command === 'string' ? { command: input.command } : {}),
          ...(typeof input.file_path === 'string' ? { filePath: input.file_path } : {}),
        })
      }
    }
  }
  return turns
}

// ---- redaction ------------------------------------------------------------

const SECRET = /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,})\b/g

/** Fold machine-specific paths away and drop anything token-shaped. */
function scrubPaths(text, home = homedir(), root = REPO_ROOT) {
  return String(text ?? '')
    .split(root)
    .join('<repo>')
    .split(home)
    .join('~')
    .replace(SECRET, '<redacted>')
}

/**
 * Shorten one shell command WITHOUT changing what it means to the decision.
 *
 * Each segment keeps its head — which is all `segmentIsReadOnly` and the record
 * patterns are anchored on — and the shortened command is accepted only if it
 * classifies identically to the original. Otherwise the full (path-scrubbed)
 * command is kept, so fidelity always wins over size.
 */
export function redactCommand(command, { head = 90, classify = classifyCall } = {}) {
  const scrubbed = scrubPaths(command)
  const short = scrubbed
    .split(/(?:\|\||&&|[;|\n])/)
    .map((s) => {
      const t = s.trim()
      return t.length > head ? `${t.slice(0, head)} …` : t
    })
    .filter(Boolean)
    .join(' ; ')
  const same =
    JSON.stringify(classify({ name: 'Bash', command: short })) ===
    JSON.stringify(classify({ name: 'Bash', command: scrubbed }))
  return same ? short : scrubbed
}

/** One turn, reduced to what the decision reads and safe to commit. With
 *  `shorten` off the commands keep their full (still path-scrubbed) text — the
 *  fallback for a turn whose meaning the head cut would not survive. */
export function redactTurn(turn, { shorten = true } = {}) {
  return {
    source: String(turn.source ?? '').slice(0, 8),
    at: turn.at,
    calls: turn.calls.map((c) => ({
      name: c.name,
      ...(c.command === undefined ? {} : { command: shorten ? redactCommand(c.command) : scrubPaths(c.command) }),
      ...(c.filePath === undefined ? {} : { filePath: scrubPaths(c.filePath) }),
    })),
  }
}

// ---- families -------------------------------------------------------------
//
// A fixture's expectation comes from its FAMILY — what KIND of turn it is — never
// from what the core happened to answer when it was cut. That is the whole point:
// an expectation copied from the current behaviour would pass any refactor,
// including a broken one. `--cut` REFUSES a turn whose verdict contradicts its
// family, so a mismatch surfaces here rather than as a silently useless fixture.

/** Does this turn run something that ACTS — a build, a test suite, a verify run? */
function looksLikeBuildOrVerify(calls) {
  return calls.some((c) => /\b(?:npm (?:run )?(?:test|build|lint)|vitest|playwright|node scripts\/verify)/.test(c.command ?? ''))
}

export const FAMILIES = [
  {
    id: 'answer-only',
    expect: 'allow',
    why: 'A turn that only answers investigated nothing. It must never block — this is the desensitisation case.',
    match: (t) => t.calls.length === 0,
  },
  {
    id: 'looked-and-recorded',
    expect: 'allow',
    why: 'Investigated AND left a durable trace (commit, TASKS.md, memory, finding.mjs). The duty is discharged.',
    match: (t, tally) => tally.investigative >= DEFAULT_THRESHOLD && tally.records.some((r) => r !== 'wait-declared'),
  },
  {
    id: 'build-verify',
    expect: 'allow',
    why:
      'The calibration case: a build/test turn is work, not analysis. Counting every shell call as investigation ' +
      'fires exactly here, which is what the shell classification exists to prevent.',
    match: (t, tally) =>
      looksLikeBuildOrVerify(t.calls) &&
      tally.records.length === 0 &&
      tally.agents === 0 &&
      tally.investigative < DEFAULT_THRESHOLD,
  },
  {
    id: 'delegated-wait',
    expect: 'allow',
    why:
      'Delegation: an agent was spawned and the wait declared. The result arrives turns later, where the merge ' +
      'is the record — this is the family that decides the Agent trigger (see the core header).',
    match: (t, tally) => tally.agents > 0 && tally.records.includes('wait-declared'),
  },
  {
    id: 'unrecorded-investigation',
    expect: 'block',
    why: 'Read/searched at length (or spawned an agent) and left nothing durable — the turn this check exists for.',
    match: (t, tally) =>
      (tally.agents > 0 || tally.investigative >= DEFAULT_THRESHOLD) &&
      !tally.records.some((r) => r !== 'wait-declared') &&
      !tally.records.includes('wait-declared'),
  },
]

/** The family a turn belongs to — first match wins, so the ordering above is the
 *  priority: an explicit record or an earned exemption outranks the block rule. */
export function familyOf(turn, tally) {
  return FAMILIES.find((f) => f.match(turn, tally)) ?? null
}

// ---- corpus ---------------------------------------------------------------

function readCorpus(dir) {
  const turns = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    const path = join(dir, file)
    if (statSync(path).size < 1000) continue
    turns.push(...turnsOfTranscript(readFileSync(path, 'utf8'), file))
  }
  return turns
}

/** The tally a rule that counted EVERY shell call as investigation would produce —
 *  the alternative the threshold comment rejects, kept here so the rejection stays
 *  a measurement rather than a memory. */
function naiveTally(calls) {
  let investigative = 0
  let agents = 0
  const records = []
  for (const call of calls) {
    const verdict = classifyCall(call)
    if (verdict.kind === 'record') records.push(verdict.record)
    else if (verdict.kind === 'investigate') {
      investigative++
      if (verdict.agent) agents++
    } else if (call.name === 'Bash') investigative++
  }
  return { investigative, agents, records }
}

export function measureCorpus(turns) {
  const counts = { turns: turns.length, blocks: 0, naiveBlocks: 0, naiveBuildVerify: 0, agents: 0, agentBlocks: 0, agentWait: 0, byFamily: {} }
  for (const turn of turns) {
    const tally = tallyTurn(turn.calls)
    if (!auditFindings({ tally }).ok) counts.blocks++
    if (!auditFindings({ tally: naiveTally(turn.calls) }).ok) {
      counts.naiveBlocks++
      if (looksLikeBuildOrVerify(turn.calls)) counts.naiveBuildVerify++
    }
    if (tally.agents > 0) {
      counts.agents++
      if (tally.records.includes('wait-declared') && !tally.records.some((r) => r !== 'wait-declared')) counts.agentWait++
      if (!auditFindings({ tally }).ok) counts.agentBlocks++
    }
    const family = familyOf(turn, tally)
    if (family) counts.byFamily[family.id] = (counts.byFamily[family.id] ?? 0) + 1
  }
  return counts
}

/** Pick up to `limit` turns per family, oldest first, so a re-cut is deterministic. */
export function pickFixtures(turns, limit = 3, maxCalls = 14) {
  const perFamily = new Map()
  const take = (turn, family) => {
    const verdict = auditFindings({ tally: tallyTurn(turn.calls) })
    if (verdict.ok === (family.expect === 'block')) {
      throw new Error(`findings-fixtures: ${family.id} turn ${turn.at} contradicts its family (expected ${family.expect})`)
    }
    // THE REDACTED TURN MUST STILL BE THE SAME TURN. The head cut is verified per
    // CALL, which keeps every verdict intact but can still hide the `npm test` that
    // makes a turn a build turn — and a fixture filed under a family it no longer
    // belongs to documents nothing. Shortening is dropped for such a turn rather
    // than the turn being dropped: fidelity outranks size, here as in redactCommand.
    let redacted = redactTurn(turn)
    if (familyOf(redacted, tallyTurn(redacted.calls))?.id !== family.id) redacted = redactTurn(turn, { shorten: false })
    perFamily.set(family.id, [...(perFamily.get(family.id) ?? []), { family: family.id, expect: family.expect, ...redacted }])
  }

  const ordered = [...turns].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const byFamily = new Map()
  for (const turn of ordered) {
    const family = familyOf(turn, tallyTurn(turn.calls))
    if (!family) continue
    byFamily.set(family.id, [...(byFamily.get(family.id) ?? []), turn])
    // A fixture must be READABLE: a 40-call turn proves nothing a 12-call one does
    // not, and the file is committed.
    if (turn.calls.length > maxCalls || (perFamily.get(family.id) ?? []).length >= limit) continue
    take(turn, family)
  }
  // EVERY family must be REPRESENTED, even where the corpus only has long turns:
  // a family that silently produced no fixture is a case the test does not cover,
  // and the missing one would be the case nobody notices. The shortest turn stands
  // in.
  for (const family of FAMILIES) {
    if ((perFamily.get(family.id) ?? []).length > 0) continue
    const candidates = [...(byFamily.get(family.id) ?? [])].sort((a, b) => a.calls.length - b.calls.length)
    if (candidates.length) take(candidates[0], family)
  }
  return FAMILIES.flatMap((f) => perFamily.get(f.id) ?? [])
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (flag, fallback = null) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : fallback
  }
  const dir = arg('--dir') ?? transcriptDir()
  const turns = readCorpus(dir)
  const counts = measureCorpus(turns)
  const pct = (n) => `${((100 * n) / Math.max(1, counts.turns)).toFixed(1)} %`

  console.log(`corpus                : ${dir}`)
  console.log(`turns                 : ${counts.turns}`)
  console.log(`blocks (this core)    : ${counts.blocks} (${pct(counts.blocks)})`)
  console.log(
    `blocks (shell=looking): ${counts.naiveBlocks} (${pct(counts.naiveBlocks)}), of them build/verify ${counts.naiveBuildVerify}`,
  )
  console.log(
    `agent turns           : ${counts.agents}, exempt via the declared wait ${counts.agentWait}, blocking ${counts.agentBlocks}`,
  )
  console.log(`families              : ${JSON.stringify(counts.byFamily)}`)

  if (argv.includes('--cut')) {
    const fixtures = pickFixtures(turns, Number(arg('--limit', '3')))
    const payload = {
      note: 'Cut from the real transcript corpus by scripts/findings-fixtures.mjs --cut. Redacted to the fields the decision reads.',
      cutAt: new Date().toISOString(),
      corpusTurns: counts.turns,
      measured: {
        blocks: counts.blocks,
        naiveBlocks: counts.naiveBlocks,
        naiveBuildVerify: counts.naiveBuildVerify,
        agentTurns: counts.agents,
        agentExemptByDeclaredWait: counts.agentWait,
        agentBlocks: counts.agentBlocks,
      },
      families: FAMILIES.map((f) => ({ id: f.id, expect: f.expect, why: f.why })),
      turns: fixtures,
    }
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`\nwrote ${fixtures.length} fixture turns to ${FIXTURE_PATH}`)
  }
}

if (isMainModule(import.meta.url)) main()
