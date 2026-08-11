// THE READ-ONLY PATH TO THE OTHER VENDOR, GENERALISED BEYOND REVIEWS (point 654, A1).
//
// `scripts/review-sol.mjs` proved one shape of this: `codex exec` in a READ-ONLY sandbox
// with the artefact on stdin, because this container cannot create user namespaces and a
// shell command of the reviewer's would die before it ran. The last twelve recorded
// mechanism reviews all carry "GPT-5.6 Sol" with no silent fallback, so the path works.
//
// What it did NOT do is carry any other kind of pure text work — and text work is where
// the volume is: measured 11.08.2026, verification is 41.9 % of the whole spend and
// 41.8 % of that is reading logs, scripts and reports, i.e. 17.5 % of everything, with
// no browser and no picture involved.
//
// THE RULE THIS FILE IS SHAPED AROUND is the review path's, unchanged: an answer nobody
// gave must never be reported as an answer. Every path out of a failed run says so in
// ONE line, names the cause and hands the work back to the Claude chain — never silently,
// never recorded as Sol's.
//
// Side-effect free: the process spawn, the material gathering and the printing belong to
// scripts/ask-sol.mjs. Pinned by ask-sol-core.test.mjs.

import { BLIND_REVIEWER, MATERIAL_BUDGET_CHARS, SOL_MODEL_NAME, SOL_REASONING_EFFORT } from './review-sol-core.mjs'

export { MATERIAL_BUDGET_CHARS, SOL_MODEL_NAME, SOL_REASONING_EFFORT }

/** The kinds of work this command carries. All of them are pure text. */
export const KINDS = Object.freeze(['diagnose', 'audit', 'enumerate', 'explain'])

/** What each kind asks for, in the words the prompt uses. */
export const KIND_TASKS = Object.freeze({
  diagnose: 'Name the CAUSE of the failure in the attached material.',
  audit: 'Sweep the attached material for defects and implausibilities.',
  enumerate: 'Produce your OWN complete list for the question below.',
  explain: 'Explain the attached material.',
})

/** A kind, or null. PURE. */
export function normaliseKind(value) {
  const v = String(value ?? '').trim().toLowerCase()
  return KINDS.includes(v) ? v : null
}

/**
 * How each kind must END its answer, and what an entry looks like where it is a list.
 *
 * The shapes exist because the answer is TRANSCRIBED — into a commit message, into a
 * blind-merge accounting, into a work-order point — and a free-form answer cannot be
 * transcribed without someone re-reading the whole thing. `enumerate` uses the very entry
 * form `scripts/blind-merge.mjs` counts (`B<n> | <file> | <one line>`), so a divergent
 * half from Sol drops straight into the merge accounting CLAUDE.md §6 demands.
 */
export const ANSWER_SHAPES = Object.freeze({
  diagnose: ['CAUSE: <the one cause, named>', 'EVIDENCE: <the line(s) in the material that show it>'],
  audit: ['Each finding on ONE line as `A<n> | <file> | <the defect in one line>`, numbered A1, A2, …'],
  enumerate: ['Each entry on ONE line as `B<n> | <file> | <the item in one line>`, numbered B1, B2, …'],
  explain: [],
})

/** The entry prefix each list kind is numbered with, or '' where it is not a list. PURE. */
export function entryPrefix(kind) {
  return kind === 'audit' ? 'A' : kind === 'enumerate' ? 'B' : ''
}

/**
 * The prompt Sol is given for one kind.
 *
 * Two facts every kind carries, both learned the hard way on the review path: the
 * material is ATTACHED (a shell command of Sol's cannot run in this container, so it must
 * not be told to fetch anything), and a part marked TRUNCATED must be reported as such
 * rather than guessed past.
 */
export function buildAskPrompt({ kind = '', brief = '' } = {}) {
  const k = normaliseKind(kind)
  if (!k) throw new Error(`ask-sol: not a kind: ${kind}`)
  const shape = ANSWER_SHAPES[k]
  const lines = [
    `You are doing READ-ONLY work for this repository as ${SOL_MODEL_NAME}. You were chosen`,
    'because you are a DIFFERENT model from the one that wrote the material: your value is the',
    'errors and the readings the author cannot see, so judge what is attached and do not assume',
    'it is correct.',
    '',
    `THE TASK: ${KIND_TASKS[k]}`,
    `THE QUESTION: ${String(brief ?? '').trim() || '(none given — say so rather than inventing one)'}`,
    '',
    'THE MATERIAL IS ATTACHED below this prompt — logs, diffs, file contents. READ IT IN FULL',
    'FIRST. This container cannot create user namespaces, so a shell command of yours would fail',
    'before it ran: judge the attached material only, and where a part is marked TRUNCATED say',
    'so rather than guessing past the cut. You author nothing here — no commit, no patch, no',
    'file: your answer is text that a Claude session acts on.',
    '',
  ]
  if (k === 'enumerate') {
    lines.push(
      'This is a DIVERGENT step: produce your OWN complete list from the inputs, do not check',
      "somebody else's, and name what nobody has written down. A THIRD model merges your list",
      'with the other half and accounts for every entry by its id, so an entry without one',
      'cannot be counted and would simply disappear.',
      '',
    )
  }
  if (k === 'audit') {
    lines.push('Report ONLY findings you can point at a line for. An implausibility you cannot locate is not a finding.', '')
  }
  if (shape.length) {
    lines.push('ANSWER SHAPE — end your final message with exactly this and nothing after it:', ...shape.map((s) => `  ${s}`))
  } else {
    lines.push('Answer in plain prose, shortest first: what it does, then where each part is handled.')
  }
  return lines.join('\n')
}

/**
 * Assemble the material for one ask, spending a fixed budget in the order given and
 * CUTTING VISIBLY. Same rule as the review path, and for the same reason: a model that
 * silently saw half a log would diagnose the half it saw.
 *
 * It returns WHICH sections actually travelled, not only the text (second cross-vendor
 * round): the caller decides whether a request carries any real artefact at all, and it
 * cannot decide that from a list of sections some of which the budget dropped. A section
 * counts as carried only if it was written AND had content to write.
 */
export function formatAskMaterial({ sections = [], budget = MATERIAL_BUDGET_CHARS } = {}) {
  const cap = Math.max(0, Number(budget) || 0)
  const out = []
  const carried = []
  const omitted = []
  // THE BUDGET IS COUNTED ON WHAT IS ACTUALLY WRITTEN (third cross-vendor round). The
  // omission markers used to be free: enough of them — or long enough titles — pushed the
  // sent request past the ceiling it advertises. Every line, marker included, is charged
  // here, and once even a marker no longer fits nothing more is written. The remaining
  // titles still come back in `omitted`, so the caller can name them without sending them.
  //
  // A TAIL IS RESERVED so the LAST word is always affordable (fourth cross-vendor round).
  // Charging the markers made the budget honest but let the sections beyond it disappear
  // in silence — and a model that cannot see that something is missing answers as if
  // nothing were. The reserve pays for one closing line that counts what never travelled.
  const RESERVE = 160
  const bodyCap = Math.max(0, cap - RESERVE)
  let spent = 0
  const silent = []
  const push = (line) => {
    out.push(line)
    spent += line.length + 1
  }
  const list = Array.isArray(sections) ? sections : []
  for (const section of list) {
    const title = String(section?.title ?? 'MATERIAL')
    const text = String(section?.text ?? '')
    const header = `=== ${title} ===`
    const room = bodyCap - spent - header.length - 80
    if (room <= 120) {
      const marker = `=== OMITTED ENTIRELY (material budget spent): ${title} ===`
      omitted.push(title)
      if (spent + marker.length + 1 <= bodyCap) {
        push(marker)
        push('')
      } else {
        silent.push(title)
      }
      continue
    }
    const body = text.length > room ? `${text.slice(0, room)}\n… [TRUNCATED: ${text.length - room} characters not shown]` : text
    push(header)
    push(body)
    push('')
    if (text.trim()) carried.push(title)
    else omitted.push(title)
  }
  // The closing count, paid for by the reserve: what did not fit is NEVER invisible —
  // unless the whole budget is smaller than that one line, which the cap still wins
  // (fifth cross-vendor round: a `budget: 0` returned a non-empty string).
  if (silent.length) {
    const tail = `… [${silent.length} further section(s) omitted entirely: the material budget is spent]`
    if (spent + tail.length + 1 <= cap) push(tail)
  }
  return { text: out.join('\n'), carried, omitted }
}

/** The two closing lines of a DIAGNOSE answer, read off the END of the message. */
function parseDiagnose(clean) {
  const tail = clean.split('\n').map((l) => l.trim()).filter(Boolean).slice(-2)
  const cause = (/^[-*]?\s*CAUSE\s*:\s*(.+)$/i.exec(tail[0] ?? '')?.[1] ?? '').trim()
  const evidence = (/^[-*]?\s*EVIDENCE\s*:\s*(.+)$/i.exec(tail[1] ?? '')?.[1] ?? '').trim()
  if (!cause || !evidence) return { ok: false, error: 'the message does not end in the CAUSE/EVIDENCE pair' }
  if (/^</.test(cause) || /^</.test(evidence) || evidence.length < 10) {
    return { ok: false, error: 'the CAUSE/EVIDENCE lines are the placeholders echoed back' }
  }
  return { ok: true, answer: { cause, evidence }, summary: cause }
}

/** The numbered entries of a list answer. */
function parseEntries(clean, prefix) {
  const re = new RegExp(`^[-*]?\\s*(${prefix}\\d+)\\s*\\|\\s*([^|]*)\\|\\s*(.+)$`, 'i')
  const entries = []
  for (const line of clean.split('\n')) {
    const m = re.exec(line.trim())
    if (m) entries.push({ id: m[1].toUpperCase(), file: m[2].trim(), text: m[3].trim() })
  }
  if (!entries.length) return { ok: false, error: `no entry in the form \`${prefix}1 | <file> | <one line>\`` }
  return { ok: true, answer: { entries }, summary: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` }
}

/**
 * Pull the answer out of Sol's final message. PURE.
 *
 * Tolerant on the way in — markdown emphasis, a leading bullet, a code fence — and strict
 * on the way out: an answer that does not carry its shape is NOT an answer, and the caller
 * hands the work back rather than reporting a guess. A message that says the model could
 * not see the material is refused whatever shape it has (the review path's very first run
 * answered exactly that, and it would otherwise have been recorded as work done).
 */
export function parseAnswer({ kind = '', text = '' } = {}) {
  const k = normaliseKind(kind)
  if (!k) throw new Error(`ask-sol: not a kind: ${kind}`)
  const clean = String(text ?? '').replace(/[*`_#>]/g, '')
  if (!clean.trim()) return { ok: false, kind: k, answer: null, summary: '', error: 'the run produced no answer at all' }
  if (BLIND_REVIEWER.test(clean)) {
    return { ok: false, kind: k, answer: null, summary: '', error: 'the model says it could not see the material' }
  }
  if (k === 'explain') {
    const prose = clean.trim()
    if (prose.length < 40) return { ok: false, kind: k, answer: null, summary: '', error: 'the answer is too thin to be an explanation' }
    return { ok: true, kind: k, answer: { text: prose }, summary: prose.split('\n')[0].slice(0, 120), error: '' }
  }
  const parsed = k === 'diagnose' ? parseDiagnose(clean) : parseEntries(clean, entryPrefix(k))
  return parsed.ok
    ? { ok: true, kind: k, answer: parsed.answer, summary: parsed.summary, error: '' }
    : { ok: false, kind: k, answer: null, summary: '', error: parsed.error }
}

/**
 * WHAT THE COMMAND SAYS WHEN SOL DID NOT DELIVER: one line, the cause named, and the work
 * handed back. PURE.
 *
 * The exit code beside it (3, as on the review path) is what lets a script tell "Sol
 * answered" from "Sol did not" without reading prose.
 */
export function formatUnavailable({ kind = '', cause = '', setting = '' } = {}) {
  const k = normaliseKind(kind) ?? String(kind ?? '')
  return [
    `ask-sol: ${SOL_MODEL_NAME} did NOT answer this ${k}: ${cause || 'no cause was reported'}.`,
    `  The ${k} is NOT done. Do it in the Claude chain — nothing here may be recorded as ${SOL_MODEL_NAME}'s work.`,
    ...(setting === 'claude-only' ? ['  (The share switch is at `claude-only`; `node scripts/sol-share.mjs --more` sends this kind to Sol again.)'] : []),
  ].join('\n')
}

/** The whole answer as the command prints it: the shape first, the reader's summary last. */
export function formatAnswerReport({ kind = '', parsed = {}, elapsedMs = 0 } = {}) {
  const k = normaliseKind(kind) ?? String(kind ?? '')
  const seconds = Number.isFinite(Number(elapsedMs)) ? Math.round(Number(elapsedMs) / 1000) : 0
  const head = `ask-sol: ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) answered the ${k} in ${seconds}s — ${parsed.summary ?? ''}`
  if (k === 'diagnose') return [head, `  CAUSE:    ${parsed.answer?.cause ?? ''}`, `  EVIDENCE: ${parsed.answer?.evidence ?? ''}`].join('\n')
  if (k === 'audit' || k === 'enumerate') {
    return [head, ...(parsed.answer?.entries ?? []).map((e) => `  ${e.id} | ${e.file} | ${e.text}`)].join('\n')
  }
  return head
}
