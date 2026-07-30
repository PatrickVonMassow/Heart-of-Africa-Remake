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
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { REPO_ROOT } from './repo-paths.mjs'

const SPEC = ['FINAL STATE: der Träger bekommt eine zweite Art.', '', '  - [ ] eine Zeile, die wie ein Kopf aussieht', 'Ende.'].join('\n')

let dir
const run = (args, expectFail = false) => {
  try {
    return execFileSync(process.execPath, ['scripts/finding.mjs', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, FINDINGS_MEMORY_DIR: dir },
    })
  } catch (e) {
    if (!expectFail) throw new Error(`finding.mjs ${args.join(' ')} failed: ${e.stderr || e.message}`)
    return String(e.stderr ?? '')
  }
}

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

  it('routes a deposit with open questions to a decision card, not to the queue', () => {
    writeFileSync(join(dir, 'q.md'), 'Soll das auch für die Doku gelten?\n', 'utf8')
    expect(deposit('Mit offener Frage', ['--open-questions-file', join(dir, 'q.md')])).toMatch(/OPEN QUESTIONS/)
    expect(run(['--requests'])).toContain('DECISION CARD')
  })

  it('names what a half-written deposit does not say instead of refusing it', () => {
    const out = run(['--request', 'Ohne Begründung', '--spec-file', join(dir, 'spec.md'), '--session', 's'])
    expect(out).toMatch(/WARNING: no observed problem/)
    expect(out).toMatch(/WARNING: no user quotes/)
    expect(run(['--requests'])).toMatch(/1 request\(s\) waiting/)
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
