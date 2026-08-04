// Pure decision core for the commit-scope guard (user 25.07.2026).
//
// WHY IT EXISTS: `Referenzstimme Patrick.wav` (9.9 MB) reached the public
// repository on 15.07.2026 inside a commit about first-person walk feel, and
// `music/` followed on 21.07.2026 inside a commit about the calf guard. Neither
// file had anything to do with its commit: both were lying in the working tree
// and a commit that staged EVERYTHING took them along. Removing them is a
// one-off; the class of accident is not, so the rule gets a mechanism rather
// than a reminder (the project's standing "enforce, don't remind" principle).
//
// The core is pure and Vitest-covered; `commit-scope-guard.mjs` only collects
// the staged paths and sizes and prints the verdict.

/** Top-level directories a commit may touch. A new one is a deliberate
 *  decision: add it HERE, in a reviewable diff, not by waving the guard off. */
export const ALLOWED_TOP_DIRS = [
  '.claude',
  // The dev container's definition (04.08.2026). It lived only on the host, so every gap in
  // it was found the hard way — a missing browser, a missing GPU stack, a firewall that
  // blocks what the setup needs. Versioned here, a rebuild reproduces the environment the
  // verification actually requires instead of the one it happened to have.
  '.devcontainer',
  '.github',
  'cover',
  'docs',
  'public',
  'scripts',
  'src',
  'verification',
]

/** Files that may sit at the repository root, by exact name. */
export const ALLOWED_ROOT_FILES = [
  '.gitattributes',
  '.gitignore',
  '.oxlintrc.json',
  'CLAUDE.md',
  // The repository's licence, added on main through the GitHub web UI — which
  // never runs this hook, so the guard first met the file when a branch merged
  // main and refused a merge that authored nothing.
  'LICENSE',
  'README.md',
  'TASKS.md',
  'design.md',
  'index.html',
  'package-lock.json',
  'package.json',
  'vite.config.ts',
  'vitest.config.ts',
]

/** Root files matched by shape rather than by name (the tsconfig family). */
export const ALLOWED_ROOT_PATTERNS = [/^tsconfig(\.[a-z]+)?\.json$/]

/** Above this a staged file counts as a big binary and needs a home that is
 *  meant for one. The screenshots and the elevation data are legitimately
 *  large; a stray recording or document is exactly what this catches. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Directories allowed to hold files past the size limit. */
export const LARGE_FILE_DIRS = ['verification', 'public', 'cover']

const topSegment = (p) => String(p).split('/')[0]

/**
 * Decide whether a set of staged entries may be committed.
 *
 * `entries`: [{ path: string, size: number }] — repo-relative paths with the
 * size of the STAGED blob (not the working-tree file, which may differ).
 *
 * Returns { block, findings: [{ path, rule, detail }] }. Deletions should not
 * be passed in: removing a stray file must never be blocked by the guard that
 * complains about it.
 */
export function evaluateStagedFiles(entries) {
  const findings = []
  for (const e of entries ?? []) {
    const path = String(e?.path ?? '')
    if (!path) continue
    const size = Number(e?.size ?? 0)
    const top = topSegment(path)
    const isRootFile = !path.includes('/')

    if (isRootFile) {
      const named = ALLOWED_ROOT_FILES.includes(path)
      const shaped = ALLOWED_ROOT_PATTERNS.some((re) => re.test(path))
      if (!named && !shaped) {
        findings.push({
          path,
          rule: 'unexpected-root-file',
          detail: 'not one of the files that belong at the repository root',
        })
        continue // one finding per path is enough to stop the commit
      }
    } else if (!ALLOWED_TOP_DIRS.includes(top)) {
      findings.push({
        path,
        rule: 'unexpected-top-dir',
        detail: `"${top}/" is not a directory this repository commits into`,
      })
      continue
    }

    if (size > MAX_FILE_BYTES && !LARGE_FILE_DIRS.includes(top)) {
      findings.push({
        path,
        rule: 'large-binary',
        detail: `${(size / 1024 / 1024).toFixed(1)} MB outside ${LARGE_FILE_DIRS.join(', ')}`,
      })
    }
  }
  return { block: findings.length > 0, findings }
}

// ---------------------------------------------------------------------------
// THE MESSAGE CHECK (user 28.07.2026): a rescue commit must not mail the user.
//
// WHY IT EXISTS: when a delegated agent is killed mid-build its uncommitted
// work is committed and pushed AT ONCE — durability first, nothing may stay
// only local. But the branch push starts CI, CI fails on the half-finished
// state, and GitHub mails the repository owner. That happened on
// `feat/300-gait-matches-speed`: the rescue push went red, the follow-up commit
// went green, and in between the user got a failure mail for a state nobody
// claimed was finished. `main` was green throughout — the noise is entirely
// branch-side.
//
// The fix is a commit-message convention, not a workflow change: a rescue
// commit carries `[skip ci]` in its SUBJECT, which GitHub Actions honours for
// push events. The commit still exists, still pushes, still survives the
// session — only the run (and the mail) is skipped for a state that is
// explicitly not a claim of completeness.
//
// BOTH HALVES OR NEITHER. An unmarked rescue mails the user; a bare `[skip ci]`
// on ordinary work silently skips a real gate. So the trailer demands the
// marker and the marker demands the trailer.

/** The machine-readable declaration: a `Rescue:` trailer with a reason after
 *  it. A bare `Rescue:` says nothing, so it does not count as a declaration. */
export const RESCUE_TRAILER_RE = /^[ \t]*Rescue:[ \t]*\S/m

/** The bracketed spellings GitHub Actions honours to skip a push run. All of
 *  them skip the gate, so all of them must be declared. */
export const SKIP_CI_MARKERS = ['[skip ci]', '[ci skip]', '[no ci]', '[skip actions]', '[actions skip]']

/** GitHub honours one more spelling that is not bracketed and only works as a
 *  trailer: `skip-checks: true`. It skips just as silently, so it counts for
 *  the declaration half — but not for the rescue half, where the convention
 *  asks for a marker in the SUBJECT, which a trailer can never be. */
export const SKIP_CHECKS_TRAILER_RE = /^[ \t]*skip-checks:[ \t]*true[ \t]*$/im

const hasSkipMarker = (text) => {
  const lower = String(text ?? '').toLowerCase()
  return SKIP_CI_MARKERS.some((m) => lower.includes(m))
}

const skipsAnyHow = (text) => hasSkipMarker(text) || SKIP_CHECKS_TRAILER_RE.test(String(text ?? ''))

/** Drop git's comment lines, so a hint in the commit template — or a quoted
 *  `# Rescue: …` — is never read as the author's own declaration. */
const messageLines = (message) =>
  String(message ?? '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))

/**
 * Decide whether a commit MESSAGE may be committed.
 *
 * Returns { block, findings: [{ rule, detail }] } and NEVER throws — a garbled
 * or missing message yields no findings, like every other guard here.
 */
export function evaluateCommitMessage(message) {
  const findings = []
  try {
    const lines = messageLines(message)
    const subject = (lines[0] ?? '').trim()
    const body = lines.join('\n')
    const declaresRescue = RESCUE_TRAILER_RE.test(body)
    // The rescue half is satisfied only by a marker in the SUBJECT — that is
    // the placement the convention states and the one GitHub honours everywhere.
    const subjectSkips = hasSkipMarker(subject)
    // The declaration half fires on a marker ANYWHERE, in every spelling:
    // wherever it sits, it silently skips the run, so wherever it sits it must
    // be accounted for.
    const anySkips = skipsAnyHow(body)

    if (declaresRescue && !subjectSkips) {
      findings.push({
        rule: 'rescue-without-skip-ci',
        detail:
          'this commit declares a rescue but its subject carries no "[skip ci]" — ' +
          'append "[skip ci]" to the SUBJECT line',
      })
    } else if (anySkips && !declaresRescue) {
      findings.push({
        rule: 'skip-ci-without-reason',
        detail:
          'this commit skips CI but says nothing about why — add a "Rescue: <what was ' +
          'interrupted>" trailer, or drop the skip marker so the gate runs',
      })
    }
  } catch {
    /* fail-open: a guard that throws must never make the tree uncommittable */
  }
  return { block: findings.length > 0, findings }
}

/** Human-readable refusal for a message finding, naming the fix. */
export function formatMessageVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = ['commit-scope-guard: refusing this commit message.', '']
  for (const f of verdict.findings) lines.push(`  ${f.rule}: ${f.detail}`)
  lines.push(
    '',
    'A RESCUE commit — work committed because a session or agent was killed ' +
      'mid-build —',
    'is not a claim of completeness, so it must not start CI: a red run on a ' +
      'half-finished',
    'state mails the repository owner. It looks like this:',
    '',
    '    Keep the interrupted gait work [skip ci]',
    '',
    '    Rescue: agent killed mid-build; the next commit finishes and runs CI.',
    '',
    'The NEXT commit on the branch — the one that finishes the work — carries ' +
      'neither',
    'the trailer nor the marker, and runs CI normally.',
  )
  return lines.join('\n')
}

/** Human-readable refusal, naming every offender and the deliberate way out. */
export function formatVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = [
    'commit-scope-guard: refusing this commit — it stages files that do not belong to it.',
    '',
  ]
  for (const f of verdict.findings) lines.push(`  ${f.path}\n      ${f.rule}: ${f.detail}`)
  lines.push(
    '',
    'This guard exists because a voice recording and the music sources once reached',
    'the public repository inside commits about something else entirely.',
    '',
    'Stage the paths you changed instead of everything, or — if the file genuinely',
    'belongs here — add it to the lists in scripts/commit-scope-guard-core.mjs, which',
    'puts the decision in the diff where it can be reviewed.',
  )
  return lines.join('\n')
}
