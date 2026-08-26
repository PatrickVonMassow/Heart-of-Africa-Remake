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

  // Ninth cross-vendor round: the shared transition closed the split-brain for
  // `board.mjs focus`, but focus.mjs is a CLI of its own and every session and
  // script may call it directly — and it wrote only the FILE, leaving the
  // declaration's copy of the same fact on the old strand.
  it('takes the declaration with it when focus.mjs set is called DIRECTLY', () => {
    const r = runCli('focus.mjs', 'set', '700', 'direkt umgestellt')

    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('focus declared: 700')
    expect(readJson(focusPath()).point).toBe(700)
    const declaration = readJson(declarationPath())
    expect(declaration.focusPoint).toBe(700)
    // Nothing else moves: a focus switch exits no strand.
    expect(declaration.evidence.map((item) => item.point)).toEqual([697, 700])
  })

  it('rolls the declaration back when the focus step fails AFTER the declaration write', () => {
    // Eighth cross-review: the transition writes declaration.focusPoint FIRST
    // and runs `focus.mjs set` second. A second step that fails must not leave
    // the stores contradicting each other in the other direction — the
    // declaration write is rolled back and the command fails loudly.
    const focusScript = resolve(repo, 'scripts', 'focus.mjs')
    const original = readFileSync(focusScript, 'utf8')
    writeFileSync(focusScript, 'process.stderr.write("focus stub: refusing\\n")\nprocess.exit(1)\n')
    try {
      const r = runCli('board.mjs', 'focus', '700', 'wechsle auf den zweiten Strang')
      expect(r.status).toBe(1)
      // Neither store moved: the focus file was never written, the
      // declaration write was rolled back.
      expect(readJson(focusPath()).point).toBe(697)
      const declaration = readJson(declarationPath())
      expect(declaration.focusPoint).toBe(697)
      expect(declaration.evidence.map((item) => item.point)).toEqual([697, 700])
    } finally {
      writeFileSync(focusScript, original)
    }
  })

  // Sixth cross-vendor round: the same rollback ran on the BOARD commands too,
  // where the edited board is already on disk when the focus step runs. Undoing
  // the declaration there recreates the split-brain in the other direction, and
  // the prescribed publish retry projects the old membership over the new
  // board. The new state stands; the focus store is named as the one behind.
  it('KEEPS the new declaration when the focus step fails after a durable board write', () => {
    const focusScript = resolve(repo, 'scripts', 'focus.mjs')
    const original = readFileSync(focusScript, 'utf8')
    writeFileSync(focusScript, 'process.stderr.write("focus stub: refusing\\n")\nprocess.exit(1)\n')
    try {
      // Archiving the FOCUSED strand: the board write lands first, then the
      // transition clears the focus — which is the step that fails here. The
      // work order has to agree that 697 is closed, or the publish precondition
      // refuses before anything is written at all.
      writeFileSync(resolve(repo, 'TASKS.md'), '- [x] 697. First strand\n- [ ] 700. Second strand\n')
      const r = runCli('board.mjs', 'done', '697', 'erster Strang fertig')
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('node scripts/focus.mjs set')
      // The board write stands, so the record of what it means stands with it:
      // the archived strand is gone from the source, not restored into it.
      expect(readFileSync(resolve(repo, '.batch-dashboard.html'), 'utf8')).toContain('erster Strang fertig')
      expect(readJson(declarationPath()).evidence.map((item) => item.point)).toEqual([700])
      // …and the focus file is the store the message names as behind.
      expect(readJson(focusPath()).point).toBe(697)
    } finally {
      writeFileSync(focusScript, original)
    }
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
