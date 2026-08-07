#!/usr/bin/env node
// PreToolUse guard: the project works inside a named set of directories, and a
// call that reaches outside it is denied WITH ITS REASON.
//
// Agreed with the user on 29.07.2026. The permission layer's deny-rules cannot
// state the two shapes that matter — `~/Documents` MINUS the project, and the
// worktree agents, whose rules live in the untracked `.claude/settings.local.json`
// and therefore travel with no clone. So the allow-list lives in the repository:
// scripts/path-scope-core.mjs (pure, Vitest-covered against the real command
// corpus of the transcripts).
//
// This wrapper only reads the hook payload and is fail-OPEN: no stdin, garbled
// JSON, an unjudgeable tool, any throw at all → allow. It also STANDS DOWN for a
// paused batch and for a session that does not own the batch lock, like every
// guard in this chain.
//
// Manual check (and the four-eyes review's way in):
//   node scripts/path-scope-guard.mjs --check 'ls ~/Downloads'
//   node scripts/path-scope-guard.mjs --check-path 'C:\Users\Patri\Documents\notes.txt'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { evaluate, DEFAULT_CONTEXT } from './path-scope-core.mjs'
import { parseSegments } from './command-classify-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { repoPath } from './repo-paths.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/** Tools whose payload carries a shell command. */
export const COMMAND_TOOLS = new Set(['Bash', 'PowerShell'])

/** Tools whose payload carries a first-class filesystem path. */
export const PATH_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])

/** The real machine's context: its homes and its top-level directories. */
export function machineContext() {
  const home = String(homedir() || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const homes = [...new Set([...DEFAULT_CONTEXT.homes, home.toLowerCase()].filter(Boolean))]
  const cache = new Map()
  const dirExists = (p) => {
    if (cache.has(p)) return cache.get(p)
    let ok = false
    try {
      ok = existsSync(p) && statSync(p).isDirectory()
    } catch {
      ok = false
    }
    cache.set(p, ok)
    return ok
  }
  return { ...DEFAULT_CONTEXT, homes, dirExists }
}

/** The judgeable part of a PreToolUse payload, or null when there is nothing to judge. */
export function subjectFrom(payload) {
  if (!payload || typeof payload !== 'object') return null
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {}
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : ''
  if (COMMAND_TOOLS.has(payload.tool_name)) {
    return typeof input.command === 'string' && input.command ? { command: input.command, cwd } : null
  }
  if (PATH_TOOLS.has(payload.tool_name)) {
    const p = [input.file_path, input.path, input.notebook_path].find((v) => typeof v === 'string' && v)
    return p ? { filePath: p, cwd } : null
  }
  return null
}

/** The guard's stand-down question, shared with the preflight. */
export function gatherPathScope({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  return { applicable: true, inputs: { ctx: machineContext() } }
}

if (isMainModule(import.meta.url)) {
  try {
    const argv = process.argv
    const checkAt = argv.indexOf('--check')
    const checkPathAt = argv.indexOf('--check-path')
    if (checkAt >= 0 || checkPathAt >= 0) {
      const verdict = evaluate({
        command: checkAt >= 0 ? (argv[checkAt + 1] ?? '') : '',
        filePath: checkPathAt >= 0 ? (argv[checkPathAt + 1] ?? '') : '',
        cwd: process.cwd(),
        ctx: machineContext(),
        parseSegments,
      })
      console.log(verdict.block ? `WOULD DENY (${verdict.id}):\n\n${verdict.reason}` : 'path-scope-guard: OK')
      process.exit(0)
    }

    let payload = null
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      process.exit(0) // no/garbled stdin (manual run) — nothing to judge
    }

    const subject = subjectFrom(payload)
    if (!subject) process.exit(0)

    const gathered = gatherPathScope({ sessionId: payload.session_id || '' })
    if (!gathered.applicable) process.exit(0)

    const verdict = evaluate({ ...subject, ctx: gathered.inputs.ctx, parseSegments })
    if (verdict.block) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: verdict.reason,
          },
        }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`path-scope-guard error (allowing the call): ${e && e.message}`)
    process.exit(0)
  }
}
