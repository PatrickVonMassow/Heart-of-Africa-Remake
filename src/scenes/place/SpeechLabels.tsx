// The hypothesis over the speaker's head, drawn (design.md §13.4, §17.4,
// docs/communication-poc-spec.md, work-order point 485).
//
// One label per speaking figure, riding on that figure's own object so it is
// unmistakably attached to it, and gone again after a moment — the scene never
// carries standing text. What each label SAYS is derived from the player's own
// notes on every render, never copied onto the label, so a reading edited in
// the journal changes over the speaker's head immediately: one source, two
// views. The syllables stand beside the reading, so the label never replaces
// what is being said — it annotates it.
//
// Layering (§17.4): drei's <Html> lands in the HUD layer with the other
// in-scene labels; modals and full-screen overlays sit above it through the
// z-index constants in index.css.

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import type { CommunicationMemory } from '../../communication/heard'
import { type Phrase } from '../../communication/lexicon'
import { isSpeechLabelVisible, type SpeechLabel } from '../../communication/speechLabel'
import { labelPresentation } from '../../communication/speechTarget'
import { SpeechLabelCard } from '../../ui/SpeechLabelCard'
import { releasePointerLock } from './pointerLock'
import {
  clearSpeechLabels,
  pruneSpeechLabels,
  speakOverhead,
  speechAnchor,
  speechLabelState,
  speechTargetLabel,
  subscribeSpeechLabels,
  updateSpeechTarget,
} from './speechChannel'

/** Scratch vector — the label positions are sampled every frame. */
const WORLD = new THREE.Vector3()

/** One speaker's note, following its figure. */
function SpeechLabelView({
  label,
  memory,
  targeted,
}: {
  label: SpeechLabel
  memory: CommunicationMemory
  targeted: boolean
}) {
  const group = useRef<THREE.Group>(null)
  // DEBUG (user 09.08.2026): the concept behind the utterance instead of the
  // syllables and the player's guess. Never on in a real run — it hands the
  // player the very answer the mechanic asks him to work out.
  const conceptLabels = useUi((s) => s.speechConceptLabels)

  useFrame(() => {
    const anchor = speechAnchor(label.speakerId)
    if (!anchor || !group.current) return
    anchor.getWorldPosition(WORLD)
    group.current.position.set(WORLD.x, WORLD.y + label.height, WORLD.z)
    // The label's screen place is read off this group's WORLD matrix by drei's
    // <Html>, in a frame callback of its own — before the renderer refreshes the
    // graph. Without this the note never leaves the scene origin (measured in
    // the browser), so the move is published here rather than left to the loop.
    group.current.updateMatrix()
    group.current.updateMatrixWorld(true)
  })

  return (
    <group ref={group}>
      <Html center distanceFactor={14}>
        <SpeechLabelCard
          speakerId={label.speakerId}
          atoms={label.atoms}
          memory={memory}
          conceptLabels={conceptLabels}
          targeted={targeted}
        />
      </Html>
    </group>
  )
}

/**
 * The label layer of the settlement scene. Mounted once; a speaking figure only
 * calls speakOverhead() and never touches React.
 */
export function SpeechLabels() {
  const labels = useSyncExternalStore(subscribeSpeechLabels, speechLabelState, speechLabelState)
  const memory = useGame((s) => s.communication)
  // With the concept view on, the "only what he has already heard" gate is
  // lifted too: the developer is looking for whether a situation staged the
  // concept it meant to, and that question is asked about the utterances the
  // run has NOT taught yet as much as about the others.
  const conceptLabels = useUi((s) => s.speechConceptLabels)
  const dialog = useUi((s) => s.dialog)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)

  // Leaving the settlement takes every label with it.
  useEffect(() => clearSpeechLabels, [])

  // Which label a drawn label IS — the same gate the render below applies, so
  // the click target and the highlighted note can never be two different things.
  const visible = (label: SpeechLabel) => conceptLabels || isSpeechLabelVisible(memory, label.atoms)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // The click target is picked first, then the sweep runs: the target is what
  // holds its label against expiry (point 588), so deciding it after the sweep
  // would drop the very note the player is reaching for.
  useFrame(() => {
    updateSpeechTarget((label) => visibleRef.current(label))
    pruneSpeechLabels()
  })

  // A LEFT CLICK guesses at what the highlighted speaker just said (point 588).
  // It is taken on the CANVAS: in the first-person view the pointer is locked,
  // so there is no cursor to hit the note itself with — the highlight is what
  // makes the click unambiguous. The dialog keeps the utterance it was opened
  // for, so it survives the label it came from.
  useEffect(() => {
    const el = gl.domElement
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (useUi.getState().dialog) return
      const target = speechTargetLabel()
      if (!target) return
      e.preventDefault()
      // The pointer goes back to the player, or the click never reaches the
      // dialog and no key reaches its field.
      releasePointerLock()
      useUi.getState().setDialog({
        kind: 'speechGuess',
        speakerId: target.speakerId,
        atoms: [...target.atoms],
      })
    }
    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [gl])

  // Dev hook for the headless verification and manual checks (CLAUDE.md §7.2):
  // speak over any named object of the scene — the villager behaviour that will
  // drive this in play is its own work-order point. `anchorScreen` projects the
  // label's anchor point to the rendered frame, so a check can judge the
  // ATTACHMENT by the picture (§7.2) instead of by an assumed offset.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__speech = {
      speak: (speakerId: string, atoms: Phrase, anchorName?: string, seconds?: number) => {
        const anchor = scene.getObjectByName(anchorName ?? speakerId)
        if (!anchor) return false
        speakOverhead(speakerId, atoms, anchor, { seconds })
        return true
      },
      anchorScreen: (speakerId: string) => {
        const anchor = speechAnchor(speakerId)
        const label = speechLabelState().labels.find((l) => l.speakerId === speakerId)
        if (!anchor || !label) return null
        anchor.getWorldPosition(WORLD)
        WORLD.y += label.height
        WORLD.project(camera)
        return {
          x: ((WORLD.x + 1) / 2) * size.width,
          y: ((1 - WORLD.y) / 2) * size.height,
        }
      },
      labels: () => speechLabelState().labels,
      clear: clearSpeechLabels,
    }
    return () => {
      delete w.__speech
    }
  }, [scene, camera, size])

  // While a modal stands open the click handler above ignores every click, so
  // no note may still invite one — and the guess dialog shows its own utterance,
  // so the note it was opened from is not drawn a second time behind it.
  const { targetedId, hiddenId } = labelPresentation(dialog, labels.targetId)

  return (
    <>
      {labels.labels
        .filter(visible)
        .filter((label) => label.speakerId !== hiddenId)
        .map((label) => (
          <SpeechLabelView
            key={label.speakerId}
            label={label}
            memory={memory}
            targeted={label.speakerId === targetedId}
          />
        ))}
    </>
  )
}
