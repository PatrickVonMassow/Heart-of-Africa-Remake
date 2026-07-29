// Pure decision core of the findings-durability check.
//
// A finding that lives only in the chat dies with the session. On 29.07.2026
// one evening produced three defects — the project hooks that cannot fire
// outside the repo root, a bundling scheme covering 53 of 91 open points, and
// point 409 repeating within 24 hours — and every one of them survived only
// because the USER asked twice whether they were being kept. That is not a
// discipline problem: a session that does not own the batch lock cannot write
// TASKS.md at all, so the state most likely to produce a finding is exactly
// the one with no durable path anything checks.
//
// Hence two conditions, one per session state:
//   1. A turn that INVESTIGATED and recorded nothing blocks. Investigation is
//      COUNTED from the turn's tool calls, never inferred from meaning — a
//      guard that guesses what a turn was "about" would be unfalsifiable.
//   2. A session that OWNS the batch and still has entries in the carrier
//      blocks. Memory is the transport for a locked-out session, never the
//      resting place; without this the carrier becomes what
//      pending-queue-work-29-07.md already was — a note nothing drains.
//
// Side-effect free; the wrapper (findings-guard.mjs) reads the tree and is
// fail-open, so a bug in here can never trap a session.

/** Investigative calls needed before a recordless turn is judged. Calibrated
 *  against the 29.07. transcript: the analysis turns ran 6+ read/search calls,
 *  the answer-only turns stayed at 0-2. A guard that fires on an ordinary
 *  conversational turn trains the reader to skip it — the argument
 *  guard-health-core.mjs makes about enforcers in general. */
export const DEFAULT_THRESHOLD = 6

/** Tools whose every use is investigation. */
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch'])
/** Tools that run a shell — investigation unless the command IS a record. */
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
/** Tools that write files — a record only for the paths below. */
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

/** A shell command that itself constitutes a durable record. */
function shellRecordKind(command) {
  const c = String(command ?? '')
  // `git commit` — the project's own durable unit. `--dry-run` is not one.
  // The option run between `git` and `commit` admits flags AND their values
  // (`git -c user.name=x commit`), but not a bare subcommand, so `git log
  // --grep commit` stays what it is: a search.
  if (/\bgit\s+(?:-\S+\s+|\S+=\S+\s+)*commit\b/.test(c) && !/--dry-run\b/.test(c)) return 'commit'
  if (/\bfinding\.mjs\b[^|;&]*--record\b/.test(c)) return 'finding-record'
  if (/\bfinding\.mjs\b[^|;&]*--none\b/.test(c)) return 'finding-none'
  return null
}

/** A written path that constitutes a durable record. */
function writeRecordKind(filePath) {
  const p = String(filePath ?? '').replace(/\\/g, '/')
  if (/(^|\/)TASKS\.md$/.test(p)) return 'tasks-edit'
  // The memory dir is the one place a stood-down session may write, which is
  // why it counts — see the header.
  if (/\/\.claude\/projects\/[^/]+\/memory\//.test(p)) return 'memory-write'
  return null
}

/**
 * Classify ONE tool call.
 * Returns { kind: 'investigate' | 'record' | 'ignore', record?: <record kind>, agent?: true }.
 */
export function classifyCall({ name, command, filePath } = {}) {
  const tool = String(name ?? '')
  if (tool === 'Agent') return { kind: 'investigate', agent: true }
  if (READ_TOOLS.has(tool)) return { kind: 'investigate' }
  if (SHELL_TOOLS.has(tool)) {
    const record = shellRecordKind(command)
    return record ? { kind: 'record', record } : { kind: 'investigate' }
  }
  if (WRITE_TOOLS.has(tool)) {
    const record = writeRecordKind(filePath)
    return record ? { kind: 'record', record } : { kind: 'ignore' }
  }
  return { kind: 'ignore' }
}

/**
 * Tally one turn's calls.
 * `calls` is plain data ([{ name, command, filePath }]) so the whole decision
 * is testable without a transcript.
 */
export function tallyTurn(calls = []) {
  let investigative = 0
  let agents = 0
  const records = []
  for (const call of Array.isArray(calls) ? calls : []) {
    const verdict = classifyCall(call)
    if (verdict.kind === 'investigate') {
      investigative++
      if (verdict.agent) agents++
    } else if (verdict.kind === 'record') {
      records.push(verdict.record)
    }
  }
  return { investigative, agents, records }
}

/**
 * The tool calls of ONE turn, read out of a session transcript (JSONL).
 * Kept here rather than in the wrapper so the parsing is covered like every
 * other decision: a transcript shape that changes must fail a test, not a
 * turn end. `turnStartedAt` is the boundary board-first-guard already uses.
 */
export function turnCalls(transcriptText, turnStartedAt) {
  const calls = []
  for (const line of String(transcriptText ?? '').split(/\r?\n/)) {
    if (!line.includes('"tool_use"')) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type !== 'assistant') continue
    const at = Date.parse(entry.timestamp ?? '')
    if (!Number.isFinite(at) || at < turnStartedAt) continue
    const content = entry.message && entry.message.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part.type !== 'tool_use') continue
      calls.push({
        name: part.name,
        command: part.input && typeof part.input.command === 'string' ? part.input.command : undefined,
        filePath: part.input && typeof part.input.file_path === 'string' ? part.input.file_path : undefined,
      })
    }
  }
  return calls
}

/**
 * Judge the turn.
 *
 * Inputs (all plain data):
 *   tally          from tallyTurn()
 *   ownsBatch      does this session hold the batch lock
 *   carrierPending how many findings still sit in the memory carrier
 *   threshold      override for DEFAULT_THRESHOLD (tests inject their own)
 *
 * Returns { ok, violations: [{ kind, detail }] }.
 */
export function auditFindings({ tally, ownsBatch = false, carrierPending = 0, threshold = DEFAULT_THRESHOLD } = {}) {
  const t = tally ?? { investigative: 0, agents: 0, records: [] }
  const records = Array.isArray(t.records) ? t.records : []
  const violations = []

  // Spawning an agent is investigation on its own: it is the most expensive
  // way this project looks at something, and its result reaches nobody unless
  // the parent records it.
  const investigated = Number(t.agents) > 0 || Number(t.investigative) >= threshold
  if (investigated && records.length === 0) {
    violations.push({
      kind: 'unrecorded-investigation',
      detail:
        `Dieser Zug hat untersucht (${t.investigative} Lese-/Suchaufrufe` +
        `${Number(t.agents) > 0 ? `, ${t.agents} Agent(en)` : ''}), aber nichts Dauerhaftes hinterlassen. ` +
        'Ein Befund, der nur im Gespräch steht, stirbt mit der Sitzung. Halte ihn fest: ' +
        'node scripts/finding.mjs --record "<Titel>" --detail "<…>" — oder erkläre den Zug ' +
        'ausdrücklich für befundlos: node scripts/finding.mjs --none "<Grund>".',
    })
  }

  if (ownsBatch && Number(carrierPending) > 0) {
    violations.push({
      kind: 'carrier-not-drained',
      detail:
        `${carrierPending} Befund(e) liegen noch im Memory-Träger, während diese Sitzung den Batch HÄLT. ` +
        'Der Träger ist Transport, nie Lager: übertrage sie in TASKS.md (als Bündel-Mitglied, ' +
        'bundle-first) und leere sie dann mit node scripts/finding.mjs --drained "<Titel>".',
    })
  }

  return { ok: violations.length === 0, violations }
}

/** Render the audit as the guard's block message. */
export function formatFindings(violations) {
  if (!violations || !violations.length) return ''
  return [
    `BEFUND-SICHERUNG: ${violations.length} Befund(e).`,
    ...violations.map((v) => `  · [${v.kind}] ${v.detail}`),
    '',
    'Drei Befunde eines Abends hingen daran, dass der Nutzer zweimal nachgefragt hat,',
    'ob sie festgehalten werden. Genau das soll diese Prüfung überflüssig machen.',
    'Stand ansehen mit: node scripts/finding.mjs --drain',
  ].join('\n')
}

// ---- the carrier ----------------------------------------------------------
//
// One entry per line, so the file stays readable as prose AND parseable:
//   - [ ] <ISO> · <session> · <title>
//         <detail>
// `- [ ]` is pending, `- [x]` has reached the work order.

/** Parse the carrier's entries out of its markdown. */
export function parseCarrier(text = '') {
  const pending = []
  let drained = 0
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^- \[( |x)\] (\S+) · (\S+) · (.*)$/.exec(line)
    if (!m) continue
    if (m[1] === 'x') {
      drained++
      continue
    }
    pending.push({ at: m[2], session: m[3], title: m[4] })
  }
  return { pending, drained }
}

/** Render one carrier entry (title is single-line; detail is indented under it). */
export function carrierEntry({ at, session, title, detail }) {
  const head = `- [ ] ${at} · ${session} · ${String(title ?? '').replace(/\s+/g, ' ').trim()}`
  const body = String(detail ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `      ${l}`)
  return [head, ...body].join('\n')
}

/** Mark the first pending entry whose title matches as drained. Returns the
 *  new text, or null when nothing matched — the caller reports that rather
 *  than silently succeeding. */
export function markDrained(text, title) {
  const needle = String(title ?? '').trim().toLowerCase()
  if (!needle) return null
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = /^- \[ \] (\S+) · (\S+) · (.*)$/.exec(lines[i])
    if (!m) continue
    if (!m[3].toLowerCase().includes(needle)) continue
    lines[i] = lines[i].replace('- [ ] ', '- [x] ')
    return lines.join('\n')
  }
  return null
}
