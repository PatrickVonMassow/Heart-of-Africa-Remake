import { afterEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  expect(result.status, result.stderr).toBe(0)
}

function fixture({ stageWrapper }) {
  const root = mkdtempSync(join(tmpdir(), 'guard-registration-hook-'))
  roots.push(root)
  const scripts = join(root, 'scripts')
  const bin = join(root, 'bin')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(bin)

  const calls = join(root, 'node-calls.txt')
  const fakeNode = join(bin, 'node')
  writeFileSync(fakeNode, '#!/bin/sh\nprintf "%s\\n" "$1" >> "$NODE_CALLS"\n', 'utf8')
  chmodSync(fakeNode, 0o755)

  git(root, 'init', '-q')
  if (stageWrapper) {
    const wrapper = join(scripts, 'guard-registration-guard.mjs')
    writeFileSync(wrapper, '// staged wrapper\n', 'utf8')
    git(root, 'add', 'scripts/guard-registration-guard.mjs')
    rmSync(wrapper)
  }

  const hook = resolve(process.cwd(), 'scripts/git-hooks/pre-commit')
  const result = spawnSync(hook, [], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_CALLS: calls, PATH: `${bin}:${process.env.PATH}` },
    windowsHide: true,
  })
  const invoked = readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean)
  return { invoked, result }
}

describe('the pre-commit registration hook', () => {
  it('judges an indexed wrapper even when it is deleted from the working tree', () => {
    const { invoked, result } = fixture({ stageWrapper: true })
    expect(result.status, result.stderr).toBe(0)
    expect(invoked).toEqual([
      'scripts/commit-scope-guard.mjs',
      'scripts/guard-registration-guard.mjs',
    ])
  })

  it('stands down when the wrapper is absent from the index', () => {
    const { invoked, result } = fixture({ stageWrapper: false })
    expect(result.status, result.stderr).toBe(0)
    expect(invoked).toEqual(['scripts/commit-scope-guard.mjs'])
  })
})
