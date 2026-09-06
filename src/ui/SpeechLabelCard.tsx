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

import { conceptOf } from '../communication/lexicon'
import type { Phrase } from '../communication/lexicon'
import type { CommunicationMemory } from '../communication/heard'
import { labelReadings } from '../communication/speechLabel'
import { useStrings } from '../i18n'

export function SpeechLabelCard({
  speakerId,
  atoms,
  memory,
  conceptLabels = false,
  targeted = false,
}: {
  speakerId: string
  atoms: Phrase
  memory: CommunicationMemory
  /** DEBUG view: the concept behind the utterance instead of syllables + guess. */
  conceptLabels?: boolean
  /** This speaker is the one the use key would take. */
  targeted?: boolean
}) {
  const t = useStrings()
  return (
    // The note carries WHOSE it is: since the children speak on their own
    // (point 481) a settlement can hold several notes at once, and a check that
    // grabbed "the" label measured whichever one the DOM listed first.
    <div className={`speech-label${targeted ? ' targeted' : ''}`} data-speaker={speakerId}>
      <div className="speech-atoms">
        {conceptLabels
          ? atoms.map((utterance, i) => (
              <div className="speech-atom" key={`${utterance}-${i}`}>
                <span className="syllables">{conceptOf(utterance) ?? utterance}</span>
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
  )
}
