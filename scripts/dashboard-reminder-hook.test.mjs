import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const HOOK = resolve(process.cwd(), 'scripts', 'dashboard-reminder-hook.mjs')
const roots = []

afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true })
})

function fixture(tokens = 150_001) {
  const root = mkdtempSync(resolve(tmpdir(), 'hoa-dashboard-reminder-hook-'))
  roots.push(root)
  mkdirSync(resolve(root, '.claude'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: root, windowsHide: true })
  const transcript = resolve(root, 'transcript.jsonl')
  writeFileSync(transcript, `${JSON.stringify({
    timestamp: '2026-08-19T16:26:03.002Z',
    message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  })}\n`)
  return { root, transcript }
}

function callHook({ root, transcript, sessionId }) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, HOA_REPO_ROOT: root, HOA_CONTEXT_FENCE_MODE: 'observe' },
    input: JSON.stringify({
      session_id: sessionId,
      transcript_path: transcript,
      hook_event_name: 'UserPromptSubmit',
    }),
  })
}

describe('the live attended reading hook', () => {
  it('asks once above the ceiling and stays silent about it on the second prompt', () => {
    const f = fixture()
    const first = callHook({ ...f, sessionId: 'attended-a' })
    expect(first.status, first.stderr).toBe(0)
    expect(first.stdout).toContain('[context-ceiling]')
    expect(first.stdout).toContain('`/clear`')
    const second = callHook({ ...f, sessionId: 'attended-a' })
    expect(second.status, second.stderr).toBe(0)
    expect(second.stdout).not.toContain('[context-ceiling]')
  })

  it('does not consume the notice during a merge', () => {
    const f = fixture()
    const mergeHead = resolve(f.root, '.git', 'MERGE_HEAD')
    writeFileSync(mergeHead, '0123456789012345678901234567890123456789\n')
    expect(callHook({ ...f, sessionId: 'attended-merge' }).stdout).not.toContain('[context-ceiling]')
    rmSync(mergeHead)
    expect(callHook({ ...f, sessionId: 'attended-merge' }).stdout).toContain('[context-ceiling]')
  })
})
