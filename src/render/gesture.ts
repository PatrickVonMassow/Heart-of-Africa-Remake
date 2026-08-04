// Villager gestures (point 479): the pose half of what an inhabitant does while
// it speaks. A cone with a sphere head cannot show WHAT it is talking about, and
// the pointing gesture is the anchor the HERE/THERE concepts hang on — so the
// figure gains arms, and this module is the state machine that moves them.
//
// Everything here is PURE: no THREE object, no clock, no React. The scene owns
// one `GestureState` per figure and advances it with the frame delta; the pose
// it reads back is a set of Euler angles for the two shoulder pivots. That split
// is what lets the whole behaviour be pinned in the fast Vitest layer, and it is
// what lets the speaking layer drive a gesture without knowing any geometry:
// `startGesture` takes a kind and an aim, nothing else.
//
// A gesture NEVER explains itself (point 479.3). This module therefore carries
// no labels, no text and no concept vocabulary — only bodies. What a beckon
// means is decided by what happens next in the world, not here.

/**
 * The four gestures that read at conversational distance.
 * - `beckon`  — come here: the arm scoops toward the speaker, repeatedly.
 * - `point`   — at a visible spot or person: the arm holds a straight aim.
 * - `refuse`  — no: both arms out, palms forward, the trunk shaking.
 * - `indicate`— that way: the arm sweeps out from the body onto a bearing.
 */
export type GestureKind = 'beckon' | 'point' | 'refuse' | 'indicate'

/** Every kind, in a stable order (menus, tests, the verification sweep). */
export const GESTURE_KINDS: readonly GestureKind[] = ['beckon', 'point', 'refuse', 'indicate']

/**
 * How long each gesture runs, in seconds. Bounded by construction: a gesture is
 * an event, never a state a figure can get stuck in, so `advanceGesture` returns
 * the figure to rest the moment its own duration is spent.
 * Calibratable starting values (CLAUDE.md §2): long enough to read from across a
 * village square, short enough that a figure gesturing twice reads as twice.
 */
export const GESTURE_DURATIONS: Record<GestureKind, number> = {
  beckon: 2.4,
  point: 2.0,
  refuse: 1.6,
  indicate: 2.6,
}

/**
 * Seconds the pose takes to grow out of rest and to settle back into it. The
 * envelope is what makes point 479's "the pose returns to rest" true
 * CONTINUOUSLY rather than by a snap on the last frame: a gesture starts at rest
 * and ends at rest, so a figure interrupted mid-gesture never jerks.
 */
export const GESTURE_BLEND = 0.3

/** One shoulder pivot's Euler angles, applied in `YXZ` order (see `armDirection`). */
export interface ArmPose {
  /** About local X. Negative raises the arm FORWARD (the figure's +Z). */
  pitch: number
  /** About local Y — the bearing the raised arm swings onto. */
  yaw: number
  /** About local Z. Positive swings the arm toward local +X (outward on the left). */
  roll: number
}

/** The whole figure's gesture pose: two arms plus the trunk that carries them. */
export interface FigurePose {
  /** The figure's LEFT arm — local +X, because forward is +Z and up is +Y. */
  left: ArmPose
  /** The figure's RIGHT arm — local −X. */
  right: ArmPose
  /** Forward lean of the trunk (rad, positive = leaning in). */
  lean: number
  /** Trunk yaw offset (rad) — the shake a refusal carries. It turns the TRUNK,
   *  not the head: the head is a featureless sphere, so yawing it would move no
   *  pixel at all. Point 351's chase reads its posture through `lean` in the
   *  same way. */
  turn: number
}

/** Which side an arm belongs to. */
export type ArmSide = 'left' | 'right'

/**
 * Arms at rest: hanging, and rolled OUT far enough to follow the flare of the
 * body cone rather than sink into it. The outward roll is not decoration — at a
 * smaller angle the whole forearm ends up inside the trunk and the figure reads
 * as armless with an odd stripe of self-shadow down its front, which is exactly
 * what the first rendered frame showed. `src/render/figures.test.ts` pins the
 * clearance against the cone so it cannot silently regress.
 * Frozen — the poses below are built fresh, never mutated in place, so a caller
 * can hold this as a comparison baseline.
 */
export const REST_POSE: FigurePose = Object.freeze({
  left: Object.freeze({ pitch: 0.04, yaw: 0, roll: 0.46 }) as ArmPose,
  right: Object.freeze({ pitch: 0.04, yaw: 0, roll: -0.46 }) as ArmPose,
  lean: 0,
  turn: 0,
}) as FigurePose

/**
 * A figure's gesture, or the absence of one. `kind: null` IS the rest state —
 * there is no separate flag, which is why a figure can never be half-gesturing
 * and why two gestures can never run at once on one figure: the field holds one
 * kind, and starting a second overwrites the first.
 */
export interface GestureState {
  kind: GestureKind | null
  /** Seconds since the gesture began. */
  t: number
  /** Seconds it runs in total; 0 at rest. */
  duration: number
  /** Aim in the FIGURE's own frame: 0 straight ahead, +X to its left. */
  bearing: number
  /** Aim elevation (rad): >0 above the shoulder, <0 below it. */
  elevation: number
  /** Per-figure phase offset so a crowd never gestures in lockstep. */
  phase: number
}

/** The rest state — no gesture running. */
export function restGesture(): GestureState {
  return { kind: null, t: 0, duration: 0, bearing: 0, elevation: 0, phase: 0 }
}

/** Is this figure gesturing right now? */
export function isGesturing(s: GestureState): boolean {
  return s.kind !== null
}

export interface GestureAim {
  /** Bearing in the figure's own frame (rad); 0 is straight ahead. */
  bearing?: number
  /** Elevation of the aimed spot (rad). */
  elevation?: number
  /** Override the kind's default duration (seconds). */
  duration?: number
  /** Per-figure phase offset (rad) so simultaneous gestures do not beat together. */
  phase?: number
}

/**
 * Begin a gesture. Returns a NEW state — the previous one is discarded whole,
 * which is the "no two gestures at once on one figure" rule expressed as data
 * rather than as a check somebody has to remember to write.
 * A non-finite or non-positive duration falls back to the kind's own.
 */
export function startGesture(kind: GestureKind, aim: GestureAim = {}): GestureState {
  const wanted = aim.duration
  const duration = Number.isFinite(wanted) && (wanted as number) > 0 ? (wanted as number) : GESTURE_DURATIONS[kind]
  return {
    kind,
    t: 0,
    duration,
    bearing: aim.bearing ?? 0,
    elevation: aim.elevation ?? 0,
    phase: aim.phase ?? 0,
  }
}

/**
 * Advance a gesture by one frame. Returns the rest state once the duration is
 * spent, so no caller has to notice the end. A negative or non-finite delta is
 * ignored rather than run backwards (a tab that was hidden hands out both).
 */
export function advanceGesture(s: GestureState, dt: number): GestureState {
  if (s.kind === null) return s
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0
  const t = s.t + step
  if (t >= s.duration) return restGesture()
  return { ...s, t }
}

/** Smooth 0→1 ramp with zero slope at both ends. */
function smoothstep(x: number): number {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

/**
 * How far into the pose the figure is at this instant: 0 at the start, 1 in the
 * middle, 0 again at the end. Also 0 for a gesture whose blend windows overlap
 * on a very short duration — a gesture too short to grow simply never shows,
 * which is better than one that snaps.
 */
export function gestureEnvelope(s: GestureState): number {
  if (s.kind === null || s.duration <= 0) return 0
  const blend = Math.min(GESTURE_BLEND, s.duration / 2)
  if (blend <= 0) return 0
  return Math.min(smoothstep(s.t / blend), smoothstep((s.duration - s.t) / blend))
}

/**
 * Which arm gestures toward a bearing: the one on that side. The figure faces
 * local +Z with up +Y, so its RIGHT is local −X (forward × up) — a bearing with
 * a positive sine lies to its LEFT. Picking the near arm is what keeps a point
 * from reading as an arm flung across the chest.
 */
export function gestureArm(bearing: number): ArmSide {
  return Math.sin(bearing) >= 0 ? 'left' : 'right'
}

/**
 * The shoulder angles that make a straight arm point along (bearing, elevation)
 * in the figure's own frame. Derived, not tuned: with the `YXZ` order the arm's
 * rest direction (0,−1,0) maps to (cos e·sin b, sin e, cos e·cos b) exactly at
 * this pitch — see `armDirection`, which the test checks against a real
 * `THREE.Object3D` so the maths and the renderer can never drift apart.
 */
export function armAim(bearing: number, elevation: number): ArmPose {
  return { pitch: -(Math.PI / 2 + elevation), yaw: bearing, roll: 0 }
}

/**
 * The unit direction an arm at this pose points in, in the figure's own frame.
 * Mirrors three.js' `YXZ` Euler composition (R = Ry·Rx·Rz) applied to the arm's
 * hanging rest direction (0,−1,0), so a caller can ask "where is the hand
 * aimed?" without touching the scene graph.
 */
export function armDirection(a: ArmPose): [number, number, number] {
  const sr = Math.sin(a.roll)
  const cr = Math.cos(a.roll)
  const sp = Math.sin(a.pitch)
  const cp = Math.cos(a.pitch)
  const sy = Math.sin(a.yaw)
  const cy = Math.cos(a.yaw)
  // Rz then Rx then Ry applied to (0,−1,0).
  const x = sr
  const y = -cr * cp
  const z = -cr * sp
  return [x * cy + z * sy, y, -x * sy + z * cy]
}

/**
 * The aim from a figure standing at (x,z) facing `yaw`, to a world point —
 * expressed in the figure's OWN frame, which is what `startGesture` wants. The
 * facing convention is the codebase's own (`rotation.y = atan2(dx, dz)`, local
 * +Z onto the heading), so a figure that turns takes its aim with it.
 */
export function aimAt(
  figure: { x: number; z: number; yaw: number },
  target: { x: number; y: number; z: number },
  shoulderY: number,
): { bearing: number; elevation: number } {
  const dx = target.x - figure.x
  const dz = target.z - figure.z
  // Into the figure's frame: rotate the world offset back by its yaw.
  const c = Math.cos(figure.yaw)
  const s = Math.sin(figure.yaw)
  const localX = dx * c - dz * s
  const localZ = dx * s + dz * c
  const flat = Math.hypot(localX, localZ)
  return {
    bearing: Math.atan2(localX, localZ),
    elevation: Math.atan2(target.y - shoulderY, flat || 1e-6),
  }
}

/** Blend an angle from rest toward a target by the envelope. */
function toward(rest: number, target: number, e: number): number {
  return rest + (target - rest) * e
}

/** Blend a whole arm from its rest pose toward a target pose. */
function blendArm(rest: ArmPose, target: ArmPose, e: number): ArmPose {
  return {
    pitch: toward(rest.pitch, target.pitch, e),
    yaw: toward(rest.yaw, target.yaw, e),
    roll: toward(rest.roll, target.roll, e),
  }
}

/**
 * The pose a gesture shows at its current instant. Pure: the same state always
 * yields the same pose, and a rest state always yields exactly `REST_POSE`.
 *
 * Each gesture is one MOTION, not one held shape — at conversational distance a
 * static arm reads as a stick, while a scoop, a shake or a sweep reads as an
 * intention:
 * - `beckon`  scoops the raised arm back toward the trunk, twice, leaning in.
 * - `point`   holds one straight aim, still, so the eye follows the arm out.
 * - `refuse`  raises both arms outward, palms forward, and shakes the trunk.
 * - `indicate` sweeps the arm from straight ahead out onto the bearing and
 *              holds it there — the travelling yaw is what tells it apart from
 *              a point at a still frame AND in motion.
 */
export function gesturePose(s: GestureState): FigurePose {
  const e = gestureEnvelope(s)
  if (s.kind === null || e <= 0) return { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 }
  const side = gestureArm(s.bearing)
  const otherSide: ArmSide = side === 'left' ? 'right' : 'left'
  const restArm = REST_POSE[side]
  const restOther = REST_POSE[otherSide]
  // Progress through the gesture, 0..1 — the sweeps and beats ride this rather
  // than a wall clock, so a gesture given a longer duration is SLOWER, not the
  // same motion with a pause bolted on.
  const u = s.duration > 0 ? Math.max(0, Math.min(1, s.t / s.duration)) : 0

  let arm: ArmPose
  let other: ArmPose = restOther
  let lean = 0
  let turn = 0

  switch (s.kind) {
    case 'beckon': {
      // Two scoops: the forearm-less arm swings up and forward, then folds back
      // toward the shoulder. The scoop rides `u`, so both beats always fit.
      const scoop = 0.5 - 0.5 * Math.cos(u * 4 * Math.PI)
      arm = {
        pitch: -(1.35 + scoop * 0.5),
        yaw: s.bearing * 0.55,
        roll: restArm.roll * 0.4,
      }
      lean = 0.09
      break
    }
    case 'point': {
      arm = armAim(s.bearing, s.elevation)
      lean = 0.04
      break
    }
    case 'refuse': {
      // Both arms out and up, palms forward; the trunk shakes three times.
      // Above the horizontal, or it reads as reaching down rather than refusing:
      // a hanging arm is at pitch 0, so π/2 only gets it level.
      arm = { pitch: -1.85, yaw: 0, roll: (side === 'left' ? 1 : -1) * 0.7 }
      other = { pitch: -1.85, yaw: 0, roll: (otherSide === 'left' ? 1 : -1) * 0.7 }
      turn = Math.sin(u * 6 * Math.PI + s.phase) * 0.42
      lean = -0.05
      break
    }
    case 'indicate': {
      // The arm leaves straight ahead and travels onto the bearing, then holds:
      // "that way", not "that spot". Sweep over the first 60 % of the gesture.
      const sweep = smoothstep(u / 0.6)
      arm = armAim(s.bearing * sweep, s.elevation * sweep)
      lean = 0.03
      break
    }
  }

  const posed: FigurePose = {
    left: side === 'left' ? blendArm(REST_POSE.left, arm, e) : blendArm(REST_POSE.left, other, e),
    right: side === 'right' ? blendArm(REST_POSE.right, arm, e) : blendArm(REST_POSE.right, other, e),
    lean: lean * e,
    turn: turn * e,
  }
  return posed
}

/**
 * How far a pose stands from rest, as a single scalar (rad, summed over the
 * angles that move). The verification and the tests use it to say "this figure
 * is visibly gesturing" without asserting on a hand-picked angle.
 */
export function poseDistanceFromRest(p: FigurePose): number {
  const arm = (a: ArmPose, r: ArmPose) =>
    Math.abs(a.pitch - r.pitch) + Math.abs(a.yaw - r.yaw) + Math.abs(a.roll - r.roll)
  return arm(p.left, REST_POSE.left) + arm(p.right, REST_POSE.right) + Math.abs(p.lean) + Math.abs(p.turn)
}
