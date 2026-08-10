// A guess at what was just said, where it was said (design.md §13.4, work-order
// point 588).
//
// A reading used to be writable only in the journal, so the player had to break
// off watching, open the book and find the utterance among the others — at the
// very moment he saw what it MEANT. This dialog opens on the speaker himself,
// carrying the syllables he spoke and whatever reading is already written.
//
// It writes the SAME store field the journal writes, so a reading entered here
// stands in the book and over the speaker's head at once, and one entered in the
// book shows up here. The game never interprets the text: it is the player's own
// note, unchecked, as everywhere else.
//
// It is MODAL (user's decision) — the one deliberate exception to the non-modal
// rule §16.1 keeps for the journal — and the pointer lock is released while it
// stands open, or no click and no key would reach it.

import { useEffect, useState } from 'react'
import { hypothesisFor } from '../communication/heard'
import type { UtteranceId } from '../communication/lexicon'
import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import { useStrings } from '../i18n'
import { Syllables } from './DrumMessage'

export function SpeechGuessDialog({ atoms }: { atoms: readonly UtteranceId[] }) {
  const t = useStrings()
  const memory = useGame((s) => s.communication)
  const setHypothesis = useGame((s) => s.setUtteranceHypothesis)
  const setDialog = useUi((s) => s.setDialog)
  // The drafts are the dialog's own until it is saved: cancelling must leave the
  // note exactly as it was, and the store trims a reading, so a directly bound
  // field would swallow every space the moment it is typed.
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(atoms.map((a) => [a, hypothesisFor(memory, a)])),
  )

  const save = () => {
    for (const a of atoms) setHypothesis(a, drafts[a] ?? '')
    setDialog(null)
  }
  const cancel = () => setDialog(null)

  // Enter saves, Escape cancels — wherever the focus sits, so the two keys work
  // before the field has been clicked into as well as inside it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        save()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="dialog-backdrop">
      <div className="dialog speech-guess">
        <h3>{t.speechGuess.title}</h3>
        <p className="flavor">{t.speechGuess.hint}</p>
        <ol className="drum-concepts">
          {atoms.map((utterance, i) => (
            <li className="drum-concept" key={`${utterance}-${i}`}>
              <input
                type="text"
                className="hypothesis"
                autoFocus={i === 0}
                value={drafts[utterance] ?? ''}
                placeholder={t.speechGuess.notePlaceholder}
                aria-label={t.speechGuess.readingFor(utterance)}
                onChange={(e) => {
                  const text = e.target.value
                  setDrafts((d) => ({ ...d, [utterance]: text }))
                }}
              />
              <Syllables utterance={utterance} />
            </li>
          ))}
        </ol>
        <div className="actions">
          <button className="hud-button" onClick={save}>{t.speechGuess.save}</button>
          <button className="hud-button" onClick={cancel}>{t.speechGuess.cancel}</button>
        </div>
      </div>
    </div>
  )
}
