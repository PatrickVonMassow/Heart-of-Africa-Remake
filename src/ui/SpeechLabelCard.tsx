// The note over a speaker's head, as DOM (design.md §13.4, work-order points
// 485/588). The scene layer (src/scenes/place/SpeechLabels.tsx) only rides this
// card on the speaking figure; everything the player reads is decided here, so
// the HUD layer can judge it without a browser.
//
// What each label SAYS is derived from the player's own notes on every render,
// never copied onto the label, so a reading edited in the journal changes over
// the speaker's head at once: one source, two views.
//
// The TARGETED card is the one the use key would take (points 588/691): it is
// highlighted against the others and carries the invitation to guess, so which
// speaker SPACE means is never in doubt. It is highlighted only while SPACE
// really means him — a door the player stands at takes the key, and then this
// card carries no invitation.
//
// WHOSE a note is (point 1238): the card carries a tail pointing down at its own
// speaker, and an older card RECEDES — dimmed and a little smaller — behind a
// newer one, so with several figures in view the current speaker's note is the
// most prominent. The scene layer decides `receded` (speechLabelRecedes).

import { conceptOf } from '../communication/lexicon'
import type { Phrase, Vocabulary } from '../communication/lexicon'
import type { CommunicationMemory } from '../communication/heard'
import { labelReadings, speechLabelPresence } from '../communication/speechLabel'
import { useStrings } from '../i18n'

export function SpeechLabelCard({
  speakerId,
  atoms,
  memory,
  vocabulary,
  conceptLabels = false,
  targeted = false,
  receded = false,
}: {
  speakerId: string
  atoms: Phrase
  memory: CommunicationMemory
  vocabulary: Vocabulary
  /** DEBUG view: the concept behind the utterance instead of syllables + guess. */
  conceptLabels?: boolean
  /** This speaker is the one the use key would take. */
  targeted?: boolean
  /** A newer note stands beside this one; never true for the targeted card. */
  receded?: boolean
}) {
  const t = useStrings()
  const presence = speechLabelPresence(receded && !targeted)
  // The bubble is the box plus its tail; the tail's tip is the point the scene
  // layer anchors over the speaker's crown. The receded look scales about that
  // tip, so a receded note never slides off its speaker.
  return (
    <div
      className={`speech-bubble${targeted ? ' targeted' : ''}${receded && !targeted ? ' receded' : ''}`}
      style={{ opacity: presence.opacity, transform: `scale(${presence.scale})` }}
    >
      {/* The note carries WHOSE it is: since the children speak on their own
          (point 481) a settlement can hold several notes at once, and a check
          that grabbed "the" label measured whichever one the DOM listed first. */}
      <div className={`speech-label${targeted ? ' targeted' : ''}`} data-speaker={speakerId}>
        <div className="speech-atoms">
          {conceptLabels
            ? atoms.map((utterance, i) => (
                <div className="speech-atom" key={`${utterance}-${i}`}>
                  <span className="syllables">{conceptOf(utterance, vocabulary) ?? utterance}</span>
                </div>
              ))
            : labelReadings(memory, atoms).map((atom, i) => (
                <div className="speech-atom" key={`${atom.utterance}-${i}`}>
                  <span className="syllables">{atom.utterance}</span>
                  <span className="reading" aria-label={t.journalPanel.hypothesisFor(atom.utterance)}>
                    {atom.reading}
                  </span>
                </div>
              ))}
        </div>
        {/* Only under the highlighted note, and only for the real speech: the
            debug concept view is not something to write a guess about. */}
        {targeted && !conceptLabels && <div className="speech-invite">{t.speechGuess.invite}</div>}
      </div>
      <svg className="speech-tail" width="18" height="11" viewBox="0 0 18 11" aria-hidden="true">
        <path d="M0 0 L9 11 L18 0" />
      </svg>
    </div>
  )
}
