// THE WEAVER'S WORK AND HER TWO WORDS (work-order 1157).
//
// Two things run here, and only one of them speaks.
//
// THE WEAVING has one clack per pass: the shuttle goes across the warp and
// back, the reed beats the weft down on each arrival, and the woven strip grows
// from the seat along the warp by a small length per completed pass until it
// reaches the stake and is taken off. A player who watches for half a minute
// sees progress, not a loop on a fixed picture.
//
// THE TENDING is sparse and spoken. A few times a minute the warp needs
// something done at one end — a thread freed, the drag weight shifted, a bundle
// fetched — and the weaver NAMES the direction: UPSTREAM or DOWNSTREAM. She
// does not point and does not mime. The helper walks that way along the warp,
// works there, and comes back. The word sits on a body that moves that way,
// which is the children's own grammar applied to a different picture.
//
// Two rules decide the shape of everything below:
//  - NOBODY SPEAKS TO NOBODY (design.md §13.4). With no helper at the station
//    the order is not given at all; it waits.
//  - The seat is the warp's MIDDLE, so both words send the helper AWAY. That is
//    geometry (`./loom`), and this module only has to never undo it: it walks
//    him to a stand on the named side and nowhere else.
//
// The module is pure: no three, no scene, no clock of its own.

import type { Vocabulary } from '../../communication/lexicon'
import { balance } from '../../config/balance'
import { SpeechFloor } from '../../communication/speechFloor'
import { instructionDelay } from '../../communication/speaking'
import { devAssert } from '../../systems/devAssert'
import { armAim, REST_POSE, type FigurePose } from '../../render/gesture'
import type { ConceptId } from '../../communication/lexicon'

/** The two words the loom teaches. They are also their own concept ids. */
export type LoomDirection = Extract<ConceptId, 'UPSTREAM' | 'DOWNSTREAM'>

export const LOOM_DIRECTIONS: readonly LoomDirection[] = ['UPSTREAM', 'DOWNSTREAM']

/** Which way along the warp a direction points; downstream is positive. */
export function warpSign(direction: LoomDirection): 1 | -1 {
  return direction === 'DOWNSTREAM' ? 1 : -1
}

export interface LoomWorkConfig {
  warpHalf: number
  tendStand: number
  passSeconds: number
  clothPerPass: number
  tendIntervalSeconds: number
  tendIntervalSpread: number
  tendDwellSeconds: number
  helperPace: number
  foldSeconds: number
  helperCycleSeconds: number
}

export interface LoomWorkView {
  vocabulary: Vocabulary
  /** Whether the two direction words exist in this settlement at all. False
   *  where the warp lies on no river and there is no upstream to name. */
  teaches: boolean
  /** Whether the helper is at the station to take an order. */
  helper: boolean
  /** Where the weaver sits — where her word falls. */
  seat: { x: number; z: number }
  /** Whether a child is near enough to hear a word spoken at the seat. The
   *  adults' own rule (688): the word waits rather than arriving in that ear. */
  childrenHear: (x: number, z: number) => boolean
  /** The settlement's floor; one exchange speaks at a time. */
  floor?: SpeechFloor
}

/** The helper's errand along the warp. */
export interface LoomErrand {
  toward: LoomDirection
  /**
   * `hold` is the pause between the word and the first step (work-order 1184):
   * the helper stands at the seat, having been told, and has not set off yet.
   * The errand EXISTS during it, so the station stages no second order into the
   * gap and the hold sits inside the tending cycle rather than on top of it.
   */
  phase: 'hold' | 'walk' | 'work' | 'return'
  /** Signed metres from the seat along the warp; downstream is positive. */
  at: number
  /** Seconds spent in the current phase. */
  clock: number
}

export interface LoomWorkState {
  clock: number
  /** A take-off holds the full strip while she folds it. */
  fold: number | null
  /** Events for this step only, consumed by the scene. */
  beats: number
  finished: number
  bundles: Record<LoomDirection, number>
  /**
   * Phase of the shuttle's pass, 0..1. It leaves the weaver's hand at 0,
   * reaches the far side at 0.5 and is back at 1, where the pass completes.
   */
  pass: number
  /** Completed passes since the strip was last taken off — the picture's own
   *  proof that the cycle is time-driven and not a fixed loop. */
  passes: number
  /** Metres of woven strip, measured from the seat along the warp. */
  cloth: number
  /** Seconds until the next named tending is due. */
  untilCall: number
  errand: LoomErrand | null
  /** The direction of the previous call, so the same word is never said three
   *  times running — a helper who always walks to the same end would teach
   *  "the other end", not a direction. */
  lastCall: LoomDirection | null
  /** How many times in a row it has been said. */
  lastRun: number
  /** Set on the step a word is spoken, and read by the scene that frame. */
  spoken: LoomDirection | null
  /** A word whose moment has come and which has not been said yet. */
  owed: LoomDirection | null
  /** Seconds the owed word has been waiting WITH somebody to say it to; a
   *  backstop watches it. Time with no helper does not count — see below. */
  owedFor: number
  /** The floor identity of this station's one exchange. */
  readonly situation: object
}

/** A station that has just been entered: nothing woven, nothing owed. */
export function createLoomWork(cfg: LoomWorkConfig, rand: () => number): LoomWorkState {
  return {
    clock: 0,
    fold: null,
    beats: 0,
    finished: 0,
    bundles: { UPSTREAM: 0, DOWNSTREAM: 0 },
    pass: rand(),
    passes: 0,
    cloth: rand() * cfg.warpHalf * 0.6,
    untilCall: nextInterval(cfg, rand),
    errand: null,
    lastCall: null,
    lastRun: 0,
    spoken: null,
    owed: null,
    owedFor: 0,
    situation: {},
  }
}

function nextInterval(cfg: LoomWorkConfig, rand: () => number): number {
  const spread = cfg.tendIntervalSeconds * cfg.tendIntervalSpread
  return cfg.tendIntervalSeconds - spread + rand() * spread * 2
}

/** The next direction: free, except that it never runs to a third repeat. */
function pickDirection(state: LoomWorkState, rand: () => number): LoomDirection {
  const drawn: LoomDirection = rand() < 0.5 ? 'UPSTREAM' : 'DOWNSTREAM'
  if (state.lastCall && state.lastRun >= 2 && drawn === state.lastCall) {
    return state.lastCall === 'UPSTREAM' ? 'DOWNSTREAM' : 'UPSTREAM'
  }
  return drawn
}

/** How long the helper's walk to his stand takes, at the configured pace. */
export function tendWalkSeconds(cfg: LoomWorkConfig): number {
  return cfg.tendStand / cfg.helperPace
}

/**
 * Backstop: a word that has been owed this long without ever being said means
 * the station is stuck — no helper for minutes, or a floor that never grants.
 * Long enough that a hush and a busy village are not defects, short enough that
 * a genuinely mute loom is reported while the player is still standing there.
 */
export const LOOM_WORD_BACKSTOP_SECONDS = 90

/**
 * One step of the station. Returns the direction spoken on this step, or null.
 *
 * The weaving never waits for anything: it is the life of the picture and it
 * runs whether or not anybody is there to be spoken to.
 */
export function stepLoomWork(
  state: LoomWorkState,
  view: LoomWorkView,
  dt: number,
  cfg: LoomWorkConfig,
  rand: () => number,
): LoomDirection | null {
  state.clock += dt
  state.spoken = null

  state.beats = 0
  state.finished = 0
  // Consume boundaries, including take-off time, so a long frame cannot lose
  // a strip or play two beats for the same pass.
  let remaining = Math.max(0, dt)
  while (remaining > 1e-9) {
    if (state.fold !== null) {
      const used = Math.min(remaining, (1 - state.fold) * cfg.foldSeconds)
      state.fold += used / cfg.foldSeconds
      remaining -= used
      if (state.fold >= 1 - 1e-9) {
        state.fold = null
        state.cloth = Math.max(0, state.cloth - cfg.warpHalf)
        state.finished++
      }
    } else {
      const used = Math.min(remaining, (1 - state.pass) * cfg.passSeconds)
      state.pass += used / cfg.passSeconds
      remaining -= used
      if (state.pass >= 1 - 1e-9) {
        state.pass = 0
        state.passes++
        state.beats++
        state.cloth += cfg.clothPerPass
        if (state.cloth >= cfg.warpHalf) state.fold = 0
      }
    }
  }

  // THE HELPER'S ERRAND. He walks the warp, works at the end he was sent to,
  // and comes back to the weaver's side.
  const errand = state.errand
  if (errand) {
    errand.clock += dt
    const target = warpSign(errand.toward) * cfg.tendStand
    if (errand.phase === 'hold') {
      // HE WAS TOLD, AND HE IS LISTENING (work-order 1184). The instruction
      // used to move him in the frame it was spoken, before its four syllables
      // had finished, which reads as the weaver narrating her own helper rather
      // than as an order given to him.
      if (errand.clock >= instructionDelay(errand.toward, view.vocabulary)) {
        errand.phase = 'walk'
        errand.clock = 0
      }
    } else if (errand.phase === 'walk') {
      errand.at = approach(errand.at, target, cfg.helperPace * dt)
      if (Math.abs(errand.at - target) < 1e-6) {
        errand.phase = 'work'
        errand.clock = 0
      }
    } else if (errand.phase === 'work') {
      if (errand.clock >= cfg.tendDwellSeconds) {
        const other = errand.toward === 'UPSTREAM' ? 'DOWNSTREAM' : 'UPSTREAM'
        // Old yarn is used up; a replenished end must still differ from its
        // opposite, including after repeated visits to both ends.
        let bundles = state.bundles[errand.toward] % 3 + 1
        if (bundles === state.bundles[other]) bundles = bundles % 3 + 1
        state.bundles[errand.toward] = bundles
        errand.phase = 'return'
        errand.clock = 0
      }
    } else {
      errand.at = approach(errand.at, 0, cfg.helperPace * dt)
      if (Math.abs(errand.at) < 1e-6) state.errand = null
    }
  }

  // THE NAMED TENDING (items 7 and 8). Sparse, and never while the station is
  // already busy with one.
  if (!state.owed && !state.errand) {
    state.untilCall -= dt
    if (state.untilCall <= 0 && view.teaches) {
      state.owed = pickDirection(state, rand)
      state.owedFor = 0
    }
  }

  if (state.owed) {
    // NOBODY SPEAKS TO NOBODY: with no helper at the station the order is not
    // given at all, and it is not lost either — it waits for him.
    const blocked = !view.helper || view.childrenHear(view.seat.x, view.seat.z)
    // The backstop counts only the time the word COULD have been said. A
    // station with nobody to address is LEGITIMATELY quiet, and an alarm that
    // cries on a healthy quiet spell is switched off within a week (point 589).
    if (view.helper) state.owedFor += dt
    const floor = view.floor
    const allowed = !blocked && (!floor || floor.request({
      situation: state.situation,
      name: 'loom',
      word: state.owed,
      source: { x: view.seat.x, z: view.seat.z, register: 'talk' },
      sources: () => [{ x: view.seat.x, z: view.seat.z, register: 'talk' as const }],
      blocked: false,
      step: dt,
      ends: true,
      actAfter: instructionDelay(state.owed, view.vocabulary),
    }))
    if (allowed) {
      const said = state.owed
      state.lastRun = said === state.lastCall ? state.lastRun + 1 : 1
      state.lastCall = said
      state.spoken = said
      state.owed = null
      state.owedFor = 0
      state.untilCall = nextInterval(cfg, rand)
      // The helper's walk is the word's visible consequence, and the body IS
      // still the meaning — it simply must not move before the word has been
      // heard out (work-order 1184). He stands at the seat for the word's own
      // length plus `instructionHoldSeconds`, then sets off.
      state.errand = { toward: said, phase: 'hold', at: 0, clock: 0 }
      return said
    }
    devAssert(
      state.owedFor < LOOM_WORD_BACKSTOP_SECONDS,
      'loom-word-stuck',
      () => `the loom has owed ${state.owed} for ${state.owedFor.toFixed(0)} s without saying it`,
    )
  }
  return null
}

/** Move `value` toward `target` by at most `step`. */
function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(target, value + step)
  return Math.max(target, value - step)
}

/**
 * The visible state of the station on one frame, in the loom's own local frame:
 * the shuttle's place across the warp, the beat the reed is in, and how far the
 * woven strip reaches from the seat.
 */
export interface LoomPicture {
  /** The shuttle's offset across the warp, -1 (near hand) .. 1 (far hand). */
  shuttle: number
  /** The reed's beat, 0 (lifted) .. 1 (driven home). */
  beat: number
  /** Metres of woven strip from the seat along the warp, downstream. */
  cloth: number
  /** Where the helper stands: signed metres from the seat along the warp. */
  helperAt: number
  /** Whether he is working rather than walking. */
  helperWorking: boolean
  helperCycle: number
  helperCarrying: boolean
  fold: number | null
  bundles: Record<LoomDirection, number>
}

export function loomPicture(state: LoomWorkState, helperCycleSeconds = balance.villageLife.loom.helperCycleSeconds): LoomPicture {
  // The shuttle crosses and returns once per pass; the reed beats as it lands,
  // which is what gives the body its lean.
  const across = Math.sin(state.pass * Math.PI * 2)
  return {
    shuttle: across,
    beat: state.fold === null || state.fold === 0 ? Math.max(0, Math.cos(state.pass * Math.PI * 2)) ** 6 : 0,
    cloth: state.cloth,
    helperAt: state.errand ? state.errand.at : 0,
    helperWorking: state.errand?.phase === 'work',
    helperCycle: (state.errand?.clock ?? 0) / helperCycleSeconds,
    helperCarrying: state.errand !== null && state.errand.phase !== 'return',
    fold: state.fold,
    bundles: { ...state.bundles },
  }
}

/**
 * How far to either side of the warp the shuttle travels, in scene units. The
 * woven strip itself is narrow — Park's four inches — so the shuttle's own
 * crossing would be a twitch; what the player sees is the THROW, the hand
 * carrying it out past the selvedge and the other hand taking it. Calibratable
 * with the rest of the loom, and the value the drawn shuttle rides on.
 */
export const SHUTTLE_THROW = 0.16

/**
 * Forward reach from the weaver's shoulders to the warp she works, and the
 * height of her hands above her own shoulder line — negative, because she sits
 * at a warp laid low and reaches forward and DOWN to it.
 *
 * MEASURED AGAINST THE DRAWN BODY, not guessed: a kneeling figure's shoulder
 * sits at `FIGURE_LIMBS.shoulderY` of a 0.55 body, on a group squashed to 0.75
 * — 0.256 in scene units — and its arm is 0.242 long. At this reach and this
 * elevation the hands land on `LOOM_BUILD.warpY`. The first build had them
 * 0.11 high under a warp at 0.30, and the picture showed a cone with no arms
 * at all: the very thing the report complained of, rebuilt.
 */
const WARP_REACH = 0.28
const HAND_ELEVATION = -0.1

/**
 * THE HANDS RIDE THE TOOL (item 1). Both arms are written every frame from the
 * same cycle the cloth grows on, using the pounder's own mechanism: one hand
 * carries the shuttle across the warp and back, the other beats the weft down
 * as it lands, and the trunk leans into each beat. Nothing here hangs beside a
 * cloth that changes by itself — which is the whole defect the report showed.
 */
export function loomPose(picture: LoomPicture): FigurePose {
  if (picture.fold !== null && picture.fold > 0) {
    const gather = Math.sin(picture.fold * Math.PI * 4)
    return {
      left: armAim(0.45 * gather, -0.35),
      right: armAim(-0.45 * gather, -0.35),
      lean: 0.18 + 0.24 * Math.sin(picture.fold * Math.PI) ** 2,
      turn: 0,
    }
  }
  const across = picture.shuttle * SHUTTLE_THROW
  // The carrying hand follows the shuttle out to whichever side it is on; the
  // beating hand stays in over the reed, moving the other way as it drives.
  const carry = Math.atan2(across, WARP_REACH)
  const beat = Math.atan2(-across * 0.3, WARP_REACH)
  const lean = 0.04 + picture.beat * 0.48
  // Counter-rotate the shoulders as the trunk drives forward: the hands stay
  // down at the warp rather than following the larger lean into the ground.
  return {
    left: armAim(carry, HAND_ELEVATION + lean),
    right: armAim(beat, HAND_ELEVATION - 0.04 + lean),
    lean,
    turn: 0,
  }
}

/** Both hands knead the carried yarn before it is laid at the named end. */
export function loomHelperPose(picture: LoomPicture): FigurePose {
  if (picture.helperWorking) {
    const pull = (1 - Math.cos(picture.helperCycle * Math.PI * 2)) / 2
    return {
      left: armAim(-0.18 + pull * 0.3, -0.45 - pull * 0.6),
      right: armAim(0.18 - pull * 0.3, -0.45 - pull * 0.6),
      lean: 0.16 + pull * 0.38,
      turn: 0,
    }
  }
  if (picture.helperCarrying) {
    return { left: armAim(-0.15, -0.45), right: armAim(0.15, -0.45), lean: 0, turn: 0 }
  }
  return { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 }
}
