// What a speaking figure may DO at the distance the player stands away
// (work-order point 580, docs/communication-poc-spec.md).
//
// THE RULE, in ONE place because it must hold identically for the children's
// situations and the adults' errands: a figure that GESTURES is a figure the
// player can hear and read, or it does not gesture. The gesture carries exactly
// as far as the voice and no further — beyond the hearing radius the figure
// stays still instead of miming a concept the player gets no word for.
//
// The reason it is a rule and not a detail: a gesture without its utterance is
// WORSE than plain silence, because it teaches a meaning with nothing to attach
// it to. The user reported it from the picture ("they gesture, but I see no
// texts over their heads", F6 report of 09.08.2026) — the utterances were out of
// earshot while the arms were not, so the village pantomimed.
//
// Pure logic: the scene measures the distance, this decides what follows from
// it. The radius itself stays the calibratable balance value, editable in the
// debug menu while the game runs, and this rule follows it wherever it is set.

import { balance } from '../config/balance'
import { isWithinHearing } from './heard'
import {
  restGesture,
  startGesture,
  type GestureAim,
  type GestureKind,
  type GestureState,
} from '../render/gesture'

/** What reaches the player from a figure speaking `distance` away. */
export interface SpeechReach {
  /** The utterance arrives: it is recorded, and its label is raised. */
  audible: boolean
  /** The figure gestures at all — the SAME gate, never one without the other. */
  gesture: boolean
}

/**
 * The one decision both speaking paths take. `gesture` is `audible` by
 * construction rather than by a second condition somebody has to keep in step:
 * there is no distance at which one is true and the other is not.
 */
export function speechReach(
  distance: number,
  radius: number = balance.communication.hearingRadius,
): SpeechReach {
  const audible = isWithinHearing(distance, radius)
  return { audible, gesture: audible }
}

/**
 * The gesture state a figure speaking `distance` away takes: the started
 * gesture within earshot, REST beyond it. Rest rather than "leave as it was" on
 * purpose — a figure the player has just walked away from stops its arms
 * instead of finishing a mime he can no longer read.
 */
export function gestureIfHeard(
  distance: number,
  kind: GestureKind,
  aim: GestureAim = {},
  radius: number = balance.communication.hearingRadius,
): GestureState {
  return speechReach(distance, radius).gesture ? startGesture(kind, aim) : restGesture()
}
