// The villager pipeline's cache keys (scripts/villager/cachekeys.py): keyed on
// the inputs, never on the cache files — the same key before a step is built
// (cold) and after (warm) — and each key moves with exactly its own inputs.
import { execFileSync } from 'node:child_process'
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'villager-keys-'))
  for (const f of readdirSync(here)) if (f.endsWith('.py') || f === 'sources.json') copyFileSync(join(here, f), join(dir, f))
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ VILLAGER_ASSET: { a: 1 }, VILLAGER_GLTF: { b: 2 }, FIGURE_STATURE: 1 }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const keys = () => JSON.parse(execFileSync('python3', [join(dir, 'cachekeys.py'), join(dir, 'config.json'), dir], { encoding: 'utf8', windowsHide: true, timeout: 20000 }))

describe('the villager pipeline cache keys', () => {
  it('are the same cold and warm: built caches beside them change nothing', () => {
    const cold = keys()
    for (const n of ['body', 'clips', 'garments', 'mask']) writeFileSync(join(dir, `${n}.pkl`), `cached ${n}`)
    expect(keys()).toEqual(cold)
    expect(Object.keys(cold).sort()).toEqual(['body', 'clips', 'garments'])
  })

  it('move with their own inputs and those of the steps they read', () => {
    const base = keys()
    appendFileSync(join(dir, 'clips.py'), '\n# edited\n')
    const clips = keys()
    expect(clips.body).toBe(base.body)
    expect(clips.clips).not.toBe(base.clips)
    expect(clips.garments).not.toBe(base.garments)
    appendFileSync(join(dir, 'body.py'), '\n# edited\n')
    const body = keys()
    for (const k of ['body', 'clips', 'garments']) expect(body[k]).not.toBe(clips[k])
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ VILLAGER_ASSET: { a: 2 }, VILLAGER_GLTF: { b: 2 }, FIGURE_STATURE: 1 }))
    const cfg = keys()
    for (const k of ['body', 'clips', 'garments']) expect(cfg[k]).not.toBe(body[k])
    appendFileSync(join(dir, 'sources.json'), '\n')
    const src = keys()
    for (const k of ['body', 'clips', 'garments']) expect(src[k]).not.toBe(cfg[k])
  })

  // a body edit: a statement prepended to the function (the source stays valid Python)
  const edit = (file, def) => {
    const p = join(dir, file)
    const text = readFileSync(p, 'utf8')
    const at = text.indexOf(`\ndef ${def}(`)
    expect(at).toBeGreaterThan(-1)
    const body = text.indexOf(':\n', at) + 2
    writeFileSync(p, `${text.slice(0, body)}    _edited = 1\n${text.slice(body)}`)
  }

  it('a helper a step reaches moves its key, through the helper it calls in turn', () => {
    // fit.py imports sheets.morphed (direct) and gamepath.Person reaches gamepath.bake (transitive)
    const base = keys()
    edit('sheets.py', 'morphed')
    const direct = keys()
    expect(direct.body).toBe(base.body)
    expect(direct.garments).not.toBe(base.garments)
    edit('gamepath.py', 'bake')
    expect(keys().garments).not.toBe(direct.garments)
  })

  it('a helper reached through a re-export moves the key', () => {
    writeFileSync(join(dir, 'facade.py'), 'from sheets import runtime_sheets\n')
    appendFileSync(join(dir, 'fit.py'), '\nfrom facade import runtime_sheets as _reexported\n')
    const base = keys()
    edit('sheets.py', 'runtime_sheets')
    expect(keys().garments).not.toBe(base.garments)
  })

  it('swapping two re-export bindings moves the key', () => {
    writeFileSync(join(dir, 'facade.py'), 'from sheets import runtime_sheets as f, sample as g\n')
    appendFileSync(join(dir, 'fit.py'), '\nfrom facade import f, g\n')
    const base = keys()
    writeFileSync(join(dir, 'facade.py'), 'from sheets import sample as f, runtime_sheets as g\n')
    expect(keys().garments).not.toBe(base.garments)
  })

  it('a re-export cycle ends', () => {
    writeFileSync(join(dir, 'ra.py'), 'from sheets import sample as f\n\ndef unused():\n    from rb import f\n    return f\n')
    writeFileSync(join(dir, 'rb.py'), 'from ra import f\n')
    appendFileSync(join(dir, 'fit.py'), '\nfrom rb import f as _cyclic\n')
    expect(Object.keys(keys()).sort()).toEqual(['body', 'clips', 'garments'])
  })

  it('a helper no step reaches moves no key', () => {
    const base = keys()
    edit('sheets.py', 'runtime_sheets')
    edit('penetration.py', 'runtime_report')
    expect(keys()).toEqual(base)
  })

  it('a garment-code edit moves only the garments key', () => {
    const base = keys()
    appendFileSync(join(dir, 'fit.py'), '\n# edited\n')
    const fit = keys()
    expect(fit.body).toBe(base.body)
    expect(fit.clips).toBe(base.clips)
    expect(fit.garments).not.toBe(base.garments)
  })
})
