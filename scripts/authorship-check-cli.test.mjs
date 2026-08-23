import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from './authorship-check.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'authorship-check.mjs')
const dirs = []

function fixture({ artifact = '# Proposal A — Fable 5, written blind', transcript = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-authorship-'))
  dirs.push(dir)
  const artifactPath = join(dir, 'half.md')
  const transcriptPath = join(dir, 'session.jsonl')
  writeFileSync(artifactPath, artifact)
  writeFileSync(transcriptPath, transcript)
  return { artifactPath, transcriptPath }
}

function run(...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', windowsHide: true })
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('authorship-check command', () => {
  it('refuses malformed command lines instead of dropping flags', () => {
    const parsed = parseArgs(['--artefact', 'half.md', '--wat', 'x'])
    expect(parsed.ok).toBe(false)
    expect(parsed.errors).toEqual(expect.arrayContaining([expect.stringMatching(/unknown argument/), expect.stringMatching(/--at/)]))
  })

  it('prints disagreement and exits one', () => {
    const at = '2026-08-13T15:34:26.009Z'
    const { artifactPath, transcriptPath } = fixture({
      transcript: [
        JSON.stringify({ timestamp: at, type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5' } }),
        JSON.stringify({ timestamp: '2026-08-13T15:34:27.000Z', type: 'user', message: { role: 'user' } }),
      ].join('\n'),
    })
    const result = run('--artefact', artifactPath, '--at', at, '--transcript', transcriptPath)
    expect(result.status).toBe(1)
    expect(result.output).toContain('DISAGREEMENT')
    expect(result.output).toContain('claude-opus-5')
  })

  it('prints unverified and exits two when the transcript is gone', () => {
    const { artifactPath } = fixture()
    const result = run('--artefact', artifactPath, '--at', '2026-08-13T15:34:26.009Z')
    expect(result.status).toBe(2)
    expect(result.output).toContain('UNVERIFIED')
  })
})
