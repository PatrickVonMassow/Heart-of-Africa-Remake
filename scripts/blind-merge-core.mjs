// Pure accounting for the MERGE of a blind-parallel four-eyes stage (point 634).
//
// WHY IT EXISTS: the merge is the one place in the whole procedure where work can
// DISAPPEAR without a trace. Both models produce a complete list, and the two are
// then folded into one union — and the errors of that fold are one-sided:
// collapsing two entries that were not the same LOSES a finding silently, while
// wrongly keeping them apart costs one duplicated review. Until now the merge was
// done by the model that had authored one of the two lists (it judged its own
// work, which the recorder refuses one stage earlier) and nothing counted the
// result.
//
// Two safeguards, and only the second is arithmetic:
//   IDENTITY   the merge goes to the model that wrote NEITHER list — recorded by
//              scripts/mechanism-review.mjs (`--merged-by`), validated here by
//              validateMerger().
//   COUNTING   every entry of both input lists carries an ID, and the union must
//              account for EVERY one of them: `only A`, `only B`, or `merged
//              with <id>`. A dropped finding is then an arithmetic error rather
//              than a matter of trust.
//
// The cheap shape (the point's item 3): both models deliver structured entries
// (id, file, the defect in one line), exactDuplicates() collapses the identical
// ones for free, and the third model decides only the CANDIDATE PAIRS. So the
// added cost is a read of two lists, not a third full pass over the material.
//
// Side-effect free: file reading, printing and the exit code belong to the CLI
// half, scripts/blind-merge.mjs. Pinned by blind-merge-core.test.mjs.

// validateMerger lives beside sameModel and the self-review refusal, in the core
// that owns "who may hold a four-eyes role" — the recorder needs the same answer
// and one definition serves both. Re-exported here because this is where its
// callers look for it.
export { validateMerger } from './mechanism-review-core.mjs'

/** The two input lists, named the way the dispositions name them. */
export const LISTS = Object.freeze(['A', 'B'])

/** How similar two entries must read before the merger is asked about them. */
export const CANDIDATE_THRESHOLD = 0.4

/** Words that carry no signal when two defect lines are compared. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'was', 'were',
  'it', 'its', 'that', 'this', 'for', 'with', 'not', 'no', 'but', 'be', 'by', 'at',
])

/** A path compared the way two models would write the same file. */
export function normalizePath(path) {
  return String(path ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase()
}

/** A defect line reduced to what it SAYS — case, punctuation and spacing dropped. */
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The content words of a defect line, for the similarity below. */
export function contentWords(text) {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w && w.length > 2 && !STOPWORDS.has(w))
}

/**
 * How alike two defect lines read, as a Jaccard index over their content words.
 * Deliberately crude: it only decides which pairs are PUT TO the merging model,
 * never whether they are the same finding. A false candidate costs one question;
 * a missed one costs nothing here, because an entry no pair covers still has to
 * be accounted for as `only A` / `only B` and cannot vanish.
 */
export function similarity(a, b) {
  const x = new Set(contentWords(a))
  const y = new Set(contentWords(b))
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared / (x.size + y.size - shared)
}

/**
 * The comparison key two IDENTICAL findings share: same file, same sentence.
 *
 * The separator is written as an ESCAPE, never as the character itself: a raw
 * NUL in the source makes git call the whole file binary, and the four-eyes
 * review of this very change was handed "Binary files differ" instead of the
 * accounting it was asked to judge.
 */
export function entryKey(entry) {
  return `${normalizePath(entry?.file)}\u0000${normalizeText(entry?.defect)}`
}

/**
 * Read one input list from whatever the model handed back: `{ model, entries }`
 * or a bare array of entries. Returns the normalized shape, never throws — the
 * complaints belong to validateList().
 */
export function readList(name, raw) {
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : []
  return {
    list: String(name ?? '').trim() || '?',
    model: String((Array.isArray(raw) ? '' : raw?.model) ?? '').trim(),
    entries: entries.map((e) => ({
      id: String(e?.id ?? '').trim(),
      file: String(e?.file ?? '').trim(),
      defect: String(e?.defect ?? '').trim(),
    })),
  }
}

/**
 * The line form a model actually hands back: `A1 | src/x.ts | what is wrong`,
 * one entry per line, with or without a markdown table's pipes and bullets.
 *
 * Accepted beside JSON because the lists arrive inside a chat answer, and making
 * the countable shape depend on a model emitting well-formed JSON would put the
 * accounting at the mercy of a stray comma. Prose lines are SKIPPED, never
 * guessed at: an entry has an id like A3/B12 in its first field.
 */
export function parseEntryLines(text) {
  return readEntryLines(text).entries
}

/**
 * The same read, with what it could NOT read (four-eyes review, second round).
 *
 * Skipping quietly was the bug: a list whose entries carry no ids parsed to an
 * EMPTY list, and an empty list is accounted for by an empty union — every
 * finding gone, the count green. So a pipe line that is not an entry and is not
 * table furniture is REPORTED, and validateList refuses on it.
 */
export function readEntryLines(text) {
  const entries = []
  const unreadable = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*+]\s+/, '').replace(/^\|/, '').replace(/\|$/, '')
    if (!line.includes('|')) {
      // A line that OPENS with an entry id and then forgets the pipes is a
      // finding written in the wrong shape, not prose (four-eyes review, fourth
      // round): dropping it quietly let a mixed list report green while one of
      // its entries was never counted. Ordinary prose carries no id and is
      // ignored as before.
      // The test is the ID ITSELF at the head of the line, whatever follows it:
      // "B2: …", "B2 - …" and "B2 the save drops gifts" are all the same finding
      // in the wrong shape. A LETTER prefix is required, so numbered prose
      // ("1. I compared both lists") stays prose (four-eyes review, fifth round).
      if (/^[A-Za-z]{1,3}\d+\b/.test(line)) unreadable.push(line)
      continue
    }
    // A markdown table's header and its dashed separator are furniture, not
    // entries; everything else with a pipe in it was meant to be one.
    if (/^[\s|:-]+$/.test(line)) continue
    const [id, file, ...rest] = line.split('|').map((s) => s.trim())
    if (/^id$/i.test(id)) continue
    if (!/^[A-Za-z]{0,3}\d+$/.test(id)) {
      unreadable.push(line)
      continue
    }
    entries.push({ id, file, defect: rest.join(' | ').trim() })
  }
  return { entries, unreadable }
}

/**
 * One input list from a file's TEXT — JSON if it parses, the line form if not.
 *
 * Carries `unreadable` (lines that looked like entries and were not) and
 * `hadText`, so validateList can tell an EMPTY list from a list nobody could
 * read: the two look identical downstream and only one of them is honest.
 */
export function parseListText(name, text) {
  const raw = String(text ?? '')
  try {
    return { ...readList(name, JSON.parse(raw)), unreadable: [], hadText: Boolean(raw.trim()) }
  } catch {
    const { entries, unreadable } = readEntryLines(raw)
    return { ...readList(name, entries), unreadable, hadText: Boolean(raw.trim()) }
  }
}

/**
 * Is this a usable input list? An entry with no ID cannot be accounted for at
 * all, and two entries sharing one ID make `merged with <id>` ambiguous — both
 * are refused HERE, before the merger works from the list, because either one
 * turns the count below into a number that means nothing.
 */
export function validateList(list) {
  const errors = []
  const seen = new Map()
  for (const line of list?.unreadable ?? []) {
    errors.push(
      `list ${list?.list ?? '?'}: "${line}" was meant to be an entry but carries no id — write it as ` +
        '`A3 | <file> | <the defect>`, or it is counted by nobody',
    )
  }
  if (list?.hadText && !(list?.entries ?? []).length) {
    errors.push(
      `list ${list?.list ?? '?'}: not one entry could be read from a file that is not empty — an empty list ` +
        'is accounted for by an empty union, so this would pass while every finding is gone',
    )
  }
  for (const [i, e] of (list?.entries ?? []).entries()) {
    const where = `list ${list?.list ?? '?'} entry #${i + 1}`
    if (!e.id) errors.push(`${where}: no id — an entry without an ID cannot be accounted for`)
    else if (seen.has(e.id)) {
      errors.push(`${where}: id "${e.id}" is already used by entry #${seen.get(e.id) + 1} — IDs must be unique`)
    } else seen.set(e.id, i)
    if (!e.defect) errors.push(`${where}${e.id ? ` (${e.id})` : ''}: no defect line — one line saying what is wrong`)
  }
  return { ok: errors.length === 0, errors }
}

/** Both lists together, plus the ID collisions ACROSS them (same reason). */
export function validateInputs(a, b) {
  const errors = [...validateList(a).errors, ...validateList(b).errors]
  const idsA = new Set((a?.entries ?? []).map((e) => e.id).filter(Boolean))
  for (const e of b?.entries ?? []) {
    if (e.id && idsA.has(e.id)) {
      errors.push(`id "${e.id}" is used in BOTH lists — an ID must name one entry, or the union cannot be read`)
    }
  }
  return { ok: errors.length === 0, errors }
}

/**
 * The pairs that are the SAME finding word for word — same file, same sentence
 * once case and punctuation are dropped. These are collapsed for free: nobody is
 * asked about them, which is what keeps the third model's pass cheap.
 *
 * Greedy and one-to-one: an ID appears in at most one pair, so the counting
 * below stays a partition.
 */
export function exactDuplicates(a, b) {
  const byKey = new Map()
  for (const e of b?.entries ?? []) {
    const k = entryKey(e)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(e.id)
  }
  const pairs = []
  for (const e of a?.entries ?? []) {
    const bucket = byKey.get(entryKey(e))
    if (bucket && bucket.length) pairs.push({ a: e.id, b: bucket.shift() })
  }
  return pairs
}

/**
 * The pairs the merging model has to DECIDE — everything that is close enough to
 * be the same finding but is not identical. Same file counts as a candidate on
 * its own (two models describing one defect rarely choose the same words), and
 * otherwise the similarity has to clear CANDIDATE_THRESHOLD.
 *
 * Sorted strongest first, so a merger working down the list meets the obvious
 * pairs before the marginal ones.
 */
export function candidatePairs(a, b, { threshold = CANDIDATE_THRESHOLD } = {}) {
  const taken = new Set()
  for (const p of exactDuplicates(a, b)) {
    taken.add(`A:${p.a}`)
    taken.add(`B:${p.b}`)
  }
  const out = []
  for (const x of a?.entries ?? []) {
    if (taken.has(`A:${x.id}`)) continue
    for (const y of b?.entries ?? []) {
      if (taken.has(`B:${y.id}`)) continue
      const sameFile = Boolean(normalizePath(x.file)) && normalizePath(x.file) === normalizePath(y.file)
      const score = similarity(x.defect, y.defect)
      if (!sameFile && score < threshold) continue
      out.push({ a: x.id, b: y.id, sameFile, similarity: Number(score.toFixed(3)) })
    }
  }
  return out.sort((p, q) => q.similarity - p.similarity || String(p.a).localeCompare(String(q.a)))
}

/** The union entry's own name, for a report a reader can follow. */
const unionName = (entry, index) => String(entry?.id ?? '').trim() || `#${index + 1}`

/**
 * THE COUNT. Does the union account for EVERY entry of both input lists?
 *
 * `union` is `{ entries: [{ id?, defect?, from: [ids…] }] }` or a bare array of
 * those entries — one entry per finding kept, `from` naming the input entries it
 * stands for. Everything else is derived: a `from` of A-ids alone is `only A`, of
 * B-ids alone `only B`, and a mixed one is `merged with <the others>`. That is
 * the point's three dispositions, written once by the merger instead of twice.
 *
 * Returns { ok, dispositions, findings, counts }. Findings by kind:
 *   unaccounted    an input entry no union entry claims — THE dropped finding
 *   unknown-id     a `from` naming an ID that exists in neither list
 *   double-counted an input entry claimed by two union entries (or twice by one)
 *   empty-from     a union entry standing for nothing, which accounts for nothing
 *   no-defect      a FOLD with no line saying what the merged finding is
 *
 * That last one is what keeps the arithmetic from being satisfiable by cheating
 * (four-eyes review of this change): counting alone would pass a union that
 * folds every id into a single content-free entry — every entry "accounted for"
 * while the distinct findings are gone. A fold therefore has to SAY what the one
 * finding is, so the collapse is a claim someone can read and refuse. A
 * pass-through entry needs none: its text is its single source's.
 */
export function accountUnion({ a, b, union } = {}) {
  const entriesOf = (u) => (Array.isArray(u) ? u : Array.isArray(u?.entries) ? u.entries : [])
  const unionEntries = entriesOf(union)
  const inputs = new Map()
  for (const e of a?.entries ?? []) if (e.id) inputs.set(e.id, { ...e, list: 'A' })
  for (const e of b?.entries ?? []) if (e.id) inputs.set(e.id, { ...e, list: 'B' })

  const findings = []
  /** id → the union entries that claimed it (for the double-count report) */
  const claims = new Map()
  /** union entry name → its `from` list, for the disposition wording */
  const byName = new Map()

  for (const [i, u] of unionEntries.entries()) {
    const from = (Array.isArray(u?.from) ? u.from : []).map((s) => String(s ?? '').trim()).filter(Boolean)
    const name = unionName(u, i)
    // Two union entries under one name would make every message below ambiguous
    // — including the double-count one, which names the entries by exactly this.
    if (byName.has(name)) {
      findings.push({
        kind: 'duplicate-union-id',
        union: name,
        message: `two union entries are called ${name} — a union entry's id has to name one entry`,
      })
    } else byName.set(name, from)
    if (!from.length) {
      findings.push({
        kind: 'empty-from',
        union: name,
        message: `union entry ${name} names no input entry in "from" — it accounts for nothing`,
      })
      continue
    }
    for (const id of from) {
      if (!inputs.has(id)) {
        findings.push({
          kind: 'unknown-id',
          union: name,
          id,
          message: `union entry ${name} is "merged with ${id}", but no entry of either list has the id "${id}"`,
        })
        continue
      }
      if (!claims.has(id)) claims.set(id, [])
      claims.get(id).push(name)
    }
    if (from.length > 1 && !String(u?.defect ?? '').trim()) {
      findings.push({
        kind: 'no-defect',
        union: name,
        message:
          `union entry ${name} folds ${from.length} entries (${from.join(', ')}) but says nothing: a merge ` +
          'has to state the one finding it keeps, or the count passes while the findings are gone',
      })
    }
  }

  const dispositions = []
  for (const [id, entry] of inputs) {
    const claimedBy = claims.get(id) ?? []
    if (!claimedBy.length) {
      findings.push({
        kind: 'unaccounted',
        id,
        list: entry.list,
        message:
          `list ${entry.list} entry ${id}${entry.file ? ` (${entry.file})` : ''} is in NO union entry — ` +
          'it was dropped, not merged',
      })
      continue
    }
    if (claimedBy.length > 1) {
      const distinct = [...new Set(claimedBy)]
      findings.push({
        kind: 'double-counted',
        id,
        message:
          distinct.length === 1
            ? `entry ${id} is named twice in union entry ${distinct[0]} — it counts once or the total lies`
            : `entry ${id} is claimed by union entries ${distinct.join(' and ')} — it can belong to only one`,
      })
    }
    const partners = (byName.get(claimedBy[0]) ?? []).filter((s) => s !== id)
    dispositions.push({
      id,
      list: entry.list,
      union: claimedBy[0],
      disposition: partners.length ? `merged with ${partners.join(', ')}` : `only ${entry.list}`,
    })
  }

  const merged = dispositions.filter((d) => d.disposition.startsWith('merged')).length
  return {
    ok: findings.length === 0,
    dispositions,
    findings,
    counts: {
      a: (a?.entries ?? []).length,
      b: (b?.entries ?? []).length,
      union: unionEntries.length,
      accounted: dispositions.length,
      merged,
      onlyA: dispositions.filter((d) => d.disposition === 'only A').length,
      onlyB: dispositions.filter((d) => d.disposition === 'only B').length,
    },
  }
}

/** The one-line result, short enough for a `--evidence` line. */
export function summaryLine(result) {
  const c = result?.counts ?? {}
  const head = `${c.a ?? 0} A + ${c.b ?? 0} B entries → ${c.union ?? 0} union entries ` +
    `(${c.merged ?? 0} merged, ${c.onlyA ?? 0} only A, ${c.onlyB ?? 0} only B)`
  return result?.ok
    ? `${head}: every input entry accounted for`
    : `${head}: ${result?.findings?.length ?? 0} accounting error(s) — the union does not account for both lists`
}

/** The full report: the summary, then every finding, then the way out. */
export function formatAccounting(result) {
  const lines = [summaryLine(result)]
  if (result?.ok) return lines.join('\n')
  lines.push('')
  for (const f of result.findings ?? []) lines.push(`  ✗ ${f.message}`)
  lines.push(
    '',
    'The merge is the only step where a finding can disappear without a trace, so the union is',
    'COUNTED, not trusted: every entry of both lists is `only A`, `only B` or `merged with <id>`.',
    'Fix the union — a dropped entry is added back, an unknown id is corrected — and check again.',
  )
  return lines.join('\n')
}
