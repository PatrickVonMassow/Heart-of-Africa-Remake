// THE CONTEXT FENCE (point 700) — the decision half, pure.
//
// WHY: the context watermark spoke only in the Stop chain, which fires when a
// turn tries to END — so every call that STARTS something (a suite, an agent, a
// new work-order point) went through untouched, and a session measured at 2.9×
// the mark kept starting browser suites and agent rounds for another hour
// (17.08.2026). This core decides, for one PreToolUse call, whether the call
// would START a new unit of work while the measured context is past the mark.
//
// THE FENCE ENDS A SESSION, IT NEVER IDLES ONE (user 17.08.2026). It therefore
// denies ONLY what begins new work — spawning an agent, starting a browser
// verify run, authoring a work-order point / memory / document — and leaves
// everything that FINISHES the step in flight untouched: reads, commits,
// pushes, the landing, the board, the boundary bookkeeping, the fast unit gate.
// A denied session is never trapped: the allowed set contains the whole exit.
//
// FILING A POINT IS STARTING WORK (user 17.08.2026): writing a work-order
// point, a memory or a doc section past the mark feels like bookkeeping and
// costs like work — the measured session wrote three points and two documents
// after the watermark fired. Past the mark a finding goes to the CARRIER (one
// command, one line) and the successor writes it out in a cheap context; the
// refusal names that path.
//
// Fail direction: an unreadable measurement allows EVERYTHING (state
// 'unreadable' → no block). The watermark's own Stop-chain guard already
// alerts loudly on an unobtainable reading; a fence that guessed would deny on
// an assumption, which the measurement rule forbids.

/** The one command that ends the session — every refusal names it. */
export const FENCE_END_COMMAND = 'node scripts/batch-boundary.mjs --prepare --context'

/** The carrier command a finding goes to instead of the work order/docs. */
export const FENCE_CARRIER_COMMAND =
  'node scripts/finding.mjs --record "<title>" --detail "<one line>"'

/** Tools whose call IS the start of a new unit of work: a delegated agent. */
export const AGENT_TOOLS = new Set(['Agent', 'Task'])

/** Tools that WRITE the file they name. Only these can author; a Read on
 *  TASKS.md is a read, and every read stays allowed whatever the mark says. */
export const FILE_WRITING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

/** Command patterns that START a browser verify run or delegate new authoring.
 *  Deliberately NOT the fast gates: `npm run test:unit`, `npm run build` and
 *  `npm run lint` finish the step in flight (they gate its commit/landing). */
const SUITE_START_RES = [
  // npm test / npm run test / test:small / test:large — never test:unit.
  { re: /\bnpm\s+(?:run\s+)?test\b(?!:unit)/i, what: 'starting a browser verify run' },
  { re: /scripts[\\/]verify[\\/]run-(?:all|logged)\.mjs/i, what: 'starting a browser verify run' },
  { re: /scripts[\\/]author-sol\.mjs/i, what: 'delegating a new authoring run' },
]

/** A shell redirection INTO the work order, a document or a memory file —
 *  authoring by `>>` instead of by the Edit tool must not slip the fence. */
const AUTHORING_REDIRECT_RE =
  />>?\s*"?[^\s"'|&;]*(?:tasks\.md|tasks-archive\.md|memory\.md|(?:docs|memory)[\\/][^\s"'|&;]*\.md)/i

/** The carrier file stays writable past the mark — it is the sanctioned place
 *  for a finding, and the refusal points at it. */
const CARRIER_BASENAME = 'findings-carrier.md'

const basenameOf = (p) => {
  const parts = String(p ?? '').replace(/\\/g, '/').toLowerCase().split('/')
  return parts[parts.length - 1]
}

/** Does this file path name an AUTHORING target (work order, doc, memory)?
 *  Returns the description of what it starts, or null. */
export function authoringTarget(filePath) {
  const raw = String(filePath ?? '').trim()
  if (!raw) return null
  const norm = raw.replace(/\\/g, '/').toLowerCase()
  const base = basenameOf(norm)
  if (base === CARRIER_BASENAME) return null // the carrier is the way to KEEP a finding
  if (base === 'tasks.md' || base === 'tasks-archive.md') return 'authoring in the work order'
  if (base === 'memory.md' || /(?:^|\/)memory\//.test(norm)) return 'authoring a memory'
  if (base === 'claude.md' || base === 'design.md') return 'authoring a document section'
  if (/(?:^|\/)docs\//.test(norm) && base.endsWith('.md')) return 'authoring a document section'
  return null
}

/**
 * Does this call START a new unit of work? PURE.
 * Returns { starts, what, authoring } — `authoring` marks the refusals that
 * must name the carrier as the way to keep a finding.
 */
export function classifyFenceCall({ toolName, command, filePath } = {}) {
  const tool = String(toolName ?? '').trim()
  if (AGENT_TOOLS.has(tool)) {
    return { starts: true, what: 'spawning a delegated agent', authoring: false }
  }
  const cmd = typeof command === 'string' ? command.trim() : ''
  if (cmd) {
    // The carrier command may quote .md paths of its own — never a deny.
    if (/scripts[\\/]finding\.mjs/i.test(cmd)) return { starts: false, what: null, authoring: false }
    for (const { re, what } of SUITE_START_RES) {
      if (re.test(cmd)) return { starts: true, what, authoring: false }
    }
    if (AUTHORING_REDIRECT_RE.test(cmd) && !cmd.toLowerCase().includes(CARRIER_BASENAME)) {
      return { starts: true, what: 'authoring in the work order/documents via redirection', authoring: true }
    }
    return { starts: false, what: null, authoring: false }
  }
  if (FILE_WRITING_TOOLS.has(tool)) {
    const target = authoringTarget(filePath)
    if (target) return { starts: true, what: target, authoring: true }
  }
  return { starts: false, what: null, authoring: false }
}

/** The refusal, pinned by tests rather than improvised at the one moment it
 *  matters. Names the mark, the measurement, the carrier (for authoring) and
 *  the one command that ends the session. */
export function fenceRefusal({ tokens, watermark, what, authoring = false } = {}) {
  return (
    `PAST THE CONTEXT WATERMARK, NEW WORK IS DENIED (point 700): this session's context measures ` +
    `${tokens} tokens against the ${watermark}-token mark, and this call would START new work (${what}). ` +
    (authoring
      ? `A finding does not need this expensive context — keep it on the CARRIER instead: ` +
        `\`${FENCE_CARRIER_COMMAND}\`; the successor writes the point or section in a cheap context. `
      : '') +
    `Finish the step in flight — commits, pushes, the landing, the board and the boundary bookkeeping all ` +
    `stay allowed — then END THIS SESSION: \`${FENCE_END_COMMAND}\`, its bookkeeping, then ` +
    '`--commit --context` as the last repository action. A running verification is NO reason to stay: ' +
    'it transfers through its run record and the successor reads the receipt.'
  )
}

/**
 * THE VERDICT for one PreToolUse call. PURE.
 *
 * `state`/`tokens`/`watermark` come from a real watermark reading
 * (`watermarkDecision`): only a measured 'past' can deny — 'below' allows all,
 * and 'unreadable' fails OPEN (never a deny on an assumption).
 * Returns { block, reason }.
 */
export function contextFenceDecision({ state, tokens, watermark, toolName, command, filePath } = {}) {
  if (state !== 'past') return { block: false, reason: null }
  const call = classifyFenceCall({ toolName, command, filePath })
  if (!call.starts) return { block: false, reason: null }
  return { block: true, reason: fenceRefusal({ tokens, watermark, what: call.what, authoring: call.authoring }) }
}
