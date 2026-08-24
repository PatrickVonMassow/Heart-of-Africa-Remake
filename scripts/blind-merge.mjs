// The command that MERGES a blind-parallel four-eyes stage — cheaply, and then
// countably (point 634).
//
//   node scripts/blind-merge.mjs --a <A.json> --b <B.json>
//       what the merging model has to decide: the identical pairs (collapsed for
//       free) and the CANDIDATE pairs, plus the union skeleton to fill in
//
//   node scripts/blind-merge.mjs --a <A.json> --b <B.json> --union <U.json> \
//       --merged-by "<model>" [--fallback "<why only two models>"]
//       the COUNT: every entry of both lists is `only A`, `only B` or
//       `merged with <id>`, or this exits 1 naming the entries that vanished
//
// Input list, as either model hands it back — the line form the review prompt
// asks for, `B1 | src/x.ts | one line saying what is wrong`, or the same as JSON
// (a bare array of entries is accepted too):
//   { "model": "GPT-5.6 Sol", "entries": [ { "id": "B1", "file": "src/x.ts",
//     "defect": "one line saying what is wrong" } ] }
// Union, as the THIRD model writes it — `from` names the input entries each
// union entry stands for, and the three dispositions follow from it:
//   { "mergedBy": "Fable 5", "entries": [ { "id": "U1", "from": ["A3", "B1"] } ] }
//
// The decision logic is pure (blind-merge-core.mjs); this file reads files,
// prints and sets the exit code. It fails LOUD — it is a command, not a hook.
import { readFileSync } from 'node:fs'
import { isMainModule } from './is-main.mjs'
import { currentFableState } from './fable-switch.mjs'
import { mergeFallbackReason, mergePromptFraming, mergerModel } from './fable-switch-core.mjs'
import { isTrackedInGit } from './git-tracked.mjs'
import { sameModel } from './mechanism-review-core.mjs'
import { checkAuthorshipFile } from './authorship-check-io.mjs'
import { authorshipRefusesPermission, formatAuthorship } from './authorship-check-core.mjs'
import {
  accountUnion,
  candidatePairs,
  exactDuplicates,
  formatAccounting,
  parseListText,
  summaryLine,
  validateInputs,
  validateMerger,
} from './blind-merge-core.mjs'

/** Read one file, naming it in any complaint about it. */
export function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`cannot read ${path}: ${(e && e.message) || e}`)
  }
}

/** Read the union, which is JSON — it is written by a model that was asked for JSON. */
export function readJson(path) {
  const text = readText(path)
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e && e.message) || e}`)
  }
}

/** Every flag this command accepts, and whether it takes a value. */
export const FLAG_SPEC = Object.freeze({
  '--a': true,
  '--b': true,
  '--union': true,
  '--merged-by': true,
  '--fallback': true,
  // WHO WROTE EACH LIST. A JSON list can carry its own "model"; the line form
  // cannot, and without both names the merger cannot be checked against them —
  // an author would pass as the third model (four-eyes review, second round).
  '--model-a': true,
  '--model-b': true,
  // ORIGIN EVIDENCE for those two claims. A tracked JSON half may carry the
  // same values under `authorship.{at,transcript}`; explicit flags win.
  '--author-at-a': true,
  '--author-at-b': true,
  '--author-transcript-a': true,
  '--author-transcript-b': true,
})

/** Parse argv into { ok, values, errors } — an unknown flag is refused, never dropped. */
export function parseArgs(argv = []) {
  const args = (Array.isArray(argv) ? argv : []).map((a) => String(a))
  const values = {}
  const errors = []
  for (let i = 0; i < args.length; i++) {
    const name = args[i]
    if (!Object.hasOwn(FLAG_SPEC, name)) {
      errors.push(`unknown argument "${name}"`)
      continue
    }
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) {
      errors.push(`${name} expects a value`)
      continue
    }
    values[name.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value
    i++
  }
  if (!values.a || !values.b) errors.push('--a and --b name the two lists the blind-parallel stage produced')
  return { ok: errors.length === 0, values, errors }
}

export const usage = () =>
  'usage: node scripts/blind-merge.mjs --a <A> --b <B>                      (what to decide)\n' +
  '       node scripts/blind-merge.mjs --a <A> --b <B> --union <U.json> \\\n' +
  '           [--merged-by "<switch-selected model>"] [--model-a "<model>"] [--model-b "<model>"] \\\n' +
  '           [--author-at-a <ISO> --author-transcript-a <session.jsonl>] \\\n' +
  '           [--author-at-b <ISO> --author-transcript-b <session.jsonl>] \\\n' +
  '           [--fallback "<switch-generated reason>"]                     (the count)\n' +
  '\nThe merge of a blind-parallel stage goes to the model that wrote NEITHER list\n' +
  '(CLAUDE.md §6), selected by node scripts/fable-switch.mjs --status. A balanced run prints the mechanism-review.mjs command to record,\n' +
  'including the --accounting line, which is the receipt that nothing was dropped.'

if (isMainModule(import.meta.url)) {
  try {
    const parsed = parseArgs(process.argv.slice(2))
    if (!parsed.ok) {
      console.error('blind-merge: refusing this command line.\n')
      for (const e of parsed.errors) console.error(`  · ${e}`)
      console.error(`\n${usage()}`)
      process.exit(2)
    }
    const {
      a: pathA,
      b: pathB,
      union: pathU,
      mergedBy = '',
      fallback = '',
      modelA = '',
      modelB = '',
      authorAtA = '',
      authorAtB = '',
      authorTranscriptA = '',
      authorTranscriptB = '',
    } = parsed.values
    const fableState = currentFableState()
    if (!fableState.ok) throw new Error(fableState.problem)
    const rawA = readText(pathA)
    const rawB = readText(pathB)
    const a = parseListText('A', rawA)
    const b = parseListText('B', rawB)
    // A TRACKED HALF NAMES ITS OWN AUTHOR AND THE FLAG MAY NOT OVERRULE IT. The flag
    // exists for the line form, which carries no model field; letting it rewrite a
    // tracked file's author would hand back exactly the hole the tracked check closes
    // — point at the real half, then rename its author (four-eyes review, point 834).
    // THE BYTES PARSED ABOVE ARE THE ONES THAT MUST BE COMMITTED, so they are
    // what the check is asked about — not a second read that could differ from
    // it (cross-vendor review of point 889).
    const trackedA = isTrackedInGit(pathA, { content: rawA })
    const trackedB = isTrackedInGit(pathB, { content: rawB })
    const overruled = []
    /** Which halves carry their author IN THE COMMITTED FILE — the only form the
     *  count below may believe; a flag is a claim wearing whatever name the
     *  caller typed. */
    const modelFromFile = { A: false, B: false }
    for (const [name, list, flag, tracked] of [
      ['a', a, modelA, trackedA],
      ['b', b, modelB, trackedB],
    ]) {
      const stated = String(list.model ?? '').trim()
      modelFromFile[name.toUpperCase()] = tracked && Boolean(stated)
      if (flag && tracked && stated && !sameModel(flag, stated)) {
        overruled.push(
          `--model-${name} "${flag}" contradicts the tracked half, which says "${stated}" — ` +
            'a tracked half names its own author and the flag cannot rename it',
        )
      } else if (flag && !(tracked && stated)) {
        // A family-equivalent flag may not overwrite the committed spelling
        // either: sameModel treats a versionless "Sol" as every Sol, so writing
        // "GPT-6 Sol" over a committed "Sol" would shift which exact model the
        // merger is checked against (cross-vendor re-review of point 889). The
        // committed bytes stand; the flag only fills silence.
        list.model = flag
      }
    }
    if (overruled.length) {
      console.error('blind-merge: refusing to rename a tracked half\'s author.\n')
      for (const e of overruled) console.error(`  · ${e}`)
      process.exit(1)
    }
    // AFTER the authors are known, never before: the merger is the model that wrote
    // NEITHER half. ONLY TRACKED HALVES DECIDE — an untracked path is
    // caller-written, so its author field settles nothing — but each tracked
    // half decides ON ITS OWN: a known author EXCLUDES that model from the
    // merge even when the sibling half is untracked. Requiring BOTH to be
    // tracked discarded the one authorship that WAS known, and with one
    // tracked half written by the switch-selected model the merge went to
    // that very author under a printed "it wrote neither half".
    // ONE SLOT PER HALF, BLANK WHERE THE AUTHOR IS UNKNOWN. The blanks carry the
    // shape of the question and may not be dropped before it is asked: a filtered
    // list of two unknown halves is an EMPTY array, which mergePromptFraming reads
    // as "this caller does not supply authors at all" — the older switch-only
    // reading — and with Fable ON that returned no framing for the case where the
    // merger's own half is most likely among the unknowns (cross-vendor review of
    // point 889). mergerModel ignores blank slots on its own.
    // A slot is filled ONLY from a committed model field: tracking alone let a
    // --model flag on a tracked line-form half — a claim — steer the selection
    // and suppress the framing (re-review round 4).
    const slots = [
      modelFromFile.A ? String(a.model ?? '').trim() : '',
      modelFromFile.B ? String(b.model ?? '').trim() : '',
    ]
    const deciding = slots.filter(Boolean)
    const bothKnown = deciding.length === 2
    const expectedMerger = mergerModel(fableState, deciding)
    // WHETHER THE SELECTION IS A THIRD MODEL OR THE FALLBACK, because the two owe
    // opposite sentences. Where every roster model wrote a half, selection keeps the
    // switch's answer and that model DID write one — saying "it wrote neither half"
    // there states a false condition instead of naming the recorded fallback
    // (four-eyes finding 3 on this change). With PARTIAL knowledge the merger
    // provably wrote no KNOWN half, and "wrote neither half" is exactly what
    // an untracked half cannot prove — the sentence says so instead.
    // WHETHER A CLAIMED AUTHOR IS THE MERGER — the same question validateMerger
    // asks below, asked of the same names, so the printed sentence and the
    // recorded fallback cannot disagree with the verdict. A claim is weaker
    // evidence than a tracked half, which is why it may not SELECT the merger;
    // for the opposite direction it is conservative to believe it, because
    // believing it records a fallback where refusing it would hide one.
    //
    // What it is NOT is a fact about the switch. The partial-knowledge branch
    // used to read "or Fable is off" as "the merger wrote a half", so with one
    // half unnamed and Fable OFF the command printed "it wrote a half itself"
    // and attached a two-model fallback to a merger that no author, known or
    // claimed, matches (cross-vendor review of point 889).
    const claimedAuthors = [a.model, b.model].map((m) => String(m ?? '').trim()).filter(Boolean)
    const mergerWroteAHalf = claimedAuthors.some((author) => sameModel(expectedMerger, author))
    const mergerBecause = mergerWroteAHalf
      ? 'it wrote a half itself — the recorded two-model fallback'
      : bothKnown
        ? 'it wrote neither half'
        : 'it wrote no KNOWN half — an untracked half has no provable author, so this is the switch reading, not proof'

    const authorship = {
      A: checkAuthorshipFile({
        claimedModel: a.model,
        artefactAt: authorAtA || a.authoredAt,
        transcriptPath: authorTranscriptA || a.transcript,
      }),
      B: checkAuthorshipFile({
        claimedModel: b.model,
        artefactAt: authorAtB || b.authoredAt,
        transcriptPath: authorTranscriptB || b.transcript,
      }),
    }

    // A list that cannot be counted is refused BEFORE the merge, not after: a
    // missing or repeated ID makes every number below meaningless.
    const inputs = validateInputs(a, b)
    if (!inputs.ok) {
      console.error('blind-merge: these lists cannot be accounted for.\n')
      for (const e of inputs.errors) console.error(`  · ${e}`)
      process.exit(1)
    }

    for (const name of ['A', 'B']) console.log(formatAuthorship(authorship[name], `list ${name} authorship`))
    const contradictions = Object.entries(authorship).filter(([, result]) => authorshipRefusesPermission(result))
    if (contradictions.length) {
      console.error('\nblind-merge: refusing four-eyes permission because claimed authorship contradicts the session transcript.')
      for (const [name, result] of contradictions) console.error(`  \u2717 ${formatAuthorship(result, `list ${name}`)}`)
      process.exit(1)
    }

    if (!pathU) {
      const identical = exactDuplicates(a, b)
      const candidates = candidatePairs(a, b)
      console.log(
        `A: ${a.entries.length} entries${a.model ? ` (${a.model})` : ''}  ` +
          `B: ${b.entries.length} entries${b.model ? ` (${b.model})` : ''}`,
      )
      console.log(`\nidentical, collapsed for free — no decision needed (${identical.length}):`)
      for (const p of identical) console.log(`  ${p.a} = ${p.b}`)
      console.log(`\nCANDIDATE PAIRS — the only thing the merging model decides (${candidates.length}):`)
      for (const p of candidates) {
        const x = a.entries.find((e) => e.id === p.a)
        const y = b.entries.find((e) => e.id === p.b)
        console.log(
          `  ${p.a} ↔ ${p.b}  (${p.sameFile ? 'same file' : `similarity ${p.similarity}`})\n` +
            `      ${p.a}: ${x?.file ?? ''} — ${x?.defect ?? ''}\n` +
            `      ${p.b}: ${y?.file ?? ''} — ${y?.defect ?? ''}`,
        )
      }
      console.log(`\nMERGING MODEL — ${expectedMerger} (${mergerBecause}; node scripts/fable-switch.mjs --status)`)
      const framing = mergePromptFraming(fableState, slots)
      if (framing) console.log(`\n${framing}`)
      console.log(
        '\nThese pairs are a RANKING, not the merge: read BOTH lists in full and pair anything\n' +
          'that means the same, whether it is listed above or not — the ranking only saves you\n' +
          'the obvious ones. Write the union as { "mergedBy": "<model>", "entries": [ { "id":\n' +
          '"U1", "from": ["A1","B2"], "defect": "what the merged finding is" } ] } — one entry\n' +
          'per finding KEPT, `from` naming the input entries it stands for, and a `defect` line\n' +
          'on every fold — then check it with --union.',
      )
      process.exit(0)
    }

    // THE COUNT IS ONLY RECORDABLE FROM TRACKED HALVES (cross-vendor re-review
    // of point 889): the union form is the step whose printed record command
    // feeds the ledger, and validateMerger below judges the merger against
    // a.model and b.model. For an untracked half those names are the CALLER'S
    // CLAIM — `--model-b "Fable 5"` on a half Sol actually wrote clears Sol as
    // merger with no fallback recorded. The prompt form keeps working with
    // claims (plus the owed framing); the count refuses them, exactly as
    // mechanism-review.mjs refuses to record a fold whose halves it cannot
    // prove. README.md's filing rule makes this the normal order anyway: the
    // halves are committed before the union is counted.
    const rawUText = readText(pathU)
    const trackedU = isTrackedInGit(pathU, { content: rawUText })
    const unproven = [
      ['A', pathA, trackedA],
      ['B', pathB, trackedB],
    ].filter(([name, , tracked]) => !tracked || !modelFromFile[name])
    if (unproven.length) {
      console.error('blind-merge: the count decides who may merge, so it reads only PROVEN halves.\n')
      for (const [name, path, tracked] of unproven) {
        console.error(
          !tracked
            ? `  ✗ list ${name} (${path}) is not a tracked, clean repository artefact — its author ` +
                'field is whatever the caller wrote, and the merger may not be judged against a claim'
            : `  ✗ list ${name} (${path}) is tracked but carries no model field of its own — ` +
                'a --model flag is a claim, and the merger may not be judged against a claim',
        )
      }
      console.error(
        '\nFile both halves under docs/four-eyes/ — JSON, each with its model field, in the same commit ' +
          'as the union (docs/four-eyes/README.md) — then count.',
      )
      process.exit(1)
    }
    if (!trackedU) {
      // The union is the record's third artefact: uncommitted, the exact folded
      // result can change or vanish after a green count, and the ledger row the
      // printed command writes could never be re-derived (cross-vendor
      // re-review of point 889 — the same-commit filing rule, enforced where
      // the record is produced).
      console.error(
        `blind-merge: the union (${pathU}) is not a tracked, clean repository artefact — ` +
          'file it in the same commit as the halves (docs/four-eyes/README.md), then count.',
      )
      process.exit(1)
    }
    const rawU = JSON.parse(rawUText)
    // The union may name its own merger; the flag wins, and whichever is used is
    // the one validated AND the one printed below (four-eyes review: the printed
    // record command used to echo an empty --merged-by for the union-only form).
    const unionMergedBy = Array.isArray(rawU) ? '' : String(rawU?.mergedBy ?? '').trim()
    if (mergedBy && unionMergedBy && !sameModel(mergedBy, unionMergedBy)) {
      // The committed union names its own merger; a flag naming another model is
      // either a typo or an attempt to write a ledger command that contradicts
      // the artefact it points at (re-review round 4). Both are refused.
      console.error(
        `blind-merge: --merged-by "${mergedBy}" contradicts the committed union, which says ` +
          `"${unionMergedBy}" merged it — the union names its own merger and the flag cannot rename it.`,
      )
      process.exit(1)
    }
    if (!unionMergedBy) {
      // A union that names no owner cannot corroborate any fold; the verification
      // path refuses such a row, so the count refuses to print its command.
      console.error(
        `blind-merge: the union (${pathU}) names no "mergedBy" — the committed union must say who ` +
          'folded it, or the record it feeds could never be re-derived.',
      )
      process.exit(1)
    }
    // THE ARTEFACT IS AUTHORITATIVE: the committed union's spelling is what is
    // judged, and the flag is only a cross-check against it. Preferring the
    // flag let a family-wide name bridge two different models — committed
    // "GPT-6 Sol" plus "--merged-by Sol" passed both comparisons while the
    // record then named the current Sol (re-review round 5).
    const declared = unionMergedBy || mergedBy
    const switchFallback = mergerWroteAHalf ? mergeFallbackReason(fableState) : ''
    const mergerReason = fallback || switchFallback
    const merger = validateMerger({ mergedBy: expectedMerger, authors: [a.model, b.model], fallback: mergerReason })
    if (declared && !sameModel(declared, expectedMerger)) {
      merger.ok = false
      merger.errors.push(
        `merger "${declared}" is not the one this stage owes: ${expectedMerger} owns this merge, ` +
          `${mergerBecause} (node scripts/fable-switch.mjs --status)`,
      )
    }
    if (fallback && fallback !== switchFallback) {
      merger.ok = false
      merger.errors.push('the stated fallback contradicts the reason generated by the Fable switch')
    }
    // AN UNNAMED LIST AUTHOR CANNOT BE COMPARED TO THE MERGER, so it is asked for
    // rather than assumed: without it, the author of that list passes as the
    // third model and the identity rule quietly does nothing.
    for (const [name, list] of [
      ['A', a],
      ['B', b],
    ]) {
      if (!String(list.model ?? '').trim()) {
        merger.ok = false
        merger.errors.push(
          `list ${name} names no model: say who wrote it with --model-${name.toLowerCase()} "<model>" ` +
            '(or a "model" field in its JSON) — the merger is checked against both authors, and an ' +
            'unnamed author is one nobody can rule out',
        )
      }
    }
    const result = accountUnion({ a, b, union: rawU })
    console.log(formatAccounting(result))
    if (!merger.ok) {
      console.error('')
      for (const e of merger.errors) console.error(`  ✗ ${e}`)
    } else if (merger.fallback) {
      console.log(`\nrecorded as a WEAKER TWO-MODEL fallback: ${mergerReason}`)
    }
    if (!result.ok || !merger.ok) process.exit(1)
    const reviewerAt = authorAtB || b.authoredAt
    const reviewerTranscript = authorTranscriptB || b.transcript
    console.log(
      `\nrecord it: node scripts/mechanism-review.mjs --record <sha> --model "<the second model>" \\\n` +
        `${reviewerAt ? `    --model-at "${reviewerAt}"` : ''}` +
        `${reviewerTranscript ? ` --model-transcript "${reviewerTranscript}"` : ''}` +
        `${reviewerAt || reviewerTranscript ? ' \\\n' : ''}` +
        `    --verdict merge --mode blind-parallel --merged-by "${expectedMerger}"` +
        `${merger.fallback ? ` --merge-fallback "${mergerReason}"` : ''} \\\n` +
        // THE THREE FILES TRAVEL INTO THE RECORD: without them the recorder
        // falls back to the trailer proxy and the ledger row binds to nothing
        // (cross-vendor re-review of point 889).
        `    --union "${pathU}" --list-a "${pathA}" --list-b "${pathB}" \\\n` +
        `    --accounting "${summaryLine(result)}" --evidence "<what the stage found>"`,
    )
    process.exit(0)
  } catch (e) {
    console.error(`blind-merge failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
