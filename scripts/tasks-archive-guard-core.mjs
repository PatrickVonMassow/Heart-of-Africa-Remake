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
