// Pure decision core for the tasks-archive guard (user 26.07.2026).
//
// WHY IT EXISTS: the work order had grown to 13 000 lines, 10 000 of them points
// finished long ago, and every turn that consulted it carried that history. The
// finished points now live in docs/tasks-archive.md and TASKS.md holds only the
// open work. That split saves nothing if it is maintained by attention — one
// tick left in place, and the file starts growing back. So the discipline gets a
// check rather than a habit (the project's "enforce, don't remind" rule).
//
// Three things can go wrong, and each has a distinct repair, so each gets its
// own finding rather than one vague complaint.

/**
 * Numbers that legitimately exist in neither file: a point folded into another
 * during specification, so its spec lives inside the surviving one. Recorded
 * here rather than inferred, so a REAL loss cannot hide behind "probably folded".
 */
export const KNOWN_GAPS = new Set([
  301, // folded during specification
  324, // folded into 312 (the water rule) on 25.07.2026
])

/** Point numbers with their tick state: [{ n, done }]. */
export function parsePoints(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(/^- \[( |x)\] (\d+)\./gm)) {
    out.push({ n: Number(m[2]), done: m[1] === 'x' })
  }
  return out
}

/**
 * Judge the split between the open work order and its archive.
 *
 * Returns { block, findings: [{ rule, detail, points }] }.
 *   - `ticked-not-archived`: a finished point still sits in TASKS.md. Move it.
 *   - `open-in-archive`: a point was re-opened but left in the archive, so the
 *     "what is still to do" readers (resume hook, progress guard) never see it —
 *     it would be silently forgotten, which is worse than a noisy failure.
 *   - `duplicate-point`: the same number exists in both files, i.e. a move that
 *     copied. Two specs for one point drift apart, and the guards that look up a
 *     point by number would find whichever comes first.
 */
export function evaluateTasksArchive({ tasksText = '', archiveText = '' } = {}) {
  const findings = []
  const tasks = parsePoints(tasksText)
  const archive = parsePoints(archiveText)

  const ticked = tasks.filter((p) => p.done).map((p) => p.n)
  if (ticked.length) {
    findings.push({
      rule: 'ticked-not-archived',
      points: ticked,
      detail: 'finished point(s) still in TASKS.md — move the whole block to docs/tasks-archive.md',
    })
  }

  const reopened = archive.filter((p) => !p.done).map((p) => p.n)
  if (reopened.length) {
    findings.push({
      rule: 'open-in-archive',
      points: reopened,
      detail: 'open point(s) sitting in the archive — move them back, or nothing will work on them',
    })
  }

  const inTasks = new Set(tasks.map((p) => p.n))
  const dupes = [...new Set(archive.filter((p) => inTasks.has(p.n)).map((p) => p.n))]
  if (dupes.length) {
    findings.push({
      rule: 'duplicate-point',
      points: dupes,
      detail: 'point number in BOTH files — the block was copied, not moved',
    })
  }

  // A number twice inside ONE file. The cross-file check above misses it, and a
  // second block under the same number means the guards that look a point up
  // find whichever comes first (four-eyes review, 26.07.2026).
  const within = []
  for (const list of [tasks, archive]) {
    const seen = new Set()
    for (const p of list) {
      if (seen.has(p.n)) within.push(p.n)
      seen.add(p.n)
    }
  }
  if (within.length) {
    findings.push({
      rule: 'duplicate-within-file',
      points: [...new Set(within)],
      detail: 'the same number appears twice in one file',
    })
  }

  // A point that is in NEITHER file. Moving blocks by hand can drop one, and
  // nothing else would ever notice: the number simply stops existing. Known
  // gaps are points folded into another during specification.
  const all = new Set([...tasks, ...archive].map((p) => p.n))
  if (all.size) {
    const max = Math.max(...all)
    const missing = []
    for (let n = 1; n <= max; n++) if (!all.has(n) && !KNOWN_GAPS.has(n)) missing.push(n)
    if (missing.length) {
      findings.push({
        rule: 'point-vanished',
        points: missing,
        detail: 'number exists in neither file — a block was lost, or folded without being recorded here',
      })
    }
  }

  // A line that WANTS to be a point but does not parse (a missing space, a
  // lower-case marker). Both parsers skip it, so the point silently disappears
  // from every check rather than failing loudly.
  for (const [label, text] of [
    ['TASKS.md', tasksText],
    ['the archive', archiveText],
  ]) {
    // The candidate pattern is deliberately LOOSE — a missing space after the
    // dash, a bullet written with `*`, an upper-case or empty marker. The strict
    // form is what must survive; anything that merely resembles it and does not
    // parse counts nowhere, and the newest appended point is where such a
    // malformation lands (four-eyes review, second round).
    const bad = [...String(text ?? '').matchAll(/^[-*] ?\[[^\]]{0,3}\]\s*\d+\./gm)]
      .map((m) => m[0])
      .filter((s) => !/^- \[( |x)\] \d+\.$/.test(s))
    if (bad.length) {
      findings.push({
        rule: 'malformed-point-line',
        points: bad.map((s) => s.trim()),
        detail: `unparseable point heading in ${label} — it counts nowhere`,
      })
    }
  }

  return { block: findings.length > 0, findings }
}

/** Human-readable refusal naming every offending point and its repair. */
export function formatTasksArchiveVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = ['tasks-archive-guard: the work order and its archive have drifted apart.', '']
  for (const f of verdict.findings) {
    lines.push(`  ${f.rule}: point(s) ${f.points.join(', ')}`)
    lines.push(`      ${f.detail}`)
  }
  lines.push(
    '',
    'TASKS.md carries the OPEN work; docs/tasks-archive.md carries the finished points',
    'verbatim. Tick a point, then move its whole block over — the numbering and the',
    'wording stay as they are, so the readers that look points up keep working.',
  )
  return lines.join('\n')
}
