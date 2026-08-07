// Pure core of the guard/memory INVENTORY — the mechanical first step of the
// periodic rule-corpus review (`rule-review-guard.mjs`, work-order point 297).
//
// WHY a separate module rather than more logic inside guard-health: the two ask
// different questions. `guard-health-core` asks "can every enforcer FIRE" and
// blocks a turn when one cannot. This asks "what IS there", and answers with a
// table nobody has to block on — the hooks as `.claude/settings.json` really
// wires them, the enforcer scripts as they really sit in `scripts/`, and the
// memory files as they really sit on disk, each with its last-modified date.
//
// The two overlap on purpose in exactly ONE place: the definition of an
// enforcer. It is IMPORTED from guard-health-core rather than restated, because
// a second copy of that regex is precisely the drift this pass exists to find.
//
// Three defect classes the audit cares about fall out of the same table:
//   dangling      a hook line names a script that is not in the tree — the rule
//                 counts as wired while nothing runs
//   orphan        an enforcer script no wiring source names — dead by
//                 construction (guard-health blocks on this; listed here so the
//                 inventory is complete and the two can be compared)
//   unconventional  a script that IS wired but whose name ends in none of
//                 -guard/-gate/-hook. It enforces, yet it is invisible to every
//                 mechanism that selects enforcers BY NAME: guard-health's
//                 wiring/test demand, the corpus count that schedules the
//                 review, and the four-eyes gate. A blind spot, not a bug — and
//                 only a listing finds it.
//
// Side-effect free: every input is plain data, so the whole thing is testable
// without a filesystem. The CLI (`guard-inventory.mjs`) does the reading.
import { ENFORCER_RE } from './guard-health-core.mjs'

export { ENFORCER_RE }

/** Hook events in the order the harness fires them, for a stable report. */
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd']

/** A memory untouched for this long is REPORTED (never auto-retired). */
export const MEMORY_STALE_DAYS = 21

const DAY_MS = 86_400_000

/** The `scripts/<name>.mjs` a hook command runs, or null for anything else. */
export function scriptOfCommand(command) {
  const m = /scripts[/\\]([A-Za-z0-9._-]+\.mjs)/.exec(String(command ?? ''))
  return m ? m[1] : null
}

/**
 * Flatten `.claude/settings.json` into one row per wired hook.
 * Returns [{ event, matcher, command, script }] — `script` null when the
 * command is not a `node scripts/*.mjs` call (nothing in this project, but a
 * shell one-liner must not silently vanish from the table).
 */
export function parseHookTable(settings) {
  const hooks = settings && typeof settings === 'object' ? settings.hooks : null
  if (!hooks || typeof hooks !== 'object') return []
  const rows = []
  const events = [...HOOK_EVENTS, ...Object.keys(hooks).filter((e) => !HOOK_EVENTS.includes(e))]
  for (const event of events) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : []
    for (const group of groups) {
      const matcher = typeof group?.matcher === 'string' ? group.matcher : ''
      for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
        const command = String(hook?.command ?? '')
        if (!command) continue
        rows.push({ event, matcher, command, script: scriptOfCommand(command) })
      }
    }
  }
  return rows
}

/** Script names a git hook's shell text invokes (`node scripts/x.mjs …`). */
export function scriptsInGitHooks(texts = []) {
  const out = new Set()
  for (const text of texts) {
    for (const m of String(text ?? '').matchAll(/scripts[/\\]([A-Za-z0-9._-]+\.mjs)/g)) out.add(m[1])
  }
  return out
}

/**
 * The inventory.
 *
 *   settings      parsed `.claude/settings.json`
 *   scriptFiles   every file name in `scripts/`
 *   gitHookTexts  the contents of the ACTIVE git hooks directory (empty when
 *                 no hooksPath is configured — then nothing counts as wired
 *                 through git, which is exactly how a gate goes dead)
 *
 * Returns { hooks, scripts, counts, findings }.
 */
export function buildInventory({ settings = {}, scriptFiles = [], gitHookTexts = [] } = {}) {
  const files = Array.isArray(scriptFiles) ? [...scriptFiles] : []
  const present = new Set(files)
  const hooks = parseHookTable(settings)
  const fromGit = scriptsInGitHooks(gitHookTexts)

  // Where each script is wired, in the order a reader wants it: the harness
  // events first, then git. A script wired twice keeps both entries — a
  // duplicate matcher is a fact of the table, not a finding by itself.
  const wiredBy = new Map()
  const note = (name, where) => {
    if (!name) return
    if (!wiredBy.has(name)) wiredBy.set(name, [])
    wiredBy.get(name).push(where)
  }
  for (const row of hooks) note(row.script, row.matcher ? `${row.event}(${row.matcher})` : row.event)
  for (const name of fromGit) note(name, 'git-hook')

  const findings = []
  for (const row of hooks) {
    if (row.script && !present.has(row.script)) {
      findings.push({
        kind: 'dangling',
        script: row.script,
        detail: `${row.event} wires ${row.script}, which is not in scripts/ — the rule counts as enforced while nothing runs.`,
      })
    }
  }

  const scripts = []
  for (const file of files.filter((f) => ENFORCER_RE.test(f) || wiredBy.has(f)).sort()) {
    const where = wiredBy.get(file) ?? []
    const enforcerNamed = ENFORCER_RE.test(file)
    const stem = file.replace(/\.mjs$/, '')
    scripts.push({
      script: file,
      wiredIn: where,
      wired: where.length > 0,
      enforcerNamed,
      tested: present.has(`${stem}.test.mjs`) || present.has(`${stem}-core.test.mjs`),
    })
    if (enforcerNamed && where.length === 0) {
      findings.push({
        kind: 'orphan',
        script: file,
        detail: `${file} is named by no hook and by no git hook — it can never fire.`,
      })
    }
    if (!enforcerNamed && where.length > 0) {
      findings.push({
        kind: 'unconventional',
        script: file,
        detail:
          `${file} is wired (${where.join(', ')}) but its name ends in neither -guard, -gate nor -hook, so every ` +
          'by-name selector — guard-health, the corpus count, the four-eyes gate — passes over it.',
      })
    }
  }

  const byEvent = {}
  for (const row of hooks) byEvent[row.event] = (byEvent[row.event] ?? 0) + 1

  return {
    hooks,
    scripts,
    findings,
    counts: {
      hooks: hooks.length,
      byEvent,
      enforcerNamed: files.filter((f) => ENFORCER_RE.test(f)).length,
      wired: wiredBy.size,
      dangling: findings.filter((f) => f.kind === 'dangling').length,
      orphans: findings.filter((f) => f.kind === 'orphan').length,
      unconventional: findings.filter((f) => f.kind === 'unconventional').length,
    },
  }
}

/**
 * Claude Code's per-project directory names this repo could resolve to.
 *
 * There is no single answer, and pretending otherwise is what hid a real split:
 * the harness derives one slug, `retro-sources.defaultMemoryDir` strips the
 * trailing dash and lowercases the drive letter, and `findings-paths.projectSlug`
 * does neither — so the findings carrier lives in a DIFFERENT directory from the
 * index that is supposed to point at it. A worktree adds a third, because its
 * checkout path is its own. So this returns every variant and lets the CLI
 * report which ones actually exist.
 */
export function memoryDirVariants(repoRoot) {
  const root = String(repoRoot ?? '').replace(/\\/g, '/')
  // A worktree under <main>/.claude/worktrees/<id> belongs to the main checkout.
  const main = root.replace(/\/\.claude\/worktrees\/[^/]+\/?$/, '')
  const out = []
  for (const base of new Set([root, main])) {
    const trimmed = base.replace(/\/+$/, '')
    for (const form of new Set([trimmed, `${trimmed}/`])) {
      const slug = form.replace(/[^A-Za-z0-9]/g, '-')
      for (const s of new Set([slug, slug.charAt(0).toLowerCase() + slug.slice(1)])) {
        if (s && !out.includes(s)) out.push(s)
      }
    }
  }
  return out
}

/**
 * Judge the memory corpus. `entries` is [{ name, mtimeMs, bytes }]; `now` is
 * epoch ms. The index (MEMORY.md) is reported apart from the memories it
 * indexes, because it is the file every session actually loads.
 */
export function memoryReport(entries = [], { now = Date.now(), staleDays = MEMORY_STALE_DAYS } = {}) {
  const all = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e.name === 'string')
  const index = all.find((e) => e.name === 'MEMORY.md') ?? null
  const memories = all.filter((e) => e.name !== 'MEMORY.md' && e.name.endsWith('.md'))
  const age = (e) => Math.floor((now - Number(e.mtimeMs ?? now)) / DAY_MS)
  const withAge = memories.map((e) => ({ ...e, ageDays: age(e) })).sort((a, b) => b.ageDays - a.ageDays)
  return {
    count: withAge.length,
    bytes: withAge.reduce((n, e) => n + Number(e.bytes ?? 0), 0),
    indexBytes: index ? Number(index.bytes ?? 0) : null,
    hasIndex: Boolean(index),
    stale: withAge.filter((e) => e.ageDays >= staleDays),
    largest: [...withAge].sort((a, b) => Number(b.bytes ?? 0) - Number(a.bytes ?? 0)).slice(0, 5),
    entries: withAge,
  }
}

const pad = (s, n) => String(s).padEnd(n)

/** The whole pass as a SMALL report: counts, then only what needs a decision. */
export function formatInventory(inv, memoryDirs = []) {
  const c = inv.counts
  const lines = ['GUARD & MEMORY INVENTORY', '']
  lines.push(
    `hooks wired: ${c.hooks} (${HOOK_EVENTS.filter((e) => c.byEvent[e]).map((e) => `${e} ${c.byEvent[e]}`).join(', ')})`,
  )
  lines.push(`enforcer-named scripts: ${c.enforcerNamed} · distinct scripts wired: ${c.wired}`)
  lines.push(`findings: dangling ${c.dangling} · orphan ${c.orphans} · unconventional ${c.unconventional}`)
  lines.push('')

  for (const dir of memoryDirs) {
    const r = dir.report
    lines.push(
      `memory ${dir.exists ? '' : '(MISSING) '}${dir.path}`,
      `  ${r.count} memories, ${(r.bytes / 1024).toFixed(1)} KB` +
        `${r.hasIndex ? `, index ${(r.indexBytes / 1024).toFixed(1)} KB` : ', NO MEMORY.md index'}` +
        `, ${r.stale.length} untouched ≥ ${MEMORY_STALE_DAYS} d`,
    )
  }
  if (memoryDirs.length > 1) {
    lines.push('  ! more than one memory directory resolves for this repo — see docs/guard-memory-audit.md')
  }
  lines.push('')

  if (inv.findings.length === 0) lines.push('no wiring findings.')
  else {
    lines.push('WIRING FINDINGS')
    for (const f of inv.findings) lines.push(`  [${pad(f.kind, 14)}] ${f.detail}`)
  }
  return lines.join('\n')
}

/** The full script table, only on demand (`--all`). */
export function formatScriptTable(inv) {
  const rows = inv.scripts.map((s) => [
    pad(s.script, 34),
    pad(s.tested ? 'tested' : '-', 7),
    s.wired ? s.wiredIn.join(', ') : 'NOT WIRED',
  ])
  return [pad('script', 34) + pad('test', 7) + 'wired in', ...rows.map((r) => r.join(''))].join('\n')
}
