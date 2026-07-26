// The premise of the render-verify guard's DOM exemption, machine-checked
// (four-eyes review, 26.07.2026).
//
// `isBackendSensitivePath` exempts src/ui/ from the dual-backend picture rule on
// one ground: these files render HTML, and the browser draws HTML identically
// whichever renderer holds the canvas. That is true today — and nothing stopped
// a future component here from importing three.js and quietly inheriting the
// cheaper rule. This test pins the premise instead of trusting it: the moment a
// file under src/ui/ reaches for the 3-D stack, the exemption is no longer
// sound and this fails, pointing at the guard that must be adjusted.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const UI_DIR = resolve(process.cwd(), 'src/ui')

/** Every source file under src/ui/, recursively. */
function uiFiles(dir = UI_DIR, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) uiFiles(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

// Imports that would make a file's output depend on the renderer backend.
const FORBIDDEN = [
  /from\s+['"]three(\/|['"])/,
  /from\s+['"]@react-three\//,
  /from\s+['"][^'"]*\.tsl['"]/,
]

describe('src/ui stays DOM-only', () => {
  it('finds files to check at all', () => {
    expect(uiFiles().length).toBeGreaterThan(5)
  })

  it('imports nothing from the 3-D stack — the DOM exemption depends on it', () => {
    const offenders: string[] = []
    for (const file of uiFiles()) {
      const text = readFileSync(file, 'utf8')
      if (FORBIDDEN.some((re) => re.test(text))) offenders.push(file.replace(/\\/g, '/'))
    }
    expect(offenders).toEqual([])
  })
})
