// Pure layer of the carrier's REQUEST kind (point 462).
//
// WHY A SECOND KIND RATHER THAN A SECOND CARRIER. A window the user is talking
// to is regularly NOT the batch owner: on 30.07.2026 one held a pending claim
// for an hour while the user settled three decisions, and TASKS.md is main-only
// and batch-owned, so nothing could be enqueued — the specs lived in a
// scratchpad outside the repository and would have died with the window. The
// findings carrier already IS the lock-free atomic append by a non-owner, it
// already has a drain protocol, and its guard is already wired. Two carriers
// would be two drain disciplines to forget one of.
//
// THE DEPOSIT IS THE FINISHED SPEC, not a note that the user wants something:
// only the depositing window holds the conversation the spec comes from, and the
// owner will never see it. So a request carries the TASKS-ready final state, the
// user's own words with their date, the bounds he named, and what the ruling
// implies for the documents — leaving the owner the mechanical half it alone may
// do: append it verbatim and number it.
//
// Side-effect free and total: every function takes text and returns data, a
// malformed entry is REPORTED rather than thrown on, and nothing here can block
// a turn (findings-guard.mjs is fail-open and owns that direction).
import { HEAD_SEP, REQUEST_MARKER, findPending, parseHead } from './findings-core.mjs'

/** The body indent — six spaces, the same the finding detail already uses. */
const INDENT = '      '

/**
 * The fields a request carries, in the order they are written and read.
 *
 * `key` is the programmatic name, `tag` the marker in the file (`#spec`), and
 * `label` what the drain prints. `verbatim` marks the ones the owner appends
 * WITHOUT interpreting — the spec and the bounds the user named.
 */
export const REQUEST_FIELDS = Object.freeze([
  { key: 'why', tag: 'why', label: 'observed problem' },
  { key: 'spec', tag: 'spec', label: 'spec (final state — append VERBATIM)', verbatim: true },
  { key: 'constraints', tag: 'constraints', label: 'bounds the user named (verbatim)', verbatim: true },
  { key: 'userQuotes', tag: 'quotes', label: 'the user’s own sentences, with their date' },
  { key: 'docImpact', tag: 'docimpact', label: 'implied design.md / CLAUDE.md / memory changes' },
  { key: 'bundle', tag: 'bundle', label: 'proposed bundle (German name)' },
  { key: 'refs', tag: 'refs', label: 'files, points, design.md §§' },
  { key: 'revision', tag: 'rev', label: 'git revision the spec was cut from' },
  { key: 'openQuestions', tag: 'openquestions', label: 'open questions (route to a decision card)' },
  { key: 'blockedWhy', tag: 'blocked', label: 'not queueable, because' },
])

const BY_TAG = new Map(REQUEST_FIELDS.map((f) => [f.tag, f]))
const BY_KEY = new Map(REQUEST_FIELDS.map((f) => [f.key, f]))

/** The fields without which a deposit is not a spec but a note. */
export const REQUIRED_FIELDS = Object.freeze(['spec', 'why'])

/** One line, whitespace collapsed — a head field may never break the line. */
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

/** A line that is nothing but a (possibly escaped) field marker. */
const TAG_LINE_RE = /^(\\*)#([a-z]+)\s*$/

/**
 * A BODY LINE THAT IS ITSELF A FIELD MARKER IS ESCAPED (four-eyes finding 1,
 * Fable 5, 30.07.2026). The spec is appended VERBATIM, and the specs most likely
 * to be deposited here are about this very mechanism — one containing a bare
 * `#spec` line would otherwise be truncated on read-back, its tail misfiled into
 * another field, and a `#blocked` line inside a spec would contaminate the very
 * reason the user is shown. One backslash is added on the way in and taken off
 * on the way out, so a line that already begins with backslashes survives too.
 */
export function escapeBodyLine(line) {
  const m = TAG_LINE_RE.exec(String(line ?? ''))
  return m && BY_TAG.has(m[2]) ? `\\${line}` : String(line ?? '')
}

/** The inverse of `escapeBodyLine` — total, and a no-op on an ordinary line. */
export function unescapeBodyLine(line) {
  const text = String(line ?? '')
  const m = TAG_LINE_RE.exec(text)
  return m && m[1].length > 0 && BY_TAG.has(m[2]) ? text.slice(1) : text
}

/** One field's value as the indented, escaped lines it is written as. */
function bodyLines(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => (line.trim() === '' ? '' : `${INDENT}${escapeBodyLine(line)}`))
}

/** Trim leading and trailing blank lines, keeping the ones inside. */
function trimBlankEdges(lines) {
  let from = 0
  let to = lines.length
  while (from < to && lines[from].trim() === '') from++
  while (to > from && lines[to - 1].trim() === '') to--
  return lines.slice(from, to)
}

/**
 * Where one entry's body ends: the first line that is neither blank nor
 * indented, or the next entry head. Returns { body, end } with `body` already
 * un-indented and edge-trimmed, `end` the index AFTER the last consumed line.
 */
export function readBody(lines, start) {
  const body = []
  let i = start
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (parseHead(line)) break
    if (line.trim() !== '' && !line.startsWith(INDENT)) break
    body.push(line.startsWith(INDENT) ? line.slice(INDENT.length) : '')
  }
  return { body: trimBlankEdges(body), end: i }
}

/**
 * A body's `#tag` sections as { <key>: <text> }, plus `loose` for anything that
 * stood before the first tag. Unknown tags stay in the current section: a spec
 * may legitimately contain a `#heading`, and inventing a field out of it would
 * lose the line.
 */
export function parseFields(body = []) {
  const sections = new Map()
  const loose = []
  let current = null
  for (const raw of Array.isArray(body) ? body : []) {
    const line = String(raw ?? '')
    const m = TAG_LINE_RE.exec(line)
    if (m && !m[1] && BY_TAG.has(m[2])) {
      current = BY_TAG.get(m[2]).key
      if (!sections.has(current)) sections.set(current, [])
      continue
    }
    if (current === null) loose.push(unescapeBodyLine(line))
    else sections.get(current).push(unescapeBodyLine(line))
  }
  const fields = {}
  for (const [key, lines] of sections) fields[key] = trimBlankEdges(lines).join('\n')
  const looseText = trimBlankEdges(loose).join('\n')
  return looseText ? { ...fields, loose: looseText } : fields
}

/** Render one request as the carrier text block (head line + indented body). */
export function requestEntry({ at, session, title, state = 'pending', ...fields } = {}) {
  const cleanState = oneLine(state) || 'pending'
  const head =
    `- [${cleanState === 'pending' ? ' ' : 'x'}] ${oneLine(at)}${HEAD_SEP}${oneLine(session) || 'unknown'}` +
    `${HEAD_SEP}${REQUEST_MARKER}${HEAD_SEP}${cleanState}${HEAD_SEP}${oneLine(title)}`
  const out = [head]
  for (const field of REQUEST_FIELDS) {
    const value = String(fields[field.key] ?? '')
    if (!value.trim()) continue
    out.push(`${INDENT}#${field.tag}`)
    out.push(...bodyLines(value))
  }
  return out.join('\n')
}

/** Every request in the carrier, whatever its state, in document order. */
export function requestEntries(text = '') {
  const lines = String(text ?? '').split(/\r?\n/)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const head = parseHead(lines[i])
    if (!head || head.kind !== 'request') continue
    const { body, end } = readBody(lines, i + 1)
    out.push({
      index: i,
      end,
      at: head.at,
      session: head.session,
      title: head.title,
      state: head.state,
      done: head.done,
      fields: parseFields(body),
    })
    i = end - 1
  }
  return out
}

/** The requests still waiting to be carried into the work order. */
export function pendingRequests(text = '') {
  return requestEntries(text).filter((r) => !r.done && r.state === 'pending')
}

/**
 * WHERE DOES THIS REQUEST GO? A non-empty `openQuestions` means the deposit is
 * not decided yet, and an undecided spec appended to the work order would put a
 * question into the queue where an instruction belongs. It becomes a decision
 * card for the user instead — never a TASKS append.
 */
export function requestRoute(entry) {
  return String(entry?.fields?.openQuestions ?? '').trim() ? 'vdzk' : 'tasks'
}

/**
 * What is WRONG with this request — reported, never thrown. A hand-edited or
 * half-written deposit must still be visible: dropping it is the exact failure
 * the carrier exists to end.
 */
export function requestWarnings(entry) {
  const out = []
  const fields = entry?.fields ?? {}
  for (const key of REQUIRED_FIELDS) {
    if (!String(fields[key] ?? '').trim()) out.push(`no ${BY_KEY.get(key).label} — the owner cannot append this`)
  }
  if (!String(fields.userQuotes ?? '').trim()) {
    out.push('no user quotes — the "user DD.MM.YYYY" citation exists only in the depositing window')
  }
  if (String(fields.loose ?? '').trim()) out.push('text before the first #field — it belongs under one of them')
  return out
}

/** Rewrite one head line with a new state (pure; the line must BE a head). */
function withState(line, state) {
  const head = parseHead(line)
  if (!head) return line
  const cleanState = oneLine(state) || 'pending'
  return (
    `- [${cleanState === 'pending' ? ' ' : 'x'}] ${head.at}${HEAD_SEP}${head.session}` +
    `${HEAD_SEP}${REQUEST_MARKER}${HEAD_SEP}${cleanState}${HEAD_SEP}${head.title}`
  )
}

/**
 * Apply a transition to the ONE pending request with exactly this identity —
 * deposit timestamp, session and full title — rather than to whatever a search
 * string happens to match. Returns { text, title } or null when that entry is
 * no longer pending.
 *
 * THIS IS THE WRITE-BACK PATH (four-eyes finding 1, Fable 5, 31.07.2026). The
 * CLI reads the carrier, decides, and only then writes; in that gap another
 * window may append a deposit — the very concurrency this carrier exists for —
 * and text computed from the old read would erase it. So the caller re-reads
 * immediately before writing and re-applies here. The identity is exact because
 * a re-RESOLVE by substring could find a deposit appended in the gap and retire
 * the wrong one; that is the concern of four-eyes finding 5, and it stays
 * answered.
 */
export function reapplyTransition(text, identity, state, extra = null) {
  const want = identity ?? {}
  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const head = parseHead(lines[i])
    if (!head || head.kind !== 'request' || head.done || head.state !== 'pending') continue
    if (head.at !== want.at || head.session !== want.session || head.title !== want.title) continue
    lines[i] = withState(lines[i], state)
    if (extra && String(extra.value ?? '').trim()) {
      const { end } = readBody(lines, i + 1)
      lines.splice(end, 0, `${INDENT}#${extra.tag}`, ...bodyLines(extra.value))
    }
    return { text: lines.join('\n'), title: head.title }
  }
  return null
}

/**
 * Move the one pending request whose title matches into `state`, optionally
 * appending a field to its body. Returns { text, title, identity, state, extra }
 * on exactly one match, { ambiguous: [titles] } on several and null on none —
 * the same protocol `markDrained` follows, for the same reason: retiring the
 * wrong deposit while reporting the right one is worse than refusing.
 *
 * `identity` is what the caller re-applies with (see `reapplyTransition`);
 * `text` is the result on the text handed in, which a pure caller can use
 * directly.
 */
function transition(text, title, state, extra = null) {
  const hits = findPending(text, title, 'request')
  if (hits === null || hits.length === 0) return null
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.title) }
  const identity = { at: hits[0].head.at, session: hits[0].head.session, title: hits[0].title }
  const applied = reapplyTransition(text, identity, state, extra)
  if (!applied) return null
  return { ...applied, identity, state, extra }
}

/** `pending` → `queued <point>`: the deposit reached the work order. */
export function markQueued(text, title, point) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`finding: not a point number: ${point}`)
  return transition(text, title, `queued ${n}`)
}

/**
 * `pending` → `blocked`: the deposit cannot be carried in. The reason is kept
 * with the entry AND (in the CLI) written as a decision card, so an undrainable
 * request is escalated to the user VISIBLY rather than parked in a file.
 */
export function markBlocked(text, title, reason) {
  const why = String(reason ?? '').trim()
  if (!why) throw new Error('finding: --blocked needs a reason the user can act on')
  return transition(text, title, 'blocked', { tag: BY_KEY.get('blockedWhy').tag, value: why })
}

/** One request rendered for the owner who is about to append it. */
export function formatRequest(entry) {
  if (!entry) return ''
  const out = [
    `${entry.title}`,
    `  deposited ${String(entry.at).slice(0, 16).replace('T', ' ')} by session ${entry.session} — state: ${entry.state}`,
    `  route: ${requestRoute(entry) === 'vdzk' ? 'DECISION CARD (open questions) — never a TASKS append' : 'TASKS append'}`,
  ]
  for (const field of REQUEST_FIELDS) {
    const value = String(entry.fields?.[field.key] ?? '')
    if (!value.trim()) continue
    out.push('', `--- ${field.label} ---`, value)
  }
  const warnings = requestWarnings(entry)
  if (warnings.length) out.push('', ...warnings.map((w) => `WARNING: ${w}`))
  return out.join('\n')
}
