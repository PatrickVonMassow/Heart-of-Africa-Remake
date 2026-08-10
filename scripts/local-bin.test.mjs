// The resolver behind every spawned tool, and the not-run distinction.
import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ancestors,
  binaryNames,
  describeMissing,
  didRun,
  findLocalBin,
  mainWorkingTree,
  NOT_RUN,
  pathEntries,
  requireLocalBin,
  searchRoots,
} from './local-bin.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

/** A probe over an explicit set of existing paths — no disk, no platform. */
const on = (...paths) => {
  const set = new Set(paths.map((p) => resolve(p)))
  return (p) => set.has(resolve(p))
}

describe('the search order', () => {
  it('walks UP from the checkout, nearest install first', () => {
    // Two installs above the start: the NEARER one must win, or a nested
    // package would silently run the outer project's tool version.
    const found = findLocalBin('oxlint', {
      start: '/repo/packages/app',
      mainCheckout: null,
      exists: on('/repo/node_modules/.bin/oxlint', '/repo/packages/node_modules/.bin/oxlint'),
      platform: 'linux',
      env: {},
    })
    expect(found.path).toBe(resolve('/repo/packages/node_modules/.bin/oxlint'))
    expect(found.from).toBe('node_modules')
  })

  it('reaches the MAIN working tree for a worktree that lives OUTSIDE it', () => {
    // THE CASE THE OLD SPELLING COULD NOT SERVE. A worktree elsewhere on disk
    // shares only `<main>/.git`, so no ancestor of it holds node_modules — git
    // is the only thing that knows where the dependencies are.
    const found = findLocalBin('oxlint', {
      start: '/tmp/wt-573',
      mainCheckout: '/repo',
      exists: on('/repo/node_modules/.bin/oxlint'),
      platform: 'linux',
      env: {},
    })
    expect(found.path).toBe(resolve('/repo/node_modules/.bin/oxlint'))
    expect(found.tried).toContain(resolve('/tmp/wt-573/node_modules/.bin'))
  })

  it('prefers the checkout\'s OWN install over the main tree\'s', () => {
    // A branch that changed the lockfile installs for real; that tree must win.
    const found = findLocalBin('oxlint', {
      start: '/tmp/wt',
      mainCheckout: '/repo',
      exists: on('/tmp/wt/node_modules/.bin/oxlint', '/repo/node_modules/.bin/oxlint'),
      platform: 'linux',
      env: {},
    })
    expect(found.path).toBe(resolve('/tmp/wt/node_modules/.bin/oxlint'))
  })

  it('falls back to PATH — a globally installed runner is a real way to have it', () => {
    const found = findLocalBin('oxlint', {
      start: '/tmp/wt',
      mainCheckout: null,
      exists: on('/usr/local/bin/oxlint'),
      platform: 'linux',
      env: { PATH: `/nowhere:/usr/local/bin` },
    })
    expect(found.path).toBe(resolve('/usr/local/bin/oxlint'))
    expect(found.from).toBe('PATH')
  })

  it('looks for the .cmd wrapper first on Windows, and for the bare name elsewhere', () => {
    expect(binaryNames('oxlint', 'win32')[0]).toBe('oxlint.cmd')
    expect(binaryNames('oxlint', 'linux')).toEqual(['oxlint'])
    const found = findLocalBin('oxlint', {
      start: 'C:/repo',
      mainCheckout: null,
      exists: on('C:/repo/node_modules/.bin/oxlint.cmd'),
      platform: 'win32',
      env: {},
    })
    expect(found.path).toContain('oxlint.cmd')
  })

  it('lists ancestors nearest first and terminates at the root', () => {
    const list = ancestors('/a/b/c')
    expect(list[0]).toBe(resolve('/a/b/c'))
    expect(list.at(-1)).toBe(resolve('/'))
    expect(new Set(list).size).toBe(list.length)
  })

  it('never searches one directory twice when the worktree is INSIDE the main tree', () => {
    // The layout this repository actually uses (.claude/worktrees/<agent>), so
    // the two ancestor chains overlap completely.
    const roots = searchRoots({ start: '/repo/.claude/worktrees/agent-1', mainCheckout: '/repo' })
    expect(new Set(roots).size).toBe(roots.length)
    expect(roots).toContain(resolve('/repo'))
  })

  it('reads an empty or absent PATH as no entries rather than one empty one', () => {
    expect(pathEntries({})).toEqual([])
    expect(pathEntries({ PATH: '' })).toEqual([])
  })
})

describe('finding nothing', () => {
  const nowhere = { start: '/tmp/wt', mainCheckout: null, exists: () => false, platform: 'linux', env: { PATH: '/usr/bin' } }

  it('answers null rather than a path that does not exist', () => {
    expect(findLocalBin('oxlint', nowhere)).toBe(null)
  })

  it('REPORTS the tool, the repair and every directory it looked in', () => {
    const found = findLocalBin('oxlint', { ...nowhere, exists: () => false })
    expect(found).toBe(null)
    const text = describeMissing('oxlint', ['/tmp/wt/node_modules/.bin', '/usr/bin'])
    expect(text).toContain('oxlint')
    expect(text).toContain('/tmp/wt/node_modules/.bin')
    expect(text).toContain('/usr/bin')
    expect(text).toContain('worktree-bootstrap.mjs')
  })

  it('throws with that same message where a caller cannot continue', () => {
    expect(() => requireLocalBin('nope-not-a-tool', nowhere)).toThrow(/could not be found/)
  })
})

describe('did the process actually RUN', () => {
  it('says NO for a spawn that never started, however it failed', () => {
    // Every one of these produces a non-zero (or null) status, which is exactly
    // what a real rejection produces. That collision is the whole point.
    expect(didRun({ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), status: null })).toBe(false)
    expect(didRun({ error: new Error('EACCES'), status: 1, stderr: 'permission denied' })).toBe(false)
    expect(didRun({ status: null, signal: 'SIGKILL', stdout: 'partial' })).toBe(false)
    expect(didRun(null)).toBe(false)
    expect(didRun(undefined)).toBe(false)
  })

  it('says YES for a tool that ran and refused — output is the evidence', () => {
    expect(didRun({ status: 1, stderr: 'x.mjs:1:1: error eslint(no-undef)' })).toBe(true)
  })

  it('says YES for a tool that ran and accepted, even in silence', () => {
    // oxlint prints NOTHING for a clean file. A silent exit 0 is a run.
    expect(didRun({ status: 0, stdout: '' })).toBe(true)
  })

  it('says NO for a non-zero exit with NO output at all — nothing proves it ran', () => {
    expect(didRun({ status: 1, stdout: '', stderr: '' })).toBe(false)
  })

  it('says NO when the output does not look like the tool that was asked for', () => {
    // The shell's own complaint. Non-zero, and it has output — the two things a
    // naive check would accept as "it rejected".
    const shell = { status: 127, stderr: 'sh: 1: oxlint: not found' }
    expect(didRun(shell)).toBe(true) // no shape demanded: any output counts
    // The shape must describe the tool's OUTPUT, never its NAME — the shell
    // names the tool too, in the very message that says it never ran.
    expect(didRun(shell, { expect: /eslint\(|Found \d+/ })).toBe(false)
    expect(didRun({ status: 1, stderr: 'x:1:1: error eslint(no-undef)' }, { expect: /eslint\(/ })).toBe(true)
  })

  it('words a not-run the same way everywhere, and never as a verdict', () => {
    const text = NOT_RUN('linter', { status: 1, error: new Error('spawn ENOENT'), stderr: '' })
    expect(text).toContain('DID NOT RUN')
    expect(text).toContain('not a rejection')
    expect(text).toContain('false green')
    expect(text).toContain('ENOENT')
  })
})

describe('against this repository, on the real disk', () => {
  it('finds oxlint from THIS checkout — worktree or main tree, the gate must resolve it', () => {
    // The point-573 proof in one line: this suite runs in a git worktree, whose
    // own directory holds no node_modules unless something put it there.
    const found = findLocalBin('oxlint')
    expect(found, describeMissing('oxlint', findLocalBin('oxlint', { exists: () => false })?.tried ?? [])).not.toBe(null)
    expect(existsSync(found.path)).toBe(true)
  })

  it('finds it from a NESTED directory too — resolution may not depend on the cwd', () => {
    const found = findLocalBin('oxlint', { start: join(REPO_ROOT, 'scripts', 'verify') })
    expect(found).not.toBe(null)
  })

  it('finds it from a temp directory OUTSIDE any checkout only via PATH or not at all', () => {
    // The honest negative: nothing above /tmp holds this project's tools, so
    // the resolver must not invent one. (A globally installed oxlint would be
    // found on PATH, which is legitimate — hence the two accepted outcomes.)
    const dir = mkdtempSync(join(tmpdir(), 'hoa-localbin-'))
    try {
      const found = findLocalBin('oxlint', { start: dir, mainCheckout: null })
      if (found !== null) expect(found.from).toBe('PATH')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('derives the main working tree from git, and that tree holds this repository', () => {
    const main = mainWorkingTree(REPO_ROOT)
    expect(main).not.toBe(null)
    expect(existsSync(join(main, 'package.json'))).toBe(true)
  })

  it('resolves a binary that only the MAIN tree has, from a worktree-shaped path', () => {
    // A donor tree with the tool, and a borrower with nothing of its own: the
    // exact shape of a fresh worktree before the bootstrap ran.
    const base = mkdtempSync(join(tmpdir(), 'hoa-donor-'))
    try {
      mkdirSync(join(base, 'main', 'node_modules', '.bin'), { recursive: true })
      mkdirSync(join(base, 'wt'), { recursive: true })
      writeFileSync(join(base, 'main', 'node_modules', '.bin', 'hoa-probe'), '#!/bin/sh\n')
      const found = findLocalBin('hoa-probe', { start: join(base, 'wt'), mainCheckout: join(base, 'main') })
      expect(found.path).toBe(join(base, 'main', 'node_modules', '.bin', 'hoa-probe'))
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('produces a binary that really executes — a path is not a proof', () => {
    const oxlint = requireLocalBin('oxlint')
    const out = execFileSync(oxlint, ['--version'], { encoding: 'utf8', windowsHide: true })
    expect(out).toMatch(/\d+\.\d+/)
  })
})

// THE FALSE GREEN ITSELF, reproduced against a REAL spawn (point 573 b). This is
// the case that must exist: a helper pointed at a deliberately absent binary
// fails as "it did not run", where the check this project actually shipped
// counted the same exit code as "it ran and rejected".
describe('a spawn that never started', () => {
  const absent = () =>
    spawnSync(join(tmpdir(), 'hoa-no-such-binary-573'), ['--anything'], { encoding: 'utf8', windowsHide: true })

  it('passes the old assertion and fails the new one — the defect and its catch, side by side', () => {
    const r = absent()
    // What the shipped check asked. It PASSES. Nothing ran. That is the bug.
    expect(r.status ?? 1).not.toBe(0)
    // What it must ask instead.
    expect(didRun(r)).toBe(false)
    expect(NOT_RUN('linter', r)).toContain('DID NOT RUN')
  })

  it('is still caught when a shell answers for it — non-zero AND talkative', () => {
    // `sh -c` turns the missing binary into exit 127 with a message, so the
    // "there was output, so it ran" shortcut fails here and the SHAPE decides.
    const r = spawnSync('sh', ['-c', 'hoa-no-such-binary-573 --anything'], { encoding: 'utf8', windowsHide: true })
    if (r.error) return // no POSIX shell (Windows) — the case above already covers it
    expect(r.status).not.toBe(0)
    expect(didRun(r, { expect: /:\d+:\d+: (error|warning) |Found \d+ (warning|error)/ })).toBe(false)
  })

  it('lets a REAL rejection through, or the distinction would just be a blanket refusal', () => {
    // The other half: oxlint over a file that genuinely violates the armed rule
    // must read as ran-and-rejected. A check that says "did not run" to
    // everything would be as useless as the one it replaces.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-realreject-'))
    try {
      mkdirSync(join(dir, 'scripts', 'verify'), { recursive: true })
      writeFileSync(join(dir, '.oxlintrc.json'), readFileSync(join(REPO_ROOT, '.oxlintrc.json'), 'utf8'))
      writeFileSync(join(dir, 'scripts', 'verify', 'bad.mjs'), 'export const f = () => neverDeclared()\n')
      const r = spawnSync(requireLocalBin('oxlint'), ['scripts/verify/bad.mjs'], {
        cwd: dir,
        encoding: 'utf8',
        windowsHide: true,
      })
      expect(didRun({ ...r, out: `${r.stdout}${r.stderr}` }, { expect: /:\d+:\d+: (error|warning) / })).toBe(true)
      expect(r.status).not.toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
