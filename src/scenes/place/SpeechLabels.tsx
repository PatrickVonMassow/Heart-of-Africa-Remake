// The hypothesis over the speaker's head, drawn (design.md §13.4, §17.4,
// docs/communication-poc-spec.md, work-order point 485).
//
// One label per speaking figure, riding on that figure's own object so it is
// unmistakably attached to it, and gone again after a moment unless the
// player is targeting it — speech never stands as permanent text (building
// and name labels are separate). What each label SAYS is derived from the player's own
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
import {
  isSpeechLabelVisible,
  speechLabelRecedes,
  type SpeechLabel,
} from '../../communication/speechLabel'
import { labelPresentation } from '../../communication/speechTarget'
import { speechBubbleScale } from '../../communication/speechBubbleScale'
import { balance } from '../../config/balance'
import { SpeechLabelCard } from '../../ui/SpeechLabelCard'
import {
  clearSpeechLabels,
  pruneSpeechLabels,
  speakOverhead,
  speechAnchor,
  placeSpeechNote,
  speechLabelState,
  speechTipWorld,
  subscribeSpeechLabels,
  updateSpeechTarget,
} from './speechChannel'

/** Scratch vector — the label positions are sampled every frame. */
const WORLD = new THREE.Vector3()
/** Scratch vector for the camera's world place. */
const EYE = new THREE.Vector3()

/** Lifts drei's wrapper by its own size so its bottom centre — the tail tip —
 *  sits on the anchor (the drawn head top), plus the calibratable screen gap
 *  that keeps the tip off the hair at every distance (point 1276). */
function tipOnAnchor(gapPx: number) {
  return { transform: `translate3d(-50%,calc(-100% - ${Math.max(0, gapPx)}px),0)` }
}

/** One speaker's note, following its figure. */
function SpeechLabelView({
  label,
  memory,
  targeted,
  receded,
}: {
  label: SpeechLabel
  memory: CommunicationMemory
  targeted: boolean
  receded: boolean
}) {
  const group = useRef<THREE.Group>(null)
  // The note's distance scale (point 1271) rides a wrapper of its own, set
  // straight on the DOM each frame: no React render per frame, and the card's
  // own transform (the receded look) and its .targeted styling stay untouched.
  const sizer = useRef<HTMLDivElement>(null)
  const lastScale = useRef(0)
  // DEBUG (user 09.08.2026): the concept behind the utterance instead of the
  // syllables and the player's guess. Never on in a real run — it hands the
  // player the very answer the mechanic asks him to work out.
  const vocabulary = useGame((s) => s.vocabulary)
  const conceptLabels = useUi((s) => s.speechConceptLabels)

  useFrame(({ camera }) => {
    // The tip follows the top of the speaker's drawn head as this camera sees
    // it, every frame — its lean, its kneel, its step — not a height sampled
    // when the speech began (point 1276). placeSpeechNote also publishes the
    // group's world matrix: drei's <Html> reads it before the renderer
    // refreshes the graph, and without it the note never leaves the origin.
    if (!group.current || !placeSpeechNote(group.current, label, camera)) return
    const el = sizer.current
    if (el) {
      const scale = speechBubbleScale(camera.getWorldPosition(EYE).distanceTo(group.current.getWorldPosition(WORLD)))
      if (Math.abs(scale - lastScale.current) > 0.002) {
        lastScale.current = scale
        el.style.setProperty('--speech-distance-scale', scale.toFixed(3))
      }
    }
  })

  return (
    <group ref={group}>
      {/* Not centred: the bubble's bottom centre — its tail's tip — stands on
          the anchor, so the tail points down at this speaker's crown. */}
      <Html style={tipOnAnchor(balance.communication.labelTipGap.px)} zIndexRange={[20, 10]}>
        <div ref={sizer} className="speech-distance">
          <SpeechLabelCard
            speakerId={label.speakerId}
            atoms={label.atoms}
            memory={memory}
            vocabulary={vocabulary}
            conceptLabels={conceptLabels}
            targeted={targeted}
            receded={receded}
          />
        </div>
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
  // Whether the guess key has a word to act on right now (point 1139).
  const guessKeyArmed = useUi((s) => s.guessKeyArmed)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  // Leaving the settlement takes every label with it.
  useEffect(() => clearSpeechLabels, [])

  // Which label a drawn label IS — the same gate the render below applies, so
  // the guess-key candidate and the highlighted note can never be two different
  // things.
  const visible = (label: SpeechLabel) => conceptLabels || isSpeechLabelVisible(memory, label.atoms)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // The speaker candidate is picked first, then the sweep runs: the target is
  // what holds its label against expiry (point 588), so deciding it after the
  // sweep would drop the very note the player is reaching for. This picks WHICH
  // speaker is the candidate; E acts on him (point 1139), and only the pad
  // weighs him against every other thing its use button could do in PlaceScene
  // (point 691).
  useFrame(() => {
    updateSpeechTarget((label) => visibleRef.current(label))
    pruneSpeechLabels()
  })

  // Dev hook for the headless verification and manual checks (CLAUDE.md §7.2):
  // Speak over a named scene object, or reuse a live speaker's own anchor when
  // no explicit name is supplied (children have unnamed groups). `anchorScreen` projects the
  // label's anchor point to the rendered frame, so a check can judge the
  // ATTACHMENT by the picture (§7.2) instead of by an assumed offset.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__speech = {
      // `reach` narrows who may TARGET the note, so a picture can stage two
      // notes near the player with neither being the guess target.
      speak: (speakerId: string, atoms: Phrase, anchorName?: string, seconds?: number, reach?: number) => {
        const anchor = scene.getObjectByName(anchorName ?? speakerId) ??
          (anchorName === undefined ? speechAnchor(speakerId) : null)
        if (!anchor || scene.getObjectById(anchor.id) !== anchor) return false
        speakOverhead(speakerId, atoms, anchor, { seconds, reach })
        return true
      },
      anchorScreen: (speakerId: string) => {
        const label = speechLabelState().labels.find((l) => l.speakerId === speakerId)
        if (!label || !speechTipWorld(label, WORLD, camera)) return null
        WORLD.project(camera)
        // Behind the camera the projection mirrors onto the screen while drei
        // hides the note; report what the picture shows, which is nothing.
        if (WORLD.z > 1) return null
        return {
          x: ((WORLD.x + 1) / 2) * size.width,
          y: ((1 - WORLD.y) / 2) * size.height,
        }
      },
      anchorWorld: (speakerId: string) => {
        const anchor = speechAnchor(speakerId)
        return anchor ? anchor.getWorldPosition(WORLD).toArray() : null
      },
      // The speaker's DRAWN head top and feet on screen, measured on the
      // projected geometry itself (point 1276): every vertex of the visible
      // head mesh goes through the camera, and the head's top on screen is the
      // smallest screen y among them — the silhouette's upper edge under any
      // perspective and pitch, not a projected world-up offset of its centre.
      figureScreen: (speakerId: string) => {
        const anchor = speechAnchor(speakerId)
        if (!anchor) return null
        anchor.updateWorldMatrix(true, true)
        // Only a head the renderer draws: the anchor and every ancestor
        // visible, and traverseVisible skips a hidden group's whole subtree.
        for (let o: THREE.Object3D | null = anchor; o; o = o.parent) if (!o.visible) return null
        let head: THREE.Mesh | null = null
        anchor.traverseVisible((o) => {
          if (!head && o.name === 'figure-head') head = o as THREE.Mesh
        })
        const toScreen = (v: THREE.Vector3) => ({ x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height })
        const v = anchor.getWorldPosition(new THREE.Vector3()).project(camera)
        const feet = v.z > 1 ? null : toScreen(v)
        if (!head) return { feet, headTop: null }
        const mesh = head as THREE.Mesh
        const pos = mesh.geometry.getAttribute('position')
        let top: { x: number; y: number } | null = null
        let left = Infinity
        let right = -Infinity
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera)
          if (v.z > 1) return { feet, headTop: null } // partly behind the camera
          const p = toScreen(v)
          if (!top || p.y < top.y) top = p
          left = Math.min(left, p.x)
          right = Math.max(right, p.x)
        }
        // The head's drawn width, so a horizontal tip offset can be judged
        // against the head it should sit over.
        return { feet, headTop: top, headWidth: top ? right - left : 0 }
      },
      labels: () => speechLabelState().labels,
      clear: clearSpeechLabels,
    }
    return () => {
      delete w.__speech
    }
  }, [scene, camera, size])

  // While a modal stands open E does nothing, so no note may still invite it —
  // and the guess dialog shows its own utterance, so the note it was opened
  // from is not drawn a second time behind it. The highlight and the invitation
  // otherwise follow the guess key's OWN target (point 1139): the door at the
  // player's feet takes Space, not E, so the word keeps its invitation while
  // the bottom prompt offers the hut.
  const { targetedId, hiddenId } = labelPresentation(dialog, labels.targetId, guessKeyArmed)

  const drawn = labels.labels.filter(visible).filter((label) => label.speakerId !== hiddenId)
  return (
    <>
      {drawn.map((label) => (
        <SpeechLabelView
          key={label.speakerId}
          label={label}
          memory={memory}
          targeted={label.speakerId === targetedId}
          receded={speechLabelRecedes(label, drawn, targetedId)}
        />
      ))}
    </>
  )
}
