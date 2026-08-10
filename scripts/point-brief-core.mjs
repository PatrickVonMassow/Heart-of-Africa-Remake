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

/**
 * WHAT MAKES A POINT A RENDER POINT — the trigger for the verification ladder
 * below (point 595). Read off the SPEC's own wording, because that is all a
 * brief has: the files a point will touch are not known until it is worked.
 *
 * DELIBERATELY GENEROUS. The two errors are not symmetric: a missed render
 * point is an agent replaying whole suites because nobody told it about the
 * cheap rung — the exact cost this point exists to remove — while a false
 * positive costs ~250 tokens of advice that is merely irrelevant. So a browser
 * suite named by name counts, and so does any word that means the rendered
 * picture, the renderer, or a backend.
 */
const RENDER_WORDS =
  /\b(?:render(?:s|ed|er|ing)?|re-render|shader|tsl|screenshot|frame|picture|pixel|backend|webgpu|webgl|graphic|visual|camera|zoom|texture|material|lighting|shadow|terrain|water|river|wildlife|animal|herd|geometry|mesh|scene|sky|fog|hud|overlay|settlement|village|panorama|silhouette|animation|animated|draw|drawn|paint(?:s|ed)?)\w*/i
/** The browser suites (scripts/verify/*.mjs that drive a page). `docs` is the
 *  one pure-Node check and is not one, so naming it is no render signal. */
const RENDER_SUITE =
  /\b(?:startup|world|i18n|flow|health|events|collision|handwriting|polish|gamepad|touch|voice|settings|enrichments|invariants|benchmark|report)\.mjs\b/i

/** Does this spec describe work that can move the rendered picture? Total. */
export function isRenderPoint(spec) {
  const text = String(spec ?? '')
  return RENDER_WORDS.test(text) || RENDER_SUITE.test(text)
}

/**
 * THE VERIFICATION LADDER (point 595, measure 5 of point 572). Carried by the
 * BRIEF rather than by a guard, for the same reason as the call discipline
 * above: "you replayed a whole suite where one section would have done" is not
 * decidable after the fact, and the rule is only worth anything BEFORE the run.
 *
 * WHY IT IS OWED AT ALL. Verification is 47.0 % of the weighted spend and 37.4 %
 * of the machine hours; the ten costliest points hold 64.4 % of all
 * point-assigned verification tokens; eight of ten recorded `enrichments` runs
 * FAILED while still writing all 37 frames at 951–1029 s each. And the cheapest
 * rung already existed and was unused: point 566 built `--section`, `enrichments`
 * declares nine of them, and on 09.08.2026 nothing routed anyone to it — not one
 * recorded run was partial, and the three agents commissioned that evening were
 * not told it exists. This block is that routing.
 *
 * IT MUST NOT READ AS A DISCOUNT ON THE PROOF, which is why every rung says what
 * it does NOT prove, why the whole-suite/both-backend picture proof is stated in
 * the same breath, and why "a red is a red" stands here rather than a
 * critical-versus-cosmetic class nobody could apply honestly.
 */
export const VERIFICATION_LADDER = [
  'THE VERIFICATION LADDER — THIS POINT CAN MOVE THE PICTURE (point 595). Climb it; do not',
  'start at the top:',
  '- WHILE YOU ARE STILL FIXING, run the CHEAPEST rung that covers what you changed, on the',
  '  everyday WebGPU lane (unpinned `VERIFY_GL`):',
  '  1. ONE SECTION of one suite — `npm test -- <suite> --section=<name>` (point 566). It runs',
  '     that block\'s setup and its checks and nothing else. The names come from the suite\'s own',
  '     source: `node scripts/verify/run-all.mjs <suite> --section=nope` refuses the unknown name',
  '     and PRINTS every real one, in a tenth of a second and without booting a browser.',
  '  2. then the ONE suite that covers the change — `npm test -- <suite>`;',
  '  3. the whole set only for the final proof.',
  '  The unit layer has the SAME ladder, not a second rule: a path filter',
  '  (`npx vitest run <path>`), `vitest --changed` and `tsc --incremental` are legal while you',
  '  are repairing.',
  '  An iteration run is never CREDITED as coverage, so let an expensive suite STOP at its',
  '  first failure while you iterate; run it to completion only for the final proof.',
  '- AN INCREMENTAL GREEN IS NEVER AN ACCEPTANCE. A `--section` run is recorded PARTIAL and',
  '  `runVerdict` refuses it as coverage whatever its exit code; a path-filtered unit run',
  '  proves that path and nothing around it. The proof is the FULL fast gate (`npm run build`,',
  '  `npm run lint`, `npm run test:unit`) plus the WHOLE suite, unfiltered.',
  '- THE FULL PROOF RUNS EXACTLY ONCE, ON THE EXACT MERGE CANDIDATE. Merge `main` INTO your',
  '  branch FIRST, then verify that tree — the one that will land — and REPORT the `git HEAD`',
  '  you verified (`git rev-parse HEAD`), which is the evidence that the verified tree is the',
  '  merged one. Verifying before the sync proves a tree nobody merges; merging FIRST and',
  '  verifying afterwards cost ~30 turns of a block-loop on 24.07.2026, so the both-backend',
  '  PICTURE proof stays ON THE BRANCH, before the merge — a shared final regression over',
  '  several finished branches may replace the repeated REGRESSION, never that picture.',
  '- A RED IS A RED. There is no "cosmetic" class that may be waved through: an iteration run',
  '  is not credited either way, so the distinction buys nothing and only opens a door.',
]

const HEADER = [
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
  '- Never `git checkout <file>` on a file holding uncommitted work — it discards it.',
  '- Every commit records its AUTHORING MODEL in the co-author trailer. That trailer is the',
  '  only machine-readable evidence `scripts/model-guard.mjs` has, so the bare',
  '  `Co-Authored-By: Claude <noreply@anthropic.com>` names no model and trips the tripwire,',
  '  which STOPS the batch. Write your own model:',
  '  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.',
  '',
  ...CALL_DISCIPLINE,
]

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

/** Assemble the brief text from already-resolved parts (pure, no lookups). */
export function assembleBrief({ point, sections = [], referenced = [], notes = [], referenceMap = [], ladder = [], revision }) {
  const out = [
    `=== DELEGATION BRIEF — WORK-ORDER POINT ${point.number} (${point.done ? 'DONE/ARCHIVED' : 'OPEN'}) ===`,
    'Assembled by scripts/point-brief.mjs from the work order, design.md and the research docs.',
    formatRevisionLine(revision ?? {}),
    '',
    ...HEADER,
    '',
    `--- THE POINT (verbatim, work-order point ${point.number}) ---`,
    point.body,
    '',
  ]
  // AFTER the spec, never before it: the ladder is how this point is proven, and
  // it is only readable once the reader knows what the point is.
  if (ladder.length) out.push(...ladder, '')
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
export function buildBrief({ tasksText, designText, claudeText = '', docs = [], number, registry, revision = {} }) {
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
  const referenceMap = refs
    .slice()
    .sort((a, b) => a.at - b.at)
    .map(describe)

  const pointRefIds = refs.filter((r) => r.how === 'work-order-point').map((r) => Number(r.id))
  const crossRefs = [...new Set([...extractPointRefs(point.body, point.number), ...pointRefIds])]
    .filter((n) => n !== point.number)
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
  const render = isRenderPoint(point.body)
  const brief = assembleBrief({
    point,
    sections: carried,
    referenced,
    notes,
    referenceMap,
    ladder: render ? VERIFICATION_LADDER : [],
    revision: stamp,
  })
  return {
    brief,
    revision: stamp,
    render,
    point,
    refs,
    sections: carried,
    referenced,
    designRefs: carried.map((s) => s.id),
    claudeRefs: refs.filter((r) => r.docPath === 'CLAUDE.md').map((r) => r.id),
    otherDocRefs: refs.filter((r) => r.docPath && r.docPath !== 'design.md' && r.docPath !== 'CLAUDE.md'),
    tokens: estimateTokens(brief),
  }
}
