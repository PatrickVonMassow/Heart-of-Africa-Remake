// THE CONTEXT FENCE, PROVEN BY RUNNING IT.
//
// The pure decision lives in context-fence-core.test.mjs. This suite spawns the
// real wrapper the way the harness spawns it — `node
// scripts/context-fence-guard.mjs` with the PreToolUse JSON on stdin — inside an
// isolated temp repo, because a mocked dependency never proves the executed
// path. What only a spawn can show: the stdin contract, the transcript
// measurement through the payload's transcript_path, the owner-only binding,
// the worktree stand-down and the fail-open promises.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { CONTEXT_REFUSAL_TOKENS, CONTEXT_TRIGGER_TOKENS } from './context-watermark-core.mjs'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
const SID = 'context-fence-test'
let repo

const lockPath = () => resolve(repo, '.claude', 'batch-lock.json')
const transcriptPath = () => resolve(repo, 'transcript.jsonl')
const observationsPath = () => resolve(repo, '.claude', 'context-fence-observations.jsonl')
// Point 742's OVERSHOOT SERIES — a different file, written by a different
// mechanism (the boundary), and point 747 recalibrates the ceiling from it. The
// fence must never append to it, so the suite keeps its path here and checks it.
const incidentsPath = () => resolve(repo, '.claude', 'context-incidents.jsonl')
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value))

// Point 758 made OBSERVATION the default mode, so a suite that wants the
// REFUSING fence must ask for it — exactly as a re-arming session would.
const ARMED = { HOA_CONTEXT_FENCE_MODE: 'armed' }

/** The observation records written since the last reset, newest last. */
const observations = () =>
  existsSync(observationsPath())
    ? readFileSync(observationsPath(), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : []

/** One JSONL transcript whose newest usage record reports `tokens` context. */
const writeTranscript = (tokens) =>
  writeFileSync(
    transcriptPath(),
    [
      JSON.stringify({ type: 'user', message: { role: 'user' } }),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        message: { usage: { input_tokens: tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
      }),
    ].join('\n') + '\n',
  )

function callGuard(toolName, toolInput = {}, { guardPath, cwd = repo, sessionId = SID, transcript, env = ARMED } = {}) {
  const r = spawnSync(process.execPath, [guardPath ?? resolve(repo, 'scripts', 'context-fence-guard.mjs')], {
    windowsHide: true,
    cwd,
    encoding: 'utf8',
    // The ambient environment may carry the launcher's own relief overrides
    // (point 758) — neutralised here so the suite measures the code, not the
    // machine it runs on.
    env: {
      ...process.env,
      HOA_CONTEXT_FENCE_MODE: '',
      HOA_CONTEXT_TRIGGER_TOKENS: '',
      HOA_CONTEXT_REFUSAL_TOKENS: '',
      ...env,
    },
    input: JSON.stringify({
      session_id: sessionId,
      hook_event_name: 'PreToolUse',
      transcript_path: transcript ?? transcriptPath(),
      tool_name: toolName,
      tool_input: toolInput,
    }),
  })
  let decision = null
  try {
    decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null
  } catch {
    /* not a decision payload — assertions report raw stdout */
  }
  return { ...r, decision }
}

const denial = (r) => (r.decision ? r.decision.hookSpecificOutput.permissionDecisionReason : '')

/** The `--status` CLI, spawned with a deterministic environment. */
const status = (env = {}) =>
  spawnSync(
    process.execPath,
    [resolve(repo, 'scripts', 'context-fence-guard.mjs'), '--status', '--transcript', transcriptPath()],
    {
      windowsHide: true,
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOA_CONTEXT_FENCE_MODE: '',
        HOA_CONTEXT_TRIGGER_TOKENS: '',
        HOA_CONTEXT_REFUSAL_TOKENS: '',
        ...env,
      },
    },
  )

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-context-fence-'))
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), {
    recursive: true,
    filter: (src) => !/[\\/](verify|git-hooks)([\\/]|$)/.test(src),
  })
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
})

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

beforeEach(() => {
  writeJson(lockPath(), { v: 2, sessionId: SID, claimedAt: Date.now(), pid: process.pid })
  writeTranscript(434_440) // past both marks
  rmSync(observationsPath(), { force: true })
})

// Every case in this block runs the fence ARMED (see `callGuard`'s default):
// it pins "armed, it refuses exactly as before". The DEFAULT — observation —
// has its own block below.
describe('context-fence-guard, ARMED (spawned)', () => {
  it('denies a starting call for the owner past the mark, with the measurement in the reason', () => {
    const r = callGuard('Agent', { prompt: 'build point 701' })
    expect(r.status, r.stderr).toBe(0)
    const out = r.decision?.hookSpecificOutput
    expect(out, `printed ${JSON.stringify(r.stdout)}`).toBeTruthy()
    expect(out.hookEventName).toBe('PreToolUse')
    expect(out.permissionDecision).toBe('deny')
    expect(out.permissionDecisionReason).toContain('434440')
    expect(out.permissionDecisionReason).toContain('batch-boundary.mjs --prepare --context')
  })

  it('the deny REPEATS — it is a fence, not a once-per-turn nudge', () => {
    expect(denial(callGuard('Bash', { command: 'npm test' }))).toContain('WATERMARK')
    expect(denial(callGuard('Bash', { command: 'npm test' }))).toContain('WATERMARK')
  })

  it('denies a Task spawn like an Agent spawn — the arming matcher must carry both', () => {
    expect(denial(callGuard('Task', { prompt: 'build point 701' }))).toContain('WATERMARK')
  })

  it('denies a suite start through a SYMLINK to the verify tree — the real resolver is wired (Sol round 4)', () => {
    // The temp-repo copy excludes scripts/verify; give it a real target so
    // realpathSync in the spawned guard resolves through the link.
    const verifyDir = resolve(repo, 'scripts', 'verify')
    const link = resolve(repo, 'verify-link')
    mkdirSync(verifyDir, { recursive: true })
    writeFileSync(resolve(verifyDir, 'world.mjs'), '// stub suite for the symlink pin\n')
    try {
      try {
        symlinkSync(verifyDir, link, 'dir')
      } catch {
        return // a filesystem without symlink rights cannot host this evasion
      }
      expect(denial(callGuard('Bash', { command: 'node verify-link/world.mjs' }))).toContain('WATERMARK')
    } finally {
      rmSync(link, { force: true })
      rmSync(verifyDir, { recursive: true, force: true })
    }
  })

  it('lets every finishing call and read through past the mark', () => {
    for (const [tool, input] of [
      ['Bash', { command: 'git commit -m "finish"' }],
      ['Bash', { command: 'git push origin feat/x' }],
      ['Bash', { command: 'node scripts/batch-boundary.mjs --prepare --context' }],
      ['Bash', { command: 'node scripts/board-publish.mjs' }],
      ['Bash', { command: 'npm run test:unit' }],
      ['Edit', { file_path: 'src/world/world.ts' }],
      ['Read', { file_path: 'TASKS.md' }],
    ]) {
      const r = callGuard(tool, input)
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim(), `${tool} ${JSON.stringify(input)} must be allowed`).toBe('')
    }
  })

  it('allows everything below the REFUSAL mark — which is now lower than the handover one', () => {
    writeTranscript(CONTEXT_REFUSAL_TOKENS - 1)
    expect(callGuard('Agent', {}).stdout.trim()).toBe('')
    expect(callGuard('Bash', { command: 'npm test' }).stdout.trim()).toBe('')
    // …and it is the REFUSAL mark the fence judges against, not the handover
    // one: a reading between the two denies an armed fence (that gap is where
    // point 758 put the daylight between refusing and handing over).
    writeTranscript(CONTEXT_TRIGGER_TOKENS - 1)
    expect(denial(callGuard('Agent', {}))).toContain('WATERMARK')
  })

  it('the REFUSAL mark takes its own env override, independently of the handover one', () => {
    writeTranscript(CONTEXT_REFUSAL_TOKENS + 1)
    expect(denial(callGuard('Agent', {}))).toContain('WATERMARK')
    // Widened past the reading: nothing is refused any more…
    expect(
      callGuard('Agent', {}, { env: { ...ARMED, HOA_CONTEXT_REFUSAL_TOKENS: '400000' } }).stdout.trim(),
    ).toBe('')
  })

  it('THE IMMEDIATE RELIEF reaches the guard: HOA_CONTEXT_TRIGGER_TOKENS set wide stops it refusing', () => {
    // Point 758's stopgap, verified at the guard the launcher actually fences:
    // the one variable set wide must open the window even with the fence armed.
    writeTranscript(CONTEXT_REFUSAL_TOKENS + 1)
    expect(denial(callGuard('Agent', {}))).toContain('WATERMARK')
    expect(
      callGuard('Agent', {}, { env: { ...ARMED, HOA_CONTEXT_TRIGGER_TOKENS: '400000' } }).stdout.trim(),
    ).toBe('')
  })

  it('fails OPEN on an unreadable measurement — a missing transcript denies nothing', () => {
    const r = callGuard('Agent', {}, { transcript: resolve(repo, 'no-such-transcript.jsonl') })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('binds ONLY the batch owner — a foreign or absent lock passes', () => {
    expect(callGuard('Agent', {}, { sessionId: 'some-other-window' }).stdout.trim()).toBe('')
    rmSync(lockPath(), { force: true })
    expect(callGuard('Agent', {}).stdout.trim()).toBe('')
  })

  it('stands down for a paused batch', () => {
    const pause = resolve(repo, '.claude', 'batch-paused')
    writeFileSync(pause, '')
    try {
      expect(callGuard('Agent', {}).stdout.trim()).toBe('')
    } finally {
      rmSync(pause, { force: true })
    }
  })

  it('stands down in a worktree checkout — a delegated agent is never fenced on its parent id', () => {
    const wt = resolve(repo, '.claude', 'worktrees', 'agent-x')
    cpSync(resolve(repo, 'scripts'), resolve(wt, 'scripts'), { recursive: true })
    mkdirSync(resolve(wt, '.claude'), { recursive: true })
    writeJson(resolve(wt, '.claude', 'batch-lock.json'), { v: 2, sessionId: SID, claimedAt: Date.now(), pid: process.pid })
    const r = callGuard('Agent', {}, { guardPath: resolve(wt, 'scripts', 'context-fence-guard.mjs'), cwd: wt })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })

  it('fails OPEN on no stdin and on junk stdin', () => {
    const guard = resolve(repo, 'scripts', 'context-fence-guard.mjs')
    for (const input of ['', 'not json']) {
      const r = spawnSync(process.execPath, [guard], { windowsHide: true, cwd: repo, encoding: 'utf8', input })
      expect(r.status).toBe(0)
      expect(r.stdout.trim()).toBe('')
    }
  })

  it('--status reports the measurement and the starting-call verdict', () => {
    const r = status(ARMED)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('"state": "past"')
    expect(r.stdout).toContain('verdict for a STARTING call')
    expect(r.stdout).toContain('DENY')
    expect(r.stdout).toContain('fence mode: ARMED')
    expect(r.stdout).toContain('"armed": true')
  })
})

// ---------------------------------------------------------------------------
// OBSERVATION MODE — THE DEFAULT (point 758). A disarmed gate is dangerous
// precisely because nobody notices it is disarmed, so what is pinned here is
// both halves: it refuses NOTHING, and it goes on MEASURING and RECORDING.
// ---------------------------------------------------------------------------
describe('context-fence-guard, OBSERVING (spawned) — the default', () => {
  const OBSERVE = { HOA_CONTEXT_FENCE_MODE: 'observe' }

  it('is the mode a guard with NO environment override runs in', () => {
    // The switch is the named constant, not the environment: with nothing set
    // at all, the fence must already be disarmed.
    const r = callGuard('Agent', { prompt: 'build point 757' }, { env: {} })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim(), 'the DEFAULT fence must refuse nothing').toBe('')
    expect(status({}).stdout).toContain('fence mode: OBSERVE')
  })

  it('refuses NOTHING that an armed fence would refuse — the authoring targets included', () => {
    const starting = [
      ['Agent', { prompt: 'build point 757' }],
      ['Task', { prompt: 'build point 757' }],
      ['Bash', { command: 'npm test' }],
      ['Bash', { command: 'node scripts/author-sol.mjs --point 757' }],
      ['Bash', { command: 'node scripts/review-sol.mjs --point 757' }],
      ['Bash', { command: 'node scripts/verify/world.mjs' }],
      // THE FILE SET THAT FORCED THIS POINT: the fence refused writes to every
      // authoring target, which is exactly what the floor-cutting point must
      // edit. Each of these must now go through.
      ['Edit', { file_path: 'TASKS.md' }],
      ['Write', { file_path: 'docs/tasks-archive.md' }],
      ['Edit', { file_path: 'CLAUDE.md' }],
      ['Edit', { file_path: 'design.md' }],
      ['Write', { file_path: 'docs/some-note.md' }],
      ['Bash', { command: 'echo "- [ ] 999. x" >> TASKS.md' }],
    ]
    for (const [tool, input] of starting) {
      // Armed, each of these IS a refusal — that is what makes the pair a proof
      // rather than a claim that the classifier stopped recognising them.
      expect(denial(callGuard(tool, input)), `${tool} ${JSON.stringify(input)} armed`).toContain('WATERMARK')
      const r = callGuard(tool, input, { env: OBSERVE })
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout.trim(), `${tool} ${JSON.stringify(input)} must pass while observing`).toBe('')
    }
  })

  it('STILL MEASURES AND STILL RECORDS — the series does not stop when the fence does', () => {
    rmSync(observationsPath(), { force: true })
    callGuard('Bash', { command: 'node scripts/author-sol.mjs --point 757' }, { env: OBSERVE })
    callGuard('Edit', { file_path: 'TASKS.md' }, { env: OBSERVE })
    const recs = observations()
    expect(recs).toHaveLength(2)
    for (const rec of recs) {
      expect(rec.mode).toBe('observe')
      expect(rec.refused).toBe(false)
      // The MEASUREMENT is real — this is the reading point 747 recalibrates
      // from, and it must not become a placeholder because nothing was refused.
      expect(rec.tokens).toBe(434_440)
      expect(rec.refusalWatermark).toBe(CONTEXT_REFUSAL_TOKENS)
      expect(rec.handoverWatermark).toBe(CONTEXT_TRIGGER_TOKENS)
      expect(rec.handoverState).toBe('past')
      expect(rec.sessionId).toBe(SID)
      expect(typeof rec.at).toBe('string')
      expect(rec.what).toBeTruthy()
    }
    expect(recs[0].what).toContain('authoring run')
    expect(recs[0].authoring).toBe(false)
    expect(recs[1].what).toContain('work order')
    expect(recs[1].authoring).toBe(true)
  })

  it('records a REFUSAL as refused when armed — the same record, one flag apart', () => {
    rmSync(observationsPath(), { force: true })
    expect(denial(callGuard('Agent', {}))).toContain('WATERMARK')
    const [rec] = observations()
    expect(rec.mode).toBe('armed')
    expect(rec.refused).toBe(true)
    expect(rec.tool).toBe('Agent')
  })

  it('records NOTHING for a finishing call or a reading below the mark', () => {
    rmSync(observationsPath(), { force: true })
    callGuard('Bash', { command: 'git push origin feat/x' }, { env: OBSERVE })
    callGuard('Read', { file_path: 'TASKS.md' }, { env: OBSERVE })
    expect(observations()).toEqual([])
    writeTranscript(CONTEXT_REFUSAL_TOKENS - 1)
    callGuard('Agent', {}, { env: OBSERVE })
    expect(observations()).toEqual([])
  })

  it("LEAVES POINT 742's INCIDENT SERIES UNTOUCHED — the two logs are separate on purpose", () => {
    // The observation log is deliberately NOT the incident series: 747 will
    // recalibrate the ceiling from the boundary's overshoots, and a fence that
    // also appended there would silently poison that reading. Seeded with a
    // record of its own, the file must come out byte-identical — while the
    // observation log demonstrably grew, so this is not a no-op check.
    const seeded = `${JSON.stringify({ at: '2026-08-19T12:00:00.000Z', kind: 'overshoot', tokens: 311_039 })}\n`
    writeFileSync(incidentsPath(), seeded)
    rmSync(observationsPath(), { force: true })
    callGuard('Agent', {}, { env: OBSERVE })
    callGuard('Edit', { file_path: 'TASKS.md' }, { env: OBSERVE })
    callGuard('Agent', {}) // armed, and therefore refusing — the same must hold
    expect(readFileSync(incidentsPath(), 'utf8')).toBe(seeded)
    expect(observations()).toHaveLength(3)
    rmSync(incidentsPath(), { force: true })
    // And it does not CREATE the series either: nothing must appear where the
    // boundary alone writes.
    callGuard('Agent', {}, { env: OBSERVE })
    expect(existsSync(incidentsPath()), 'the fence must not create the incident series').toBe(false)
  })

  it('--status says IN WORDS that the fence is disarmed, and names the handover mark that still binds', () => {
    const r = status(OBSERVE)
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('"mode": "observe"')
    expect(r.stdout).toContain('"armed": false')
    expect(r.stdout).toContain('THE FENCE IS DISARMED')
    expect(r.stdout).toContain('refuses NOTHING')
    // The verdict line must not read like an ordinary allow — the reader has to
    // be able to see that an armed fence WOULD have denied this call.
    expect(r.stdout).toContain('OBSERVED — an armed fence would DENY')
    // The handover threshold stays in force in BOTH modes and says so.
    expect(r.stdout).toContain('HANDOVER stays in force in BOTH modes')
    expect(r.stdout).toContain(String(CONTEXT_TRIGGER_TOKENS))
    expect(r.stdout).toContain('"handoverState": "past"')
  })
})
