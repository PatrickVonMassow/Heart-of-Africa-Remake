import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const moduleUrl = pathToFileURL(resolve('scripts/author-astra.mjs')).href
const dirs = []
const processes = new Set()
const waitFor = (check) => vi.waitFor(check, { timeout: 10_000, interval: 20 })

function fixture({ lane = 'astra', override = false, detached = false, shell = false, exitCode = 0 } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'hoa-author-session-'))
  dirs.push(cwd)
  const script = join(cwd, 'commission.mjs')
  const log = join(cwd, override ? 'custom log/output.log' : `local/1133-${lane}-author.log`)
  const release = join(cwd, 'release')
  const ready = join(cwd, 'ready.json')
  writeFileSync(script, `
    import { startAuthoringSession } from ${JSON.stringify(moduleUrl)}
    import { existsSync, writeFileSync } from 'node:fs'
    import { spawnSync } from 'node:child_process'
    const code = await startAuthoringSession({ point: '1133', lane: ${JSON.stringify(lane)},
      logPath: ${JSON.stringify(override ? log : '')} })
    if (code !== null) process.exitCode = code
    else {
      const identity = { pid: process.pid, cwd: process.cwd(), argv: process.argv.slice(2),
        sid: Number(spawnSync('ps', ['-o', 'sid=', '-p', String(process.pid)], { encoding: 'utf8', windowsHide: true }).stdout) }
      writeFileSync(${JSON.stringify(ready)}, JSON.stringify(identity))
      console.log('ready: stdout')
      console.error('ready: stderr')
      const timer = setInterval(() => {
        if (!existsSync(${JSON.stringify(release)})) return
        clearInterval(timer)
        process.stdout.write('é'.repeat(100_000) + '\\nDONE\\n')
        process.exitCode = ${exitCode}
      }, 20)
    }
  `)
  const args = [script, '--findings', 'a file with spaces.md', '--timeout', '1234']
  const command = shell ? 'bash' : process.execPath
  const commandArgs = shell ? ['-c', '"$@" & wait', 'caller', process.execPath, ...args] : args
  const child = spawn(command, commandArgs, { cwd, windowsHide: true, detached: detached || shell, stdio: ['ignore', 'pipe', 'pipe'] })
  processes.add(child.pid)
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (data) => { stdout += data })
  child.stderr.setEncoding('utf8').on('data', (data) => { stderr += data })
  const closed = new Promise((done, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => done({ code, signal }))
  })
  return { cwd, log, release, ready, args, child, closed, stdout: () => stdout, stderr: () => stderr }
}

async function running(run) {
  await waitFor(() => expect(existsSync(run.ready)).toBe(true))
  const identity = JSON.parse(readFileSync(run.ready, 'utf8'))
  processes.add(identity.pid)
  await waitFor(() => expect(run.stdout()).toContain('ready: stderr\n'))
  expect(identity.sid).toBe(identity.pid)
  expect(identity.cwd).toBe(run.cwd)
  expect(identity.argv).toEqual(run.args.slice(1))
  return identity
}

afterEach(async () => {
  for (const pid of processes) {
    try { process.kill(-pid, 'SIGKILL') } catch { /* not a group leader, or already gone */ }
    try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  }
  processes.clear()
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('authoring session and log ownership', () => {
  it.each([0, 7])('waits, streams both outputs once and propagates exit %i', async (exitCode) => {
    const run = fixture({ exitCode })
    const identity = await running(run)
    expect(identity.pid).not.toBe(run.child.pid)
    expect(run.child.exitCode).toBe(null)
    expect(run.stdout().split('\n')[0]).toBe(`author-astra: log ${run.log} (append)`)
    writeFileSync(run.release, '')
    expect(await run.closed).toEqual({ code: exitCode, signal: null })
    expect(run.stderr()).toBe('')
    expect(run.stdout()).toBe(readFileSync(run.log, 'utf8'))
    expect(run.stdout().match(/ready: stdout/g)).toHaveLength(1)
    expect(run.stdout()).toContain('é'.repeat(100_000) + '\nDONE\n')
  })

  it('keeps the commissioned process writing after the caller session is killed', async () => {
    const run = fixture({ shell: true })
    await running(run)
    process.kill(-run.child.pid, 'SIGKILL')
    expect((await run.closed).signal).toBe('SIGKILL')
    writeFileSync(run.release, '')
    await waitFor(() => expect(readFileSync(run.log, 'utf8')).toContain('\nDONE\n'))
    expect(run.stdout()).not.toContain('\nDONE\n')
  })

  it('retains an existing session leader and supports the Fable log override', async () => {
    const run = fixture({ detached: true, lane: 'fable', override: true })
    const identity = await running(run)
    expect(identity.pid).toBe(run.child.pid)
    expect(run.stdout().split('\n')[0]).toBe(`author-fable: log ${run.log} (append)`)
    writeFileSync(run.release, '')
    expect((await run.closed).code).toBe(0)
    expect(run.stdout()).toBe(readFileSync(run.log, 'utf8'))
  })

  it('keeps an existing session leader logging when its stdout reader disappears', async () => {
    const run = fixture({ detached: true })
    await running(run)
    run.child.stdout.destroy()
    writeFileSync(run.release, '')
    expect((await run.closed).code).toBe(0)
    expect(readFileSync(run.log, 'utf8')).toContain('é'.repeat(100_000) + '\nDONE\n')
  })

  it('returns the conventional signal exit code after the commissioned child is terminated', async () => {
    const run = fixture()
    const identity = await running(run)
    process.kill(identity.pid, 'SIGTERM')
    expect(await run.closed).toEqual({ code: 143, signal: null })
    expect(run.stdout()).toBe(readFileSync(run.log, 'utf8'))
  })

  it('appends a second invocation without replaying the first invocation', async () => {
    const run = fixture({ lane: 'fable' })
    await running(run)
    writeFileSync(run.release, '')
    expect((await run.closed).code).toBe(0)
    const before = readFileSync(run.log, 'utf8')
    const second = spawnSync(process.execPath, run.args, { cwd: run.cwd, encoding: 'utf8', windowsHide: true })
    expect(second.status, second.stderr).toBe(0)
    expect(second.stdout).toBe(before)
    expect(readFileSync(run.log, 'utf8')).toBe(before + second.stdout)
  })

  it('validates --log and documents the unsupported same-path tee without creating logs for help', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hoa-author-help-'))
    dirs.push(cwd)
    const script = resolve('scripts/author-astra.mjs')
    const help = spawnSync(process.execPath, [script, '--help'], { cwd, encoding: 'utf8', windowsHide: true })
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('[--log <path>]')
    expect(help.stdout).toContain('SAME log path destroys it')
    expect(existsSync(join(cwd, 'local'))).toBe(false)
    const missing = spawnSync(process.execPath, [script, '--point', '1133', '--log'], { cwd, encoding: 'utf8', windowsHide: true })
    expect(missing.status).toBe(2)
    expect(missing.stderr).toContain('--log needs a path')
  })

  it.each(['astra', 'fable'])('uses log ownership in the real %s CLI before refusing an invalid worktree', (lane) => {
    const cwd = mkdtempSync(join(tmpdir(), 'hoa-author-cli-log-'))
    dirs.push(cwd)
    const log = join(cwd, 'chosen log.txt')
    writeFileSync(log, 'prior commission\n')
    const records = join(cwd, 'reviews.jsonl')
    writeFileSync(records, '')
    const result = spawnSync(process.execPath, [resolve(`scripts/author-${lane}.mjs`), '--point', '1133', '--log', log], {
      cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, HOA_REPO_ROOT: process.cwd(), AUTHOR_REVIEW_RECORDS_FILE: records },
    })
    expect(result.status, result.stderr).toBe(2)
    expect(result.stdout.split('\n')[0]).toBe(`author-${lane}: log ${log} (append)`)
    expect(result.stdout).toContain('refusing to start')
    expect(result.stderr).toBe('')
    expect(readFileSync(log, 'utf8')).toBe('prior commission\n' + result.stdout)
  })
})
