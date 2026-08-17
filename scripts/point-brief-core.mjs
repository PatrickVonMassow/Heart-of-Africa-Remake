// Pure core of the point brief (point 365 A, user 26.07.2026).
//
// WHY: an agent delegated a work-order point orients by reading whole documents
// before it sees a line of source — measured TASKS.md ~59k tokens plus design.md
// ~46k, uncached, per agent, to find a spec of a few hundred words. The brief
// replaces that reading assignment: the point verbatim, the design.md sections
// its spec names, and a one-line identification per cross-referenced point.
//
// THE BRIEF MUST NOT STARVE ITS READER — a smaller context that costs a rebuild
// is no saving. Hence two hard failures instead of a silent omission: an unknown
// point number, and a `§` reference that resolves in none of the documents
// searched (a renumbering must error, not quietly drop a section). Everything the
// resolver cannot carry is NAMED in the brief's reference map, never dropped.
//
// THE BRIEF MUST NOT LIE TO ITS READER EITHER. The work order writes `§` for four
// different things — a design.md section, a CLAUDE.md section, a section of a
// research document (`peoples-1890 §8`, `climate §1.1`, `fauna-behaviour-1890
// §B2.1`), and, sloppily, a work-order POINT number. A resolver that knows only
// design.md carries design.md §8 where the spec meant peoples-1890 §8, verbatim
// and without a word — the reader cannot tell. So every reference is resolved
// against ALL of them, every carried section is LABELLED with the document it
// came from, and the reference map lists every `§` and where it went.
//
// AND WHERE IT CANNOT KNOW, IT SAYS SO. Two ambiguities are structural, not
// fixable by a better cascade: the same `§N` heading id living in two documents
// (design.md §4.4 "Landmarks" and fauna-behaviour-1890 §4.4 "Vultures and the
// dying animal" — existence cannot decide between them), and a bare `§N` that may
// be a CLAUDE.md §7.1 acceptance criterion, which is a LIST ITEM no resolver can
// reach. Both are printed with the alternative NAMED on the map line, because a
// confident wrong identification is the one failure this tool cannot afford.
//
// This module is pure: text in, text out, no I/O. scripts/point-brief.mjs is the
// I/O wrapper (same split as doc-budget-core.mjs / doc-budget-guard.mjs).
import { createHash } from 'node:crypto'
import { DEFAULT_SETTING as DEFAULT_SOL_SHARE, briefLine as solBriefLine } from './sol-share-core.mjs'

/** Thrown for a failure the reader must see: unknown point, dangling section. */
export class BriefError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BriefError'
  }
}

/** Rough token estimate (~4 chars per token) — good enough to hold a ceiling. */
export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4)

/**
 * Ceiling for one assembled brief, in estimated tokens. MEASURED, not guessed:
 * swept over all 365 points of the work order on 27.07.2026 — median 1.7k, the
 * largest OPEN point 10.3k (362, five design sections), the largest of all 19.5k
 * (the archived 120, fifteen design sections). 24000 clears the measured maximum
 * with headroom and still costs ~4x less than the ~105k reading assignment it
 * replaces. Over the ceiling means the spec or its referenced design sections
 * grew past what a brief can carry: split the point or shorten the spec — do not
 * raise the ceiling to make room for a longer telling of the same thing.
 *
 * ENFORCED, not advisory: scripts/point-brief.mjs exits non-zero over it (a brief
 * nobody notices is over budget is how the saving quietly disappears).
 */
export const BRIEF_TOKEN_CEILING = 24000

/**
 * How far back a `§` may look for the document it belongs to, per citation style.
 * The styles differ in how much evidence they carry, so they get different reach:
 *   - `file`     `docs/peoples-1890.md` — unmistakable, so the generous window;
 *   - `basename` `peoples-1890`, `acceptance-evidence` — a hyphenated token that
 *                is never ordinary prose, but weaker: a short window;
 *   - `stem`     `peoples`, `climate`, `design` — ORDINARY ENGLISH WORDS. Measured
 *                on the corpus: "peoples §3.1" and "climate §1.1" are real
 *                citations, while "only the fauna and the §2.5 silhouettes" and
 *                "sixteen peoples unchanged … the §7 displacement" are not. Only
 *                strict adjacency (whitespace between the word and the `§`)
 *                separates them, so that is the rule.
 */
export const DOC_WINDOW = { file: 220, basename: 60, stem: 0 }

/**
 * Extra prose names for documents the work order cites by neither filename nor
 * basename. Only unambiguous ones — a name that also reads as ordinary prose
 * belongs to the adjacency-only `stem` style, not here.
 */
export const DOC_ALIASES = [
  { path: 'docs/analysis_de/retrospektive-zusammenarbeit.md', word: 'retrospekti\\w*', style: 'basename' },
  { path: 'docs/analysis_de/retrospektive-zusammenarbeit.md', word: 'retrospecti\\w*', style: 'basename' },
]

const normalise = (text) => String(text ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n')

/**
 * A `§` reference id: a plain number (`4.2`, `4.0.1`), a lettered one
 * (`B2.1` — docs/fauna-behaviour-1890.md numbers its second half that way), or a
 * bare capital naming a whole lettered part (`§B`).
 *
 * The trailing lookahead is what keeps the corpus's real prose out: `§s` (in
 * "the README cites no §s") and "the § numbering" must NOT parse as ids, which
 * is why the letter form is capital-only and may not be followed by a letter.
 */
const SECTION_REF_RE = /§+\s*((?:[A-Z](?:\d+(?:\.\d+)*)?)|(?:\d+(?:\.\d+)*))(?![A-Za-z0-9])/g

/** The named range styles the queue uses: `§19.2-§19.8`, `§19.2–§19.8`. */
const SECTION_RANGE_RE = /§\s*((?:[A-Z])?\d+(?:\.\d+)*)\s*[-–—]\s*§\s*((?:[A-Z])?\d+(?:\.\d+)*)/g

/**
 * Inline-code spans holding NOTHING but a `§` reference. The work order shows the
 * notation that way when it talks ABOUT references rather than making one — point
 * 365 itself writes "including a LETTERED section (`§B`)". Measured over the whole
 * corpus, that is the only such span, and every other backticked span containing a
 * `§` also holds a filename, i.e. is a real citation.
 *
 * These are not skipped outright, which would be a silent omission: they are
 * resolved like any other reference, and only their FAILURE is downgraded — a
 * reference that resolves nowhere is a hard failure, unless it stands alone in
 * backticks, in which case it is reported as notation. So a real citation written
 * that way still reaches the reader, and a real renumbering still fails loudly.
 */
function notationSpans(text) {
  const spans = []
  for (const m of text.matchAll(/`([^`\n]*)`/g)) {
    if (/^§+\s*(?:[A-Z](?:\d+(?:\.\d+)*)?|\d+(?:\.\d+)*)$/.test(m[1].trim())) {
      spans.push([m.index, m.index + m[0].length])
    }
  }
  return spans
}

/**
 * Every point of the work order (open TASKS.md and archived, concatenated by
 * readTasksAll). A point starts at `- [ ] N.` / `- [x] N.` and runs until the
 * next such line or the next `## ` section heading — EXCEPT inside a fenced code
 * block, where such a line is quoted example text and must not cut the body in
 * half (a truncated spec is the failure mode this whole module exists to avoid).
 * `startLine`/`endLine` index into the normalised source so a caller can prove
 * the body is verbatim.
 */
export function parseWorkOrderPoints(text) {
  const lines = normalise(text).split('\n')
  const points = []
  let current = null
  let inFence = false
  const close = (endLine) => {
    if (current) {
      current.endLine = endLine
      while (current.bodyLines.length && current.bodyLines.at(-1).trim() === '') {
        current.bodyLines.pop()
        current.endLine--
      }
      current.body = current.bodyLines.join('\n')
      delete current.bodyLines
      points.push(current)
      current = null
    }
  }
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      if (current) current.bodyLines.push(line.replace(/^ {2}/, ''))
      return
    }
    if (!inFence) {
      const start = /^- \[([ xX])\] (\d+)\.\s?(.*)$/.exec(line)
      if (start) {
        close(i)
        current = {
          number: Number(start[2]),
          done: start[1].toLowerCase() === 'x',
          startLine: i,
          bodyLines: [start[3]],
        }
        return
      }
      if (/^#{1,6} /.test(line)) {
        close(i)
        return
      }
    }
    if (current) current.bodyLines.push(line.replace(/^ {2}/, ''))
  })
  close(lines.length)
  return points
}

/** The point with that number, or null. Later duplicates lose to the first. */
export function findPoint(text, number) {
  const n = Number(number)
  return parseWorkOrderPoints(text).find((p) => p.number === n) ?? null
}

/**
 * A short identifying line for a cross-referenced point: enough to know WHICH
 * point is meant without carrying its whole body (the saving being the point).
 */
export function pointTitle(point, maxChars = 140) {
  const flat = String(point?.body ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length <= maxChars) return flat
  const cut = flat.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

/** Numeric section order: 4.2 before 4.10, 4 before 4.1; letters sort first. */
export function compareSectionIds(a, b) {
  const split = (s) => {
    const m = /^([A-Z]?)(.*)$/.exec(String(s))
    return [m[1], m[2] ? m[2].split('.').map(Number) : []]
  }
  const [la, pa] = split(a)
  const [lb, pb] = split(b)
  if (la !== lb) return la < lb ? -1 : 1
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d) return d
  }
  return 0
}

/**
 * Sections of a markdown document by id. A section's text runs from its heading
 * to the next heading of the SAME OR HIGHER level, so `### 19.8` stops at
 * `### 19.16` while `## 19` spans its subsections. For a top-level section only
 * the intro before the first subsection is kept, plus an index of the subsection
 * titles: pulling a whole chapter (§19 is ~400 lines) would defeat the brief, and
 * the reader is told it may read a NAMED subsection on demand.
 *
 * Heading levels 1–6 are all indexed. The research documents use `## B1.` and
 * `### B2.1`, and design.md's own `##`/`###`/`####` are a subset of that.
 */
export function parseDesignSections(designText) {
  const lines = normalise(designText).split('\n')
  const heads = []
  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+((?:[A-Z]?\d+(?:\.\d+)*))\.?\s+(.*)$/.exec(line)
    if (m) heads.push({ level: m[1].length, id: m[2], title: m[3].trim(), line: i })
  })
  const sections = new Map()
  heads.forEach((h, idx) => {
    let end = lines.length
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].line
        break
      }
    }
    const children = heads
      .slice(idx + 1)
      .filter((c) => c.line < end && c.level === h.level + 1)
      .map((c) => ({ id: c.id, title: c.title }))
    const bodyEnd = children.length
      ? heads.slice(idx + 1).find((c) => c.line < end && c.level === h.level + 1).line
      : end
    // A duplicate id would silently shadow the earlier section, so the FIRST
    // heading wins and the collision is visible to a caller that looks for it.
    if (!sections.has(h.id)) {
      sections.set(h.id, {
        id: h.id,
        title: h.title,
        heading: lines[h.line],
        children,
        text: lines.slice(h.line, bodyEnd).join('\n').trimEnd(),
      })
    }
  })
  return sections
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The citation styles a document answers to, derived from its path. */
export function aliasesFor(path) {
  const file = String(path).replace(/\\/g, '/')
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/i, '')
  const out = [
    // The full path or the bare filename, always with the .md suffix.
    { style: 'file', re: new RegExp(`(?<![\\w/.-])(?:[\\w./-]*/)?${escapeRe(base)}\\.md\\b`, 'gi') },
  ]
  // `peoples-1890`, `acceptance-evidence` — a hyphenated token, never prose.
  if (base.includes('-')) {
    out.push({ style: 'basename', re: new RegExp(`(?<![\\w/.-])${escapeRe(base)}(?![\\w-])`, 'gi') })
  }
  // `peoples`, `climate`, `design` — an ordinary word; adjacency-only (DOC_WINDOW).
  const stem = base.replace(/-1890$/, '')
  if (stem !== base || !base.includes('-')) {
    out.push({ style: 'stem', re: new RegExp(`(?<![\\w/.-])${escapeRe(stem)}(?![\\w-])`, 'gi') })
  }
  return out
}

/**
 * The documents a `§` may belong to, prepared once. `design` and `claude` are
 * named separately because they carry special roles: design.md is the default
 * owner of an unattributed `§` (the plain `§4.2` style in this queue always means
 * it) and the only document whose sections the brief carries verbatim; CLAUDE.md
 * is in every agent's context already, so its sections are named, not carried.
 */
export function buildDocRegistry({ designText = '', claudeText = '', docs = [] } = {}) {
  const make = (path, text) => ({
    path,
    sections: parseDesignSections(text),
    aliases: [
      ...aliasesFor(path),
      ...DOC_ALIASES.filter((a) => a.path === path).map((a) => ({
        style: a.style,
        re: new RegExp(`(?<![\\w/.-])${a.word}(?![\\w-])`, 'gi'),
      })),
    ],
  })
  const design = make('design.md', designText)
  const claude = make('CLAUDE.md', claudeText)
  claude.criteria = acceptanceCriteriaFrom(claude.sections)
  const others = docs
    .filter((d) => d && d.path && d.path !== 'design.md' && d.path !== 'CLAUDE.md')
    .map((d) => make(d.path, d.text ?? ''))
  return { design, claude, others, list: [design, claude, ...others] }
}

/**
 * Highest acceptance-criterion number to assume when CLAUDE.md cannot be parsed.
 * §7.1 numbers 1..32 today; the parsed list below is preferred whenever it works.
 */
export const ACCEPTANCE_CRITERION_FALLBACK_MAX = 32

/**
 * CLAUDE.md §7.1's acceptance criteria, by number → short title.
 *
 * They are LIST ITEMS (`22. **Health and afflictions.** …`), not headings, so a
 * section resolver can never reach them — yet the work order cites them as a bare
 * `§22` / `pt. 22` constantly, and such a reference then falls through to the
 * WORK-ORDER POINT of that number. Point 265's "the §19.6/§22 poor-condition
 * vultures" means criterion 22 (health) and got archived point 22 ("the ocean
 * still renders incorrectly") — right shape, wrong document. Naming both is the
 * only honest answer.
 */
export function acceptanceCriteriaFrom(sections) {
  const out = new Map()
  const s = sections?.get?.('7.1')
  if (!s) return out
  for (const m of s.text.matchAll(/^(\d+)\.\s+\*\*(.+?)\*\*/gm)) {
    out.set(Number(m[1]), m[2].trim().replace(/\.$/, ''))
  }
  return out
}

/** Does `doc` contain `id`, either as a section or as a lettered PART (`§B`)? */
function holds(doc, id) {
  if (doc.sections.has(id)) return { kind: 'section', section: doc.sections.get(id) }
  if (/^[A-Z]$/.test(id)) {
    const part = [...doc.sections.keys()].filter((k) => k.startsWith(id))
    if (part.length) return { kind: 'part', members: part }
  }
  return null
}

/** Every document mention in `text`, with the style that decides its reach. */
function docMentions(text, registry) {
  const out = []
  for (const doc of registry.list) {
    for (const alias of doc.aliases) {
      for (const m of text.matchAll(alias.re)) {
        out.push({ at: m.index, end: m.index + m[0].length, doc, style: alias.style })
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * Resolve every `§` occurrence in a spec to the document it means.
 *
 * The order below is deliberate, and EXISTENCE decides before attribution does —
 * a document named earlier only orders the candidates, it never forces a section
 * the document does not have:
 *   1. the nearest document named within its style's window, if it has the id;
 *   2. the last document named at ANY distance, if it has the id — point 142
 *      names `docs/peoples-1890.md` once at the top and then cites §4.0.1, §4.9,
 *      §4.0.5 hundreds of characters below, which no fixed window can reach;
 *   3. design.md, the documented default for a bare `§`;
 *   4. CLAUDE.md (§7.1/§7.2 are cited constantly without naming the file);
 *   5. the first other document the spec named that has it — an arbitrary pick if
 *      two do, which the reference map makes visible by naming the winner;
 *   6. a work-order POINT number (`§264 combat` — sloppy, but a real habit);
 *   7. the notation itself, if the reference stands alone in backticks;
 *   8. nothing — the hard failure, which names every document searched.
 *
 * The cascade always produces ONE winner, and that is exactly the danger: where
 * several candidates hold the id, the order is a guess dressed as a fact. So the
 * losers are kept on the ref (`alsoIn`) and printed on the map line. Only real
 * CANDIDATES count — a document the spec never named and that is neither default
 * is not an alternative reading, and listing it would be noise.
 */
export function resolveSectionRefs(spec, registry, { pointNumbers = new Set() } = {}) {
  const text = normalise(spec)
  const mentions = docMentions(text, registry)
  const namedDocs = [...new Set(mentions.map((m) => m.doc))]
  const notation = notationSpans(text)
  const isNotation = (at) => notation.some(([from, to]) => at >= from && at < to)
  const refs = []
  const seen = new Map()

  // `continue`, not `break`: two aliases of one document overlap (the filename
  // `docs/peoples-1890.md` contains the basename `peoples-1890`), so a mention
  // that ends after `at` may still be followed by one that does not.
  const nearOwner = (at) => {
    let best = null
    for (const m of mentions) {
      if (m.at >= at) break
      if (m.end > at) continue
      const gap = at - m.end
      if (m.style === 'stem' ? /^\s*$/.test(text.slice(m.end, at)) : gap <= DOC_WINDOW[m.style]) {
        if (!best || m.at >= best.at) best = m
      }
    }
    return best?.doc ?? null
  }
  const stickyOwner = (at) => {
    let best = null
    for (const m of mentions) {
      if (m.at >= at) break
      if (m.end > at || m.style === 'stem') continue
      if (!best || m.at >= best.at) best = m
    }
    return best?.doc ?? null
  }

  for (const m of text.matchAll(SECTION_REF_RE)) {
    const id = m[1]
    const at = m.index
    const candidates = [
      ['named-nearby', nearOwner(at)],
      ['named-earlier', stickyOwner(at)],
      ['design-default', registry.design],
      ['claude', registry.claude],
      ...namedDocs.map((d) => ['named-in-spec', d]),
    ]
    // Walk the WHOLE cascade, not just up to the first hit: the winner is still
    // the first, but the rest are the alternative readings the map must name.
    let hit = null
    const alsoIn = []
    const tried = new Set()
    for (const [how, doc] of candidates) {
      if (!doc || tried.has(doc)) continue
      tried.add(doc)
      const found = holds(doc, id)
      if (!found) continue
      if (!hit) hit = { how, doc, found }
      else alsoIn.push({ docPath: doc.path, kind: found.kind, title: found.section?.title ?? null })
    }
    if (!hit && /^\d+$/.test(id) && pointNumbers.has(Number(id))) {
      hit = { how: 'work-order-point', doc: null, found: null }
    }
    if (!hit && isNotation(at)) hit = { how: 'notation', doc: null, found: null }
    const key = `${hit?.doc?.path ?? hit?.how ?? 'dangling'}|${id}`
    if (seen.has(key)) {
      const prev = seen.get(key)
      prev.occurrences.push(at)
      // Later occurrences may see a different candidate set (a document named in
      // between), so the alternatives are unioned rather than taken from the first.
      for (const a of alsoIn) if (!prev.alsoIn.some((b) => b.docPath === a.docPath)) prev.alsoIn.push(a)
      continue
    }
    const ref = {
      id,
      at,
      occurrences: [at],
      how: hit ? hit.how : 'dangling',
      docPath: hit?.doc?.path ?? null,
      kind: hit?.found?.kind ?? (hit ? 'point' : null),
      section: hit?.found?.section ?? null,
      members: hit?.found?.members ?? null,
      alsoIn,
    }
    seen.set(key, ref)
    refs.push(ref)
  }

  // The other direction — one id with TWO winners inside one spec (point 160's §8
  // → peoples-1890 in one sentence and design.md in the next) — needs no extra
  // pass: `namedDocs` is spec-wide, so whatever wins anywhere was a candidate
  // everywhere, and each ref already carries the other as an alternative.

  const ranges = [...text.matchAll(SECTION_RANGE_RE)].map((m) => `§${m[1]}–§${m[2]}`)
  return { refs, ranges, namedDocs: namedDocs.map((d) => d.path) }
}

/**
 * HOW DEEP ADOPTION IS FOLLOWED (point 516). 1 would carry the point whose
 * specification the brief's point declares binding; 2 also carries what THAT
 * point declares binding, which is where the real chains end — 488 adopts 352,
 * and 352 adopts nothing. Deeper is not dropped, it is NAMED, and the cap is
 * PRINTED in the brief: a reader who cannot see the cap cannot tell a spec that
 * adopts nothing from one whose adoption was silently cut off.
 *
 * It is also the size brake. Inlining a point verbatim costs its whole body
 * (352 is 2.5k characters), and an uncapped walk would pull a chain of them into
 * every brief that starts one — the brief's entire value is that it is ~1.8k
 * tokens rather than ~108k.
 */
export const ADOPTION_DEPTH_CAP = 2

/**
 * The point reference itself: `point 352`, `points 175/177`, `pt. 30`,
 * `work-order point 434`. The lookbehind keeps `viewpoints 3` out.
 *
 * The sloppy `§352` form the queue also writes for a point is DELIBERATELY not
 * here. Adoption carries a whole body, and `§16` is the one reference this
 * corpus cannot pin down: measured, "per §16" and "per §21" in the queue mean a
 * CLAUDE.md §7.1 acceptance criterion, not the work-order points of those
 * numbers. Inlining point 16 there would put a wrong specification under a
 * heading that says it governs — the single failure this tool must not produce.
 * A `§N` therefore stays what it already was: resolved by the cascade and named
 * on the reference map, with the criterion reading spelled out beside it.
 */
const POINT_REF_SRC = String.raw`(?<![\w-])(?:work-order\s+)?(?:points?|pts?\.?)\s+(\d+(?:\s*[/,]\s*\d+)*)`

/**
 * ADOPTING WORDINGS — the whole distinction of point 516, made by the
 * REFERENCING WORDING and never by a hand-kept list (a list would need editing
 * for every new point, and the one nobody edited is the one that starves its
 * reader).
 *
 * WHY BY WORDING. Point 488's text says "Point 352's specification is binding
 * with one amendment from point 482". The brief carried one identifying line per
 * cross-referenced point, so the part declared BINDING was exactly the part
 * missing, and the building agent had to cut point 352's brief for itself before
 * it could start. A point merely named for orientation — "one amendment from
 * point 482", whose amendment the sentence then states — needs no such thing.
 *
 * The set is deliberately narrow: each entry names a construction that says the
 * OTHER point's text governs here, not one that merely points at it. A missed
 * adoption costs one extra `point-brief.mjs N` run, exactly today's cost; a
 * false one inlines a whole body into every brief that mentions the point, so
 * the errors are not symmetric and the conservative side is the right one.
 */
export const ADOPTING_PATTERNS = [
  {
    id: 'possessive-spec',
    why: "\"point N's specification/spec\" — the other point's own text is what governs",
    re: new RegExp(`${POINT_REF_SRC}(?:'s|’s)\\s+(?:specification|spec)\\b`, 'gi'),
  },
  {
    id: 'binding',
    why: '"point N is binding", "point N\'s rules remain binding"',
    re: new RegExp(`${POINT_REF_SRC}(?:'s|’s)?(?:\\s+\\w+){0,3}\\s+(?:is|are|remains?|stays?)\\s+binding\\b`, 'gi'),
  },
  { id: 'per', why: '"per point N"', re: new RegExp(`\\bper\\s+${POINT_REF_SRC}`, 'gi') },
  {
    id: 'as-specified-in',
    why: '"as specified/defined/described/stated in point N"',
    re: new RegExp(
      `\\b(?:as\\s+)?(?:specified|defined|described|stated|set\\s+out|laid\\s+out|written)\\s+in\\s+${POINT_REF_SRC}`,
      'gi',
    ),
  },
  {
    id: 'spec-of',
    why: '"the specification/rules/requirements of point N"',
    re: new RegExp(
      `\\b(?:the\\s+)?(?:specification|spec|rules?|requirements?)\\s+of\\s+${POINT_REF_SRC}`,
      'gi',
    ),
  },
  { id: 'according-to', why: '"according to point N"', re: new RegExp(`\\baccording\\s+to\\s+${POINT_REF_SRC}`, 'gi') },
  { id: 'governed-by', why: '"governed by point N"', re: new RegExp(`\\bgoverned\\s+by\\s+${POINT_REF_SRC}`, 'gi') },
  {
    id: 'unchanged-from',
    why: '"unchanged from point N" — the same specification, carried forward',
    re: new RegExp(`\\bunchanged\\s+from\\s+${POINT_REF_SRC}`, 'gi'),
  },
  { id: 'implements', why: '"implements point N"', re: new RegExp(`\\bimplements?\\s+${POINT_REF_SRC}`, 'gi') },
  { id: 'follows', why: '"follows point N"', re: new RegExp(`\\bfollows?\\s+${POINT_REF_SRC}`, 'gi') },
]

/**
 * Quotation spans — where the spec QUOTES a wording rather than using it.
 *
 * Point 516's own text reads: Point 488's text reads "point 352's specification
 * is binding …". That is a citation of a phrase, not an adoption of point 352,
 * and inlining 352 there would carry a body nobody asked for. Same treatment as
 * the backticked `§B` notation the resolver already knows: not skipped (that
 * would be a silent omission) but DOWNGRADED to a mention, and said so on the
 * reference map.
 *
 * A quote may wrap across lines in the work order's hard-wrapped prose, so the
 * newline is allowed; a blank line inside is not, which is what keeps an
 * unpaired quote from swallowing the rest of a spec.
 */
export function quotedSpans(text) {
  const spans = []
  for (const m of normalise(text).matchAll(/"([^"]{0,600})"|“([^”]{0,600})”/g)) {
    if (/\n[ \t]*\n/.test(m[0])) continue
    spans.push([m.index, m.index + m[0].length])
  }
  return spans
}

/**
 * Split a spec's point references into the ones whose SPECIFICATION it adopts
 * and the ones it merely quotes an adopting phrase about. Everything else stays
 * an ordinary cross-reference (extractPointRefs finds those).
 */
export function classifyPointRefs(spec, { selfNumber = null } = {}) {
  const text = normalise(spec)
  const quoted = quotedSpans(text)
  const inQuote = (at, end) => quoted.some(([from, to]) => at >= from && end <= to)
  const adopted = new Map()
  const quotedOnly = new Map()
  for (const pattern of ADOPTING_PATTERNS) {
    for (const m of text.matchAll(pattern.re)) {
      const phrase = m[0].replace(/\s+/g, ' ').trim()
      const cited = inQuote(m.index, m.index + m[0].length)
      for (const part of m[1].split(/[/,]/)) {
        const n = Number(part.trim())
        if (!Number.isFinite(n) || n <= 0 || n === Number(selfNumber)) continue
        const record = { number: n, at: m.index, phrase, pattern: pattern.id }
        if (cited) {
          if (!adopted.has(n) && !quotedOnly.has(n)) quotedOnly.set(n, record)
        } else {
          if (!adopted.has(n)) adopted.set(n, record)
          quotedOnly.delete(n)
        }
      }
    }
  }
  const byNumber = (a, b) => a.number - b.number
  return { adopted: [...adopted.values()].sort(byNumber), quoted: [...quotedOnly.values()].sort(byNumber) }
}

/**
 * Walk the adoption chain breadth-first from `root`, to `cap` levels.
 *
 * An adopted point that resolves NOWHERE is the hard failure of point 516's
 * item 3, on the same reasoning as a dangling `§`: the brief promised the text
 * that governs and cannot deliver it. Only the levels the brief CARRIES throw —
 * a reference past the cap is named, not carried, so a stale one there is
 * reported on its line the way an unknown cross-reference already is.
 */
export function collectAdoptedSpecs({
  points = [],
  root,
  cap = ADOPTION_DEPTH_CAP,
  mayBeCriterion = () => false,
} = {}) {
  const byNumber = new Map(points.map((p) => [p.number, p]))
  const chain = []
  const beyond = []
  const ambiguous = []
  const seen = new Set([root.number])
  let frontier = [{ point: root, depth: 0 }]
  while (frontier.length) {
    const next = []
    for (const { point, depth } of frontier) {
      for (const ref of classifyPointRefs(point.body, { selfNumber: point.number }).adopted) {
        if (seen.has(ref.number)) continue
        // A LOW number the queue writes as "per pt. 32" is the one reading this
        // resolver cannot settle: CLAUDE.md §7.1's criteria are list items with
        // the same numbers, and point 84's "per pt. 32" means CRITERION 32 (the
        // render pipeline), not the work-order point of that number. Inlining a
        // body under a heading that says it is binding would be the worst error
        // this tool can make, so an ambiguous number is NAMED and not carried —
        // unless the spec wrote "work-order point N", which decides it.
        if (mayBeCriterion(ref.number) && !/work-order/i.test(ref.phrase)) {
          if (!ambiguous.some((a) => a.number === ref.number)) ambiguous.push({ ...ref, via: point.number })
          continue
        }
        if (depth + 1 > cap) {
          if (!beyond.some((b) => b.number === ref.number)) {
            beyond.push({ ...ref, via: point.number, found: byNumber.has(ref.number) })
          }
          continue
        }
        const target = byNumber.get(ref.number)
        if (!target) {
          throw new BriefError(
            `point ${point.number} adopts the specification of point ${ref.number} ("${ref.phrase}"), ` +
              'which exists in neither TASKS.md nor docs/tasks-archive.md. The brief must carry an adopted ' +
              'specification in full, so this is a dead reference, not a detail: fix the number in the work ' +
              'order — a reader told a missing specification is binding is worse off than one told nothing.',
          )
        }
        seen.add(ref.number)
        chain.push({ ...ref, via: point.number, depth: depth + 1, point: target })
        next.push({ point: target, depth: depth + 1 })
      }
    }
    frontier = next
  }
  return { chain, beyond, ambiguous }
}

/**
 * How far into a document a scope declaration may stand (point 516 item 5).
 *
 * A document says what it governs in its OPENING — "This document is the
 * reference the work-order points 477–488 cite" sits in the second paragraph of
 * docs/communication-poc-spec.md. Measured over the corpus, the same phrase
 * further down is ordinary prose (docs/batch-autonomy.md line 2063, a table cell
 * in docs/rule-corpus-audit.md), so the head is what separates a declaration
 * from a mention — nothing else in the wording does.
 */
export const SLICE_DECLARATION_HEAD_LINES = 20

/** `work-order points 477–488`, `work-order point 361`, `work-order points 12, 13`. */
const SLICE_DECLARATION_RE = /work-order\s+(?:points?|pts?\.?)\s+(\d+(?:\s*(?:[-–—]|,|\/|\s+and\s+)\s*\d+)*)/gi

/** The widest span a declared range may cover — beyond it, the match is prose. */
const SLICE_RANGE_LIMIT = 200

/** The numbers a declaration covers, and the short scope wording for the brief. */
function expandPointScope(raw) {
  const text = String(raw).trim()
  const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(text)
  if (range) {
    const from = Number(range[1])
    const to = Number(range[2])
    if (to < from || to - from > SLICE_RANGE_LIMIT) return { numbers: [], scope: '' }
    const numbers = []
    for (let n = from; n <= to; n++) numbers.push(n)
    return { numbers, scope: `work-order points ${from}–${to}` }
  }
  const numbers = [...new Set(text.split(/[,/]|\s+and\s+/).map((p) => Number(p.trim())).filter(Boolean))]
  if (!numbers.length) return { numbers: [], scope: '' }
  return {
    numbers,
    scope: numbers.length === 1 ? `work-order point ${numbers[0]}` : `work-order points ${numbers.join(', ')}`,
  }
}

/** The sentence a declaration stands in, collapsed to one line for the brief. */
function declarationSentence(text, at, maxChars = 180) {
  const before = text.slice(0, at)
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('\n\n'), -1) + 1
  const rest = text.slice(start)
  const end = /[.;]\s/.exec(rest.slice(at - start))
  const sentence = rest
    .slice(0, end ? at - start + end.index : rest.length)
    .replace(/\s+/g, ' ')
    .trim()
  return sentence.length > maxChars ? `${sentence.slice(0, maxChars).trim()}…` : sentence
}

/**
 * Which spec DOCUMENT a work-order point's slice belongs to.
 *
 * WHY (measured 06.08.2026 while point 487 was built): the brief names the
 * design.md sections a spec cites but knows no other spec document, so
 * docs/communication-poc-spec.md — which pins the five-step loop verbatim and
 * decided the journal wording for the whole 477–488 slice — was found only
 * through a code comment. The document itself declares what it governs; reading
 * that declaration is the whole mechanism, and it puts the duty on the document
 * (declare your points) rather than on every reader (go looking).
 */
export function parseSliceDeclarations(docs = [], { headLines = SLICE_DECLARATION_HEAD_LINES } = {}) {
  const out = []
  for (const doc of docs) {
    if (!doc || !doc.path) continue
    const head = normalise(doc.text).split('\n').slice(0, headLines).join('\n')
    for (const m of head.matchAll(SLICE_DECLARATION_RE)) {
      const { numbers, scope } = expandPointScope(m[1])
      if (!numbers.length) continue
      out.push({ path: doc.path, numbers, scope, declaration: declarationSentence(head, m.index) })
    }
  }
  return out
}

/** The declarations that cover `number` — usually none, occasionally one or two. */
export function sliceDocsFor(docs = [], number, options) {
  const n = Number(number)
  return parseSliceDeclarations(docs, options).filter((d) => d.numbers.includes(n))
}

/** Other work-order points a spec names ("per point 288", "pt. 30", "points 175/177"). */
export function extractPointRefs(spec, selfNumber = null) {
  const text = normalise(spec)
  const found = []
  const add = (n) => {
    const v = Number(n)
    if (Number.isFinite(v) && v > 0 && v !== Number(selfNumber) && !found.includes(v)) found.push(v)
  }
  for (const m of text.matchAll(/\bpoints?\s+(\d+(?:\s*[/,]\s*\d+)*)/gi)) {
    for (const n of m[1].split(/[/,]/)) add(n.trim())
  }
  for (const m of text.matchAll(/\bpts?\.?\s+(\d+(?:\s*[/,]\s*\d+)*)/gi)) {
    for (const n of m[1].split(/[/,]/)) add(n.trim())
  }
  return found.sort((a, b) => a - b)
}

/**
 * HOW TO SPEND A TURN (point 593). Binding, and deliberately carried by the
 * PROMPT rather than by a guard: "these two calls could have been bundled" is
 * not machine-decidable, so nothing can check it after the fact.
 *
 * WHY IT IS WORTH THE LINES IT COSTS. Measured over this project's own
 * transcripts: only 5.0 % of responses issue more than one tool call, while
 * search/read alone is 25.1 % of the weighted spend, and 4036 responses —
 * 15.2 % of all output — repeated an EXACTLY identical shell command inside a
 * single session. One saved response is ~22.9k weighted tokens and 24.4 s of
 * MACHINE time (not calendar time: up to three agents run in parallel, so this
 * only becomes wall clock on the critical path).
 *
 * The paragraph NAMES its recurring candidates instead of stating the
 * principle, because the principle was already obvious and still was not
 * followed. It also names both ways the shortcut goes wrong — bundling a call
 * that needs another's OUTPUT, and re-using a fact that has since changed — so
 * the rule cannot be read as "batch everything, read nothing twice".
 *
 * Shared verbatim with the batch resume prompt's German rendering in
 * scripts/batch-autostart-core.mjs; change the two together.
 */
export const CALL_DISCIPLINE = [
  'HOW TO SPEND A TURN — BUNDLE THE INDEPENDENT CALLS, AND READ NOTHING TWICE:',
  '- INDEPENDENT CALLS GO IN ONE TURN. Anything that does not need another call\'s OUTPUT',
  '  belongs in the SAME turn: several reads, several greps, `npm run build` beside',
  '  `npm run lint`, `git status` beside the branch name, the screenshot reads of a picture',
  '  check. A call that DOES consume a previous result stays SEQUENTIAL — bundling it means',
  '  acting on a value you have not seen yet. Screenshots go in SMALL semantic groups at',
  '  full resolution: judgment quality outranks batching, so never shrink or lump frames to',
  '  fit more in. And a bundled SHELL chain must never HIDE its failing step — join with',
  '  `&&` so it stops, or label each part in the output; an `a; b` that swallows a red exit',
  '  code is worse than two turns.',
  '- A FACT THAT CANNOT HAVE CHANGED IS NOT READ AGAIN: a file nobody edited since you read',
  '  it, a `--help`, a config value, a spec section already in this context. MUTABLE state',
  '  stays re-read BY RULE — `git status`, CI state, a running process, and anything this',
  '  session or another agent has written since.',
]

const HOUSE_FACTS = [
  'HOW TO USE THIS BRIEF — READ THIS FIRST',
  '- This brief IS your spec. Do NOT read TASKS.md or docs/tasks-archive.md or design.md',
  '  WHOLESALE: measured, that is ~59k + ~46k tokens per agent, uncached, and avoiding it is',
  '  the entire purpose of this brief.',
  '- You MAY read any NAMED file, and any NAMED section, on demand. The ban is on wholesale',
  '  reads, not on targeted lookups — read the source files and sections the spec names.',
  '- Every carried section below is LABELLED with the document it came from, and the',
  '  REFERENCE MAP lists every § the spec uses and where it was resolved. If a resolution',
  '  looks wrong for what the spec means, trust the spec and read that section yourself.',
  '- If this brief proves INSUFFICIENT, or contradicts the code you find: ESCALATE (stop and',
  '  report what is missing) rather than guess. A guessed spec costs a rebuild, which is more',
  '  expensive than the question.',
  '- Point titles use sentence case rather than full uppercase; acronyms and individual',
  '  emphasised words may stay capitalised.',
  '',
  'HOUSE FACTS NO POINT STATES — each of these cost a real agent real work today (27.07.2026),',
  'which is why they are delivered rather than remembered:',
  '- `docs/` and the `verification/` screenshots are TRACKED in git. Neither is scratch space;',
  '  deleting from them deletes repository content.',
  '- `scripts/retro-refresh.mjs` must NEVER run from a git WORKTREE: it derives its source',
  '  directory from the checkout path, finds nothing, and rewrote a document as empty while',
  '  exiting 0. It throws now — but doc refreshes belong to the main session in the main tree.',
  '- Every guard here STANDS DOWN for a session that does not own the batch lock and for a',
  '  paused batch (`heldByOtherLiveOwner`, `.claude/batch-paused`). A new guard that omits it',
  '  will fire on subagents and on a paused run.',
  '- CLAUDE.md, design.md and the work order preamble carry MEASURED ceilings',
  '  (`scripts/doc-budget-core.mjs`), and CLAUDE.md sits near its limit. Measure before you',
  '  add a paragraph; raising a ceiling needs a written justification in the same commit.',
  '- A FRESH WORKTREE HAS NO `node_modules` — it is git-ignored, so no gate can start there.',
  '  `node scripts/worktree-bootstrap.mjs` is the FIRST command in a new worktree: it links the',
  '  main tree\'s dependencies when the lockfile matches (seconds) and installs when it does not.',
  '  Never set the link by hand, and never remove the worktree with anything but',
  '  `scripts/worktree-cleanup.mjs` — the bare commands follow that link into the main tree.',
  '- Never `git checkout <file>` on a file holding uncommitted work — it discards it.',
  '- COMMIT AND PUSH AT EVERY SELF-CONTAINED STEP — not at the end, not "once it is green".',
  '  AN UNCOMMITTED BLOCK IS THE ONE STATE NOTHING CAN RESCUE: on 11.08.2026 a landing removed',
  '  a working agent\'s worktree underneath it, every later shell call was refused with "the',
  '  isolation worktree appears to have been removed", and the finished, tested answer to six',
  '  review findings — 89 green cases and a recorded reviewer verdict — was gone, because the',
  '  whole answer had run as ONE block up to the green verdict. Only what had been pushed',
  '  survived. Nothing can recover an uncommitted tree: not the harness, not git, not the main',
  '  session. So a step that stands on its own is committed the moment it stands, and the',
  '  branch is pushed with it — a failed push is REPORTED, never skipped.',
  '- Every commit records its AUTHORING MODEL in the co-author trailer. That trailer is the',
  '  only machine-readable evidence `scripts/model-guard.mjs` has, so the bare',
  '  `Co-Authored-By: Claude <noreply@anthropic.com>` names no model and trips the tripwire,',
  '  which STOPS the batch. Write your own model:',
  '  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.',
]

/**
 * The header, with the SOL ROUTING line the current switch setting dictates (point 654).
 *
 * It is one line at EVERY setting, the default included: an agent that is never told the
 * lever exists cannot pull it, and a brief that named it only sometimes would train its
 * readers to skip the line. The setting itself is READ from `.claude/sol-share.json` by
 * the wrapper — nothing here keeps its own copy of the routing table.
 */
export function headerLines(solShare = DEFAULT_SOL_SHARE) {
  return [...HOUSE_FACTS, solBriefLine(solShare), '', ...CALL_DISCIPLINE]
}

/**
 * The brief's closing block: what the agent writes BACK (point 458).
 *
 * WHY IT IS PART OF THE BRIEF. Point 365 bounded the INPUT side of delegation —
 * ~1.8k tokens of brief against ~108k of reading assignment — but nothing bounded
 * the OUTPUT, and the agent's final text is the only thing that enters the main
 * session's context. It is also the part the main session needs least in prose:
 * the merge reads git for every fact it acts on (branch, SHAs, changed files),
 * never the report. So the demand travels WITH the brief rather than with a
 * prompt template a caller has to remember — a regenerated brief carries it.
 *
 * The length line is GUIDANCE, deliberately not a cap: a truncated escalation
 * costs a rebuild, which is far dearer than a report ten lines too long.
 */
export function returnBlock(number) {
  return [
    '--- WHAT YOU RETURN ---',
    "Your final message is the ONLY thing that reaches the main session, so it is a PROTOCOL,",
    'not a narrative. Report exactly these, in this order:',
    `- the WORK-ORDER POINT NUMBER (${number}) and the BRANCH NAME;`,
    '- the COMMIT SHAs, in the order you made them;',
    '- the GATES YOU ACTUALLY RAN — `npm run build`, `npm run lint`, `npm run test:unit`, and',
    '  each browser suite BY NAME — each with its VERDICT. A gate you did not run is reported',
    '  as not run, never as green;',
    '- the CHANGED FILES as PATHS ONLY;',
    '- OPEN ITEMS AND ESCALATIONS — anything left undone, guessed at, or blocked;',
    '- the point-365 question answered: did this BRIEF SUFFICE, and what was MISSING?',
    'Leave OUT: diffs, file contents, command logs, code blocks and restated spec text. The',
    'merge reads git for branch, SHAs and changed files — it never reads your report, so prose',
    'about them costs context and buys nothing.',
    'Keep this under ~40 lines. That is GUIDANCE, not a cap: an escalation cut short costs more',
    'than a long report, so never truncate what the next session needs to know.',
  ]
}

/**
 * Fingerprint of the work order a brief was cut from — the first 12 hex of the
 * sha256 over the concatenated (normalised) TASKS.md + archive text.
 *
 * WHY a content hash and not just the commit: a brief is pasted into prompts and
 * files and outlives its source. HEAD alone LIES here — TASKS.md is normally
 * dirty on main, and a batch session edits it mid-run, so two briefs with the
 * same HEAD can carry different specs. The hash is the part that cannot.
 */
export function workOrderFingerprint(tasksText) {
  return createHash('sha256').update(normalise(tasksText)).digest('hex').slice(0, 12)
}

/** The one-line provenance stamp. Unknown parts are named as unknown, never faked. */
export function formatRevisionLine({ head = null, dirty = null, workOrder = null } = {}) {
  const dirtyMark = dirty === true ? ' +dirty' : dirty === false ? '' : ' +dirty?'
  return (
    `SOURCE REVISION: HEAD ${head || 'unknown'}${dirtyMark} · work-order ${workOrder || 'unknown'} — ` +
    'a brief carries no expiry date; re-generate if either differs from the repo you are working in.'
  )
}

/**
 * The header of the adopted-specification block. The DEPTH CAP is stated here
 * rather than applied silently (point 516 item 2): the reader must be able to
 * tell "this point adopts nothing further" from "the walk stopped here".
 */
export function adoptionHeaderLines(cap = ADOPTION_DEPTH_CAP) {
  return [
    '--- ADOPTED SPECIFICATIONS (carried in full — this point declares them binding) ---',
    `DEPTH CAP ${cap}: adoption is followed ${cap} level(s) — the points this one adopts, and the ones`,
    'THEY adopt. Anything deeper is NAMED below rather than carried, so run',
    '`node scripts/point-brief.mjs <N>` for it. A `§` cited INSIDE an adopted point is named on the',
    'reference map, not carried: it belongs to that point, and its section is one targeted read away.',
  ]
}

/** Assemble the brief text from already-resolved parts (pure, no lookups). */
export function assembleBrief({
  point,
  sections = [],
  referenced = [],
  notes = [],
  referenceMap = [],
  revision,
  adopted = [],
  adoptionBeyond = [],
  adoptionCap = ADOPTION_DEPTH_CAP,
  sliceDocs = [],
  solShare = DEFAULT_SOL_SHARE,
}) {
  const out = [
    `=== DELEGATION BRIEF — WORK-ORDER POINT ${point.number} (${point.done ? 'DONE/ARCHIVED' : 'OPEN'}) ===`,
    'Assembled by scripts/point-brief.mjs from the work order, design.md and the research docs.',
    formatRevisionLine(revision ?? {}),
    '',
    ...headerLines(solShare),
    '',
    `--- THE POINT (verbatim, work-order point ${point.number}) ---`,
    point.body,
    '',
  ]
  if (adopted.length || adoptionBeyond.length) {
    out.push(...adoptionHeaderLines(adoptionCap))
    for (const a of adopted) {
      out.push(
        '',
        `[work-order point ${a.number} (${a.point.done ? 'done' : 'open'}), ADOPTED by point ${a.via} ` +
          `via "${a.phrase}" — depth ${a.depth}]`,
        a.point.body,
      )
    }
    if (adoptionBeyond.length) {
      out.push('', `DEEPER THAN THE CAP — named, not carried (run the brief for each):`)
      for (const b of adoptionBeyond) {
        out.push(
          b.found
            ? `- point ${b.number}, adopted by point ${b.via} via "${b.phrase}" — node scripts/point-brief.mjs ${b.number}`
            : `- point ${b.number}, adopted by point ${b.via} via "${b.phrase}" — NOT FOUND in the work order; ` +
              'treat as suspect and say so.',
        )
      }
    }
    out.push('')
  }
  if (sliceDocs.length) {
    out.push(
      "--- THE SPEC DOCUMENT THIS POINT'S SLICE BELONGS TO ---",
      'Named, not carried. Read it before the code: it pins decisions this point\'s wording assumes.',
      ...sliceDocs.map((d) => `- ${d.path} — declares itself for ${d.scope}: "${d.declaration}"`),
      'A document that governs this slice and is NOT named here is a FINDING, not a search task: file',
      'it, and make that document declare its work-order points in its opening lines.',
      '',
    )
  }
  if (sections.length) {
    out.push('--- SECTIONS THE SPEC REFERENCES (verbatim) ---')
    for (const s of sections) {
      out.push(`[from ${s.docPath} §${s.id}]`)
      out.push(s.text)
      if (s.children.length) {
        out.push(
          `[§${s.id} has subsections: ${s.children.map((c) => `§${c.id} ${c.title}`).join(' · ')} — ` +
            'read a named one on demand; the brief carries the intro only.]',
        )
      }
      out.push('')
    }
  }
  if (referenced.length) {
    out.push('--- CROSS-REFERENCED POINTS (identification only — read one on demand if needed) ---')
    for (const r of referenced) {
      out.push(
        r.found
          ? `point ${r.number} [${r.done ? 'done' : 'open'}]: ${r.title}`
          : `point ${r.number}: NOT FOUND in the work order — the spec names it; treat as suspect.`,
      )
      if (r.criterion !== undefined && r.criterion !== null) {
        out.push(
          `  AMBIGUOUS: "§${r.number}" / "pt. ${r.number}" may instead mean CLAUDE.md §7.1 acceptance ` +
            `criterion ${r.number}${r.criterion ? ` "${r.criterion}"` : ''} — not this point.`,
        )
      }
    }
    out.push('')
  }
  if (referenceMap.length) {
    out.push(
      '--- REFERENCE MAP (every § in the spec, and where it was resolved) ---',
      ...referenceMap.map((l) => `- ${l}`),
      '',
    )
  }
  if (notes.length) {
    out.push('--- NOTES ---', ...notes.map((n) => `- ${n}`), '')
  }
  // ALWAYS last, and never conditional: the return protocol is owed for every
  // brief — OPEN or archived, with sections or without — so no caller can end up
  // with a brief that says nothing about what comes back.
  out.push(...returnBlock(point.number))
  return out.join('\n')
}

/**
 * The whole job: point number → brief text. Throws BriefError on an unknown point
 * number and on a `§` that resolves in none of the documents searched.
 */
export function buildBrief({ tasksText, designText, claudeText = '', docs = [], number, registry, revision = {}, solShare = DEFAULT_SOL_SHARE }) {
  const all = parseWorkOrderPoints(tasksText)
  const point = all.find((p) => p.number === Number(number)) ?? null
  if (!point) {
    const known = all.map((p) => p.number)
    const range = known.length ? `${Math.min(...known)}–${Math.max(...known)}` : 'none'
    throw new BriefError(
      `no work-order point ${number} in TASKS.md or docs/tasks-archive.md (known: ${range}). ` +
        'Check the number — a brief for a point that does not exist would send its reader off blind.',
    )
  }
  const reg = registry ?? buildDocRegistry({ designText, claudeText, docs })
  const pointNumbers = new Set(all.map((p) => p.number))
  const { refs, ranges } = resolveSectionRefs(point.body, reg, { pointNumbers })

  const dangling = refs.filter((r) => r.how === 'dangling')
  if (dangling.length) {
    const searched = reg.list.map((d) => d.path).join(', ')
    throw new BriefError(
      `the spec of point ${point.number} references ${dangling.map((r) => `§${r.id}`).join(', ')}, ` +
        `which exists in none of the documents searched (${searched}) and is no work-order point ` +
        'number either. A renumbering, a typo, or a document this resolver does not know: fix the ' +
        'reference in the work order, or add the document — the brief must not silently omit a ' +
        'section its reader was promised.',
    )
  }

  // Only design.md's sections are CARRIED verbatim: it is the design authority the
  // spec's wording depends on. Everything else is NAMED with its heading, because
  // CLAUDE.md is already in the agent's context and a research document is
  // background to be read targetedly — carrying those would put the brief over its
  // ceiling for exactly the points that reference them most.
  const carried = refs
    .filter((r) => r.docPath === 'design.md' && r.kind === 'section')
    .sort((a, b) => compareSectionIds(a.id, b.id))
    .map((r) => ({ ...r.section, docPath: r.docPath }))

  const criteria = reg.claude?.criteria ?? new Map()
  /** The §7.1 criterion of that number — its title, or '' when only the number is known. */
  const criterionTitle = (n) => {
    if (criteria.size) return criteria.has(n) ? (criteria.get(n) ?? '') : null
    return n >= 1 && n <= ACCEPTANCE_CRITERION_FALLBACK_MAX ? '' : null
  }
  const criterionNote = (n) => {
    const title = criterionTitle(n)
    if (title === null) return ''
    return (
      ` | AMBIGUOUS: may instead mean CLAUDE.md §7.1 ACCEPTANCE CRITERION ${n}${title ? ` "${title}"` : ''}, ` +
      `which the corpus also writes "§${n}" / "pt. ${n}". The criteria are list items, not headings, so no ` +
      'resolver can tell them apart — decide from what the sentence is about.'
    )
  }
  // The specifications this point declares binding, carried in full (point 516).
  // It runs here because the §7.1 criterion numbers decide which adopted number
  // may be carried at all, and an unknown one throws — a brief that says a
  // specification is binding and then does not carry it is the bug this closes.
  const {
    chain: adopted,
    beyond: adoptionBeyond,
    ambiguous: adoptionAmbiguous,
  } = collectAdoptedSpecs({ points: all, root: point, mayBeCriterion: (n) => criterionTitle(n) !== null })
  const { quoted: adoptionQuoted } = classifyPointRefs(point.body, { selfNumber: point.number })
  const adoptedNumbers = new Set(adopted.map((a) => a.number))

  // The spec document this point's slice belongs to, named the way a design.md
  // section is named — one level out from the sections, and the same failure:
  // what the point is specified in must not be a search task for its reader.
  const sliceDocs = sliceDocsFor(docs, point.number)

  const alsoNote = (r) => {
    if (!r.alsoIn?.length) return ''
    const each = r.alsoIn.map((a) =>
      a.kind === 'part'
        ? `${a.docPath} (a whole §${r.id} part)`
        : `${a.docPath}${a.title ? ` "${a.title}"` : ''}`,
    )
    return (
      ` | AMBIGUOUS: ${each.join(', ')} ALSO ${each.length > 1 ? 'have' : 'has'} a §${r.id}. Existence ` +
      'cannot decide this one; if the spec meant one of those, read the section there and treat this ' +
      'resolution as wrong.'
    )
  }
  const describe = (r) => {
    if (r.how === 'notation') {
      return `§${r.id} → the NOTATION itself, quoted in backticks — the spec talks about the form of a ` +
        'reference here, it does not make one'
    }
    if (r.how === 'work-order-point') {
      return (
        `§${r.id} → WORK-ORDER POINT ${r.id} (not a section; listed under the cross-referenced points)` +
        criterionNote(Number(r.id))
      )
    }
    const where = r.docPath === 'design.md' ? 'carried above' : 'read on demand'
    if (r.kind === 'part') {
      return `§${r.id} → ${r.docPath}, the whole §${r.id} part (${r.members.join(', ')}) — ${where}${alsoNote(r)}`
    }
    const title = r.section?.title ? ` "${r.section.title}"` : ''
    return `§${r.id} → ${r.docPath} §${r.id}${title} — ${where} [${r.how}]${alsoNote(r)}`
  }
  // The § an ADOPTED point cites: named on the map, never carried. The reader has
  // that point's text in front of him, so an unexplained § in it would be exactly
  // the gap this point closes — one line each, and one targeted read away.
  const ownIds = new Set(refs.map((r) => `${r.docPath ?? r.how}|${r.id}`))
  const adoptedRefs = []
  for (const a of adopted) {
    for (const r of resolveSectionRefs(a.point.body, reg, { pointNumbers }).refs) {
      const key = `${r.docPath ?? r.how}|${r.id}`
      if (ownIds.has(key)) continue
      ownIds.add(key)
      adoptedRefs.push({ ...r, viaPoint: a.number })
    }
  }
  const describeAdoptedRef = (r) => {
    const via = `cited by ADOPTED point ${r.viaPoint}`
    if (r.how === 'dangling') {
      return (
        `§${r.id} → ${via}, and it resolves in NO document searched — a stale reference in that point's ` +
        'own text. Report it; do not guess what it meant.'
      )
    }
    if (r.how === 'work-order-point') return `§${r.id} → WORK-ORDER POINT ${r.id} — ${via}`
    if (r.how === 'notation') return `§${r.id} → the NOTATION itself, quoted in backticks — ${via}`
    if (r.kind === 'part') return `§${r.id} → ${r.docPath}, the whole §${r.id} part — ${via}; read on demand`
    const title = r.section?.title ? ` "${r.section.title}"` : ''
    return `§${r.id} → ${r.docPath} §${r.id}${title} — ${via}; read on demand (not carried)`
  }
  const referenceMap = [
    ...refs
      .slice()
      .sort((a, b) => a.at - b.at)
      .map(describe),
    ...adopted.map(
      (a) =>
        `point ${a.number} → ADOPTED: its specification is binding here ("${a.phrase}") — carried in full ` +
        `above, depth ${a.depth} [${a.pattern}]`,
    ),
    ...adoptionBeyond.map(
      (b) =>
        `point ${b.number} → ADOPTED by point ${b.via} ("${b.phrase}") — past the depth cap ` +
        `${ADOPTION_DEPTH_CAP}, so NAMED, not carried`,
    ),
    ...adoptionAmbiguous.map((a) => {
      const title = criterionTitle(a.number)
      return (
        `point ${a.number} → adopting wording "${a.phrase}", but ${a.number} is ALSO CLAUDE.md §7.1 ` +
        `ACCEPTANCE CRITERION ${a.number}${title ? ` "${title}"` : ''}, which no resolver can tell from a ` +
        'point number. The specification is therefore NOT carried; if the sentence means the point, run: ' +
        `node scripts/point-brief.mjs ${a.number}`
      )
    }),
    ...adoptionQuoted.map(
      (q) =>
        `point ${q.number} → mentioned only: the adopting wording "${q.phrase}" stands inside a QUOTATION, ` +
        'so the spec talks ABOUT that wording instead of adopting it — identification line only',
    ),
    ...adoptedRefs.map(describeAdoptedRef),
  ]

  const pointRefIds = refs.filter((r) => r.how === 'work-order-point').map((r) => Number(r.id))
  const crossRefs = [...new Set([...extractPointRefs(point.body, point.number), ...pointRefIds])]
    .filter((n) => n !== point.number && !adoptedNumbers.has(n))
    .sort((a, b) => a - b)
  const referenced = crossRefs.map((n) => {
    const p = all.find((q) => q.number === n)
    // A number that is ALSO a §7.1 acceptance criterion carries the warning here
    // too: this list is where the wrong identification actually gets asserted.
    const criterion = criterionTitle(n)
    const base = p ? { number: n, found: true, done: p.done, title: pointTitle(p) } : { number: n, found: false }
    return criterion === null ? base : { ...base, criterion }
  })

  const notes = []
  const otherDocs = [...new Set(refs.filter((r) => r.docPath && r.docPath !== 'design.md').map((r) => r.docPath))]
  if (otherDocs.length) {
    notes.push(
      `the spec's § also point at ${otherDocs.join(', ')} — those sections are NAMED in the ` +
        'reference map, not carried; read the named section in that file if the point turns on it.',
    )
  }
  if (ranges.length) {
    notes.push(
      `the spec names the RANGE(S) ${ranges.join(', ')} — only the endpoints are resolved above; ` +
        'the sections BETWEEN them are part of the reference and must be read on demand.',
    )
  }
  if (!carried.length) notes.push('no design.md section is carried — the spec names none that resolves there.')
  notes.push(
    'This brief is generated. If the work order changed since, re-run: node scripts/point-brief.mjs ' +
      `${point.number}`,
  )

  // The caller supplies the git half (it needs I/O); the content half is computed
  // here, so a brief built through the library can never lack its fingerprint.
  const stamp = { head: null, dirty: null, ...revision, workOrder: workOrderFingerprint(tasksText) }
  const brief = assembleBrief({
    point,
    sections: carried,
    referenced,
    notes,
    referenceMap,
    revision: stamp,
    adopted,
    adoptionBeyond,
    sliceDocs,
    solShare,
  })
  return {
    brief,
    revision: stamp,
    point,
    refs,
    sections: carried,
    referenced,
    adopted,
    adoptionBeyond,
    adoptionAmbiguous,
    adoptionQuoted,
    adoptedRefs,
    sliceDocs,
    designRefs: carried.map((s) => s.id),
    claudeRefs: refs.filter((r) => r.docPath === 'CLAUDE.md').map((r) => r.id),
    otherDocRefs: refs.filter((r) => r.docPath && r.docPath !== 'design.md' && r.docPath !== 'CLAUDE.md'),
    tokens: estimateTokens(brief),
  }
}
