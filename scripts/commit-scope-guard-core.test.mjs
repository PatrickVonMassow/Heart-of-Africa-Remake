// The commit-scope guard's decision core (user 25.07.2026). The witnesses are
// the two real accidents: a 9.9 MB voice recording committed at the repository
// root inside a commit about walk feel, and a music/ directory inside a commit
// about the calf guard.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  evaluateStagedFiles,
  formatVerdict,
  evaluateCommitMessage,
  formatMessageVerdict,
  SKIP_CI_MARKERS,
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

// The message half (user 28.07.2026). The witness is the real night: an agent
// was killed mid-build on `feat/300-gait-matches-speed`, its work was committed
// and pushed at once for durability, CI ran on that half-finished state, went
// red, and mailed the repository owner. The follow-up commit was green and
// `main` was never red — the whole cost was one failure mail for a state nobody
// claimed was finished.
describe('evaluateCommitMessage', () => {
  const RESCUE_BODY = 'Rescue: agent killed mid-build; the next commit finishes and runs CI.'

  it('leaves an ordinary commit message alone', () => {
    const v = evaluateCommitMessage(
      'Hold the freed lock for the window it was freed for\n\n' +
        'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>\n',
    )
    expect(v.block).toBe(false)
    expect(v.findings).toEqual([])
  })

  it('rejects a declared rescue that would start CI, naming the fix', () => {
    const v = evaluateCommitMessage(`Keep the interrupted gait work\n\n${RESCUE_BODY}\n`)
    expect(v.block).toBe(true)
    expect(v.findings).toHaveLength(1)
    expect(v.findings[0].rule).toBe('rescue-without-skip-ci')
    expect(v.findings[0].detail).toContain('[skip ci]')
    expect(v.findings[0].detail).toContain('SUBJECT')
  })

  it('accepts a rescue that carries the marker in its subject', () => {
    const v = evaluateCommitMessage(
      `Keep the interrupted gait work [skip ci]\n\n${RESCUE_BODY}\n\n` +
        'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>\n',
    )
    expect(v.block).toBe(false)
  })

  it('rejects a bare skip marker that silently skips a real gate', () => {
    const v = evaluateCommitMessage('Tidy the walker nudge [skip ci]\n')
    expect(v.block).toBe(true)
    expect(v.findings[0].rule).toBe('skip-ci-without-reason')
    expect(v.findings[0].detail).toContain('Rescue:')
  })

  it('rejects every spelling GitHub honours, wherever it sits', () => {
    for (const marker of SKIP_CI_MARKERS) {
      expect(evaluateCommitMessage(`Tidy the walker nudge ${marker}`).block).toBe(true)
      expect(evaluateCommitMessage(`Tidy the walker nudge\n\nbody ${marker}\n`).block).toBe(true)
      // …and is satisfied by that same spelling once the rescue is declared.
      expect(evaluateCommitMessage(`Keep it ${marker}\n\n${RESCUE_BODY}\n`).block).toBe(false)
    }
  })

  it('is case-insensitive about the marker', () => {
    expect(evaluateCommitMessage('Tidy the walker nudge [SKIP CI]').block).toBe(true)
    expect(evaluateCommitMessage(`Keep it [Skip CI]\n\n${RESCUE_BODY}`).block).toBe(false)
  })

  it('insists the marker sits in the SUBJECT, not only in the body', () => {
    // GitHub reads the whole message, but the convention states the subject —
    // the one placement that is honoured everywhere and visible in a log line.
    const v = evaluateCommitMessage(`Keep the interrupted gait work\n\n[skip ci]\n${RESCUE_BODY}`)
    expect(v.block).toBe(true)
    expect(v.findings).toHaveLength(1)
    expect(v.findings[0].rule).toBe('rescue-without-skip-ci')
  })

  it('does not read a bare "Rescue:" as a declaration', () => {
    // Nothing after the colon says nothing about what was interrupted.
    expect(evaluateCommitMessage('Keep it\n\nRescue:\n').block).toBe(false)
    expect(evaluateCommitMessage('Keep it [skip ci]\n\nRescue:\n').findings[0].rule).toBe(
      'skip-ci-without-reason',
    )
  })

  it('ignores git comment lines, so the template never speaks for the author', () => {
    const v = evaluateCommitMessage(
      'Tidy the walker nudge\n\n# Rescue: a hint from the commit template\n' +
        '# Please enter the commit message for your changes.\n',
    )
    expect(v.block).toBe(false)
  })

  it('never throws on a garbled or missing message (fail-open)', () => {
    for (const bad of [undefined, null, '', 42, {}, [], ' �']) {
      expect(() => evaluateCommitMessage(bad)).not.toThrow()
      expect(evaluateCommitMessage(bad).block).toBe(false)
    }
  })
})

describe('formatMessageVerdict', () => {
  it('says nothing when nothing is wrong', () => {
    expect(formatMessageVerdict({ block: false, findings: [] })).toBe('')
  })

  it('shows the shape a rescue commit is supposed to have', () => {
    const text = formatMessageVerdict(evaluateCommitMessage('Keep it\n\nRescue: killed mid-build'))
    expect(text).toContain('rescue-without-skip-ci')
    expect(text).toContain('[skip ci]')
    expect(text).toContain('Rescue:')
  })
})

// The wiring, proven by running it: the pure decision above is worth nothing if
// the hook does not reach it.
describe('the commit-msg hook', () => {
  const HOOK = resolve(process.cwd(), 'scripts/git-hooks/commit-msg')
  const GUARD = resolve(process.cwd(), 'scripts/commit-scope-guard.mjs')

  it('hands the message file to the guard', () => {
    const hook = readFileSync(HOOK, 'utf8')
    expect(hook).toContain('scripts/commit-scope-guard.mjs --message "$1"')
  })

  const judge = (message) => {
    const dir = mkdtempSync(resolve(tmpdir(), 'hoa-commit-msg-'))
    try {
      const file = resolve(dir, 'COMMIT_EDITMSG')
      writeFileSync(file, message, 'utf8')
      return spawnSync(process.execPath, [GUARD, '--message', file], { encoding: 'utf8' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('refuses an undeclared rescue and accepts the declared one', () => {
    const bad = judge('Keep the interrupted gait work\n\nRescue: agent killed mid-build\n')
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('[skip ci]')

    const good = judge('Keep the interrupted gait work [skip ci]\n\nRescue: agent killed mid-build\n')
    expect(good.status).toBe(0)
  })

  it('lets an ordinary message through, and never blocks on an unreadable file', () => {
    expect(judge('Hold the freed lock for the window it was freed for\n').status).toBe(0)
    const missing = spawnSync(process.execPath, [GUARD, '--message', resolve(tmpdir(), 'no-such-msg')], {
      encoding: 'utf8',
    })
    expect(missing.status).toBe(0)
  })
})
