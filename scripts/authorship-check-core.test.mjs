import { describe, expect, it } from 'vitest'
import {
  authorshipRefusesPermission,
  checkAuthorship,
  claimedModelFromArtifact,
  formatAuthorship,
  readTranscriptMessages,
} from './authorship-check-core.mjs'

const entry = ({ at, model = '', sidechain = false, role = 'assistant', id = 'message' }) =>
  JSON.stringify({
    timestamp: at,
    isSidechain: sidechain,
    type: role,
    message: { role, ...(model ? { model } : {}), id, content: [] },
  })

const transcript = (...lines) => lines.join('\n')

describe('transcript-backed authorship', () => {
  it('reads a JSON model or the first markdown heading without inventing an unnamed author', () => {
    expect(claimedModelFromArtifact('{"model":"GPT-5.6 Sol","entries":[]}')).toBe('GPT-5.6 Sol')
    expect(claimedModelFromArtifact('# Proposal A — Fable 5, written blind\n\nBody')).toBe('Fable 5')
    expect(claimedModelFromArtifact('# Proposal A — written blind\n\nBody')).toBe('')
  })

  it('catches the 676 half-A mislabel across a session model switch', () => {
    const text = transcript(
      entry({ at: '2026-08-13T12:49:10.000Z', model: 'claude-fable-5', id: 'last-fable' }),
      entry({ at: '2026-08-13T12:49:22.000Z', model: 'claude-opus-5', id: 'first-opus' }),
      entry({ at: '2026-08-13T15:34:26.009Z', model: 'claude-opus-5', id: 'writes-half-a' }),
      entry({ at: '2026-08-13T15:36:26.188Z', role: 'user' }),
    )
    const result = checkAuthorship({
      claimedModel: 'Fable 5',
      artifactAt: '2026-08-13T15:34:26.009Z',
      transcriptText: text,
    })
    expect(result).toMatchObject({
      status: 'disagreement',
      claimedModel: 'Fable 5',
      actualModel: 'claude-opus-5',
      messageId: 'writes-half-a',
    })
    expect(authorshipRefusesPermission(result)).toBe(true)
  })

  it('accepts the 676 half-B claim when its producing message says Sol', () => {
    const text = transcript(
      entry({ at: '2026-08-13T15:33:30.000Z', model: 'gpt-5.6-sol', id: 'writes-half-b' }),
      entry({ at: '2026-08-13T15:34:00.000Z', role: 'user' }),
    )
    const result = checkAuthorship({
      claimedModel: 'GPT-5.6 Sol',
      artifactAt: '2026-08-13T15:33:30.000Z',
      transcriptText: text,
    })
    expect(result.status).toBe('agreement')
    expect(result.actualModel).toBe('gpt-5.6-sol')
    expect(authorshipRefusesPermission(result)).toBe(false)
  })

  it('uses a delegated sidechain message instead of assigning its artefact to the parent', () => {
    const text = transcript(
      entry({ at: '2026-08-13T10:00:00.000Z', model: 'claude-opus-5', id: 'parent' }),
      entry({
        at: '2026-08-13T10:00:03.000Z',
        model: 'claude-fable-5',
        sidechain: true,
        id: 'delegated-write',
      }),
      entry({ at: '2026-08-13T10:00:04.000Z', role: 'user' }),
    )
    const result = checkAuthorship({
      claimedModel: 'Fable 5',
      artifactAt: '2026-08-13T10:00:03.000Z',
      transcriptText: text,
    })
    expect(result).toMatchObject({ status: 'agreement', sidechain: true, messageId: 'delegated-write' })
    expect(formatAuthorship(result)).toContain('delegated sidechain')
  })

  it('records missing and out-of-range transcripts as unverified', () => {
    expect(checkAuthorship({ claimedModel: 'Fable 5', artifactAt: 100, transcriptText: null })).toMatchObject({
      status: 'unverified',
      reason: expect.stringMatching(/transcript is missing/),
    })
    const text = transcript(
      entry({ at: '2026-08-13T10:00:00.000Z', model: 'claude-fable-5' }),
      entry({ at: '2026-08-13T10:01:00.000Z', role: 'user' }),
    )
    expect(
      checkAuthorship({
        claimedModel: 'Fable 5',
        artifactAt: '2026-08-14T10:00:00.000Z',
        transcriptText: text,
      }).status,
    ).toBe('unverified')
  })

  it('reports a heading with no model as unclaimed even when the transcript is readable', () => {
    const result = checkAuthorship({
      claimedModel: claimedModelFromArtifact('# Proposal A — written blind'),
      artifactAt: '2026-08-13T10:00:00.000Z',
      transcriptText: entry({ at: '2026-08-13T10:00:00.000Z', model: 'claude-opus-5' }),
    })
    expect(result).toMatchObject({ status: 'unclaimed', actualModel: '' })
    expect(formatAuthorship(result)).toContain('NO CLAIM')
  })

  it('keeps readable evidence around a torn transcript line', () => {
    const read = readTranscriptMessages(
      transcript(
        '{torn',
        entry({ at: '2026-08-13T10:00:00.000Z', model: 'claude-opus-5' }),
        entry({ at: '2026-08-13T10:00:01.000Z', role: 'user' }),
      ),
    )
    expect(read.malformedLines).toBe(1)
    expect(read.messages).toHaveLength(1)
  })
})
