// THE BOUNDARY COULD NOT BE VERIFIED ON LINUX (point 474, user 03.08.2026).
//
// `probeLauncherState` returned 'unknown' off win32, and `batch-progress-guard`
// reads 'unknown' as NOT armed — so on the container the project moved to, no
// point boundary could ever be taken. The one stop the batch is allowed to make
// was refused outright, and an autonomous run could not hand over at all.
//
// Both paths are pinned here, each from the OTHER host: the Windows probe must
// still be the PowerShell round trip (this suite runs on Linux), and the Linux
// probe must read the daemon's own record and grant 'armed' on evidence only.
// `platform`, `exec` and the record path are injected, so neither claim depends
// on which machine the suite happens to run on.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { probeLauncherState } from './batch-boundary.mjs'
import { LAUNCHER_RECORD_VERSION, LAUNCHER_STALE_TICKS } from './batch-launcher-core.mjs'

const TICK_MS = 15 * 60 * 1000

const withRecord = (record) => {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-launcher-'))
  const path = join(dir, 'batch-launcher.json')
  if (record !== null) writeFileSync(path, JSON.stringify(record), 'utf8')
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** A record for THIS process — the one pid a test can prove is alive. */
const liveRecord = (over = {}) => ({
  v: LAUNCHER_RECORD_VERSION,
  pid: process.pid,
  startedAt: Date.now(),
  lastTickAt: Date.now(),
  tickMs: TICK_MS,
  ...over,
})

describe('probeLauncherState — the Windows path stays the Windows path', () => {
  it('asks Get-ScheduledTask through PowerShell when process.platform is win32', () => {
    const calls = []
    const exec = (cmd, args) => {
      calls.push({ cmd, args })
      return 'Ready\r\n'
    }
    expect(probeLauncherState({ platform: 'win32', exec })).toBe('armed')
    expect(calls).toHaveLength(1)
    expect(calls[0].cmd).toBe('powershell')
    expect(calls[0].args.join(' ')).toContain("Get-ScheduledTask -TaskName 'HoA-Batch-Autostart'")
  })

  it('reads a disabled task as disabled and a failed probe as unknown', () => {
    expect(probeLauncherState({ platform: 'win32', exec: () => 'Disabled' })).toBe('disabled')
    expect(probeLauncherState({
      platform: 'win32',
      exec: () => {
        throw new Error('no such task')
      },
    })).toBe('unknown')
  })

  it('never reads the daemon record on Windows — the record there is not the launcher', () => {
    const { path, cleanup } = withRecord(liveRecord())
    try {
      // A perfectly armed daemon record must not make a DELETED scheduled task
      // read as armed: two launchers for one batch is the double-spawn the
      // singleton exists to prevent.
      expect(probeLauncherState({
        platform: 'win32',
        recordPath: path,
        exec: () => {
          throw new Error('no such task')
        },
      })).toBe('unknown')
    } finally {
      cleanup()
    }
  })
})

describe('probeLauncherState — the Linux path reads the daemon, on evidence only', () => {
  it('reads a fresh record with a live pid as armed', () => {
    const { path, cleanup } = withRecord(liveRecord())
    try {
      expect(probeLauncherState({ platform: 'linux', recordPath: path })).toBe('armed')
    } finally {
      cleanup()
    }
  })

  it('reads a dead pid, a stale record and a missing record as unknown', () => {
    // A pid that cannot exist: pid 0 is never a process, and the classifier
    // refuses it before any probe.
    const dead = withRecord(liveRecord({ pid: 0 }))
    try {
      expect(probeLauncherState({ platform: 'linux', recordPath: dead.path })).toBe('unknown')
    } finally {
      dead.cleanup()
    }

    const old = Date.now() - TICK_MS * LAUNCHER_STALE_TICKS - 1000
    const stale = withRecord(liveRecord({ startedAt: old, lastTickAt: old }))
    try {
      expect(probeLauncherState({ platform: 'linux', recordPath: stale.path })).toBe('unknown')
    } finally {
      stale.cleanup()
    }

    const missing = withRecord(null)
    try {
      expect(probeLauncherState({ platform: 'linux', recordPath: missing.path })).toBe('unknown')
    } finally {
      missing.cleanup()
    }
  })

  it('reads a stopped daemon as disabled — a disarmed launcher is not an unreadable one', () => {
    const { path, cleanup } = withRecord(liveRecord({ stopped: true }))
    try {
      expect(probeLauncherState({ platform: 'linux', recordPath: path })).toBe('disabled')
    } finally {
      cleanup()
    }
  })
})
