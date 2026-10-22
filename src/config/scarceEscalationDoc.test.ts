import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCARCE_ESCALATION_ROUNDS, SCARCE_LANE_WORDS } from '../../scripts/author-routing-core.mjs'

const ROOT = resolve(process.cwd())
const EXCLUDED = new Set([
  'TASKS.md',
  'design.md',
  // Generated command syntax lists both --on and --off; it records no current state.
  'docs/command-index.md',
  'docs/tasks-archive.md',
  'scripts/author-routing-core.mjs',
  'src/config/scarceEscalationDoc.test.ts',
])

const laneWords = SCARCE_LANE_WORDS.join('|')
const routeTerms = String.raw`\b(?:${laneWords}|escalat\w*)\b`
const roundTerms =
  String.raw`\b(?:five|${SCARCE_ESCALATION_ROUNDS})\b[\s\S]{0,120}` +
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
    // A tracked file deleted in the working tree is not prose any more.
    .filter((path) => existsSync(resolve(ROOT, path)))
  return new Map(paths.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]))
}

const directions = String.raw`\b(?:on|off|enabled|disabled|suspended|active|inactive)\b`
const laneTerm = String.raw`\b(?:${SCARCE_LANE_WORDS.filter((word) => word !== 'scarce').join('|')})\b`
const stateClaim = new RegExp(
  `${laneTerm}[\\s\\S]{0,100}\\bswitch\\b[\\s\\S]{0,100}${directions}|${laneTerm}[\\s\\S]{0,100}${directions}[\\s\\S]{0,100}\\bswitch\\b`,
  'i',
)

function switchStateClaims(files: Map<string, string>) {
  return [...files].filter(([, text]) => stateClaim.test(text)).map(([path]) => path)
}

function trackedDocuments() {
  const paths = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    // The work order and archive are specifications/history, not operational
    // restatements; they necessarily preserve the instruction this test enforces.
    .filter((path) => !EXCLUDED.has(path))
    .filter((path) => existsSync(resolve(ROOT, path)))
  return new Map(paths.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]))
}

describe('the scarce-lane escalation boundary has at most one prose statement', () => {
  it('finds the threshold stated in no prose file', () => {
    expect(thresholdClaims(trackedProseAndSource())).toEqual([])
  })

  it('would fail the consistency check if a statement appeared', () => {
    for (const duplicate of [
      `${SCARCE_LANE_WORDS[1]} escalates after five unsuccessful review rounds.`,
      'After five unsuccessful review rounds, hand the point to the scarce lane.',
    ]) {
      const files = trackedProseAndSource()
      files.set('docs/duplicate.md', duplicate)
      expect(thresholdClaims(files)).toEqual(['docs/duplicate.md'])
    }
  })
})

describe('the scarce-lane switch state exists in no tracked operational document', () => {
  it('finds no prose claim that the switch has a direction', () => {
    expect(switchStateClaims(trackedDocuments())).toEqual([])
  })

  it('catches either direction written around the switch name', () => {
    for (const duplicate of [
      `The ${SCARCE_LANE_WORDS[1]} switch is enabled for this run.`,
      `${SCARCE_LANE_WORDS[1]} remains disabled by the shared switch.`,
    ]) {
      const files = trackedDocuments()
      files.set('docs/duplicate.md', duplicate)
      expect(switchStateClaims(files)).toEqual(['docs/duplicate.md'])
    }
  })
})
