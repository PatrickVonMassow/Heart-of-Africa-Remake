// THE FOCUS SWITCH, PROVEN BY RUNNING IT (seventh cross-review).
//
// The pure membership rule ("the focus may name ANY standing card") lives in
// dashboard-guard-core.test.mjs — but that test could not catch the split-brain
// this suite pins: `board.mjs focus` wrote only the focus FILE through
// focus.mjs, never `declaration.focusPoint` in the structured active-work
// source, so a switch between two standing cards left the two stores
// contradicting each other while every set-check stayed green. Spawned like
// board-first-guard.test.mjs, inside an isolated temp repo, because a mocked
// dependency never proves the executed path.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
let repo

const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2))
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const focusPath = () => resolve(repo, '.claude', 'current-focus.json')
const declarationPath = () => resolve(repo, '.claude', 'batch-in-flight.json')

const nowCard = (point, title) =>
  `<details class="now">\n  <summary><span class="num">${point}</span><span class="t">${title}</span>` +
  `<span class="right"><span class="meta">12:00</span></span></summary>\n` +
  `  <div class="body">\n    <p><span class="stamp">Stand 12:00</span> läuft.</p>\n  </div>\n</details>\n`

const sect = (name, body) => `<details class="sect"><summary><h2>${name}</h2></summary>\n${body}</details>\n`

const board = () =>
  `<main>\n${sect('Woran ich gerade arbeite', nowCard(697, 'Erster Strang') + nowCard(700, 'Zweiter Strang'))}` +
  `${sect('Von dir zu klären', '')}${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`

/** Run one of the copied CLIs inside the temp repo. */
const runCli = (script, ...args) =>
  spawnSync(process.execPath, [resolve(repo, 'scripts', script), ...args], {
    windowsHide: true,
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
  })

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-board-focus-'))
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), {
    recursive: true,
    filter: (src) => !/[\\/](git-hooks)([\\/]|$)/.test(src),
  })
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
})

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

beforeEach(() => {
  // Two standing cards, the focus and the structured source both on the FIRST.
  writeFileSync(resolve(repo, '.batch-dashboard.html'), board())
  writeFileSync(resolve(repo, 'TASKS.md'), '- [ ] 697. First strand\n- [ ] 700. Second strand\n')
  writeJson(resolve(repo, '.claude', 'dashboard-state.json'), { dashboardPath: '.batch-dashboard.html' })
  writeJson(focusPath(), { point: 697, note: 'first', setAt: Date.now(), confirmedAt: Date.now() })
  writeJson(declarationPath(), {
    focusPoint: 697,
    evidence: [
      { kind: 'branch', ref: 'feat/697-a', point: 697, phase: 'authoring' },
      { kind: 'branch', ref: 'feat/700-b', point: 700, phase: 'authoring' },
    ],
  })
})

describe('board.mjs focus (spawned)', () => {
  it('a switch to the SECOND standing card updates the focus file AND declaration.focusPoint together', () => {
    const r = runCli('board.mjs', 'focus', '700', 'wechsle auf den zweiten Strang')
    // The publish attempt may fail in the sandbox repo (no transport) — the
    // transition itself must have been written BEFORE it either way.
    expect(r.stdout + r.stderr).toContain('focus declared: 700')
    expect(readJson(focusPath()).point).toBe(700)
    const declaration = readJson(declarationPath())
    expect(declaration.focusPoint).toBe(700)
    // The switch exits nothing: both strands keep standing in the source.
    expect(declaration.evidence.map((item) => item.point)).toEqual([697, 700])

    // …and the confirm accepts the SECOND card, behaviourally: the membership
    // rule is checked by the real focus.mjs against the real board file.
    const confirm = runCli('focus.mjs', 'confirm')
    expect(confirm.status, confirm.stderr).toBe(0)
    expect(confirm.stdout).toContain('focus confirmed: 700')
  })

  it('clears both stores with "-" and refuses a non-point before touching either', () => {
    const cleared = runCli('board.mjs', 'focus', '-', 'kein Punkt gerade')
    expect(cleared.stdout + cleared.stderr).toContain('focus declared: -')
    expect(readJson(focusPath()).point).toBeNull()
    expect(readJson(declarationPath()).focusPoint).toBeNull()

    const refused = runCli('board.mjs', 'focus', 'x7', 'kaputt')
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('neither a TASKS point number')
    // Nothing moved on the refusal.
    expect(readJson(focusPath()).point).toBeNull()
    expect(readJson(declarationPath()).focusPoint).toBeNull()
  })
})
