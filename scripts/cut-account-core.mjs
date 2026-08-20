// Pure parser and judge for the CUT ACCOUNT of work-order point 757.
//
// WHY IT EXISTS: point 757 cut the three documents every session loads before it
// does anything — the project's CLAUDE.md, the user's global CLAUDE.md and
// MEMORY.md. A cut of binding documents has exactly one failure mode that matters:
// a rule stops being written down and nobody notices, because nothing was ever
// enforcing it except the sentence that just disappeared. The saving is real and
// the loss is silent, which is the worst pairing a change can have.
//
// So the point demanded an ACCOUNT, in the shape blind-merge.mjs already uses for
// findings: every rule that leaves an always-loaded document is accounted for as
//
//   MOVED    to a named destination file that still says it,
//   COVERED  by a named guard that ENFORCES it — the guard being the authority
//            makes the prose a second copy, which is the whole premise of the cut,
//   DROPPED  on the user's explicit ruling, which is quoted with its date.
//
// This module reads that account and refuses the three ways it can rot: an entry
// with no account at all, a MOVED entry whose destination does not exist, and a
// COVERED entry naming a guard that is not wired into .claude/settings.json. The
// third is the one that matters most — a rule "covered" by a guard nobody runs is
// exactly the silent loss the account exists to prevent, and it is the state the
// project reached twice before (four built guards hung in no hook chain).
//
// Side-effect free: file reading and the exit code belong to the callers (the
// Vitest case in cut-account-core.test.mjs). Pinned by that test.
//
// `node:path/posix` is pure — it touches no filesystem — so importing it does
// not cost this core its side-effect freedom, and hand-rolled prefix arithmetic
// was exactly what a review caught getting the sibling and `..` cases wrong.
import { posix } from 'node:path'

/** The three accounts a cut rule may carry, and nothing else. */
export const ACCOUNTS = Object.freeze(['MOVED', 'COVERED', 'DROPPED'])

/** The always-loaded documents this account governs. */
export const CUT_SOURCES = Object.freeze(['CLAUDE.md', 'MEMORY.md', 'global-CLAUDE.md'])

/**
 * One account line, as the document writes it:
 *
 *   - `<source>` §<where> :: <the rule, one line> :: <ACCOUNT> -> <destination>
 *
 * The leading list marker and the backticks are optional; what is load-bearing is
 * the two `::` separators and the `->` before the destination. A DROPPED entry
 * still names a destination — the user's ruling that dropped it — because "the
 * user said so" without a date is how a drop becomes unreviewable.
 */
const LINE_RE = /^\s*[-*]?\s*`?([^`\s:]+(?:\s+§[^`:]*)?)`?\s*::\s*(.+?)\s*::\s*([A-Z]+)\s*->\s*(.+?)\s*$/

/** Parse the account document into entries, ignoring prose and headings. */
export function parseCutAccount(text) {
  const entries = []
  for (const raw of String(text ?? '').split('\n')) {
    const m = LINE_RE.exec(raw)
    if (!m) continue
    const [, where, rule, account, destination] = m
    const source = where.split(/\s+§/)[0].trim()
    entries.push({
      source,
      where: where.trim(),
      rule: rule.trim(),
      account: account.trim(),
      destination: destination.trim(),
      line: raw,
    })
  }
  return entries
}

/**
 * Judge the parsed account. `known` supplies what only the filesystem can answer:
 *
 *   files  — Set of repo-relative paths that exist (for MOVED destinations)
 *   guards — Set of guard script basenames WIRED in .claude/settings.json
 *            (for COVERED destinations); a built-but-unwired guard is not one.
 *
 * Returns { block, findings: [{ line, why }] }.
 */
export function evaluateCutAccount(entries, known = {}) {
  const files = known.files instanceof Set ? known.files : new Set(known.files ?? [])
  const guards = known.guards instanceof Set ? known.guards : new Set(known.guards ?? [])
  const findings = []
  const seen = new Set()

  for (const e of Array.isArray(entries) ? entries : []) {
    const at = `${e.where} — ${e.rule}`
    if (!CUT_SOURCES.includes(e.source)) {
      findings.push({ line: e.line, why: `${at}: names no cut document (got "${e.source}")` })
    }
    if (!ACCOUNTS.includes(e.account)) {
      findings.push({ line: e.line, why: `${at}: "${e.account}" is not one of ${ACCOUNTS.join('/')}` })
      continue
    }
    if (!e.destination) {
      findings.push({ line: e.line, why: `${at}: ${e.account} with no destination` })
      continue
    }
    if (e.account === 'MOVED') {
      // A destination may name a file, or a file plus the section inside it.
      const path = e.destination.split(/\s+§|\s+#/)[0].replace(/^`|`$/g, '').trim()
      if (!files.has(path)) {
        findings.push({ line: e.line, why: `${at}: MOVED to "${path}", which does not exist` })
      }
    }
    if (e.account === 'COVERED') {
      const guard = e.destination.replace(/^`|`$/g, '').split(/[\s(]/)[0].replace(/\.mjs$/, '')
      if (!guards.has(guard)) {
        findings.push({
          line: e.line,
          why: `${at}: COVERED by "${guard}", which is not wired in .claude/settings.json — a rule covered by a guard nobody runs is not covered`,
        })
      }
    }
    if (e.account === 'DROPPED' && !/\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/.test(e.destination)) {
      findings.push({ line: e.line, why: `${at}: DROPPED without the dated user ruling that dropped it` })
    }
    const key = JSON.stringify([e.where, e.rule.toLowerCase()])
    if (seen.has(key)) findings.push({ line: e.line, why: `${at}: accounted for twice` })
    seen.add(key)
  }

  return { block: findings.length > 0, findings }
}

/**
 * Does this destination lie OUTSIDE the repository? Two of the three cut
 * documents live in the user's home, so a caller running on a machine without
 * that tree — a CI runner has no `~/.claude` — cannot judge whether such a
 * destination exists, and must not read its absence as a lost rule. A
 * repository-relative destination is always judgeable and never external.
 */
export function isExternalDestination(path, root = '') {
  const p = String(path ?? '').trim()
  if (!p) return false
  if (p === '~' || p.startsWith('~/')) return true
  const base = String(root ?? '').trim()
  // Without a root nothing can be placed, so the answer is the side that
  // refuses to report a loss it cannot see.
  if (!base) return true
  // Compare NORMALIZED paths: `<root>/../outside/x.md` shares the root's prefix
  // as a string while resolving outside it, and a sibling `<root>-other/` shares
  // it too. Only `posix.normalize` plus the trailing separator tells them apart.
  const clean = posix.normalize(base).replace(/(?!^)\/+$/, '')
  const abs = posix.normalize(p.startsWith('/') ? p : posix.join(clean, p))
  return !(abs === clean || abs.startsWith(clean === '/' ? '/' : `${clean}/`))
}

/**
 * The user-level tree whose ABSENCE would excuse this destination, or '' when
 * nothing excuses it. Only THIS machine's `~/.claude` qualifies, and only for a
 * destination written against it: a runner without that tree cannot judge such a
 * path, so its absence is no evidence there.
 *
 * Everything else is judged normally, deliberately. A machine-absolute
 * `/home/someone/.claude/…` is indistinguishable from a typo of it, so it earns
 * no excuse — `accountDestinationFault` refuses that form outright, which is why
 * this function never has to guess. `~/missing.md` sits outside `.claude` and is
 * judged; bare `~` is the home directory itself and is judged.
 *
 * Pure — the caller does the existence test.
 */
export function userTreeRootOf(path, home = '') {
  const p = posix.normalize(String(path ?? '').trim().replace(/^~\/+/, '~/') || '.')
  const h = String(home ?? '')
    .trim()
    .replace(/(?!^)\/+$/, '')
  if (!h) return ''
  if (p !== '~/.claude' && !p.startsWith('~/.claude/')) return ''
  return posix.join(h, '.claude')
}

/**
 * Why this destination may not stand in the account, or '' when it may. The
 * account is read on machines that share no home directory, so a destination
 * must be either repository-relative or written against `~`. An absolute path
 * into somebody's home names a machine rather than a place, and no reader
 * elsewhere can tell it from a misspelling of one.
 */
export function accountDestinationFault(path, root = '') {
  const p = String(path ?? '').trim()
  if (!p) return 'the destination is empty'
  // Asked FIRST, and of every form: a `.` or `..` segment collapses before
  // anything reaches the filesystem, so `docs/definitely-missing.md/..` tests
  // the existence of `docs` and says nothing about the file it names. An
  // account destination is a place, and a place is written plainly.
  if (p.split('/').some((seg) => seg === '.' || seg === '..')) {
    return 'the destination climbs through `.` or `..`, which hides the component it names — write it plainly'
  }
  if (p === '~' || p.startsWith('~/')) return ''
  // Absolute means absolute, INCLUDING one that happens to name this checkout:
  // it reads as valid here and as a fault wherever the root differs, which is
  // the environment dependence this whole gate exists to be free of.
  if (p.startsWith('/')) {
    return 'an absolute destination names a machine, not a place — write it relative to the repository, or against `~`'
  }
  if (isExternalDestination(p, root)) {
    return 'the destination resolves outside the repository — write it against `~` if it belongs to the user tree'
  }
  return ''
}

/**
 * The destination as a path on THIS machine: `~` against the given home,
 * anything else unchanged for the caller to resolve against the repository.
 * It exists so the classification and the existence test cannot disagree — a
 * review found `~//.claude/…` classified against the user tree while resolving
 * to a filesystem-rooted `/.claude/…`, which excused a destination that was
 * simply missing. PURE.
 */
export function expandDestination(path, home = '') {
  const p = String(path ?? '').trim()
  const h = String(home ?? '')
    .trim()
    .replace(/(?!^)\/+$/, '')
  if (!p) return ''
  if (p === '~') return h
  if (!p.startsWith('~/')) return p
  return h ? posix.normalize(posix.join(h, p.slice(1))) : ''
}

/** Every guard basename actually wired into a hook chain of the settings object. */
export function wiredGuards(settings) {
  const names = new Set()
  for (const matchers of Object.values(settings?.hooks ?? {})) {
    for (const matcher of matchers ?? []) {
      for (const hook of matcher?.hooks ?? []) {
        for (const m of String(hook?.command ?? '').matchAll(/scripts\/([A-Za-z0-9._-]+)\.mjs/g)) {
          names.add(m[1])
        }
      }
    }
  }
  return names
}
