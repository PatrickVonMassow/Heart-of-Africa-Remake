// THE READ-ONLY PATH TO THE OTHER VENDOR, GENERALISED BEYOND REVIEWS (point 654, A1).
//
// `scripts/review-sol.mjs` proved one shape of this: `codex exec` in a READ-ONLY sandbox
// with the artefact on stdin, because this container cannot create user namespaces and a
// shell command of the reviewer's would die before it ran. The last twelve recorded
// mechanism reviews all carry "GPT-5.6 Sol" with no silent fallback, so the path works.
//
// What it did NOT do is carry any other kind of pure text work — and text work is where
// the volume is: measured 12.08.2026, verification is 41.5 % of the whole spend and
// 48.0 % of that is reading logs, scripts and reports, i.e. 19.9 % of everything, with
// no browser and no picture involved (docs/sol-routing.md carries the whole table).
//
// THE RULE THIS FILE IS SHAPED AROUND is the review path's, unchanged: an answer nobody
// gave must never be reported as an answer. Every path out of a failed run says so in
// ONE line, names the cause and hands the work back to the Claude chain — never silently,
// never recorded as Sol's.
//
// Side-effect free: the process spawn, the material gathering and the printing belong to
// scripts/ask-sol.mjs. Pinned by ask-sol-core.test.mjs.

import { blindReviewerAdmission, MATERIAL_BUDGET_CHARS, rawFieldValue, SOL_MODEL_NAME, SOL_REASONING_EFFORT } from './review-sol-core.mjs'

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
  audit: [
    'Each finding on ONE line as `A<n> | <file> | <the defect in one line>`, numbered A1, A2, …',
    'and where you found none, the single line `NO FINDINGS: <what you checked>` instead.',
  ],
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
    const sent = text.slice(0, room)
    const body = text.length > room ? `${sent}\n… [TRUNCATED: ${text.length - room} characters not shown]` : text
    push(header)
    push(body)
    push('')
    // CARRIED MEANS WHAT WAS SENT, not what was held (final round). A file whose first
    // `room` characters are blank travels as a header, whitespace and a truncation
    // marker — nothing to answer about — and counting it as real material is how a
    // shaped answer about nothing gets reported as work done.
    if (sent.trim()) carried.push(title)
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
function parseDiagnose(lines) {
  const tail = lines.map((l) => ({ clean: l.clean.trim(), raw: l.raw })).filter((l) => l.clean).slice(-2)
  const causeLabel = /^[-*]?\s*CAUSE\s*:\s*(.+)$/i.exec(tail[0]?.clean ?? '')?.[1] ?? ''
  const evidenceLabel = /^[-*]?\s*EVIDENCE\s*:\s*(.+)$/i.exec(tail[1]?.clean ?? '')?.[1] ?? ''
  // Recognised on the stripped line, QUOTED from the raw one (see parseAnswer).
  const cause = causeLabel ? rawFieldValue(tail[0].raw) : ''
  const evidence = evidenceLabel ? rawFieldValue(tail[1].raw) : ''
  if (!cause || !evidence) return { ok: false, error: 'the message does not end in the CAUSE/EVIDENCE pair' }
  if (/^</.test(cause) || /^</.test(evidence) || evidence.length < 10) {
    return { ok: false, error: 'the CAUSE/EVIDENCE lines are the placeholders echoed back' }
  }
  return { ok: true, answer: { cause, evidence }, summary: cause }
}

/**
 * The numbered entries of a list answer.
 *
 * THE IDS ARE THE ACCOUNTING (final cross-vendor round). `scripts/blind-merge.mjs` settles
 * every entry by its id, so a repeated one silently merges two findings into one line of
 * the ledger — the very disappearance the counting exists to prevent. A duplicate is
 * therefore an unusable answer, not a tolerable one, and an entry with no text at all is
 * not an entry.
 *
 * `allowEmpty` exists for the AUDIT: a sweep that finds nothing is a real answer, and
 * refusing it would report a clean audit as "Sol did not answer" after the allowance was
 * already spent. It must SAY so in the prescribed line — silence is still no answer.
 */
function parseEntries(lines, prefix, { allowEmpty = false } = {}) {
  const re = new RegExp(`^[-*]?\\s*(${prefix}\\d+)\\s*\\|\\s*([^|]*)\\|\\s*(.*)$`, 'i')
  const entries = []
  const seen = new Set()
  const clean = lines.map((l) => l.clean).join('\n')
  for (const { clean: cleanLine, raw } of lines) {
    const m = re.exec(cleanLine.trim())
    if (!m) continue
    const id = m[1].toUpperCase()
    // The id is recognised on the stripped line; the FILE and FINDING are cut
    // from the raw line between/after its pipes, so a path the strip would
    // rewrite (`src/__init__.py`) travels byte-exact (see parseAnswer). A raw
    // line whose pipes the strip somehow invented falls back to the stripped
    // fields — visible, never silent loss.
    const firstPipe = raw.indexOf('|')
    const secondPipe = firstPipe < 0 ? -1 : raw.indexOf('|', firstPipe + 1)
    const file = secondPipe < 0 ? m[2].trim() : raw.slice(firstPipe + 1, secondPipe).trim()
    const text = secondPipe < 0 ? m[3].trim() : raw.slice(secondPipe + 1).trim()
    if (!text) return { ok: false, error: `entry ${id} carries no finding at all` }
    if (seen.has(id)) return { ok: false, error: `the id ${id} is used twice — the merge accounts by id, so one of them would vanish` }
    seen.add(id)
    // A finding that names no file is still a finding; it is marked, never dropped.
    entries.push({ id, file: file || '(unspecified)', text })
  }
  // TWO READINGS OF THE SAME MARKER, deliberately different (last round). ACCEPTING an
  // empty audit demands the explanation — a bare "NO FINDINGS:" says nothing about what
  // was checked. DETECTING a contradiction only demands the claim: an answer that lists a
  // finding and then writes the marker at all is saying two things, explanation or not.
  const claimsNone = /(^|\n)\s*[-*]?\s*NO FINDINGS\b/i.test(clean)
  const statesNone = /(^|\n)\s*[-*]?\s*NO FINDINGS\s*:\s*\S/i.test(clean)
  if (!entries.length) {
    if (allowEmpty && statesNone) return { ok: true, answer: { entries: [] }, summary: 'no findings' }
    return { ok: false, error: `no entry in the form \`${prefix}1 | <file> | <one line>\`` }
  }
  // FINDINGS AND "NO FINDINGS" CANNOT BOTH BE TRUE (final round). Such an answer says two
  // things, and whichever the caller acts on, it acted on half an answer.
  if (claimsNone) {
    return { ok: false, error: 'the answer lists findings AND claims there are none — it says two things' }
  }
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
  // Markdown DECORATION by its SHAPE, never by bare character (round-7
  // pass 1, sharpening round 6): deleting every `*_#>` globally corrupted
  // structured answers (`src/foo_bar.mjs` → `src/foobar.mjs`) and could
  // FABRICATE the very admission the net scans for (`no ma*terial` →
  // `no material`). Stripped instead: headings and quote markers at line
  // starts, backtick runs, and emphasis runs only at WORD EDGES — an
  // underscore or asterisk inside a word is content and stays, so the strip
  // can unshield an admission (`**no** material`) but never invent one.
  // Emphasis is stripped only as a MATCHED PAIR (round-8: an unmatched
  // word-edge marker is content — `src/foo_.mjs` names a file, and eating a
  // lone `_` in `no _material` would again build the admission phrase out of
  // text that never said it), and the pair rule is ITERATED so nesting
  // unwraps outside-in (`*no **material***`, closing round): each pass may
  // open after — and close before — another marker run, and a bounded loop
  // reaches the fixpoint of any sane nesting depth.
  let clean = String(text ?? '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>+[ \t]?/gm, '')
    .replace(/`+/g, '')
  // The boundary is ANY non-word position, as a complement rather than an
  // enumerated class (closing round: a quote-adjacent pair survived the
  // whitespace list, and every list invites the next shape). A marker run
  // inside a word — foo_.mjs, ma*terial — never opens or closes.
  for (let i = 0; i < 4; i++) {
    const next = clean.replace(
      /(^|[^\w*_])([*_]+)(?=[^\s*_])([^*_]+?)(?<=[^\s*_])\2(?=[^\w*_]|[*_]|$)/g,
      '$1$3',
    )
    if (next === clean) break
    clean = next
  }
  if (!clean.trim()) return { ok: false, kind: k, answer: null, summary: '', error: 'the run produced no answer at all' }
  // The two-tier judgment, not the raw net: an audit or diagnose answer about
  // THIS project's tooling describes failure modes in the net's own vocabulary,
  // and a whole message swallowed for one such phrase is work discarded
  // (measured 18.08.2026, point 714 pass 2, on the review path).
  //
  // SCANNED TWICE, RAW AND STRIPPED — either hit is an admission (final
  // convergence, structural by construction): four rounds chased Markdown
  // shapes that shielded an admission from the stripped scan alone (flat,
  // nested, quote-adjacent emphasis), and each fix invited the next shape.
  // Whatever decoration the stripper misses leaves the RAW text untouched for
  // the raw scan; whatever decoration SHIELDS the raw words is unwrapped for
  // the stripped scan. A strip defect can now only ever widen the net, never
  // shield it.
  if (blindReviewerAdmission(text) || blindReviewerAdmission(clean)) {
    return { ok: false, kind: k, answer: null, summary: '', error: 'the model says it could not see the material' }
  }
  // THE STRIPPED COPY MATCHES, THE RAW TEXT IS QUOTED (final convergence,
  // second half of the dual-scan principle): every strip rule preserves the
  // LINE COUNT (nothing removes a newline), so lines pair by index — a label
  // or entry id is recognised on the stripped line, robust against
  // decoration, and the field VALUE is cut from the raw line, so content the
  // strip would rewrite (`src/__init__.py`) reaches the caller byte-exact.
  // Should the pairing ever break, extraction falls back to the stripped
  // lines alone — a wrong-but-visible spelling, never a crash.
  const rawLines = String(text ?? '').split('\n')
  const cleanLines = clean.split('\n')
  const lines =
    rawLines.length === cleanLines.length
      ? cleanLines.map((c, i) => ({ clean: c, raw: rawLines[i] }))
      : cleanLines.map((c) => ({ clean: c, raw: c }))
  if (k === 'explain') {
    // The thinness ruling reads the stripped prose (matching); what the caller
    // gets is the RAW text, byte-exact — the one rule, applied here too (an
    // explanation quotes paths, and the strip rewrites src/__init__.py).
    const prose = clean.trim()
    if (prose.length < 40) return { ok: false, kind: k, answer: null, summary: '', error: 'the answer is too thin to be an explanation' }
    const rawProse = String(text ?? '').trim()
    return { ok: true, kind: k, answer: { text: rawProse }, summary: rawProse.split('\n')[0].slice(0, 120), error: '' }
  }
  // A sweep may honestly find nothing; a DIVERGENT enumeration that lists nothing is no
  // half of a blind-parallel stage, so only the audit may come back empty.
  const parsed = k === 'diagnose' ? parseDiagnose(lines) : parseEntries(lines, entryPrefix(k), { allowEmpty: k === 'audit' })
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
