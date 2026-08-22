// Pure planning core for end-state mechanism reviews.
//
// A convergent review judges the range's artefact at HEAD, not every historical
// version that led there. Each net-changed path therefore appears once, routed
// by the author of its final change. Intermediate versions are named as
// superseded, and paths whose final state equals the base are dropped.
import { sameModel } from './mechanism-review-core.mjs'

export const REVIEWER_CANDIDATES = Object.freeze(['GPT-5.6 Sol', 'Opus 5', 'Fable 5', 'Opus 4.8'])
export const UNREVIEWABLE_NARROWING_REMEDY =
  'Narrow with --since <the last reviewed sha> to a reviewable subset; when it fits, review-sol records that subset as a bounded 1/1 pass.'
export const NO_ELIGIBLE_REVIEWER_REASON =
  `every configured reviewer vendor authored part of this contribution. ${UNREVIEWABLE_NARROWING_REMEDY}`
export const UNKNOWN_AUTHOR_REVIEWER_REASON =
  `authorship vendor is unknown, so no reviewer can prove cross-vendor independence. ${UNREVIEWABLE_NARROWING_REMEDY}`

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
const RANGE_HEADER = new RegExp(
  `^${RANGE_RECORD}([0-9a-f]{40})${RANGE_FIELD}(\\d+)${RANGE_FIELD}` +
    `((?:[0-9a-f]{40}(?: [0-9a-f]{40})*)?)$`,
)

// %x1e/%x1f are expanded by GIT, so the arguments stay ASCII and the separators
// reach the output as raw control bytes no quoted path can carry (round-4
// pass 3). AS AN ARGS ARRAY, never a shell line (round-5 pass 3): cmd.exe
// expands %-spans as environment variables before git runs.
export const mechanismLogCommand = (base, head) => [
  '-c',
  'core.quotepath=on',
  'log',
  '--format=%x1e%H%x1f%ct%x1f%P',
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
      current = {
        sha: header[1],
        at: Number(header[2]) * 1000 || 0,
        parentShas: header[3] ? header[3].split(' ') : [],
        files: [],
      }
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

/**
 * Resolve the authorship a contribution carries. A merge does not create a
 * third, unattributed authoring lane: when its own trailer is absent, its
 * contribution belongs to the trailer-bearing tip(s) Git says it merged (all
 * non-first parents). This is structural ancestry, not a subject-line guess.
 *
 * An ordinary trailerless commit, or a merge whose merged parent is outside the
 * measured range or is itself unattributable, deliberately stays unknown.
 */
const authorshipResolver = (commits = []) => {
  const bySha = new Map((commits ?? []).map((commit) => [String(commit?.sha ?? ''), commit]))
  const cache = new Map()
  const resolving = new Set()
  const resolve = (commit = {}) => {
    const sha = String(commit?.sha ?? '')
    if (cache.has(sha)) return cache.get(sha)
    const own = commitAuthors(commit)
    if (own.length || resolving.has(sha)) return own
    const parents = uniq(commit?.parentShas)
    if (parents.length < 2) return own
    resolving.add(sha)
    const merged = uniq(parents.slice(1).flatMap((parent) => resolve(bySha.get(parent))))
    resolving.delete(sha)
    cache.set(sha, merged)
    return merged
  }
  return resolve
}

export function eligibleReviewer(authors = [], candidates = REVIEWER_CANDIDATES) {
  const writtenBy = uniq(authors)
  // No authorship fact means no candidate can prove it is the second pair of
  // eyes. The model guard normally supplies the trailer, but a hand-built or
  // historical commit must become an explicit unreviewable pass, not an
  // assignment made from absence.
  if (!writtenBy.length) return ''
  if (writtenBy.some((author) => vendorOf(author) === 'unknown')) return ''
  const vendors = new Set(writtenBy.map(vendorOf))
  // Cross-VENDOR means the candidate's vendor authored NONE of the group. A
  // commit co-authored by both vendors has no eligible reviewer in this chain,
  // even when a different model at one of those vendors did not personally
  // author it. Calling that model eligible would reduce four eyes to a model-id
  // distinction exactly where the repository rule requires vendor separation.
  return (
    (candidates ?? []).find((candidate) => {
      if (writtenBy.some((author) => sameModel(candidate, author))) return false
      const candidateVendor = vendorOf(candidate)
      return candidateVendor !== 'unknown' && !vendors.has(candidateVendor)
    }) ?? ''
  )
}

const reviewerFields = (authors, candidates) => {
  const reviewer = eligibleReviewer(authors, candidates)
  const writtenBy = uniq(authors)
  const unknownAuthorship = !writtenBy.length || writtenBy.some((author) => vendorOf(author) === 'unknown')
  const reason = unknownAuthorship
    ? UNKNOWN_AUTHOR_REVIEWER_REASON
    : (candidates ?? []).length
      ? NO_ELIGIBLE_REVIEWER_REASON
      : `no reviewer is configured for this contribution. ${UNREVIEWABLE_NARROWING_REMEDY}`
  return reviewer
    ? { reviewer, reviewerVendor: vendorOf(reviewer) }
    : { reviewer: '', reviewerVendor: '', unreviewableReason: reason }
}

/** Every changed (commit, file) pair, oldest first and byte-exact by path. */
export function contributionsIn(commits = []) {
  const seen = new Set()
  const out = []
  const authorsFor = authorshipResolver(commits)
  for (const commit of commits ?? []) {
    const sha = String(commit?.sha ?? '')
    if (!sha) continue
    for (const file of uniq(commit?.files)) {
      const key = keyFor(sha, file)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ sha, file, authors: authorsFor(commit), commit })
    }
  }
  return out
}

/** One reviewable artefact per file in the range's end state. */
export function endStateArtifacts({ commits = [], endStateFiles = null } = {}) {
  const contributions = contributionsIn(commits)
  const byFile = new Map()
  for (const contribution of contributions) {
    if (!byFile.has(contribution.file)) byFile.set(contribution.file, [])
    byFile.get(contribution.file).push(contribution)
  }

  // null preserves the useful pure-function default: callers without a measured
  // net diff plan every touched path. An explicit list is authoritative, and an
  // explicit empty list means the whole range reverted to its base state.
  const material = endStateFiles === null
    ? new Set(byFile.keys())
    : new Set(uniq(endStateFiles))
  const artifacts = []
  const dropped = []
  const superseded = []
  for (const [file, changes] of byFile) {
    if (!material.has(file)) {
      dropped.push({
        file,
        reason: 'end state identical to the base',
        commits: changes.map((change) => change.sha),
      })
      continue
    }
    const latest = changes.at(-1)
    const authors = latest.authors
    const vendors = uniq(authors.map(vendorOf))
    artifacts.push({
      file,
      authors,
      vendors: vendors.length ? vendors : ['unknown'],
      commits: changes.map((change) => change.sha),
      endStateSha: latest.sha,
      changes,
    })
    if (changes.length > 1) {
      superseded.push({
        file,
        reason: 'intermediate states superseded within the range',
        commits: changes.slice(0, -1).map((change) => change.sha),
        retainedAt: latest.sha,
      })
    }
  }
  return { contributions, artifacts, dropped, superseded }
}

/**
 * Group end-state files into reviewable authorship slices.
 *
 * Files with the same author-vendor set may travel together. A path touched by
 * both vendors stays ONE end-state file group; it is explicitly unreviewable
 * when no third vendor is configured, never expanded back into commit slices.
 */
export function planAuthorshipGroups({
  commits = [],
  endStateFiles = null,
  candidates = REVIEWER_CANDIDATES,
} = {}) {
  const state = endStateArtifacts({ commits, endStateFiles })
  const byVendors = new Map()
  for (const artifact of state.artifacts) {
    const key = artifact.vendors.join('+')
    if (!byVendors.has(key)) byVendors.set(key, [])
    byVendors.get(key).push(artifact)
  }

  const groups = []
  for (const [vendor, artifacts] of byVendors) {
    const authors = uniq(artifacts.flatMap((artifact) => artifact.authors))
    groups.push({
      kind: 'files',
      vendor,
      authors,
      files: artifacts.map((artifact) => artifact.file),
      commits: uniq(artifacts.flatMap((artifact) => artifact.commits)),
      endStateShas: Object.fromEntries(artifacts.map((artifact) => [artifact.file, artifact.endStateSha])),
      ...reviewerFields(authors, candidates),
    })
  }

  return {
    ...state,
    mixedFiles: state.artifacts.filter((artifact) => artifact.vendors.length > 1).map((artifact) => artifact.file),
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
 * A SELECTION, NOT A PAIRWISE COMPARATOR. Ranking rows against each other was
 * the bug twice over: comparing clock against clock and line against line
 * pairwise is not an order at all (a refusal at 300, an unclocked clearance and
 * a clearance at 100 cleared what the clock calls refused), and folding both
 * signals into one key lost a refusal appended after a clocked clearance.
 *
 * The rule, in the order it decides:
 *  1. A clock is a finite NUMBER or nothing. A numeric string is data of the
 *     wrong type and is never coerced into a time.
 *  2. Among the readings that carry a clock, the newest rules — the later
 *     LEDGER LINE breaking a tie, the ledger being append-only.
 *  3. An unclocked reading cannot be placed in that order, so it never CLEARS.
 *     But a refusal appended AFTER that newest clocked reading is exactly what
 *     the line still proves, so it rules and the contribution stays owed.
 *     Appended BEFORE it, the refusal is superseded — nothing can freeze a
 *     contribution as permanently owed, an unsatisfiable gate being the failure
 *     this point exists to remove.
 *  4. With NO clocked reading at all there is nothing to stand after, so rule 3
 *     reduces to its safe half: any unclocked refusal rules, and the
 *     contribution waits for a stamped clearance — which any reviewer can
 *     record, so this is a wait and not a freeze. Failing a refusal, the last
 *     line rules, so a lone record nobody stamped still settles its own
 *     contribution.
 *
 * The LINE is the position in the list the caller passes, which is ledger order
 * — no row carries a line of its own that could be missing or malformed.
 */
export function newestReading(readings = []) {
  if (!readings.length) return null
  let newest = null
  let newestLine = -1
  for (const [line, row] of readings.entries()) {
    if (clockOf(row) === null) continue
    if (!newest || clockOf(row) >= clockOf(newest)) {
      newest = row
      newestLine = line
    }
  }
  for (const [line, row] of readings.entries()) {
    if (line <= newestLine || clockOf(row) !== null) continue
    if (String(row?.record?.verdict) === 'do-not-merge') return row
  }
  return newest ?? readings[readings.length - 1]
}

/** The strict clock of a reading: a finite number, or null for "no time". The
 *  selector normalizes rather than trusting its caller, so a direct caller gets
 *  the documented rule and not JavaScript's coercing comparison. */
const clockOf = (row) => (typeof row?.at === 'number' && Number.isFinite(row.at) ? row.at : null)

/**
 * Remove only end-state files actually read by a valid file-scoped pass.
 *
 * A record covers a file when it names that file, stores its own reviewed sha as
 * `pass.endState`, and contains the file's latest change. A later commit touching
 * another path leaves that fact true; a later change to this path moves the
 * latest-change boundary beyond the record and makes only this file owed again.
 */
export function outstandingFiles({
  commits = [],
  endStateFiles = null,
  records = [],
  recordUsable = () => true,
} = {}) {
  const state = endStateArtifacts({ commits, endStateFiles })
  const latest = new Map()
  for (const record of records ?? []) {
    const files = Array.isArray(record?.pass?.files) ? record.pass.files.map(String) : []
    // New records say which end state they read. Historical `pass.commits`
    // rows described intermediate contributions and deliberately clear nothing
    // under the replacement model.
    if (!files.length || String(record?.pass?.endState ?? '') !== String(record?.sha ?? '')) continue
    for (const artifact of state.artifacts) {
      const latestChange = artifact.changes.at(-1)
      if (!recordUsable(record, latestChange.commit)) continue
      if (!files.includes(artifact.file) || !contained(record, artifact.endStateSha)) continue
      const reviewerVendor = vendorOf(record.model)
      if (
        reviewerVendor === 'unknown' ||
        artifact.vendors.includes('unknown') ||
        artifact.vendors.includes(reviewerVendor)
      ) continue
      const key = artifact.file
      // A CLOCK IS A NUMBER OR IT IS NOTHING. `Number(record.at ?? 0)` read a
      // numeric STRING as a time and an absent stamp as the epoch, so a row
      // whose clock nobody wrote still outranked one that had it; and `NaN`
      // could not be ordered at all, which froze the first such row as the
      // permanent winner and hid every later reading behind it.
      const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : null
      if (!latest.has(key)) latest.set(key, [])
      // Pushed in ledger order: the position in this list IS the line, so no
      // reading carries a line of its own that could go missing.
      latest.get(key).push({ record, at, artifact })
    }
  }
  const covered = new Set()
  const refusals = []
  for (const [key, readings] of latest) {
    const read = newestReading(readings)
    if (String(read.record.verdict) === 'do-not-merge') refusals.push({ artifact: read.artifact, record: read.record })
    else covered.add(key)
  }
  return {
    outstanding: state.artifacts.filter((artifact) => !covered.has(artifact.file)),
    covered: state.artifacts.filter((artifact) => covered.has(artifact.file)),
    refusals,
    dropped: state.dropped,
    superseded: state.superseded,
  }
}

/** Rebuild commit input from an outstanding end-state file list. */
export function commitsForFiles(artifacts = []) {
  const bySha = new Map()
  for (const artifact of artifacts ?? []) {
    for (const contribution of artifact.changes ?? []) {
      if (!bySha.has(contribution.sha)) {
        bySha.set(contribution.sha, { ...contribution.commit, sha: contribution.sha, files: [] })
      }
      const commit = bySha.get(contribution.sha)
      if (!commit.files.includes(artifact.file)) commit.files.push(artifact.file)
    }
  }
  return [...bySha.values()]
}

/** The typed facts printed by --status; an unavailable size plan is never zero. */
export function summarizeReviewDebt({ outstanding = [], sizedPlan = null } = {}) {
  const owed = Array.isArray(outstanding) ? outstanding.length : 0
  if (!owed) return { passCount: 0, materialChars: 0, groups: [] }
  // `typeof` before coercion: `Number(null)` and `Number('')` are 0, so an
  // UNMEASURED rawSize would pass a bare isFinite check and report zero
  // material — a cleared-looking figure for work nobody measured.
  if (
    !sizedPlan ||
    !Array.isArray(sizedPlan.passes) ||
    typeof sizedPlan.rawSize !== 'number' ||
    !Number.isFinite(sizedPlan.rawSize)
  ) {
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
