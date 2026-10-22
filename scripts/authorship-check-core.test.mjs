import { describe, expect, it } from 'vitest'
import {
  authorshipRefusesPermission,
  checkAuthorship,
  claimedModelFromArtefact,
  formatAuthorship,
  readTranscriptMessages,
} from './authorship-check-core.mjs'
import { CROSS, MAIN, SCARCE } from './model-lanes.mjs'

// The 676 records of 13.08.2026 carry the names the lanes had then: retired spellings
// from the registry. A display name carries capitals, an id does not.
const displays = (record) => record.retired.filter((name) => /[A-Z]/.test(name))
const ids = (record) => record.retired.filter((name) => !/[A-Z]/.test(name))
const OLD_MAIN = displays(MAIN)[0]
const OLD_MAIN_BARE_ID = ids(MAIN).find((id) => !id.includes('[') && !/\d{8}/.test(id))
const OLD_SCARCE = displays(SCARCE)[0]
const OLD_SCARCE_ID = ids(SCARCE)[0]
const [OLD_CROSS, OLDEST_CROSS] = displays(CROSS)
const [OLD_CROSS_ID, OLDEST_CROSS_ID] = ids(CROSS)

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
    expect(claimedModelFromArtefact(`{"model":"${OLDEST_CROSS}","entries":[]}`)).toBe(`${OLDEST_CROSS}`)
    // Every name of the lane has to be readable from a heading (point 1061): an
    // artefact is unattributable while only one of its names parses.
    expect(claimedModelFromArtefact(`# List B — ${OLD_CROSS}, written blind\n\nBody`)).toBe(`${OLD_CROSS}`)
    expect(claimedModelFromArtefact(`# List B — ${OLDEST_CROSS}, written blind\n\nBody`)).toBe(`${OLDEST_CROSS}`)
    expect(claimedModelFromArtefact(`# Proposal A — ${OLD_SCARCE}, written blind\n\nBody`)).toBe(`${OLD_SCARCE}`)
    expect(claimedModelFromArtefact(`# List B — ${CROSS.displayName}, written blind\n\nBody`)).toBe(CROSS.displayName)
    expect(claimedModelFromArtefact(`# Proposal A — ${MAIN.trailerName}\n\nBody`)).toBe(MAIN.trailerName)
    expect(claimedModelFromArtefact('# Proposal A — written blind\n\nBody')).toBe('')
  })

  it('does not treat the corrected 676 half-A quoted heading as its own claim', () => {
    const correctedHalfA = `# Proposal A — written 13.08.2026 before seeing any other proposal

<!-- THE HEADING BELOW IS THE ORIGINAL AND IT IS WRONG about its own author. It was
     written by Claude ${OLD_MAIN}, not ${OLD_SCARCE}; see 676-provenance.md for the transcript
     metadata that settles it. The line is kept verbatim because it is the evidence
     of the mislabel, not a caption to be quietly corrected. -->

    # Proposal A — ${OLD_SCARCE}, written 13.08.2026 before seeing any other proposal`

    expect(claimedModelFromArtefact(correctedHalfA)).toBe('')
  })

  it('ignores model headings quoted in fenced code and HTML comments', () => {
    expect(
      claimedModelFromArtefact(`\`\`\`md\n<!-- quoted markup -->\n# Proposal A — ${OLD_SCARCE}\n\`\`\`\n# Proposal A — Claude ${OLD_MAIN}`),
    ).toBe(`Claude ${OLD_MAIN}`)
    expect(claimedModelFromArtefact(`<!--\n# Proposal A — ${OLD_SCARCE}\n-->\n# Proposal A — Claude ${OLD_MAIN}`)).toBe(
      `Claude ${OLD_MAIN}`,
    )
  })

  it('catches the 676 half-A mislabel across a session model switch', () => {
    const text = transcript(
      entry({ at: '2026-08-13T12:49:10.000Z', model: `${OLD_SCARCE_ID}`, id: 'last-scarce' }),
      entry({ at: '2026-08-13T12:49:22.000Z', model: `${OLD_MAIN_BARE_ID}`, id: 'first-main' }),
      entry({ at: '2026-08-13T15:34:26.009Z', model: `${OLD_MAIN_BARE_ID}`, id: 'writes-half-a' }),
      entry({ at: '2026-08-13T15:36:26.188Z', role: 'user' }),
    )
    const result = checkAuthorship({
      claimedModel: `${OLD_SCARCE}`,
      artefactAt: '2026-08-13T15:34:26.009Z',
      transcriptText: text,
    })
    expect(result).toMatchObject({
      status: 'disagreement',
      claimedModel: `${OLD_SCARCE}`,
      actualModel: `${OLD_MAIN_BARE_ID}`,
      messageId: 'writes-half-a',
    })
    expect(authorshipRefusesPermission(result)).toBe(true)
  })

  // The cross lane's transcript, under its retired names (point 1061). The half-B
  // case is the REAL 676 record of 13.08.2026 and keeps the oldest retired id,
  // because a rename may not cost a landed artefact its proof of authorship; the
  // second case is the same shape under the next name.
  const crossLaneTranscript = (turnModel, turnId) =>
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

  it('accepts the 676 half-B claim when its producing message names the same lane', () => {
    const result = checkAuthorship({
      claimedModel: `${OLDEST_CROSS}`,
      artefactAt: '2026-08-13T15:36:56.233Z',
      transcriptText: crossLaneTranscript(`${OLDEST_CROSS_ID}`, 'oldest-turn'),
    })
    expect(result.status).toBe('agreement')
    expect(result.actualModel).toBe(`${OLDEST_CROSS_ID}`)
    expect(authorshipRefusesPermission(result)).toBe(false)
  })

  it('accepts a later cross-lane claim when its producing message names it', () => {
    const result = checkAuthorship({
      claimedModel: `${OLD_CROSS}`,
      artefactAt: '2026-08-13T15:36:56.233Z',
      transcriptText: crossLaneTranscript(`${OLD_CROSS_ID}`, 'older-turn'),
    })
    expect(result.status).toBe('agreement')
    expect(result.actualModel).toBe(`${OLD_CROSS_ID}`)
    expect(authorshipRefusesPermission(result)).toBe(false)
  })

  it('uses a delegated sidechain message instead of assigning its artefact to the parent', () => {
    const text = transcript(
      entry({ at: '2026-08-13T10:00:00.000Z', model: `${OLD_MAIN_BARE_ID}`, id: 'parent' }),
      entry({
        at: '2026-08-13T10:00:03.000Z',
        model: `${OLD_SCARCE_ID}`,
        sidechain: true,
        id: 'delegated-write',
      }),
      entry({ at: '2026-08-13T10:00:04.000Z', role: 'user' }),
    )
    const result = checkAuthorship({
      claimedModel: `${OLD_SCARCE}`,
      artefactAt: '2026-08-13T10:00:03.000Z',
      transcriptText: text,
    })
    expect(result).toMatchObject({ status: 'agreement', sidechain: true, messageId: 'delegated-write' })
    expect(formatAuthorship(result)).toContain('delegated sidechain')
  })

  it('records missing and out-of-range transcripts as unverified', () => {
    expect(checkAuthorship({ claimedModel: `${OLD_SCARCE}`, artefactAt: 100, transcriptText: null })).toMatchObject({
      status: 'unverified',
      reason: expect.stringMatching(/transcript is missing/),
    })
    const text = transcript(
      entry({ at: '2026-08-13T10:00:00.000Z', model: `${OLD_SCARCE_ID}` }),
      entry({ at: '2026-08-13T10:01:00.000Z', role: 'user' }),
    )
    expect(
      checkAuthorship({
        claimedModel: `${OLD_SCARCE}`,
        artefactAt: '2026-08-14T10:00:00.000Z',
        transcriptText: text,
      }).status,
    ).toBe('unverified')
  })

  it('reports a heading with no model as unclaimed even when the transcript is readable', () => {
    const result = checkAuthorship({
      claimedModel: claimedModelFromArtefact('# Proposal A — written blind'),
      artefactAt: '2026-08-13T10:00:00.000Z',
      transcriptText: entry({ at: '2026-08-13T10:00:00.000Z', model: `${OLD_MAIN_BARE_ID}` }),
    })
    expect(result).toMatchObject({ status: 'unclaimed', actualModel: '' })
    expect(formatAuthorship(result)).toContain('NO CLAIM')
  })

  it('keeps readable evidence around a torn transcript line', () => {
    const read = readTranscriptMessages(
      transcript(
        '{torn',
        entry({ at: '2026-08-13T10:00:00.000Z', model: `${OLD_MAIN_BARE_ID}` }),
        entry({ at: '2026-08-13T10:00:01.000Z', role: 'user' }),
      ),
    )
    expect(read.malformedLines).toBe(1)
    expect(read.messages).toHaveLength(1)
  })
})
