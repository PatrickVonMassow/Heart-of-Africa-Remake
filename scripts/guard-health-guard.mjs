// Stop hook: no enforcer may sit in the tree unable to fire.
// See guard-health-core.mjs for the two specimens that motivated it.
//
// The decision logic is pure and Vitest-covered; this wrapper only reads the
// tree and is fail-OPEN. --status answers regardless of who owns the batch
// lock: a probe that stays silent under another owner is indistinguishable from
// "nothing wrong", which is the very defect this guard looks for.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { anchorCommand, auditGuardHealth, commandAnchoring, formatGuardHealth } from './guard-health-core.mjs'
import { parseHookTable } from './guard-inventory-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { CAUSE } from './guard-preflight-core.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

const SCRIPTS = repoPath('scripts')
const SETTINGS = repoPath('.claude', 'settings.json')
const PAUSE = repoPath('.claude', 'batch-paused')

/** Names Git itself may invoke from core.hooksPath. A readable sample beside
 * them is documentation, not wiring; a non-executable recognized file cannot
 * fire on POSIX either. */
export const RECOGNIZED_GIT_HOOKS = new Set([
  'applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit',
  'prepare-commit-msg', 'commit-msg', 'post-commit', 'pre-rebase', 'post-checkout',
  'post-merge', 'pre-push', 'pre-receive', 'update', 'proc-receive', 'post-receive',
  'post-update', 'reference-transaction', 'push-to-checkout', 'pre-auto-gc',
  'post-rewrite', 'sendemail-validate', 'fsmonitor-watchman', 'p4-changelist',
  'p4-prepare-changelist', 'p4-post-changelist', 'p4-pre-submit', 'post-index-change',
])

/**
 * Measure every command that could invoke an enforcer. Any unreadable source is
 * UNKNOWN, never an empty source: proceeding on the readable half produced both
 * false refusals named by the cross-vendor review of aeedceb.
 *
 * Dependencies are injectable so Vitest can assert the failure distinctions
 * without touching the live repository or its shared Git config.
 */
export function measureWiringSources({
  readSettings = () => readFileSync(SETTINGS, 'utf8'),
  gitConfig = () => spawnSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }),
  pathExists = existsSync,
  readDir = readdirSync,
  hookStat = statSync,
  readHook = (path) => readFileSync(path, 'utf8'),
} = {}) {
  let hookCommands
  try {
    const parsed = JSON.parse(readSettings())
    hookCommands = parseHookTable(parsed)
  } catch (error) {
    return { ok: false, why: `Hook-Einstellungen nicht messbar (${error?.message ?? error})` }
  }

  const configured = gitConfig()
  const stderr = String(configured?.stderr ?? '').trim()
  if (configured?.error || (configured?.status !== 0 && !(configured?.status === 1 && !stderr))) {
    return {
      ok: false,
      why: `aktiver Git-Hook-Pfad nicht messbar (${stderr || configured?.error?.message || `git exit ${configured?.status}`})`,
    }
  }

  const wiringCommands = hookCommands.map((row) => row.command)
  const hooksPath = configured?.status === 0 ? String(configured.stdout ?? '').trim() : ''
  if (hooksPath) {
    const dir = resolve(REPO_ROOT, hooksPath)
    if (pathExists(dir)) {
      let names
      try {
        names = readDir(dir)
      } catch (error) {
        return { ok: false, why: `aktives Git-Hook-Verzeichnis nicht lesbar (${error?.message ?? error})` }
      }
      for (const name of names) {
        if (!RECOGNIZED_GIT_HOOKS.has(name)) continue
        const path = resolve(dir, name)
        let executable
        try {
          executable = (hookStat(path).mode & 0o111) !== 0
        } catch (error) {
          return { ok: false, why: `Git-Hook ${name} nicht messbar (${error?.message ?? error})` }
        }
        if (!executable) continue
        try {
          wiringCommands.push(...String(readHook(path)).split(/\r?\n/))
        } catch (error) {
          return { ok: false, why: `aktiver Git-Hook ${name} nicht lesbar (${error?.message ?? error})` }
        }
      }
    }
  }
  return { ok: true, wiringCommands, hookCommands }
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

  const wiring = measureWiringSources()
  if (!wiring.ok) return { applicable: false, why: `${wiring.why} — keine Aussage möglich` }

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
  return {
    applicable: true,
    inputs: {
      files,
      sources,
      wiringCommands: wiring.wiringCommands,
      hookCommands: wiring.hookCommands,
    },
  }
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
