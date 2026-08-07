// Pure decision core of the POINT-PROOF gate (work-order point 437 C).
//
// WHY IT EXISTS: a point carries its acceptance condition as PROSE — "counts as
// delivered when the rate is MEASURED, not when the mechanism runs" is the
// clearest specimen, with scripts/measure-context-cost.mjs sitting in the tree
// unused by any gate — and NOTHING compares a tick against it. `closing-guard`
// gates a version tag and the one tick that claims a closing; no guard reads a
// point's OWN condition. So a point could be ticked because it FELT finished,
// which is exactly the class this project's core lesson forbids: a rule that
// exists only as prose.
//
// THE GRAMMAR IS OPT-IN. A point that wants its condition enforced writes ONE
// machine-readable line naming the command whose run must be recorded:
//
//     PROOF: node scripts/measure-context-cost.mjs --since 2026-07-01
//
// and the tick of that point is refused until that run is RECORDED FOR THE
// CURRENT HEAD, in the same evidence grammar `closing-guard --step --evidence`
// already uses. A point WITHOUT such a line ticks exactly as before, so adding
// this gate can never block the existing corpus of 500-odd points.
//
// PER-COMMIT, like the closing checklist: a proof run says something about the
// code it ran against. Recorded at an older head it counts for nothing, because
// the thing it measured has changed since.
//
// Side-effect free — the git work, the ledger and the deny belong to
// scripts/point-proof-guard.mjs (fail-OPEN). Pinned by point-proof-core.test.mjs.
import { parsePoints, tickClaim } from './closing-guard-core.mjs'

/**
 * The proof line, anchored to the start of its line so a sentence ABOUT the
 * convention is not one.
 *
 * The quote group is the whole reason this is not a bare `/PROOF:/`: the
 * documentation of the grammar — in the work order's preamble, in this file's
 * own header, in a point that explains it — writes the line as a CODE SPAN or a
 * quotation, and reading that as a demand would have the gate judge points by
 * prose about the gate. `criticalityOf` carries the identical scar.
 */
const PROOF_LINE = /^[ \t]*(?:[-*+][ \t]+)?(["'`]?)PROOF:[ \t]*(.+?)[ \t]*$/gim

/** Strip a code span's backticks (or quotes) from a recorded command. */
const unquote = (text) =>
  String(text ?? '')
    .trim()
    .replace(/^`+([^`]*)`+$/, '$1')
    .replace(/^"([^"]*)"$/, '$1')
    .replace(/^'([^']*)'$/, '$1')
    .trim()

/**
 * Every proof command a point body demands, in the order written.
 *
 * ALL of them, not the last one: a point may owe two measurements, and silently
 * honouring only the final line would enforce half a condition while reading as
 * enforced — the failure mode this whole point exists to end.
 */
export function proofCommands(body) {
  const out = []
  for (const m of String(body ?? '').matchAll(PROOF_LINE)) {
    if (m[1]) continue // quoted → prose about the grammar, not a demand
    const command = unquote(m[2])
    if (command && !out.includes(command)) out.push(command)
  }
  return out
}

/**
 * The proof commands point `n` demands, read from every text that might carry
 * its spec.
 *
 * SEVERAL texts, because the tick is TWO EDITS in either order (the lesson
 * `closingTickClaim` learned the hard way): the point leaves TASKS.md and lands,
 * ticked, in the archive, so at the moment the archive is written the work order
 * may no longer hold the point at all. The text BEING WRITTEN is therefore read
 * as a work order too, and the first text that knows the point wins.
 */
export function proofCommandsFor(n, ...texts) {
  for (const text of texts) {
    const block = parsePoints(text).find((p) => p.n === Number(n))
    if (!block) continue
    const commands = proofCommands(block.text)
    if (commands.length) return commands
  }
  return []
}

/** Are two command lists the same demand? Order and spelling both count. */
const sameCommands = (a = [], b = []) =>
  a.length === b.length && a.every((cmd, i) => cmd === b[i])

/**
 * Is point `n`'s proof satisfied by the ledger, at `headSha`?
 *
 * Returns { ok, reason } where reason is 'none-recorded' | 'stale-commit' |
 * 'changed-demand' | ''. The THIRD is what keeps the record honest: a run
 * recorded against one command does not vouch for a different one, so editing
 * the proof line after recording invalidates the record rather than inheriting
 * it.
 */
export function proofSatisfied({ runs, n, commands = [], headSha = '' } = {}) {
  const entry = runs && typeof runs === 'object' ? runs[String(n)] : null
  if (!entry || typeof entry !== 'object') return { ok: false, reason: 'none-recorded' }
  if (!String(entry.evidence ?? '').trim()) return { ok: false, reason: 'none-recorded' }
  if (!headSha || entry.commit !== headSha) return { ok: false, reason: 'stale-commit', entry }
  if (!sameCommands(Array.isArray(entry.commands) ? entry.commands : [], commands)) {
    return { ok: false, reason: 'changed-demand', entry }
  }
  return { ok: true, reason: '', entry }
}

/**
 * The PreToolUse decision.
 *
 * Inputs (plain data — the wrapper does the I/O):
 *   toolName/toolInput  the call being made
 *   tasksText           the whole work order (open + archive)
 *   runs                the ledger, { "<point>": { commit, commands, evidence, at } }
 *   ledgerReadable      false when the ledger exists but could NOT be read —
 *                       then nothing is judged (fail-open, per the point's own
 *                       verifiable list). Absent-and-empty is NOT unreadable:
 *                       that is simply "nothing recorded yet", which blocks.
 *   headSha             the commit a run must have been recorded against
 *
 * Returns { block, reason, findings }. Never throws on partial input.
 */
export function evaluate({
  toolName,
  toolInput,
  tasksText = '',
  runs = {},
  ledgerReadable = true,
  headSha = '',
} = {}) {
  try {
    if (ledgerReadable === false) return { block: false, reason: '', findings: [] }
    const { points, addedText } = tickClaim({ toolName, toolInput, tasksText })
    if (!points.length) return { block: false, reason: '', findings: [] }

    const findings = []
    for (const n of points) {
      const commands = proofCommandsFor(n, addedText, tasksText)
      if (!commands.length) continue // no proof line → ticks as before
      const verdict = proofSatisfied({ runs, n, commands, headSha })
      if (!verdict.ok) findings.push({ point: n, commands, ...verdict })
    }
    if (!findings.length) return { block: false, reason: '', findings: [] }
    return { block: true, reason: formatProofVerdict(findings, headSha), findings }
  } catch {
    return { block: false, reason: '', findings: [] } // total by contract
  }
}

const short = (sha) => String(sha ?? '').slice(0, 12)

/** Render the refusal: every offender, its own condition, and the way out. */
export function formatProofVerdict(findings = [], headSha = '') {
  if (!findings.length) return ''
  const lines = [
    `POINT PROOF MISSING — refusing to tick ${findings
      .map((f) => `point ${f.point}`)
      .join(', ')} as done${headSha ? ` at commit ${short(headSha)}` : ''}.`,
    '',
    'These points state their acceptance condition as a machine-readable PROOF line:',
    'the tick is the claim that the condition HOLDS, so the named run must be on record',
    'for the commit being ticked — not remembered, and not merely runnable.',
    '',
  ]
  for (const f of findings) {
    lines.push(`  ✗ point ${f.point}`)
    for (const cmd of f.commands) lines.push(`      PROOF: ${cmd}`)
    if (f.reason === 'none-recorded') {
      lines.push('      no run recorded for this point')
    } else if (f.reason === 'stale-commit') {
      lines.push(
        `      the recorded run judges ${short(f.entry?.commit) || '(no commit)'}, not this HEAD — a` +
          ' measurement says something about the code it ran against, and that code has moved',
      )
    } else {
      lines.push(
        '      the recorded run names a DIFFERENT command than the point now demands:',
        `        recorded: ${(f.entry?.commands ?? []).join(' ; ') || '(none)'}`,
        '      re-run what the point asks for now, then record that.',
      )
    }
  }
  lines.push(
    '',
    'Run each command, then record it with its result:',
    '  node scripts/point-proof-guard.mjs --ran <N> --evidence "<the measured result, one line>"',
    '',
    'Inspect the gate with: node scripts/point-proof-guard.mjs --status',
    'If the condition is wrong, correct the POINT rather than the ledger — the line is the spec.',
  )
  return lines.join('\n')
}
