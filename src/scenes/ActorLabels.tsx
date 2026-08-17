// The hold-Ctrl label layer (design.md §17.8), in both perspectives.
//
// It mounts only while the key is down: an idle frame runs one boolean
// subscription and nothing else — no traversal, no projection, no DOM. While it
// is up it refreshes a few times a second rather than every frame; the labels
// ride their subjects closely enough for a reading aid, and a per-frame React
// pass over a herd would cost more than the picture gains.
//
// It reuses the map/region label machinery (drei's <Html> and the `map-label`
// class) rather than inventing a second one, so the labels layer with the rest
// of the in-scene text under §17.4. What it does NOT take from them is their
// distance scaling: a place name may swell as the camera nears it, but a
// reading aid that did so filled half the bird's-eye frame with one word (the
// first probe frame). These stay one small size, whatever the distance.
//
// What it does add is a DECLUTTER: two subjects standing close printed two
// boxes into the same pixels, and the picture read "Villager llager" while every
// DOM check saw two perfectly correct labels (point 628). So the boxes are
// measured and laid out — the nearer name keeps its place, a further one rises a
// line or, with no room left, says nothing.

import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { balance } from '../config/balance'
import { useStrings } from '../i18n'
import { actorLabelText, declutterLabels, nearestActors, qualifiesAsActor, type ScreenLabel } from '../systems/actorLabels'
import { useCtrlHeld } from '../ui/ctrlHold'
import { collectActors, pushMarkedActors, type LabelledActor } from './actorLabelSource'
import { pointOnScreen, projectPoint } from './travel/frameVisibility'

/** How often the labels re-read the scene while the key is held (seconds). */
const REFRESH_SECONDS = 0.1

/** How far a label floats above the point it names, in CSS pixels, before the
 *  declutter lifts it any further. Set here rather than in the stylesheet
 *  because the rise VARIES per label now. */
const LABEL_RISE = 4

/** Box size for a label whose width cannot be measured (no DOM: the unit
 *  layer). Roughly the real proportions of the 12 px label, so a test still
 *  exercises overlaps rather than a degenerate zero-size box. */
const ESTIMATED_CHAR_WIDTH = 7
const ESTIMATED_PADDING = 14
const ESTIMATED_HEIGHT = 18

/** Measured box sizes per label text — a closed, small set of words, measured
 *  once each in the label's own style, so the declutter decides on the box the
 *  player really sees rather than on a guess at a proportional font. */
const boxSizes = new Map<string, { width: number; height: number }>()

function labelBox(text: string): { width: number; height: number } {
  const known = boxSizes.get(text)
  if (known !== undefined) return known
  let box = {
    width: text.length * ESTIMATED_CHAR_WIDTH + ESTIMATED_PADDING,
    height: ESTIMATED_HEIGHT,
  }
  if (typeof document !== 'undefined') {
    const probe = document.createElement('div')
    probe.className = 'map-label actor-label'
    probe.textContent = text
    probe.style.position = 'absolute'
    probe.style.left = '-9999px'
    probe.style.top = '0'
    probe.style.visibility = 'hidden'
    document.body.appendChild(probe)
    const rect = probe.getBoundingClientRect()
    probe.remove()
    if (rect.width > 0 && rect.height > 0) box = { width: rect.width, height: rect.height }
  }
  boxSizes.set(text, box)
  return box
}

interface DrawnLabel {
  key: string
  /** What it is, for the dev hook — the picture shows only the text. */
  kind: string
  text: string
  x: number
  y: number
  z: number
  /** Extra rise in CSS pixels the declutter gave it (0 for most). */
  lift: number
}

function ActorLabelLayer() {
  const strings = useStrings()
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const [labels, setLabels] = useState<DrawnLabel[]>([])
  const scratch = useRef<LabelledActor[]>([])
  const onScreen = useRef<LabelledActor[]>([])
  // Past the interval at the first frame, so the labels appear on the key press
  // rather than a tenth of a second later.
  const since = useRef(REFRESH_SECONDS)

  useFrame((_, dt) => {
    since.current += dt
    if (since.current < REFRESH_SECONDS) return
    since.current = 0
    const found = collectActors(scratch.current)
    // The registered sources cover what is drawn from a list (the herds, the
    // vultures); the marked objects cover what is drawn as its own node — an
    // inhabitant, a goat, a pitched camp.
    pushMarkedActors(scene, found)
    const visible = onScreen.current
    visible.length = 0
    for (const actor of found) {
      // Only what ACTS, and only what is really in the picture: the projection
      // through the live camera, never a radius (point 172).
      if (!qualifiesAsActor(actor)) continue
      if (!pointOnScreen(camera, actor.x, actor.y, actor.z)) continue
      visible.push(actor)
    }
    const kept = nearestActors(visible, camera.position, balance.labelOverlay.maxLabels)
    // Where each of them would stand IN THE PICTURE, so overlapping boxes can be
    // resolved in the pixels the player reads them in rather than in world
    // units, where two figures at different depths can share one screen spot.
    const texts = kept.map((actor) => actorLabelText(strings, actor))
    const boxes: ScreenLabel[] = kept.map((actor, i) => {
      const p = projectPoint(camera, actor.x, actor.y, actor.z)
      const box = labelBox(texts[i])
      return {
        x: (p.x * 0.5 + 0.5) * size.width,
        y: (0.5 - p.y * 0.5) * size.height - LABEL_RISE,
        width: box.width,
        height: box.height,
        depth: Math.hypot(actor.x - camera.position.x, actor.y - camera.position.y, actor.z - camera.position.z),
      }
    })
    const lifts = declutterLabels(boxes)
    const drawnLabels: DrawnLabel[] = []
    kept.forEach((actor, i) => {
      const lift = lifts[i]
      if (lift === null) return // no clear place left: the nearer name keeps it
      drawnLabels.push({
        // Keyed by SLOT, not by what fills it: the list is re-sorted by distance
        // every refresh, and a key that moved with the subject unmounted and
        // remounted drei's portals — two labels for one elder stood in the same
        // frame while the old one was still being torn down.
        key: String(drawnLabels.length),
        kind: actor.kind,
        text: texts[i],
        x: actor.x,
        y: actor.y,
        z: actor.z,
        lift,
      })
    })
    setLabels(drawnLabels)
  })

  // Dev hook for the headless verification (CLAUDE.md §7.2): what stands right
  // now, WITH the world point each label claims — so a check can project it
  // through the live camera instead of trusting the picture's word for it. It
  // exists only while the layer does, which is itself the release assertion.
  const drawn = useRef(labels)
  drawn.current = labels
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__actorLabels = () => drawn.current.map((l) => ({ kind: l.kind, text: l.text, x: l.x, y: l.y, z: l.z }))
    // The set BEFORE the predicate and the projection (point 600): a missing
    // label has two very different causes — the subject was never collected
    // (its scene draws it outside every registered source), or it was collected
    // and then excluded (concealed, a map point, off screen). Only the raw set
    // tells the two apart, and the first hold in real play turned on exactly
    // that question. Freshly collected on call, not the refresh's leftovers.
    w.__actorCandidates = () => {
      const all = collectActors([])
      pushMarkedActors(scene, all)
      return all
    }
    return () => {
      delete w.__actorLabels
      delete w.__actorCandidates
    }
  }, [scene])

  return (
    <>
      {labels.map((label) => (
        <Html key={label.key} center position={[label.x, label.y, label.z]}>
          <div className="map-label actor-label" style={{ transform: `translateY(${-(LABEL_RISE + label.lift)}px)` }}>
            {label.text}
          </div>
        </Html>
      ))}
    </>
  )
}

/**
 * Mounts the layer while Ctrl is held and unmounts it on release — including
 * the release that never arrived because the window went away (see ctrlHold).
 */
export function ActorLabels() {
  return useCtrlHeld() ? <ActorLabelLayer /> : null
}
