// The build's own diagnosis of "'tsc' is not recognized" (point 429, bonus).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { missingDependencies, DIAGNOSIS } from './deps-preflight.mjs'

const ROOT = resolve(import.meta.dirname, '..')

describe('deps-preflight', () => {
  it('reports nothing in a healthy checkout', () => {
    expect(missingDependencies()).toEqual([])
  })

  it('reports every dependency a fake resolver cannot find', () => {
    const broken = {
      resolve() {
        throw new Error('MODULE_NOT_FOUND')
      },
    }
    expect(missingDependencies(broken)).toEqual(['typescript', 'vite'])
  })

  it('names the cause, the repair and the way to prevent it', () => {
    const text = DIAGNOSIS(['typescript'])
    expect(text).toContain("'tsc' is not recognized")
    expect(text).toContain('npm install')
    expect(text).toContain('worktree-cleanup.mjs')
    expect(text).toContain('NOT a defect in the code')
  })

  it('runs ahead of the compiler in the build script, or it can never speak', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts.build.indexOf('deps-preflight')).toBeLessThan(pkg.scripts.build.indexOf('tsc'))
  })
})
