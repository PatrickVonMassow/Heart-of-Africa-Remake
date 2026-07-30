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
  ALLOW,
  maskCode,
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
    const src = 'const m = RE.exec(line)\nconst n = myExecSync(cmd)\nconst o = re.exec(x)\n'
    expect(findChildProcessCalls(src)).toEqual([])
  })

  it('accepts the flag however it arrives — a spread is a legitimate way to set it', () => {
    expect(findChildProcessCalls('execSync(c, { ...opts, windowsHide: true })')[0].hasFlag).toBe(true)
    expect(findChildProcessCalls('spawn(e, a, buildOptions({ windowsHide: true }))')[0].hasFlag).toBe(true)
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
    expect(CHILD_PROCESS_APIS).toEqual(['execSync', 'exec', 'execFileSync', 'execFile', 'spawnSync', 'spawn'])
    for (const api of CHILD_PROCESS_APIS) {
      expect(findChildProcessCalls(`${api}(x)`)[0]?.api).toBe(api)
    }
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
    const path = Object.keys(ALLOW).find((p) => ALLOW[p].awaiting)
    const v = auditWindowHide([{ path, text: 'execSync(a)\nspawnSync(b, c, { cwd })' }])
    expect(v.offenders).toEqual([])
    expect(ALLOW[path].awaiting).toBeTruthy()
  })

  it('AN EXCEPTION THAT NO LONGER APPLIES IS ITSELF A FAILURE', () => {
    // Otherwise the `awaiting: bundle H` debts would sit here forever, unpaid and
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
      } else if (entry.endsWith('.mjs') || entry.endsWith('.js')) {
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
})
