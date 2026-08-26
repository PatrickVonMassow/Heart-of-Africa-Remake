import { describe, expect, it } from 'vitest'
import { measureWiringSources } from './guard-health-guard.mjs'

const settings = JSON.stringify({
  hooks: {
    Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node scripts/from-settings-guard.mjs' }] }],
  },
})

const configured = (path = 'hooks') => ({ status: 0, stdout: `${path}\n`, stderr: '' })

describe('guard-health wiring measurement', () => {
  it('discards partial settings bytes when JSON parsing fails', () => {
    const measured = measureWiringSources({
      readSettings: () => '{"hooks":{"Stop":[]}',
      gitConfig: () => ({ status: 1, stdout: '', stderr: '' }),
    })
    expect(measured.ok).toBe(false)
    expect(measured.why).toMatch(/Hook-Einstellungen nicht messbar/)
    expect(measured.wiringCommands).toBeUndefined()
  })

  it('distinguishes no configured hooks path from a failed Git measurement', () => {
    expect(measureWiringSources({
      readSettings: () => settings,
      gitConfig: () => ({ status: 1, stdout: '', stderr: '' }),
    })).toMatchObject({ ok: true, wiringCommands: ['node scripts/from-settings-guard.mjs'] })

    const failed = measureWiringSources({
      readSettings: () => settings,
      gitConfig: () => ({ status: 128, stdout: '', stderr: 'fatal: config unreadable' }),
    })
    expect(failed.ok).toBe(false)
    expect(failed.why).toMatch(/Git-Hook-Pfad nicht messbar/)
  })

  it('fails open when a recognized executable hook cannot be read', () => {
    const measured = measureWiringSources({
      readSettings: () => settings,
      gitConfig: configured,
      pathExists: () => true,
      readDir: () => ['pre-push'],
      hookStat: () => ({ mode: 0o755 }),
      readHook: () => { throw new Error('permission denied') },
    })
    expect(measured.ok).toBe(false)
    expect(measured.why).toMatch(/aktiver Git-Hook pre-push nicht lesbar/)
  })

  it('counts only recognized executable hooks as wiring sources', () => {
    const bodies = {
      'pre-push': 'exec node scripts/from-git-guard.mjs',
      'pre-push.sample': 'node scripts/sample-only-guard.mjs',
      'commit-msg': 'node scripts/non-executable-guard.mjs',
    }
    const measured = measureWiringSources({
      readSettings: () => settings,
      gitConfig: configured,
      pathExists: () => true,
      readDir: () => Object.keys(bodies),
      hookStat: (path) => ({ mode: path.endsWith('commit-msg') ? 0o644 : 0o755 }),
      readHook: (path) => bodies[path.split('/').pop()],
    })
    expect(measured).toMatchObject({
      ok: true,
      wiringCommands: [
        'node scripts/from-settings-guard.mjs',
        'exec node scripts/from-git-guard.mjs',
      ],
    })
  })
})
