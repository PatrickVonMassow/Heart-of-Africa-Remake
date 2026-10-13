// A freed batch lock must not land silently in the window a person is typing
// into (user 31.08.2026). Pins: the turn-end acquire decision, the visible
// ownership-change line, and a drill — an owner dies beside a live interactive
// window and the launcher's worker, not that window, becomes the successor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  freeLockDeclinedLine,
  ownershipChangeLine,
  transcriptShowsPerson,
  turnEndOwnership,
} from './batch-resume-hook-core.mjs'
import { composeHookText, gatherBatchProgressInputs, turnEndInvitation } from './batch-progress-guard.mjs'
import { acquire, assessOwner, convertPendingSpawn, readOwnerLock, statePathsFor } from './batch-singleton.mjs'
import { launcherStartDecision } from './batch-autostart-core.mjs'

// The two transcript shapes measured on 13.10.2026 in this repo's transcripts.
const LAUNCHER_PROMPT = JSON.stringify({
  type: 'user',
  promptSource: 'sdk',
  turnOrigin: 'sdk',
  message: { role: 'user', content: 'Autonome Batch-Wiederaufnahme (vom Launcher gestartet).' },
})
const TOOL_RESULT = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
})
const HUMAN_PROMPT = JSON.stringify({
  type: 'user',
  promptSource: 'sdk',
  turnOrigin: 'human',
  origin: { kind: 'human' },
  message: { role: 'user', content: 'Was macht der Batch gerade?' },
})
const UNATTENDED = [LAUNCHER_PROMPT, TOOL_RESULT].join('\n')
const INTERACTIVE = [LAUNCHER_PROMPT, HUMAN_PROMPT, TOOL_RESULT].join('\n')

describe('transcriptShowsPerson', () => {
  it('a human-origin prompt proves a person; a launcher prompt and tool results do not', () => {
    expect(transcriptShowsPerson(INTERACTIVE)).toBe(true)
    expect(transcriptShowsPerson(UNATTENDED)).toBe(false)
  })
  it('nothing to read is unproven, never interactive', () => {
    expect(transcriptShowsPerson(null)).toBe(null)
    expect(transcriptShowsPerson('')).toBe(null)
  })
  it('a torn line naming "human" proves nothing', () => {
    expect(transcriptShowsPerson('{"origin":{"kind":"human"')).toBe(false)
  })
})

describe('turnEndOwnership — the acquire decision', () => {
  it('an interactive non-claimant does NOT take a freed lock', () => {
    expect(turnEndOwnership({ interactive: true })).toEqual({ mayAcquire: false, invitation: null })
  })
  it('an unattended session takes it, and an unproven one keeps the never-ownerless path', () => {
    expect(turnEndOwnership({ interactive: false })).toEqual({ mayAcquire: true, invitation: 'unattended' })
    expect(turnEndOwnership({ interactive: null })).toEqual({ mayAcquire: true, invitation: 'unattended' })
  })
  it("a lock held here or the window's own claim invites even an interactive window", () => {
    expect(turnEndOwnership({ heldHere: true, interactive: true })).toMatchObject({ mayAcquire: true, invitation: 'held' })
    expect(turnEndOwnership({ claimMine: true, interactive: true })).toMatchObject({ mayAcquire: true, invitation: 'claim' })
  })
})

describe('the ownership change is announced on its own', () => {
  it('leads the hook text as its own paragraph, ahead of any refusal', () => {
    const line = ownershipChangeLine({ sessionId: 'sid-7', invitation: 'unattended' })
    expect(line).toMatch(/^BATCH OWNERSHIP CHANGED: this session \(sid-7\)/)
    expect(line).not.toContain('\n')
    const text = composeHookText(line, 'The batch is NOT finished — continue.')
    expect(text.split('\n\n')[0]).toBe(line)
    expect(composeHookText(line, '')).toBe(line)
    expect(composeHookText('', 'refusal')).toBe('refusal')
  })
  it('the declined line asks instead of taking', () => {
    const line = freeLockDeclinedLine({ sessionId: 'sid-8' })
    expect(line).toMatch(/^BATCH FREE, NOT TAKEN/)
    expect(line).toContain('batch-claim.mjs --take --session sid-8')
  })
})

describe('drill: an owner dies beside a live interactive window', () => {
  let dir
  let lockPath
  let fencePath
  const OWNER_PID = 424242
  const WORKER_PID = 535353
  const dead = (pid) => (pid === OWNER_PID ? { exists: false, startedAt: null } : { exists: true, startedAt: null })
  const transcript = (name, text) => {
    const path = join(dir, `${name}.jsonl`)
    writeFileSync(path, text)
    return path
  }
  // The owner went silent an hour ago and its process is gone: lease expired, pid dead.
  const deadOwner = () => {
    const at = Date.now() - 3_600_000
    writeFileSync(lockPath, JSON.stringify({
      v: 2, sessionId: 'owner-1', kind: 'session', startedAt: at, claimedAt: at, acquiredAt: at,
      leaseUntil: at + 60_000, fence: 1, pid: OWNER_PID, pidStartedAt: 1,
    }))
    return readOwnerLock(lockPath)
  }
  const base = () => ({ lockPath, fencePath, bootTime: 0, findAncestorFn: () => null, probePidFn: dead })
  const invitation = (sid, path) =>
    turnEndInvitation(sid, path, { lockPath, claimOf: () => ({ mine: false }) })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'turn-end-ownership-'))
    lockPath = join(dir, 'batch-lock.json')
    fencePath = statePathsFor(lockPath).fencePath
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("the launcher's worker, not the window, becomes the successor", () => {
    const ownerLock = deadOwner()
    expect(assessOwner(ownerLock, { now: Date.now(), bootTime: 0, probe: dead(OWNER_PID) }).alive).toBe(false)

    // The window's turn end: interactive, uninvited → it does not acquire.
    const window = invitation('window-2', transcript('window', INTERACTIVE))
    expect(window.mayAcquire).toBe(false)
    expect(readOwnerLock(lockPath).sessionId).toBe('owner-1')

    // The launcher tick sees an inactive owner, wins the pending lock, and its
    // spawned worker converts it.
    const start = launcherStartDecision({
      lock: ownerLock,
      assessment: assessOwner(ownerLock, { now: Date.now(), bootTime: 0, probe: dead(OWNER_PID) }),
    })
    expect(start.start).toBe(true)
    expect(acquire('launcher-x', { ...base(), kind: 'pending-spawn', pid: 1, extra: { spawnedPid: WORKER_PID } })).toBe(
      'acquired',
    )
    expect(convertPendingSpawn('worker-3', { lockPath, pid: WORKER_PID })).toBe(true)
    expect(readOwnerLock(lockPath)).toMatchObject({ sessionId: 'worker-3', kind: 'session' })

    // The window's next turn end still takes nothing.
    expect(invitation('window-2', transcript('window', INTERACTIVE)).mayAcquire).toBe(false)
  })

  it('an unattended session beside the dead owner still takes the batch', () => {
    deadOwner()
    const plan = invitation('worker-9', transcript('worker', UNATTENDED))
    expect(plan).toEqual({ mayAcquire: true, invitation: 'unattended' })
    expect(acquire('worker-9', { ...base(), pid: WORKER_PID })).toBe('acquired')
    expect(readOwnerLock(lockPath).sessionId).toBe('worker-9')
  })

  it('the guard preflight predicts no ownership for the uninvited interactive window', () => {
    const lock = deadOwner()
    const inputs = (mayAcquire) =>
      gatherBatchProgressInputs({
        sessionId: 'window-2',
        paused: false,
        lockPath,
        lock,
        tasksText: '- [ ] 1. open point',
        probes: { turnEndInvitation: () => ({ mayAcquire }) },
      })
    expect(inputs(false)).toMatchObject({ applicable: false, cause: 'uninvited-interactive' })
    expect(inputs(true).cause).not.toBe('uninvited-interactive')
  })
})
