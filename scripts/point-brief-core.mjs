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
// This module is pure: text in, text out, no I/O. scripts/point-brief.mjs is the
// I/O wrapper (same split as doc-budget-core.mjs / doc-budget-guard.mjs).

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
  const others = docs
    .filter((d) => d && d.path && d.path !== 'design.md' && d.path !== 'CLAUDE.md')
    .map((d) => make(d.path, d.text ?? ''))
  return { design, claude, others, list: [design, claude, ...others] }
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
 *   5. exactly one other document the spec named that has it;
 *   6. a work-order POINT number (`§264 combat` — sloppy, but a real habit);
 *   7. nothing — the hard failure, which names every document searched.
 */
export function resolveSectionRefs(spec, registry, { pointNumbers = new Set() } = {}) {
  const text = normalise(spec)
  const mentions = docMentions(text, registry)
  const namedDocs = [...new Set(mentions.map((m) => m.doc))]
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
    let hit = null
    for (const [how, doc] of candidates) {
      if (!doc) continue
      const found = holds(doc, id)
      if (found) {
        hit = { how, doc, found }
        break
      }
    }
    if (!hit && /^\d+$/.test(id) && pointNumbers.has(Number(id))) {
      hit = { how: 'work-order-point', doc: null, found: null }
    }
    const key = `${hit?.doc?.path ?? hit?.how ?? 'dangling'}|${id}`
    if (seen.has(key)) {
      seen.get(key).occurrences.push(at)
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
    }
    seen.set(key, ref)
    refs.push(ref)
  }

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
]

/** Assemble the brief text from already-resolved parts (pure, no lookups). */
export function assembleBrief({ point, sections = [], referenced = [], notes = [], referenceMap = [] }) {
  const out = [
    `=== DELEGATION BRIEF — WORK-ORDER POINT ${point.number} (${point.done ? 'DONE/ARCHIVED' : 'OPEN'}) ===`,
    'Assembled by scripts/point-brief.mjs from the work order, design.md and the research docs.',
    '',
    ...HEADER,
    '',
    `--- THE POINT (verbatim, work-order point ${point.number}) ---`,
    point.body,
    '',
  ]
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
  return out.join('\n')
}

/**
 * The whole job: point number → brief text. Throws BriefError on an unknown point
 * number and on a `§` that resolves in none of the documents searched.
 */
export function buildBrief({ tasksText, designText, claudeText = '', docs = [], number, registry }) {
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

  const describe = (r) => {
    if (r.how === 'work-order-point') {
      return `§${r.id} → WORK-ORDER POINT ${r.id} (not a section; listed under the cross-referenced points)`
    }
    const where = r.docPath === 'design.md' ? 'carried above' : 'read on demand'
    if (r.kind === 'part') {
      return `§${r.id} → ${r.docPath}, the whole §${r.id} part (${r.members.join(', ')}) — ${where}`
    }
    const title = r.section?.title ? ` "${r.section.title}"` : ''
    return `§${r.id} → ${r.docPath} §${r.id}${title} — ${where} [${r.how}]`
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
    return p ? { number: n, found: true, done: p.done, title: pointTitle(p) } : { number: n, found: false }
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

  const brief = assembleBrief({ point, sections: carried, referenced, notes, referenceMap })
  return {
    brief,
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
