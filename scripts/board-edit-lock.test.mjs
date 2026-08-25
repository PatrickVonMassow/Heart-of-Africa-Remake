import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { withBoardEditLock } from './board-edit-lock.mjs'

const dirs = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const tempPaths = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-board-edit-lock-'))
  dirs.push(dir)
  return { dir, lockPath: join(dir, 'board.lock'), dataPath: join(dir, 'board.json') }
}

const runChild = (source, ...args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source, ...args], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`child exited ${code}: ${stderr}`)))
})

describe('withBoardEditLock', () => {
  it('serializes two real processes across the whole read-modify-write', async () => {
    const { lockPath, dataPath } = tempPaths()
    writeFileSync(dataPath, JSON.stringify({ edits: [] }))
    const worker = `
      import { readFileSync, writeFileSync } from 'node:fs'
      import { withBoardEditLock } from './scripts/board-edit-lock.mjs'
      import { sleepSync } from './scripts/atomic-write.mjs'
      const [lockPath, dataPath, name] = process.argv.slice(1)
      withBoardEditLock(() => {
        const board = JSON.parse(readFileSync(dataPath, 'utf8'))
        sleepSync(150)
        board.edits.push(name)
        writeFileSync(dataPath, JSON.stringify(board))
      }, { lockPath, waitMs: 5000, pollMs: 10 })
    `

    await Promise.all([
      runChild(worker, lockPath, dataPath, 'launcher'),
      runChild(worker, lockPath, dataPath, 'owner'),
    ])

    expect(JSON.parse(readFileSync(dataPath, 'utf8')).edits.sort()).toEqual(['launcher', 'owner'])
    expect(existsSync(lockPath)).toBe(false)
  })

  it('reaps a settled lock whose owning process died before releasing it', async () => {
    const { lockPath } = tempPaths()
    const crash = `
      import { withBoardEditLock } from './scripts/board-edit-lock.mjs'
      const [lockPath] = process.argv.slice(1)
      withBoardEditLock(() => process.exit(0), { lockPath })
    `
    await runChild(crash, lockPath)
    expect(existsSync(lockPath)).toBe(true)
    // The shared singleton deliberately gives every brand-new record a short
    // settle window before trusting a failed pid probe. Age this dead record past
    // that window; an unattended launcher retry naturally reaches the same state.
    const dead = JSON.parse(readFileSync(lockPath, 'utf8'))
    dead.claimedAt -= 6 * 60 * 1000
    dead.acquiredAt -= 6 * 60 * 1000
    writeFileSync(lockPath, JSON.stringify(dead))

    let ran = false
    withBoardEditLock(() => { ran = true }, { lockPath, waitMs: 5000, pollMs: 10 })
    expect(ran).toBe(true)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('times out without running the edit when another live owner keeps the lock', () => {
    let clock = 1000
    let ran = false
    expect(() => withBoardEditLock(() => { ran = true }, {
      ownerId: 'contender',
      now: () => clock,
      waitMs: 30,
      pollMs: 10,
      sleep: (ms) => { clock += ms },
      acquireFn: () => 'held',
      releaseFn: () => { throw new Error('must not release a lock it never acquired') },
      pidStartedAt: 1,
    })).toThrow(/no board update was attempted/)
    expect(ran).toBe(false)
  })

  it('declares the transaction so the session idle rule cannot reap a live long publish', () => {
    let acquisition
    withBoardEditLock(() => {}, {
      ownerId: 'writer',
      acquireFn: (_owner, opts) => { acquisition = opts; return 'acquired' },
      releaseFn: () => true,
      pidStartedAt: 1,
    })
    expect(acquisition.work).toEqual({ declared: true })
    expect(acquisition.leaseMs).toBeGreaterThan(60 * 60 * 1000)
  })
})

describe('board.mjs lock wiring', () => {
  it('puts every edit transaction behind the cross-process mutex', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts', 'board.mjs'), 'utf8')
    expect(source).toContain("import { withBoardEditLock } from './board-edit-lock.mjs'")
    expect(source).toMatch(/function edit\(fn, done\) \{\s*return withBoardEditLock\(\(\) => applyEdit\(fn, done\)\)\s*\}/)
  })
})
