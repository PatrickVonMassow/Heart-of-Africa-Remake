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

/** Investigative calls needed before a recordless turn is judged.
 *
 *  Calibrated against the whole transcript corpus, NOT against an impression.
 *  First measured by the second model on 29.07.2026 (2709 turns, 43 sessions,
 *  on the Windows host): counting every shell call as investigation blocked
 *  10.6 % of all turns and 73 % of those blocks were build/verify turns, not
 *  analysis. With shell calls classified read-only-or-not (below) the rate fell
 *  to roughly a twentieth of the turns, and the samples there were genuinely
 *  analysis. A guard that fires on an ordinary turn trains the reader to skip
 *  it, which is the argument guard-health-core.mjs makes about enforcers in
 *  general.
 *
 *  THE CLAIM IS NOW REPLAYABLE (08.08.2026). A measurement that lives in a
 *  review message is a memory, so the cases it cites are cut into
 *  `findings-fixtures.json` — real turns, one family per case, replayed by
 *  `findings-fixtures.test.mjs` on every unit run. Re-measured there on the
 *  Linux corpus: at the cut recorded in that file (809 turns, 56 sessions) this
 *  rule blocks 1.1 % of turns and the shell-counts-as-looking rule 5.6 %, while
 *  the 377 answer-only turns block under neither. The direction reproduces on a
 *  corpus the first measurement never saw; the absolute rates do not transfer
 *  between corpora, and the corpus keeps growing, so the figures are the CUT's,
 *  not constants. The block rate is an UPPER bound: a historical turn has no
 *  in-flight file mtime, so a declared wait the live guard would honour on that
 *  half counts as a block in the replay.
 *  Re-measure with: node scripts/findings-fixtures.mjs --measure */
export const DEFAULT_THRESHOLD = 6

/** Tools whose every use is investigation. */
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch'])
/** Tools that run a shell — investigation only when the command merely LOOKS. */
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
/** Tools that write files — a record only for the paths below. */
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * Split a shell command into its segments.
 *
 * Everything below is judged PER SEGMENT and anchored at its start, because a
 * whole-string match is both forgeable and maskable: `rg "git commit" src/`
 * would otherwise count as a commit (a search laundering itself into a
 * record), and `git commit --dry-run; git commit -m real` would lose the real
 * commit to the dry run beside it. Quoting is not parsed — a separator inside
 * a quoted string splits too, which can only ever split one segment into two
 * and never invents a match at a segment head.
 */
function segments(command) {
  return String(command ?? '')
    .split(/(?:\|\||&&|[;|\n])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** `git` option run: flags, flags with a detached value (`-C <path>`), and
 *  `key=value` config pairs — but never a bare subcommand, so `git log --grep
 *  commit` stays a search. */
const GIT_OPTS = '(?:-[Cc]\\s+\\S+\\s+|-\\S+\\s+|\\S+=\\S+\\s+)*'
const GIT_DURABLE = new RegExp(`^git\\s+${GIT_OPTS}(?:commit|merge|cherry-pick|revert)\\b`)

/** Shell heads that only ever look at something. */
const READ_ONLY_HEADS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'sed', 'awk', 'echo', 'pwd',
  'which', 'type', 'stat', 'diff', 'sort', 'uniq', 'tree', 'file', 'basename', 'dirname',
  'printf', 'date', 'env', 'test', 'true', 'false',
])
/** `git` subcommands that only read. */
const READ_ONLY_GIT = new Set([
  'status', 'log', 'diff', 'show', 'branch', 'rev-parse', 'for-each-ref', 'ls-files',
  'describe', 'blame', 'shortlog', 'worktree', 'remote', 'tag', 'stash',
])

/** Does this ONE segment merely look at the tree? */
function segmentIsReadOnly(segment) {
  const words = segment.split(/\s+/).filter(Boolean)
  const head = (words[0] ?? '').replace(/^.*[\\/]/, '')
  if (READ_ONLY_HEADS.has(head)) return true
  if (head === 'git') {
    const sub = words.slice(1).find((w) => !w.startsWith('-') && !w.includes('='))
    // A bare `git tag`/`git stash` lists; with more words they act.
    if (sub === 'tag' || sub === 'stash' || sub === 'worktree' || sub === 'remote') {
      return words.length <= 2
    }
    return READ_ONLY_GIT.has(sub)
  }
  // The project's own probes are how analysis actually happens here.
  if (head === 'node') return /\s(?:-e|--status|--drain|--check|--dry-run)\b/.test(segment)
  return false
}

/** A shell command that itself constitutes a durable record. */
function shellRecordKind(command) {
  for (const segment of segments(command)) {
    if (GIT_DURABLE.test(segment) && !/--dry-run\b/.test(segment)) return 'commit'
    if (/^(?:\S*node\s+)?\S*finding\.mjs\b/.test(segment)) {
      if (/\s--record\b/.test(segment)) return 'finding-record'
      if (/\s--none\b/.test(segment)) return 'finding-none'
      // Retiring an entry is the second half of the same duty, so a turn that
      // only drains the carrier is a recording turn too.
      if (/\s--drained\b/.test(segment)) return 'finding-drained'
      // Depositing a request, and both ways of retiring one, are the same duty
      // for the second kind (point 462). `--requests` merely LISTS, and the
      // word boundary keeps it out.
      if (/\s--request\b/.test(segment)) return 'request-deposited'
      if (/\s--queued\b/.test(segment)) return 'request-queued'
      if (/\s--blocked\b/.test(segment)) return 'request-blocked'
    }
    // THE DECLARED WAIT IS A RECORD (four-eyes review of the arming, 30.07.2026).
    // A turn that hands work OUT — the pool of three, the mandated delegation —
    // has no result to record yet: it arrives turns later, where the merge is the
    // record. Counted as an unrecorded investigation, the guard would fire on the
    // batch's MOST COMMON turn shape, and the sanctioned answer would degenerate
    // into a reflexive `--none`, which is precisely the desensitization this
    // file's own header forbids. The declaration is the honest durable trace of
    // such a turn: it names what was handed out, it is probed for liveness, and
    // it expires on its own.
    if (/^(?:\S*node\s+)?\S*batch-in-flight\.mjs\b/.test(segment) && /\s--waiting-on\b/.test(segment)) {
      return 'wait-declared'
    }
  }
  return null
}

/** Does this whole shell call merely look? One acting segment is enough to
 *  make the call something other than investigation. */
function shellIsReadOnly(command) {
  const parts = segments(command)
  return parts.length > 0 && parts.every(segmentIsReadOnly)
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
    if (record) return { kind: 'record', record }
    // A shell call that ACTS (builds, tests, publishes, installs) is work, not
    // investigation — counting it was what made this guard fire on 10.6 % of
    // all turns, three quarters of them build/verify turns.
    return shellIsReadOnly(command) ? { kind: 'investigate' } : { kind: 'ignore' }
  }
  if (WRITE_TOOLS.has(tool)) {
    const record = writeRecordKind(filePath)
    return record ? { kind: 'record', record } : { kind: 'ignore' }
  }
  return { kind: 'ignore' }
}

/** The record kind a DECLARED WAIT leaves — the one that is an exemption rather
 *  than a durable trace, and therefore the one that has to be earned. */
export const DELEGATION_RECORD = 'wait-declared'

/**
 * MAY THE DECLARED WAIT STAND IN FOR A RECORD? PURE (point 437 G).
 *
 * Returns { claimed, honoured, why }:
 *   claimed   the turn ran the declaration command at all
 *   honoured  and it is allowed to count — an Agent really was spawned this
 *             turn, or the declaration FILE was written inside this turn (which
 *             a successful CLI run leaves behind and a refused one does not)
 *
 * With no turn boundary to measure against, the file half cannot be judged; the
 * agent half still can, and it is the one that matters most.
 */
export function delegationExemption({ tally, declarationWrittenAt = null, turnStartedAt = null } = {}) {
  const t = tally ?? {}
  const records = Array.isArray(t.records) ? t.records : []
  const claimed = records.includes(DELEGATION_RECORD)
  if (!claimed) return { claimed: false, honoured: false, why: 'not-claimed' }
  if (Number(t.agents) > 0) return { claimed: true, honoured: true, why: 'agent-spawned' }
  const written = Number(declarationWrittenAt)
  const started = Number(turnStartedAt)
  if (Number.isFinite(written) && Number.isFinite(started) && started > 0 && written >= started) {
    return { claimed: true, honoured: true, why: 'declaration-written-this-turn' }
  }
  return { claimed: true, honoured: false, why: 'declaration-not-written-this-turn' }
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
 * Does this turn TAKE the session boundary? (point 462; two-phase since 675)
 *
 * `batch-boundary.mjs --commit …` records the boundary; `--prepare`, the bare
 * `<point>` (now a prepare alias), `--status` and `--clear` only read or
 * withdraw. The distinction matters because the request gate below fires at the
 * boundary and nowhere else: it is the one moment an owner may write TASKS.md,
 * and a gate that fired on every turn end would demand something a mid-branch
 * owner cannot do.
 */
export function turnTakesBoundary(calls = []) {
  for (const call of Array.isArray(calls) ? calls : []) {
    if (!SHELL_TOOLS.has(String(call?.name ?? ''))) continue
    for (const segment of segments(call.command)) {
      if (!/^(?:\S*node\s+)?\S*batch-boundary\.mjs\b/.test(segment)) continue
      const words = segment.split(/\s+/).filter(Boolean)
      const at = words.findIndex((w) => /batch-boundary\.mjs$/.test(w))
      // The quotes come off first: a PowerShell caller writes `… "--commit"`,
      // and a gate that stood down on that would be silently off for half the
      // shells (four-eyes finding 3, Fable 5).
      if (words.slice(at + 1).some((w) => w.replace(/^["']|["']$/g, '') === '--commit')) return true
    }
  }
  return false
}

/**
 * Judge the turn.
 *
 * Inputs (all plain data):
 *   tally           from tallyTurn()
 *   ownsBatch       does this session hold the batch lock
 *   carrierPending  how many FINDINGS still sit in the memory carrier
 *   carrierRequests how many REQUESTS still sit there (point 462)
 *   atBoundary      is this turn taking the session boundary
 *   threshold       override for DEFAULT_THRESHOLD (tests inject their own)
 *
 * Returns { ok, violations: [{ kind, detail }] }.
 */
export function auditFindings({
  tally,
  ownsBatch = false,
  carrierPending = 0,
  carrierRequests = 0,
  atBoundary = false,
  declarationWrittenAt = null,
  turnStartedAt = null,
  threshold = DEFAULT_THRESHOLD,
} = {}) {
  const t = tally ?? { investigative: 0, agents: 0, records: [] }
  const records = Array.isArray(t.records) ? t.records : []
  const violations = []

  // THE DELEGATION EXEMPTION IS EARNED, NOT CLAIMED (point 437 G, four-eyes
  // review 30.07.2026). `wait-declared` is granted from the COMMAND STRING
  // alone, so a turn that merely RAN the in-flight declaration was exempt even
  // when the CLI REFUSED it — no lock, no evidence, dead evidence — and nothing
  // checked that work had been handed out at all. The one path the exemption
  // exists for was therefore also a path a turn could take WITHOUT
  // investigating, which is the opposite of what it is for.
  //
  // It is honoured on either proof, both of which the guard already has:
  //   - the turn actually SPAWNED an agent (an Agent call in this turn), or
  //   - the declaration FILE was written inside this turn, which is what a CLI
  //     run that succeeded leaves behind and a refused one does not.
  const delegation = delegationExemption({ tally: t, declarationWrittenAt, turnStartedAt })
  const durable = records.filter((r) => r !== DELEGATION_RECORD)

  // Spawning an agent is investigation on its own: it is the most expensive
  // way this project looks at something, and its result reaches nobody unless
  // the parent records it.
  //
  // THE AGENT TRIGGER STAYS AS IT IS — decided 08.08.2026, against the corpus.
  // The second model's review predicted the opposite: 96 of 235 agent-spawning
  // turns carried no record, so on a project whose working method is maximal
  // delegation the trigger looked like a `--none` tax on the most ordinary turn
  // there is, and the review asked for it to be softened.
  // What that measurement could not see is the exemption built after it. Re-run
  // on the current corpus (`node scripts/findings-fixtures.mjs --measure`, 806
  // turns): of 73 agent-spawning turns, 42 leave a durable record anyway, 27 are
  // carried by the DECLARED WAIT, and 4 block — turns that handed work out and
  // neither recorded nor declared it, which is exactly the shape the rule exists
  // for. The tax the review feared is already paid by a mechanism that says
  // something true about the turn, so softening the trigger would only buy back
  // those four and cost the one signal that catches a delegation nobody can find
  // again. The `delegated-wait` fixture family pins this.
  const investigated = Number(t.agents) > 0 || Number(t.investigative) >= threshold
  if (investigated && durable.length === 0 && !delegation.honoured) {
    violations.push({
      kind: 'unrecorded-investigation',
      detail:
        `Dieser Zug hat untersucht (${t.investigative} Lese-/Suchaufrufe` +
        `${Number(t.agents) > 0 ? `, ${t.agents} Agent(en)` : ''}), aber nichts Dauerhaftes hinterlassen. ` +
        (delegation.claimed
          ? 'Die erklärte Wartezeit zählt hier NICHT: es wurde kein Agent gestartet, und die ' +
            'Erklärungsdatei wurde in diesem Zug nicht geschrieben — die Ausnahme gilt der ' +
            'tatsächlich ausgegebenen Arbeit, nicht dem Aufruf. '
          : '') +
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

  // THE REQUEST GATE IS THE POINT BOUNDARY (point 462). A request is a FINISHED
  // spec deposited by a window the user talked to; only the owner may append it,
  // and only where it may write TASKS.md at all — which is the boundary, not
  // every turn end. Demanding it mid-branch would block a session for something
  // the workflow forbids it to do, and that is how a guard gets routed around.
  if (ownsBatch && atBoundary && Number(carrierRequests) > 0) {
    violations.push({
      kind: 'request-not-queued',
      detail:
        `${carrierRequests} Anfrage(n) eines anderen Fensters liegen im Träger, und diese Sitzung nimmt gerade ` +
        'die Grenze. Der Nutzer hat sie einem Fenster gesagt, das den Stapel nicht hielt — ohne Übernahme ' +
        'sterben sie hier. Spec ansehen: node scripts/finding.mjs --show "<Titel>", dann VERBATIM in ' +
        'TASKS.md anhängen und node scripts/finding.mjs --queued "<Titel>" --point <N>. Offene Fragen ' +
        'gehen NIE in den Arbeitsauftrag, sondern als Karte an den Nutzer; undurchführbar: ' +
        'node scripts/finding.mjs --blocked "<Titel>" --why "<Grund>". Danach die Grenze erneut nehmen.',
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
//
// A REQUEST (point 462) is the same carrier with a second kind: a window the
// user is TALKING TO writes the finished spec, the owner appends it verbatim.
// Its head names the kind and its state, and its body carries the fields
// (findings-request-core.mjs owns those):
//   - [ ] <ISO> · <session> · [request] · pending · <title>
//         #spec … #why … #quotes …
// `pending` → `queued <point>` on the drain, or `blocked` when it cannot be.

/** The marker that makes a carrier entry a request rather than a finding. */
export const REQUEST_MARKER = '[request]'

/** The field separator of a head line — one place, both kinds. */
export const HEAD_SEP = ' · '

/**
 * One head line as plain data, or null when the line is not a well-formed head.
 * Returning null for a BROKEN request head is deliberate: `malformedEntries`
 * reads the same function, so a hand edit that lost the state field is warned
 * about instead of silently counting as a finding titled "[request] · …".
 */
export function parseHead(line) {
  // `- [X]` counts as ticked (four-eyes finding 4, Fable 5): a hand tick with a
  // capital X used to fall through BOTH the pending count and the malformed
  // report, so the entry simply vanished — the one thing this carrier may
  // never do.
  const m = /^- \[( |x|X)\] (\S+) · (\S+) · (.*)$/.exec(String(line ?? ''))
  if (!m) return null
  const done = m[1] !== ' '
  const base = { done, at: m[2], session: m[3] }
  const prefix = `${REQUEST_MARKER}${HEAD_SEP}`
  if (!m[4].startsWith(prefix)) return { ...base, kind: 'finding', state: done ? 'drained' : 'pending', title: m[4] }
  const tail = m[4].slice(prefix.length)
  const cut = tail.indexOf(HEAD_SEP)
  if (cut < 0) return null
  return { ...base, kind: 'request', state: tail.slice(0, cut).trim(), title: tail.slice(cut + HEAD_SEP.length) }
}

/**
 * Parse the carrier's entries out of its markdown.
 *
 * `pending` holds the waiting FINDINGS and `requests` the waiting REQUESTS —
 * separately, because the two are gated at different moments (see
 * `auditFindings`). Anything already retired counts as drained, whichever kind.
 */
export function parseCarrier(text = '') {
  const pending = []
  const requests = []
  let drained = 0
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const head = parseHead(line)
    if (!head) continue
    const waiting = !head.done && head.state === 'pending'
    if (!waiting) {
      drained++
      continue
    }
    const entry = { at: head.at, session: head.session, title: head.title }
    if (head.kind === 'request') requests.push(entry)
    else pending.push(entry)
  }
  return { pending, requests, drained }
}

/**
 * A FINDING TITLE MAY NOT OPEN WITH THE REQUEST MARKER (four-eyes finding 3,
 * Fable 5, 31.07.2026). `- [ ] <at> · <s> · [request] · pending · X` parses back
 * as a REQUEST, and requests are gated only on the turn that TAKES the point
 * boundary — so such a finding would slip past the every-turn-end findings gate
 * altogether. The marker is neutralised rather than refused: dropping a recorded
 * finding is the one thing this carrier may never do, and `(request)` keeps the
 * title readable while it can no longer be a kind.
 */
function neutraliseKindMarker(title) {
  return title.startsWith(`${REQUEST_MARKER}${HEAD_SEP}`) ? `(request)${title.slice(REQUEST_MARKER.length)}` : title
}

/** Render one carrier entry (title is single-line; detail is indented under it). */
export function carrierEntry({ at, session, title, detail }) {
  const head = `- [ ] ${at} · ${session} · ${neutraliseKindMarker(String(title ?? '').replace(/\s+/g, ' ').trim())}`
  const body = String(detail ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `      ${l}`)
  return [head, ...body].join('\n')
}

/**
 * Retire the pending entry whose title matches.
 *
 * Returns { text, title } on exactly one match, { ambiguous: [titles] } on
 * several, and null on none. Reporting the MATCHED title back — rather than
 * the search string — is what keeps the caller from confirming a retirement
 * it did not perform; refusing an ambiguous match is what keeps it from
 * retiring the wrong finding while saying the right one.
 */
export function markDrained(text, title) {
  const hits = findPending(text, title, 'finding')
  if (hits === null || hits.length === 0) return null
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.title) }
  const lines = String(text ?? '').split(/\r?\n/)
  lines[hits[0].index] = lines[hits[0].index].replace('- [ ] ', '- [x] ')
  return { text: lines.join('\n'), title: hits[0].title }
}

/**
 * The waiting entries of ONE kind whose title contains `needle`, as
 * [{ index, title, head }] — the lookup both `markDrained` and the request
 * transitions share, so "which entry did you mean" is decided in one place.
 * Returns null on an empty needle.
 */
export function findPending(text, title, kind = 'finding') {
  const needle = String(title ?? '').trim().toLowerCase()
  if (!needle) return null
  const hits = []
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const head = parseHead(lines[i])
    if (!head || head.kind !== kind || head.done || head.state !== 'pending') continue
    if (!head.title.toLowerCase().includes(needle)) continue
    hits.push({ index: i, title: head.title, head })
  }
  return hits
}

/** Lines that look like an entry but do not parse — a hand edit that broke the
 *  head would otherwise vanish from BOTH the listing and the pending count,
 *  silently under-reporting what still waits. */
export function malformedEntries(text = '') {
  const bad = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!/^- \[[ xX]\] /.test(line)) continue
    if (parseHead(line)) continue
    bad.push(line.trim())
  }
  return bad
}
