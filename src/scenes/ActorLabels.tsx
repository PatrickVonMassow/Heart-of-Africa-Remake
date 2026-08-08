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
// of the in-scene text under §17.4.

import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { balance } from '../config/balance'
import { useStrings } from '../i18n'
import { actorLabelText, nearestActors, qualifiesAsActor } from '../systems/actorLabels'
import { useCtrlHeld } from '../ui/ctrlHold'
import { collectActors, pushMarkedActors, type LabelledActor } from './actorLabelSource'
import { pointOnScreen } from './travel/frameVisibility'

/** How often the labels re-read the scene while the key is held (seconds). */
const REFRESH_SECONDS = 0.1

interface DrawnLabel {
  key: string
  text: string
  x: number
  y: number
  z: number
}

function ActorLabelLayer({ distanceFactor }: { distanceFactor: number }) {
  const strings = useStrings()
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
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
    setLabels(
      kept.map((actor, i) => ({
        key: `${actor.kind}-${i}`,
        text: actorLabelText(strings, actor),
        x: actor.x,
        y: actor.y,
        z: actor.z,
      })),
    )
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
    w.__actorLabels = () => drawn.current.map((l) => ({ text: l.text, x: l.x, y: l.y, z: l.z }))
    return () => {
      delete w.__actorLabels
    }
  }, [])

  return (
    <>
      {labels.map((label) => (
        <Html key={label.key} center position={[label.x, label.y, label.z]} distanceFactor={distanceFactor}>
          <div className="map-label actor-label">{label.text}</div>
        </Html>
      ))}
    </>
  )
}

/**
 * Mounts the layer while Ctrl is held and unmounts it on release — including
 * the release that never arrived because the window went away (see ctrlHold).
 */
export function ActorLabels({ distanceFactor }: { distanceFactor: number }) {
  return useCtrlHeld() ? <ActorLabelLayer distanceFactor={distanceFactor} /> : null
}
