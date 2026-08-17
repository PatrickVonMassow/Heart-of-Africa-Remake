// WHEN A RULE CHANGES, EVERY PLACE THAT RESTATES IT MUST CHANGE WITH IT.
//
// WHY IT EXISTS (user 17.08.2026, measured the same evening): the model policy
// moved the hard cases out of the Fable lane, and the sentence describing that
// rule stood in NINE places — CLAUDE.md §6, docs/sol-routing.md, four script
// headers, the resume hook's two prompt texts and three memory entries. Changing
// the rule left eight of them asserting the old one, and one of those eight is
// read into EVERY session's context at start. This is not a one-off: the same
// shape produced "the fallback is Opus 4.8" in a memory the code has never
// matched, and a memory claiming a guard did not exist while it sat wired in the
// Stop chain.
//
// WHAT IT DOES NOT DO: judge whether two texts SAY the same thing. No mechanism
// here can read prose. What it can do is notice that the SOURCE moved while a
// restatement did not, and refuse the turn until somebody has looked at each one.
//
// HOW: a rule's source text lives in ONE place (the registry names the file and
// the line it starts at). Every restatement carries a STAMP — `rule:<id>@<hash>`
// in a comment or a footnote — holding the fingerprint of the source it was
// written against. Change the source and every stamp is stale at once; the guard
// then names each file, and re-stamping is per FILE, so the stamp cannot be
// refreshed for a place nobody opened.
//
// The fingerprint is over the source text with whitespace collapsed, so a
// re-wrap of the same sentence does not fire — only a change in the words does.
// Pure: no I/O, no clock. The reading and the blocking live in
// scripts/rule-echo.mjs and scripts/rule-echo-guard.mjs.

import { createHash } from 'node:crypto'

/**
 * The rules under watch, and where each is restated.
 *
 * `source.startsWith` is matched against the START of a line; the source text
 * runs from there to the next BLANK line (a paragraph) unless `until` names a
 * different stop. Keeping the anchor OUT of the watched document matters:
 * CLAUDE.md is word-budgeted, and marker comments would spend that budget.
 *
 * `echoes` names files, not passages. A file is stamped ONCE however often it
 * restates the rule — the stamp says "somebody read this file against that
 * version of the rule", which is exactly the check being made.
 *
 * `optional: true` marks a path outside the repository (the memory directory).
 * It is checked when present and silently skipped when not, so the guard cannot
 * fail a machine that has no memory tree.
 */
export const RULE_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'model-policy',
    title: 'which model authors, reviews and serves',
    source: Object.freeze({ file: 'CLAUDE.md', startsWith: '- **Model policy' }),
    echoes: Object.freeze([
      Object.freeze({ file: 'docs/sol-routing.md' }),
      Object.freeze({ file: 'scripts/author-routing-core.mjs' }),
      Object.freeze({ file: 'scripts/author-sol-core.mjs' }),
      Object.freeze({ file: 'scripts/batch-autostart-core.mjs' }),
      Object.freeze({ file: 'scripts/batch-resume-hook.mjs' }),
      Object.freeze({ file: 'scripts/model-guard-core.mjs' }),
      Object.freeze({ file: 'scripts/review-sol-core.mjs' }),
      Object.freeze({ file: 'scripts/sol-share-core.mjs' }),
      Object.freeze({ file: 'memory/fable-authors-hard-cases.md', optional: true }),
      Object.freeze({ file: 'memory/fable-sparingly.md', optional: true }),
      Object.freeze({ file: 'memory/serving-model-watch.md', optional: true }),
    ]),
  }),
])

/** The stamp a restating file carries: `rule:<id>@<hash>`. */
export const STAMP_PATTERN = /rule:([a-z0-9-]+)@([0-9a-f]{8})/g

/**
 * The fingerprint of a rule's source text.
 *
 * It ignores TRAILING whitespace and runs of spaces INSIDE a line, and nothing
 * else. Leading indentation and the line breaks are kept, because in Markdown
 * they carry meaning — indentation is list nesting, two trailing spaces are a
 * hard break (cross-vendor review, P2: the first version collapsed all
 * whitespace and its test blessed exactly that). The cost is a re-wrap of the
 * same sentence firing the guard, and that is the cheap direction: re-stamping
 * costs one command, a missed change costs the drift this exists to prevent.
 */
export function fingerprint(text) {
  const normalized = String(text ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 8)
}

/**
 * Cut a rule's source text out of its document.
 *
 * Returns '' when the anchor is gone — which is itself a finding the caller
 * reports rather than swallowing: a rule whose source line was renamed can no
 * longer be watched, and silently passing would be the failure this file exists
 * to prevent.
 */
export function sourceTextOf(documentText = '', source = {}) {
  const lines = String(documentText ?? '').split('\n')
  const startsWith = String(source.startsWith ?? '')
  if (!startsWith) return ''
  const start = lines.findIndex((line) => line.startsWith(startsWith))
  if (start < 0) return ''
  const until = source.until ? String(source.until) : ''
  const out = [lines[start]]
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (until ? line.startsWith(until) : line.trim() === '') break
    out.push(line)
  }
  return out.join('\n')
}

/**
 * The key under which a caller reports whether an optional echo's TREE exists —
 * the directory prefix of its path, e.g. `memory/`. `null` there means the tree
 * is absent (this machine keeps no memory entries) and the file may be skipped;
 * anything else means the tree is there and a missing file is a finding.
 */
export function treeKeyOf(echo = {}) {
  if (echo.tree) return String(echo.tree)
  const file = String(echo.file ?? '')
  const cut = file.indexOf('/')
  return cut < 0 ? '' : file.slice(0, cut + 1)
}

/** Every stamp a file carries, as `{ id, hash }` rows. */
export function stampsIn(text = '') {
  const rows = []
  for (const m of String(text ?? '').matchAll(STAMP_PATTERN)) {
    rows.push({ id: m[1], hash: m[2] })
  }
  return rows
}

/**
 * The verdict for one rule, given the texts that were read.
 *
 * `files` maps a repo-relative path to its content, or to `null` for a path that
 * does not exist. Everything here is decided from that map — the caller reads,
 * this decides.
 *
 * Verdict kinds:
 *   ok            every echo carries the current fingerprint
 *   stale         an echo's stamp names an older fingerprint (the ordinary case)
 *   unstamped     an echo carries no stamp for this rule at all
 *   source-gone   the anchor no longer matches any line — the watch is broken
 */
export function checkRule(rule = {}, files = {}) {
  const sourceText = sourceTextOf(files[rule?.source?.file] ?? '', rule?.source ?? {})
  if (!sourceText) {
    return {
      id: rule?.id ?? '',
      kind: 'source-gone',
      hash: '',
      stale: [],
      unstamped: [],
      detail: `the anchor "${rule?.source?.startsWith ?? ''}" matches no line in ${rule?.source?.file ?? '?'}`,
    }
  }
  const hash = fingerprint(sourceText)
  const stale = []
  const unstamped = []
  for (const echo of rule.echoes ?? []) {
    const text = files[echo.file]
    if (text === null || text === undefined) {
      // AN OPTIONAL PATH IS SKIPPED ONLY WHEN ITS WHOLE TREE IS ABSENT
      // (cross-vendor review, P1). Skipping every missing optional file could
      // not tell "this machine has no memory directory" from "a registered
      // restatement was deleted or renamed", so a rule could leave the watch by
      // being deleted. The caller reports the tree's presence separately.
      const treeGone = echo.optional && files[treeKeyOf(echo)] === null
      if (!treeGone) unstamped.push({ file: echo.file, had: '' })
      continue
    }
    const mine = stampsIn(text).filter((s) => s.id === rule.id)
    if (!mine.length) unstamped.push({ file: echo.file, had: '' })
    else if (!mine.some((s) => s.hash === hash)) stale.push({ file: echo.file, had: mine[0].hash })
  }
  const kind = stale.length ? 'stale' : unstamped.length ? 'unstamped' : 'ok'
  return { id: rule.id, kind, hash, stale, unstamped, detail: '' }
}

/** Every rule's verdict, in registry order. */
export function checkAll(registry = RULE_REGISTRY, files = {}) {
  return (Array.isArray(registry) ? registry : []).map((rule) => checkRule(rule, files))
}

/**
 * Files that carry a stamp for a rule they are not registered under.
 *
 * The honest half of the answer to "what about a restatement nobody registered"
 * (cross-vendor review, P1): nothing can FIND a new restatement — that needs
 * reading prose. What it can catch is the half that leaves a trace, a file
 * someone stamped without adding it to the registry, and a rule id that no
 * longer exists at all. `stamped` maps a path to its content.
 */
export function unregisteredStamps(registry = RULE_REGISTRY, stamped = {}) {
  const known = new Map()
  for (const rule of Array.isArray(registry) ? registry : []) {
    known.set(rule.id, new Set((rule.echoes ?? []).map((e) => e.file)))
  }
  const out = []
  for (const [file, text] of Object.entries(stamped ?? {})) {
    for (const { id } of stampsIn(text ?? '')) {
      if (!known.has(id)) out.push({ file, id, why: 'no such rule' })
      else if (!known.get(id).has(file)) out.push({ file, id, why: 'not in this rule’s echo list' })
    }
  }
  return out
}

/** Which files a caller has to read to decide everything. */
export function filesToRead(registry = RULE_REGISTRY) {
  const out = []
  for (const rule of Array.isArray(registry) ? registry : []) {
    if (rule?.source?.file) out.push(rule.source.file)
    for (const echo of rule?.echoes ?? []) out.push(echo.file)
  }
  return [...new Set(out)]
}

/**
 * Does the quote a stamper offered really stand in that file?
 *
 * The friction the stamp needs (cross-vendor review, P0: `--stamp <file>` alone
 * could be scripted straight down the guard's own list without a single file
 * being opened). Requiring a verbatim phrase FROM the file means the stamper had
 * to look inside it. That is not proof of understanding and does not pretend to
 * be one — a determined agent can still grep a phrase out — but it cannot be
 * satisfied from a list of filenames, which is what the hole was.
 *
 * Whitespace is normalised on both sides, so a quote copied across a line break
 * still matches. The stamp itself does not count: it is the one string every
 * file on the list is guaranteed to contain.
 */
export function quoteIsInFile(text = '', quote = '', { minLength = 24 } = {}) {
  const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const needle = flat(quote)
  if (needle.length < minLength) return { ok: false, reason: `the quote must be at least ${minLength} characters` }
  if (/^rule:[a-z0-9-]+@[0-9a-f]{8}$/.test(needle)) return { ok: false, reason: 'the stamp itself is not a quote from the text' }
  if (!flat(text).includes(needle)) return { ok: false, reason: 'that phrase does not occur in the file' }
  return { ok: true, reason: '' }
}

/**
 * The text a stamped file should carry, given the current fingerprint.
 *
 * Handed to the human or agent doing the re-stamping rather than written by a
 * command that rewrites every file at once: the point of the stamp is that
 * somebody opened that file and checked the sentence in it.
 */
export function stampFor(id = '', hash = '') {
  return `rule:${id}@${hash}`
}

/** Replace this rule's stamp in one file's text. Returns the new text, or ''. */
export function restamp(text = '', id = '', hash = '') {
  const current = String(text ?? '')
  const pattern = new RegExp(`rule:${String(id).replace(/[^a-z0-9-]/gi, '')}@[0-9a-f]{8}`, 'g')
  if (!pattern.test(current)) return ''
  return current.replace(pattern, stampFor(id, hash))
}

/** The blocking message, or '' when nothing is owed. PURE. */
export function formatVerdict(results = [], strays = []) {
  const bad = (Array.isArray(results) ? results : []).filter((r) => r.kind !== 'ok')
  const loose = Array.isArray(strays) ? strays : []
  if (!bad.length && loose.length) {
    return [
      'rule-echo: a file carries a rule stamp the registry does not know.',
      '',
      ...loose.map((s) => `  ${s.file} → rule:${s.id} (${s.why})`),
      '',
      'Add it to RULE_REGISTRY in scripts/rule-echo-core.mjs, or remove the stamp.',
    ].join('\n')
  }
  if (!bad.length) return ''
  const lines = ['rule-echo: a rule moved and its restatements did not.', '']
  for (const r of bad) {
    if (r.kind === 'source-gone') {
      lines.push(`  ${r.id}: THE WATCH IS BROKEN — ${r.detail}`)
      lines.push('    Fix the anchor in scripts/rule-echo-core.mjs (RULE_REGISTRY), not the guard.')
      continue
    }
    lines.push(`  ${r.id} → ${r.hash}`)
    for (const s of r.stale) lines.push(`    stale     ${s.file} (stamped ${s.had})`)
    for (const u of r.unstamped) lines.push(`    unstamped ${u.file}`)
  }
  for (const s of loose) lines.push(`  stray stamp ${s.file} → rule:${s.id} (${s.why})`)
  lines.push('')
  lines.push('READ each file above and make its wording match the rule — then stamp it:')
  lines.push('  node scripts/rule-echo.mjs --stamp <file> --quote "<a phrase from that file>"')
  lines.push('The quote must occur in the file, so the stamp cannot be set from the list alone.')
  lines.push('A file whose wording is already right is stamped just the same; the stamp says')
  lines.push('somebody looked, not that something changed.')
  return lines.join('\n')
}
