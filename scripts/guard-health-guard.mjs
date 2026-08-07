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
import { fileURLToPath } from 'node:url'
import { auditGuardHealth, formatGuardHealth } from './guard-health-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { CAUSE } from './guard-preflight-core.mjs'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const REPO_ROOT = R('..')
const SCRIPTS = R('.')
const SETTINGS = R('../.claude/settings.json')
const PAUSE = R('../.claude/batch-paused')

/**
 * Everything that could invoke an enforcer, as one blob: the hook settings plus
 * the contents of an ACTIVE git hooks directory. An inactive hooks path
 * contributes nothing — which is the point, since that is exactly how a gate
 * script ends up dead.
 */
function wiringText() {
  let text = ''
  try {
    text += readFileSync(SETTINGS, 'utf8')
  } catch {
    /* no settings — everything reads as unwired, so fail open below */
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
  return text
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

  const wiredText = wiringText()
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
  return { applicable: true, inputs: { files, sources, wiredText } }
}

if (isMainModule(import.meta.url)) {
  try {
    const status = process.argv[2] === '--status'
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

    const { ok, violations, report } = auditGuardHealth(gathered.inputs)

    if (status) {
      console.log(
        ok
          ? `guard-health: OK (${report.length} Durchsetzer, alle verdrahtet und geprüft)`
          : formatGuardHealth(violations),
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
