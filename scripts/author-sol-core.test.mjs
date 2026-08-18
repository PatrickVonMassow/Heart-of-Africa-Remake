// Pins the OpenAI authoring lane's decisions (point 667).
//
// The failure this lane must not have is the mirror of the read-only paths':
// they refuse to record an answer nobody gave, and this one must refuse to
// report work nobody did. So the cases are built around what GIT says, never
// around what the run claimed about itself.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateCommitTrailers, ALLOWED_TRAILERS } from './model-guard-core.mjs'
import {
  AUTHOR_TIMEOUT_MS,
  authoringCodexArgs,
  buildAuthoringPrompt,
  childEnv,
  formatAuthoringReport,
  gatesProblem,
  HOUSE_RULES,
  isWithheldEnv,
  judgeAuthoring,
  parseAuthoringAnswer,
  PUSH_INTERVAL_MS,
  readinessProblems,
  SOL_MODEL_ID,
  SOL_TRAILER,
  withheldEnvNames,
} from './author-sol-core.mjs'

const solCommit = (sha, subject = 'Do a thing') => ({ sha, subject, trailers: 'GPT-5.6 Sol <noreply@openai.com>' })
const okRun = { ok: true, kind: 'ok', cause: '' }
const answered = parseAuthoringAnswer('DONE: built the thing\nGATES: test:unit, build and lint all green\nOPEN: none\n')

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

  it('pushes often enough that an hour-long run is not an hour of local-only work', () => {
    // The house rule is a push after every commit; the child cannot be given a
    // credential, so the wrapper pushes on this interval (cross-vendor P2).
    expect(PUSH_INTERVAL_MS).toBeGreaterThan(0)
    expect(PUSH_INTERVAL_MS).toBeLessThanOrEqual(5 * 60_000)
    expect(HOUSE_RULES.join(' ')).toMatch(/pushed FOR you/)
    expect(HOUSE_RULES.join(' ')).toMatch(/Do NOT change branch/)
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
      GIT_ASKPASS: '/x',
      SSH_AUTH_SOCK: '/s',
      AWS_ACCESS_KEY_ID: 'a',
      DATABASE_URL: 'postgres://x',
      CI_JOB_JWT: 'j',
      GIT_AUTHOR_NAME: 'Fixture',
      DB_PASSWORD: 'p',
      SOME_PRIVATE_KEY: 'k',
      REPO_PAT: 'p',
      AUTH_HEADER: 'a',
    }
    const kept = childEnv(env)
    // What survives is what the run NEEDS, plus a git identity, which is not a
    // credential: `GIT_AUTHOR_NAME` must not be swept up by the word "AUTH".
    expect(kept).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/node',
      CODEX_HOME: '/home/node/.codex',
      GIT_AUTHOR_NAME: 'Fixture',
    })
    expect(withheldEnvNames(env)).toEqual([
      'ANTHROPIC_API_KEY',
      'AUTH_HEADER',
      'AWS_ACCESS_KEY_ID',
      'CI_JOB_JWT',
      'DATABASE_URL',
      'DB_PASSWORD',
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'GIT_ASKPASS',
      'MY_SECRET',
      'NPM_TOKEN',
      'REPO_PAT',
      'SOME_PRIVATE_KEY',
      'SSH_AUTH_SOCK',
    ])
    expect(childEnv()).toEqual({})
    expect(withheldEnvNames()).toEqual([])
  })

  it('withholds the credentials the second round named, and the whole GIT_CONFIG family', () => {
    // PGPASSWORD and MYSQL_PWD matched no segment and travelled.
    for (const key of ['PGPASSWORD', 'PGPASSFILE', 'PGSERVICEFILE', 'NETRC', 'KUBECONFIG', 'MYSQL_PWD', 'GITHUB_TOKEN', 'SSH_AUTH_SOCK']) {
      expect(isWithheldEnv(key), key).toBe(true)
    }
    // GIT_CONFIG_KEY_0 matched and GIT_CONFIG_COUNT did not, which leaves git a
    // COUNT with no KEY — a malformed tuple that fails every git command in the
    // run. They go together, or not at all.
    const env = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.x', GIT_CONFIG_VALUE_0: 'y', PATH: '/usr/bin' }
    expect(childEnv(env)).toEqual({ PATH: '/usr/bin' })
    // …and the working directory is not a credential.
    for (const key of ['PWD', 'PATH', 'HOME', 'GIT_AUTHOR_NAME', 'CI']) expect(isWithheldEnv(key), key).toBe(false)
  })

  it('is hygiene, not containment — and the file says so', () => {
    // The cross-vendor review's P0: with the sandbox off, the run can still read
    // a token FILE and push. The regex must not be described as preventing that,
    // and the wrapper is what pushes, so the claim to check is the narrow one.
    const source = readFileSync(resolve('scripts', 'author-sol-core.mjs'), 'utf8')
    expect(source).toMatch(/HYGIENE, NOT CONTAINMENT/)
    expect(source).toMatch(/can read `\.secrets\/`/)
  })
})

describe('readinessProblems — where this run may not write', () => {
  const good = { branch: 'feat/651-drum-bed', worktree: '/w/tree', mainCheckout: '/w/main', dirty: '', point: '651' }

  it('lets an isolated worktree on a feature branch through', () => {
    expect(readinessProblems(good)).toEqual([])
    // A trailing separator is not a different directory.
    expect(readinessProblems({ ...good, worktree: '/w/tree/' })).toEqual([])
  })

  it('refuses every branch that is not THIS point’s feature branch', () => {
    // Naming `main` and `HEAD` let `master`, `release` and `gh-pages` through
    // while the refusal claimed to demand a feat/ branch (third round)…
    for (const branch of ['main', 'HEAD', 'master', 'release', 'gh-pages', 'poc', 'feature/x']) {
      expect(readinessProblems({ ...good, branch }).join(' '), branch).toMatch(/feat\/651-<slug>/)
    }
    // …and a bare `feat/` prefix then let a run for one point commit onto
    // ANOTHER point's branch (fifth round), which lands work under a number that
    // never asked for it.
    for (const branch of ['feat/667-sol-authoring-lane', 'feat/', 'feat/nonsense']) {
      expect(readinessProblems({ ...good, branch }).join(' '), branch).toMatch(/own `feat\/651-<slug>` branch/)
    }
    expect(readinessProblems({ ...good, branch: 'feat/667-sol-authoring-lane', point: '667' })).toEqual([])
    // With no point given it can only demand the shape, which it still does.
    expect(readinessProblems({ ...good, point: '', branch: 'feat/651-drum-bed' })).toEqual([])
    expect(readinessProblems({ ...good, point: '', branch: 'main' }).join(' ')).toMatch(/feat\/<point>-<slug>/)
  })

  it('refuses the main checkout, an unknown branch and a dirty tree', () => {
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

  it('rules the placeholder on the STRIPPED capture — decoration cannot smuggle it', () => {
    expect(
      parseAuthoringAnswer('DONE: **<what you built>**\nGATES: test:unit green\nOPEN: none').ok,
    ).toBe(false)
  })

  it('refuses an OPEN placeholder too — a clean-looking run with an unanswered field (landing round)', () => {
    // The check covered only DONE and GATES: real DONE, green GATES and
    // `OPEN: **<what you left undone>**` parsed clean.
    expect(
      parseAuthoringAnswer('DONE: built\nGATES: test:unit, build and lint all green\nOPEN: <what you left undone>').ok,
    ).toBe(false)
    expect(
      parseAuthoringAnswer('DONE: built\nGATES: test:unit, build and lint all green\nOPEN: **<what you left undone>**').ok,
    ).toBe(false)
    // An UNPAIRED marker survives the pair strip and shielded the anchored
    // test (landing round): the ruling reads the net-only spelling too.
    expect(
      parseAuthoringAnswer('DONE: built\nGATES: test:unit, build and lint all green\nOPEN: _<what you left undone>').ok,
    ).toBe(false)
  })

  it('quotes DONE/GATES/OPEN from the raw lines byte-for-byte', () => {
    // A token the stripper would mangle must reach the caller unrewritten.
    const parsed = parseAuthoringAnswer(
      'prose\n\nDONE: ported src/__init__.py and its __slots__ handling\nGATES: test:unit, build and lint all green\nOPEN: the __all__ export list is still owed',
    )
    expect(parsed).toMatchObject({
      ok: true,
      done: 'ported src/__init__.py and its __slots__ handling',
      gates: 'test:unit, build and lint all green',
      open: 'the __all__ export list is still owed',
    })
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

  it('does not read a "sol" in an e-mail address as Sol’s authorship (cross-vendor P1)', () => {
    // `Claude Opus 5 <build@sol.example>` is an allowlisted commit by ANOTHER
    // model. Tested against the raw trailer, it counted as this lane's work.
    const j = judgeAuthoring({
      outcome: okRun,
      commits: [{ sha: 'a'.repeat(40), subject: 'x', trailers: 'Claude Opus 5 <build@sol.example>' }],
      parsed: answered,
    })
    expect(j.problems.join(' ')).toMatch(/does not name GPT-5\.6 Sol/)
    // …while every real spelling of Sol's own trailer is accepted.
    for (const trailers of ['GPT-5.6 Sol <noreply@openai.com>', 'Sol <noreply@openai.com>', 'gpt-5.6-sol <x@y>']) {
      const ok = judgeAuthoring({ outcome: okRun, commits: [{ sha: 'b'.repeat(40), subject: 'x', trailers }], parsed: answered })
      expect(ok.problems, trailers).toEqual([])
    }
  })

  it('refuses to attribute commits made on another branch (cross-vendor P1)', () => {
    const j = judgeAuthoring({
      outcome: okRun,
      commits: [solCommit('c'.repeat(40))],
      parsed: answered,
      branch: 'feat/667-x',
      branchAfter: 'main',
    })
    expect(j.clean).toBe(false)
    expect(j.problems.join(' ')).toMatch(/ended on `main`, not on `feat\/667-x`/)
    // Ending where it started is silent.
    expect(
      judgeAuthoring({ outcome: okRun, commits: [solCommit('d'.repeat(40))], parsed: answered, branch: 'b', branchAfter: 'b' }).problems,
    ).toEqual([])
  })

  it('refuses to call a run clean when its GATES line is not three green gates', () => {
    // `GATES: not run` parsed perfectly and the command exited 0 — a delivery
    // reported as clean while breaking the prompt's own mandatory rule (2nd
    // round). And a blacklist alone sees a CONFESSION, never an OMISSION: the
    // three gates must each be NAMED (3rd round).
    for (const gates of [
      'not run',
      'unit green, build FAILED, lint green',
      'test:unit, build and lint: lint red',
      'skipped: unit, build, lint',
      'unit green', //                       says nothing about build or lint
      'unit passed; build not executed; lint passed',
      'all good', //                         names none of them
      // …and the absence of a complaint is not a pass (fourth round): this line
      // carries no blacklisted word at all and reports three failures.
      'test:unit, build and lint all exited 1',
      'ran test:unit, build and lint',
      // One green word used to carry the whole line, so two red gates rode in
      // behind one that passed (fifth round).
      'test:unit passed; build exited 1; lint exited 1',
      'test:unit green; build and lint pending',
      '',
    ]) {
      const parsed = parseAuthoringAnswer(`DONE: a thing\nGATES: ${gates || 'x'}\nOPEN: none`)
      const j = judgeAuthoring({ outcome: okRun, commits: [solCommit('a'.repeat(40))], parsed: gates ? parsed : { ok: true, gates: '' } })
      expect(j.clean, gates).toBe(false)
      expect(j.problems.join(' '), gates).toMatch(/GATES line/)
    }
    // A report naming all three as green stays clean — including one that says
    // so with a negative WORD in a positive sentence.
    expect(judgeAuthoring({ outcome: okRun, commits: [solCommit('b'.repeat(40))], parsed: answered }).clean).toBe(true)
    for (const gates of [
      'test:unit, build and lint all passed without errors',
      'vitest green, build green, oxlint clean',
      'unit 10707 passed, build ok, lint zero findings',
      // A numeric none is a none, and "error-free" is a pass (fourth round).
      'test:unit, build and lint passed with 0 errors',
      'test:unit, build and lint were error-free',
      // …and a clause-per-gate report is the normal way to write it.
      'test:unit green; build green; lint clean',
    ]) {
      expect(gatesProblem(gates), gates).toBe('')
    }
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
