// WHAT A REVIEW ROUND ACTUALLY CARRIED — the material budget, its accounting,
// and the passes a range too large is cut into (work-order point 714).
//
// THE DEFECT THIS EXISTS FOR (measured 17.08.2026 on point 700, round 6): the
// material for a range is assembled into a fixed budget, and what does not fit is
// cut. The cut is written INTO the material — `[TRUNCATED: 40207 characters not
// shown]`, nineteen files `OMITTED ENTIRELY` — so it reaches the caller only if
// the model chooses to mention it. Nothing told the CALLER, and the record
// command was printed either way: a clean-looking ledger line clearing files
// nobody read. That is the worst shape a review record can take, and it gets
// worse with size, because the range big enough to need the review most is the
// one whose record covers least of it.
//
// So the accounting is DATA, produced where the cut is made:
//   assembleMaterial()  returns the text AND what it had to drop
//   materialShortfall() turns that into a refusal, or null
// and the two are the only inputs to "may this be recorded". Nothing here reads
// the material text looking for a truncation marker — a source file under review
// can contain that marker verbatim (this one does), and a check that scans for it
// answers about the wrong thing in both directions.
//
// SPLITTING BY COMMIT DOES NOT HELP, which is why planPasses cuts through the
// FILE SET (measured 18.08.2026 over 41 commits): the material ships the CURRENT
// CONTENT of every touched path beside the patch, so a commit's material is
// dominated by the largest file it happens to touch. 34 of those 41 commits
// exceeded 150k characters on their own, 31 of them only because of four
// bookkeeping files carrying no reviewable mechanism at all — the worst single
// commit reached 2.05M. A caller who reacts to a truncation by reviewing commit
// by commit gets the same truncation one commit at a time, and pays a round per
// commit for it.

/**
 * How much material ONE review round may carry — the diffstat, the patch and the
 * content of the changed files together.
 *
 * 200_000 characters, and deliberately unchanged by this point: it is the ceiling
 * the 17.08.2026 measurement was taken against (the material came to 201567
 * characters and was cut here), so moving it would invalidate the one reading we
 * have. It is not a model limit — Sol's context is far larger — but an ATTENTION
 * and cost limit: a reviewer handed a megabyte reports on the part it read. The
 * answer to a range that does not fit is more passes, not a bigger round; the
 * case that motivated this point (a 1.39M bookkeeping file) is out of reach of
 * any ceiling worth setting.
 */
export const MATERIAL_BUDGET_CHARS = 200_000

/** The share of the budget the patch may take before the files get their turn. */
export const PATCH_SHARE = 0.5

/** The share the diffstat may take — it is a summary, never the artefact. */
export const STAT_SHARE = 0.05

/** Room kept free per pass for the frame the assembly writes around each part. */
const PASS_RESERVE = 1024

/**
 * What one file costs a pass BEYOND its own characters: its header, the 80 the
 * assembly charges it, and the 200 the omit-guard insists stay free. Padded,
 * because a plan that packs a pass full to the last character is a plan the
 * assembly then reports as short — and the assembly, not the plan, is authority.
 */
const FILE_FRAME_CHARS = 320

const fileHeader = (path) => `=== FILE (current content): ${path} ===`
const omittedHeader = (path) => `=== FILE OMITTED ENTIRELY (material budget spent): ${path} ===`

/**
 * The marker for a file whose CONTENT is larger than a whole round but whose DIFF
 * is complete in the patch above it. It is not an omission and not a cut: the
 * change is fully there, the surrounding file is not, and the reviewer is told
 * exactly that instead of being left to guess which of the three it is.
 */
const patchOnlyHeader = (path) =>
  `=== FILE CONTENT NOT SENT — it is larger than one whole review round; its COMPLETE diff is in the PATCH above: ${path} ===`

/** Cut `text` to `room`, saying so in the material where the cut falls. */
const cut = (text, room) =>
  text.length > room
    ? `${text.slice(0, Math.max(0, room))}\n… [TRUNCATED: ${text.length - room} characters not shown]`
    : text

/**
 * Assemble the material for one round AND account for it.
 *
 * The text is byte-identical to what this project has always sent; what is new is
 * the second half of the return value, which says what the text could not hold.
 * `patchOnly` names paths whose content is deliberately left out because the
 * patch carries the whole change (see patchOnlyHeader) — a declared coverage
 * level, never a silent drop, and therefore not a short-fall.
 *
 * Returns { text, size, rawSize, budget, fit, statTruncated, patchTruncated,
 *           truncated[], omitted[], patchOnly[], sent[] }.
 */
export function assembleMaterial({
  stat = '',
  patch = '',
  files = [],
  budget = MATERIAL_BUDGET_CHARS,
  patchRoom = null,
  patchOnly = [],
} = {}) {
  const cap = Math.max(0, Number(budget) || 0)
  const statText = String(stat).trim()
  const patchText = String(patch).trim()
  const statRoom = Math.floor(cap * STAT_SHARE)
  const room = Number.isFinite(Number(patchRoom)) && patchRoom !== null
    ? Math.max(0, Number(patchRoom))
    : Math.floor(cap * PATCH_SHARE)
  const skipContent = new Set((patchOnly ?? []).map((p) => String(p)))

  const out = ['=== DIFFSTAT ===', cut(statText, statRoom), '', '=== PATCH ===', cut(patchText, room), '']
  const account = {
    statTruncated: statText.length > statRoom,
    patchTruncated: patchText.length > room,
    truncated: [],
    omitted: [],
    patchOnly: [],
    sent: [],
  }
  let rawSize = statText.length + patchText.length

  let left = Math.max(0, cap - out.join('\n').length)
  for (const file of files ?? []) {
    const path = String(file?.path ?? '?')
    const text = String(file?.text ?? '')
    rawSize += text.length
    // DECLARED, NOT DROPPED: the content is out by decision, the diff is in, and
    // the material says which. It costs the round only its one header line.
    if (skipContent.has(path)) {
      const header = patchOnlyHeader(path)
      // THE NOTE COSTS ROOM TOO. Pushed with no room left it put the round over
      // its budget while the accounting still called it complete — several
      // declared patch-only files were enough to do it (cross-vendor review,
      // second round). With nothing left the file is an ordinary OMISSION: the
      // round is spent, and saying so is what stops the record.
      if (left <= header.length + 1) {
        out.push(omittedHeader(path), '')
        account.omitted.push(path)
        continue
      }
      out.push(header, '')
      account.patchOnly.push(path)
      left -= header.length + 1
      continue
    }
    const header = fileHeader(path)
    if (left <= header.length + 200) {
      out.push(omittedHeader(path), '')
      account.omitted.push(path)
      continue
    }
    const fileRoom = left - header.length - 80
    out.push(header, cut(text, fileRoom), '')
    if (text.length > fileRoom) account.truncated.push(path)
    else account.sent.push(path)
    left -= header.length + Math.min(text.length, fileRoom) + 80
  }

  const text = out.join('\n')
  return {
    ...account,
    text,
    size: text.length,
    rawSize,
    budget: cap,
    // THE ONE QUESTION, ANSWERED FROM THE ACCOUNTING — AND FROM THE RESULT. The
    // flags alone said "nothing was cut", which is not the same claim as "it
    // fitted": the frames the assembly writes are outside every per-file
    // reservation, so a round could end over its ceiling with an empty ledger of
    // losses (cross-vendor review, second round). The measured text decides.
    fit:
      !account.statTruncated &&
      !account.patchTruncated &&
      account.truncated.length === 0 &&
      account.omitted.length === 0 &&
      text.length <= cap,
  }
}

/**
 * Is what was ASSEMBLED what was SENT?
 *
 * The comparison the point asks for, and the reason it is a separate step: the
 * assembly can be perfect and the hand-off still lose it — a caller that rebuilds
 * the material, trims it, or sends a different variable entirely. `sent` is the
 * exact string handed to the model. Anything that is not a string means the
 * caller CANNOT SAY, and that is reported as such rather than assumed to be fine.
 */
export function sentMaterialMatches(assembly = null, sent = undefined) {
  if (!assembly || typeof assembly.text !== 'string') {
    return { known: false, matches: false, note: 'no assembly accounting was produced' }
  }
  if (typeof sent !== 'string') {
    return { known: false, matches: false, note: 'the caller did not say what it sent' }
  }
  if (sent === assembly.text) return { known: true, matches: true, note: '' }
  return {
    known: true,
    matches: false,
    note: `what was sent is ${sent.length} characters, what was assembled is ${assembly.text.length}`,
  }
}

/**
 * The reason a record may NOT be printed for this round, or null.
 *
 * Fail-open in the honest direction (the point's own words): a round whose fit
 * cannot be established refuses the record, exactly like a round that is known
 * not to have fitted. The only answer that clears it is a complete assembly whose
 * text is provably the text that went out.
 */
export function materialShortfall({ assembly = null, sent = undefined } = {}) {
  const seen = sentMaterialMatches(assembly, sent)
  if (!seen.known) {
    return {
      reason: 'unverified',
      detail: seen.note,
      truncated: assembly?.truncated ?? [],
      omitted: assembly?.omitted ?? [],
      budget: assembly?.budget ?? MATERIAL_BUDGET_CHARS,
      size: assembly?.size ?? 0,
      rawSize: assembly?.rawSize ?? 0,
    }
  }
  if (!seen.matches) {
    return {
      reason: 'sent-differs',
      detail: seen.note,
      truncated: assembly.truncated,
      omitted: assembly.omitted,
      budget: assembly.budget,
      size: assembly.size,
      rawSize: assembly.rawSize,
    }
  }
  if (assembly.fit) return null
  return {
    reason: 'over-budget',
    detail: '',
    statTruncated: assembly.statTruncated,
    patchTruncated: assembly.patchTruncated,
    truncated: assembly.truncated,
    omitted: assembly.omitted,
    budget: assembly.budget,
    size: assembly.size,
    rawSize: assembly.rawSize,
  }
}

/**
 * One path as GIT WROTE IT — unquoted where git quoted it.
 *
 * git prints a path with a tab, a newline, a quote, a backslash or a high byte
 * in it as a C-style quoted string (`"a/x\ty"`), in the diff header and in
 * `--name-only` alike. A reader that takes the quoted form literally is holding a
 * path no `git show` will resolve and no section parser will match — which is a
 * file dropped from every pass with nothing said about it (cross-vendor review,
 * second round). The octal escapes are BYTES, so they are decoded as such and the
 * result read back as UTF-8; anything unquoted is returned untouched.
 */
export function unquoteGitPath(value) {
  const raw = String(value ?? '')
  if (!(raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)) return raw
  const body = raw.slice(1, -1)
  const simple = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34 }
  const bytes = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      bytes.push(...Buffer.from(body[i], 'utf8'))
      continue
    }
    const next = body[++i]
    if (next === undefined) break
    if (next in simple) {
      bytes.push(simple[next])
      continue
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(i))
    if (octal) {
      i += octal[0].length - 1
      bytes.push(Number.parseInt(octal[0], 8))
      continue
    }
    bytes.push(...Buffer.from(next, 'utf8'))
  }
  return Buffer.from(bytes).toString('utf8')
}

/** One C-quoted token starting at `from`, or null if it never closes. */
function readQuoted(text, from) {
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === '"') return { value: unquoteGitPath(text.slice(from, i + 1)), end: i + 1 }
  }
  return null
}

/** Drop the `a/`/`b/` prefixes git writes in front of both sides. */
const dropPrefix = (path, side) => (path.startsWith(`${side}/`) ? path.slice(2) : path)

/**
 * The two paths one `diff --git` header names, or null for any other line.
 *
 * The bare form is genuinely ambiguous — a path may itself contain ` b/` — so
 * where several splits are possible the one whose two halves are EQUAL wins, and
 * the last one otherwise, which is what the plain regex used to do.
 */
export function parseDiffHeader(line) {
  const m = /^diff --git (.*)$/.exec(String(line ?? ''))
  if (!m) return null
  const rest = m[1]
  let a = null
  let tail = rest
  if (rest.startsWith('"')) {
    const read = readQuoted(rest, 0)
    if (!read) return null
    a = dropPrefix(read.value, 'a')
    tail = rest.slice(read.end).replace(/^ /, '')
  }
  if (a !== null) {
    const b = tail.startsWith('"') ? readQuoted(tail, 0) : { value: tail }
    if (!b) return null
    return { a, b: dropPrefix(b.value, 'b') }
  }
  // A bare a-side with a quoted b-side (git quotes both, but a hand-made patch
  // need not) — then the ordinary all-bare form.
  const quotedB = rest.indexOf(' "')
  if (quotedB >= 0 && rest.startsWith('a/')) {
    const b = readQuoted(rest, quotedB + 1)
    if (b) return { a: rest.slice(2, quotedB), b: dropPrefix(b.value, 'b') }
  }
  if (!rest.startsWith('a/')) return null
  const splits = []
  for (let i = rest.indexOf(' b/'); i >= 0; i = rest.indexOf(' b/', i + 1)) splits.push(i)
  if (!splits.length) return null
  const equal = splits.find((i) => rest.slice(2, i) === rest.slice(i + 3))
  const at = equal === undefined ? splits[splits.length - 1] : equal
  return { a: rest.slice(2, at), b: rest.slice(at + 3) }
}

/**
 * The patch, split into one section per file.
 *
 * Pure, and the reason no extra git call is needed to cost a file: a per-file
 * patch size is already in the patch. The `b/` side is taken as the path, as
 * `newFilePathsIn` does, so a rename is costed against where it landed.
 */
export function splitPatchByFile(patch) {
  const lines = String(patch ?? '').split('\n')
  const out = []
  let current = null
  for (const line of lines) {
    const header = parseDiffHeader(line)
    if (header) {
      if (current) out.push(current)
      current = { path: header.b, lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) out.push(current)
  return out.map((s) => ({ path: s.path, text: s.lines.join('\n') }))
}

/**
 * Cut a range that does not fit into PASSES over the FILE SET.
 *
 * Each pass is a set of files whose patch sections and content together fit one
 * round; their union is the range. A file whose content cannot fit even alone
 * travels PATCH-ONLY (its complete diff, without the surrounding file), which is
 * how a 1.39M append-only bookkeeping file is reviewable at all — the change is
 * the diff, the rest is context. A file whose PATCH alone does not fit is
 * UNCOVERABLE and is named as such: no round can hold it, and saying so beats
 * printing a record that pretends otherwise.
 *
 * The plan is ADVISORY. The assembly's own accounting decides whether a pass
 * actually fitted, so a plan that packs too tightly costs a refusal, never a
 * false clearance.
 */
export function planPasses({ stat = '', patch = '', files = [], budget = MATERIAL_BUDGET_CHARS } = {}) {
  const cap = Math.max(0, Number(budget) || 0)
  const statText = String(stat).trim()
  const sections = new Map(splitPatchByFile(patch).map((s) => [s.path, s.text]))
  const statCost = Math.min(statText.length, Math.floor(cap * STAT_SHARE))
  const room = Math.max(0, cap - statCost - PASS_RESERVE)

  // Every path the range touched: the ones with content, plus the ones the patch
  // knows about and the content list does not (a deleted file has no content).
  const entries = []
  const seen = new Set()
  for (const file of files ?? []) {
    const path = String(file?.path ?? '?')
    seen.add(path)
    entries.push({ path, content: String(file?.text ?? ''), patchText: sections.get(path) ?? '' })
  }
  for (const [path, text] of sections) {
    if (!seen.has(path)) entries.push({ path, content: '', patchText: text })
  }

  const passes = []
  const uncoverable = []
  let rawSize = statText.length
  let current = null
  for (const entry of entries) {
    const frame = FILE_FRAME_CHARS + fileHeader(entry.path).length
    const patchLen = entry.patchText.length
    rawSize += patchLen + entry.content.length
    if (frame + patchLen > room) {
      uncoverable.push({ path: entry.path, patchChars: patchLen, contentChars: entry.content.length })
      continue
    }
    const whole = frame + patchLen + entry.content.length
    const patchOnly = whole > room
    const cost = patchOnly ? frame + patchLen : whole
    if (!current || current.size + cost > room) {
      current = { files: [], patchOnly: [], patchChars: 0, size: 0 }
      passes.push(current)
    }
    current.files.push(entry.path)
    if (patchOnly) current.patchOnly.push(entry.path)
    current.patchChars += patchLen
    current.size += cost
  }

  const total = passes.length
  return {
    budget: cap,
    room,
    rawSize,
    // ONE pass and nothing beyond reach is the ordinary case: the range fits.
    fits: total <= 1 && uncoverable.length === 0,
    passes: passes.map((p, i) => ({
      index: i + 1,
      total,
      files: p.files,
      patchOnly: p.patchOnly,
      size: p.size,
      // The patch of a pass is MANDATORY material, so it gets whatever room it
      // needs rather than the standing half-share — the packing above already
      // proved the whole pass fits.
      patchRoom: Math.max(Math.floor(cap * PATCH_SHARE), p.patchChars),
    })),
    uncoverable,
  }
}

/** One pass of a plan by its number, or null. */
export function passByIndex(plan, index) {
  const n = Number(index)
  return (plan?.passes ?? []).find((p) => p.index === n) ?? null
}

/**
 * The line the caller must see BEFORE a round is spent: the threshold, this
 * range's real size, and — when it does not fit — the passes it needs.
 */
export function formatBudgetNotice(plan, { sha = '', command = 'node scripts/review-sol.mjs' } = {}) {
  const at = String(sha).slice(0, 7)
  const head = `review-sol: the material budget is ${plan.budget} characters per round; this range assembles ${plan.rawSize}.`
  if (plan.fits) return `${head}\n  It fits in one round.`
  const lines = [
    head,
    `  IT DOES NOT FIT, so ${at || 'this range'} is reviewed in ${plan.passes.length} PASSES over the FILE SET`,
    '  (splitting by COMMIT does not help: every commit ships the current content of the files it',
    '  touches, so the same files overflow one commit at a time and cost a round each).',
  ]
  for (const pass of plan.passes) {
    lines.push(
      `    pass ${pass.index}/${pass.total}  ${pass.files.length} file(s), ~${pass.size} characters` +
        (pass.patchOnly.length ? `  [diff only: ${pass.patchOnly.join(', ')}]` : ''),
      `      ${pass.files.join(', ')}`,
      `      ${command} --sha ${at || '<sha>'} --brief "<what to judge>" --pass ${pass.index}`,
    )
  }
  if (plan.uncoverable.length) {
    lines.push(
      '  BEYOND REACH — no round can hold these, not even their diff alone:',
      ...plan.uncoverable.map((u) => `    ${u.path} (diff ${u.patchChars}, content ${u.contentChars} characters)`),
      '  They are covered by NO pass. Split the change itself, or review them by another means',
      '  and say so — a record that names them would be claiming a reading nobody did.',
    )
  }
  return lines.join('\n')
}

/**
 * The reason a WHOLE-RANGE record may not be offered for a range NOBODY has
 * reviewed yet, or null — the same question as materialShortfall, asked one step
 * earlier, from the plan alone.
 *
 * It exists for the paths that print a record command without ever assembling
 * anything (cross-vendor review, second round): the share switch at `claude-only`
 * and a range Sol authored both hand the review to a Claude model and print the
 * template it must record — for the WHOLE range, whose fit nobody had measured.
 * The point's rule is the same wherever it is asked: an unknown fit refuses.
 */
export function planShortfall(plan = null) {
  if (!plan || typeof plan.fits !== 'boolean' || !Array.isArray(plan.passes)) {
    return {
      reason: 'unplanned',
      detail: 'the range was never measured against the budget',
      truncated: [],
      omitted: [],
      budget: MATERIAL_BUDGET_CHARS,
      size: 0,
      rawSize: 0,
    }
  }
  if (plan.fits) return null
  return {
    reason: 'needs-passes',
    detail: '',
    truncated: [],
    omitted: [],
    passes: plan.passes,
    uncoverable: plan.uncoverable ?? [],
    budget: plan.budget,
    size: 0,
    rawSize: plan.rawSize,
  }
}

/** Every file this round lost, one line each — the half no branch may skip. */
function lostLines(shortfall) {
  const lines = []
  // A ROUND CAN BE OVER ITS CEILING WITH NOTHING ON THE LOSS LIST: the frames
  // around the parts are charged to no file, so the size is named in its own
  // right rather than left to be inferred from an empty list.
  if (Number(shortfall.size) > Number(shortfall.budget)) {
    lines.push(
      `  · the assembled round is ${shortfall.size} characters — ${shortfall.size - shortfall.budget} over the ceiling`,
    )
  }
  if (shortfall.statTruncated) lines.push('  · the DIFFSTAT was cut')
  if (shortfall.patchTruncated) lines.push('  · the PATCH was cut — the reviewer saw part of the diff')
  for (const path of shortfall.truncated ?? []) lines.push(`  · TRUNCATED: ${path}`)
  for (const path of shortfall.omitted ?? []) lines.push(`  · OMITTED ENTIRELY: ${path}`)
  return lines
}

/** The passes the caller is sent to instead, from the plan or from the shortfall. */
function passLines(shortfall, plan) {
  const passes = plan && !plan.fits ? plan.passes : (shortfall.passes ?? [])
  const lines = passes.map((pass) => `    --pass ${pass.index}   ${(pass.files ?? []).join(', ')}`)
  const beyond = plan && !plan.fits ? plan.uncoverable : (shortfall.uncoverable ?? [])
  if (beyond?.length) {
    lines.push(
      '  BEYOND REACH — no pass can hold these, not even their diff alone, so no record may',
      '  name them at all:',
      ...beyond.map((u) => `    ${u.path} (diff ${u.patchChars}, content ${u.contentChars} characters)`),
    )
  }
  return lines
}

/** The refusal a short-fall produces: what was lost, and what to do instead. */
export function formatShortfall(shortfall, { sha = '', plan = null } = {}) {
  const at = String(sha).slice(0, 7) || '<sha>'
  const lines = [`  NO RECORD COMMAND IS PRINTED for ${at}: this round did not carry the whole range.`]
  // EVERY BRANCH NAMES WHAT WAS LOST (cross-vendor review, second round). The
  // two "cannot tell" reasons used to return before the file list, so the
  // refusal that had the names printed none of them — and the point demands
  // every truncated or omitted file be named in the refusal.
  if (shortfall.reason === 'unverified') {
    lines.push(
      `  The tool cannot tell whether the material fitted (${shortfall.detail}), and a round whose`,
      '  coverage is unknown is recorded as covering nothing. That is the fail-open direction:',
      '  a missing answer must never read as "everything was seen".',
      ...(lostLines(shortfall).length
        ? ['  What the accounting saw of the round it cannot vouch for:', ...lostLines(shortfall)]
        : []),
    )
    return lines.join('\n')
  }
  if (shortfall.reason === 'sent-differs') {
    lines.push(
      `  What was SENT is not what was assembled (${shortfall.detail}), so the accounting below`,
      '  describes a different text than the reviewer read. Nothing about this round can be recorded.',
      ...(lostLines(shortfall).length
        ? ['  What the assembly it describes had already lost:', ...lostLines(shortfall)]
        : []),
    )
    return lines.join('\n')
  }
  if (shortfall.reason === 'unplanned') {
    lines.push(
      `  The tool cannot tell whether this range fits one round (${shortfall.detail}), so it offers`,
      '  no record for it: an unknown fit refuses rather than assumes.',
    )
    return lines.join('\n')
  }
  if (shortfall.reason === 'needs-passes') {
    lines[0] = `  NO RECORD COMMAND IS PRINTED for ${at}: this range does not fit ONE review round.`
    lines.push(
      `  The material budget is ${shortfall.budget} characters and the complete material is ${shortfall.rawSize}.`,
      `  A record here would clear every commit in the range. Review it in the ${(shortfall.passes ?? []).length}`,
      '  PASSES over the file set instead — each pass records what it actually read:',
      ...passLines(shortfall, plan),
    )
    return lines.join('\n')
  }
  lines.push(
    `  The material budget is ${shortfall.budget} characters and the complete material is ${shortfall.rawSize}.`,
    ...lostLines(shortfall),
    '  A record here would clear every commit in the range, including these files. Review the',
    '  range in PASSES over the file set instead — each pass records what it actually read:',
    ...passLines(shortfall, plan),
  )
  return lines.join('\n')
}

/**
 * The `--pass k/n` value, parsed.
 *
 * Refuses n = 1: a single pass is an ordinary whole-range record, and letting one
 * be recorded as a pass would put a composition marker on a review that never
 * needed one — the gate would then wait forever for a pass 2 nobody owes.
 */
export function parsePassSpec(value) {
  const raw = String(value ?? '').trim()
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw)
  if (!m) {
    return { ok: false, errors: [`--pass <k>/<n>: which pass of how many this verdict covers — "${raw}" is not that`] }
  }
  const index = Number(m[1])
  const total = Number(m[2])
  const errors = []
  if (total < 2) {
    errors.push('--pass <k>/<n>: n must be at least 2 — one pass over the whole range is an ordinary record')
  }
  if (index < 1 || index > total) {
    errors.push(`--pass ${raw}: the pass number must lie between 1 and ${total}`)
  }
  return errors.length ? { ok: false, errors } : { ok: true, index, total, errors: [] }
}

/** The `--pass-files` value, as a list of paths. */
export function parsePassFiles(value) {
  return String(value ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Which passes a set of records for ONE sha holds, and which are still owed.
 *
 * A pass record clears NOTHING on its own: the composition is complete only when
 * every pass of the same total is on record AND the files those passes name
 * COVER what the composition is asked to clear. The worst verdict of the set is
 * the verdict of the whole — one pass saying do-not-merge is a range that must
 * not merge, whatever the other passes found.
 *
 * `expect` is that file set, and it is the half that makes the count mean
 * anything (cross-vendor review of this point, first round): counting passes
 * alone, two records that both name the SAME file — or arbitrary files, or the
 * files of a plan whose UNCOVERABLE entry no pass ever held — read as `1/2` and
 * `2/2` and cleared a range nobody read. A caller with nothing to compare
 * against passes none and gets the count alone, which is what it asked for.
 */
export function passComposition(records = [], { expect = [] } = {}) {
  const groups = new Map()
  for (const record of records ?? []) {
    const total = Number(record?.pass?.total)
    const index = Number(record?.pass?.index)
    if (!Number.isInteger(total) || total < 2 || !Number.isInteger(index)) continue
    const key = `${String(record.sha ?? '')}|${total}`
    if (!groups.has(key)) groups.set(key, { sha: String(record.sha ?? ''), total, byIndex: new Map(), records: [] })
    const group = groups.get(key)
    group.records.push(record)
    const prior = group.byIndex.get(index)
    // A pass reviewed twice keeps the LATER verdict, exactly as a re-review of a
    // whole range supersedes the earlier one.
    if (!prior || Number(record.at ?? 0) >= Number(prior.at ?? 0)) group.byIndex.set(index, record)
  }
  const wanted = [...new Set((expect ?? []).map((p) => String(p ?? '').trim()).filter(Boolean))]
  return [...groups.values()].map((group) => {
    const missing = []
    for (let i = 1; i <= group.total; i++) if (!group.byIndex.has(i)) missing.push(i)
    const held = [...group.byIndex.values()]
    const files = [...new Set(held.flatMap((r) => r.pass?.files ?? []))]
    // WHAT NO PASS NAMED WAS NOT READ. The union of the passes is the coverage
    // the composition claims, so a file of the expected set that appears in none
    // of them is a file the range would be cleared over unread.
    const uncovered = wanted.filter((p) => !files.includes(p))
    return {
      sha: group.sha,
      total: group.total,
      have: group.byIndex.size,
      missing,
      uncovered,
      complete: missing.length === 0 && uncovered.length === 0,
      records: held,
      files,
    }
  })
}

/** The verdict a complete composition carries: the worst of its passes. */
export function worstVerdict(records = [], order = ['merge', 'merge-with-fixes', 'do-not-merge']) {
  let worst = ''
  let rank = -1
  for (const record of records ?? []) {
    const at = order.indexOf(String(record?.verdict ?? ''))
    if (at > rank) {
      rank = at
      worst = String(record?.verdict ?? '')
    }
  }
  return worst
}
