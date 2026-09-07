import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const containerDir = join(dirname(fileURLToPath(import.meta.url)), '../.devcontainer')
const entrypoint = join(containerDir, 'container-entrypoint.sh')
const places = []
afterEach(() => {
  for (const dir of places.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture({ empty = false, missingLauncher = false, writable = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-container-start-'))
  places.push(dir)
  const repo = join(dir, 'repo with spaces')
  const config = join(dir, 'devcontainer.json')
  const events = join(dir, 'events')
  const bin = join(dir, 'bin')
  mkdirSync(repo)
  mkdirSync(bin)
  writeFileSync(config, '{}')
  if (!writable) chmodSync(config, 0o444)
  if (!empty) mkdirSync(join(repo, '.git'))
  if (!empty && !missingLauncher) {
    mkdirSync(join(repo, 'scripts'))
    writeFileSync(join(repo, 'scripts/batch-launcher.mjs'), `
      import { appendFileSync } from 'node:fs'
      appendFileSync(process.env.HOA_START_EVENTS, JSON.stringify({
        event: 'launcher', cwd: process.cwd(), args: process.argv.slice(2),
      }) + '\\n')
      process.exit(Number(process.env.HOA_ARM_EXIT || 0))
    `)
  }
  // No real firewall, daemon, repository state or Docker process is touched.
  writeFileSync(join(bin, 'sudo'), [
    '#!/bin/bash',
    'echo "firewall:$*" >> "$HOA_START_EVENTS"',
    'exit "${HOA_FIREWALL_EXIT:-0}"',
  ].join('\n'), { mode: 0o755 })
  const command = join(dir, 'command.mjs')
  writeFileSync(command, `
    import { appendFileSync } from 'node:fs'
    appendFileSync(process.env.HOA_START_EVENTS, JSON.stringify({
      event: 'command', args: process.argv.slice(2),
    }) + '\\n')
    process.exit(Number(process.env.HOA_COMMAND_EXIT || 0))
  `)
  return {
    repo, config,
    run(env = {}) {
      return spawnSync('bash', ['-c', 'source "$1"; shift; container_entrypoint "$@"',
        'fixture', entrypoint, repo, config, process.execPath, command, 'one argument', '$literal'], {
        encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOA_START_EVENTS: events, ...env },
      })
    },
    events: () => existsSync(events) ? readFileSync(events, 'utf8').trim().split('\n') : [],
  }
}

describe('container startup without an editor', () => {
  it('restores the firewall, arms from the main checkout and preserves command arguments and exit status', () => {
    const place = fixture()
    const result = place.run({ HOA_COMMAND_EXIT: '37' })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(37)
    const events = place.events()
    expect(events[0]).toBe('firewall:/usr/local/bin/init-firewall.sh')
    expect(JSON.parse(events[1])).toEqual({ event: 'launcher', cwd: place.repo, args: ['--arm'] })
    expect(JSON.parse(events[2])).toEqual({ event: 'command', args: ['one argument', '$literal'] })
  })

  it('arms again on a second container start without a lifecycle hook', () => {
    const place = fixture()
    expect(place.run().status).toBe(0)
    expect(place.run().status).toBe(0)
    expect(place.events().filter((line) => line.includes('"event":"launcher"'))).toHaveLength(2)
  })

  it.each(['writable', 'missing'])('refuses a %s security overlay before starting anything', (kind) => {
    const place = fixture({ writable: kind === 'writable' })
    if (kind === 'missing') rmSync(place.config)
    const result = place.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must exist and be read-only')
    expect(place.events()).toEqual([])
  })

  it('does not arm or run the container command when firewall restoration fails', () => {
    const place = fixture()
    expect(place.run({ HOA_FIREWALL_EXIT: '23' }).status).toBe(23)
    expect(place.events()).toEqual(['firewall:/usr/local/bin/init-firewall.sh'])
  })

  it('surfaces launcher failure instead of reporting a successfully started container', () => {
    const place = fixture()
    expect(place.run({ HOA_ARM_EXIT: '1' }).status).toBe(1)
    expect(place.events()).toHaveLength(2)
  })

  it('allows an empty volume to reach postCreateCommand', () => {
    const place = fixture({ empty: true })
    const result = place.run()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('deferred to postCreateCommand')
    expect(place.events()).toHaveLength(2)
    expect(JSON.parse(place.events()[1]).event).toBe('command')
  })

  it('refuses an existing checkout with a missing launcher', () => {
    const place = fixture({ missingLauncher: true })
    const result = place.run()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('deploy the repository change first')
    expect(place.events()).toHaveLength(1)
  })
})

it('wires startup into Docker and preserves the read-only host configuration mount', () => {
  const source = readFileSync(join(containerDir, 'devcontainer.json'), 'utf8')
  const parsed = ts.parseConfigFileTextToJson('devcontainer.json', source)
  expect(parsed.error).toBeUndefined()
  const config = parsed.config
  expect(config.runArgs).toContain('--restart=unless-stopped')
  expect(config.overrideCommand).toBe(false)
  expect(config.shutdownAction).toBe('none')
  expect(config.init).toBe(true)
  expect(config.mounts).toContain('source=${localWorkspaceFolder}/.devcontainer,target=/workspace/.devcontainer,type=bind,readonly')
  expect(config.postCreateCommand).toMatch(/npm install && node scripts\/batch-launcher\.mjs --arm$/)
  expect(config.postStartCommand).toBe('node scripts/batch-launcher.mjs --arm')
  const dockerfile = readFileSync(join(containerDir, 'Dockerfile'), 'utf8')
  expect(dockerfile).toContain('COPY container-entrypoint.sh /usr/local/bin/')
  expect(dockerfile).toContain('ENTRYPOINT ["/usr/local/bin/container-entrypoint.sh"]')
  expect(dockerfile).toContain('CMD ["sleep", "infinity"]')
})
