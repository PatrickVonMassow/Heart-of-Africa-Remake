// Pure planning core for end-state mechanism reviews.
//
// A convergent review judges the range's artefact at HEAD, not every historical
// version that led there. Each net-changed path therefore appears once, routed
// by the author of its final change. Intermediate versions are named as
// superseded, and paths whose final state equals the base are dropped.
import { independentReviewProblem, sameModel } from './mechanism-review-core.mjs'
import { passComposition } from './review-material-core.mjs'

export const REVIEWER_CANDIDATES = Object.freeze(['GPT-5.6 Sol', 'Opus 5', 'Fable 5', 'Opus 4.8'])
export const UNREVIEWABLE_NARROWING_REMEDY =
  'Review every runnable pass and record the exact measured remainder with the criticality-review-unavailable command printed by review-sol.'
export const NO_ELIGIBLE_REVIEWER_REASON =
  `every configured reviewer model authored part of this contribution. ${UNREVIEWABLE_NARROWING_REMEDY}`
export const UNKNOWN_AUTHOR_REVIEWER_REASON =
  `authorship vendor is unknown, so no reviewer can prove cross-vendor independence. ${UNREVIEWABLE_NARROWING_REMEDY}`

// THE FOUR-EYES GATE IS ON MECHANISMS, NOT ON THE WORK ORDER (cross-vendor
// decision, 26.08.2026). TASKS.md and its archive are the owner's and user's
// own work-order text; making a second vendor read their million-character
// end state buys no mechanism assurance and can make every review round
// impossible. They already have their own enforcement: tasks-spec-guard,
// queue-order-guard, tasks-archive-guard and bundle-first-guard govern the two
// documents, while doc-budget-guard governs TASKS.md's always-read preamble.
// Keep this decision at the one end-state artefact boundary all planners use.
export const REVIEW_END_STATE_EXCLUSIONS = Object.freeze({
  'TASKS.md':
    'work-order text; governed by tasks-spec-guard, queue-order-guard, tasks-archive-guard, bundle-first-guard, and doc-budget-guard over its preamble',
  'docs/tasks-archive.md':
    'work-order archive; governed by tasks-spec-guard, queue-order-guard, tasks-archive-guard, and bundle-first-guard',
  // The German retrospective, same class as the work order: owner prose with
  // its own enforcement (retro-currency-guard over retro-core), past 400 000
  // characters and growing, and no mechanism assurance comes from a second
  // vendor reading it whole.
  'docs/analysis_de/retrospektive-zusammenarbeit.md':
    'owner retrospective prose; governed by retro-currency-guard over retro-core, and past any single review round',
})

const uniq = (xs) => [
  ...new Set((xs ?? []).filter((value) => value !== null && value !== undefined && String(value)).map(String)),
]
const keyFor = (sha, file) => `${String(sha)}\0${String(file)}`

/**
 * Why this end-state path is outside the mechanism gate's reach, or null when it
 * belongs to the reviewable file set. ONE boundary, so the gate, its coverage
 * demand, the gap measurement and the pass planner never disagree about what a
 * review is owed for.
 */
export function reviewEndStateExclusion(file) {
  const path = String(file ?? '')
  if (Object.hasOwn(REVIEW_END_STATE_EXCLUSIONS, path)) return REVIEW_END_STATE_EXCLUSIONS[path]
  return null
}

/** The range paths which belong to the mechanism-review end-state file set. */
export function reviewEndStateFiles(files = []) {
  return uniq(files).filter((file) => reviewEndStateExclusion(file) === null)
}

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
    const merged = uniq(
      parents.slice(1).flatMap((parent) => {
        const inRange = bySha.get(parent)
        if (inRange) return resolve(inRange)
        return commit?.parentAuthorModels?.[parent] ?? []
      }),
    )
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
  // The roster order preserves the cross-vendor preference: Claude-only work
  // lands on Sol, Sol-only work on Claude. Where BOTH vendors contributed,
  // vendor separation is impossible; the documented fallback is then the
  // first exact model that wrote no part of the end state.
  return (candidates ?? []).find((candidate) => !writtenBy.some((author) => sameModel(candidate, author))) ?? ''
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
export function endStateArtefacts({ commits = [], endStateFiles = null } = {}) {
  const contributions = contributionsIn(commits)
  const byFile = new Map()
  for (const contribution of contributions) {
    if (!byFile.has(contribution.file)) byFile.set(contribution.file, [])
    byFile.get(contribution.file).push(contribution)
  }

  // null preserves the useful pure-function default: callers without a measured
  // net diff plan every touched path. An explicit list is authoritative, and an
  // explicit empty list means the whole range reverted to its base state.
  const requested = endStateFiles === null ? [...byFile.keys()] : uniq(endStateFiles)
  const material = new Set(reviewEndStateFiles(requested))
  const artefacts = []
  const dropped = []
  const superseded = []
  for (const [file, changes] of byFile) {
    if (!material.has(file)) {
      dropped.push({
        file,
        reason: reviewEndStateExclusion(file) ?? 'end state identical to the base',
        commits: changes.map((change) => change.sha),
      })
      continue
    }
    const latest = changes.at(-1)
    const authors = latest.authors
    const vendors = uniq(authors.map(vendorOf))
    artefacts.push({
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
  return { contributions, artefacts, dropped, superseded }
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
  const state = endStateArtefacts({ commits, endStateFiles })
  const byVendors = new Map()
  for (const artefact of state.artefacts) {
    const key = artefact.vendors.join('+')
    if (!byVendors.has(key)) byVendors.set(key, [])
    byVendors.get(key).push(artefact)
  }

  const groups = []
  for (const [vendor, artefacts] of byVendors) {
    const authors = uniq(artefacts.flatMap((artefact) => artefact.authors))
    groups.push({
      kind: 'files',
      vendor,
      authors,
      files: artefacts.map((artefact) => artefact.file),
      commits: uniq(artefacts.flatMap((artefact) => artefact.commits)),
      endStateShas: Object.fromEntries(artefacts.map((artefact) => [artefact.file, artefact.endStateSha])),
      ...reviewerFields(authors, candidates),
    })
  }

  return {
    ...state,
    mixedFiles: state.artefacts.filter((artefact) => artefact.vendors.length > 1).map((artefact) => artefact.file),
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
 * A record covers a file when it names that file and contains the file's latest
 * change. That measured ancestry fact also rescues historical scoped rows: the
 * reviewer necessarily read the file at or after its last change, regardless of
 * which pass-record format wrote the row. A later commit touching another path
 * leaves that fact true; a later change to this path moves the latest-change
 * boundary beyond the record and makes only this file owed again.
 */
export function outstandingFiles({
  commits = [],
  endStateFiles = null,
  records = [],
  recordUsable = () => true,
} = {}) {
  const state = endStateArtefacts({ commits, endStateFiles })
  // File-scoped rows still form one numbered split. A sha with any incomplete
  // composition contributes no per-file clearance; otherwise status would say
  // pass 1/3 settled its file while the Stop gate correctly remained blocked.
  const scopedBySha = new Map()
  for (const record of records ?? []) {
    if (!record?.pass || Array.isArray(record.pass.commits)) continue
    const key = String(record.sha ?? '')
    if (!scopedBySha.has(key)) scopedBySha.set(key, [])
    scopedBySha.get(key).push(record)
  }
  const incompleteSplitShas = new Set()
  for (const [key, rows] of scopedBySha) {
    const expected = uniq(rows.flatMap((row) => (Array.isArray(row?.pass?.files) ? row.pass.files : [])))
    if (passComposition(rows, { expect: expected }).some((group) => !group.complete)) {
      incompleteSplitShas.add(key)
    }
  }
  const latest = new Map()
  const invalidatedCoverage = []
  for (const record of records ?? []) {
    if (incompleteSplitShas.has(String(record?.sha ?? ''))) continue
    const files = Array.isArray(record?.pass?.files) ? record.pass.files.map(String) : []
    if (!files.length) continue
    const historicalCommits = Array.isArray(record?.pass?.commits)
      ? new Set(record.pass.commits.map(String))
      : null
    const invalidatedFiles = []
    for (const artefact of state.artefacts) {
      if (!files.includes(artefact.file)) continue
      const latestChange = artefact.changes.at(-1)
      const coversEndState =
        recordUsable(record, latestChange.commit) &&
        contained(record, artefact.endStateSha) &&
        !artefact.vendors.includes('unknown') &&
        !independentReviewProblem(record, { authorModels: artefact.authors })
      if (!coversEndState) {
        // Count only coverage the replaced contribution model really accepted.
        // A malformed row, an unrelated file name or a self-review did not grow
        // the debt when the cut changed, so calling it "invalidated" would give
        // the format migration blame for debt that already existed.
        const coveredHistorically = historicalCommits && artefact.changes.some((change) =>
          historicalCommits.has(String(change.sha)) &&
          contained(record, change.sha) &&
          recordUsable(record, change.commit) &&
          !change.authors.some((author) => sameModel(record.model, author)))
        if (coveredHistorically) invalidatedFiles.push(artefact.file)
        continue
      }
      const key = artefact.file
      // A CLOCK IS A NUMBER OR IT IS NOTHING. `Number(record.at ?? 0)` read a
      // numeric STRING as a time and an absent stamp as the epoch, so a row
      // whose clock nobody wrote still outranked one that had it; and `NaN`
      // could not be ordered at all, which froze the first such row as the
      // permanent winner and hid every later reading behind it.
      const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : null
      if (!latest.has(key)) latest.set(key, [])
      // Pushed in ledger order: the position in this list IS the line, so no
      // reading carries a line of its own that could go missing.
      latest.get(key).push({ record, at, artefact })
    }
    if (invalidatedFiles.length) {
      invalidatedCoverage.push({
        sha: String(record?.sha ?? ''),
        index: record?.pass?.index,
        total: record?.pass?.total,
        files: uniq(invalidatedFiles),
      })
    }
  }
  const covered = new Set()
  const refusals = []
  for (const [key, readings] of latest) {
    const clearing = readings.filter((reading) => String(reading.record.verdict) !== 'do-not-merge')
    const open = readings.filter((reading) =>
      String(reading.record.verdict) === 'do-not-merge' &&
      !clearing.some((answer) =>
        Number(answer.record.at) > Number(reading.record.at) &&
        String(answer.record.sha) !== String(reading.record.sha) &&
        contained(answer.record, reading.record.sha),
      ))
    if (open.length) {
      const read = newestReading(open)
      refusals.push({ artefact: read.artefact, record: read.record })
    } else if (clearing.length) {
      covered.add(key)
    }
  }
  const outstanding = state.artefacts.filter((artefact) => !covered.has(artefact.file))
  const owedFiles = new Set(outstanding.map((artefact) => artefact.file))
  const invalidatedOutstandingCoverage = invalidatedCoverage
    .map((record) => ({ ...record, files: record.files.filter((file) => owedFiles.has(file)) }))
    .filter((record) => record.files.length)
  return {
    outstanding,
    covered: state.artefacts.filter((artefact) => covered.has(artefact.file)),
    refusals,
    dropped: state.dropped,
    superseded: state.superseded,
    invalidatedCoverage: invalidatedOutstandingCoverage,
  }
}

/** The explicit consequence of historical scoped readings that predate a
 *  file's current end state. The caller owns path quoting for its output lane. */
export function formatInvalidatedCoverage(items = [], { quoteFile = String } = {}) {
  const records = (items ?? []).filter((item) => Array.isArray(item?.files) && item.files.length)
  if (!records.length) return ''
  const files = uniq(records.flatMap((item) => item.files))
  const plural = (count, one, many = `${one}s`) => count === 1 ? one : many
  const lines = [
    `  INVALIDATED HISTORICAL COVERAGE: ${records.length} scoped pass ${plural(records.length, 'record')} ` +
      `${plural(records.length, 'contains a reading that', 'contain readings that')} no longer ` +
      `${plural(files.length, 'clears', 'clear')} ${files.length} end-state ${plural(files.length, 'file')}; ` +
      'those files are owed again:',
  ]
  for (const record of records) {
    const pass = Number.isInteger(record.index) && Number.isInteger(record.total)
      ? ` pass ${record.index}/${record.total}`
      : ''
    lines.push(`    ${String(record.sha).slice(0, 7) || '<unknown>'}${pass}: ${record.files.map(quoteFile).join(', ')}`)
  }
  return lines.join('\n')
}

/** Rebuild commit input from an outstanding end-state file list. */
export function commitsForFiles(artefacts = []) {
  const bySha = new Map()
  for (const artefact of artefacts ?? []) {
    for (const contribution of artefact.changes ?? []) {
      if (!bySha.has(contribution.sha)) {
        bySha.set(contribution.sha, { ...contribution.commit, sha: contribution.sha, files: [] })
      }
      const commit = bySha.get(contribution.sha)
      if (!commit.files.includes(artefact.file)) commit.files.push(artefact.file)
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
