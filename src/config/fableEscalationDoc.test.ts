import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FABLE_ESCALATION_ROUNDS } from '../../scripts/author-routing-core.mjs'

const ROOT = resolve(process.cwd())
const EXCLUDED = new Set([
  'TASKS.md',
  'design.md',
  'docs/tasks-archive.md',
  'scripts/author-routing-core.mjs',
  'src/config/fableEscalationDoc.test.ts',
])

const claim = new RegExp(
  String.raw`\b(?:fable|escalat\w*)\b[\s\S]{0,240}\b(?:five|${FABLE_ESCALATION_ROUNDS})\b` +
    String.raw`[\s\S]{0,120}\b(?:unsuccessful|non-passing|failed)\b[\s\S]{0,80}\breview\s+rounds?\b`,
  'i',
)

function thresholdClaims(files: Map<string, string>) {
  return [...files].filter(([, text]) => claim.test(text)).map(([path]) => path)
}

function trackedProseAndSource() {
  const paths = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((path) => !EXCLUDED.has(path))
    .filter((path) => /\.(?:md|mjs|ts|tsx)$/.test(path))
  return new Map(paths.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]))
}

describe('the Fable escalation boundary has one prose statement', () => {
  it('finds the threshold only in CLAUDE.md §6', () => {
    expect(thresholdClaims(trackedProseAndSource())).toEqual(['CLAUDE.md'])
  })

  it('would fail the consistency check if a second statement appeared', () => {
    const files = trackedProseAndSource()
    files.set('docs/duplicate.md', 'Fable escalates after five unsuccessful review rounds.')
    expect(thresholdClaims(files)).toEqual(['CLAUDE.md', 'docs/duplicate.md'])
  })
})
