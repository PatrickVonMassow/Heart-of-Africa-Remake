// The CLI half of the typed user gate, exercised as a PROCESS. The pure rules
// live in scripts/user-gate-core.test.mjs; what only a real argv can show is
// how the flags are read — and one of those readings fabricated a field
// (fifth cross-vendor round, GPT-5.6 Sol, 23.08.2026).
//
// HOA_REPO_ROOT points every run at a throwaway work order. A directory with no
// `.git` is not a linked worktree, so the main-only refusal correctly stands
// down, and with no `.claude/ntfy-topic` the alert is a silent no-op.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const CLI = resolve(process.cwd(), 'scripts', 'defer-for-user.mjs')
let root = ''

const run = (...args) => {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOA_REPO_ROOT: root, HOA_ALERT_ESCALATION: 'off' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') }
  }
}
const tasks = () => readFileSync(join(root, 'TASKS.md'), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hoa-gate-'))
  mkdirSync(join(root, '.claude'), { recursive: true })
  writeFileSync(join(root, 'TASKS.md'), '- [ ] 42. A POINT.\n- [ ] 43. ANOTHER POINT.\n')
})

describe('defer-for-user — reading the flags', () => {
  it('writes the typed marker for a selected act and two named fields', () => {
    const r = run('42', '--act', 'release-tag', '--detail', 'push the v1.2.0 tag', '--prepared', 'built locally and nothing pushed')
    expect(r.code, r.stderr).toBe(0)
    expect(tasks().split('\n')[0]).toBe(
      '- [ ] 42. A POINT. AWAITING-CONFIRMATION(' +
        new Date().toISOString().slice(0, 10) +
        '; release-tag: push the v1.2.0 tag, safe prepared state: built locally and nothing pushed)',
    )
  })

  // THE DEFECT: the value after `--detail` was the next FLAG, and it was stored.
  it('never takes the next flag as a value, and writes nothing when it tries', () => {
    const before = tasks()
    const r = run('42', '--act', 'release-tag', '--detail', '--prepared', 'built locally and nothing pushed')
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/detail must name the concrete act/)
    expect(tasks()).toBe(before)
    expect(tasks()).not.toContain('--prepared')
  })

  it('refuses a missing trailing value and an unselected act, unchanged', () => {
    const before = tasks()
    for (const args of [
      ['42', '--act', 'release-tag', '--detail', 'push the v1.2.0 tag', '--prepared'],
      ['42', '--act', '--detail', 'push the v1.2.0 tag', '--prepared', 'built locally and nothing pushed'],
      ['42', '--act', 'ship-it', '--detail', 'push the v1.2.0 tag', '--prepared', 'built locally and nothing pushed'],
      ['42'],
    ]) {
      expect(run(...args).code, args.join(' ')).toBe(1)
      expect(tasks()).toBe(before)
    }
  })

  // THE DISCRIMINATING CASE. A decision card has no word-count floor, so an
  // omitted `--decision` whose next token is the following FLAG used to be
  // recorded verbatim: a veto card, and a SELF-DECIDED marker, saying
  // "--evidence". The field must be reported missing before anything is written.
  it('refuses a self-decision whose field is the next flag, naming that field', () => {
    const before = tasks()
    const r = run(
      '--self-decide', '42',
      '--question', 'which colour should the card use',
      '--decision', '--evidence', 'the token is blue',
      '--consequence', 'the card stays consistent',
      '--veto-action', 'reply Veto and restore the green token',
    )
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/decision record needs: decision/)
    expect(r.stderr).not.toMatch(/could not be recorded/)
    expect(tasks()).toBe(before)
  })

  it('refuses a flag given twice instead of silently keeping the first', () => {
    const before = tasks()
    const r = run(
      '42', '--act', 'release-tag',
      '--detail', 'push the v1.2.0 tag', '--detail', 'push the poc tag',
      '--prepared', 'built locally and nothing pushed',
    )
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--detail is given more than once/)
    expect(tasks()).toBe(before)
  })

  it('refuses a repeated flag even when that flag is --help, and still prints the usage', () => {
    const r = run('--help', '--help')
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--help is given more than once/)
    // The answer the line asked for is still delivered — the refusal carries it.
    expect(r.stderr).toMatch(/node scripts\/defer-for-user\.mjs <point> --act/)
    expect(r.stdout).toBe('')
  })

  it('refuses the short spelling twice, and a mixed pair, under the flag they mean', () => {
    const short = run('-h', '-h')
    expect(short.code).toBe(1)
    expect(short.stderr).toMatch(/-h \(the same flag as --help\) is given more than once/)
    expect(short.stdout).toBe('')

    const mixed = run('--help', '-h')
    expect(mixed.code).toBe(1)
    expect(mixed.stderr).toMatch(/-h \(the same flag as --help\) is given more than once/)
    expect(mixed.stdout).toBe('')

    // THE REVERSE ROUTE IS ITS OWN CASE: a reading that canonicalised only the
    // SECOND spelling would pass the pair above and still let this one through.
    const reversed = run('-h', '--help')
    expect(reversed.code).toBe(1)
    expect(reversed.stderr).toMatch(/--help is given more than once/)
    expect(reversed.stdout).toBe('')
  })

  it('still answers a single -h with the usage on stdout', () => {
    const r = run('-h')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/node scripts\/defer-for-user\.mjs <point> --act/)
  })

  it('leaves an unknown dash-shaped value alone even when two fields carry the same one', () => {
    // The SAME dash-shaped value in both fields: a check that took every dash
    // for a flag would refuse this line as a repeat, so the write it performs
    // is the discriminator — not the absence of one phrase from stderr.
    const value = '-v1.2.0 tag pushed'
    const r = run('42', '--act', 'release-tag', '--detail', value, '--prepared', value)
    expect(r.stderr).not.toMatch(/given more than once/)
    expect(r.code).toBe(0)
    expect(tasks()).toContain('AWAITING-CONFIRMATION')
    expect(tasks()).toContain(value)
  })

  it('still answers a single --help on stdout', () => {
    const r = run('--help')
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/node scripts\/defer-for-user\.mjs <point> --act/)
  })

  it('reads a flag-shaped token in a value slot as a value, not as a repeated flag', () => {
    // `-h` twice — but both times where a VALUE belongs. The line is still
    // refused, and the reason must be the field it failed, never a repeat that
    // was never typed.
    const r = run('42', '--act', 'release-tag', '--detail', '-h', '--prepared', '-h')
    expect(r.stderr).not.toMatch(/given more than once/)
    expect(r.stderr).toMatch(/detail/)
    expect(tasks()).not.toContain('AWAITING-CONFIRMATION')
  })

  it('reports a gate it wrote, and clears it back to the head of the queue', () => {
    run('42', '--act', 'release-tag', '--detail', 'push the v1.2.0 tag', '--prepared', 'built locally and nothing pushed')
    expect(run('--list').stdout).toMatch(/42 awaits confirmation/)
    expect(run('--clear', '42').code).toBe(0)
    expect(tasks()).toContain('USER-ANSWERED(')
    expect(tasks()).not.toContain('AWAITING-CONFIRMATION')
  })
})
