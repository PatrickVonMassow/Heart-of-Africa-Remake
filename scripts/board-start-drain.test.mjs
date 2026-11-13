// Starting a point through the real board.mjs refuses while a user request that
// names it is pending in the findings carrier, and passes once it is appended.
// Spawned in an isolated temp repo like board-focus-behaviour.test.mjs.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { markAppending, requestEntry } from './findings-request-core.mjs'

const SOURCE_SCRIPTS = resolve(process.cwd(), 'scripts')
let repo
let memory

const sect = (name, body) => `<details class="sect"><summary><h2>${name}</h2></summary>\n${body}</details>\n`
const BOARD =
  `<main>\n${sect('Woran ich gerade arbeite', '')}${sect('Von dir zu klären', '')}` +
  `${sect('Warteschlange', '')}${sect('Erledigt', '')}</main>\n`

const CARRIER = `# Findings carrier\n\n${requestEntry({
  at: '2026-11-12T16:10:00.000Z',
  session: 'ab12cd34',
  title: 'Amend 1509: daily token-free housekeeping script',
  why: 'The running point would delete builds the amendment keeps.',
  spec: 'Point 1509 keeps local/ isolation builds.',
})}\n\n`

const boardFile = () => resolve(repo, '.batch-dashboard.html')
const carrierFile = () => resolve(memory, 'findings-carrier.md')
const runBoard = (...args) =>
  spawnSync(process.execPath, [resolve(repo, 'scripts', 'board.mjs'), ...args], {
    windowsHide: true,
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, FINDINGS_MEMORY_DIR: memory },
  })

beforeAll(() => {
  repo = mkdtempSync(resolve(tmpdir(), 'hoa-board-drain-'))
  memory = resolve(repo, 'memory')
  cpSync(SOURCE_SCRIPTS, resolve(repo, 'scripts'), {
    recursive: true,
    filter: (src) => !/[\\/](git-hooks)([\\/]|$)/.test(src),
  })
  mkdirSync(resolve(repo, '.claude'), { recursive: true })
  mkdirSync(memory, { recursive: true })
})

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

beforeEach(() => {
  writeFileSync(boardFile(), BOARD)
  writeFileSync(resolve(repo, 'TASKS.md'), '- [ ] 1509. Housekeeping\n')
  writeFileSync(resolve(repo, '.claude', 'dashboard-state.json'), JSON.stringify({ dashboardPath: '.batch-dashboard.html' }))
  writeFileSync(carrierFile(), CARRIER)
})

describe('board.mjs start path drains pending requests first (spawned)', () => {
  it.each([
    ['now', ['now', '1509', 'läuft']],
    ['promote', ['promote', '1509', '12:00 – ~13:00', 'Aufräumen', 'läuft']],
  ])('%s refuses while a request naming the point is pending, board untouched', (_name, args) => {
    const r = runBoard(...args)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/point 1509 cannot start/)
    expect(r.stderr).toMatch(/NAMES 1509: Amend 1509/)
    expect(readFileSync(boardFile(), 'utf8')).toBe(BOARD)
  })

  it('no longer refuses once the request is appended', () => {
    writeFileSync(carrierFile(), markAppending(CARRIER, 'Amend 1509', 1512).text)
    const r = runBoard('now', '1509', 'läuft')
    expect(r.stdout + r.stderr).not.toMatch(/cannot start/)
  })
})
