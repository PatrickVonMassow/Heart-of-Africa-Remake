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
// Input list, as either model hands it back (a bare array of entries is accepted
// too):
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
import {
  accountUnion,
  candidatePairs,
  exactDuplicates,
  formatAccounting,
  readList,
  summaryLine,
  validateInputs,
  validateMerger,
} from './blind-merge-core.mjs'

/** Read one JSON file, naming the file in any complaint about it. */
export function readJson(path) {
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`cannot read ${path}: ${(e && e.message) || e}`)
  }
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
  'usage: node scripts/blind-merge.mjs --a <A.json> --b <B.json>            (what to decide)\n' +
  '       node scripts/blind-merge.mjs --a <A.json> --b <B.json> --union <U.json> \\\n' +
  '           --merged-by "<model>" [--fallback "<why only two models>"]  (the count)\n' +
  '\nThe merge of a blind-parallel stage goes to the model that wrote NEITHER list\n' +
  '(CLAUDE.md §6). Record the result with:\n' +
  '       node scripts/mechanism-review.mjs --record <sha> --model <name> --verdict <v> \\\n' +
  '           --mode blind-parallel --merged-by "<model>" --evidence "<the summary line>"'

if (isMainModule(import.meta.url)) {
  try {
    const parsed = parseArgs(process.argv.slice(2))
    if (!parsed.ok) {
      console.error('blind-merge: refusing this command line.\n')
      for (const e of parsed.errors) console.error(`  · ${e}`)
      console.error(`\n${usage()}`)
      process.exit(2)
    }
    const { a: pathA, b: pathB, union: pathU, mergedBy = '', fallback = '' } = parsed.values
    const rawA = readJson(pathA)
    const rawB = readJson(pathB)
    const a = readList('A', rawA)
    const b = readList('B', rawB)

    // A list that cannot be counted is refused BEFORE the merge, not after: a
    // missing or repeated ID makes every number below meaningless.
    const inputs = validateInputs(a, b)
    if (!inputs.ok) {
      console.error('blind-merge: these lists cannot be accounted for.\n')
      for (const e of inputs.errors) console.error(`  · ${e}`)
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
      console.log(
        '\nEvery other entry stands alone. Write the union as { "mergedBy": "<model>", "entries":\n' +
          '[ { "id": "U1", "from": ["A1","B2"] } ] } — one entry per finding KEPT, `from` naming the\n' +
          'input entries it stands for — and check it with --union.',
      )
      process.exit(0)
    }

    const rawU = readJson(pathU)
    const merger = validateMerger({
      mergedBy: mergedBy || (Array.isArray(rawU) ? '' : (rawU?.mergedBy ?? '')),
      authors: [a.model, b.model],
      fallback,
    })
    const result = accountUnion({ a, b, union: rawU })
    console.log(formatAccounting(result))
    if (!merger.ok) {
      console.error('')
      for (const e of merger.errors) console.error(`  ✗ ${e}`)
    } else if (merger.fallback) {
      console.log(`\nrecorded as a TWO-MODEL fallback: ${fallback}`)
    }
    if (!result.ok || !merger.ok) process.exit(1)
    console.log(`\nrecord it: --mode blind-parallel --merged-by "${mergedBy}" --evidence "${summaryLine(result)}"`)
    process.exit(0)
  } catch (e) {
    console.error(`blind-merge failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
