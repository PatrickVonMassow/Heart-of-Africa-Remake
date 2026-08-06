// THE GATE FOR POINT 401: no child-process call under scripts/ may open a console
// window. The user's report was "es poppen immer wieder Konsolenfenster auf, die mir
// den Fokus stehlen", and the cause was 23 script files calling git without
// `windowsHide: true` — every member of the Stop chain among them, which runs at every
// turn end.
//
// The sweep over the REAL tree is the point of this file: the fix is mechanical, so
// only a gate keeps it. The unit cases above it prove the audit itself, because an
// audit that cannot read prose apart from code is the trap the first attempt fell
// into (it rewrote a sentence containing the words "rogue spawn (it created it…)").
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  CHILD_PROCESS_APIS,
  SCANNED_EXTENSIONS,
  ALLOW,
  maskCode,
  isScannedScriptFile,
  findChildProcessCalls,
  auditWindowHide,
  formatWindowHideVerdict,
} from './window-hide-core.mjs'

describe('maskCode — prose that mentions an API must be invisible', () => {
  it('blanks line comments, block comments and string bodies, keeping the lines', () => {
    const src = ['// we spawn(x) here', '/* execSync(y) */', 'const s = "spawnSync(z)"', 'spawnSync(real)'].join('\n')
    const masked = maskCode(src)
    expect(masked.split('\n')).toHaveLength(4)
    expect(masked).not.toContain('spawn(x)')
    expect(masked).not.toContain('execSync(y)')
    expect(masked).not.toContain('spawnSync(z)')
    expect(masked).toContain('spawnSync(real)')
  })

  it('survives an escaped quote, a template and an unterminated comment', () => {
    expect(maskCode("const a = 'it\\'s execSync(x) here'")).not.toContain('execSync(x)')
    expect(maskCode('const a = `spawn(${x})`')).not.toContain('spawn($')
    expect(() => maskCode('/* never closed')).not.toThrow()
    expect(maskCode('')).toBe('')
    expect(maskCode()).toBe('')
  })

  it('a quote inside a regex literal does not flip the string parity', () => {
    // `s.replace(/'/g, '')` is an ordinary line; the naive masker read its quote as a
    // string start and SILENTLY blanked every call in the rest of the file.
    const src = ["const clean = s.replace(/'/g, '')", 'execSync(cmd, { cwd })'].join('\n')
    expect(maskCode(src)).toContain('execSync(cmd')
  })

  it('a regex literal body is blanked, so `/fork(s)?/` is prose, not a call', () => {
    expect(maskCode('const re = /fork(s)?/')).not.toContain('fork(')
    // …while a genuine division does not swallow the rest of its line.
    expect(maskCode('const half = a / b; execSync(cmd)')).toContain('execSync(cmd)')
  })

  it('the CODE inside a template interpolation stays visible', () => {
    const masked = maskCode('console.log(`head: ${execSync(cmd)}` )')
    expect(masked).toContain('execSync(cmd)')
    expect(masked).not.toContain('head:')
    // Nested: a template inside the interpolation is text again.
    const nested = maskCode('const a = `x ${spawnSync(c, `spawn(inner)`)} y`')
    expect(nested).toContain('spawnSync(c')
    expect(nested).not.toContain('spawn(inner)')
  })
})

describe('findChildProcessCalls — the call sites, and nothing else', () => {
  it('finds a call and reads its flag', () => {
    const src = 'execFileSync("git", a, { cwd, windowsHide: true })\nspawnSync("git", b, { cwd })\n'
    expect(findChildProcessCalls(src)).toMatchObject([
      { api: 'execFileSync', line: 1, hasFlag: true },
      { api: 'spawnSync', line: 2, hasFlag: false },
    ])
  })

  it('carries the call\'s own argument text, so an exception need not pin a LINE', () => {
    // A line number survives no merge: the one exception in ALLOW moved from 741 to
    // 736 the first time another session's commit landed beside this point.
    const [call] = findChildProcessCalls('spawn(exe, args, buildSpawnOptions({ cwd }))')
    expect(call.args).toContain('buildSpawnOptions')
  })

  it('is not fooled by regex.exec or a longer identifier', () => {
    const src = 'const m = RE.exec(line)\nconst n = myExecSync(cmd)\nconst o = re.exec(x)\nconst p = /a/.exec(s)\n'
    expect(findChildProcessCalls(src)).toEqual([])
  })

  it('SEES THE NAMESPACED FORM — `cp.spawnSync(…)` is the same call and the same window', () => {
    // The first version excluded every member access to keep `RE.exec(line)` out, which
    // also excluded the namespace import. A `child_process.execSync(…)` added tomorrow
    // would have passed the gate and brought the flashes straight back.
    const src = [
      'cp.spawnSync("git", a, { cwd })',
      'child_process.execSync(c)',
      'childProcess.execFileSync(e, f, { windowsHide: true })',
      'cp.exec(cmd)',
    ].join('\n')
    expect(findChildProcessCalls(src)).toMatchObject([
      { api: 'spawnSync', line: 1, hasFlag: false },
      { api: 'execSync', line: 2, hasFlag: false },
      { api: 'execFileSync', line: 3, hasFlag: true },
      { api: 'exec', line: 4, hasFlag: false },
    ])
  })

  it('counts a namespaced call ONCE, not once per pattern', () => {
    expect(findChildProcessCalls('cp.exec(cmd)')).toHaveLength(1)
  })

  it('sees `fork(…)`, which spawns a Node child and so a console with it', () => {
    expect(findChildProcessCalls('fork(mod, args)')).toMatchObject([{ api: 'fork', line: 1, hasFlag: false }])
    expect(findChildProcessCalls('fork(mod, args, { windowsHide: true })')[0].hasFlag).toBe(true)
  })

  it('accepts the flag however it arrives — a spread is a legitimate way to set it', () => {
    expect(findChildProcessCalls('execSync(c, { ...opts, windowsHide: true })')[0].hasFlag).toBe(true)
    expect(findChildProcessCalls('spawn(e, a, buildOptions({ windowsHide: true }))')[0].hasFlag).toBe(true)
    // A variable stays within the generosity — text cannot judge it either way…
    expect(findChildProcessCalls('spawn(e, a, { windowsHide: hide })')[0].hasFlag).toBe(true)
  })

  it('…but the literal `windowsHide: false` NAMES the window it shows, and is an offender', () => {
    expect(findChildProcessCalls('spawn(e, a, { windowsHide: false })')[0].hasFlag).toBe(false)
    expect(findChildProcessCalls('execSync(c, { windowsHide:false, cwd })')[0].hasFlag).toBe(false)
  })

  it('sees a call written inside a template interpolation', () => {
    expect(findChildProcessCalls('log(`head: ${execSync(cmd)}`)')).toMatchObject([
      { api: 'execSync', hasFlag: false },
    ])
    expect(findChildProcessCalls('log(`${execSync(cmd, { windowsHide: true })}`)')[0].hasFlag).toBe(true)
  })

  it('is not silenced by a preceding regex literal containing a quote', () => {
    const src = ["const clean = s.replace(/'/g, '')", 'spawnSync(cmd, a, { cwd })'].join('\n')
    expect(findChildProcessCalls(src)).toMatchObject([{ api: 'spawnSync', line: 2, hasFlag: false }])
  })

  it('reads a MULTI-LINE call as one call, flag included', () => {
    const src = ['execFileSync("git", args, {', '  windowsHide: true,', '  cwd: root,', '})'].join('\n')
    expect(findChildProcessCalls(src)).toMatchObject([{ api: 'execFileSync', line: 1, hasFlag: true }])
    expect(findChildProcessCalls(src)).toHaveLength(1)
  })

  it('a call with no options object at all is an offender, not a skip', () => {
    expect(findChildProcessCalls('execSync("git status")')).toMatchObject([
      { api: 'execSync', line: 1, hasFlag: false },
    ])
  })

  it('covers every API that can open a window', () => {
    expect(CHILD_PROCESS_APIS).toEqual([
      'execSync',
      'exec',
      'execFileSync',
      'execFile',
      'spawnSync',
      'spawn',
      'fork',
    ])
    for (const api of CHILD_PROCESS_APIS) {
      expect(findChildProcessCalls(`${api}(x)`)[0]?.api).toBe(api)
    }
  })
})

describe('isScannedScriptFile — every extension Node will run', () => {
  it('reads .cjs and the TypeScript forms too, not only .mjs/.js', () => {
    // `scripts/hooks/*.cjs` already exist. A `.mjs`/`.js`-only sweep would have let one
    // of them add an unflagged execSync without the gate noticing.
    for (const ext of SCANNED_EXTENSIONS) expect(isScannedScriptFile(`a${ext}`)).toBe(true)
    expect(SCANNED_EXTENSIONS).toContain('.cjs')
    expect(SCANNED_EXTENSIONS).toContain('.mjs')
  })

  it('ignores what Node does not run, and junk', () => {
    for (const name of ['README.md', 'run.sh', 'data.json', 'pre-commit', '']) {
      expect(isScannedScriptFile(name), name).toBe(false)
    }
    expect(isScannedScriptFile()).toBe(false)
  })
})

describe('auditWindowHide — the verdict, and its exceptions', () => {
  it('a clean tree passes', () => {
    expect(
      auditWindowHide([{ path: 'scripts/x.mjs', text: 'execSync(c, { windowsHide: true })' }]).offenders,
    ).toEqual([])
  })

  it('an unflagged call is an offender, named with its file and line', () => {
    const v = auditWindowHide([{ path: 'scripts/x.mjs', text: '\nspawnSync("git", a, { cwd })' }])
    expect(v.offenders).toEqual([{ path: 'scripts/x.mjs', api: 'spawnSync', line: 2, hasFlag: false }])
    expect(formatWindowHideVerdict(v)).toContain('scripts/x.mjs:2')
    expect(formatWindowHideVerdict(v)).toContain('windowsHide')
  })

  it('a DOCUMENTED exception is honoured — and every one carries a written reason', () => {
    for (const [path, entry] of Object.entries(ALLOW)) {
      expect(typeof entry.why, `${path} has no written reason`).toBe('string')
      expect(entry.why.length, `${path}'s reason is too thin to be read`).toBeGreaterThan(20)
    }
  })

  it('a `matching` exception covers only the call it describes', () => {
    const path = 'scripts/batch-autostart.mjs'
    const needle = ALLOW[path].matching
    const text = `spawn(e, a, ${needle}({ cwd }))\nspawn(e, a, somethingElse({ cwd }))`
    const v = auditWindowHide([{ path, text }])
    expect(v.offenders.map((o) => o.line)).toEqual([2])
  })

  it('an unscoped exception covers the whole file — what an `awaiting` debt needs', () => {
    // Pinned against an INJECTED map, not against a live debt: this rule was once
    // tested by reaching into ALLOW for a real `awaiting` entry, so paying the last
    // debt turned the rule's own test red. The rule outlives the debts it was for.
    const allow = { 'scripts/held.mjs': { awaiting: 'bundle X', why: 'held by another agent while 401 landed' } }
    const v = auditWindowHide([{ path: 'scripts/held.mjs', text: 'execSync(a)\nspawnSync(b, c, { cwd })' }], { allow })
    expect(v.offenders).toEqual([])
    expect(v.unusedAllow).toEqual([])
  })

  it('every exception in the REAL map is scoped — no debt is outstanding any more', () => {
    for (const [path, entry] of Object.entries(ALLOW)) {
      expect(entry.awaiting, `${path} still carries an unpaid debt`).toBeUndefined()
      expect(typeof entry.matching, `${path} is unscoped, so it covers the whole file`).toBe('string')
    }
  })

  it('AN EXCEPTION THAT NO LONGER APPLIES IS ITSELF A FAILURE', () => {
    // Otherwise the `awaiting: Chat & Tafel` debts would sit here forever, unpaid and
    // unnoticed — which is the failure mode a written exception is supposed to fix.
    const v = auditWindowHide([{ path: 'scripts/x.mjs', text: 'execSync(c, { windowsHide: true })' }])
    expect(v.ok).toBe(false)
    expect(v.unusedAllow).toEqual(Object.keys(ALLOW))
    expect(formatWindowHideVerdict(v)).toContain('no longer apply')
  })

  it('survives junk input', () => {
    expect(auditWindowHide().offenders).toEqual([])
    expect(auditWindowHide([null, {}, { path: '' }]).offenders).toEqual([])
    expect(formatWindowHideVerdict()).toBe('')
  })
})

// ---------------------------------------------------------------------------
describe('THE REAL TREE: no window flashes at a turn end', () => {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) {
        if (entry !== 'node_modules') walk(p)
      } else if (isScannedScriptFile(entry)) {
        files.push({ path: relative(REPO_ROOT, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') })
      }
    }
  }
  walk(join(REPO_ROOT, 'scripts'))

  it('scans a real tree at all — a gate over nothing would pass forever', () => {
    expect(files.length).toBeGreaterThan(100)
    const calls = files.flatMap((f) => findChildProcessCalls(f.text))
    expect(calls.length, 'no child-process call found — the audit is broken, not the tree').toBeGreaterThan(50)
    expect(calls.filter((c) => c.hasFlag).length).toBeGreaterThan(50)
  })

  it('every child-process call under scripts/ sets windowsHide, or is a documented exception', () => {
    const v = auditWindowHide(files)
    expect(v.offenders, formatWindowHideVerdict(v)).toEqual([])
  })

  it('and no documented exception has gone stale', () => {
    const v = auditWindowHide(files)
    expect(v.unusedAllow, formatWindowHideVerdict(v)).toEqual([])
  })

  it('NEGATIVE CONTROL: strip the flag from the real tree and the gate goes red', () => {
    // A green sweep proves nothing on its own — a sweep that cannot fail is decoration.
    // Measured against the actual pre-401 tree the same audit reported 79 offenders;
    // this reproduces that failure from the CURRENT files, so the control cannot rot
    // the way a recorded number does.
    const stripped = files.map((f) => ({ ...f, text: f.text.replace(/windowsHide:\s*true,?/g, '') }))
    const v = auditWindowHide(stripped)
    expect(v.offenders.length).toBeGreaterThan(50)
    expect(formatWindowHideVerdict(v)).toContain('windowsHide')
  })
})
