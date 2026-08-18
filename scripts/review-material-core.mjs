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
import { createHash } from 'node:crypto'

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

// EVERY STRUCTURAL LINE SPELLS ITS PATH THROUGH quotePassFile (round-1 pass
// 3): git permits newlines and control bytes in file names, and a raw
// interpolation let such a path forge manifest entries, fake file headers or
// an early MANIFEST_END — the reviewer then could not tell which path or
// delivery mode the material really named. The C-quoted spelling is one line
// by construction and round-trips through unquoteGitPath.
const fileHeader = (path) => `=== FILE (current content): ${quotePassFile(path)} ===`
const omittedHeader = (path) => `=== FILE OMITTED ENTIRELY (material budget spent): ${quotePassFile(path)} ===`

/** The last line of a pass manifest, so the reviewer sees where the shape ends. */
export const MANIFEST_END = '=== END OF PASS MANIFEST — the DIFFSTAT and PATCH follow ==='

/**
 * THE MATERIAL OF A PASS STATES ITS OWN SHAPE, INSIDE THE MATERIAL (fourth
 * cross-vendor round, the structural finding). Three of four passes were
 * refused a conclusion for the same reason, in the reviewer's own words: the
 * whole-range diffstat named 14 changed files, the attachment carried 2–3, and
 * nothing was marked TRUNCATED — so the reviewer, correctly, declined to
 * conclude about the absent files. That was the pass mechanism's fault, not
 * the reviewer's: it shipped the range's diffstat beside one pass's file
 * bodies with nothing saying "this is pass k of n, these files are absent by
 * design, covered by passes x and y". Absent-by-design and
 * absent-by-truncation mean OPPOSITE things about the verdict a reviewer may
 * give, so the two must be visibly different things in the material itself —
 * until they are, no pass verdict means what the ledger records it as meaning.
 *
 * The manifest therefore names, for THIS pass: which pass of how many, every
 * file it carries WITH its delivery level (complete, or diff-only by design),
 * every file of the range that is absent by design with the pass covering it,
 * and the files beyond the reach of any pass. It is written by the same module
 * that plans the passes, so the two cannot drift apart.
 */
export function formatPassManifest(plan, pass) {
  const total = Number(pass?.total ?? 0)
  const index = Number(pass?.index ?? 0)
  const patchOnly = new Set(pass?.patchOnly ?? [])
  const binary = new Set(pass?.binary ?? [])
  const carried = pass?.files ?? []
  const lines = [
    `=== REVIEW PASS ${index}/${total} — THE SHAPE OF THIS MATERIAL ===`,
    `This range is too large for one review round, so it is reviewed in ${total} passes over its`,
    'FILE SET, whose union covers the range. This material is ONE of those passes. The DIFFSTAT',
    'below describes the WHOLE range for context: it names files this pass deliberately omits.',
    `THIS PASS CARRIES ${carried.length} file(s), each at the delivery level stated:`,
  ]
  for (const path of carried) {
    lines.push(
      binary.has(path)
        ? `  · ${quotePassFile(path)} — BINARY, declared: its bytes cannot travel as text; the PATCH marks the change`
        : patchOnly.has(path)
          ? `  · ${quotePassFile(path)} — DIFF ONLY, by design (content larger than a round; its PATCH is complete)`
          : `  · ${quotePassFile(path)} — complete: its diff in the PATCH, its current content below`,
    )
  }
  const absent = (plan?.passes ?? []).filter((p) => p.index !== index)
  if (absent.some((p) => (p.files ?? []).length)) {
    lines.push('ABSENT BY DESIGN — every other changed file, covered by the pass named beside it:')
    for (const other of absent) {
      for (const path of other.files ?? []) lines.push(`  · ${quotePassFile(path)} → pass ${other.index}/${total}`)
    }
  }
  if ((plan?.uncoverable ?? []).length) {
    lines.push('BEYOND THE REACH OF ANY PASS — no round can hold these; NO pass covers them:')
    for (const u of plan.uncoverable) lines.push(`  · ${quotePassFile(u.path)}`)
  }
  lines.push(
    'A file declared ABSENT BY DESIGN here is NOT truncated — the two mean opposite things:',
    'a designed absence is covered by another pass and bars no verdict, while anything marked',
    'TRUNCATED or OMITTED further down is a DEFECT of this round and must not be concluded',
    'about. Your verdict covers exactly the files this pass carries.',
    MANIFEST_END,
  )
  return lines.join('\n')
}

/**
 * The room the plan keeps free per pass for the manifest the assembly will
 * write: a deliberate over-estimate, computable BEFORE the passes exist — the
 * manifest's size is dominated by the range's path list, which every pass
 * names exactly once (carried, absent-by-design, or beyond reach). Pinned
 * against the real formatPassManifest output by the unit layer, so a manifest
 * that outgrows its allowance fails a test rather than a paid review round.
 */
export function manifestAllowance(paths = []) {
  // The manifest prints every path QUOTED (quotePassFile), where one control
  // byte expands to four characters — so the reservation is computed over the
  // quoted spelling, or a control-heavy legal path outgrows its own allowance
  // and turns a planned pass into an over-budget refusal (round-2 pass 3).
  return 1000 + (paths ?? []).reduce((sum, p) => sum + quotePassFile(String(p)).length + 96, 0)
}

/**
 * The marker for a file whose CONTENT is larger than a whole round but whose DIFF
 * is complete in the patch above it. It is not an omission and not a cut: the
 * change is fully there, the surrounding file is not, and the reviewer is told
 * exactly that instead of being left to guess which of the three it is.
 */
const patchOnlyHeader = (path) =>
  `=== FILE CONTENT NOT SENT — it is larger than one whole review round; its COMPLETE diff is in the PATCH above: ${quotePassFile(path)} ===`

/** The header of a patch-only declaration the patch does not back — an omission. */
const unbackedHeader = (path) =>
  `=== FILE OMITTED ENTIRELY (declared patch-only, but the PATCH above does not carry its complete diff): ${quotePassFile(path)} ===`

/** The header of a carried file whose diff the PATCH does not hold — an omission. */
const difflessHeader = (path) =>
  `=== FILE OMITTED ENTIRELY (its diff is not in the PATCH above, so the change itself was never delivered): ${quotePassFile(path)} ===`

/** The declared marker of a file whose bytes cannot travel as review text. */
const binaryHeader = (path) =>
  `=== FILE IS BINARY — its bytes cannot travel as review text; judge its change from the PATCH above: ${quotePassFile(path)} ===`

/**
 * Is this per-file patch section a BINARY change? git writes `Binary files …
 * differ` (ordinary diff) or `GIT binary patch` (--binary) as bare lines only
 * in binary sections; content lines always carry a +/-/space prefix, so the
 * bare form cannot be forged by reviewed text.
 */
export function isBinaryPatchSection(text) {
  for (const line of String(text ?? '').split('\n')) {
    if (line === 'GIT binary patch') return true
    if (/^Binary files .* differ$/.test(line)) return true
  }
  return false
}

/**
 * Does this binary file's patch section DELIVER its change (round-1 passes
 * 3/4)? Three shapes, licensing different answers:
 *   - `GIT binary patch` — the bytes themselves, base85: delivered.
 *   - `Binary files … differ` — a marker and NOTHING else: the content changed
 *     and none of it travelled, so a record over it would clear bytes nobody
 *     saw. NOT delivered.
 *   - neither — a metadata-only section (pure rename, mode change): the whole
 *     change IS the metadata, which the section carries whole. Delivered.
 */
export function binarySectionDeliversChange(text) {
  const lines = String(text ?? '').split('\n')
  const at = lines.indexOf('GIT binary patch')
  if (at >= 0) {
    // THE BYTES MUST ACTUALLY BE THERE (round-3 pass 5): the header alone, or
    // a `literal N` with no base85 data line after it, delivers nothing — and
    // a fixture blessing that shape as delivered would let an empty binary
    // patch clear real bytes. Delivered means: a literal/delta length line AND
    // at least one non-empty payload line following it.
    const length = lines[at + 1] ?? ''
    const payload = lines[at + 2] ?? ''
    return /^(?:literal|delta) \d+$/.test(length) && payload.trim() !== ''
  }
  return !lines.some((line) => /^Binary files .* differ$/.test(line))
}

/**
 * What a bare `out.push(header, '')` costs the joined text beyond the header
 * itself: TWO newline separators, not one. Charged as one short, a declared
 * patch-only or binary file gave the round a character back it was still
 * spending, and enough of them put a "nothing was lost" round over its ceiling.
 */
const HEADER_PAIR_COST = 2

/** The hex length of the receipt token — see the RECEIPT note in assembleMaterial. */
const RECEIPT_TOKEN_CHARS = 16

/** The material's closing line, the one place the receipt token is ever written. */
const receiptLine = (token) => `=== END OF MATERIAL — RECEIPT ${token} ===`

/**
 * What the receipt costs a round: its own line plus the newline before it.
 *
 * RESERVED BEFORE THE FILES ARE PACKED, because the receipt is written AFTER
 * them and measured INSIDE `fit`. Unreserved, a round packed to the last
 * character ended 51 characters over its ceiling and refused a record it had
 * earned — the refusal is the safe direction, but it is still a round spent on
 * material that did fit. The token's length is fixed, so the cost is exact.
 */
const RECEIPT_COST = 1 + receiptLine('0'.repeat(RECEIPT_TOKEN_CHARS)).length

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
  manifest = '',
} = {}) {
  const cap = Math.max(0, Number(budget) || 0)
  // NEVER TRIMMED (fourth cross-vendor round): a trim is a silent edit to the
  // artefact before it is accounted. A pure rename whose destination carries a
  // trailing space ends the patch in `rename to new ` — the trim ate that space
  // with the final newline, the material named a path that does not exist, and
  // `patchTruncated` stayed false because the accounting only ever saw the
  // altered text. What git handed over is what travels, byte for byte.
  const statText = String(stat)
  const patchText = String(patch)
  const statRoom = Math.floor(cap * STAT_SHARE)
  const room = Number.isFinite(Number(patchRoom)) && patchRoom !== null
    ? Math.max(0, Number(patchRoom))
    : Math.floor(cap * PATCH_SHARE)
  const skipContent = new Set((patchOnly ?? []).map((p) => String(p)))

  // THE MANIFEST TRAVELS FIRST AND IS NEVER CUT: it is the text that tells the
  // reviewer which absences are design and which would be defects, so cutting
  // it would recreate the very confusion it exists to end. Its cost is real —
  // it stands inside the measured text, so a manifest the plan did not reserve
  // room for fails `fit` below rather than slipping past the ceiling.
  const manifestText = String(manifest ?? '')
  const out = manifestText ? [manifestText, ''] : []
  out.push('=== DIFFSTAT ===', cut(statText, statRoom), '', '=== PATCH ===', cut(patchText, room), '')
  const account = {
    statTruncated: statText.length > statRoom,
    patchTruncated: patchText.length > room,
    truncated: [],
    omitted: [],
    patchOnly: [],
    binary: [],
    sent: [],
  }
  let rawSize = statText.length + patchText.length

  // The patch's own sections, read once and only where a declaration must be
  // checked against them.
  let sectionsSeen = null
  const patchSections = () => {
    if (!sectionsSeen) sectionsSeen = new Map(splitPatchByFile(patchText).map((s) => [s.path, s.text]))
    return sectionsSeen
  }

  // The receipt is written after the last file and counted in `fit`, so its room
  // is taken off BEFORE the packing rather than discovered to be missing after it.
  let left = Math.max(0, cap - out.join('\n').length - RECEIPT_COST)
  for (const file of files ?? []) {
    const path = String(file?.path ?? '?')
    const text = String(file?.text ?? '')
    rawSize += text.length
    // A BINARY FILE IS DECLARED, NEVER DROPPED OR MANGLED (fourth cross-vendor
    // round, pass 4, finding 7): an added binary used to be skipped as "the
    // patch carries it" while the ordinary diff holds only `Binary files …
    // differ` — the blob travelled nowhere and nothing recorded the loss — and
    // a modified one came back through the utf8 read as mojibake recorded
    // complete. The material now names it binary, in a header the reviewer
    // sees; the declaration is verified against the patch exactly like the
    // patch-only one, and refuses to an omission where nothing backs it.
    if (file?.binary) {
      // BACKED means the change itself travelled (round-1 passes 3/4): a
      // section holding only `Binary files … differ` delivers no byte, so the
      // declaration over it cleared content the reviewer never received — the
      // patch must carry the `GIT binary patch` bytes, or be a metadata-only
      // section whose metadata IS the whole change. An erroneous binary flag
      // on a text section degrades to patch-alone delivery, never below it.
      const section = account.patchTruncated ? undefined : patchSections().get(path)
      const backed = typeof section === 'string' && binarySectionDeliversChange(section)
      const header = binaryHeader(path)
      // `out.push(header, '')` grows the joined text by header + TWO separators,
      // so that is what the room is charged (see HEADER_PAIR_COST).
      if (!backed || left <= header.length + HEADER_PAIR_COST) {
        out.push(omittedHeader(path), '')
        account.omitted.push(path)
        continue
      }
      out.push(header, '')
      account.binary.push(path)
      left -= header.length + HEADER_PAIR_COST
      continue
    }
    // DECLARED, NOT DROPPED: the content is out by decision, the diff is in, and
    // the material says which. It costs the round only its one header line.
    if (skipContent.has(path)) {
      // THE DECLARATION IS VERIFIED, NOT TRUSTED (fourth cross-vendor round,
      // pass 2, finding 1): the header below claims the file's COMPLETE diff
      // stands in the PATCH above, and the accounting used to take the
      // caller's word for it — content withheld, fit true, record offered over
      // file content the reviewer never received. The claim is checked against
      // the patch actually assembled: a path with no section in it, or a patch
      // whose tail was cut (after which no section can be vouched complete),
      // makes the file an ordinary OMISSION, named as such — and the round is
      // then not complete, so no record is offered over it.
      if (account.patchTruncated || !patchSections().has(path)) {
        out.push(unbackedHeader(path), '')
        account.omitted.push(path)
        continue
      }
      const header = patchOnlyHeader(path)
      // THE NOTE COSTS ROOM TOO. Pushed with no room left it put the round over
      // its budget while the accounting still called it complete — several
      // declared patch-only files were enough to do it (cross-vendor review,
      // second round). With nothing left the file is an ordinary OMISSION: the
      // round is spent, and saying so is what stops the record.
      if (left <= header.length + HEADER_PAIR_COST) {
        out.push(omittedHeader(path), '')
        account.omitted.push(path)
        continue
      }
      out.push(header, '')
      account.patchOnly.push(path)
      left -= header.length + HEADER_PAIR_COST
      continue
    }
    // A CARRIED FILE'S DIFF MUST HAVE TRAVELLED TOO (sixth cross-vendor round,
    // pass 3): the "complete" delivery level claims the file's diff in the
    // PATCH and its content below, and only the second half used to be checked
    // — a caller handing content beside a patch with no section for the path
    // got the file marked `sent` and the round `fit: true`, a record offered
    // over a diff nobody received. A complete patch without a section for the
    // path proves the diff never travelled, so the file is an OMISSION, named
    // as such. (A CUT patch already refuses the round via `patchTruncated`,
    // whose refusal names the cut itself.)
    if (!account.patchTruncated && !patchSections().has(path)) {
      out.push(difflessHeader(path), '')
      account.omitted.push(path)
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

  // THE RECEIPT CLOSES THE UNREAD-STDIN RESIDUAL (fourth cross-vendor round,
  // pass 4, finding 8). `sentInput` proves the hand-off to the spawn, never
  // the read: a child can exit 0 with a parseable verdict without ever reading
  // an input smaller than the pipe buffer, and no process-layer evidence can
  // witness the read. So the material's LAST line carries a token derived from
  // the material itself, the prompt demands it back — and the prompt never
  // contains it — which makes a returned token evidence that the child read
  // the material through to its END. parseVerdict enforces the echo.
  const body = out.join('\n')
  const receipt = createHash('sha256').update(body, 'utf8').digest('hex').slice(0, RECEIPT_TOKEN_CHARS)
  const text = `${body}\n${receiptLine(receipt)}`
  return {
    ...account,
    text,
    receipt,
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
  // Sizes in BYTES: two different strings can hold the same number of UTF-16
  // code units, and a note that printed equal "characters" for unequal texts
  // read as a contradiction (cross-vendor review, fourth round).
  return {
    known: true,
    matches: false,
    note: `what was sent is ${Buffer.byteLength(sent, 'utf8')} bytes, what was assembled is ${Buffer.byteLength(assembly.text, 'utf8')}`,
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
export function materialShortfall({ assembly = null, sent = undefined, transportError = '' } = {}) {
  // THE PROCESS LAYER'S OWN REPORT OUTRANKS THE ECHO (escalation round): the
  // string a caller hands the spawn is the same string it compares against, so
  // that comparison pins the CALL SITE — a rebuilt or swapped variable — and
  // can never witness the transport itself. Where the spawn layer reported an
  // error or the run was killed mid-stream, whether the material arrived is
  // UNKNOWN, and unknown refuses.
  const err = String(transportError ?? '').trim()
  if (err) {
    return {
      reason: 'unverified',
      detail: `the hand-off did not complete: ${err}`,
      // The accounting's evidence of a cut travels into EVERY refusal shape
      // (round-1 pass 3): these branches dropped the two flags, so the loss
      // report could not name that the DIFFSTAT or the PATCH was cut even
      // though the assembly knew.
      statTruncated: Boolean(assembly?.statTruncated),
      patchTruncated: Boolean(assembly?.patchTruncated),
      truncated: assembly?.truncated ?? [],
      omitted: assembly?.omitted ?? [],
      budget: assembly?.budget ?? MATERIAL_BUDGET_CHARS,
      size: assembly?.size ?? 0,
      rawSize: assembly?.rawSize ?? 0,
    }
  }
  const seen = sentMaterialMatches(assembly, sent)
  if (!seen.known) {
    return {
      reason: 'unverified',
      detail: seen.note,
      statTruncated: Boolean(assembly?.statTruncated),
      patchTruncated: Boolean(assembly?.patchTruncated),
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
      statTruncated: Boolean(assembly.statTruncated),
      patchTruncated: Boolean(assembly.patchTruncated),
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
  // WHOLE CODE POINTS, never UTF-16 units (fourth cross-vendor round): `body[i]`
  // on an astral character is a lone surrogate, which Buffer encodes as U+FFFD —
  // a quoted `"😀,x"` parsed back as mojibake, and two distinct legal paths
  // could then collapse into one spelling in the coverage accounting.
  const wholeChar = (at) => String.fromCodePoint(body.codePointAt(at))
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      const ch = wholeChar(i)
      i += ch.length - 1
      bytes.push(...Buffer.from(ch, 'utf8'))
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
    const ch = wholeChar(i)
    i += ch.length - 1
    bytes.push(...Buffer.from(ch, 'utf8'))
  }
  // NAMED RESIDUAL: a path whose BYTES are not valid UTF-8 (git octal-escapes
  // them) cannot live in a JS string — this decode turns each bad byte into
  // U+FFFD, and DISTINCT such paths can collapse into one spelling. Closing
  // that end-to-end would mean carrying Buffers through the whole material
  // pipeline (git → files → Map keys → git show), which this string-based
  // pipeline cannot do. So every consumer REFUSES a path that decodes with
  // U+FFFD in it (undecodablePaths below; gatherRange and parsePassFiles ask) —
  // erring to refusing a record, never to granting one. The cost knowingly
  // paid: a file genuinely NAMED with U+FFFD is refused alongside, because the
  // two are indistinguishable after the decode.
  return Buffer.from(bytes).toString('utf8')
}

/**
 * The paths of a set that this pipeline CANNOT name faithfully — see the
 * residual note in unquoteGitPath. A caller that finds any must refuse the
 * round or the record rather than account coverage under a collapsed spelling.
 */
export function undecodablePaths(paths = []) {
  return (paths ?? []).map((p) => String(p ?? '')).filter((p) => p.includes('�'))
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
 * The `rename from`/`rename to` (or `copy from`/`copy to`) pair out of a
 * section's extended header lines, or null. These lines carry each path WHOLE —
 * one per line, quoted only where git quotes — so they are the one unambiguous
 * spelling of a rename the `diff --git` line cannot always give. The scan stops
 * where the extended headers do: at the first hunk or the next file.
 */
function renamePathsIn(lines) {
  let from = null
  let to = null
  for (const raw of lines ?? []) {
    const line = String(raw)
    if (line.startsWith('diff --git ') || line.startsWith('@@')) break
    const m = /^(?:rename|copy) (from|to) (.*)$/.exec(line)
    if (!m) continue
    if (m[1] === 'from') from = unquoteGitPath(m[2])
    else to = unquoteGitPath(m[2])
    if (from !== null && to !== null) return { from, to }
  }
  return null
}

/**
 * The two paths one `diff --git` header names, or null for any other line.
 *
 * The bare form is genuinely ambiguous — a path may itself contain ` b/` — and
 * the header line ALONE cannot always decide: `diff --git a/old.txt b/new
 * b/dest.txt` reads as a rename to `dest.txt` or to `new b/dest.txt` with equal
 * right (cross-vendor review, third round — the wrong reading dropped the real
 * destination's patch association and put a fictitious path in the plan). So
 * `lookahead` — the section's own following lines — is consulted first: a
 * rename or copy names both paths whole in its extended headers, and that
 * spelling outranks any guess. Without it, the split whose two halves are EQUAL
 * wins (a modification, the common case), and the last split otherwise, which
 * is what the plain regex used to do.
 */
export function parseDiffHeader(line, lookahead = []) {
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
  const named = renamePathsIn(lookahead)
  if (named) return { a: named.from, b: named.to }
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
  const sections = []
  let current = null
  for (const line of lines) {
    if (parseDiffHeader(line)) {
      if (current) sections.push(current)
      current = { header: line, lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) sections.push(current)
  // The path is read WITH the section's own lines in view: an ambiguous rename
  // header is decided by its `rename from`/`rename to` lines, never by a guess
  // over the one line (cross-vendor review, third round).
  //
  // A RENAME SECTION COVERS BOTH ITS SPELLINGS (round-2 pass 3): keeping only
  // the destination made the SOURCE path unreachable by any pass — while the
  // guard's range listing runs --no-renames and therefore expects both the
  // deleted source and the added destination, so pass records could never
  // cover the source and the composition deadlocked. The one section IS the
  // delivery of both paths, so it is emitted under each.
  return sections.flatMap((s) => {
    const header = parseDiffHeader(s.header, s.lines.slice(1))
    const text = s.lines.join('\n')
    const out = [{ path: header.b, text }]
    if (header.a && header.a !== header.b) out.push({ path: header.a, text })
    return out
  })
}

/**
 * The patch text of ONE pass: its files' sections, joined the one way the
 * assembly joins them.
 *
 * Exported because the PLAN and the ASSEMBLY must measure the SAME string, and
 * they did not. The plan SUMMED the section lengths; the assembly JOINED them
 * with newlines. For a pass whose patch exceeds the standing half-share —
 * exactly where `patchRoom` becomes the measured length itself — the assembled
 * patch was then (n-1) characters over its own room and came back
 * `patchTruncated`. That is not a cosmetic overrun: a truncated patch can vouch
 * for no section's completeness, so every declared patch-only file in the pass
 * became an UNBACKED OMISSION and the record was refused.
 *
 * MEASURED on the 109-commit range this point was written for (ae8539d2~1..main,
 * 48 files): pass 1 of 10 overran by SIX characters, and lost its three biggest
 * bookkeeping files that way. Nine passes offered a record, one could not, and
 * the union therefore never covered the range — the deadlock this point exists
 * to clear, surviving inside the mechanism built to clear it.
 */
export function joinPatchSections(paths = [], sections = new Map()) {
  // DEDUPED BY SECTION (round-2 pass 3): a rename's one section sits under
  // both its spellings, and a pass naming both must carry it once, not twice.
  const seen = new Set()
  const out = []
  for (const p of paths ?? []) {
    const text = sections.get(p)
    if (text === undefined || text === null || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out.join('\n')
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
  // Untrimmed, exactly as assembleMaterial reads it: the plan and the assembly
  // must measure the SAME bytes, or the plan clears what the assembly refuses.
  const statText = String(stat)
  const sections = new Map(splitPatchByFile(patch).map((s) => [s.path, s.text]))
  // A DIFFSTAT OVER ITS SHARE FAILS THE PLAN, exactly as it fails the assembly
  // (fourth cross-vendor round): Math.min silently assumed the cut, so a range
  // whose stat overflowed could plan as one fitting pass while assembleMaterial
  // marked that same round statTruncated — and the plan-only hand-off paths,
  // which never assemble, then offered a whole-range record for material that
  // cannot fit. Every pass carries the whole stat for context, so no pass of
  // such a range can assemble complete either; the plan says so.
  const statRoom = Math.floor(cap * STAT_SHARE)
  const statTruncated = statText.length > statRoom
  const statCost = Math.min(statText.length, statRoom)
  const baseRoom = Math.max(0, cap - statCost - PASS_RESERVE)

  // Every path the range touched: the ones with content, plus the ones the patch
  // knows about and the content list does not (a deleted file has no content).
  const entries = []
  const seen = new Set()
  for (const file of files ?? []) {
    const path = String(file?.path ?? '?')
    seen.add(path)
    entries.push({
      path,
      content: String(file?.text ?? ''),
      patchText: sections.get(path) ?? '',
      // A binary file travels as its declared marker (assembleMaterial), so it
      // costs a pass its header and patch section, never content.
      binary: Boolean(file?.binary),
    })
  }
  for (const [path, text] of sections) {
    // A SECTION-ONLY PATH KEEPS ITS BINARY CLASSIFICATION (round-3 pass 4): a
    // deleted binary arrives here with no content entry to carry the caller's
    // flag, and reading it as text let a bare `Binary files … differ` marker
    // pack as deliverable while a GIT binary patch missed its declared line.
    if (!seen.has(path)) entries.push({ path, content: '', patchText: text, binary: isBinaryPatchSection(text) })
  }
  let rawSize = statText.length
  for (const entry of entries) rawSize += entry.patchText.length + entry.content.length

  const pack = (room) => {
    const passes = []
    const uncoverable = []
    let current = null
    for (const entry of entries) {
      const frame = FILE_FRAME_CHARS + fileHeader(entry.path).length
      const patchLen = entry.patchText.length
      // A PASS MAY ONLY PROMISE WHAT THE ASSEMBLY WOULD DELIVER (round-2 pass
      // 3): a carried path with no patch section is an omission the assembly
      // refuses, and a binary declaration whose section carries no change (the
      // bare 'Binary files … differ' marker, or no section at all) is refused
      // the same way — so a plan that packed either certified material the
      // round could never send, and the plan-only hand-off paths offered a
      // record over an undelivered change. Both are named beyond reach.
      const undeliverable = entry.binary
        ? patchLen === 0 || !binarySectionDeliversChange(entry.patchText)
        : patchLen === 0
      if (undeliverable || frame + patchLen > room) {
        uncoverable.push({ path: entry.path, patchChars: patchLen, contentChars: entry.content.length })
        continue
      }
      const whole = frame + patchLen + entry.content.length
      const patchOnly = !entry.binary && whole > room
      const cost = patchOnly || entry.binary ? frame + patchLen : whole
      if (!current || current.size + cost > room) {
        current = { files: [], patchOnly: [], binary: [], patchChars: 0, size: 0 }
        passes.push(current)
      }
      current.files.push(entry.path)
      if (patchOnly) current.patchOnly.push(entry.path)
      if (entry.binary) current.binary.push(entry.path)
      current.patchChars += patchLen
      current.size += cost
    }
    return { passes, uncoverable }
  }

  // PACKED TWICE WHERE IT SPLITS (structural finding, fourth cross-vendor
  // round): a single fitting round carries no manifest, so the first packing
  // uses the whole room — and only a range that genuinely splits is re-packed
  // with the manifest's reservation taken off, because every pass of a split
  // must then carry its own shape declaration inside the budget.
  let room = baseRoom
  let { passes, uncoverable } = pack(room)
  if (passes.length > 1 || uncoverable.length > 0) {
    room = Math.max(0, baseRoom - manifestAllowance(entries.map((e) => e.path)))
    ;({ passes, uncoverable } = pack(room))
  }

  const total = passes.length
  return {
    budget: cap,
    room,
    rawSize,
    statTruncated,
    // ONE pass, nothing beyond reach and a stat inside its share is the
    // ordinary case: the range fits — the same claim the assembly will make.
    fits: total <= 1 && uncoverable.length === 0 && !statTruncated,
    passes: passes.map((p, i) => ({
      index: i + 1,
      total,
      files: p.files,
      patchOnly: p.patchOnly,
      binary: p.binary,
      size: p.size,
      // The patch of a pass is MANDATORY material, so it gets whatever room it
      // needs rather than the standing half-share — the packing above already
      // proved the whole pass fits. Measured as the EXACT string the assembly
      // will send (joinPatchSections), never as the sum of its parts: the
      // newlines between the sections are characters too, and a room that
      // forgot them truncated the patch it had just sized.
      patchRoom: Math.max(Math.floor(cap * PATCH_SHARE), joinPatchSections(p.files, sections).length),
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
  if (plan.fits) {
    // A round that fits only at a DECLARED delivery level says so: the caller
    // deciding whether this review suffices must know which content stays out.
    const declared = plan.passes?.[0]?.patchOnly ?? []
    return declared.length
      ? `${head}\n  It fits in one round, with ${declared.length} file(s) travelling as their diff alone` +
          ` (content larger than a round): ${declared.map((p) => quotePassFile(p)).join(', ')}.`
      : `${head}\n  It fits in one round.`
  }
  if (plan.statTruncated) {
    return [
      head,
      '  The DIFFSTAT ALONE exceeds its share of a round, and every pass carries the whole',
      '  diffstat — no pass of this range can assemble complete. Review a NARROWER range.',
    ].join('\n')
  }
  const lines = [
    head,
    `  IT DOES NOT FIT, so ${at || 'this range'} is reviewed in ${plan.passes.length} PASSES over the FILE SET`,
    '  (splitting by COMMIT does not help: every commit ships the current content of the files it',
    '  touches, so the same files overflow one commit at a time and cost a round each).',
  ]
  // Structural path lists spell every name through quotePassFile (round-2
  // pass 3): a legal path holding a newline or comma could otherwise forge a
  // line or make the printed pass membership ambiguous.
  //
  // A SPLIT OF ONE CANNOT BE RECORDED (round-3 pass 4): a plan that packs one
  // coverable pass beside files beyond reach would advertise `--pass 1` of a
  // total the recorder refuses (a pass record needs a total of at least 2 — a
  // pass of one IS a whole range). No runnable command is printed for it.
  const recordable = plan.passes.length >= 2
  for (const pass of plan.passes) {
    lines.push(
      `    pass ${pass.index}/${pass.total}  ${pass.files.length} file(s), ~${pass.size} characters` +
        (pass.patchOnly.length ? `  [diff only: ${pass.patchOnly.map((p) => quotePassFile(p)).join(', ')}]` : ''),
      `      ${pass.files.map((p) => quotePassFile(p)).join(', ')}`,
    )
    if (recordable) {
      lines.push(`      ${command} --sha ${at || '<sha>'} --brief "<what to judge>" --pass ${pass.index}`)
    }
  }
  if (!recordable) {
    lines.push(
      '  This range packs into ONE coverable pass beside what is beyond reach, and a split of',
      '  one cannot be recorded as passes. No record can cover this range: narrow the range,',
      '  or split the change itself.',
    )
  }
  if (plan.uncoverable.length) {
    lines.push(
      '  BEYOND REACH — no round can hold these, not even their diff alone:',
      ...plan.uncoverable.map((u) => `    ${quotePassFile(u.path)} (diff ${u.patchChars}, content ${u.contentChars} characters)`),
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
    statTruncated: Boolean(plan.statTruncated),
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
  for (const path of shortfall.truncated ?? []) lines.push(`  · TRUNCATED: ${quotePassFile(path)}`)
  for (const path of shortfall.omitted ?? []) lines.push(`  · OMITTED ENTIRELY: ${quotePassFile(path)}`)
  return lines
}

/** The passes the caller is sent to instead, from the plan or from the shortfall. */
function passLines(shortfall, plan) {
  const passes = plan && !plan.fits ? plan.passes : (shortfall.passes ?? [])
  const lines = passes.map(
    (pass) => `    --pass ${pass.index}   ${(pass.files ?? []).map((p) => quotePassFile(p)).join(', ')}`,
  )
  const beyond = plan && !plan.fits ? plan.uncoverable : (shortfall.uncoverable ?? [])
  if (beyond?.length) {
    lines.push(
      '  BEYOND REACH — no pass can hold these, not even their diff alone, so no record may',
      '  name them at all:',
      ...beyond.map((u) => `    ${quotePassFile(u.path)} (diff ${u.patchChars}, content ${u.contentChars} characters)`),
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
    )
    // NO PASS CAN CARRY AN OVERSIZED DIFFSTAT EITHER — every pass ships the
    // whole range's stat for context, so sending the caller to the passes
    // would only move the refusal to the assembly, one paid round later.
    if (shortfall.statTruncated) {
      lines.push(
        `  The DIFFSTAT ALONE exceeds the share of a round it may take (${Math.floor((shortfall.budget ?? 0) * STAT_SHARE)}`,
        '  characters), and every pass carries the whole diffstat — so no pass of this range can',
        '  assemble complete either. No record can be offered in any shape here: review a',
        '  NARROWER range whose diffstat fits.',
      )
      return lines.join('\n')
    }
    lines.push(
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

/**
 * ONE representation for a git path on the `--pass-files` command line, chosen
 * because the comma is the list separator and a LEGAL git path may contain a
 * comma, a quote, or leading/trailing whitespace (cross-vendor review, third
 * round — the old `.split(',').map(trim)` could not round-trip such a path, and
 * `x` and ` x` COLLAPSED into one entry, so a union could look complete without
 * covering both). A path that needs it travels C-QUOTED, exactly as git prints
 * it — the same convention unquoteGitPath already decodes — and everything else
 * travels byte-exact, never trimmed.
 */
const needsQuoting = (path) => {
  const p = String(path)
  if (/^\s|\s$/.test(p)) return true
  // Tested by CODE POINT rather than by a regex character class: naming the
  // control range in a class makes the file either BINARY to grep (a literal
  // NUL) or a no-control-regex lint finding (an escaped one). This says the
  // same thing in plain ASCII — the list separator, the quote, the escape,
  // and anything git itself would escape.
  for (const ch of p) {
    const code = ch.codePointAt(0)
    if (ch === ',' || ch === '"' || ch === '\\' || code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** One path, C-quoted the way git would print it. */
export function quotePassFile(path) {
  const p = String(path ?? '')
  if (!needsQuoting(p)) return p
  let out = '"'
  for (const ch of p) {
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch < ' ' || ch === '') {
      for (const byte of Buffer.from(ch, 'utf8')) out += `\\${byte.toString(8).padStart(3, '0')}`
    } else out += ch
  }
  return `${out}"`
}

/** The `--pass-files` value for a file list — the writer half of the round trip. */
export function formatPassFiles(files = []) {
  return (files ?? []).map(quotePassFile).join(',')
}

/**
 * The `--pass-files` value, as a list of paths — { ok, files, errors }.
 *
 * FAIL LOUD, NEVER COLLAPSE: a bare token with leading or trailing whitespace
 * is refused by name rather than trimmed, because trimming is how ` x` and `x`
 * became one entry — the caller either meant the plain path (drop the space) or
 * the real one (write it C-quoted). A quote that never closes, or a closed one
 * followed by anything but the separator, is refused the same way.
 */
export function parsePassFiles(value) {
  const raw = String(value ?? '')
  const files = []
  const errors = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === ',') {
      i++
      continue
    }
    if (raw[i] === '"') {
      const read = readQuoted(raw, i)
      if (!read) {
        errors.push(`--pass-files: the quote opened at position ${i} never closes — "${raw.slice(i, i + 30)}…"`)
        break
      }
      files.push(read.value)
      if (read.end < raw.length && raw[read.end] !== ',') {
        errors.push(
          `--pass-files: a quoted path must end at a comma, not at "${raw.slice(read.end, read.end + 10)}"`,
        )
        break
      }
      i = read.end
      continue
    }
    const next = raw.indexOf(',', i)
    const token = next < 0 ? raw.slice(i) : raw.slice(i, next)
    i = next < 0 ? raw.length : next
    if (!token.trim()) continue
    if (token !== token.trim()) {
      errors.push(
        `--pass-files: "${token}" carries leading/trailing whitespace — trimming it would collapse two ` +
          'legal paths into one, so either drop the space or write the path C-quoted ("…") as git prints it',
      )
      continue
    }
    files.push(token)
  }
  // A path that decodes with U+FFFD is one this pipeline cannot tell apart
  // from its neighbours (see unquoteGitPath): recording coverage under it
  // could clear a different real file, so it is refused by name.
  for (const path of undecodablePaths(files)) {
    errors.push(
      `--pass-files: "${path}" contains U+FFFD, so it cannot name one file faithfully — a path whose ` +
        'bytes are not valid UTF-8 cannot be carried here; review that file by another means',
    )
  }
  return { ok: errors.length === 0, files, errors }
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
 * `2/2` and cleared a range nobody read.
 *
 * UNKNOWN COVERAGE REFUSES (sixth cross-vendor round, pass 3): a caller with
 * nothing to compare against used to get the count alone, so two records with
 * empty or arbitrary file lists cleared a `2/2` composition over a range whose
 * real file set nobody had established. A composition is now complete ONLY
 * against a known, non-empty expected set; without one, every group carries
 * `coverageUnknown: true` and `complete: false` — the fail-open direction the
 * point demands, because a range with review passes always changed files.
 */
export function passComposition(records = [], { expect = null } = {}) {
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
  // BYTE-EXACT, NEVER TRIMMED (cross-vendor review, third round): `x` and ` x`
  // are two legal paths, and trimming the expected set collapsed them into one
  // entry — a union could then look complete without covering both.
  const wanted = [...new Set((Array.isArray(expect) ? expect : []).map((p) => String(p ?? '')).filter(Boolean))]
  // Known coverage is a NON-EMPTY expected set: a range under review always
  // changed files, so an empty one is a caller that could not say — unknown.
  const expectKnown = wanted.length > 0
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
      coverageUnknown: !expectKnown,
      complete: expectKnown && missing.length === 0 && uncovered.length === 0,
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
