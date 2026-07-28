// THE SPAWN ENVIRONMENT — the witness for point 402 (a), 28.07.2026.
//
// Four batch sessions died in one afternoon and none of them crashed. The
// executioner named itself four times in .claude/autostart-run.log:
//
//     Background tasks still running after 600s; terminating.
//     Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.
//
// The launcher passed no `env` at all, so every headless worker inherited a
// ten-minute ceiling on its background tasks — while the batch's designed steady
// state is to delegate a point to a worktree-isolated agent and wait for it, and
// such an agent routinely takes longer than that. This file pins the fix at the
// only level it can be pinned: the launcher itself may never be imported (it
// spawns a session at module load), so the spawn arguments and options are built
// purely and asserted here.
import { describe, it, expect } from 'vitest'
import {
  buildSpawnArgs,
  buildSpawnOptions,
  RESUME_PROMPT,
  SPAWN_MODEL,
  SPAWN_FALLBACK_MODEL,
  BG_WAIT_CEILING_ENV,
  BG_WAIT_CEILING_OVERRIDE_ENV,
  BG_WAIT_CEILING_DEFAULT,
} from './batch-autostart-core.mjs'

describe('buildSpawnOptions — the ten-minute execution is switched off', () => {
  it('THE FIX: the child carries the background-wait ceiling as 0 (wait indefinitely)', () => {
    const opts = buildSpawnOptions({ cwd: '/repo', stdio: ['ignore', 1, 1], env: { PATH: '/bin' } })
    expect(opts.env[BG_WAIT_CEILING_ENV]).toBe('0')
    expect(BG_WAIT_CEILING_DEFAULT).toBe('0')
  })

  it('the rest of the environment is passed through, not replaced', () => {
    const opts = buildSpawnOptions({ cwd: '/repo', stdio: 'ignore', env: { PATH: '/bin', HOME: '/h' } })
    expect(opts.env.PATH).toBe('/bin')
    expect(opts.env.HOME).toBe('/h')
  })

  it('an INHERITED ceiling from some other context cannot silently re-arm the kill', () => {
    // The runtime's own variable is overwritten, deliberately: only the launcher's
    // own override may put a ceiling back, so a stray value in the scheduled
    // task's environment can never restore the failure.
    const opts = buildSpawnOptions({ env: { [BG_WAIT_CEILING_ENV]: '600000' } })
    expect(opts.env[BG_WAIT_CEILING_ENV]).toBe('0')
  })

  it('the launcher-scoped override does put a ceiling back', () => {
    const opts = buildSpawnOptions({ env: { [BG_WAIT_CEILING_OVERRIDE_ENV]: '900000' } })
    expect(opts.env[BG_WAIT_CEILING_ENV]).toBe('900000')
  })

  it('an empty or blank override is not a value — the default stands', () => {
    for (const raw of ['', '   ']) {
      expect(buildSpawnOptions({ env: { [BG_WAIT_CEILING_OVERRIDE_ENV]: raw } }).env[BG_WAIT_CEILING_ENV]).toBe('0')
    }
  })

  it('keeps the launch shape the singleton depends on (detached, hidden, given cwd/stdio)', () => {
    const stdio = ['ignore', 7, 7]
    const opts = buildSpawnOptions({ cwd: '/repo', stdio, env: {} })
    expect(opts).toMatchObject({ cwd: '/repo', detached: true, stdio, windowsHide: true })
  })
})

describe('buildSpawnArgs — print mode, the model chain, and no prompt that can block', () => {
  it('spawns print mode with the resume prompt and the permission flag', () => {
    const args = buildSpawnArgs()
    expect(args[0]).toBe('-p')
    expect(args[1]).toBe(RESUME_PROMPT)
    expect(args).toContain('--dangerously-skip-permissions')
  })

  it('carries the model policy: Opus 5 as the worker, Fable 5 as the first fallback', () => {
    const args = buildSpawnArgs()
    expect(args[args.indexOf('--model') + 1]).toBe(SPAWN_MODEL)
    expect(args[args.indexOf('--fallback-model') + 1]).toBe(SPAWN_FALLBACK_MODEL)
    expect(SPAWN_MODEL).toMatch(/opus-5/)
    expect(SPAWN_FALLBACK_MODEL).toMatch(/fable-5/)
  })
})

describe('the resume prompt', () => {
  it('tells the session that a WAIT MUST BE VISIBLE — poll, never sit silent (point 402 (b))', () => {
    // A silent wait is what made a working session indistinguishable from a
    // corpse: every poll is a tool call and every tool call refreshes the
    // heartbeat, which is what the launcher reads liveness from.
    expect(RESUME_PROMPT).toMatch(/POLLE/)
    expect(RESUME_PROMPT).toMatch(/batch-in-flight\.mjs --waiting-on/)
  })

  it('still carries the point boundary and the stand-down instruction', () => {
    expect(RESUME_PROMPT).toMatch(/batch-boundary\.mjs/)
    expect(RESUME_PROMPT).toMatch(/STAND DOWN/)
  })
})
