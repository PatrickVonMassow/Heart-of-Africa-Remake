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
const nowCard = (n, title) =>
  `<details class="now">\n  <summary><span class="num">${n}</span><span class="t">${title}</span>` +
  `<span class="right"><span class="meta">12:00</span></span></summary>\n` +
  `  <div class="body">\n    <p><span class="stamp">Stand 12:00</span> läuft.</p>\n  </div>\n</details>\n`
const queueCard = (n, title) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">${title}</span>` +
  `<span class="right"><span class="meta">~2 h</span></span></summary>\n` +
  `  <div class="body">\n    <p>Warum das ansteht.</p>\n  </div>\n</details>\n`
const BOARD =
  `<main>\n${sect('Woran ich gerade arbeite', nowCard(1490, 'Platz sparen'))}${sect('Von dir zu klären', '')}` +
  `${sect('Warteschlange', queueCard(1509, 'Lokale Baukopien behalten'))}${sect('Erledigt', '')}</main>\n`

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
  writeFileSync(resolve(repo, 'TASKS.md'), '- [x] 1490. Disk footprint\n- [ ] 1509. Housekeeping\n')
  writeFileSync(resolve(repo, '.claude', 'dashboard-state.json'), JSON.stringify({ dashboardPath: '.batch-dashboard.html' }))
  writeFileSync(carrierFile(), CARRIER)
})

/** The 1509 current-work card in the board file, or null. */
const nowCardOf1509 = () => {
  const html = readFileSync(boardFile(), 'utf8')
  const section = html.slice(html.indexOf('Woran ich gerade arbeite'), html.indexOf('Von dir zu klären'))
  return /<span class="num">1509<\/span>/.test(section) ? section : null
}

const STARTS = [
  ['now', ['now', '1509', 'läuft']],
  ['promote', ['promote', '1509', '12:00 – ~13:00', 'Lokale Baukopien behalten', 'läuft']],
  ['done --next', ['done', '1490', 'fertig', '--next', '1509', 'läuft']],
]

describe('board.mjs start path drains pending requests first (spawned)', () => {
  it.each(STARTS)('%s refuses while a request naming the point is pending, board untouched', (_name, args) => {
    const r = runBoard(...args)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/point 1509 cannot start/)
    expect(r.stderr).toMatch(/NAMES 1509: Amend 1509/)
    expect(readFileSync(boardFile(), 'utf8')).toBe(BOARD)
  })

  it.each(STARTS)('%s makes 1509 current work once the request is appended', (_name, args) => {
    writeFileSync(carrierFile(), markAppending(CARRIER, 'Amend 1509', 1512).text)
    const r = runBoard(...args)
    const out = r.stdout + r.stderr
    // The board edit and the focus update must succeed. Exit 0 would need a
    // real publish to the live page, which this temp repo must never reach, so
    // the publish is asserted to be the ONLY failing step.
    expect(out).toMatch(/BOARD FILE WRITTEN — .*1509 (is|promoted to) current work/)
    expect(out).toMatch(/focus declared: 1509/)
    expect(out).toMatch(/The LIVE page was NOT updated/)
    expect(out).not.toMatch(/cannot start|publish precondition refused|no queue card/)
    expect(JSON.parse(readFileSync(resolve(repo, '.claude', 'current-focus.json'), 'utf8')).point).toBe(1509)
    expect(nowCardOf1509()).not.toBeNull()
  })
})
