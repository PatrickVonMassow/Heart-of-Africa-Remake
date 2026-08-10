// Which speaker a click would take (design.md §13.4, work-order point 588).
//
// The guess belongs where the guess is formed, so a click in the settlement
// opens the reading dialog for ONE speaker. Which one must never be in doubt:
// the NEAREST one, and his label alone carries the highlight and the invitation
// to click.
//
// Pure logic — no scene, no store, no clock. The caller measures the distances,
// this decides. A tie KEEPS the standing pick: two figures walking abreast are
// never equal to the last decimal, so the hold is a hand's breadth wide rather
// than an exact comparison, and the highlight cannot flicker between them.

/** One speaking figure and how far it stands from the player, in place units. */
export interface SpeechTargetCandidate {
  speakerId: string
  /** Distance to the player on the ground plane. */
  distance: number
}

/**
 * How much nearer a rival speaker must be before the pick moves, in place
 * units. Not a balance value: it is the WIDTH OF A TIE, not a calibratable
 * gameplay number — wide enough that two figures side by side do not swap the
 * highlight between frames, far narrower than the step between two speakers the
 * player would tell apart.
 */
export const TARGET_HOLD = 0.5

/**
 * The speaker a click would take, or null when none is close enough. Candidates
 * beyond `maxDistance` are out of reach — the player must be able to hear the
 * voice he is guessing at, so the reach is the hearing radius.
 */
export function pickSpeechTarget(
  candidates: readonly SpeechTargetCandidate[],
  current: string | null,
  maxDistance: number,
): string | null {
  const inReach = candidates.filter((c) => Number.isFinite(c.distance) && c.distance <= maxDistance)
  if (inReach.length === 0) return null
  // Sorted by distance, ties broken by id: the FIRST pick of a frame is then
  // decided by the world and never by the order the labels happen to arrive in.
  const best = [...inReach].sort(
    (a, b) => a.distance - b.distance || (a.speakerId < b.speakerId ? -1 : 1),
  )[0]
  const held = current === null ? undefined : inReach.find((c) => c.speakerId === current)
  if (held && held.distance <= best.distance + TARGET_HOLD) return held.speakerId
  return best.speakerId
}

/** What the notes show while a dialog stands open. */
export interface LabelPresentation {
  /** The speaker whose note carries the highlight and the invitation, if any. */
  targetedId: string | null
  /** The speaker whose note is not drawn at all, because a dialog says it. */
  hiddenId: string | null
}

/**
 * How the notes are drawn while a modal stands open (point 588). A click is
 * ignored while ANY dialog is open, so a highlight and its invitation would
 * promise something the game will not do — no dialog, no target.
 *
 * The guess dialog additionally REPLACES the note it was opened from: it shows
 * the same syllables, larger and in the middle of the screen, and the note
 * behind it would only frame it with an invitation to open what is already open.
 */
export function labelPresentation(
  dialog: { kind: string; speakerId?: string } | null | undefined,
  targetId: string | null,
): LabelPresentation {
  if (!dialog) return { targetedId: targetId, hiddenId: null }
  return {
    targetedId: null,
    hiddenId: dialog.kind === 'speechGuess' ? (dialog.speakerId ?? null) : null,
  }
}
