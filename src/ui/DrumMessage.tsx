// The chief's drum message on paper (design.md §13.4,
// docs/communication-poc-spec.md, work-order point 486): after the drums have
// beaten it out, the seven concepts stand in order with the player's OWN
// reading above each, every one clickable to change.
//
// The reading is not a copy. It is read from — and written straight back into —
// the same communication memory the journal's observation section edits, so a
// note changed here is changed there and the other way round, with nothing to
// keep in sync.
//
// The display is REOPENABLE (journal panel) once the drums have spoken, so a
// player who forgets the message is never locked out of it.

import { useEffect, useState } from 'react'
import { drumMessageElements } from '../communication/drumMessage'
import { toneOfSyllable, SYLLABLE_SEPARATOR } from '../communication/lexicon'
import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import { useStrings } from '../i18n'

/** The syllables of one concept, low and high told apart at a glance. */
function Syllables({ utterance }: { utterance: string }) {
  return (
    <div className="utterance">
      {utterance.split(SYLLABLE_SEPARATOR).map((syllable, i) => (
        <span key={i} className={toneOfSyllable(syllable) === 'high' ? 'high' : 'low'}>
          {syllable}
        </span>
      ))}
    </div>
  )
}

export function DrumMessageDialog() {
  const t = useStrings()
  const memory = useGame((s) => s.communication)
  const setHypothesis = useGame((s) => s.setUtteranceHypothesis)
  const setDialog = useUi((s) => s.setDialog)
  // The store trims a note, so a directly bound field would swallow every space
  // the moment it is typed — the journal's field keeps its draft the same way.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const elements = drumMessageElements(memory)

  return (
    <div className="dialog-backdrop">
      <div className="dialog drum-message">
        <h3>{t.drumMessage.title}</h3>
        <p className="flavor">{t.drumMessage.hint}</p>
        <ol className="drum-concepts">
          {elements.map((e) => (
            <li className="drum-concept" key={e.utterance}>
              {editing === e.index ? (
                <input
                  type="text"
                  className="hypothesis"
                  autoFocus
                  value={drafts[e.utterance] ?? (e.unread ? '' : e.reading)}
                  placeholder={t.drumMessage.notePlaceholder}
                  aria-label={t.drumMessage.readingFor(e.utterance)}
                  onChange={(ev) => {
                    const text = ev.target.value
                    setDrafts((d) => ({ ...d, [e.utterance]: text }))
                    setHypothesis(e.utterance, text)
                  }}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <button
                  className={e.unread ? 'reading unread' : 'reading'}
                  aria-label={t.drumMessage.readingFor(e.utterance)}
                  onClick={() => setEditing(e.index)}
                >
                  {e.reading}
                </button>
              )}
              <Syllables utterance={e.utterance} />
            </li>
          ))}
        </ol>
        <div className="actions">
          <button className="hud-button" onClick={() => setDialog(null)}>{t.drumMessage.close}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Waits out the drums. The message is only understood once it has been beaten
 * to its end: at that moment its concepts enter the heard memory, the chronicle
 * records it and — unless the player is standing in another dialog — the
 * display opens by itself.
 *
 * The clock is the WALL clock, like the speech labels': what runs here is the
 * playing of a sound the player listens to, not in-game time.
 */
export function DrumMessageWatcher() {
  const beating = useUi((s) => s.drumPerformance)
  useEffect(() => {
    if (!beating) return
    const remaining = Math.max(0, beating.endsAt - drumClock())
    const timer = setTimeout(() => {
      useGame.getState().receiveDrumMessage()
      useUi.getState().clearDrumMessage()
      if (useUi.getState().dialog === null) {
        if (document.pointerLockElement) document.exitPointerLock()
        useUi.getState().setDialog({ kind: 'drumMessage' })
      }
    }, remaining)
    return () => clearTimeout(timer)
  }, [beating])
  return null
}

/** Seconds→ms wall clock, the one the performance was started on. */
function drumClock(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
