import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FABLE_ESCALATION_ROUNDS, FABLE_ESCALATION_SUSPENDED } from '../../scripts/author-routing-core.mjs'

const ROOT = resolve(process.cwd())
const EXCLUDED = new Set([
  'TASKS.md',
  'design.md',
  'docs/tasks-archive.md',
  'scripts/author-routing-core.mjs',
  'src/config/fableEscalationDoc.test.ts',
])

const routeTerms = String.raw`\b(?:fable|escalat\w*)\b`
const roundTerms =
  String.raw`\b(?:five|${FABLE_ESCALATION_ROUNDS})\b[\s\S]{0,120}` +
  String.raw`\b(?:unsuccessful|non-passing|failed)\b[\s\S]{0,80}\breview\s+rounds?\b`
const claim = new RegExp(
  `${routeTerms}[\\s\\S]{0,240}${roundTerms}|${roundTerms}[\\s\\S]{0,240}${routeTerms}`,
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

describe('the Fable escalation boundary has at most one prose statement', () => {
  // The user SUSPENDED the automatic escalation on 20.08.2026, so §6 no longer
  // states a round threshold at all: the number survives only as the constant in
  // author-routing-core.mjs, next to the flag that switches the lane change off.
  // The check itself stays — it is what stops the threshold being re-stated in
  // prose, whether the escalation is live or waiting to be lifted.
  it('pins the premise: the escalation is suspended', () => {
    expect(FABLE_ESCALATION_SUSPENDED).toBe(true)
  })

  it('finds the threshold stated in no prose file', () => {
    expect(thresholdClaims(trackedProseAndSource())).toEqual([])
  })

  it('would fail the consistency check if a statement appeared', () => {
    for (const duplicate of [
      'Fable escalates after five unsuccessful review rounds.',
      'After five unsuccessful review rounds, escalate the point to Fable.',
    ]) {
      const files = trackedProseAndSource()
      files.set('docs/duplicate.md', duplicate)
      expect(thresholdClaims(files)).toEqual(['docs/duplicate.md'])
    }
  })
})
