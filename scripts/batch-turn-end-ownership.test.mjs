// A freed batch lock must not land silently in the window a person is typing
// into (user 31.08.2026). Pins: the turn-end acquire decision, the visible
// ownership-change line, and a drill — an owner dies beside a live interactive
// window and the launcher's worker, not that window, becomes the successor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  freeLockDeclinedLine,
  ownershipChangeLine,
  transcriptShowsPerson,
  turnEndOwnership,
} from './batch-resume-hook-core.mjs'
import { composeHookText, gatherBatchProgressInputs, turnEndInvitation } from './batch-progress-guard.mjs'
import { acquire, assessOwner, convertPendingSpawn, probePid, readOwnerLock, statePathsFor } from './batch-singleton.mjs'
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
  it('an unattended session takes it; an unproven one (empty or unreadable transcript) takes nothing', () => {
    expect(turnEndOwnership({ interactive: false })).toEqual({ mayAcquire: true, invitation: 'unattended' })
    expect(turnEndOwnership({ interactive: null })).toEqual({ mayAcquire: false, invitation: null })
    expect(turnEndOwnership({})).toEqual({ mayAcquire: false, invitation: null })
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

  // Right after /clear a chat window's transcript is empty, `transcriptShowsPerson`
  // reads it as unproven, and an unproven transcript takes nothing (finding
  // 21.10.2026) — else every later batch-duty Stop guard would bind the window.
  it('a chat window right after /clear (lock free, transcript empty) neither acquires nor owes duties', () => {
    const plan = invitation('chat-after-clear', transcript('cleared', ''))
    expect(plan.mayAcquire).toBe(false)
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

// THE REAL HOOK, run as the harness runs it: stdin payload, a fixture repository
// (HOA_REPO_ROOT) holding a dead owner's lock, one open and one closed point.
describe('the Stop hook itself', () => {
  const SID = 'bbbbbbbb-0000-4000-8000-000000000002'
  let root
  const state = (name) => join(root, '.claude', name)
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hoa-turn-end-'))
    mkdirSync(join(root, '.claude'))
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'TASKS.md'), '# Work order\n\n- [ ] 2. Still open.\n')
    writeFileSync(join(root, 'docs', 'tasks-archive.md'), '# Archive\n\n- [x] 1. Closed.\n')
    const at = Date.now() - 3_600_000
    writeFileSync(state('batch-lock.json'), JSON.stringify({
      v: 2, sessionId: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'session', startedAt: at, claimedAt: at,
      acquiredAt: at, leaseUntil: at + 60_000, fence: 1, pid: 424242, pidStartedAt: 1,
    }))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const runHook = (transcriptText) => {
    const transcriptPath = join(root, 'transcript.jsonl')
    writeFileSync(transcriptPath, transcriptText)
    const r = spawnSync(process.execPath, [resolve(REPO_ROOT, 'scripts', 'batch-progress-guard.mjs')], {
      cwd: root,
      env: { ...process.env, HOA_REPO_ROOT: root },
      input: JSON.stringify({ session_id: SID, transcript_path: transcriptPath }),
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    })
    expect(r.status).toBe(0)
    return { out: JSON.parse(r.stdout), lock: JSON.parse(readFileSync(state('batch-lock.json'), 'utf8')) }
  }

  it('an unattended session takes the dead lock and says so first, before the continue block', () => {
    const { out, lock } = runHook(UNATTENDED)
    expect(lock.sessionId).toBe(SID)
    expect(out.decision).toBe('block')
    const [lead, rest] = out.reason.split('\n\n')
    expect(lead).toBe(ownershipChangeLine({ sessionId: SID, invitation: 'unattended' }))
    expect(rest).toMatch(/^DO NOT STOP THE BATCH/)
  })

  it('an interactive window leaves the lock alone and asks', () => {
    const { out, lock } = runHook(INTERACTIVE)
    expect(lock.sessionId).toBe('aaaaaaaa-0000-4000-8000-000000000001')
    expect(out).toEqual({ systemMessage: freeLockDeclinedLine({ sessionId: SID }) })
  })

  it('an acquisition that hands over at a valid boundary still announces itself', () => {
    const now = Date.now()
    writeFileSync(state('batch-boundary.json'), JSON.stringify({ point: 1, sessionId: SID, at: now, phase: 'committed' }))
    // An armed launcher: a live daemon record naming this test process.
    writeFileSync(state('batch-launcher.json'), JSON.stringify({
      v: 1, pid: process.pid, pidStartedAt: probePid(process.pid)?.startedAt, startedAt: now, lastTickAt: now,
    }))
    const { out, lock } = runHook(UNATTENDED)
    expect(lock).toMatchObject({ sessionId: SID, handedOver: true })
    const [lead, rest] = out.systemMessage.split('\n\n')
    expect(lead).toBe(ownershipChangeLine({ sessionId: SID, invitation: 'unattended' }))
    expect(rest).toMatch(/HANDED THE BATCH OVER at its valid boundary \(point 1\)/)
  })
})
