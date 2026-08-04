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
import { useStrings } from '../../i18n'
import type { CommunicationMemory } from '../../communication/heard'
import type { Phrase } from '../../communication/lexicon'
import {
  isSpeechLabelVisible,
  labelReadings,
  type SpeechLabel,
} from '../../communication/speechLabel'
import {
  clearSpeechLabels,
  pruneSpeechLabels,
  speakOverhead,
  speechAnchor,
  speechLabelState,
  subscribeSpeechLabels,
} from './speechChannel'

/** Scratch vector — the label positions are sampled every frame. */
const WORLD = new THREE.Vector3()

/** One speaker's note, following its figure. */
function SpeechLabelView({ label, memory }: { label: SpeechLabel; memory: CommunicationMemory }) {
  const t = useStrings()
  const group = useRef<THREE.Group>(null)

  useFrame(() => {
    const anchor = speechAnchor(label.speakerId)
    if (!anchor || !group.current) return
    anchor.getWorldPosition(WORLD)
    group.current.position.set(WORLD.x, WORLD.y + label.height, WORLD.z)
  })

  return (
    <group ref={group}>
      <Html center distanceFactor={14}>
        <div className="speech-label">
          {labelReadings(memory, label.atoms).map((atom, i) => (
            <div className="speech-atom" key={`${atom.utterance}-${i}`}>
              <span className="syllables">{atom.utterance}</span>
              <span className="reading" aria-label={t.journalPanel.hypothesisFor(atom.utterance)}>
                {atom.reading}
              </span>
            </div>
          ))}
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
  const scene = useThree((s) => s.scene)

  // Leaving the settlement takes every label with it.
  useEffect(() => clearSpeechLabels, [])

  // Expiry runs on the frame loop: a label that has stood its time, or whose
  // figure has left the scene graph, disappears here.
  useFrame(() => pruneSpeechLabels())

  // Dev hook for the headless verification and manual checks (CLAUDE.md §7.2):
  // speak over any named object of the scene — the villager behaviour that will
  // drive this in play is its own work-order point.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__speech = {
      speak: (speakerId: string, atoms: Phrase, anchorName?: string) => {
        const anchor = anchorName ? scene.getObjectByName(anchorName) : scene.getObjectByName(speakerId)
        if (!anchor) return false
        speakOverhead(speakerId, atoms, anchor)
        return true
      },
      labels: () => speechLabelState().labels,
      clear: clearSpeechLabels,
    }
    return () => {
      delete w.__speech
    }
  }, [scene])

  return (
    <>
      {labels.labels
        .filter((label) => isSpeechLabelVisible(memory, label.atoms))
        .map((label) => (
          <SpeechLabelView key={label.speakerId} label={label} memory={memory} />
        ))}
    </>
  )
}
