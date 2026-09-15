// The drummer's own word (design.md §13.4, docs/communication-poc-spec.md).
//
// While the chief is in his hut, the use key at the drummer belongs to the
// drummer: he points his arm at that hut and names the man — CHIEF, one atom of
// the same tonal language, heard, noted and guessed at exactly like every word
// a villager says.
//
// The key is read in PlaceScene and the drummer is drawn in PlaceLife, so the
// two meet here rather than through a prop chain — the same module-level
// channel the chief's own figure uses (chiefPresence.ts). Scene furniture: it
// is registered while the figure stands and cleared on unmount, and nothing
// here is ever saved.

/** Points at a spot in the settlement and says CHIEF, from where the man stands. */
export type DrummerVoice = (hut: readonly [number, number]) => void

let voice: DrummerVoice | null = null

/** The drawn drummer registers his voice while he stands, and clears on unmount. */
export function setDrummerVoice(next: DrummerVoice | null): void {
  voice = next
}

/** Make the drummer point at the chief's hut and name him. Silent with no drummer. */
export function drummerNamesChief(hut: readonly [number, number]): void {
  voice?.(hut)
}

/** Requests survive a busy village floor; repeating the use key queues a new
 * word, rather than overwriting the request already waiting. */
export function queuedDrummerVoice(
  floor: import('../../communication/speechFloor').SpeechFloor,
  source: import('../../communication/speechFloor').FloorSource,
  speak: DrummerVoice,
) {
  const pending: Array<{ hut: readonly [number, number]; owner: object }> = []
  return {
    voice: (hut: readonly [number, number]) => { pending.push({ hut: [...hut], owner: {} }) },
    step: (blocked = false) => {
      const word = pending[0]
      if (!word || !floor.request({ situation: word.owner, name: 'drummer names chief', word: 'CHIEF', source, sources: () => [source], blocked, ends: true })) return
      pending.shift()
      speak(word.hut)
    },
    dispose: () => {
      for (const word of pending) floor.release(word.owner)
      pending.length = 0
    },
  }
}
