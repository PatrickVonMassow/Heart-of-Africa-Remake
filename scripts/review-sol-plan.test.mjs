import { describe, expect, it } from 'vitest'
import {
  formatAuthorshipPlan,
  formatContributionPassPlan,
  formatUnavailableReceiptRoute,
} from './review-sol.mjs'
import { planAuthorshipGroups } from './mechanism-review-range-core.mjs'

const sha = 'a'.repeat(40)
const base = 'b'.repeat(40)
const pass = {
  index: 1,
  total: 2,
  size: 1200,
  endState: sha,
  rangeBase: base,
  files: ['scripts/example-guard.mjs'],
  reviewer: 'Opus 5',
  reviewerVendor: 'anthropic',
}

describe('printed review pass commands', () => {
  it('carries the measured baseline and assigned reviewer in the authorship plan', () => {
    const text = formatAuthorshipPlan({
      budget: 200_000,
      rawSize: 2400,
      fits: false,
      passes: [pass],
      mixedFiles: [],
      unreviewable: [],
      dropped: [],
      superseded: [],
    }, { sha })

    expect(text).toContain(
      `node scripts/review-sol.mjs --sha ${sha} --since ${base} ` +
        '--reviewer opus --brief "<what to judge>" --pass 1',
    )
  })

  it('carries the assigned reviewer in the contribution-scoped plan', () => {
    const text = formatContributionPassPlan({
      passCount: 1,
      contributions: [{
        sha,
        base,
        fits: true,
        passes: [{ ...pass, total: 1 }],
        uncoverable: [],
        unreviewable: [],
      }],
    })

    expect(text).toContain(
      `node scripts/review-sol.mjs --sha ${sha} --since ${base} ` +
        '--reviewer opus --brief "<what to judge>"',
    )
  })

  it('reproduces de7e175 passes 4 and 5 as Opus 5 reviews of Sol-authored files', () => {
    const pass4Files = [
      'src/communication/chiefReply.test.ts',
      'src/communication/chiefReply.ts',
      'src/communication/drumMessage.test.ts',
      'src/communication/drumMessage.ts',
      'src/communication/speaking.test.ts',
      'src/communication/speechLabel.test.ts',
      'src/scenes/place/speechChannel.test.ts',
      'src/state/store.communication.test.ts',
      'src/state/store.rockArtefact.test.ts',
      'src/systems/ambience.test.ts',
      'src/ui/DrumMessage.test.tsx',
      'src/ui/JournalPanel.test.tsx',
    ]
    const pass5Files = [
      'src/ui/SpeechGuess.test.tsx',
      'src/ui/SpeechLabelCard.test.tsx',
      'src/scenes/place/adultErrands.test.ts',
      'src/scenes/place/childSituations.test.ts',
    ]
    const files = [...pass4Files, ...pass5Files]
    const routed = planAuthorshipGroups({
      commits: [{ sha, authorModel: 'GPT-5.6 Sol', files }],
      endStateFiles: files,
    })
    expect(routed.groups).toHaveLength(1)
    expect(routed.groups[0]).toMatchObject({ reviewer: 'Opus 5', files })

    const text = formatAuthorshipPlan({
      budget: 200_000,
      rawSize: 2_696_406,
      fits: false,
      passes: [
        { ...pass, index: 4, total: 16, size: 191_618, files: pass4Files },
        { ...pass, index: 5, total: 16, size: 86_183, files: pass5Files },
      ],
      mixedFiles: [],
      unreviewable: [],
      dropped: [],
      superseded: [],
    }, { sha: 'de7e175213bac848263bd6f59a1b6c6ea45af5d9' })

    expect(text).toContain('pass 4/16 → anthropic reviewer Opus 5')
    expect(text).toContain('pass 5/16 → anthropic reviewer Opus 5')
    expect(text).toContain('--reviewer opus --brief "<what to judge>" --pass 4')
    expect(text).toContain('--reviewer opus --brief "<what to judge>" --pass 5')
  })

  it('prints a point-bound receipt instead of a runnable index when nobody is eligible', () => {
    const files = ['scripts/no-independent-reviewer.mjs']
    const routed = planAuthorshipGroups({
      commits: [{
        sha,
        authorModels: ['GPT-5.6 Sol', 'Opus 5', 'Fable 5', 'Opus 4.8'],
        files,
      }],
      endStateFiles: files,
    })
    const plan = {
      budget: 200_000,
      rawSize: 1200,
      fits: false,
      passes: [],
      mixedFiles: [],
      unreviewable: routed.unreviewable,
      dropped: [],
      superseded: [],
    }
    const text = `${formatAuthorshipPlan(plan, { sha })}\n${formatUnavailableReceiptRoute(plan, {
      sha,
      point: 1008,
    })}`

    expect(text).toContain('UNREVIEWABLE: scripts/no-independent-reviewer.mjs')
    expect(text).not.toMatch(/pass \d+\/\d+/)
    expect(text).not.toContain('node scripts/review-sol.mjs --sha')
    expect(text).toContain(`--record-unavailable ${sha} --point 1008`)
    expect(text).toContain('--files "scripts/no-independent-reviewer.mjs"')
  })
})
