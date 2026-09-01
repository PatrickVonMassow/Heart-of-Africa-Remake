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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AUTO_END, AUTO_START } from './retro-core.mjs'
import { DOC_BUDGETS } from './doc-budget-core.mjs'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
const SESSION = 'hook-test-session'
let repo

const node = (args, opts = {}) =>
  spawnSync(process.execPath, args, { windowsHide: true, encoding: 'utf8', cwd: repo, maxBuffer: 64 * 1024 * 1024, ...opts })

/** `node <repo>/scripts/<name>` with a Stop-hook payload on stdin. */
function runHook(name, { args = [], session = SESSION, env } = {}) {
  const r = node([resolve(repo, 'scripts', name), ...args], {
    input: JSON.stringify({ session_id: session, hook_event_name: 'Stop' }),
    ...(env ? { env: { ...process.env, ...env } } : {}),
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
    windowsHide: true,
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
  // Deliberately point the fixture config at this checkout's real hooks. The
  // git helper's command-local override must still keep every fixture commit
  // from executing them.
  git('config', 'core.hooksPath', resolve(SOURCE_SCRIPTS, 'git-hooks'))
  commit('baseline')
  // Every real reader fails loud when this shared decision is absent. Keep the
  // guard fixture explicit too, so its model-trailer cases reach the rule they test.
  write(
    '.claude/fable-switch.json',
    JSON.stringify({ state: 'on', reason: 'exercise the full fixture allowlist', setBy: 'test', changedAt: 1 }),
  )
})

afterAll(() => {
  try {
    rmSync(repo, { recursive: true, force: true })
  } catch {
    /* a Windows file lock on a temp dir must not fail the suite */
  }
})

// Spawns EVERY registered guard plus the preflight, so it is the heaviest case
// in the file and the first to hit the 5 s default when the machine is also
// running a browser suite — which is the normal state here. A timeout under load
// is a load verdict, not a defect.
describe('the harness itself', { timeout: 60_000 }, () => {
  it('runs against an isolated temp repo, never the real one', () => {
    expect(repo.startsWith(tmpdir())).toBe(true)
    expect(resolve(repo)).not.toBe(resolve(process.cwd()))
    expect(git('rev-parse', '--show-toplevel').stdout.trim()).toBe(resolve(repo))
  })

  it('can commit without running the live hook path configured in the fixture', () => {
    expect(git('config', '--local', 'core.hooksPath').stdout.trim()).toBe(resolve(SOURCE_SCRIPTS, 'git-hooks'))
    write('fixture-hook-proof.txt', 'a fixture commit with no authoring trailer\n')
    commit('fixture commit bypasses the live hooks')
    expect(git('log', '-1', '--format=%s').stdout.trim()).toBe('fixture commit bypasses the live hooks')
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

// The lesson→mechanism ledger, exercised through the SPAWNED guard rather than
// its core (point 370). Two things only a real run can show: that the ledger
// verdict survives `collectSources()` THROWING — which it does in every git
// worktree, where the memory dir is keyed on the checkout path, and which would
// otherwise swallow the ledger check through the wrapper's outer catch — and
// that a brand-new lesson subsection really does stop the turn.
describe('retro-currency-guard: the lesson ledger', () => {
  const RETRO = 'docs/analysis_de/retrospektive-zusammenarbeit.md'
  const LEDGER = 'docs/analysis_de/lesson-mechanisms.md'
  const retro = (extra = '') =>
    ['# Retro', '', '### 3.1 Eine alte Lehre', 'prose', '', extra, '', AUTO_START, AUTO_END].join('\n')
  const ledger = (...rows) =>
    ['| Lektion | Titel | Ergebnis | Durchsetzer / Begründung |', '|---|---|---|---|', ...rows].join('\n')
  const ROW_31 = '| 3.1 | Eine alte Lehre | 1 | scripts/model-guard.mjs |'

  it('BLOCKS on a brand-new subsection that carries no mechanism decision', () => {
    write(RETRO, retro('### 3.99 Eine brandneue Lehre\nprose'))
    write(LEDGER, ledger(ROW_31))
    const hook = runHook('retro-currency-guard.mjs')
    expect(hook.status).toBe(0)
    expect(hook.decision?.decision, `stdout was ${JSON.stringify(hook.stdout)}`).toBe('block')
    expect(hook.decision.reason).toMatch(/§3\.99 .* has NO ledger entry/)
    // The proof that it does not ride on the currency half: that half errored
    // out on the missing memory dir and allowed, exactly as in a worktree.
    expect(hook.stderr).toMatch(/currency check errored/)
  })

  it('ALLOWS once the decision is recorded', () => {
    write(RETRO, retro('### 3.99 Eine brandneue Lehre\nprose'))
    write(LEDGER, ledger(ROW_31, '| 3.99 | Eine brandneue Lehre | 2 | scripts/guard-health-guard.mjs |'))
    const hook = runHook('retro-currency-guard.mjs')
    expect(hook.status).toBe(0)
    expect(hook.stdout.trim()).toBe('')
  })

  it('BLOCKS a decision that claims an enforcer nobody built', () => {
    write(RETRO, retro('### 3.99 Eine brandneue Lehre\nprose'))
    write(LEDGER, ledger(ROW_31, '| 3.99 | Eine brandneue Lehre | 2 | scripts/imaginary-guard.mjs |'))
    const hook = runHook('retro-currency-guard.mjs')
    expect(hook.decision?.decision).toBe('block')
    expect(hook.decision.reason).toMatch(/imaginary-guard\.mjs.*does not exist/s)
  })

  // RETRO_LEDGER_PATH exists so a check can point the guard at a ledger of its
  // own. An override nothing exercises is a claim, not a lever, so it is used
  // here rather than merely declared.
  it('honours RETRO_LEDGER_PATH', () => {
    write(RETRO, retro('### 3.99 Eine brandneue Lehre\nprose'))
    write(LEDGER, ledger(ROW_31)) // incomplete: the default path would BLOCK
    write('elsewhere/ledger.md', ledger(ROW_31, '| 3.99 | Eine brandneue Lehre | 3 | Bewusst keiner: reine Urteilsfrage. |'))
    const hook = runHook('retro-currency-guard.mjs', {
      env: { RETRO_LEDGER_PATH: resolve(repo, 'elsewhere/ledger.md') },
    })
    expect(hook.status).toBe(0)
    expect(hook.stdout.trim()).toBe('')
  })

  it('stands down silently while the batch is paused', () => {
    write(RETRO, retro('### 3.99 Eine brandneue Lehre\nprose'))
    write(LEDGER, ledger(ROW_31))
    write('.claude/batch-paused', '')
    try {
      expect(runHook('retro-currency-guard.mjs').stdout.trim()).toBe('')
    } finally {
      rmSync(resolve(repo, '.claude/batch-paused'), { force: true })
      rmSync(resolve(repo, 'docs/analysis_de'), { recursive: true, force: true })
      rmSync(resolve(repo, 'elsewhere'), { recursive: true, force: true })
    }
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

  it('BLOCKS on a newly written uppercase title and gives the replacement', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. THIS TITLE SHOUTS\n  Final-state body.\n')
    const hook = expectHookAgrees('tasks-spec-guard.mjs', 'tasks-spec-guard', { blocks: true })
    expect(hook.decision.reason).toContain('2: "This title shouts"')
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
    // WITHIN BUDGET NOW MEANS BETWEEN THE CEILING AND ITS SLACK (point 768): a nearly
    // empty file is no longer "within budget", it is a ceiling nobody lowered. So every
    // budgeted file in the fixture is built FROM the shipped budget rather than typed,
    // and it follows the ceilings down at the next cut instead of going stale.
    const budgetFor = (path) => DOC_BUDGETS.find((b) => b.path === path)
    /** `words` words over at most `maxLines` lines — the guard's own tokenizer counts both. */
    const filler = (words, maxLines) => {
      const rows = Math.max(1, Math.min(maxLines, Math.ceil(words / 12)))
      const per = Math.floor(words / rows)
      return Array.from({ length: rows }, (_, i) =>
        Array.from({ length: i === rows - 1 ? words - per * (rows - 1) : per }, (_, k) => `w${i}x${k}`).join(' '),
      ).join('\n')
    }
    const claude = budgetFor('CLAUDE.md')
    write('CLAUDE.md', `${filler(claude.maxWords - 1, claude.maxLines - 1)}\n`)
    const design = budgetFor('design.md')
    write('design.md', `${filler(design.maxWords - 1, design.maxLines - 1)}\n`)
    // Only the PREAMBLE is budgeted here, so the filler stops at the checklist marker.
    const tasks = budgetFor('TASKS.md')
    write('TASKS.md', `${filler(tasks.maxWords - 1, tasks.maxLines - 1)}\n## Checklist\n\n- [ ] 1. A point.\n`)
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

  /** The provenance baseline: what the work order held when nothing was outstanding. */
  const rankRecord = (points) =>
    write(
      '.claude/queue-rank.json',
      JSON.stringify({ ranked: {}, settled: { at: '2026-08-10T09:00:00.000Z', points } }),
    )

  it('BLOCKS when a queue card claims done what TASKS.md still has open', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. Still open work.\n')
    rankRecord([2])
    write('.batch-dashboard.html', board('Das Problem ist behoben.'))
    const hook = expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: true })
    expect(hook.decision.reason).toBe(preflight()['queue-order-guard'].reason)
    expect(hook.decision.reason).toMatch(/CLAIMS DONE WHAT IS OPEN/)
  })

  it('ALLOWS a board that matches the work order, and settles the rank baseline as it goes', () => {
    // The one thing this guard WRITES (point 590): the baseline drops a point
    // that has closed, so a reopened point cannot ride back in on an old
    // membership. It may only move while nothing is outstanding, and never throw.
    rankRecord([2, 999])
    write('.batch-dashboard.html', board('Noch offen, wird als naechstes angegangen.'))
    expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: false })
    expect(JSON.parse(readFileSync(resolve(repo, '.claude/queue-rank.json'), 'utf8')).settled.points).toEqual([2])
  })

  it('BLOCKS the turn that appended a point until its rank is settled (point 590)', () => {
    write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. Still open work.\n- [ ] 3. Frisch angehängt.\n')
    try {
      const hook = expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: true })
      expect(hook.decision.reason).toMatch(/APPENDED POINT NOT RANKED.*3/)
      // …and the decision releases it, without any board change.
      write(
        '.claude/queue-rank.json',
        JSON.stringify({
          ranked: { 3: { at: '2026-08-10T09:00:00.000Z', why: 'nothing waits on it' } },
          settled: { at: '2026-08-10T09:00:00.000Z', points: [2] },
        }),
      )
      expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: false })
    } finally {
      write('TASKS.md', '# TASKS\n\n## Checklist\n\n- [ ] 2. Still open work.\n')
      rankRecord([2])
    }
  })

  it('asks for the baseline where the checkout has none', () => {
    rmSync(resolve(repo, '.claude/queue-rank.json'))
    try {
      const hook = expectHookAgrees('queue-order-guard.mjs', 'queue-order-guard', { blocks: true })
      expect(hook.decision.reason).toMatch(/QUEUE RANK BASELINE MISSING/)
      // …and it does not arm itself out of that state: only --seed does that.
      expect(existsSync(resolve(repo, '.claude/queue-rank.json'))).toBe(false)
    } finally {
      rankRecord([2])
    }
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

  it('BLOCKS DIFFERENTLY on a commit whose trailer names no model at all', () => {
    // The trailer that cost a round on 28.07.2026 (point 397): it must block —
    // an unnamed author proves nothing — but with the resolvable remedy, not
    // the breach ritual.
    write('.claude/model-guard-baseline.json', JSON.stringify({ since: new Date(Date.now() - 3600_000).toISOString() }))
    write('marker.txt', `bare ${Date.now()}`)
    commit('a change from a session that named nothing\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
    const sha = git('rev-parse', 'HEAD').stdout.trim().slice(0, 7)

    const hook = expectHookAgrees('model-guard.mjs', 'model-guard', { blocks: true })
    expect(hook.decision.reason).toMatch(/UNIDENTIFIED AUTHOR/)
    expect(hook.decision.reason).not.toMatch(/SERVING-MODEL TRIPWIRE/)
    expect(hook.decision.reason).toContain(sha)
    expect(hook.decision.reason).toContain('~/.claude/projects/')
  })

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
        windowsHide: true,
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

// The four-eyes gate on mechanisms (point 377), spawned rather than read. Its
// whole promise is that it fires on the NEXT guard someone writes, and the rule
// it enforces was believed enforced for weeks while nothing was wired at all —
// so "the code looks right" is precisely the evidence that failed here before.
// The 5 s default is too thin here: a single case spawns a handful of git
// commands, the record CLI, the preflight and the hook itself, and this machine
// regularly runs a browser suite alongside the unit layer. A timeout under load
// is a load verdict, not a defect — and one that rotates teaches people to
// re-run rather than to read.
describe('mechanism-review-guard: the switched-off four-eyes gate', { timeout: 60_000 }, () => {
  // THE BLOCK IS GONE (point 1036, CLAUDE.md §2 infrastructure freeze), and with
  // it the twelve end-to-end blocking cases that used to stand here. What has to
  // be proven now is the opposite pair: the hook lets an entirely unreviewed
  // guard through, and the MEASUREMENT that replaced the block still sees the
  // very commit it no longer stops. The recorder's own same-vendor refusal is
  // untouched by any of this and stays.
  const BASELINE = '.claude/mechanism-review-baseline.json'
  const LEDGER = '.claude/mechanism-reviews.jsonl'
  const branch = () => git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()
  const head = () => git('rev-parse', 'HEAD').stdout.trim()
  const baselineAt = (sha) => write(BASELINE, JSON.stringify({ baselines: { [branch()]: sha } }))
  const review = (args) => node([resolve(repo, 'scripts', 'mechanism-review.mjs'), ...args])
  const AUTHOR = 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>'
  let guardSha = ''

  it('lets a brand-new unreviewed guard through, at the hook and at the preflight', () => {
    write(LEDGER, '')
    const base = head()
    write('scripts/demo-guard.mjs', '// a brand-new enforcer\n')
    commit(`add a demo guard\n\n${AUTHOR}`)
    guardSha = head()
    baselineAt(base)

    // The preflight registers no verdict for it at all — and it names WHY, so a
    // reader who wonders where the gate went is told in the same line.
    const predicted = preflight()['mechanism-review-guard']
    expect(predicted, 'mechanism-review-guard is not registered with the preflight').toBeTruthy()
    expect(predicted.status).toBe('not-applicable')
    expect(predicted.detail ?? predicted.reason ?? '').toContain('switched off')

    // And the Stop hook prints nothing, which is how a hook says "not mine".
    const hook = runHook('mechanism-review-guard.mjs')
    expect(hook.status, hook.stderr).toBe(0)
    expect(hook.stdout.trim(), 'a switched-off gate must print nothing at a turn end').toBe('')
  })

  it('still MEASURES the contribution it no longer blocks, and never calls it clear', () => {
    // THE SPAWNED OUTPUT, not a predicate about it (cross-vendor round 3): the
    // report's three printing branches were each capable of hiding the debt,
    // and only running the command shows which one wins here.
    const status = node([resolve(repo, 'scripts', 'mechanism-review-guard.mjs'), '--status'])
    expect(status.status, status.stderr).toBe(0)
    expect(status.stdout).toContain(guardSha.slice(0, 7))
    expect(status.stdout).toContain('scripts/demo-guard.mjs')
    expect(status.stdout).toContain('outstanding review contributions: 1')
    expect(status.stdout, 'a debt must never be reported as a clear gate').not.toContain('GATE CLEAR')
  })

  it('REFUSES to record a self-review instead of warning about it', () => {
    const r = review([
      '--record', guardSha,
      '--model', 'Claude Opus 5',
      '--verdict', 'merge',
      '--evidence', 'I have read my own work again and it still looks right',
      '--mode', 'review',
    ])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/SAME-VENDOR REVIEW is refused/)
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
    expect(r.stdout).toMatch(/re-run: node scripts\/point-brief\.mjs 3\b/)
    // The last line of the brief is the return protocol's — anchoring on the END
    // is what proves nothing was dropped off the tail of the pipe.
    expect(r.stdout).toMatch(/never truncate what the next session needs to know\.\s*$/)
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
