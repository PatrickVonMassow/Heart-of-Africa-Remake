// The villager pipeline's cache keys (scripts/villager/cachekeys.py): keyed on
// the inputs, never on the cache files — the same key before a step is built
// (cold) and after (warm) — and each key moves with exactly its own inputs.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
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

const keys = () => JSON.parse(execFileSync('python3', [join(dir, 'cachekeys.py'), join(dir, 'config.json'), dir], { encoding: 'utf8', windowsHide: true }))

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

  it('a garment-code edit moves only the garments key', () => {
    const base = keys()
    appendFileSync(join(dir, 'fit.py'), '\n# edited\n')
    const fit = keys()
    expect(fit.body).toBe(base.body)
    expect(fit.clips).toBe(base.clips)
    expect(fit.garments).not.toBe(base.garments)
  })
})
