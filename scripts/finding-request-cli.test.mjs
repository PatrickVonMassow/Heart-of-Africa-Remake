// The LIVE round trip of a deposited request (point 462): a real process
// writes a real carrier and a second one drains it.
//
// The pure layer is swept in findings-request-core.test.mjs; what this pins is
// the half no pure test can — that the CLI actually reaches the file, that a
// multi-line spec survives the file→carrier→print journey byte for byte, and
// that the refusals a caller will meet are the ones the usage promises.
//
// It touches NO real state: FINDINGS_MEMORY_DIR redirects the carrier into a
// fresh temp directory per test. `--blocked` is deliberately NOT run here — it
// writes a decision card and publishes the live board, which a test may never
// do; its pure half is covered beside the other transitions.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { requestEntries } from './findings-request-core.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const SPEC = ['FINAL STATE: der Träger bekommt eine zweite Art.', '', '  - [ ] eine Zeile, die wie ein Kopf aussieht', 'Ende.'].join('\n')

let dir
const run = (args, expectFail = false, env = {}, input = undefined) => {
  try {
    return execFileSync(process.execPath, ['scripts/finding.mjs', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, FINDINGS_MEMORY_DIR: dir, ...env },
      ...(input === undefined ? {} : { input }),
    })
  } catch (e) {
    if (!expectFail) throw new Error(`finding.mjs ${args.join(' ')} failed: ${e.stderr || e.message}`)
    return String(e.stderr ?? '')
  }
}

/**
 * A preload that makes a SECOND window deposit inside the gap between the
 * carrier read and the carrier write of the process under test.
 *
 * The gap is the whole subject of four-eyes finding 1 (Fable 5), and it cannot
 * be reached from outside the process: it is microseconds wide and no polling
 * loop would land in it deterministically. Hooking `readFileSync` puts the
 * concurrent deposit exactly where it hurts — after the running CLI has read the
 * carrier, before it writes its answer back. The deposit itself is made by a
 * REAL `finding.mjs --request` process, so what interleaves is the actual append
 * path, not a hand-built line. Nothing of the mechanism is stubbed; only the
 * moment is chosen.
 */
const interleavingPreload = (title) => {
  const path = join(dir, 'interleave.cjs')
  writeFileSync(
    path,
    `const fs = require('fs')
const { execFileSync } = require('child_process')
const real = fs.readFileSync
let fired = false
fs.readFileSync = function (target) {
  const out = real.apply(fs, arguments)
  if (!fired && String(target).endsWith('findings-carrier.md')) {
    fired = true
    execFileSync(process.execPath, ['scripts/finding.mjs', '--request', ${JSON.stringify(title)},
      '--spec-file', ${JSON.stringify(join(dir, 'spec.md'))}, '--session', 'otherwin'],
      { cwd: ${JSON.stringify(REPO_ROOT)}, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } })
  }
  return out
}
`,
    'utf8',
  )
  return { NODE_OPTIONS: `--require ${JSON.stringify(path)}` }
}

const carrierText = () => readFileSync(join(dir, 'findings-carrier.md'), 'utf8')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-carrier-'))
  writeFileSync(join(dir, 'spec.md'), `${SPEC}\n`, 'utf8')
  writeFileSync(join(dir, 'why.md'), 'Eine Stunde lang konnte nichts eingereiht werden.\n', 'utf8')
  writeFileSync(join(dir, 'quotes.md'), 'user 30.07.2026: „Gibt es eine sichere Lösung?“\n', 'utf8')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const deposit = (title = 'Anfragen aus einem Nebenfenster einreihen', extra = []) =>
  run([
    '--request',
    title,
    '--spec-file',
    join(dir, 'spec.md'),
    '--why-file',
    join(dir, 'why.md'),
    '--quotes-file',
    join(dir, 'quotes.md'),
    '--bundle',
    'Session- & Repo-Hygiene',
    '--session',
    'deadbeefcafe',
    ...extra,
  ])

describe('a non-owner deposits a request and the owner drains it', () => {
  it('carries the spec into the carrier and back out unchanged', () => {
    expect(deposit()).toMatch(/request deposited \(1 waiting\)/)
    const shown = run(['--show', 'Nebenfenster'])
    expect(shown).toContain(SPEC)
    expect(shown).toContain('user 30.07.2026')
    expect(shown).toContain('route: TASKS append')
  })

  it('lists it, and stops listing it once it became a point', () => {
    deposit()
    expect(run(['--requests'])).toMatch(/1 request\(s\) waiting/)
    expect(run(['--queued', 'Nebenfenster', '--point', '481'])).toMatch(/as point 481/)
    expect(run(['--requests'])).toMatch(/0 request\(s\) waiting/)
    expect(readFileSync(join(dir, 'findings-carrier.md'), 'utf8')).toContain('queued 481')
  })

  it('keeps findings and requests apart in the drain report', () => {
    deposit()
    run(['--record', 'Ein Befund', '--detail', 'Belegt.', '--session', 'deadbeefcafe'])
    expect(run(['--drain'])).toMatch(/1 waiting, 1 request\(s\), 0 landed/)
  })

  it('counts a finding titled like a request head as a FINDING', () => {
    run(['--record', '[request] · pending · Sieht aus wie eine Anfrage', '--detail', 'Belegt.', '--session', 's'])
    expect(run(['--drain'])).toMatch(/1 waiting, 0 request\(s\), 0 landed/)
    expect(run(['--drain'])).toContain('Sieht aus wie eine Anfrage')
  })

  it('routes a deposit with open questions to a decision card, not to the queue', () => {
    writeFileSync(join(dir, 'q.md'), 'Soll das auch für die Doku gelten?\n', 'utf8')
    expect(deposit('Mit offener Frage', ['--open-questions-file', join(dir, 'q.md')])).toMatch(/OPEN QUESTIONS/)
    expect(run(['--requests'])).toContain('DECISION CARD')
  })

  it('appends the --approved words to the user quotes', () => {
    deposit('Mit Freigabe', ['--approved', 'Ja, so einreihen.'])
    const shown = run(['--show', 'Mit Freigabe'])
    expect(shown).toContain('user 30.07.2026')
    expect(shown).toContain('approved: "Ja, so einreihen."')
    expect(shown.indexOf('user 30.07.2026')).toBeLessThan(shown.indexOf('approved: "Ja, so einreihen."'))
  })

  it('takes --approved alone as the user quotes', () => {
    const out = run(['--request', 'Nur Freigabe', '--spec-file', join(dir, 'spec.md'), '--approved', 'passt so', '--session', 's'])
    expect(out).not.toMatch(/WARNING: no user quotes/)
    expect(run(['--show', 'Nur Freigabe'])).toContain('approved: "passt so"')
  })

  it('names what a half-written deposit does not say instead of refusing it', () => {
    const out = run(['--request', 'Ohne Begründung', '--spec-file', join(dir, 'spec.md'), '--session', 's'])
    expect(out).toMatch(/WARNING: no observed problem/)
    expect(out).toMatch(/WARNING: no user quotes/)
    expect(run(['--requests'])).toMatch(/1 request\(s\) waiting/)
  })
})

describe('a carrier whose last entry lost its trailing newline', () => {
  it('keeps the next deposit on its own line and the previous entry unchanged', () => {
    run(['--record', 'Ein Befund', '--detail', 'Belegt.', '--session', 'deadbeefcafe'])
    const before = carrierText().replace(/\s+$/, '')
    writeFileSync(join(dir, 'findings-carrier.md'), before, 'utf8')
    expect(deposit()).toMatch(/request deposited \(1 waiting\)/)
    expect(run(['--requests'])).toContain('Anfragen aus einem Nebenfenster einreihen')
    expect(carrierText().startsWith(`${before}\n\n`)).toBe(true)
    expect(run(['--drain'])).toMatch(/1 waiting, 1 request\(s\), 0 landed/)
  })

  it('leaves a rewritten carrier ending in a newline', () => {
    deposit()
    writeFileSync(join(dir, 'findings-carrier.md'), carrierText().replace(/\s+$/, ''), 'utf8')
    run(['--queued', 'Nebenfenster', '--point', '481'])
    expect(carrierText().endsWith('\n')).toBe(true)
  })
})

describe('a deposit that lands while the owner is draining', () => {
  it('survives the write-back instead of being erased by it', () => {
    deposit('Erste Anfrage aus dem Nebenfenster')
    const out = run(
      ['--queued', 'Erste Anfrage', '--point', '481'],
      false,
      interleavingPreload('Zweite Anfrage aus dem Nebenfenster'),
    )
    expect(out).toMatch(/as point 481/)
    const text = carrierText()
    // The drained one is retired…
    expect(text).toContain('queued 481')
    expect(text).toContain('Erste Anfrage aus dem Nebenfenster')
    // …and the one that arrived in the gap is still there, still pending.
    expect(text).toContain('Zweite Anfrage aus dem Nebenfenster')
    expect(run(['--requests'])).toMatch(/1 request\(s\) waiting/)
    expect(run(['--requests'])).toContain('Zweite Anfrage')
  })
})

describe('the refusals a caller will actually meet', () => {
  it('refuses a deposit without the finished spec', () => {
    expect(run(['--request', 'Nur ein Zettel', '--session', 's'], true)).toMatch(/--spec-file/)
  })

  it('refuses an unreadable spec file by name', () => {
    expect(run(['--request', 'x', '--spec-file', join(dir, 'weg.md'), '--session', 's'], true)).toMatch(/--spec-file/)
  })

  it('refuses a queue without its point number, and a point that is not one', () => {
    deposit()
    expect(run(['--queued', 'Nebenfenster'], true)).toMatch(/--point/)
    expect(run(['--queued', 'Nebenfenster', '--point', 'bald'], true)).toMatch(/point number/)
  })

  it('refuses to queue a deposit that still carries open questions', () => {
    writeFileSync(join(dir, 'q.md'), 'Soll das auch für die Doku gelten?\n', 'utf8')
    deposit('Mit offener Frage', ['--open-questions-file', join(dir, 'q.md')])
    const err = run(['--queued', 'offener Frage', '--point', '481'], true)
    expect(err).toMatch(/OPEN QUESTIONS/)
    expect(err).toMatch(/--blocked/)
    expect(run(['--requests'])).toMatch(/1 request\(s\) waiting/)
    expect(readFileSync(join(dir, 'findings-carrier.md'), 'utf8')).not.toContain('queued 481')
  })

  it('refuses an ambiguous title rather than queueing the wrong deposit', () => {
    deposit('Anfrage A aus dem Nebenfenster')
    deposit('Anfrage B aus dem Nebenfenster')
    const err = run(['--queued', 'Nebenfenster', '--point', '481'], true)
    expect(err).toMatch(/matches 2 pending requests/)
    expect(run(['--requests'])).toMatch(/2 request\(s\) waiting/)
  })

  it('says so when nothing matches at all', () => {
    deposit()
    expect(run(['--show', 'gibt es nicht'], true)).toMatch(/no pending request matches/)
  })

  it('refuses a reasonless block before it touches anything', () => {
    deposit()
    expect(run(['--blocked', 'Nebenfenster'], true)).toMatch(/--why/)
    expect(run(['--requests'])).toMatch(/1 request\(s\) waiting/)
  })
})


describe('automatic requests are filed once by title', () => {
  it('deduplicates repeated runs even after the owner numbered the request', () => {
    expect(deposit('Repair pre-existing settings check: ground', ['--once'])).toContain('request deposited')
    for (let i = 1; i < 23; i++) {
      expect(deposit('Repair pre-existing settings check: ground', ['--once'])).toContain('request already filed')
    }
    run(['--queued', 'settings check: ground', '--point', '1200'])
    expect(deposit('Repair pre-existing settings check: ground', ['--once'])).toContain('request already filed')
    expect(requestEntries(carrierText())).toHaveLength(1)
    expect(carrierText()).toContain('queued 1200')
  })

  it('serializes concurrent reports while preserving distinct titles', async () => {
    const args = ['scripts/finding.mjs', '--request', 'Same red', '--once', '--spec-file', join(dir, 'spec.md')]
    const results = await Promise.all(Array.from({ length: 4 }, () => promisify(execFile)(process.execPath, args, {
      cwd: REPO_ROOT, windowsHide: true, encoding: 'utf8', env: { ...process.env, FINDINGS_MEMORY_DIR: dir },
    })))
    expect(results.filter((r) => r.stdout.includes('request deposited'))).toHaveLength(1)
    expect(requestEntries(carrierText())).toHaveLength(1)
    deposit('Another red', ['--once'])
    expect(requestEntries(carrierText())).toHaveLength(2)
  })
})

// Point 1186: a standing-down session may not create the files the long fields
// need, so every field also travels on stdin — one field, or all in one document.
describe('a deposit that never touches the filesystem', () => {
  it('takes one long field from stdin with --spec-file -', () => {
    const out = run(['--request', 'Spec auf stdin', '--spec-file', '-', '--why-file', join(dir, 'why.md'), '--session', 's'], false, {}, `${SPEC}\n`)
    expect(out).toMatch(/request deposited \(1 waiting\)/)
    const shown = run(['--show', 'Spec auf stdin'])
    expect(shown).toContain(SPEC)
    expect(shown).toContain('Eine Stunde lang')
  })

  it('takes every field in one delimited stdin document', () => {
    const doc = [
      '--- spec ---', SPEC, '', '--- why ---', 'Die Ablage war verweigert.',
      '--- quotes ---', 'user 22.09.2026: „Reihe dafür einen Punkt ein.“',
      '--- constraints ---', 'Kein neuer Wächter.', '--- bundle ---', 'Modell & Wächter', '--- refs ---', 'scripts/finding.mjs', '',
    ].join('\n')
    const out = run(['--request', 'Alles auf stdin', '--stdin', '--session', 's'], false, {}, doc)
    expect(out).toMatch(/request deposited \(1 waiting\)/)
    expect(out).not.toMatch(/WARNING/)
    const shown = run(['--show', 'Alles auf stdin'])
    for (const text of [SPEC, 'Die Ablage war verweigert.', '„Reihe dafür einen Punkt ein.“', 'Kein neuer Wächter.', 'Modell & Wächter', 'scripts/finding.mjs']) {
      expect(shown).toContain(text)
    }
  })

  it('keeps the file form exactly as it was', () => {
    deposit('Dateiform')
    const shown = run(['--show', 'Dateiform'])
    expect(shown).toContain(SPEC)
    expect(shown).toContain('user 30.07.2026')
  })

  it('refuses a malformed document with a line naming the accepted fields, and deposits nothing', () => {
    const err = run(['--request', 'Kaputt', '--stdin', '--session', 's'], true, {}, 'Vorspann ohne Kopf\n--- spec ---\nx\n')
    expect(err).toMatch(/--stdin document refused: line 1: text before the first part header/)
    expect(err).toContain('--- spec ---, --- why ---')
    expect(run(['--request', 'Kaputt', '--stdin'], true, {}, '--- spek ---\nx\n')).toMatch(/unknown field "spek"/)
    expect(run(['--request', 'Kaputt', '--stdin'], true, {}, '--- spec ---\nx\n--- spec ---\ny\n')).toMatch(/"spec" given twice/)
    const misspelt = run(['--request', 'Kaputt', '--stdin', '--session', 's'], true, {}, '--- spec ---\nx\n--- open_questions ---\nWer entscheidet?\n')
    expect(misspelt).toMatch(/line 3: unknown field "open_questions"/)
    expect(misspelt).toContain('--- open-questions ---')
    expect(run(['--requests'])).toMatch(/no carrier yet|0 request\(s\) waiting/)
  })

  it('refuses two readers of one stdin and a field given twice', () => {
    expect(run(['--request', 'x', '--spec-file', '-', '--why-file', '-'], true, {}, 'a\n')).toMatch(/both read stdin/)
    expect(run(['--request', 'x', '--stdin', '--spec-file', join(dir, 'spec.md')], true, {}, '--- spec ---\na\n')).toMatch(/given both/)
  })
})
