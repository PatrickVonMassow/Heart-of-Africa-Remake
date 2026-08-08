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
import { auditFindings, classifyCall, tallyTurn } from './findings-core.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { mainCheckoutOf, resolveTranscriptDir, transcriptCandidates } from './measure-context-cost-core.mjs'
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
 * A turn starts at a real user prompt and ends at the next one — the same boundary
 * the Stop hook measures against, read from the transcript rather than from the
 * shared clock, because a historical turn has no live stamp. Sidechain entries (a
 * subagent's own transcript) are skipped: they are the AGENT's turns, not the
 * parent's.
 *
 * A prompt is a user entry whose content is text — either a plain string or, when
 * the user attached an image, an array with a text part and no tool_result (Fable 5,
 * four-eyes finding 6: taking only the string form merged every attachment-carrying
 * prompt into the turn before it).
 */
export function isUserPrompt(content) {
  if (typeof content === 'string') return content.trim().length > 0
  if (!Array.isArray(content)) return false
  if (content.some((p) => p && p.type === 'tool_result')) return false
  return content.some((p) => p && p.type === 'text' && String(p.text ?? '').trim())
}

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
    if (entry.type === 'user' && isUserPrompt(content)) {
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
/** A session id wherever it appears in a path — scratchpad roots carry the full
 *  UUID, which would undo the 8-character `source` the entry deliberately keeps. */
const SESSION_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
/** Any home directory, not just THIS host's: the corpus was written on a Windows
 *  machine before this container, so a WSL path still carries the user's name. */
const ANY_HOME = /(?:\/mnt\/[a-z])?\/(?:home|Users)\/[^/\s"']+|[A-Za-z]:\\Users\\[^\\\s"']+/g

/**
 * Fold machine- and person-specific paths away and drop anything token-shaped
 * (four-eyes finding 2, Fable 5, 08.08.2026 — the first cut committed
 * `/mnt/c/Users/<name>`, full session UUIDs and the worktree-local repo path,
 * while claiming all three were folded).
 *
 * The repo root is folded for the MAIN checkout as well as the worktree the cutter
 * happens to run in, since a worktree's own root matches nothing a session outside
 * it ever wrote.
 */
export function scrubPaths(text, home = homedir(), root = REPO_ROOT) {
  let out = String(text ?? '')
  for (const r of [root, mainCheckoutOf(root)].filter(Boolean)) out = out.split(r).join('<repo>')
  return out
    .split(home)
    .join('~')
    .replace(SESSION_UUID, '<session>')
    .replace(ANY_HOME, '~')
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
// A fixture's expectation comes from its FAMILY — what KIND of turn it is — and the
// membership test is deliberately NOT the core's own verdict, so the two can
// disagree and the cut can refuse.
//
// HOW INDEPENDENT IT REALLY IS (four-eyes finding 1, Fable 5, 08.08.2026). The
// first version computed membership from the core's tally against the core's own
// threshold, which made every predicate imply its family's verdict by construction:
// the refusal below could not fire, and the claim that an expectation "can never be
// copied from current behaviour" was false as written. What is independent now:
//   - the RECORD, the AGENT and the DECLARED WAIT are read structurally from the
//     calls themselves (below), not from `tallyTurn`'s record kinds;
//   - the threshold is a FROZEN COPY (`PINNED_THRESHOLD`), not the core's constant,
//     so re-tuning the core makes family and verdict disagree and `--cut` refuses.
// What is NOT independent: the COUNTING RULE — which calls are investigation at all
// — is still the core's, because re-implementing it here would be a second decision
// to keep in step. So the honest statement of the protection is: the committed
// fixtures are FROZEN turns with frozen expectations, and a re-cut is reviewed as a
// DIFF. A re-tune plus a re-cut can still relabel a turn; what it cannot do is do so
// silently.

/** Does this turn run something that ACTS — a build, a test suite, a verify run? */
function looksLikeBuildOrVerify(calls) {
  return calls.some((c) => /\b(?:npm (?:run )?(?:test|build|lint)|vitest|playwright|node scripts\/verify)/.test(c.command ?? ''))
}

/** The calibrated threshold as it stood when these families were written. A frozen
 *  copy on purpose — see the note above. */
export const PINNED_THRESHOLD = 6

const isAgentCall = (c) => c.name === 'Agent'
/** A durable record, read from the call rather than from the core's record kinds.
 *  The dry run is excluded and the memory path is the project's own, so the mirror
 *  does not disagree with the core over a case both already agree on (four-eyes
 *  re-review advisory 1, Fable 5). */
const leavesARecord = (c) => {
  const command = c.command ?? ''
  if (c.name === 'Bash' && /--dry-run\b/.test(command)) return false
  return (
    (c.name === 'Bash' &&
      /(?:^|[;&|]\s*)(?:\S*\/)?git\s+(?:-[Cc]\s+\S+\s+|-\S+\s+|\S+=\S+\s+)*(?:commit|merge|cherry-pick|revert)\b/.test(command)) ||
    (c.name === 'Bash' && /finding\.mjs\b[^;&|]*--(?:record|none|drained|request|queued|blocked)\b/.test(command)) ||
    (['Edit', 'Write', 'NotebookEdit'].includes(c.name) &&
      /(?:^|\/)TASKS\.md$|\/\.claude\/projects\/[^/]+\/memory\//.test(c.filePath ?? ''))
  )
}
/** The declared wait, likewise read from the call. */
const declaresAWait = (c) => c.name === 'Bash' && /batch-in-flight\.mjs\b[^;&|]*--waiting-on\b/.test(c.command ?? '')

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
    match: (t, tally) => tally.investigative >= PINNED_THRESHOLD && t.calls.some(leavesARecord),
  },
  {
    id: 'build-verify',
    expect: 'allow',
    why:
      'The calibration case: a build/test turn is work, not analysis. Counting every shell call as investigation ' +
      'fires exactly here, which is what the shell classification exists to prevent.',
    match: (t, tally) =>
      looksLikeBuildOrVerify(t.calls) &&
      !t.calls.some(leavesARecord) &&
      !t.calls.some(declaresAWait) &&
      !t.calls.some(isAgentCall) &&
      tally.investigative < PINNED_THRESHOLD,
  },
  {
    id: 'delegated-wait',
    expect: 'allow',
    why:
      'Delegation: an agent was spawned and the wait declared. The result arrives turns later, where the merge ' +
      'is the record — this is the family that decides the Agent trigger (see the core header).',
    match: (t) => t.calls.some(isAgentCall) && t.calls.some(declaresAWait),
  },
  {
    id: 'claimed-wait-dishonoured',
    expect: 'block',
    why:
      'The wait was DECLARED but not earned: no agent was spawned in this turn. The exemption covers work that ' +
      'really was handed out, so this shape blocks — the subtlest rule in the core, and until now pinned only by ' +
      'constructed cases. Replayed without the declaration file, so this fixture covers the AGENT half alone.',
    match: (t, tally) =>
      t.calls.some(declaresAWait) &&
      !t.calls.some(isAgentCall) &&
      !t.calls.some(leavesARecord) &&
      tally.investigative >= PINNED_THRESHOLD,
  },
  {
    id: 'unrecorded-investigation',
    expect: 'block',
    why: 'Read/searched at length (or spawned an agent) and left nothing durable — the turn this check exists for.',
    match: (t, tally) =>
      (t.calls.some(isAgentCall) || tally.investigative >= PINNED_THRESHOLD) &&
      !t.calls.some(leavesARecord) &&
      !t.calls.some(declaresAWait),
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

/**
 * Pick up to `limit` turns per family, oldest first, so a re-cut is deterministic.
 * Returns { picked, contradictions }.
 *
 * A turn whose verdict contradicts its family is SKIPPED and REPORTED, not thrown on
 * (four-eyes re-review advisory 1, Fable 5): the throw made one odd turn brick the
 * whole re-cut until it was resolved by hand, and a tool that cannot be run is a
 * tool nobody runs. The contradictions are carried into the committed JSON and
 * asserted empty by the test, so skipping is not a way to lose one quietly.
 */
export function pickFixtures(turns, limit = 3, maxCalls = 14) {
  const perFamily = new Map()
  const contradictions = []
  const take = (turn, family) => {
    const verdict = auditFindings({ tally: tallyTurn(turn.calls) })
    if (verdict.ok === (family.expect === 'block')) {
      contradictions.push({ family: family.id, at: turn.at, expected: family.expect })
      return
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
  return { picked: FAMILIES.flatMap((f) => perFamily.get(f.id) ?? []), contradictions }
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
  // An UPPER BOUND, and said so (four-eyes finding 3, Fable 5): a historical turn
  // has no `.claude/batch-in-flight.json` mtime to check, so a declared wait that
  // the LIVE guard would have honoured on the file half counts as a block here.
  console.log(`blocks (this core)    : ${counts.blocks} (${pct(counts.blocks)}, upper bound)`)
  console.log(
    `blocks (shell=looking): ${counts.naiveBlocks} (${pct(counts.naiveBlocks)}), of them build/verify ${counts.naiveBuildVerify}`,
  )
  console.log(
    `agent turns           : ${counts.agents}, exempt via the declared wait ${counts.agentWait}, blocking ${counts.agentBlocks}`,
  )
  console.log(`families              : ${JSON.stringify(counts.byFamily)}`)

  if (argv.includes('--cut')) {
    const { picked, contradictions } = pickFixtures(turns, Number(arg('--limit', '3')))
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
        // Persisted so the family figures stay replayable after the corpus grows
        // past this cut (four-eyes re-review advisory 2, Fable 5).
        byFamily: counts.byFamily,
      },
      // Turns whose verdict contradicted their family, skipped rather than cut. The
      // test asserts this is empty: a disagreement between the two is the tripwire.
      contradictions,
      families: FAMILIES.map((f) => ({ id: f.id, expect: f.expect, why: f.why })),
      turns: picked,
    }
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`\nwrote ${picked.length} fixture turns to ${FIXTURE_PATH}`)
    if (contradictions.length) {
      console.log(`SKIPPED ${contradictions.length} turn(s) whose verdict contradicts their family:`)
      for (const c of contradictions) console.log(`  ${c.family} @ ${c.at} (expected ${c.expected})`)
    }
  }
}

if (isMainModule(import.meta.url)) main()
