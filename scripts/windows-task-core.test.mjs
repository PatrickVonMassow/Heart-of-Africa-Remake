// THE WINDOWS BOOT PATH, PROVEN FROM LINUX (point 447).
//
// The machine this is for is a Windows host; the machine this repository builds
// on is a Linux container. So everything that can be decided without Task
// Scheduler is decided in a pure module and pinned here — the names, the
// cadence, how a task report is read, what a peer's state means, and which
// repair follows from it — and the PowerShell setup script is held to the same
// constants by reading its text. What genuinely cannot be proven here is the one
// elevated run on the Windows host; that is stated as an open item rather than
// implied by a green test.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { LAUNCHER_TASK_NAME } from './batch-launcher-core.mjs'
import {
  OK_TASK_RESULTS,
  PEER_MAX_SILENCE_MS,
  PRIMARY_TASK_NAME,
  SETUP_SCRIPT_PATH,
  TASK_DEFINITION_DIR,
  TASK_INTERVAL_MINUTES,
  WATCHDOG_OFFSET_MINUTES,
  WATCHDOG_TASK_NAME,
  WATCH_SCRIPT_PATH,
  definitionPathFor,
  formatVerdict,
  normalizeState,
  parseTaskReport,
  parseWatchArgs,
  peerVerdict,
  remedyCommand,
  shouldApply,
  taskNameFor,
  taskProbeCommand,
  triggerKind,
} from './windows-task-core.mjs'

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPTS_DIR, '..')
const MINUTE = 60 * 1000

/** A report as the probe would deliver it, healthy unless overridden. */
const report = (over = {}) =>
  parseTaskReport({
    exists: true,
    name: PRIMARY_TASK_NAME,
    state: 'Ready',
    triggers: ['MSFT_TaskTimeTrigger', 'MSFT_TaskLogonTrigger'],
    actions: ['C:\\node.exe scripts\\batch-autostart.mjs'],
    lastRunTime: new Date(Date.now() - 5 * MINUTE).toISOString(),
    lastTaskResult: 0,
    ...over,
  })

describe('the two task names', () => {
  it('names the same primary task the launcher probe asks for', () => {
    // The one name that exists in two modules. Drift here would leave the
    // watchdog watching a task nothing else knows about.
    expect(PRIMARY_TASK_NAME).toBe(LAUNCHER_TASK_NAME)
  })

  it('gives the watchdog its own name and resolves both roles', () => {
    expect(WATCHDOG_TASK_NAME).toBe('HoA-Batch-Watchdog')
    expect(WATCHDOG_TASK_NAME).not.toBe(PRIMARY_TASK_NAME)
    expect(taskNameFor('primary')).toBe(PRIMARY_TASK_NAME)
    expect(taskNameFor('watchdog')).toBe(WATCHDOG_TASK_NAME)
    expect(taskNameFor('nonsense')).toBeNull()
    expect(taskNameFor(undefined)).toBeNull()
  })

  it('offsets the watchdog against the primary cadence instead of sharing it', () => {
    // Ticking together is the one arrangement that breaks the check: each would
    // read a peer that has not yet recorded the run it is starting.
    expect(WATCHDOG_OFFSET_MINUTES).toBeGreaterThan(0)
    expect(WATCHDOG_OFFSET_MINUTES).toBeLessThan(TASK_INTERVAL_MINUTES)
  })

  it('tolerates two missed ticks before calling a peer silent', () => {
    expect(PEER_MAX_SILENCE_MS).toBeGreaterThan(2 * TASK_INTERVAL_MINUTES * MINUTE)
  })

  it('puts each definition under the git-ignored local directory', () => {
    expect(TASK_DEFINITION_DIR.startsWith('local/')).toBe(true)
    expect(definitionPathFor(WATCHDOG_TASK_NAME)).toBe(`${TASK_DEFINITION_DIR}/${WATCHDOG_TASK_NAME}.xml`)
  })
})

describe('taskProbeCommand', () => {
  it('asks Get-ScheduledTask and Get-ScheduledTaskInfo for the named task', () => {
    const cmd = taskProbeCommand(WATCHDOG_TASK_NAME)
    expect(cmd).toContain(`Get-ScheduledTask -TaskName '${WATCHDOG_TASK_NAME}'`)
    expect(cmd).toContain(`Get-ScheduledTaskInfo -TaskName '${WATCHDOG_TASK_NAME}'`)
    expect(cmd).toContain('ConvertTo-Json')
  })

  it('answers a MISSING task with exists:false instead of a failure', () => {
    // The distinction the whole repair rests on: "no such task" is repairable,
    // "PowerShell did not answer" must never be treated as one.
    expect(taskProbeCommand(PRIMARY_TASK_NAME)).toContain('exists = $false')
  })
})

describe('parseTaskReport', () => {
  it('reads a healthy report, in the JSON the probe emits', () => {
    const r = report()
    expect(r.readable).toBe(true)
    expect(r.exists).toBe(true)
    expect(r.state).toBe('ready')
    expect(r.triggers).toEqual(['time', 'logon'])
    expect(r.lastResult).toBe(0)
    expect(typeof r.lastRunAt).toBe('number')
  })

  it('accepts the JSON as text, the way the probe actually returns it', () => {
    const r = parseTaskReport(JSON.stringify({ exists: true, name: 'X', state: 'Running', triggers: [], actions: [] }))
    expect(r.state).toBe('running')
    expect(r.name).toBe('X')
  })

  it('unwraps the single-element array Windows PowerShell 5.1 flattens', () => {
    // ConvertTo-Json turns a one-element array into a scalar; a task with exactly
    // one trigger would otherwise report no triggers at all.
    const r = parseTaskReport({ exists: true, triggers: 'MSFT_TaskBootTrigger', actions: 'node x.mjs' })
    expect(r.triggers).toEqual(['boot'])
    expect(r.actions).toEqual(['node x.mjs'])
  })

  it('reads a missing task as absent, not as unreadable', () => {
    const r = parseTaskReport({ exists: false, name: PRIMARY_TASK_NAME })
    expect(r.readable).toBe(true)
    expect(r.exists).toBe(false)
    expect(r.state).toBe('absent')
  })

  it('reads junk as UNREADABLE and not as a missing task', () => {
    for (const junk of ['', 'Get-ScheduledTask : Access denied', null, 42]) {
      const r = parseTaskReport(junk, { taskName: PRIMARY_TASK_NAME })
      expect(r.readable).toBe(false)
      expect(r.name).toBe(PRIMARY_TASK_NAME)
    }
  })

  it('resolves the numeric State enum a differently-serialised probe may emit', () => {
    expect(normalizeState(1)).toBe('disabled')
    expect(normalizeState('3')).toBe('ready')
    expect(normalizeState('Disabled')).toBe('disabled')
    expect(normalizeState('something else')).toBe('unknown')
    expect(normalizeState(null)).toBe('unknown')
  })

  it('names an unrecognised trigger class rather than dropping it', () => {
    expect(triggerKind('MSFT_TaskLogonTrigger')).toBe('logon')
    expect(triggerKind('MSFT_TaskBootTrigger')).toBe('boot')
    expect(triggerKind('MSFT_TaskSomethingNew')).toBe('MSFT_TaskSomethingNew')
    expect(triggerKind('')).toBe('unknown')
  })
})

describe('peerVerdict — what a peer state means, and the smallest repair for it', () => {
  const now = Date.now()

  it('leaves a healthy peer alone', () => {
    const v = peerVerdict({ report: report(), now })
    expect(v.status).toBe('ok')
    expect(v.action).toBe('none')
  })

  it('re-registers a peer that no longer exists', () => {
    const v = peerVerdict({ report: parseTaskReport({ exists: false }), now })
    expect(v.status).toBe('missing')
    expect(v.action).toBe('register')
  })

  it('enables a disabled peer', () => {
    const v = peerVerdict({ report: report({ state: 'Disabled' }), now })
    expect(v.status).toBe('disabled')
    expect(v.action).toBe('enable')
  })

  it('starts a peer that has been silent for longer than the limit', () => {
    const v = peerVerdict({ report: report({ lastRunTime: new Date(now - 90 * MINUTE).toISOString() }), now })
    expect(v.status).toBe('stale')
    expect(v.action).toBe('start')
    expect(v.reason).toMatch(/90 min ago/)
  })

  it('leaves a peer that ran within the limit alone', () => {
    const v = peerVerdict({ report: report({ lastRunTime: new Date(now - 20 * MINUTE).toISOString() }), now })
    expect(v.action).toBe('none')
  })

  it('starts a peer that has never run', () => {
    const v = peerVerdict({ report: report({ lastRunTime: null }), now })
    expect(v.status).toBe('never-ran')
    expect(v.action).toBe('start')
  })

  it('REPORTS a failing peer without restarting it', () => {
    // The scheduling works and the payload failed; restarting it every quarter
    // of an hour would turn one broken run into a loop.
    const v = peerVerdict({ report: report({ lastTaskResult: 1 }), now })
    expect(v.status).toBe('failing')
    expect(v.action).toBe('none')
  })

  it('does not call the scheduler\'s own "ready / running / not yet run" codes a failure', () => {
    for (const code of [...OK_TASK_RESULTS]) {
      expect(peerVerdict({ report: report({ lastTaskResult: code }), now }).status).toBe('ok')
    }
  })

  it('treats a running peer as healthy even with an old recorded run', () => {
    const r = report({ state: 'Running', lastRunTime: new Date(now - 300 * MINUTE).toISOString() })
    expect(peerVerdict({ report: r, now }).action).toBe('none')
  })

  it('JUDGES NOTHING when the probe was unreadable', () => {
    const v = peerVerdict({ report: parseTaskReport('not json'), now })
    expect(v.status).toBe('unreadable')
    expect(v.action).toBe('none')
  })
})

describe('remedyCommand', () => {
  it('registers from the exported definition, enables and starts by name', () => {
    const name = WATCHDOG_TASK_NAME
    expect(remedyCommand({ action: 'register' }, { taskName: name, definitionPath: 'C:\\r\\x.xml' })).toBe(
      `Register-ScheduledTask -TaskName '${name}' -Xml (Get-Content -Raw 'C:\\r\\x.xml') -Force`,
    )
    expect(remedyCommand({ action: 'enable' }, { taskName: name })).toBe(`Enable-ScheduledTask -TaskName '${name}'`)
    expect(remedyCommand({ action: 'start' }, { taskName: name })).toBe(`Start-ScheduledTask -TaskName '${name}'`)
    expect(remedyCommand({ action: 'none' }, { taskName: name })).toBeNull()
    expect(remedyCommand(null, { taskName: name })).toBeNull()
  })

  it('falls back to the standard definition path when none is given', () => {
    expect(remedyCommand({ action: 'register' }, { taskName: PRIMARY_TASK_NAME })).toContain(
      definitionPathFor(PRIMARY_TASK_NAME),
    )
  })
})

describe('shouldApply — the paused batch stands the repair down', () => {
  it('repairs when the batch is running and repairs were asked for', () => {
    expect(shouldApply({ requested: true, paused: false })).toBe(true)
  })

  it('repairs NOTHING while .claude/batch-paused exists', () => {
    // Otherwise the documented way to stop the batch on Windows — disabling or
    // deleting the primary task — would be undone by the watchdog on its next
    // tick, and the pause file would be the last handle that still worked.
    expect(shouldApply({ requested: true, paused: true })).toBe(false)
  })

  it('still withholds a repair under --dry-run', () => {
    expect(shouldApply({ requested: false, paused: false })).toBe(false)
    expect(shouldApply()).toBe(true)
  })
})

describe('formatVerdict', () => {
  it('states the task, the verdict and — when there was one — the repair', () => {
    const verdict = { status: 'stale', reason: 'the task last ran 90 min ago' }
    expect(formatVerdict({ taskName: 'T', verdict })).toBe('T: stale — the task last ran 90 min ago')
    expect(formatVerdict({ taskName: 'T', verdict, applied: { ok: true, action: 'start' } })).toContain('repaired (start)')
    const failed = formatVerdict({ taskName: 'T', verdict, applied: { ok: false, action: 'start', error: 'denied' } })
    expect(failed).toContain('REPAIR FAILED')
    expect(failed).toContain('denied')
  })
})

describe('parseWatchArgs', () => {
  it('takes the PEER to check, and repairs by default', () => {
    expect(parseWatchArgs(['--check', 'primary'])).toMatchObject({ role: 'primary', apply: true, json: false, error: null })
    expect(parseWatchArgs(['--check', 'watchdog', '--json'])).toMatchObject({ role: 'watchdog', json: true })
  })

  it('withholds every repair under --dry-run', () => {
    expect(parseWatchArgs(['--check', 'primary', '--dry-run']).apply).toBe(false)
  })

  it('refuses an unknown role, an unknown flag and a missing role', () => {
    expect(parseWatchArgs(['--check', 'both']).error).toMatch(/unknown role/)
    expect(parseWatchArgs(['--check', 'primary', '--force']).error).toMatch(/unknown argument/)
    expect(parseWatchArgs([]).error).toMatch(/no role given/)
  })

  it('answers --help without demanding a role', () => {
    const parsed = parseWatchArgs(['--help'])
    expect(parsed.help).toBe(true)
    expect(parsed.error).toBeNull()
  })
})

describe('the watch CLI, run for real', () => {
  const run = (args) =>
    spawnSync(process.execPath, [join(SCRIPTS_DIR, 'windows-task-watch.mjs'), ...args], {
      encoding: 'utf8',
      windowsHide: true,
    })

  // ASSERT PER PLATFORM, NEVER BY SKIPPING (point 387): a bare `return` on
  // win32 made this case silently mean nothing on the one platform the script
  // exists for. Both readings are pinned instead — off Windows it is the no-op,
  // on Windows it is emphatically not. The win32 branch runs --dry-run, so the
  // probe reads the Task Scheduler without repairing or starting anything.
  it('is a no-op that EXITS 0 off Windows, and a real probe on it', () => {
    if (process.platform === 'win32') {
      expect(run(['--check', 'primary', '--dry-run']).stdout).not.toMatch(/no Task Scheduler/)
      return
    }
    const r = run(['--check', 'primary'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/no Task Scheduler/)
  })

  it('refuses an unknown role with usage text and exit 2', () => {
    const r = run(['--check', 'nonsense'])
    expect(r.status).toBe(2)
    expect(`${r.stderr}`).toMatch(/unknown role/)
    expect(`${r.stderr}`).toMatch(/--check primary\|watchdog/)
  })

  it('prints usage on --help', () => {
    const r = run(['--help'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(WATCH_SCRIPT_PATH)
  })
})

describe('the elevated setup script — held to the same constants by reading it', () => {
  const text = readFileSync(join(REPO_ROOT, SETUP_SCRIPT_PATH), 'utf8')
  const lines = text.split('\n')

  it('names exactly the task names, cadence and paths the core module exports', () => {
    expect(text).toContain(`$PrimaryTaskName        = '${PRIMARY_TASK_NAME}'`)
    expect(text).toContain(`$WatchdogTaskName       = '${WATCHDOG_TASK_NAME}'`)
    expect(text).toContain(`$TaskIntervalMinutes    = ${TASK_INTERVAL_MINUTES}`)
    expect(text).toContain(`$WatchdogOffsetMinutes  = ${WATCHDOG_OFFSET_MINUTES}`)
    expect(text).toContain(TASK_DEFINITION_DIR.replace(/\//g, '\\'))
    expect(text).toContain(WATCH_SCRIPT_PATH.replace(/\//g, '\\'))
  })

  it('refuses to run unelevated', () => {
    expect(text).toContain('WindowsBuiltInRole]::Administrator')
    expect(text).toMatch(/must run from an ELEVATED PowerShell/)
  })

  it('delivers all three parts of the boot path', () => {
    expect(text).toContain('-AtLogOn') // (a) instant resume
    expect(text).toContain('--check watchdog') // (b) the primary watches the second task
    expect(text).toContain('-AtStartup') // (c) the second task survives a reboot with nobody logged on
    expect(text).toContain('--check primary')
    expect(text).toContain("New-ScheduledTaskPrincipal -UserId 'SYSTEM'")
    expect(text).toContain('NoAutoRebootWithLoggedOnUsers') // (e) no restart into a locked screen
    expect(text).toContain('DisableAutomaticRestartSignOn')
    expect(text).toContain('PauseUpdatesExpiryTime')
  })

  it('exports both definitions where a re-registration reads them', () => {
    expect(text).toContain('Export-ScheduledTask')
    expect(text).toContain('$PrimaryTaskName, $WatchdogTaskName')
  })

  it('MUTATES NOTHING that is not behind a dry-run branch', () => {
    // The idempotency contract, read from the script: every call that changes the
    // machine sits within a few lines of the `$DryRun` fork that can withhold it.
    const mutators = /(^|\s)(Set-ScheduledTask|Register-ScheduledTask|New-ItemProperty|Set-Content|New-Item)\s/
    const offenders = []
    lines.forEach((line, i) => {
      if (line.trim().startsWith('#')) return
      if (!mutators.test(line)) return
      const window = lines.slice(Math.max(0, i - 20), i + 1).join('\n')
      if (!window.includes('$DryRun')) offenders.push(`${i + 1}: ${line.trim()}`)
    })
    expect(offenders).toEqual([])
  })

  it('decides each change against the CURRENT state, so a second run changes nothing', () => {
    // Each of the three arming steps asks first and only then acts.
    expect(text).toContain('$hasLogon')
    expect(text).toContain('$hasWatch')
    expect(text).toContain('Nothing changed — the boot path was already armed.')
    // The export comparison is normalised; an unnormalised one would report a
    // change on every run, which is exactly what an idempotent script must not do.
    expect(text).toMatch(/\$same = .*Trim\(\)/)
  })

  it('carries no path from one particular machine', () => {
    expect(text).not.toMatch(/[A-Z]:\\Users\\/)
  })
})
