import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildSnapshot, formatConsole, formatMarkdown, listCodexRollouts, readProviderTurns } from './measure-point-cost.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures', 'point-cost')
let root
let claude
let codex

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'hoa-point-cost-'))
  claude = join(root, 'claude')
  codex = join(root, 'codex', '2026', '08', '18')
  mkdirSync(join(claude, 'main', 'subagents'), { recursive: true })
  mkdirSync(codex, { recursive: true })
  // listTranscripts ignores stubs below 1000 bytes. The fixtures already retain enough
  // of the real shape; padding is outside the JSON and the parser ignores it.
  const copy = (from, to) => writeFileSync(to, `${readFileSync(join(FIXTURES, from), 'utf8')}\n${' '.repeat(1200)}`)
  copy('claude-main.jsonl', join(claude, 'main.jsonl'))
  copy('claude-agent.jsonl', join(claude, 'main', 'subagents', 'agent-a900.jsonl'))
  copy('codex-author.jsonl', join(codex, 'rollout-author.jsonl'))
  copy('codex-review.jsonl', join(codex, 'rollout-review.jsonl'))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('point-cost IO over recorded trees', () => {
  it('finds nested Codex rollouts and both Claude scopes', () => {
    expect(listCodexRollouts(join(root, 'codex'))).toHaveLength(2)
    const read = readProviderTurns({ claudeDir: claude, codexDir: join(root, 'codex') })
    expect(read).toMatchObject({ claudeFiles: 2, codexFiles: 2 })
    expect(new Set(read.turns.map((turn) => turn.provider))).toEqual(new Set(['anthropic', 'openai']))
  })

  it('prints the per-point split, all lever verdicts and the three measured suspects', () => {
    const read = readProviderTurns({ claudeDir: claude, codexDir: join(root, 'codex') })
    const snapshot = buildSnapshot({
      landed: [{ point: 900, sha: 'abc', landedAt: '2026-08-18T10:20:00Z' }],
      turns: read.turns,
      boundaryText: readFileSync(join(FIXTURES, 'boundary.txt'), 'utf8'),
      source: read,
      generatedAt: '2026-08-18T11:00:00Z',
    })
    const consoleReport = formatConsole(snapshot)
    expect(consoleReport).toContain('900')
    expect(consoleReport).toContain('point boundary taken')
    expect(consoleReport).toContain('document-budget guard observed')
    expect(consoleReport).toContain('picture reads')
    expect(consoleReport).toContain('agent reports')
    expect(consoleReport).toContain('cross-vendor review rounds')
    expect(formatMarkdown(snapshot)).toContain('| 900 |')
  })
})
