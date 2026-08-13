// Pins the OpenAI authoring lane's decisions (point 667).
//
// The failure this lane must not have is the mirror of the read-only paths':
// they refuse to record an answer nobody gave, and this one must refuse to
// report work nobody did. So the cases are built around what GIT says, never
// around what the run claimed about itself.
import { describe, expect, it } from 'vitest'
import { evaluateCommitTrailers, ALLOWED_TRAILERS } from './model-guard-core.mjs'
import {
  AUTHOR_TIMEOUT_MS,
  authoringCodexArgs,
  buildAuthoringPrompt,
  childEnv,
  formatAuthoringReport,
  HOUSE_RULES,
  judgeAuthoring,
  parseAuthoringAnswer,
  readinessProblems,
  SOL_MODEL_ID,
  SOL_TRAILER,
  withheldEnvNames,
} from './author-sol-core.mjs'

const solCommit = (sha, subject = 'Do a thing') => ({ sha, subject, trailers: 'GPT-5.6 Sol <noreply@openai.com>' })
const okRun = { ok: true, kind: 'ok', cause: '' }
const answered = parseAuthoringAnswer('DONE: built the thing\nGATES: unit, build and lint green\nOPEN: none\n')

describe('the commit trailer of the lane', () => {
  it('is the allowlist’s own spelling, and passes the commit-msg gate', () => {
    expect(SOL_TRAILER).toBe('Co-Authored-By: GPT-5.6 Sol <noreply@openai.com>')
    expect(ALLOWED_TRAILERS).toContain(SOL_TRAILER)
    expect(evaluateCommitTrailers(`Do a thing\n\n${SOL_TRAILER}\n`).block).toBe(false)
  })
})

describe('authoringCodexArgs', () => {
  it('bypasses the sandbox, because in this container there is none to use', () => {
    // Measured: `codex sandbox read-only -- echo hi` dies in bwrap with "no
    // permissions to create a new namespace". A reviewer works around that by
    // being FED its material; an author that cannot run `git commit` cannot work.
    const args = authoringCodexArgs({ cwd: '/w', outputFile: '/tmp/o', prompt: 'p' })
    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(args).not.toContain('--sandbox')
    expect(args.slice(args.indexOf('-C'), args.indexOf('-C') + 2)).toEqual(['-C', '/w'])
    expect(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2)).toEqual(['-m', SOL_MODEL_ID])
    expect(args).toContain('model_reasoning_effort=high')
    expect(args[args.length - 1]).toBe('p')
  })

  it('gives an authoring run room to build and test', () => {
    expect(AUTHOR_TIMEOUT_MS).toBeGreaterThanOrEqual(30 * 60_000)
  })
})

describe('childEnv — the one enforcement left once the sandbox is off', () => {
  it('withholds anything that reads like a credential, and keeps the rest', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/node',
      CODEX_HOME: '/home/node/.codex',
      GH_TOKEN: 'ghp_x',
      GITHUB_TOKEN: 'ghp_y',
      ANTHROPIC_API_KEY: 'sk-a',
      NPM_TOKEN: 'npm_z',
      MY_SECRET: 's',
      DB_PASSWORD: 'p',
      SOME_PRIVATE_KEY: 'k',
      REPO_PAT: 'p',
      AUTH_HEADER: 'a',
    }
    const kept = childEnv(env)
    expect(kept).toEqual({ PATH: '/usr/bin', HOME: '/home/node', CODEX_HOME: '/home/node/.codex' })
    expect(withheldEnvNames(env)).toEqual([
      'ANTHROPIC_API_KEY',
      'AUTH_HEADER',
      'DB_PASSWORD',
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'MY_SECRET',
      'NPM_TOKEN',
      'REPO_PAT',
      'SOME_PRIVATE_KEY',
    ])
    expect(childEnv()).toEqual({})
    expect(withheldEnvNames()).toEqual([])
  })
})

describe('readinessProblems — where this run may not write', () => {
  const good = { branch: 'feat/651-drum-bed', worktree: '/w/tree', mainCheckout: '/w/main', dirty: '' }

  it('lets an isolated worktree on a feature branch through', () => {
    expect(readinessProblems(good)).toEqual([])
    // A trailing separator is not a different directory.
    expect(readinessProblems({ ...good, worktree: '/w/tree/' })).toEqual([])
  })

  it('refuses main, the main checkout, an unknown branch and a dirty tree', () => {
    expect(readinessProblems({ ...good, branch: 'main' }).join(' ')).toMatch(/own feat\/ branch/)
    expect(readinessProblems({ ...good, branch: 'HEAD' }).join(' ')).toMatch(/own feat\/ branch/)
    expect(readinessProblems({ ...good, branch: '' }).join(' ')).toMatch(/unknown ref/)
    expect(readinessProblems({ ...good, worktree: '/w/main' }).join(' ')).toMatch(/MAIN checkout/)
    expect(readinessProblems({ ...good, worktree: '' }).join(' ')).toMatch(/no worktree path/)
    expect(readinessProblems({ ...good, dirty: ' M src/App.tsx' }).join(' ')).toMatch(/uncommitted changes/)
    expect(readinessProblems()).not.toEqual([])
  })
})

describe('buildAuthoringPrompt', () => {
  it('states every house rule, and hands over the BRIEF rather than a reading list', () => {
    const prompt = buildAuthoringPrompt({ point: 651, brief: 'THE POINT: fix the drum loop', branch: 'feat/651-x' })
    for (const rule of HOUSE_RULES) expect(prompt, rule).toContain(rule.trim())
    // A rule spanning two lines reads as one rule, not as two bullets.
    expect(prompt).not.toMatch(/^ {2}- {3}/m)
    expect(prompt).toContain(SOL_TRAILER)
    expect(prompt).toContain('THE POINT: fix the drum loop')
    expect(prompt).toMatch(/Do NOT read TASKS\.md/)
    expect(prompt).toMatch(/Do NOT push, do NOT merge/)
    expect(prompt).toMatch(/feat\/651-x/)
    // The reviewer is named up front: it changes how the work is written.
    expect(prompt).toMatch(/A Claude session then REVIEWS/)
    expect(prompt).toMatch(/DONE: <what you built/)
  })

  it('says so when there is no brief instead of authoring from nothing', () => {
    expect(buildAuthoringPrompt({ point: 1 })).toMatch(/no brief was attached/)
  })

  it('turns into the SECOND leg when findings are handed back', () => {
    const prompt = buildAuthoringPrompt({ point: 651, findings: 'F1 | a.mjs | the guard fails open', branch: 'b' })
    expect(prompt).toMatch(/THIS IS THE SECOND LEG/)
    expect(prompt).toContain('F1 | a.mjs | the guard fails open')
    expect(prompt).toMatch(/Answer every/)
    // The brief is not repeated: what is under discussion is the review.
    expect(prompt).not.toMatch(/=== THE BRIEF ===/)
  })
})

describe('parseAuthoringAnswer', () => {
  it('reads the three closing lines, tolerating markdown around them', () => {
    expect(answered).toMatchObject({ ok: true, done: 'built the thing', open: 'none' })
    expect(parseAuthoringAnswer('**DONE:** a\n*GATES:* b\n- OPEN: c')).toMatchObject({ ok: true, done: 'a' })
  })

  it('refuses a message that does not carry the shape, or echoes the placeholders', () => {
    expect(parseAuthoringAnswer('I did the work, all good.').ok).toBe(false)
    expect(parseAuthoringAnswer('').ok).toBe(false)
    expect(parseAuthoringAnswer('DONE: <what you built>\nGATES: <the result>\nOPEN: none').ok).toBe(false)
  })
})

describe('judgeAuthoring — what GIT says, not what the run claimed', () => {
  it('accepts a clean run that committed under Sol’s name', () => {
    const j = judgeAuthoring({ outcome: okRun, commits: [solCommit('a'.repeat(40))], parsed: answered })
    expect(j).toMatchObject({ delivered: true, clean: true })
    expect(j.problems).toEqual([])
  })

  it('calls a run that committed NOTHING what it is, however well it reported', () => {
    const j = judgeAuthoring({ outcome: okRun, commits: [], parsed: answered })
    expect(j.delivered).toBe(false)
    expect(j.problems.join(' ')).toMatch(/NOTHING WAS COMMITTED/)
  })

  it('catches a commit that names the wrong author, or none', () => {
    const wrong = judgeAuthoring({
      outcome: okRun,
      commits: [{ sha: 'b'.repeat(40), subject: 'x', trailers: 'Claude Haiku 4.5 <x@y>' }],
      parsed: answered,
    })
    expect(wrong.problems.join(' ')).toMatch(/outside the author allowlist/)
    const bare = judgeAuthoring({
      outcome: okRun,
      commits: [{ sha: 'c'.repeat(40), subject: 'x', trailers: 'Claude <x@y>' }],
      parsed: answered,
    })
    expect(bare.problems.join(' ')).toMatch(/naming no single model/)
    // An ALLOWED model that is not this lane's is still not this lane's commit.
    const other = judgeAuthoring({
      outcome: okRun,
      commits: [{ sha: 'd'.repeat(40), subject: 'x', trailers: 'Claude Opus 5 <x@y>' }],
      parsed: answered,
    })
    expect(other.problems.join(' ')).toMatch(/does not name GPT-5\.6 Sol/)
  })

  it('keeps the work of a run that died, and still names what went wrong', () => {
    // A timeout that committed four steps is worth reviewing; throwing it away
    // because the run ended badly would discard the only thing that survived.
    const j = judgeAuthoring({
      outcome: { ok: false, kind: 'timeout', cause: 'the review did not finish inside its time budget' },
      commits: [solCommit('e'.repeat(40))],
      parsed: { ok: false, error: 'no closing lines' },
      dirty: ' M scripts/x.mjs',
    })
    expect(j.delivered).toBe(true)
    expect(j.clean).toBe(false)
    expect(j.problems.join(' ')).toMatch(/did not finish cleanly/)
    expect(j.problems.join(' ')).toMatch(/UNCOMMITTED changes/)
  })
})

describe('formatAuthoringReport', () => {
  it('hands the rest of the point to the reviewer, in order', () => {
    const judged = judgeAuthoring({ outcome: okRun, commits: [solCommit('f'.repeat(40), 'Fix the loop')], parsed: answered })
    const text = formatAuthoringReport({ point: 651, branch: 'feat/651-x', judged, parsed: answered, pushed: true })
    expect(text).toMatch(/authored 1 commit\(s\) on feat\/651-x/)
    expect(text).toMatch(/ffffff {2}Fix the loop/)
    expect(text).toMatch(/DONE: {2}built the thing/)
    expect(text).toMatch(/MAY NOT REVIEW IT/)
    expect(text).toMatch(/--point 651 --findings/)
    expect(text).toMatch(/mechanism-review\.mjs --record/)
    expect(text).toMatch(/land-point\.mjs 651/)
    expect(text).toMatch(/the branch is pushed/)
  })

  it('says a failed push first, because only that work is at risk', () => {
    const judged = judgeAuthoring({ outcome: okRun, commits: [solCommit('a'.repeat(40))], parsed: answered })
    expect(formatAuthoringReport({ point: 1, judged, parsed: answered, pushed: false })).toMatch(/PUSH FAILED/)
  })

  it('offers no next step where nothing was authored', () => {
    const judged = judgeAuthoring({ outcome: okRun, commits: [], parsed: answered })
    const text = formatAuthoringReport({ point: 1, branch: 'b', judged, parsed: answered })
    expect(text).toMatch(/authored NOTHING/)
    expect(text).not.toMatch(/land-point/)
    expect(text).toMatch(/NOTHING WAS COMMITTED/)
  })
})
