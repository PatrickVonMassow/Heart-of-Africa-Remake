// Forms and sockets: a shape the traveller carries, and a place shaped to take
// it (docs/communication-poc-spec.md).
//
// THIS IS A SYSTEM, NOT A ONE-OFF. An item carries a FORM ID, a place carries a
// SOCKET that names the same form, and the use key at proximity resolves the
// two. The clay impression the chief pays with and the rock at the foot of the
// Bandiagara escarpment are the first pair; a pyramid or the Sphinx must later
// be a DATA LINE below, never a second mechanism.
//
// The rules of the pair are decided HERE and not left to the first caller:
//   - the traveller may carry SEVERAL forms; a socket picks the one that
//     matches it and ignores the rest, so nothing has to be "selected" first;
//   - a socket is either open or SPENT; a spent one answers exactly like a
//     wrong place, so a second press teaches no new rule;
//   - a form is NOT consumed by fitting it — it stays in the pack, so a second
//     visit is never a dead end;
//   - anything that does not fit is a MISS, and a miss is answerable: the
//     caller says so in the traveller's own voice rather than in silence.
//
// Pure data and pure geometry: no store, no scene, no strings.

import { CULTURAL_LANDMARKS } from './data/landmarks'
import type { LatLon } from './geo'

/** The shapes an item can have. One entry per form in the world. */
export type FormId = 'rock-relief'

export const FORM_IDS: readonly FormId[] = ['rock-relief']

/** The places shaped to take one. */
export type SocketId = 'bandiagara-talus'

export interface FormSocket {
  id: SocketId
  /** The form that fits it. Nothing else does. */
  form: FormId
  /** The landmark whose drawn position IS the socket's position. */
  landmarkId: string
}

/**
 * THE DATA LINES. Adding a lock is adding one of these plus its form.
 *
 * `bandiagara-talus` sits at the TALUS FOOT of the escarpment — the ground the
 * Dogon of 1890 lived on — and deliberately NOT in the niches of the cliff
 * face, which are Tellem burial and granary places
 * (docs/205-world-accuracy-findings.md A18). Nothing is opened up there, and
 * the socket is unreachable from up there by construction: the position below
 * is the landmark's own ground coordinate, and the niches are drawn metres up
 * the face above it.
 */
export const FORM_SOCKETS: readonly FormSocket[] = [
  { id: 'bandiagara-talus', form: 'rock-relief', landmarkId: 'bandiagara' },
]

/**
 * Where a socket stands, read from the landmark registry the SCENE draws from
 * (the river-cleared `CULTURAL_LANDMARKS`, never the raw definition): the rule
 * of points 129/378 — derive the spot from what the picture shows, so no
 * second, drifting position can exist.
 *
 * The landmark coordinate is the model's ORIGIN, which is where the escarpment
 * meets the ground. The model's yaw is drawn per run, so a directional offset
 * from that origin would not be the same place twice; a radius around the
 * origin is the only yaw-stable formulation of "at its foot".
 */
export function socketPosition(socket: FormSocket): LatLon {
  const landmark = CULTURAL_LANDMARKS.find((c) => c.id === socket.landmarkId)
  if (!landmark) throw new Error(`form socket ${socket.id} names no landmark: ${socket.landmarkId}`)
  return { lat: landmark.lat, lon: landmark.lon }
}

/** What a press of the use key with the carried forms amounts to. */
export type FormUse =
  /** A matching, open socket is within reach — the form fits. */
  | { kind: 'fits'; socket: FormSocket }
  /** Nothing here takes any form the traveller carries: wrong place, or spent. */
  | { kind: 'no-fit' }

export interface FormUseQuery {
  lat: number
  lon: number
  /** Reach in degrees — the same kind of radius the digging uses. */
  radiusDeg: number
  /** Every form in the pack; order carries no meaning. */
  carriedForms: readonly FormId[]
  /** The sockets already used. A spent socket answers like a wrong place. */
  spentSockets: readonly SocketId[]
}

/**
 * Which socket, if any, the traveller's forms answer to where he stands.
 *
 * A spent socket is skipped rather than reported, so its answer is the same
 * sentence a wrong place gives: the world does not tell him he is standing at a
 * lock he has already opened, and no meaning has to be read into a second
 * press.
 */
export function resolveFormUse(q: FormUseQuery): FormUse {
  for (const socket of FORM_SOCKETS) {
    if (!q.carriedForms.includes(socket.form)) continue
    if (q.spentSockets.includes(socket.id)) continue
    const at = socketPosition(socket)
    if (Math.hypot(q.lat - at.lat, q.lon - at.lon) <= q.radiusDeg) return { kind: 'fits', socket }
  }
  return { kind: 'no-fit' }
}
