// The horizon maps' fetch gate (design.md §2.7): the request itself is gated on
// the EFFECTIVE graphics level, never merely the use of the result. At low the
// maps are never requested — a `?quality=low` start costs the player those
// megabytes nothing — and raising the level later issues the request exactly
// once; lowering and raising again re-uses it.

export interface HorizonMapGate<T> {
  /** Report the current effective state (true = the level wants the maps).
   *  Returns the pending/settled load once requested, else null. */
  update(wanted: boolean): Promise<T> | null
  /** Number of loads issued so far (0 or 1). */
  readonly requests: number
}

export function createHorizonMapGate<T>(load: () => Promise<T>): HorizonMapGate<T> {
  let pending: Promise<T> | null = null
  let requests = 0
  return {
    update(wanted) {
      if (!wanted) return pending
      if (!pending) {
        requests++
        pending = load()
        // A failed load may be retried on the next rise.
        pending.catch(() => {
          pending = null
        })
      }
      return pending
    },
    get requests() {
      return requests
    },
  }
}
