// THE GUARD CHAIN, PROVEN BY RUNNING IT (H3, point 365 D).
//
// WHY this exists rather than a source review: the preflight refactor put every
// guard's Stop-hook body behind `isMainModule(import.meta.url)`, so that one
// helper now decides whether the WHOLE Stop chain still fires. If it ever returns
// false for a spawned hook, every guard goes quiet — no error, no block, nothing
// to notice. Reading the code cannot prove a spawned process behaves; only
// spawning it can.
//
// Each guard is started the way the harness starts it — `node
// scripts/<guard>.mjs` with the hook's JSON on stdin — against an ISOLATED temp
// repo (a copy of scripts/ plus a small file skeleton, so every guard's REPO_ROOT
// is the temp dir and this suite can never touch the real one), in a state that
// must BLOCK and a state that must be CLEAN.
//
// The expected verdict is never hard-coded here: it comes from
// `guard-preflight.mjs --json`, run in the same temp repo. So each case asserts
// two things at once — the hook still fires, and the preflight predicts what it
// does, which is the preflight's entire promise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
const SESSION = 'hook-test-session'
let repo

const node = (args, opts = {}) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', cwd: repo, maxBuffer: 64 * 1024 * 1024, ...opts })

/** `node <repo>/scripts/<name>` with a Stop-hook payload on stdin. */
function runHook(name, { args = [], session = SESSION } = {}) {
  const r = node([resolve(repo, 'scripts', name), ...args], {
    input: JSON.stringify({ session_id: session, hook_event_name: 'Stop' }),
  })
  let decision = null
  try {
    decision = r.stdout.trim() ? JSON.parse(r.stdout.trim()) : null
  } catch {
    /* not a decision payload — the assertions report the raw stdout instead */
  }
  return { ...r, decision }
}

/** What the preflight says every guard WOULD do, right now, in the temp repo. */
function preflight() {
  const r = node([resolve(repo, 'scripts', 'guard-preflight.mjs'), '--json', '--session', SESSION])
  expect(r.status, `preflight failed: ${r.stderr}`).toBe(0)
  const parsed = JSON.parse(r.stdout)
  return Object.fromEntries(parsed.results.map((x) => [x.id, x]))
}

const write = (rel, text) => {
  const full = resolve(repo, rel)
  mkdirSync(resolve(full, '..'), { recursive: true })
  writeFileSync(full, text)
}

const git = (...args) =>
  spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    encoding: 'utf8',
  })

const commit = (message) => {
  git('add', '-A')
  git('-c', 'user.email=g@test.local', '-c', 'user.name=guard hooks test', 'commit', '-q', '-m', message)
}

/**
 * One guard, one arranged state: the hook must fire, and it must land where the
 * preflight said it would — same decision, same refusal text, exit 0 either way
 * (a Stop hook signals through stdout, never through its exit code).
 */
function expectHookAgrees(name, id, { blocks }) {
  const predicted = preflight()[id]
  expect(predicted, `${id} is not registered with the preflight`).toBeTruthy()
  expect(predicted.status, `${id}: the fixture must make the core ${blocks ? 'block' : 'allow'}`).toBe(
    blocks ? 'would-block' : 'clean',
  )
  const hook = runHook(name)
  expect(hook.status, `${name} exited ${hook.status}: ${hook.stderr}`).toBe(0)
  if (!blocks) {
    expect(hook.stdout.trim(), `${name}: a clean hook must print nothing`).toBe('')
    return hook
  }
  expect(hook.decision, `${name} printed ${JSON.stringify(hook.stdout)} instead of a block`).toBeTruthy()
  expect(hook.decision.decision).toBe('block')
  return hook
}

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-guard-hooks-'))
  // Only the top-level scripts: every guard and every core it imports lives
  // there, and copying scripts/verify/ would pull in the browser suites.
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), {
    recursive: true,
    filter: (src) => !/[\\/](verify|git-hooks)([\\/]|$)/.test(src),
  })
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
  write('design.md', '# Design\n\n## 1. Thing\nText.\n')
  write('CLAUDE.md', '# CLAUDE\n\n## 1. Goal\nText.\n')
  write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 1. A clean open point.\n')
  write('docs/tasks-archive.md', '# Archive\n')
  git('init', '-q')
  git('config', 'user.email', 'g@test.local')
  git('config', 'user.name', 'guard hooks test')
  commit('baseline')
})

afterAll(() => {
  try {
    rmSync(repo, { recursive: true, force: true })
  } catch {
    /* a Windows file lock on a temp dir must not fail the suite */
  }
})

describe('the harness itself', () => {
  it('runs against an isolated temp repo, never the real one', () => {
    expect(repo.startsWith(tmpdir())).toBe(true)
    expect(resolve(repo)).not.toBe(resolve(process.cwd()))
  })

  it('has every registered guard reachable as a spawnable hook', () => {
    for (const id of Object.keys(preflight())) {
      const r = runHook(`${id}.mjs`)
      expect(r.status, `${id}.mjs is not spawnable: ${r.stderr}`).toBe(0)
    }
  })

  it('spawns every Stop hook that depends on isMainModule — read from settings.json', () => {
    // The loop above iterates the PREFLIGHT registry, which is a different list
    // from the authoritative Stop chain in .claude/settings.json. A guard added
    // to the chain, put behind isMainModule and NOT registered with the preflight
    // would go untested here — and isMainModule is precisely the helper that can
    // silence a whole hook without an error. So the chain itself is the source.
    const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8'))
    const chain = (settings.hooks?.Stop ?? [])
      .flatMap((entry) => entry.hooks ?? [])
      .map((h) => /scripts[\\/]([\w.-]+\.mjs)/.exec(h.command ?? '')?.[1])
      .filter(Boolean)
    expect(chain.length, 'no Stop hooks found in .claude/settings.json').toBeGreaterThan(5)

    const covered = new Set(Object.keys(preflight()).map((id) => `${id}.mjs`))
    const uncovered = chain.filter((name) => {
      if (covered.has(name)) return false
      let source
      try {
        source = readFileSync(resolve(SOURCE_SCRIPTS, name), 'utf8')
      } catch {
        return false // not a script in scripts/ — nothing this suite could spawn
      }
      return source.includes('isMainModule')
    })
    expect(
      uncovered,
      'these Stop hooks gate their body on isMainModule but are spawned by no case above — ' +
        'register them with guard-preflight.mjs, or add an explicit spawn test',
    ).toEqual([])
  })
})

describe('tasks-spec-guard', () => {
  it('BLOCKS on a revision trail — and prints the core’s own wording', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. This point was originally specified differently.\n')
    const hook = expectHookAgrees('tasks-spec-guard.mjs', 'tasks-spec-guard', { blocks: true })
    expect(hook.decision.reason).toContain(preflight()['tasks-spec-guard'].reason)
    expect(hook.decision.reason).toMatch(/ITERATIVE PATCH TRAIL/)
  })

  it('ALLOWS a clean work order', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. A point stating only its final target state.\n')
    expectHookAgrees('tasks-spec-guard.mjs', 'tasks-spec-guard', { blocks: false })
  })

  it('stands down silently while the batch is paused', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. This point was originally specified differently.\n')
    write('.claude/batch-paused', 'test')
    try {
      expect(preflight()['tasks-spec-guard'].status).toBe('not-applicable')
      const hook = runHook('tasks-spec-guard.mjs')
      expect(hook.status).toBe(0)
      expect(hook.stdout.trim()).toBe('')
    } finally {
      rmSync(resolve(repo, '.claude/batch-paused'))
      write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. A point stating only its final target state.\n')
    }
  })
})

describe('tasks-archive-guard', () => {
  it('BLOCKS on a ticked point left in TASKS.md', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [x] 1. Finished but never moved to the archive.\n- [ ] 2. Open.\n')
    write('docs/tasks-archive.md', '# Archive\n')
    const hook = expectHookAgrees('tasks-archive-guard.mjs', 'tasks-archive-guard', { blocks: true })
    expect(hook.decision.reason).toBe(preflight()['tasks-archive-guard'].reason)
  })

  it('ALLOWS the split done right', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. Still open.\n')
    write('docs/tasks-archive.md', '# Archive\n\n- [x] 1. Finished, and filed here.\n')
    expectHookAgrees('tasks-archive-guard.mjs', 'tasks-archive-guard', { blocks: false })
  })
})

describe('doc-budget-guard', () => {
  it('BLOCKS on a document over its measured ceiling', () => {
    write('CLAUDE.md', `# CLAUDE\n${'a line of the always-loaded document\n'.repeat(2000)}`)
    const hook = expectHookAgrees('doc-budget-guard.mjs', 'doc-budget-guard', { blocks: true })
    expect(hook.decision.reason).toBe(preflight()['doc-budget-guard'].reason)
  })

  it('ALLOWS documents within budget', () => {
    write('CLAUDE.md', '# CLAUDE\n\n## 1. Goal\nText.\n')
    expectHookAgrees('doc-budget-guard.mjs', 'doc-budget-guard', { blocks: false })
  })
})

describe('queue-order-guard', () => {
  const board = (cardText) =>
    [
      '<html><body>',
      '<h2>Woran ich gerade arbeite</h2><div><span class="t">2</span> working</div>',
      '<h2>Warteschlange</h2>',
      `<details><summary><span class="num">2</span></summary><p>${cardText}</p></details>`,
      '</body></html>',
    ].join('\n')

  it('BLOCKS when a queue card claims done what TASKS.md still has open', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. Still open work.\n')
    write('.batch-dashboard.html', board('Das Problem ist behoben.'))
    const hook = expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: true })
    expect(hook.decision.reason).toBe(preflight()['queue-order-guard'].reason)
    expect(hook.decision.reason).toMatch(/CLAIMS DONE WHAT IS OPEN/)
  })

  it('ALLOWS a board that matches the work order', () => {
    write('.batch-dashboard.html', board('Noch offen, wird als naechstes angegangen.'))
    expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: false })
  })

  it('stands down, rather than blocking, on a checkout without TASKS.md (F7)', () => {
    rmSync(resolve(repo, 'TASKS.md'))
    try {
      expect(preflight()['queue-order-guard'].status).toBe('not-applicable')
      const hook = runHook('queue-order-guard.mjs')
      expect(hook.status).toBe(0)
      expect(hook.stdout.trim()).toBe('')
    } finally {
      write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. Still open work.\n')
    }
  })
})

describe('dashboard-guard', () => {
  it('BLOCKS while no dashboard is registered', () => {
    const hook = expectHookAgrees('dashboard-guard.mjs', 'dashboard-guard', { blocks: true })
    expect(hook.decision.reason).toBe(preflight()['dashboard-guard'].reason)
  })

  it('stands down silently while the batch is paused', () => {
    write('.claude/batch-paused', 'test')
    try {
      const hook = runHook('dashboard-guard.mjs')
      expect(hook.status, hook.stderr).toBe(0)
      expect(hook.stdout.trim()).toBe('')
    } finally {
      rmSync(resolve(repo, '.claude/batch-paused'))
    }
  })
})

describe('model-guard', () => {
  const commitAs = (model, message) => {
    write('marker.txt', `${model} ${Date.now()}`)
    commit(`${message}\n\nCo-Authored-By: ${model} <noreply@anthropic.com>`)
  }

  it('BLOCKS on a commit authored outside the model allowlist', () => {
    // The baseline must predate the commit, or the tripwire looks straight past it.
    write('.claude/model-guard-baseline.json', JSON.stringify({ since: new Date(Date.now() - 3600_000).toISOString() }))
    commitAs('Claude Haiku 4.5', 'a change from a degraded session')
    const sha = git('rev-parse', 'HEAD').stdout.trim().slice(0, 7)

    expect(preflight()['model-guard'].status).toBe('would-block')
    const hook = runHook('model-guard.mjs')
    expect(hook.status, hook.stderr).toBe(0)
    expect(hook.decision, `stdout was ${JSON.stringify(hook.stdout)}`).toBeTruthy()
    expect(hook.decision.decision).toBe('block')
    expect(hook.decision.reason).toMatch(/SERVING-MODEL TRIPWIRE/)
    expect(hook.decision.reason).toContain(sha)
  })

  it('ALLOWS a commit from an allowlisted model', () => {
    write('.claude/model-guard-baseline.json', JSON.stringify({ since: new Date().toISOString() }))
    commitAs('Claude Opus 5', 'a change from an allowed model')
    expectHookAgrees('model-guard.mjs', 'model-guard', { blocks: false })
  })

  it('still answers --status, which is how the guard is driven by hand', () => {
    const r = runHook('model-guard.mjs', { args: ['--status'] })
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout)).toHaveProperty('baseline')
  })
})

describe('render-verify-guard', () => {
  const stateAt = (baseline) => {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()
    write('.claude/render-verify-state.json', JSON.stringify({ clearedHeads: { [branch]: baseline }, runs: [] }))
  }

  it('BLOCKS on a committed render change with no covering run', () => {
    const base = git('rev-parse', 'HEAD').stdout.trim()
    write('src/render/water.ts', '// a render-path change\n')
    commit('render change')
    stateAt(base)

    const predicted = preflight()['render-verify-guard']
    expect(predicted.status).toBe('would-block')
    expect(predicted.reason).toMatch(/src\/render\/water\.ts/)
    const hook = runHook('render-verify-guard.mjs')
    expect(hook.status, hook.stderr).toBe(0)
    expect(hook.decision, `stdout was ${JSON.stringify(hook.stdout)}`).toBeTruthy()
    expect(hook.decision.decision).toBe('block')
    expect(hook.decision.reason).toBe(predicted.reason)
  })

  it('ALLOWS once the baseline sits at HEAD, and reports the gate clear', () => {
    stateAt(git('rev-parse', 'HEAD').stdout.trim())
    const hook = runHook('render-verify-guard.mjs')
    expect(hook.status, hook.stderr).toBe(0)
    expect(hook.stdout.trim()).toBe('')

    const status = runHook('render-verify-guard.mjs', { args: ['status'] })
    expect(status.status).toBe(0)
    expect(status.stdout).toMatch(/pending render paths: \(none\)/)
  })

  it('does NOT clear a pending gate when the gathering fails for another reason (F1)', () => {
    // The regression this pins: the refactor re-baselined on ANY gather failure,
    // so one transient git error permanently cleared an unverified render gate.
    // Here git cannot answer at all — no repository — and the state file must
    // come back byte-identical while the stop is still allowed.
    const broken = mkdtempSync(resolve(tmpdir(), 'hoa-guard-nogit-'))
    try {
      cpSync(resolve(repo, 'scripts'), resolve(broken, 'scripts'), { recursive: true })
      mkdirSync(resolve(broken, '.claude'), { recursive: true })
      const before = JSON.stringify({ clearedHeads: { main: 'deadbeef', master: 'deadbeef' }, runs: [] })
      const statePath = resolve(broken, '.claude/render-verify-state.json')
      writeFileSync(statePath, before)

      const r = spawnSync(process.execPath, [resolve(broken, 'scripts', 'render-verify-guard.mjs')], {
        input: JSON.stringify({ session_id: SESSION, hook_event_name: 'Stop' }),
        encoding: 'utf8',
        cwd: broken,
        env: { ...process.env, GIT_CEILING_DIRECTORIES: broken },
      })
      expect(r.status, 'a guard error must still allow the stop').toBe(0)
      expect(r.stdout.trim()).toBe('')
      expect(readFileSync(statePath, 'utf8')).toBe(before)
    } finally {
      try {
        rmSync(broken, { recursive: true, force: true })
      } catch {
        /* Windows lock on a temp dir */
      }
    }
  })
})

describe('the CLI half of the tooling, spawned', () => {
  const filler = (n) => `${'  a filler line of specification prose.\n'.repeat(n)}`

  beforeAll(() => {
    write(
      'TASKS.md',
      [
        '# TASKS',
        '',
        '## Checklist',
        '',
        `- [ ] 3. A big but affordable point.\n${filler(1800)}`,
        `- [ ] 4. A point that has outgrown a brief.\n${filler(5000)}`,
      ].join('\n'),
    )
  })

  it('writes a large brief COMPLETE to a pipe, and exits 0', () => {
    // process.exit() straight after a big stdout write discards whatever of an
    // asynchronous write is still queued (pipes are async on macOS), and a brief
    // that stops mid-sentence reads complete to whoever got it.
    const r = node([resolve(repo, 'scripts', 'point-brief.mjs'), '3'])
    expect(r.status, r.stderr).toBe(0)
    expect((r.stdout.match(/a filler line of specification prose\./g) ?? []).length).toBe(1800)
    expect(r.stdout).toMatch(/re-run: node scripts\/point-brief\.mjs 3\s*$/)
  })

  it('FAILS, rather than warns, when a brief outgrows its ceiling', () => {
    const r = node([resolve(repo, 'scripts', 'point-brief.mjs'), '4'])
    expect(r.stderr).toMatch(/OVER THE CEILING/)
    expect(r.status).toBe(2)
    // Still complete: the failure is a budget verdict, not a truncation.
    expect((r.stdout.match(/a filler line of specification prose\./g) ?? []).length).toBe(5000)
  })

  it('stamps the brief with the revision it was cut from', () => {
    // A brief is pasted into prompts and files and outlives its source. HEAD
    // alone would lie here: the work order below is written on top of the last
    // commit, exactly as TASKS.md normally is on main.
    const r = node([resolve(repo, 'scripts', 'point-brief.mjs'), '3'])
    const head = git('rev-parse', '--short', 'HEAD').stdout.trim()
    const line = r.stdout.split('\n').find((l) => l.startsWith('SOURCE REVISION:'))
    expect(line, 'the brief carries no revision stamp').toBeTruthy()
    expect(line).toContain(`HEAD ${head} +dirty`)
    expect(line).toMatch(/work-order [0-9a-f]{12}/)
  })

  it('exits 1 on a point number that does not exist', () => {
    const r = node([resolve(repo, 'scripts', 'point-brief.mjs'), '9999'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/no work-order point 9999/)
  })
})
