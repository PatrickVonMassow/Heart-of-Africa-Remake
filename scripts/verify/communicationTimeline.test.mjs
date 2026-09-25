import { expect, it } from 'vitest'
import { observeFirstHearings } from './communicationTimeline.mjs'
it('records first-hearing order once, including unheard atoms arriving together on drums', () => {
  let listener, now = 1
  let state = { communication: { heard: {} }, vocabulary: { ROCK: 'ba', UPSTREAM: 'BA' }, placeId: 'village' }
  const stop = () => { listener = null }
  const store = { getState: () => state, subscribe: (fn) => { listener = fn; return stop } }
  const timeline = observeFirstHearings(store, () => ({ pageMs: now++, audioSeconds: now / 1000 }))
  const hear = (heard) => { const previous = state; state = { ...state, communication: { heard } }; listener(state, previous) }
  hear({ ba: {} }); hear({ ba: {}, BA: {} }); hear({ ba: {}, BA: {} })
  expect(timeline.events.map((e) => [e.concept, e.pageMs, e.heardBefore])).toEqual([['ROCK', 1, []], ['UPSTREAM', 2, ['ba']]])
  timeline.stop(); expect(listener).toBeNull()
})
