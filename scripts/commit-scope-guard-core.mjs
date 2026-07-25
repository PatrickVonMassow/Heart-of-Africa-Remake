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
