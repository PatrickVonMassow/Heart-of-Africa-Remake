// WHAT THE POINT BOUNDARY WAS SUPPOSED TO BUY (point 373, acceptance condition:
// "the point counts as delivered when the rate is measured, not when the mechanism
// runs"). The decision half, pure and Vitest-covered
// (scripts/measure-context-cost-core.test.mjs); the wrapper reads the transcripts.
//
// The claim to test: 80–94 % of the token spend sat above 150k of context because one
// session carried point after point, and at 24/7 that is 1.25 %/h of the weekly quota
// where ~0.6 %/h is what fits. So the numbers that matter are the SHARE of spend from
// large-context turns and the spend PER ACTIVE HOUR — before the boundary went live
// and after.

/**
 * How a turn's billed tokens are weighted into one comparable number. PURE data.
 *
 * These are RATIOS RELATIVE TO AN INPUT TOKEN, not prices: a cache read is cheap, a
 * cache write costs more than a plain input token, an output token costs several. They
 * are the published Anthropic ratios for the Claude 4/5 family and are stated here so
 * a reader can see exactly what the "spend" number means — it is a PROXY, and calling
 * it anything else would be the "measured-not-estimated" mistake this project already
 * made once.
 */
export const COST_WEIGHTS = { input: 1, cacheCreation: 1.25, cacheRead: 0.1, output: 5 }

/** The context size above which a turn counts as "large" — the threshold the original
 *  measurement used. */
export const LARGE_CONTEXT_TOKENS = 150_000

/** A gap longer than this is not work: it separates one active stretch from the next,
 *  so an idle night cannot dilute a per-hour rate into meaninglessness. */
export const IDLE_GAP_MS = 30 * 60 * 1000

/** One turn's weighted spend, and the context it ran in. PURE. */
export function turnCost(usage = {}) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0)
  const input = n(usage.input_tokens)
  const cacheCreation = n(usage.cache_creation_input_tokens)
  const cacheRead = n(usage.cache_read_input_tokens)
  const output = n(usage.output_tokens)
  return {
    contextTokens: input + cacheCreation + cacheRead,
    weighted:
      input * COST_WEIGHTS.input +
      cacheCreation * COST_WEIGHTS.cacheCreation +
      cacheRead * COST_WEIGHTS.cacheRead +
      output * COST_WEIGHTS.output,
  }
}

/**
 * The ACTIVE hours a list of timestamps spans. PURE.
 *
 * Sum of the stretches between consecutive turns, counting a gap only while it is
 * shorter than `idleGapMs`. A single turn spans no time, which is the honest answer.
 */
export function activeMs(timestamps = [], { idleGapMs = IDLE_GAP_MS } = {}) {
  const ts = [...(Array.isArray(timestamps) ? timestamps : [])].filter((t) => Number.isFinite(t)).sort((a, b) => a - b)
  let total = 0
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1]
    if (gap > 0 && gap < idleGapMs) total += gap
  }
  return total
}

/**
 * THE VERDICT over a set of turns. PURE.
 *
 * `turns` is [{ at, usage }]. `boundaryAt` splits BEFORE from AFTER — the moment the
 * boundary mechanism first fired, not a calendar guess.
 *
 * Returns { before, after, ratio } where each side is
 * { turns, weighted, activeHours, weightedPerHour, largeShare }.
 */
export function measureCost({ turns = [], boundaryAt = 0, largeContext = LARGE_CONTEXT_TOKENS, idleGapMs } = {}) {
  const side = () => ({ turns: 0, weighted: 0, weightedLarge: 0, stamps: [] })
  const before = side()
  const after = side()
  for (const t of Array.isArray(turns) ? turns : []) {
    if (!Number.isFinite(t?.at)) continue
    const { contextTokens, weighted } = turnCost(t.usage)
    if (weighted <= 0) continue
    const s = t.at >= boundaryAt ? after : before
    s.turns += 1
    s.weighted += weighted
    if (contextTokens >= largeContext) s.weightedLarge += weighted
    s.stamps.push(t.at)
  }
  const finish = (s) => {
    const hours = activeMs(s.stamps, { idleGapMs }) / 3_600_000
    return {
      turns: s.turns,
      weighted: Math.round(s.weighted),
      activeHours: +hours.toFixed(2),
      weightedPerHour: hours > 0 ? Math.round(s.weighted / hours) : null,
      largeShare: s.weighted > 0 ? +(s.weightedLarge / s.weighted).toFixed(4) : null,
    }
  }
  const b = finish(before)
  const a = finish(after)
  return {
    before: b,
    after: a,
    ratio: b.weightedPerHour && a.weightedPerHour ? +(a.weightedPerHour / b.weightedPerHour).toFixed(3) : null,
  }
}

/**
 * WHY the rate came out where it did: how far each SESSION's context climbed. PURE.
 *
 * The rate alone cannot say whether the boundary is being taken too late or not at
 * all, and "1.11 %/h, still over the ceiling" without a cause is not an actionable
 * finding. `turns` is [{ at, session, usage }].
 *
 * Returns { before, after }, each { sessions, medianPeak, p90Peak, medianTurns,
 * overLarge } — `overLarge` being the share of sessions whose context ever crossed the
 * threshold at all.
 */
export function sessionProfile({ turns = [], boundaryAt = 0, largeContext = LARGE_CONTEXT_TOKENS } = {}) {
  const sides = { before: new Map(), after: new Map() }
  for (const t of Array.isArray(turns) ? turns : []) {
    if (!Number.isFinite(t?.at) || !t?.session) continue
    const { contextTokens } = turnCost(t.usage)
    if (contextTokens <= 0) continue
    const map = t.at >= boundaryAt ? sides.after : sides.before
    const cur = map.get(t.session) ?? { peak: 0, turns: 0 }
    cur.peak = Math.max(cur.peak, contextTokens)
    cur.turns += 1
    map.set(t.session, cur)
  }
  const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null)
  const finish = (map) => {
    const rows = [...map.values()]
    const peaks = rows.map((r) => r.peak).sort((a, b) => a - b)
    const counts = rows.map((r) => r.turns).sort((a, b) => a - b)
    return {
      sessions: rows.length,
      medianPeak: quantile(peaks, 0.5),
      p90Peak: quantile(peaks, 0.9),
      medianTurns: quantile(counts, 0.5),
      overLarge: rows.length ? +(peaks.filter((p) => p >= largeContext).length / rows.length).toFixed(3) : null,
    }
  }
  return { before: finish(sides.before), after: finish(sides.after) }
}

/**
 * The %/h the "after" side corresponds to, given the anchor the point states. PURE.
 *
 * The absolute figure cannot be re-derived from a transcript — the weekly quota is not
 * in it — so the honest move is to carry the anchor forward by the MEASURED ratio and
 * say so. `anchorRatePerHour` is the 1.25 %/h the point names for the pre-boundary
 * loop; `fits` is the ~0.6 %/h ceiling it must come under.
 */
export function derivedRate({ ratio, anchorRatePerHour = 1.25, fits = 0.6 } = {}) {
  if (!(Number.isFinite(ratio) && ratio > 0)) return { rate: null, underCeiling: null }
  const rate = +(anchorRatePerHour * ratio).toFixed(3)
  return { rate, underCeiling: rate <= fits }
}

// ---------------------------------------------------------------------------
// WHERE THE TRANSCRIPTS ARE (07.08.2026). The folder used to be a hard-coded
// Windows-derived slug, and on the Linux container that directory simply does not
// exist: the script found no file, reported 0 turns and `n/a` for every figure, and
// exited 0 — a MISS that reads exactly like a measurement. So the folder is derived
// from the checkout instead, and a run that finds no transcript anywhere FAILS LOUD
// rather than printing an empty table.
//
// Both halves are pure: `transcriptCandidates` is string work, and
// `resolveTranscriptDir` takes the "does this hold a transcript?" probe as an
// argument, so the filesystem stays in the wrapper.

/**
 * Claude Code's per-project folder name: every non-alphanumeric character of the
 * project path becomes a dash and a leading drive letter is lowercased
 * (`C:\Users\…\hoa` → `c--Users-…-hoa`, `/workspace/hoa` → `-workspace-hoa`). PURE.
 */
export function projectSlug(path = '') {
  const munged = String(path).replace(/[^A-Za-z0-9]/g, '-')
  return munged.charAt(0).toLowerCase() + munged.slice(1)
}

/**
 * The main checkout behind a path that may be a git worktree of it — a worktree lives
 * at `<repo>/.claude/worktrees/<name>`, and its session transcripts are written under
 * the MAIN checkout's project key. Null when the path is not a worktree. PURE.
 *
 * The same derivation trap once rewrote the retrospective as empty from a worktree
 * (scripts/retro-sources.mjs carries that note); here it would silently halve the
 * measured spend.
 */
export function mainCheckoutOf(root = '') {
  const m = String(root).replace(/\\/g, '/').match(/^(.*?)\/\.claude\/worktrees\/[^/]+\/?$/)
  return m ? m[1] : null
}

/** The historical hard-coded folder, kept as a LAST candidate so a run on the Windows
 *  host from a differently-placed checkout still finds its transcripts. */
export const LEGACY_TRANSCRIPT_SLUG = 'c--Users-Patri-Documents-Developing-hoa'

/**
 * Transcript-folder candidates for a checkout, most specific first. PURE — the path
 * `join` is the caller's, so this needs no path module and no filesystem.
 *
 * The slug is offered with AND without a trailing dash because the harness does not
 * strip one: a repo root carrying a trailing separator produces `-workspace-hoa-`,
 * and that directory really does exist next to `-workspace-hoa` on this machine.
 * Which of the two holds transcripts is decided by looking, not by guessing.
 */
export function transcriptCandidates({ repoRoot = '', projectsDir = '', join = (a, b) => `${a}/${b}` } = {}) {
  const slugs = []
  for (const root of [repoRoot, mainCheckoutOf(repoRoot)]) {
    if (!root) continue
    const slug = projectSlug(root)
    slugs.push(slug)
    if (slug.endsWith('-')) slugs.push(slug.replace(/-+$/, ''))
  }
  slugs.push(LEGACY_TRANSCRIPT_SLUG)
  const seen = new Set()
  return slugs.filter((s) => s && !seen.has(s) && seen.add(s)).map((s) => join(projectsDir, s))
}

/**
 * The first candidate that actually HOLDS a transcript, or a throw naming every path
 * tried. PURE: the `hasTranscripts` probe is injected.
 *
 * Existence is deliberately NOT the test. An empty, stale project folder exists on
 * this machine, and accepting it would reproduce the very failure this replaces — a
 * silent zero presented as a result.
 */
export function resolveTranscriptDir(candidates = [], hasTranscripts = () => false) {
  for (const dir of candidates) {
    if (dir && hasTranscripts(dir)) return dir
  }
  throw new Error(
    'measure-context-cost: no transcripts found. Tried:\n' +
      (candidates.length ? candidates.map((d) => `  ${d}`).join('\n') : '  (no candidates)') +
      '\nPoint the tool at the right folder with MEASURE_TRANSCRIPTS_DIR=<dir>.',
  )
}
