// WHERE THE TIME AND THE TOKENS OF ONE TASK GO (point 572, phase 1). The IO half.
//
//   node scripts/measure-task-cost.mjs                  # the phase table + the spread
//   node scripts/measure-task-cost.mjs --json           # everything, machine-readable
//   node scripts/measure-task-cost.mjs --tasks 20       # the 20 costliest points
//   node scripts/measure-task-cost.mjs --git-since 2026-07-06   # the calendar clock only
//
// It reads the same transcripts as `scripts/measure-context-cost.mjs` — same folder
// resolution, same dedup, same weighting — and adds the PHASE attribution the older tool
// has no opinion about. The decision rules are pure and Vitest-covered in
// `scripts/measure-task-cost-core.mjs`; this file only does IO.
//
// TWO CLOCKS, never added together: transcript ACTIVE hours are machine hours and count
// parallel agents once each, git CALENDAR hours are the wall-clock a point took from its
// first branch commit to its merge. The first is what the batch pays for, the second is
// what the user waits.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { listTranscripts, transcriptDir } from './measure-context-cost.mjs'
import { COST_WEIGHTS, PHASES, PHASE_NOTES, assignTasks, attribute, dominantTaskPerFile, foldResponseLines, mergeSpans, taskSpread } from './measure-task-cost-core.mjs'

/**
 * Every assistant turn with usage, carrying the evidence the classifier needs: the tool
 * calls it issued, the git branch it ran on and the transcript it came from.
 *
 * One response is FOLDED from its lines by `foldResponseLines`, not deduplicated down to
 * the first of them: the usage is counted once (as `measure-context-cost.mjs` does, else
 * the spend triples) while the tool calls are the union over the response's content
 * blocks. Keeping only the first line dropped the tool call of every response that began
 * with thinking — see that function for what it cost the earlier reading.
 */
export async function readTurns(dir = transcriptDir()) {
  const lineRows = []
  const branchRows = []
  for (const { path, rel, scope } of listTranscripts(dir)) {
    const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
    for await (const line of lines) {
      if (!line.includes('"usage"')) continue
      let rec
      try {
        rec = JSON.parse(line)
      } catch {
        continue
      }
      const usage = rec?.message?.usage
      const at = Date.parse(rec?.timestamp ?? '')
      if (!usage || !Number.isFinite(at)) continue
      const id = rec.message?.id ?? rec.requestId ?? `${rel}:${rec.uuid ?? at}`
      const session = rec.agentId ? `${rec.sessionId ?? rel}/agent-${rec.agentId}` : (rec.sessionId ?? rel.replace(/\.jsonl$/, ''))
      const tools = (Array.isArray(rec.message?.content) ? rec.message.content : [])
        .filter((c) => c?.type === 'tool_use')
        .map((c) => ({ id: c.id, name: c.name, input: c.input ?? {} }))
      lineRows.push({ id, at, usage, session, scope, branch: rec.gitBranch ?? '', file: rel, tools })
    }
  }
  const turns = foldResponseLines(lineRows)
  for (const t of turns) branchRows.push({ file: t.file, scope: t.scope, branch: t.branch })
  turns.sort((a, b) => a.at - b.at)
  return { turns: assignTasks(turns, dominantTaskPerFile(branchRows)), files: listTranscripts(dir).length }
}

const git = (args) =>
  execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true, // point 401: no console window flashing at a turn end
  })

/**
 * The calendar clock: every first-parent merge on `main`, with the span from its
 * branch's FIRST commit to the merge, and the main-only commits that followed it before
 * the next merge — the bookkeeping no branch ever sees.
 */
export function readMerges({ since = null, ref = 'main' } = {}) {
  const args = ['log', '--first-parent', '--pretty=%H|%ct|%P|%s', ref]
  if (since) args.push(`--since=${since}`)
  const rows = git(args)
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, ct, parents, ...rest] = l.split('|')
      return { sha, at: Number(ct) * 1000, parents: parents.split(' ').filter(Boolean), subject: rest.join('|') }
    })
  const merges = []
  let mainSince = 0
  for (const row of rows) {
    // The list runs newest first, so the plain commits seen BEFORE a merge are the ones
    // that followed it on main.
    if (row.parents.length < 2) {
      mainSince += 1
      continue
    }
    let firstBranchCommitAt = null
    let branchCommits = null
    try {
      const branch = git(['log', '--pretty=%ct', `${row.parents[0]}..${row.parents[1]}`]).split('\n').filter(Boolean)
      branchCommits = branch.length
      if (branch.length) firstBranchCommitAt = Number(branch[branch.length - 1]) * 1000
    } catch {
      /* a merge whose branch commits are unreachable is reported without a span */
    }
    merges.push({ sha: row.sha, subject: row.subject, mergedAt: row.at, firstBranchCommitAt, branchCommits, mainCommitsAfter: mainSince })
    mainSince = 0
  }
  return merges
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href

if (isMain) {
  const argv = process.argv.slice(2)
  const flag = (name, fallback = null) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : fallback
  }
  const asJson = argv.includes('--json')
  const topTasks = Number(flag('--tasks', 15))
  const gitSince = flag('--git-since', null)
  // A transcript fragment is not a task. The floor is stated, not hidden: below it a row
  // is an agent that barely started, and letting those set the median would report a
  // per-task cost no real point ever had.
  const minWeighted = Number(flag('--min-weighted', 200_000))

  const dir = transcriptDir()
  const { turns, files } = await readTurns(dir)
  if (turns.length === 0) {
    console.error(`no assistant turns with usage in ${dir} — nothing to measure.`)
    process.exit(1)
  }
  // TWO READINGS, always reported together: `strict` attributes only turns that issue a
  // recognised tool call — a FLOOR per phase; `result` fills the evidence-free turns
  // from their neighbours in the same session. The gap between the two is the error bar.
  const result = attribute({ turns })
  const strict = attribute({ turns, carry: false })
  const rawMerges = readMerges({ since: gitSince })
  const merges = mergeSpans(rawMerges)
  const spread = {
    weighted: taskSpread(result.tasks, { minWeighted }),
    hours: taskSpread(result.tasks, { minWeighted, pick: (t) => t.total.hours }),
    ...Object.fromEntries(PHASES.map((p) => [p, taskSpread(result.tasks, { minWeighted, pick: (t) => t.phases[p].weighted })])),
  }
  const span = { from: new Date(turns[0].at).toISOString(), to: new Date(turns[turns.length - 1].at).toISOString() }
  // THE FIXED OVERHEAD. Main-session cost that no branch carries — orchestration,
  // board, queue, the merges — divided by the points that actually merged inside the
  // transcript window. It is an AMORTISED figure, not a per-task measurement: the
  // window's overhead does not decompose into points, and pretending otherwise would be
  // the estimate-as-measurement mistake.
  const windowFrom = turns[0].at
  const windowTo = turns[turns.length - 1].at
  const mergesInWindow = rawMerges.filter((m) => m.mergedAt >= windowFrom && m.mergedAt <= windowTo).length
  const noTaskWeighted = Math.round((result.evidence.noTaskShare ?? 0) * result.evidence.weighted)
  const overhead = {
    mergesInWindow,
    noTaskWeighted,
    perMergedPoint: mergesInWindow > 0 ? Math.round(noTaskWeighted / mergesInWindow) : null,
    sizeIndependentPerTask: taskSpread(result.tasks, {
      minWeighted,
      pick: (t) => t.phases.brief.weighted + t.phases.merge.weighted + t.phases.bookkeeping.weighted,
    }),
  }

  if (asJson) {
    console.log(JSON.stringify({ transcriptDir: dir, transcripts: files, turnsRead: turns.length, span, minWeighted, ...result, strict, spread, overhead, merges }, null, 2))
  } else {
    const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)} %`)
    const k = (v) => `${(v / 1000).toFixed(0)}k`
    const total = PHASES.reduce((a, p) => a + result.phases[p].weighted, 0)
    const totalH = PHASES.reduce((a, p) => a + result.phases[p].hours, 0)
    console.log(`read ${turns.length} turns from ${files} transcripts in ${dir}`)
    console.log(`window ${span.from} → ${span.to}`)
    console.log('')
    // The strict column is a share OF WHAT IT ATTRIBUTED, not of the total — otherwise
    // every strict figure reads as a fifth of the filled one for the trivial reason
    // that it attributed a fifth of the cost, and the two columns cannot be compared.
    const strictAttributed = PHASES.filter((p) => p !== 'unattributed').reduce((a, p) => a + strict.phases[p].weighted, 0)
    console.log('PHASE               weighted    share   active h   share   strict   note')
    for (const p of PHASES) {
      const b = result.phases[p]
      const s = strict.phases[p]
      console.log(
        `  ${p.padEnd(15)} ${k(b.weighted).padStart(9)} ${pct(total ? b.weighted / total : null).padStart(8)} ` +
          `${String(b.hours).padStart(9)} ${pct(totalH ? b.hours / totalH : null).padStart(8)} ` +
          `${(p === 'unattributed' ? '—' : pct(strictAttributed ? s.weighted / strictAttributed : null)).padStart(8)}   ${PHASE_NOTES[p]}`,
      )
    }
    console.log(`  strict = tool-calling turns only, as a share of what it attributed (${pct(strict.evidence.unattributedShare)} of the cost stays unattributed there).`)
    console.log('  the weighted column carries a phase across the evidence-free turns of the same session. The two are the band.')
    console.log('')
    const comp = PHASES.reduce((a, p) => {
      for (const key of ['input', 'cacheCreation', 'cacheRead', 'output']) a[key] = (a[key] ?? 0) + result.phases[p][key]
      return a
    }, {})
    const compTotal = Object.values(comp).reduce((a, b) => a + b, 0)
    const compW = Object.fromEntries(Object.entries(comp).map(([key, v]) => [key, v * (COST_WEIGHTS[key] ?? 1)]))
    const compWTotal = Object.values(compW).reduce((a, b) => a + b, 0)
    console.log(`BILLED COUNTERS over all phases (${k(compTotal)} raw): ` + Object.entries(comp).map(([key, v]) => `${key} ${k(v)} (${pct(v / compTotal)} raw, ${pct(compW[key] / compWTotal)} weighted)`).join(' · '))
    console.log('')
    console.log('SCOPE SPLIT (weighted)')
    for (const scope of ['top-level', 'subagent']) {
      const s = result.byScope[scope]
      const sum = PHASES.reduce((a, p) => a + s[p].weighted, 0)
      console.log(`  ${scope.padEnd(10)} ${k(sum).padStart(9)}  ${pct(total ? sum / total : null)}  ` + PHASES.map((p) => `${p.slice(0, 4)} ${pct(sum ? s[p].weighted / sum : null)}`).join('  '))
    }
    console.log('')
    console.log(`EVIDENCE — how much of the cost rests on how much evidence (total ${k(result.evidence.weighted)})`)
    console.log(`  one phase ${pct(result.evidence.singlePhaseShare)} · several phases split ${pct(result.evidence.multiPhaseShare)} · UNATTRIBUTED ${pct(result.evidence.unattributedShare)}`)
    console.log(`  task from the branch ${pct(result.evidence.taskByBranchShare)} · from the transcript ${pct(result.evidence.taskByTranscriptShare)} · no task ${pct(result.evidence.noTaskShare)}`)
    console.log('')
    console.log(`PER TASK (${spread.weighted.tasks} points over the floor of ${k(minWeighted)} weighted)`)
    const q = (s, f = k) => `median ${f(s.median)}  p90 ${f(s.p90)}  max ${f(s.max)}  min ${f(s.min)}`
    console.log(`  weighted        ${q(spread.weighted)}`)
    console.log(`  active hours    ${q(spread.hours, (v) => String(v))}`)
    for (const p of PHASES) console.log(`  ${p.padEnd(15)} ${q(spread[p])}`)
    console.log('')
    console.log('FIXED OVERHEAD')
    console.log(`  main-session cost no branch carries: ${k(overhead.noTaskWeighted)} over ${overhead.mergesInWindow} merges in the window → ${overhead.perMergedPoint == null ? 'n/a' : k(overhead.perMergedPoint)} per merged point (AMORTISED)`)
    console.log(`  brief+merge+bookkeeping inside a task: ${q(overhead.sizeIndependentPerTask)}`)
    console.log('')
    console.log(`CALENDAR CLOCK from git — ${merges.merges} merges on main`)
    console.log(`  branch-first-commit → merge, hours: ${q(merges.hours, (v) => String(v))}`)
    console.log(`  commits per branch:            ${q(merges.branchCommits, (v) => String(v))}`)
    console.log(`  main-only commits after a merge:${q(merges.mainCommitsAfter, (v) => String(v))}`)
    console.log('')
    console.log(`THE ${Math.min(topTasks, result.tasks.length)} COSTLIEST POINTS`)
    for (const t of result.tasks.slice(0, topTasks)) {
      console.log(
        `  ${String(t.task).padStart(4)}  ${k(t.total.weighted).padStart(8)}  ${String(t.total.hours).padStart(6)} h  ` +
          PHASES.filter((p) => p !== 'unattributed')
            .map((p) => `${p.slice(0, 4)} ${pct(t.total.weighted ? t.phases[p].weighted / t.total.weighted : null)}`)
            .join(' '),
      )
    }
    console.log('')
    console.log('  weighted is the PROXY of measure-context-cost-core.mjs (COST_WEIGHTS), not a bill.')
    console.log('  active hours are MACHINE hours — parallel agents each count. Calendar hours come from git.')
  }
}
