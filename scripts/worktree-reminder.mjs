// PreToolUse hook (matcher: Agent): remind the session to use isolated git
// worktrees when it spawns concurrent file-mutating subagents — two parallel
// agents once entangled the ONE shared working tree with uncommitted edits
// (22.07.2026). The decision logic lives in worktree-reminder-core.mjs (pure,
// Vitest-covered); this wrapper only reads the hook stdin, prints the result
// and is fail-OPEN: any internal error → no-op, so a hook bug never blocks a
// spawn. Respects `.claude/batch-paused` like the other guards.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { worktreeReminder } from './worktree-reminder-core.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

try {
  if (existsSync(PAUSE)) {
    process.stdout.write('{}')
    process.exit(0)
  }
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    /* no/non-JSON stdin (manual run) — no-op below */
  }
  const result = worktreeReminder({
    toolName: payload && payload.tool_name,
    toolInput: payload && payload.tool_input,
  })
  process.stdout.write(JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error(`worktree-reminder error (allowing): ${e && e.message}`)
  process.stdout.write('{}')
  process.exit(0)
}
