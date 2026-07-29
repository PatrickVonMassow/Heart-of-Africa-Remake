// THE DELIVERY, PROVEN ON THE SPAWNED HOOK (point 406).
//
// chat-spool.test.mjs proves the decision and the claim as function calls; this
// suite proves the one property that only exists at process level: WHAT THE HOOK
// WRITES TO STDOUT. The token rule reduces to `expect(stdout).toBe('')` — an
// empty spool must cost zero bytes, because injected context is re-sent with
// every later request for the rest of the session — and the delivery shape must
// be the exact `hookSpecificOutput` envelope, since a hook's plain stdout is
// never shown to the model.
//
// It runs `node scripts/lock-heartbeat-hook.mjs` the way the harness does (the
// payload on stdin) against an ISOLATED temp repo, so REPO_ROOT is the temp dir
// and this suite can never touch the real spool or lock.
//
// IT IS ITS OWN FILE ON PURPOSE. Every case blocks its worker inside a
// `spawnSync`; folding these onto the existing spawned-hook suite put fifteen
// blocking spawns in one file and starved the Vitest pool — the run stayed green
// but ended in "Timeout calling onTaskUpdate", i.e. a RED gate. Split across two
// files each stays inside the budget. Keep the case count here small for the
// same reason: what can be proved without a process belongs in
// scripts/chat-spool.test.mjs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
const OWNER = 'chat-delivery-session'
let repo

const claudeDir = () => resolve(repo, '.claude')
const lockPath = () => resolve(claudeDir(), 'batch-lock.json')
const spoolDir = () => resolve(claudeDir(), 'chat-spool')
const consumedDir = () => resolve(spoolDir(), 'consumed')

const runHook = (sessionId = OWNER) =>
  spawnSync(process.execPath, [resolve(repo, 'scripts', 'lock-heartbeat-hook.mjs')], {
    encoding: 'utf8',
    cwd: repo,
    input: JSON.stringify({
      session_id: sessionId,
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'x.ts' },
    }),
  })

/** The lock names OWNER. `pid` is filled so the heartbeat never walks for an
 *  ancestor — that walk is a PowerShell round trip and irrelevant here. */
const ownedBy = (sessionId = OWNER) =>
  writeFileSync(
    lockPath(),
    JSON.stringify({ v: 2, sessionId, pid: process.pid, pidStartedAt: Date.now(), claimedAt: Date.now() }, null, 2),
  )

const spool = (message) => {
  mkdirSync(spoolDir(), { recursive: true })
  writeFileSync(resolve(spoolDir(), `${message.ntfyId}.json`), JSON.stringify(message))
}

const message = (over = {}) => ({
  id: 'm1',
  ntfyId: 'n1',
  ts: 1_700_000_000_000,
  receivedAt: 1_700_000_000_000,
  text: 'bitte v0.3 vorbereiten',
  ...over,
})

const pendingFiles = () => {
  try {
    return readdirSync(spoolDir()).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
}

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-chat-hook-'))
  mkdirSync(claudeDir(), { recursive: true })
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), { recursive: true })
  // No TASKS.md: the due-mark duty then finds nothing, which is one of its own
  // documented states and keeps this suite about the chat alone.
  ownedBy()
})

afterAll(() => {
  try {
    rmSync(repo, { recursive: true, force: true })
  } catch {
    /* windows may still hold a handle — a temp dir left behind is harmless */
  }
})

describe('the user message at the next tool call', () => {
  it('THE TOKEN RULE: an empty spool writes not one byte', () => {
    const r = runHook()
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('stands down for a session that does not own the batch, consuming nothing', () => {
    spool(message())
    const r = runHook('somebody-else')
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(pendingFiles()).toEqual(['n1.json'])
  })

  it('delivers the waiting message as the additionalContext JSON and consumes it', () => {
    const r = runHook()
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: expect.stringContaining('bitte v0.3 vorbereiten'),
      },
    })
    expect(pendingFiles()).toEqual([])
    expect(existsSync(resolve(consumedDir(), 'n1.json'))).toBe(true)
  })

  it('says nothing at the NEXT call — the same message is never injected twice', () => {
    const r = runHook()
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('stays silent and does not fail the tool call on a corrupt spool', () => {
    writeFileSync(resolve(spoolDir(), 'n9.json'), 'not json at all')
    const r = runHook()
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })
})
