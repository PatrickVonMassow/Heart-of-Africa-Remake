// Pure planning core for authorship-cut mechanism reviews.
//
// A range is not one authorship unit.  A file changed only by one vendor can be
// reviewed as part of that vendor's file group; a file changed by both vendors
// cannot.  The latter is cut at commit boundaries, so no reviewer is ever asked
// to judge its own contribution hidden inside somebody else's file group.
import { sameModel } from './mechanism-review-core.mjs'

export const REVIEWER_CANDIDATES = Object.freeze(['GPT-5.6 Sol', 'Opus 5', 'Fable 5', 'Opus 4.8'])

const uniq = (xs) => [
  ...new Set((xs ?? []).filter((value) => value !== null && value !== undefined && String(value)).map(String)),
]
const keyFor = (sha, file) => `${String(sha)}\0${String(file)}`

// CONTROL CHARACTERS, NOT PRINTABLE MARKERS (round-4 pass 3, and the reason
// this parser must keep them): a printable sentinel is a legal path substring,
// so a root file literally NAMED `__C__<sha>__F__<epoch>` forged a record
// boundary and attributed the paths after it to a sha of the forger's choosing.
// With `core.quotepath=on` a real path holding 0x1E/0x1F is printed QUOTED
// (octal escapes inside quotes), so a RAW separator byte can only ever come
// from the --format string itself — the boundary is unforgeable by file name.
// Spelled via fromCharCode so this source file stays free of raw control bytes.
const RANGE_RECORD = String.fromCharCode(0x1e)
const RANGE_FIELD = String.fromCharCode(0x1f)
// A header line, WHOLE: sentinel, 40-hex sha, epoch — and nothing free-text
// (escalation round, pass 2). The header used to carry the subject and the
// trailers behind two more separators, and a legal SUBJECT containing the
// separator shifted the real trailer field out of the destructuring — the
// authoring model then read as empty or attacker-chosen, and the self-review
// refusal could not bite. Machine-shaped fields cannot contain the separator;
// the free-text facts travel per commit through their own single-format git
// calls, where there is no separator to forge.
const RANGE_HEADER = new RegExp(`^${RANGE_RECORD}([0-9a-f]{40})${RANGE_FIELD}(\\d+)$`)

// %x1e/%x1f are expanded by GIT, so the arguments stay ASCII and the separators
// reach the output as raw control bytes no quoted path can carry (round-4
// pass 3). AS AN ARGS ARRAY, never a shell line (round-5 pass 3): cmd.exe
// expands %-spans as environment variables before git runs.
export const mechanismLogCommand = (base, head) => [
  '-c',
  'core.quotepath=on',
  'log',
  '--format=%x1e%H%x1f%ct',
  '--name-only',
  '--no-renames',
  '--diff-merges=cc',
  '--reverse',
  `${base}..${head}`,
]

export function parseRangeLog(out, { decodePath = (path) => path } = {}) {
  const commits = []
  let current = null
  const finish = () => {
    if (current) commits.push(current)
    current = null
  }
  for (const raw of String(out ?? '').split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const header = RANGE_HEADER.exec(line)
    if (header) {
      finish()
      current = { sha: header[1], at: Number(header[2]) * 1000 || 0, files: [] }
    } else if (current && line) {
      current.files.push(decodePath(line))
    }
  }
  finish()
  return commits
}

export function vendorOf(model) {
  const value = String(model ?? '').toLowerCase()
  if (/\bsol\b|\bgpt[- ]?5(?:\.|\b)/.test(value) || /openai\.com/.test(value)) return 'openai'
  if (/\b(?:claude|opus|fable|sonnet|haiku)\b/.test(value) || /anthropic\.com/.test(value)) return 'anthropic'
  return 'unknown'
}

export function commitAuthors(commit = {}) {
  return uniq(Array.isArray(commit.authorModels) ? commit.authorModels : [commit.authorModel])
}

export function eligibleReviewer(authors = [], candidates = REVIEWER_CANDIDATES) {
  const writtenBy = uniq(authors)
  // No authorship fact means no candidate can prove it is the second pair of
  // eyes. The model guard normally supplies the trailer, but a hand-built or
  // historical commit must become an explicit unreviewable pass, not an
  // assignment made from absence.
  if (!writtenBy.length) return ''
  const vendors = new Set(writtenBy.map(vendorOf).filter((v) => v !== 'unknown'))
  return (
    (candidates ?? []).find((candidate) => {
      if (writtenBy.some((author) => sameModel(candidate, author))) return false
      const candidateVendor = vendorOf(candidate)
      return vendors.size !== 1 || !vendors.has(candidateVendor)
    }) ?? ''
  )
}

/** Every changed (commit, file) pair, oldest first and byte-exact by path. */
export function contributionsIn(commits = []) {
  const seen = new Set()
  const out = []
  for (const commit of commits ?? []) {
    const sha = String(commit?.sha ?? '')
    if (!sha) continue
    for (const file of uniq(commit?.files)) {
      const key = keyFor(sha, file)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ sha, file, authors: commitAuthors(commit), commit })
    }
  }
  return out
}

/**
 * Group outstanding contributions into reviewable authorship slices.
 *
 * `files` groups contain paths whose every contribution came from one vendor.
 * `commit` groups are the commit-level cuts for paths touched by >1 vendor.
 * Every group names the reviewer selected from the supplied candidate order;
 * an empty reviewer is an explicit unreviewable group, never an implicit one.
 */
export function planAuthorshipGroups({ commits = [], candidates = REVIEWER_CANDIDATES } = {}) {
  const contributions = contributionsIn(commits)
  const byFile = new Map()
  for (const contribution of contributions) {
    if (!byFile.has(contribution.file)) byFile.set(contribution.file, [])
    byFile.get(contribution.file).push(contribution)
  }

  const exclusive = new Map()
  const mixedFiles = []
  for (const [file, changes] of byFile) {
    const vendors = new Set(changes.flatMap((c) => c.authors.map(vendorOf)))
    if (!vendors.size) vendors.add('unknown')
    if (vendors.size === 1) {
      const vendor = [...vendors][0]
      if (!exclusive.has(vendor)) exclusive.set(vendor, [])
      exclusive.get(vendor).push(...changes)
    } else {
      mixedFiles.push(file)
    }
  }

  const groups = []
  for (const [vendor, changes] of exclusive) {
    const authors = uniq(changes.flatMap((c) => c.authors))
    groups.push({
      kind: 'files',
      vendor,
      authors,
      files: uniq(changes.map((c) => c.file)),
      commits: uniq(changes.map((c) => c.sha)),
      reviewer: eligibleReviewer(authors, candidates),
    })
  }

  // One mixed-path slice per commit. Files touched together by that commit may
  // stay together: they have the same authors and therefore the same reviewer.
  for (const commit of commits ?? []) {
    const files = uniq(commit?.files).filter((file) => mixedFiles.includes(file))
    if (!files.length) continue
    const authors = commitAuthors(commit)
    groups.push({
      kind: 'commit',
      vendor: uniq(authors.map(vendorOf)).join('+') || 'unknown',
      authors,
      files,
      commits: [String(commit.sha)],
      reviewer: eligibleReviewer(authors, candidates),
    })
  }

  return {
    contributions,
    mixedFiles,
    groups,
    unreviewable: groups.filter((group) => !group.reviewer),
  }
}

const contained = (record, sha) => {
  if (String(record?.sha ?? '') === String(sha)) return true
  const shas = record?.containedShas
  return shas instanceof Set ? shas.has(String(sha)) : Array.isArray(shas) && shas.map(String).includes(String(sha))
}

/**
 * The reading that rules one contribution, out of every reading of it.
 *
 * TWO ORDERINGS, AND THE WEAKER ONE IS ALWAYS AVAILABLE. Where both readings
 * carry a readable clock the clock decides, the later LEDGER LINE breaking a
 * tie.  Where either clock is unplaceable — absent, `NaN`, infinite, or a
 * string, which is data of the wrong type and is never coerced into a time —
 * the LINE decides alone: the ledger is append-only, so the row appended later
 * is the later reading.  That keeps the rule total and RESOLVABLE, which a
 * fail-safe "an unplaceable refusal wins" would not: one broken row would then
 * freeze its contribution as owed for good, with no reading able to settle it,
 * and an unsatisfiable gate is the very failure this point exists to remove.
 */
export function newestReading(readings = []) {
  if (!readings.length) return null
  let best = readings[0]
  for (const row of readings) best = laterReading(best, row)
  return best
}

/** Of two readings of one contribution, the later. `b` wins a tie, so a scan in
 *  ledger order ends on the last row of an otherwise equal set. */
const laterReading = (a, b) => {
  if (a.at !== null && b.at !== null) return b.at >= a.at ? b : a
  return b.index >= a.index ? b : a
}

/**
 * Remove only contribution pairs actually read by a valid authorship-scoped
 * pass.  The caller supplies `recordUsable`, because ledger-era validation is
 * owned by mechanism-review-core; this function owns coverage, not trust.
 */
export function outstandingContributions({ commits = [], records = [], recordUsable = () => true } = {}) {
  const contributions = contributionsIn(commits)
  // THE LATEST READING OF A CONTRIBUTION RULES IT, and only it. A pair read
  // twice — cleared once, refused later — is still refused: the gate blocks on
  // the newest verdict, so a plan that counted the older clearance would hide
  // the very file the gate is blocking on and leave the block unresolvable.
  const latest = new Map()
  for (const [position, record] of (records ?? []).entries()) {
    const files = Array.isArray(record?.pass?.files) ? record.pass.files.map(String) : []
    const commitsRead = Array.isArray(record?.pass?.commits) ? record.pass.commits.map(String) : []
    if (!files.length || !commitsRead.length) continue
    for (const contribution of contributions) {
      if (!recordUsable(record, contribution.commit)) continue
      if (!files.includes(contribution.file) || !commitsRead.includes(contribution.sha)) continue
      if (!contained(record, contribution.sha)) continue
      if (contribution.authors.some((author) => sameModel(record.model, author))) continue
      const key = keyFor(contribution.sha, contribution.file)
      // A CLOCK IS A NUMBER OR IT IS NOTHING. `Number(record.at ?? 0)` read a
      // numeric STRING as a time and an absent stamp as the epoch, so a row
      // whose clock nobody wrote still outranked one that had it; and `NaN`
      // could not be ordered at all, which froze the first such row as the
      // permanent winner and hid every later reading behind it.
      const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : null
      if (!latest.has(key)) latest.set(key, [])
      // The ledger POSITION travels with the reading: it is the ordering that
      // survives when the clock does not.
      latest.get(key).push({ record, at, contribution, index: position })
    }
  }
  const covered = new Set()
  const refusals = []
  for (const [key, readings] of latest) {
    const read = newestReading(readings)
    if (String(read.record.verdict) === 'do-not-merge') refusals.push({ contribution: read.contribution, record: read.record })
    else covered.add(key)
  }
  return {
    outstanding: contributions.filter((c) => !covered.has(keyFor(c.sha, c.file))),
    covered: contributions.filter((c) => covered.has(keyFor(c.sha, c.file))),
    refusals,
  }
}

/** Rebuild commit input from an outstanding contribution list. */
export function commitsForContributions(contributions = []) {
  const bySha = new Map()
  for (const contribution of contributions ?? []) {
    if (!bySha.has(contribution.sha)) {
      bySha.set(contribution.sha, { ...contribution.commit, sha: contribution.sha, files: [] })
    }
    const commit = bySha.get(contribution.sha)
    if (!commit.files.includes(contribution.file)) commit.files.push(contribution.file)
  }
  return [...bySha.values()]
}

/** The typed facts printed by --status; an unavailable size plan is never zero. */
export function summarizeReviewDebt({ outstanding = [], sizedPlan = null } = {}) {
  const owed = Array.isArray(outstanding) ? outstanding.length : 0
  if (!owed) return { passCount: 0, materialChars: 0, groups: [] }
  if (!sizedPlan || !Array.isArray(sizedPlan.passes) || !Number.isFinite(Number(sizedPlan.rawSize))) {
    return { passCount: null, materialChars: null, groups: [] }
  }
  // The size a reader can ACT on is what the owed passes carry, because that is
  // what a round reads and what the budget bounds. The plan's own `rawSize` is
  // the UNSPLIT assembly of every group — measured 18.08.2026 it stood at 466106
  // beside a one-round plan whose pass carried 116875, and a figure four times
  // the budget beside "1 pass" reads as a count that cannot be true.
  // A PART-MEASURED PLAN REPORTS NOTHING. Summing what some passes carry and
  // treating an unmeasured one as zero understates the debt by exactly the
  // passes nobody sized, and understating it is how this gate came to be
  // ignored. Only two answers are honest: what every pass carries, or — where
  // none was measured — the plan's unsplit assembly, which at least names its
  // own frame.
  const sizes = sizedPlan.passes.map((pass) => {
    const size = Number(pass?.rawSize ?? pass?.size)
    return Number.isFinite(size) ? size : null
  })
  const measured = sizes.filter((size) => size !== null)
  const materialChars = !measured.length
    ? Number(sizedPlan.rawSize)
    : measured.length < sizes.length
      ? null
      : measured.reduce((sum, size) => sum + size, 0)
  return {
    passCount: sizedPlan.passes.length,
    materialChars,
    groups: sizedPlan.passes,
  }
}
