// The record half of the four-eyes gate on mechanisms (point 377).
//
//   node scripts/mechanism-review.mjs --record <sha> --model <name> \
//       --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>" \
//       --mode <review|blind-parallel> [--framing "<one line>"] [--point <N>]
//   node scripts/mechanism-review.mjs --list
//
// `--mode` names which half of the four-eyes principle the verdict covers
// (CLAUDE.md §6, point 541). Only the CONVERGENT half had an enforcer; nothing
// recorded whether a DIVERGENT step ran blind parallel or as a review of an
// already-finished list — the anchoring failure the rule exists to prevent — and
// no guard can detect that, because it stands in no file. So the recorder asks,
// and refuses to default the answer.
//
// `--point <N>` names the work-order point the review settles. It is what the
// CRITICALITY gate (point 298, criticality-review-guard.mjs) looks for: that gate
// judges a change by its DECLARED criticality rather than by its file path, so a
// high-criticality point with no mechanism file in its diff is covered too. One
// ledger and one command serve both gates — a guard change that closes a high
// point is recorded ONCE, with the point named.
//
// The record is the hard part of this rule, so it is kept cheap and honest: one
// appended line naming which model reviewed, how it ended, one line of evidence,
// and the commit it judged — plus the model that AUTHORED that commit, read from
// its own Co-Authored-By trailer rather than typed in. A self-review is REFUSED
// here (and again at the gate), because a self-review in the ledger is worse than
// an empty one: the gate then reads green.
//
// The ledger is TRACKED in git on purpose. A review happens on a feature branch
// and the gate bites in the session that MERGES it; an untracked file would never
// make that journey, and the branch would block on a review that had been done.
// One JSON object per line so two branches appending never conflict beyond the
// last line.
//
// The decision logic is pure (mechanism-review-core.mjs); this file does I/O and
// fails LOUD — it is a command, not a hook.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import {
  formatArgErrors,
  KNOWN_FLAGS,
  modelFromTrailers,
  MODES,
  parseArgs,
  validateRecord,
  VERDICTS,
} from './mechanism-review-core.mjs'

// Re-exported so the flag surface has ONE definition (the pure parser's) and one
// import path for its callers.
export { KNOWN_FLAGS }

/** The tracked ledger of recorded mechanism reviews (JSON Lines). */
export const RECORDS_PATH = repoPath('.claude/mechanism-reviews.jsonl')

// Field separator for the one `git show` below. Plain ASCII on purpose: a
// `%X%` pair in a cmd.exe command line is an environment-variable expansion
// waiting to happen, and this runs on Windows (four-eyes review, 27.07.2026).
const FLD = '__F__'

const git = (cmd) => execSync(`git ${cmd}`, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()

/** Every recorded review. A malformed line is skipped, never fatal — the ledger
 *  outlives the code that writes it, and one bad line must not blind the gate. */
export function readRecords(path = RECORDS_PATH) {
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const rec = JSON.parse(line)
      // The sha shape is checked HERE, not only where it is used: the guard
      // interpolates it into a `git merge-base` command line, and a ledger is a
      // file anyone can hand-edit (four-eyes review, 27.07.2026).
      if (rec && typeof rec.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(rec.sha)) out.push(rec)
    } catch {
      /* a corrupted line is not a review; the gate then simply lacks it */
    }
  }
  return out
}

/** Append one record. Callers validate first — this only writes. */
export function appendRecord(record, path = RECORDS_PATH) {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(record)}\n`)
  return record
}

/**
 * Build the record for `sha`, reading the authoring model from the commit itself.
 * Returns { ok, record, errors } — the caller prints and exits.
 */
export function buildRecord({
  sha = '',
  model = '',
  verdict = '',
  evidence = '',
  point = '',
  mode = '',
  framing = '',
  now = Date.now(),
  resolve = resolveCommit,
} = {}) {
  // A MISSING --record NEVER REACHES GIT (point 540). With an empty sha the
  // resolve step used to answer `fatal: ambiguous argument '^{commit}'` from
  // deep inside git, so the one refusal that names what the command wants — the
  // usage block below — was the one the caller never saw.
  if (!String(sha).trim()) {
    return { ok: false, errors: validateRecord({ sha: '', model, verdict, evidence, mode, framing }).errors }
  }
  const commit = resolve(sha)
  const check = validateRecord({
    sha: commit.sha,
    model,
    verdict,
    evidence,
    authoredBy: commit.authoredBy,
    mode,
    framing,
  })
  const errors = [...check.errors]
  // Optional, but never sloppy: a mistyped point number would record a review
  // for a point nobody is closing, and the criticality gate would still block
  // the real one while the ledger LOOKED like it held the answer.
  const wanted = String(point ?? '').trim()
  if (wanted && !/^\d+$/.test(wanted)) {
    errors.push('--point <N>: the work-order point this review settles, as a plain number')
  }
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    record: {
      sha: commit.sha,
      subject: commit.subject,
      authoredBy: commit.authoredBy,
      model: String(model).trim(),
      verdict: String(verdict).trim(),
      evidence: String(evidence).trim(),
      // The four-eyes MODE travels with the verdict (point 541). Rows written
      // before this flag existed carry none, and every reader here treats a
      // missing mode as unknown rather than invalid — the ledger is tracked and
      // outlives the CLI that wrote it.
      mode: String(mode).trim(),
      ...(String(framing).trim() ? { framing: String(framing).trim() } : {}),
      ...(wanted ? { point: Number(wanted) } : {}),
      at: now,
      atIso: new Date(now).toISOString(),
    },
  }
}

/** Resolve a (possibly short) sha to the commit, its subject and its author model. */
export function resolveCommit(sha) {
  const full = git(`rev-parse "${String(sha).trim()}^{commit}"`)
  const line = git(
    `show -s --format="%H${FLD}%s${FLD}%(trailers:key=Co-Authored-By,valueonly,separator=;)" ${full}`,
  )
  const [resolved, subject, trailers] = line.split(FLD)
  return {
    sha: resolved || full,
    subject: subject ?? '',
    authoredBy: modelFromTrailers(trailers),
  }
}

/** The one description of what this command takes — printed by both refusals. */
export const usage = () =>
  `usage: node scripts/mechanism-review.mjs --record <sha> --model <name> ` +
  `--verdict <${VERDICTS.join('|')}> --evidence "<one line>" \\\n` +
  `           --mode <${MODES.join('|')}> [--framing "<one line>"] [--point <N>]\n` +
  `       node scripts/mechanism-review.mjs --list        (the recorded reviews)\n` +
  `\n--mode names which half of the four-eyes principle this verdict covers ` +
  `(CLAUDE.md §6):\n` +
  `       review          one artefact judged — a diff, an implementation, a measurement\n` +
  `       blind-parallel  a DIVERGENT step (what could go wrong, which cases to test,\n` +
  `                       which designs are possible) where both models worked from the\n` +
  `                       same inputs without seeing each other's result\n` +
  `--framing records how a second blind run by the SAME model was decorrelated, and\n` +
  `       belongs to blind-parallel alone.\n` +
  `\nWHO REVIEWS (CLAUDE.md §6): GPT-5.6 Sol at reasoning effort high, Fable 5 when\n` +
  `       Sol is unavailable. Run it — never a hand-typed codex line — with:\n` +
  `       node scripts/review-sol.mjs --sha <sha> --brief "<what to judge>"\n` +
  `\nThe GATES are separate commands and answer --status themselves:\n` +
  `       node scripts/mechanism-review-guard.mjs --status\n` +
  `       node scripts/criticality-review-guard.mjs --status`

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  try {
    // AN UNRECOGNISED ARGUMENT IS A QUESTION, NOT A RECORD (points 437 H / 540).
    // The parse is pure and lives in the core; this half only prints it. Note the
    // order: the refusal comes BEFORE --list, because `--list --wibble` is as
    // unrecognised a command line as any other.
    const parsed = parseArgs(args)
    if (!parsed.ok) {
      console.error(formatArgErrors(parsed.errors))
      console.error(`\n${usage()}`)
      process.exit(2)
    }

    if (parsed.mode === 'list') {
      const records = readRecords()
      if (!records.length) {
        console.log('no mechanism reviews recorded yet')
      }
      for (const r of records) {
        console.log(
          `${String(r.sha).slice(0, 7)}  ${String(r.verdict).padEnd(16)} by ${String(r.model).padEnd(12)} ` +
            `(authored by ${r.authoredBy || 'unknown'})${r.point ? `  point ${r.point}` : ''}  ` +
            // A row from before --mode existed has none; it reads as unrecorded,
            // never as one of the two modes.
            `[${r.mode || 'mode not recorded'}]  ${r.atIso ?? ''}` +
            `\n      ${r.evidence ?? ''}${r.framing ? `\n      framing: ${r.framing}` : ''}`,
        )
      }
      process.exit(0)
    }

    const built = buildRecord(parsed.values)
    if (!built.ok) {
      console.error('mechanism-review: refusing to record this review.\n')
      for (const e of built.errors) console.error(`  · ${e}`)
      console.error(`\n${usage()}`)
      process.exit(1)
    }
    appendRecord(built.record)
    console.log(
      `recorded: ${built.record.sha.slice(0, 7)} "${built.record.subject}" reviewed by ` +
        `${built.record.model} → ${built.record.verdict} (${built.record.mode})\n  ${built.record.evidence}\n` +
        `  ledger: ${RECORDS_PATH} (tracked — commit it with the change it judges)`,
    )
    process.exit(0)
  } catch (e) {
    console.error(`mechanism-review failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
