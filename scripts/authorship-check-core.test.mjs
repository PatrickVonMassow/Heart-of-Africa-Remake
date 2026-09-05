import { describe, expect, it } from 'vitest'
import {
  authorshipRefusesPermission,
  checkAuthorship,
  claimedModelFromArtefact,
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
  it('reads a JSON model or the artefact title without inventing an unnamed author', () => {
    expect(claimedModelFromArtefact('{"model":"GPT-5.6 Sol","entries":[]}')).toBe('GPT-5.6 Sol')
    // The lane's CURRENT name has to be readable from a heading too (point 1061):
    // an artefact Astra writes is unattributable while only the retired name parses.
    expect(claimedModelFromArtefact('# List B — GPT-6 Astra, written blind\n\nBody')).toBe('GPT-6 Astra')
    expect(claimedModelFromArtefact('# List B — GPT-5.6 Sol, written blind\n\nBody')).toBe('GPT-5.6 Sol')
    expect(claimedModelFromArtefact('# Proposal A — Fable 5, written blind\n\nBody')).toBe('Fable 5')
    expect(claimedModelFromArtefact('# Proposal A — written blind\n\nBody')).toBe('')
  })

  it('does not treat the corrected 676 half-A quoted heading as its own claim', () => {
    const correctedHalfA = `# Proposal A — written 13.08.2026 before seeing any other proposal

<!-- THE HEADING BELOW IS THE ORIGINAL AND IT IS WRONG about its own author. It was
     written by Claude Opus 5, not Fable 5; see 676-provenance.md for the transcript
     metadata that settles it. The line is kept verbatim because it is the evidence
     of the mislabel, not a caption to be quietly corrected. -->

    # Proposal A — Fable 5, written 13.08.2026 before seeing any other proposal`

    expect(claimedModelFromArtefact(correctedHalfA)).toBe('')
  })

  it('ignores model headings quoted in fenced code and HTML comments', () => {
    expect(
      claimedModelFromArtefact('```md\n<!-- quoted markup -->\n# Proposal A — Fable 5\n```\n# Proposal A — Claude Opus 5'),
    ).toBe('Claude Opus 5')
    expect(claimedModelFromArtefact('<!--\n# Proposal A — Fable 5\n-->\n# Proposal A — Claude Opus 5')).toBe(
      'Claude Opus 5',
    )
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
      artefactAt: '2026-08-13T15:34:26.009Z',
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

  // The OpenAI lane's transcript, under BOTH its names (point 1061). The half-B
  // case is the REAL 676 record of 13.08.2026 and keeps the retired id, because a
  // rename may not cost a landed artefact its proof of authorship; the Astra case
  // is the same shape for the lane as it runs from 05.09.2026 on.
  const openAiLaneTranscript = (turnModel, turnId) =>
    transcript(
      JSON.stringify({
        timestamp: '2026-08-13T15:33:32.265Z',
        type: 'turn_context',
        payload: { turn_id: turnId, model: turnModel },
      }),
      JSON.stringify({
        timestamp: '2026-08-13T15:36:56.233Z',
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', id: 'writes-half-b', content: [] },
      }),
      JSON.stringify({ timestamp: '2026-08-13T15:36:56.284Z', type: 'event_msg', payload: {} }),
    )

  it('accepts the 676 half-B claim when its producing message says Sol', () => {
    const result = checkAuthorship({
      claimedModel: 'GPT-5.6 Sol',
      artefactAt: '2026-08-13T15:36:56.233Z',
      transcriptText: openAiLaneTranscript('gpt-5.6-sol', 'sol-turn'),
    })
    expect(result.status).toBe('agreement')
    expect(result.actualModel).toBe('gpt-5.6-sol')
    expect(authorshipRefusesPermission(result)).toBe(false)
  })

  it('accepts an Astra claim when its producing message says Astra', () => {
    const result = checkAuthorship({
      claimedModel: 'GPT-6 Astra',
      artefactAt: '2026-08-13T15:36:56.233Z',
      transcriptText: openAiLaneTranscript('gpt-6-astra', 'astra-turn'),
    })
    expect(result.status).toBe('agreement')
    expect(result.actualModel).toBe('gpt-6-astra')
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
      artefactAt: '2026-08-13T10:00:03.000Z',
      transcriptText: text,
    })
    expect(result).toMatchObject({ status: 'agreement', sidechain: true, messageId: 'delegated-write' })
    expect(formatAuthorship(result)).toContain('delegated sidechain')
  })

  it('records missing and out-of-range transcripts as unverified', () => {
    expect(checkAuthorship({ claimedModel: 'Fable 5', artefactAt: 100, transcriptText: null })).toMatchObject({
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
        artefactAt: '2026-08-14T10:00:00.000Z',
        transcriptText: text,
      }).status,
    ).toBe('unverified')
  })

  it('reports a heading with no model as unclaimed even when the transcript is readable', () => {
    const result = checkAuthorship({
      claimedModel: claimedModelFromArtefact('# Proposal A — written blind'),
      artefactAt: '2026-08-13T10:00:00.000Z',
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
