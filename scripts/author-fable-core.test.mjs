import { describe, expect, it } from 'vitest'
import {
  authoringClaudeArgs,
  FABLE_MODEL,
  FABLE_MODEL_ID,
  FABLE_TRAILER,
  fableAuthoringOutcome,
  parseClaudeAuthoringOutput,
} from './author-fable-core.mjs'

describe('Fable authoring process', () => {
  it('pins Fable without an attribution-breaking fallback', () => {
    const args = authoringClaudeArgs({ prompt: 'author it' })
    expect(args).toEqual([
      '-p',
      'author it',
      '--model',
      FABLE_MODEL_ID,
      '--output-format',
      'json',
      '--dangerously-skip-permissions',
    ])
    expect(args).not.toContain('--fallback-model')
    expect(FABLE_TRAILER).toContain('Claude Fable 5.1')
  })

  it('extracts the final answer only when Claude reports Fable as the serving model', () => {
    const parsed = parseClaudeAuthoringOutput(
      JSON.stringify({ result: 'DONE: built\nGATES: green\nOPEN: none', modelUsage: { 'claude-fable-5-1': {} } }),
    )
    expect(parsed).toMatchObject({ ok: true, result: expect.stringContaining('DONE: built') })
    expect(fableAuthoringOutcome({ exitCode: 0, modelResult: parsed })).toEqual({ ok: true, cause: '' })
  })

  it('refuses silent substitution, missing metadata, malformed output, and failed runs', () => {
    const substituted = parseClaudeAuthoringOutput(
      JSON.stringify({ result: 'done', modelUsage: { 'claude-opus-5': {} } }),
      FABLE_MODEL,
    )
    expect(substituted).toMatchObject({ ok: false, models: ['claude-opus-5'] })
    expect(substituted.error).toContain(`not ${FABLE_MODEL}`)
    expect(parseClaudeAuthoringOutput(JSON.stringify({ result: 'done' })).error).toMatch(/no serving model/)
    expect(parseClaudeAuthoringOutput('not json').error).toMatch(/no readable result JSON/)
    expect(fableAuthoringOutcome({ exitCode: 0, modelResult: substituted }).cause).toContain('Claude served')
    expect(fableAuthoringOutcome({ exitCode: 2 }).cause).toContain('exited with code 2')
    expect(fableAuthoringOutcome({ exitCode: 0, timedOut: true }).cause).toContain('timed out')
  })
})
