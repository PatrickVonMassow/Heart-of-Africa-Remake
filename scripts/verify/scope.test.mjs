// THE STATIC NET under the sectioned verify suites (point 566).
//
// WHY IT EXISTS. A suite is one long module whose blocks are
// `if (section('x')) { … }` — and that `{ … }` is a BLOCK SCOPE. A helper
// declared inside one section is invisible to the next, but nothing says so
// until the browser run reaches the call: on 08.08.2026 `pinFamily`, declared in
// `calf-predation-drama` and called from `coastal-walk-off`, aborted the whole
// `enrichments` pass with `pinFamily is not defined` after 176 of its 251 checks
// — 27 minutes to find, both on the first run and on the automatic retry.
// `no-undef` over the same file finds it in a tenth of a second. The point
// exists because repairing a CHECK costs a suite pass; discovering a scope error
// by browser run is that cost paid for nothing.
//
// HOW IT IS WIRED. `.oxlintrc.json` carries an override for `scripts/**/*.mjs`
// that turns `no-undef` on with the browser AND node global sets — both are
// legitimate in one file, because these are Node scripts carrying
// `page.evaluate` callbacks that run in the browser. So the gate is `npm run
// lint` itself: no hook, no extra command, and every existing caller of the lint
// gate (the fast gate, CI, the pre-push hook) inherits it.
//
// WHAT THIS FILE ADDS. Lint being green proves nothing about whether the rule is
// still ARMED. These cases run the REAL config — copied byte for byte — over a
// fixture that reproduces the pinFamily shape, and assert it is refused; a
// future edit that drops the rule, the env or the file glob turns them red.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import {
  crossSectionGlobals,
  formatCrossSectionGlobals,
  crossSectionBindings,
  formatCrossSectionBindings,
  sectionRanges,
  sectionAt,
} from './sectionScope.mjs'

const ROOT = process.cwd()
const OXLINT = resolve(ROOT, 'node_modules/.bin/oxlint')

/** Run oxlint over `paths` in `cwd` and return { code, out }. Never throws on a
 *  lint failure — a non-zero exit is the RESULT here, not an error. */
function lint(paths, cwd = ROOT) {
  try {
    const out = execFileSync(OXLINT, paths, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true, // point 401: no console window flashing at a turn end
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

// A section block in miniature: `pinFamily` declared inside one, called from the
// next. This is the exact defect, reduced to what the linter needs to see it.
const CROSS_BLOCK = `const page = { evaluate: async () => {} }
if (Math.random() > 2) {
  const pinFamily = async () => { await page.evaluate() }
  await pinFamily()
}
if (Math.random() > 2) {
  await pinFamily()
  console.log(window.location.href, process.cwd())
}
`

// The same file with the helper HOISTED above the blocks — the honest fix, and
// the shape the real suite now has. It must lint clean, browser globals and all.
const HOISTED = `const page = { evaluate: async () => {} }
const pinFamily = async () => { await page.evaluate() }
if (Math.random() > 2) {
  await pinFamily()
}
if (Math.random() > 2) {
  await pinFamily()
  console.log(window.location.href, process.cwd())
}
`

describe('the scope net over the verify suites', () => {
  // A throwaway tree that mirrors the repo layout — `scripts/verify/…` under a
  // copy of the real `.oxlintrc.json` — so the override's own file glob decides,
  // and the fixtures never touch the repository's working tree.
  let dir
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'hoa-scope-'))
    mkdirSync(join(dir, 'scripts/verify'), { recursive: true })
    copyFileSync(resolve(ROOT, '.oxlintrc.json'), join(dir, '.oxlintrc.json'))
    writeFileSync(join(dir, 'scripts/verify/cross-block.mjs'), CROSS_BLOCK)
    writeFileSync(join(dir, 'scripts/verify/hoisted.mjs'), HOISTED)
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('REFUSES a helper used across two section blocks, naming it', () => {
    const { code, out } = lint(['scripts/verify/cross-block.mjs'], dir)
    expect(code, `oxlint accepted the cross-block reference:\n${out}`).not.toBe(0)
    expect(out).toContain('no-undef')
    expect(out).toContain('pinFamily')
  })

  it('accepts the same helper hoisted above the blocks — the honest fix', () => {
    const { code, out } = lint(['scripts/verify/hoisted.mjs'], dir)
    expect(code, out).toBe(0)
  })

  it('treats the browser globals of page.evaluate as defined, so the check stays readable', () => {
    // A net that reported `window`/`document` on every suite would be ignored
    // within a day. This is what the browser env in the override buys.
    writeFileSync(
      join(dir, 'scripts/verify/globals.mjs'),
      'export const probe = () => [window, document, navigator, requestAnimationFrame, ' +
        'localStorage, performance, getComputedStyle, KeyboardEvent, WheelEvent, MouseEvent, ' +
        'Event, Image, HTMLCanvasElement, fetch, URL, TextDecoder, console, ' +
        'process, Buffer, setTimeout, clearTimeout, setInterval, clearInterval]\n',
    )
    const { code, out } = lint(['scripts/verify/globals.mjs'], dir)
    expect(code, out).toBe(0)
  })

  // THE LIVE GATE. Everything above proves the rule works; this proves the
  // repository is clean under it right now — the assertion that would have
  // failed on 08.08.2026 in 0.1 s instead of 27 minutes.
  it('finds no undefined identifier anywhere under scripts/', () => {
    const { code, out } = lint(['scripts/'])
    expect(out).not.toContain('no-undef')
    expect(code, out).toBe(0)
  })
})

// The half a linter cannot see: a helper installed on the PAGE. To oxlint,
// `window.__makeTestFamily = …` in one block and `window.__makeTestFamily(…)` in
// the next are a property write and a property read, both perfectly defined —
// while standalone the second block dies on "is not a function". Found on
// 09.08.2026 by a 100-second browser run; this finds it in milliseconds.
describe('a page helper may not cross a section boundary', () => {
  const dir = resolve(ROOT, 'scripts/verify')

  const SUITE = `
if (section('installs')) {
  await page.evaluate(() => { window.__helper = () => 1 })
  await page.evaluate(() => window.__helper())
}
if (section('borrows')) {
  await page.evaluate(() => window.__helper())
}
`

  it('names the helper, where it is installed and where it is borrowed', () => {
    const found = crossSectionGlobals(SUITE)
    expect(found).toEqual([{ name: '__helper', installedIn: ['installs'], usedIn: 'borrows', line: 7 }])
    const msg = formatCrossSectionGlobals(found, 'x.mjs')
    expect(msg).toContain('__helper')
    expect(msg).toContain('borrows')
    expect(msg).toContain('above the section blocks')
  })

  it('is content once the install sits above the blocks — the honest fix', () => {
    const fixed = "await page.evaluate(() => { window.__helper = () => 1 })\n" + SUITE
    expect(crossSectionGlobals(fixed)).toEqual([])
  })

  it("leaves the application's own dev hooks alone — the suite never installs them", () => {
    expect(crossSectionGlobals("if (section('a')) { window.__game.getState() }\nif (section('b')) { window.__game.getState() }")).toEqual([])
  })

  it('reads a comparison and a property write as READS of the helper, not installs', () => {
    const src = "if (section('a')) { window.__h = 1 }\nif (section('b')) { window.__h.k = 2 }\nif (section('c')) { if (window.__h === 1) {} }"
    expect(crossSectionGlobals(src).map((f) => f.usedIn)).toEqual(['b', 'c'])
  })

  it('measures the block boundaries over braces the mask cleaned first', () => {
    const src = "if (section('a')) {\n  // a } in prose\n  const s = '}'\n}\nwindow.__after = 1\n"
    const ranges = sectionRanges(src)
    expect(ranges.map((r) => r.name)).toEqual(['a'])
    expect(sectionAt(ranges, src.indexOf('__after'))).toBe(null)
  })

  it('anchors the block on the CONDITION, so braces in the if-head cannot shrink it', () => {
    // `{ x: 1 }` used to be recorded as the whole of section 'a', which left the
    // real body counting as shared code — the install then looked legitimate and
    // EVERY finding for that helper disappeared. Silent disarmament, the worst
    // failure a gate has.
    const src = "if (section('a') && stage({ x: 1 })) {\n  window.__h = () => 1\n}\nif (section('b')) {\n  window.__h()\n}\n"
    const ranges = sectionRanges(src)
    expect(ranges.map((r) => r.name)).toEqual(['a', 'b'])
    expect(sectionAt(ranges, src.indexOf('window.__h ='))).toBe('a')
    expect(crossSectionGlobals(src)).toEqual([{ name: '__h', installedIn: ['a'], usedIn: 'b', line: 5 }])
  })

  it('records no range for a section whose `if` opens no block', () => {
    expect(sectionRanges("if (section('a')) report()\n").map((r) => r.name)).toEqual([])
  })

  it('is total on junk', () => {
    expect(crossSectionGlobals(null)).toEqual([])
    expect(sectionRanges(undefined)).toEqual([])
    expect(formatCrossSectionGlobals([])).toBe('')
  })

  // THE LIVE GATE over every sectioned suite in the tree.
  it('holds for every suite that declares sections', () => {
    const suites = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    let sectioned = 0
    for (const f of suites) {
      const src = readFileSync(join(dir, f), 'utf8')
      if (sectionRanges(src).length === 0) continue
      sectioned++
      const found = crossSectionGlobals(src)
      expect(found, `\n${formatCrossSectionGlobals(found, f)}\n`).toEqual([])
      const bindings = crossSectionBindings(src)
      expect(bindings, `\n${formatCrossSectionBindings(bindings, f)}\n`).toEqual([])
    }
    // A gate over nothing would pass forever: at least one suite IS sectioned.
    expect(sectioned).toBeGreaterThan(0)
  })
})

// THE RECURRENCE PATH. `no-undef` refuses a cross-block `const`; the smallest
// edit that satisfies it is to hoist the DECLARATION and leave the
// INITIALISATION behind — which passes every other net here and reproduces the
// original bug exactly. This is the net that sees it.
describe('a module-level binding may not be initialised inside one section only', () => {
  const HOISTED_DECL = `let herd
if (section('a')) {
  herd = await stage()
  await use(herd)
}
if (section('b')) {
  await use(herd)
}
`

  it('names the binding, where it is assigned and where it is read undefined', () => {
    const found = crossSectionBindings(HOISTED_DECL)
    expect(found).toEqual([{ name: 'herd', kind: 'let', assignedIn: ['a'], usedIn: 'b', line: 7 }])
    const msg = formatCrossSectionBindings(found, 'x.mjs')
    expect(msg).toContain('herd')
    expect(msg).toContain('"b"')
    expect(msg).toContain('INITIALISATION')
  })

  it('sees a `var` the same way — hoisting fools the linter, not a --section run', () => {
    expect(crossSectionBindings(HOISTED_DECL.replace('let herd', 'var herd')).map((f) => f.kind)).toEqual(['var'])
  })

  it('is content once the initialisation moves above the blocks — the honest fix', () => {
    expect(crossSectionBindings(HOISTED_DECL.replace('let herd\n', 'let herd = await stage()\n'))).toEqual([])
  })

  it('leaves the suites\' own counters alone: an initialiser IS shared staging', () => {
    // `let failures = 0` at the top, counted up inside the blocks, read at the
    // end. Reporting this shape would make the gate noise within a day.
    const src = "let failures = 0\nif (section('a')) { failures++ }\nif (section('b')) { if (failures) report(failures) }\n"
    expect(crossSectionBindings(src)).toEqual([])
  })

  it('reads a compound assignment as a write, not a borrow', () => {
    const src = "let tally\nif (section('a')) { tally = 0 }\nif (section('b')) { tally += 1 }\nif (section('c')) { report(tally) }\n"
    expect(crossSectionBindings(src).map((f) => f.usedIn)).toEqual(['c'])
  })

  it('ignores a binding declared inside a block, and a comparison is a read', () => {
    // `let inner` lives in a function, so no --section run can miss it; and
    // `herd === null` must not be mistaken for an assignment.
    const src = "function f() { let inner\n  inner = 1\n  return inner }\nlet herd\nif (section('a')) { herd = 1 }\nif (section('b')) { if (herd === 1) f() }\n"
    expect(crossSectionBindings(src).map((f) => f.name)).toEqual(['herd'])
  })

  it('says nothing about a file with no sections at all, and is total on junk', () => {
    expect(crossSectionBindings('let herd\nherd = 1\nuse(herd)\n')).toEqual([])
    expect(crossSectionBindings(null)).toEqual([])
    expect(formatCrossSectionBindings([])).toBe('')
  })
})
