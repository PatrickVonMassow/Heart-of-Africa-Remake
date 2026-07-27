// The commit-scope guard's decision core (user 25.07.2026). The witnesses are
// the two real accidents: a 9.9 MB voice recording committed at the repository
// root inside a commit about walk feel, and a music/ directory inside a commit
// about the calf guard.
import { describe, it, expect } from 'vitest'
import {
  evaluateStagedFiles,
  formatVerdict,
  MAX_FILE_BYTES,
  ALLOWED_TOP_DIRS,
  ALLOWED_ROOT_FILES,
} from './commit-scope-guard-core.mjs'

const KB = 1024

describe('evaluateStagedFiles', () => {
  it('passes an ordinary commit across the allowed tree', () => {
    const v = evaluateStagedFiles([
      { path: 'src/scenes/place/PlaceLife.tsx', size: 40 * KB },
      { path: 'scripts/verify/polish.mjs', size: 90 * KB },
      { path: 'TASKS.md', size: 800 * KB },
      { path: 'docs/analysis_de/retrospektive-zusammenarbeit.md', size: 120 * KB },
      { path: 'tsconfig.app.json', size: 1 * KB },
    ])
    expect(v.block).toBe(false)
    expect(v.findings).toEqual([])
  })

  it('blocks the voice recording that really reached the repository', () => {
    const v = evaluateStagedFiles([
      { path: 'src/systems/walkFeel.ts', size: 12 * KB },
      { path: 'Referenzstimme Patrick.wav', size: 9_874_512 },
    ])
    expect(v.block).toBe(true)
    expect(v.findings).toHaveLength(1)
    expect(v.findings[0].path).toBe('Referenzstimme Patrick.wav')
    expect(v.findings[0].rule).toBe('unexpected-root-file')
  })

  it('blocks the music directory that really reached the repository', () => {
    const v = evaluateStagedFiles([{ path: 'music/heartOfAfricaMidi.mid', size: 9 * KB }])
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('unexpected-top-dir')
  })

  it('blocks a big binary even inside an allowed directory', () => {
    const v = evaluateStagedFiles([{ path: 'src/assets/soundtrack.wav', size: MAX_FILE_BYTES + 1 }])
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('large-binary')
  })

  it('allows the large files that legitimately live here', () => {
    const v = evaluateStagedFiles([
      { path: 'verification/01-birdseye-view.png', size: 3_000_000 },
      { path: 'public/geodata/dem.png', size: 5_974_338 },
      { path: 'cover/cover.png', size: 4_000_000 },
    ])
    expect(v.block).toBe(false)
  })

  it('is exact at the size boundary', () => {
    expect(evaluateStagedFiles([{ path: 'src/a.bin', size: MAX_FILE_BYTES }]).block).toBe(false)
    expect(evaluateStagedFiles([{ path: 'src/a.bin', size: MAX_FILE_BYTES + 1 }]).block).toBe(true)
  })

  it('reports one finding per offending path, not two', () => {
    // Both rules would fire on this one: unexpected root file AND oversized.
    const v = evaluateStagedFiles([{ path: 'stray.wav', size: 9_000_000 }])
    expect(v.findings).toHaveLength(1)
  })

  it('accepts every allowed top directory and root file', () => {
    for (const d of ALLOWED_TOP_DIRS) {
      expect(evaluateStagedFiles([{ path: `${d}/file.txt`, size: 10 }]).block).toBe(false)
    }
    for (const f of ALLOWED_ROOT_FILES) {
      expect(evaluateStagedFiles([{ path: f, size: 10 }]).block).toBe(false)
    }
  })

  it('treats an empty or missing list as nothing to complain about', () => {
    expect(evaluateStagedFiles([]).block).toBe(false)
    expect(evaluateStagedFiles(undefined).block).toBe(false)
  })
})

describe('formatVerdict', () => {
  it('says nothing when nothing is wrong', () => {
    expect(formatVerdict({ block: false, findings: [] })).toBe('')
  })

  it('names every offender and the deliberate way out', () => {
    const text = formatVerdict(
      evaluateStagedFiles([
        { path: 'Referenzstimme Patrick.wav', size: 9_874_512 },
        { path: 'music/heartOfAfricaSheetMusic.pdf', size: 89_269 },
      ]),
    )
    expect(text).toContain('Referenzstimme Patrick.wav')
    expect(text).toContain('music/heartOfAfricaSheetMusic.pdf')
    expect(text).toContain('commit-scope-guard-core.mjs')
  })
})
