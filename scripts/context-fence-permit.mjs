// Durable, single-use context permit IO. The live permit and its pending result
// are atomic state; every consumption/result is appended to a separate JSONL
// history so repeated emergency use remains visible.
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { sleepSync, writeJsonAtomic } from './atomic-write.mjs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import {
  buildContextPermit,
  consumedPermitRecord,
  contextPermitDecision,
  permitResultRecord,
} from './context-fence-permit-core.mjs'

export const CONTEXT_FENCE_PERMIT_PATH = repoPath('.claude/context-fence-permit.json')
export const CONTEXT_FENCE_PERMIT_PENDING_PATH = repoPath('.claude/context-fence-permit-pending.json')
export const CONTEXT_FENCE_PERMIT_RECORD_PATH = repoPath('.claude/context-fence-permits.jsonl')
export const CONTEXT_FENCE_STATE_LOCK_PATH = repoPath('.claude/context-fence-state.lock')

/** One deliberate next-call window; long-running work must ask deliberately again. */
export const CONTEXT_FENCE_PERMIT_TTL_MS = 10 * 60 * 1000
export const CONTEXT_FENCE_STATE_LOCK_STALE_MS = 30_000
export const CONTEXT_FENCE_STATE_LOCK_WAIT_MS = 2_000
const RETRY_MS = 5

const readJson = (path) => {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function removeStaleLock(path, now, staleMs) {
  try {
    if (now - statSync(path).mtimeMs <= staleMs) return false
    rmSync(path, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** Serialize issue/consume/result so two PreToolUse processes cannot spend one permit. */
export function withContextFenceStateLock(work, {
  lockPath = CONTEXT_FENCE_STATE_LOCK_PATH,
  now = Date.now,
  waitMs = CONTEXT_FENCE_STATE_LOCK_WAIT_MS,
  staleMs = CONTEXT_FENCE_STATE_LOCK_STALE_MS,
} = {}) {
  mkdirSync(dirname(lockPath), { recursive: true })
  const deadline = now() + waitMs
  for (;;) {
    try {
      mkdirSync(lockPath)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      removeStaleLock(lockPath, now(), staleMs)
      if (now() >= deadline) throw new Error(`timed out acquiring context-fence state lock ${lockPath}`)
      sleepSync(RETRY_MS)
    }
  }
  try {
    return work()
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}

export function repositoryHead({ cwd = REPO_ROOT, exec = execFileSync } = {}) {
  try {
    return String(exec('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })).trim() || null
  } catch {
    return null
  }
}

const appendRecord = (path, record) => {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(record)}\n`)
  return record
}

export function issueContextPermit(input, {
  path = CONTEXT_FENCE_PERMIT_PATH,
  recordPath = CONTEXT_FENCE_PERMIT_RECORD_PATH,
  lockPath = CONTEXT_FENCE_STATE_LOCK_PATH,
  now = Date.now,
  ttlMs = CONTEXT_FENCE_PERMIT_TTL_MS,
  id = randomUUID,
  head = repositoryHead,
} = {}) {
  const at = now()
  const permit = buildContextPermit({
    ...input,
    id: id(),
    now: at,
    ttlMs,
    head: head(),
  })
  return withContextFenceStateLock(() => {
    const existing = readJson(path)
    if (existing?.status === 'issued' && at < Number(existing.expiresAt)) {
      throw new Error(`an unused permit already exists for session ${existing.sessionId}, point ${existing.point}`)
    }
    mkdirSync(dirname(path), { recursive: true })
    writeJsonAtomic(path, permit)
    appendRecord(recordPath, {
      event: 'issued',
      timestamp: new Date(at).toISOString(),
      ...permit,
    })
    return permit
  }, { lockPath, now })
}

export function readContextPermit(path = CONTEXT_FENCE_PERMIT_PATH) {
  return readJson(path)
}

/** Atomically turn one matching issued permit into a consumed permit. */
export function consumeContextPermit(input, {
  path = CONTEXT_FENCE_PERMIT_PATH,
  pendingPath = CONTEXT_FENCE_PERMIT_PENDING_PATH,
  recordPath = CONTEXT_FENCE_PERMIT_RECORD_PATH,
  lockPath = CONTEXT_FENCE_STATE_LOCK_PATH,
  now = Date.now,
} = {}) {
  return withContextFenceStateLock(() => {
    const permit = readJson(path)
    const verdict = contextPermitDecision(permit, { ...input, now: now() })
    if (!verdict.use) return { used: false, reason: verdict.reason, permit: null, record: null }
    const at = now()
    const record = consumedPermitRecord(permit, { ...input, at })
    // The status transition is the single-use point. A second process sees
    // `consumed`, even if the first one is still appending the audit line.
    writeJsonAtomic(path, { ...permit, status: 'consumed', consumedAt: at, toolUseId: record.toolUseId })
    writeJsonAtomic(pendingPath, {
      permitId: permit.id,
      sessionId: permit.sessionId,
      point: permit.point,
      toolUseId: record.toolUseId,
      toolName: input.caller?.toolName ?? null,
    })
    appendRecord(recordPath, record)
    return { used: true, reason: verdict.reason, permit, record }
  }, { lockPath, now })
}

/** Called by the already-wired all-tools PostToolUse hook. */
export function recordContextPermitResult(payload, {
  pendingPath = CONTEXT_FENCE_PERMIT_PENDING_PATH,
  recordPath = CONTEXT_FENCE_PERMIT_RECORD_PATH,
  lockPath = CONTEXT_FENCE_STATE_LOCK_PATH,
  now = Date.now,
} = {}) {
  return withContextFenceStateLock(() => {
    const pending = readJson(pendingPath)
    if (!pending) return { written: false, reason: 'no-pending-permit' }
    const sessionId = String(payload?.session_id ?? payload?.sessionId ?? '')
    const toolUseId = String(payload?.tool_use_id ?? payload?.toolUseId ?? '')
    const toolName = String(payload?.tool_name ?? payload?.toolName ?? '')
    if (pending.sessionId !== sessionId) return { written: false, reason: 'another-session' }
    if (pending.toolUseId && pending.toolUseId !== toolUseId) return { written: false, reason: 'another-call' }
    if (!pending.toolUseId && pending.toolName && pending.toolName !== toolName) {
      return { written: false, reason: 'another-call' }
    }
    const record = permitResultRecord(pending, {
      at: now(),
      response: payload?.tool_response ?? payload?.toolResponse,
    })
    appendRecord(recordPath, record)
    rmSync(pendingPath, { force: true })
    return { written: true, reason: null, record }
  }, { lockPath, now })
}
