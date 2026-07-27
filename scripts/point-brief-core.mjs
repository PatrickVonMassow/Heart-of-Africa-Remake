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
// point number, and a design.md section the document no longer contains (a
// renumbering must error, not quietly drop a section). Everything the resolver
// cannot claim with confidence is NAMED in the brief's notes, never dropped.
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
 */
export const BRIEF_TOKEN_CEILING = 24000

/** How far back a `§` reference may look for the document it belongs to. */
const DOC_LOOKBACK = 220

/**
 * Prose names for documents the work order cites without their filename. Only
 * unambiguous ones: "retrospective §3.12" is the retrospective's section, and
 * without this the resolver would call it a dangling design.md section.
 */
export const DOC_ALIASES = [
  { re: /retrospekti\w*|retrospecti\w*/gi, doc: 'docs/analysis_de/retrospektive-zusammenarbeit.md' },
]

const normalise = (text) => String(text ?? '').replace(/\r\n/g, '\n')

/**
 * Every point of the work order (open TASKS.md and archived, concatenated by
 * readTasksAll). A point starts at `- [ ] N.` / `- [x] N.` and runs until the
 * next such line or the next `## ` section heading.
 */
export function parseWorkOrderPoints(text) {
  const lines = normalise(text).split('\n')
  const points = []
  let current = null
  const close = () => {
    if (current) {
      while (current.bodyLines.length && current.bodyLines.at(-1).trim() === '') current.bodyLines.pop()
      current.body = current.bodyLines.join('\n')
      delete current.bodyLines
      points.push(current)
      current = null
    }
  }
  for (const line of lines) {
    const start = /^- \[([ xX])\] (\d+)\.\s?(.*)$/.exec(line)
    if (start) {
      close()
      current = {
        number: Number(start[2]),
        done: start[1].toLowerCase() === 'x',
        bodyLines: [start[3]],
      }
      continue
    }
    if (/^#{1,6} /.test(line)) {
      close()
      continue
    }
    if (current) current.bodyLines.push(line.replace(/^ {2}/, ''))
  }
  close()
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

/**
 * The design.md sections a spec references, plus the ones it attributes to
 * ANOTHER document. Attribution is local: a `§` belongs to the nearest `*.md`
 * name within DOC_LOOKBACK characters before it, and to design.md when no
 * document is named nearby (design.md being the design authority — the plain
 * `§4.2` style in this queue always means it).
 *
 * One id is decided ONCE for the whole spec, and an EXPLICIT attribution beats
 * the default wherever it stands: point 365 names the retrospective's `§3.27`
 * beside the file and then again bare, and a per-occurrence rule would have made
 * the bare one a dangling design.md section — a false hard failure.
 *
 * References to another document are not design sections, so they are not
 * resolved; they are reported so the reader knows they exist (never omit silently).
 */
export function extractDesignSectionRefs(spec) {
  const text = normalise(spec)
  const docs = []
  for (const m of text.matchAll(/[A-Za-z0-9_./-]*[A-Za-z0-9_-]\.md\b/g)) {
    docs.push({ at: m.index, name: m[0] })
  }
  for (const alias of DOC_ALIASES) {
    for (const m of text.matchAll(alias.re)) docs.push({ at: m.index, name: alias.doc })
  }
  docs.sort((a, b) => a.at - b.at)
  const seen = new Map() // id -> { explicitDesign, foreignDoc }
  for (const m of text.matchAll(/§+\s*(\d+(?:\.\d+)*)/g)) {
    const id = m[1].replace(/\.$/, '')
    let owner = null
    for (const d of docs) {
      if (d.at < m.index && m.index - d.at <= DOC_LOOKBACK) owner = d
    }
    const entry = seen.get(id) ?? { explicitDesign: false, foreignDoc: null }
    if (owner) {
      if (/(^|\/)design\.md$/i.test(owner.name)) entry.explicitDesign = true
      else entry.foreignDoc = entry.foreignDoc ?? owner.name
    }
    seen.set(id, entry)
  }
  const design = []
  const foreign = []
  for (const [id, entry] of seen) {
    if (entry.foreignDoc && !entry.explicitDesign) foreign.push(`${entry.foreignDoc} §${id}`)
    else design.push(id)
  }
  design.sort(compareSectionIds)
  return { design, foreign }
}

/** Numeric section order: 4.2 before 4.10, 4 before 4.1. */
export function compareSectionIds(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d) return d
  }
  return 0
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
  for (const m of text.matchAll(/\bpts?\.\s*(\d+(?:\s*[/,]\s*\d+)*)/gi)) {
    for (const n of m[1].split(/[/,]/)) add(n.trim())
  }
  return found.sort((a, b) => a - b)
}

/**
 * design.md by section id. A section's text runs from its heading to the next
 * heading of the SAME OR HIGHER level, so `### 19.8` stops at `### 19.16` while
 * `## 19` spans its subsections. For a top-level section only the intro before
 * the first subsection is kept, plus an index of the subsection titles: pulling
 * a whole chapter (§19 is ~400 lines) would defeat the brief, and the reader is
 * told it may read a NAMED subsection on demand.
 */
export function parseDesignSections(designText) {
  const lines = normalise(designText).split('\n')
  const heads = []
  lines.forEach((line, i) => {
    const m = /^(#{2,4})\s+(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(line)
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
    sections.set(h.id, {
      id: h.id,
      title: h.title,
      heading: lines[h.line],
      children,
      text: lines.slice(h.line, bodyEnd).join('\n').trimEnd(),
    })
  })
  return sections
}

/** Resolve section ids; a missing one is a hard failure, never an omission. */
export function resolveDesignSections(designText, ids) {
  const sections = parseDesignSections(designText)
  const missing = ids.filter((id) => !sections.has(id))
  if (missing.length) {
    throw new BriefError(
      `design.md no longer contains section(s) ${missing.map((m) => `§${m}`).join(', ')} — the spec ` +
        'references them (a renumbering?). Fix the reference in the work order or restore the ' +
        'section; the brief must not silently omit a section its reader was promised.',
    )
  }
  return ids.map((id) => sections.get(id))
}

/**
 * Sort `§`-ids the resolver could not attribute to another document into what
 * they REALLY are, because the work order writes three things the same way:
 *   - a design.md section          → carried verbatim,
 *   - a CLAUDE.md section (`§7.1`, `§7.2` — acceptance and self-verification are
 *     cited constantly without naming the file) → named, read on demand,
 *   - a work-order POINT (`§264 combat`, `§219 ring marker` — a sloppy but real
 *     habit) → resolved as a cross-referenced point.
 * Only what is none of the three is dangling, and that is the hard failure.
 */
export function classifySectionRefs({ ids, designText, claudeText = '', tasksText = '' }) {
  const design = parseDesignSections(designText)
  const claude = parseDesignSections(claudeText)
  const points = new Set(parseWorkOrderPoints(tasksText).map((p) => p.number))
  const out = { designIds: [], claudeIds: [], pointNumbers: [], missing: [] }
  for (const id of ids) {
    if (design.has(id)) out.designIds.push(id)
    else if (claude.has(id)) out.claudeIds.push(id)
    else if (/^\d+$/.test(id) && points.has(Number(id))) out.pointNumbers.push(Number(id))
    else out.missing.push(id)
  }
  return out
}

const HEADER = [
  'HOW TO USE THIS BRIEF — READ THIS FIRST',
  '- This brief IS your spec. Do NOT read TASKS.md or docs/tasks-archive.md or design.md',
  '  WHOLESALE: measured, that is ~59k + ~46k tokens per agent, uncached, and avoiding it is',
  '  the entire purpose of this brief.',
  '- You MAY read any NAMED file, and any NAMED design.md section, on demand. The ban is on',
  '  wholesale reads, not on targeted lookups — read the source files the spec names.',
  '- If this brief proves INSUFFICIENT, or contradicts the code you find: ESCALATE (stop and',
  '  report what is missing) rather than guess. A guessed spec costs a rebuild, which is more',
  '  expensive than the question.',
]

/** Assemble the brief text from already-resolved parts (pure, no lookups). */
export function assembleBrief({ point, sections = [], referenced = [], notes = [] }) {
  const out = [
    `=== DELEGATION BRIEF — WORK-ORDER POINT ${point.number} (${point.done ? 'DONE/ARCHIVED' : 'OPEN'}) ===`,
    'Assembled by scripts/point-brief.mjs from the work order and design.md.',
    '',
    ...HEADER,
    '',
    `--- THE POINT (verbatim, work-order point ${point.number}) ---`,
    point.body,
    '',
  ]
  if (sections.length) {
    out.push('--- DESIGN SECTIONS THE SPEC REFERENCES (design.md, verbatim) ---')
    for (const s of sections) {
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
  if (notes.length) {
    out.push('--- NOTES ---', ...notes.map((n) => `- ${n}`), '')
  }
  return out.join('\n')
}

/**
 * The whole job: point number → brief text. Throws BriefError on an unknown
 * point number and on a dangling design.md section.
 */
export function buildBrief({ tasksText, designText, claudeText = '', number }) {
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
  const { design: candidates, foreign } = extractDesignSectionRefs(point.body)

  // A CLAUDE.md-attributed `§` that CLAUDE.md does NOT contain was mis-attributed
  // by proximity (a bare `§288 combat` standing near a CLAUDE.md mention). Send it
  // back through the classifier — but as a NOTE if it resolves to nothing, never as
  // a hard failure: only a reference we believe means design.md may block a brief.
  const claudeSections = parseDesignSections(claudeText)
  const foreignNotes = []
  const reclassify = []
  for (const f of foreign) {
    const m = /^(.*) §(\d+(?:\.\d+)*)$/.exec(f)
    if (m && /(^|\/)CLAUDE\.md$/i.test(m[1]) && !claudeSections.has(m[2])) reclassify.push(m[2])
    else foreignNotes.push(f)
  }

  const sorted = classifySectionRefs({ ids: candidates, designText, claudeText, tasksText })
  const extra = classifySectionRefs({ ids: reclassify, designText, claudeText, tasksText })
  sorted.designIds = [...new Set([...sorted.designIds, ...extra.designIds])].sort(compareSectionIds)
  sorted.claudeIds = [...new Set([...sorted.claudeIds, ...extra.claudeIds])]
  sorted.pointNumbers = [...new Set([...sorted.pointNumbers, ...extra.pointNumbers])]
  for (const id of extra.missing) foreignNotes.push(`§${id} (unresolved — no such section or point)`)
  if (sorted.missing.length) {
    // Reuse the strict resolver so the failure text has exactly one wording.
    resolveDesignSections(designText, sorted.missing)
  }
  const sections = resolveDesignSections(designText, sorted.designIds)
  const refs = [...new Set([...extractPointRefs(point.body, point.number), ...sorted.pointNumbers])]
    .filter((n) => n !== point.number)
    .sort((a, b) => a - b)
  const referenced = refs.map((n) => {
    const p = all.find((q) => q.number === n)
    return p
      ? { number: n, found: true, done: p.done, title: pointTitle(p) }
      : { number: n, found: false }
  })
  const notes = []
  if (foreignNotes.length) {
    notes.push(
      `the spec also names section(s) of OTHER documents: ${foreignNotes.join(', ')} — not carried ` +
        'here; read that named section on demand if the point turns on it.',
    )
  }
  if (sorted.claudeIds.length) {
    notes.push(
      `the spec cites CLAUDE.md ${sorted.claudeIds.map((i) => `§${i}`).join(', ')} (no design.md section ` +
        'of that number exists) — CLAUDE.md is in your context already; read that section there.',
    )
  }
  if (sorted.pointNumbers.length) {
    notes.push(
      `the spec writes §${sorted.pointNumbers.join(', §')} where a WORK-ORDER POINT number is meant — ` +
        'listed under the cross-referenced points above.',
    )
  }
  if (!sorted.designIds.length) notes.push('the spec names no design.md section.')
  notes.push(
    'This brief is generated. If the work order changed since, re-run: node scripts/point-brief.mjs ' +
      `${point.number}`,
  )
  const brief = assembleBrief({ point, sections, referenced, notes })
  return {
    brief,
    point,
    sections,
    referenced,
    designRefs: sorted.designIds,
    claudeRefs: sorted.claudeIds,
    foreignRefs: foreignNotes,
    tokens: estimateTokens(brief),
  }
}
