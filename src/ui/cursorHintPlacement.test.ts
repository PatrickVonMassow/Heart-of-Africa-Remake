import { describe, it, expect } from 'vitest'
import { HINT_GAP, planCursorHint, type HintMeasures } from './cursorHintPlacement'

/** A 1440-wide band with the row's 12px margins, an empty left and right end. */
const band = (over: Partial<HintMeasures> = {}): HintMeasures => ({
  row: { left: 12, right: 1428 },
  leftEnd: 12,
  rightStart: 1428,
  width: 150,
  ...over,
})

describe('cursor-mode hint placement (point 1160)', () => {
  it('centres the hint in the row when both ends leave room', () => {
    expect(planCursorHint(band())).toEqual({ mode: 'centre' })
  })

  it('still centres when a group ends exactly one gap short of the hint', () => {
    // Centre of 12..1428 is 720, so the hint spans 645..795.
    expect(planCursorHint(band({ leftEnd: 645 - HINT_GAP }))).toEqual({ mode: 'centre' })
    expect(planCursorHint(band({ rightStart: 795 + HINT_GAP }))).toEqual({ mode: 'centre' })
  })

  it('yields beside the bar once a wide inventory reaches the centred box', () => {
    const wide = planCursorHint(band({ leftEnd: 700 }))
    expect(wide).toEqual({ mode: 'beside', left: 700 + HINT_GAP - 12 })
  })

  it('yields as well when the buttons reach it from the right', () => {
    expect(planCursorHint(band({ rightStart: 780 }))).toEqual({ mode: 'beside', left: HINT_GAP })
  })

  it('hides only where neither placement fits without overlapping', () => {
    expect(planCursorHint(band({ leftEnd: 700, rightStart: 800 }))).toEqual({ mode: 'hidden' })
    // One pixel of the needed span is enough to keep it beside the bar.
    expect(planCursorHint(band({ leftEnd: 700, rightStart: 700 + HINT_GAP + 150 + HINT_GAP })))
      .toMatchObject({ mode: 'beside' })
  })

  it('answers centre while nothing is measured yet', () => {
    expect(planCursorHint(null)).toEqual({ mode: 'centre' })
    expect(planCursorHint(band({ width: 0 }))).toEqual({ mode: 'centre' })
    expect(planCursorHint(band({ row: { left: 0, right: 0 } }))).toEqual({ mode: 'centre' })
  })

  it('reads the viewport centre from the row, not from a constant', () => {
    // A narrow viewport: the row is 12..588, so its centre is 300.
    const narrow = band({ row: { left: 12, right: 588 }, rightStart: 588, width: 150 })
    expect(planCursorHint(narrow)).toEqual({ mode: 'centre' })
    expect(planCursorHint({ ...narrow, leftEnd: 230 })).toMatchObject({ mode: 'beside' })
  })
})
