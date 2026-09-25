/** Subscribe before entry: record first hearings at the state transition, even
 * while navigation or a screenshot is awaiting the browser. No polling gaps. */
export function observeFirstHearings(store, clocks) {
  const initial = Object.keys(store.getState().communication.heard)
  const events = []
  const stop = store.subscribe((state, previous) => {
    for (const atom of Object.keys(state.communication.heard)) {
      if (Object.hasOwn(previous.communication.heard, atom)) continue
      events.push({ atom, concept: Object.keys(state.vocabulary).find((c) => state.vocabulary[c] === atom),
        ...clocks(), placeId: state.placeId, heardBefore: Object.keys(previous.communication.heard) })
    }
  })
  return { initial, events, stop }
}
