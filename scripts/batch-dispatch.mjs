#!/usr/bin/env node
// Thin dispatcher: read the main-session-authorized queue, decide from daemon
// state, and submit only the already-authorized start-attempt mutations.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { controlRequest } from './batch-daemon.mjs'
import { openStateStore } from './batch-state.mjs'
import { dispatchDecision } from './batch-dispatch-core.mjs'

export function readAuthorizedQueue(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return { ok: true, queue: Array.isArray(parsed) ? parsed : parsed?.queue }
  } catch (error) {
    return { ok: false, reason: `the authorized queue could not be read: ${error.message}` }
  }
}

export async function dispatchOnce({ repoDir, batchId, sessionId, fence, queuePath = null, adapters = ['sol'] } = {}) {
  if (!sessionId || !Number.isInteger(fence)) return { ok: false, reason: 'dispatch is fenced: sessionId and integer fence are required' }
  const store = openStateStore({ repoDir, batchId })
  const authorized = readAuthorizedQueue(queuePath ?? join(store.dir, 'queue.json'))
  if (!authorized.ok) return authorized
  const status = await controlRequest({ repoDir, batchId, request: { cmd: 'status' }, timeoutMs: 3000 })
  if (!status.ok) return { ok: false, reason: `daemon status failed: ${status.reason}` }
  const decision = dispatchDecision({ queue: authorized.queue, attempts: status.result?.attempts ?? status.attempts ?? [], adapters })
  if (!decision.ok) return decision
  const started = []
  for (const entry of decision.selected) {
    const reply = await controlRequest({
      repoDir,
      batchId,
      request: {
        cmd: 'start-attempt',
        sessionId,
        fence,
        payload: {
          batchId,
          pointId: entry.pointId,
          attemptId: entry.attemptId,
          branch: entry.branch,
          worktree: entry.worktree,
          adapter: entry.adapter,
          baseSha: entry.baseSha,
        },
      },
    })
    started.push({ pointId: entry.pointId, attemptId: entry.attemptId, reply })
    if (!reply.ok) break
  }
  return { ok: started.every((item) => item.reply.ok), decision, started }
}

function argsOf(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i]
  return out
}

if (isMainModule(import.meta.url)) {
  const args = argsOf(process.argv.slice(2))
  const result = await dispatchOnce({
    repoDir: resolve(args.repo ?? REPO_ROOT), batchId: args.batch, sessionId: args.session,
    fence: Number(args.fence), queuePath: args.queue ? resolve(args.queue) : null,
  })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}
