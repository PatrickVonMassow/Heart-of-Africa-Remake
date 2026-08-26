// Stop hook: no enforcer may sit in the tree unable to fire.
// See guard-health-core.mjs for the two specimens that motivated it.
//
// The decision logic is pure and Vitest-covered; this wrapper only reads the
// tree and is fail-OPEN. --status answers regardless of who owns the batch
// lock: a probe that stays silent under another owner is indistinguishable from
// "nothing wrong", which is the very defect this guard looks for.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { anchorCommand, auditGuardHealth, commandAnchoring, formatGuardHealth } from './guard-health-core.mjs'
import { parseHookTable } from './guard-inventory-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { CAUSE } from './guard-preflight-core.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

const SCRIPTS = repoPath('scripts')
const SETTINGS = repoPath('.claude', 'settings.json')
const PAUSE = repoPath('.claude', 'batch-paused')

/**
 * Everything that could invoke an enforcer: the hook settings plus the contents
 * of an ACTIVE git hooks directory. An inactive hooks path contributes nothing —
 * which is the point, since that is exactly how a gate script ends up dead.
 *
 * TWO shapes, on purpose (point 438). The BLOB answers "is this enforcer named
 * anywhere at all", where a git hook counts exactly like a settings line. The
 * ANCHORING check may not read that blob: `scripts/git-hooks/pre-push` and
 * `commit-msg` are relative on purpose — git runs a hook from the repo root — so
 * it gets the settings' hook rows STRUCTURED and never sees the git hooks. A
 * settings file that will not parse yields `hooks: null`, i.e. "not measured".
 */
function wiringText() {
  let text = ''
  let hooks = null
  try {
    const raw = readFileSync(SETTINGS, 'utf8')
    text += raw
    hooks = parseHookTable(JSON.parse(raw))
  } catch {
    /* no settings, or unparsable — everything reads as unwired, so fail open below */
  }
  try {
    const hooksPath = execSync('git config core.hooksPath', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
    const dir = resolve(REPO_ROOT, hooksPath)
    if (hooksPath && existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        try {
          text += readFileSync(resolve(dir, f), 'utf8')
        } catch {
          /* unreadable hook file */
        }
      }
    }
  } catch {
    /* no hooksPath configured — nothing to add */
  }
  return { text, hooks }
}

/**
 * Everything the core needs — exported so the guard preflight predicts this gate
 * from the SAME gathering the Stop hook uses rather than a second copy of it.
 *
 * `ignoreOwnership` is for the --status probe alone: a probe that stays silent
 * under another owner is indistinguishable from "nothing wrong", which is the
 * very defect this guard looks for.
 */
export function gatherGuardHealthInputs({ sessionId = '', ignoreOwnership = false } = {}) {
  if (!ignoreOwnership) {
    if (heldByOtherLiveOwner(sessionId)) {
      return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
    }
    if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  }

  const { text: wiredText, hooks: hookCommands } = wiringText()
  // No wiring source readable at all: every enforcer would look dead. That is a
  // measurement failure, not a finding — say so instead of blocking on it.
  if (!wiredText.trim()) {
    return { applicable: false, why: 'Verdrahtungsquelle nicht lesbar — keine Aussage möglich' }
  }

  const files = readdirSync(SCRIPTS)
  const sources = {}
  for (const f of files) {
    if (!/-(guard|gate|hook)\.mjs$/.test(f)) continue
    try {
      sources[f] = readFileSync(resolve(SCRIPTS, f), 'utf8')
    } catch {
      /* unreadable: left undefined so its testedness is not judged */
    }
  }
  return { applicable: true, inputs: { files, sources, wiredText, hookCommands } }
}

/**
 * The wiring table for the staged rollout: every hook line, how its path
 * resolves, and — for a relative one — the anchored command to put in its place.
 * A report, not a verdict: the blocking judgement is the core's.
 */
function formatWiring(hookCommands) {
  const rows = Array.isArray(hookCommands) ? hookCommands : []
  if (rows.length === 0) return 'guard-health --wiring: keine Hook-Zeilen lesbar.'
  const out = ['HOOK-VERDRAHTUNG (Punkt 438) — kann jeder Hook aus JEDEM Arbeitsverzeichnis starten?', '']
  let relative = 0
  for (const row of rows) {
    const { kind, anchored } = commandAnchoring(row.command)
    if (!anchored) relative += 1
    const where = `${row.event}${row.matcher ? `(${row.matcher})` : ''}`
    out.push(`${anchored ? 'OK ' : '!! '} ${where.padEnd(26)} ${row.command}`)
    if (!anchored) out.push(`${' '.repeat(31)}→ ${anchorCommand(row.command)}`)
    else if (kind === 'no-script') out.push(`${' '.repeat(31)}  (kein scripts/*.mjs — nicht beurteilt)`)
  }
  out.push('', `${rows.length} Hook-Zeilen, davon ${relative} cwd-relativ.`)
  if (relative > 0) {
    out.push(
      'Rollout: EINE harmlose Zeile zuerst (lock-heartbeat-hook), in einer NEUEN Sitzung aus einem',
      'Nicht-Wurzel-Verzeichnis prüfen, dann der Rest — und den Namen in RELATIVE_WIRING_ROLLOUT',
      'im selben Commit streichen. `.claude/settings.json` ist ein geschützter Pfad: betreut, nie headless.',
    )
  }
  return out.join('\n')
}

if (isMainModule(import.meta.url)) {
  try {
    const wiring = process.argv[2] === '--wiring'
    const status = process.argv[2] === '--status' || wiring
    let sid = ''
    if (!status) {
      try {
        sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
      } catch {
        /* manual run — the rule binds regardless */
      }
    }

    const gathered = gatherGuardHealthInputs({ sessionId: sid, ignoreOwnership: status })
    if (!gathered.applicable) {
      if (status) console.log(`guard-health: ${gathered.why}`)
      process.exit(0)
    }

    if (wiring) {
      console.log(formatWiring(gathered.inputs.hookCommands))
      process.exit(0)
    }

    const { ok, violations, report } = auditGuardHealth(gathered.inputs)

    if (status) {
      // A dimension that could not be MEASURED is named, never folded into the
      // all-clear: an unparsable settings file leaves the anchoring unjudged,
      // and an OK line that hides that is the false clean this guard exists to
      // prevent elsewhere (four-eyes review 07.08.2026).
      const unmeasured = gathered.inputs.hookCommands === null ? ' — Verdrahtungs-Anker NICHT messbar' : ''
      console.log(
        ok
          ? `guard-health: OK (${report.length} Durchsetzer, alle verdrahtet und geprüft)${unmeasured}`
          : `${formatGuardHealth(violations)}${unmeasured}`,
      )
      process.exit(0)
    }
    if (!ok) process.stdout.write(JSON.stringify({ decision: 'block', reason: formatGuardHealth(violations) }))
    process.exit(0)
  } catch (e) {
    console.error(`guard-health-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
