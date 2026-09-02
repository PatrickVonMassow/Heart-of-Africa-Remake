// The note over a speaker's head as the player reads it (design.md §13.4,
// work-order points 485/588): the syllables beside his own reading, and — on
// the ONE speaker a click would take — the highlight and the invitation to
// guess. The scene-side attachment stays in Playwright; everything a human
// reads off the note is decided here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { SpeechLabelCard } from './SpeechLabelCard'
import { emptyMemory, observeUtterance, setHypothesis } from '../communication/heard'
import { utteranceOf } from '../communication/lexicon'
import { pickSpeechTarget } from '../communication/speechTarget'
import { NO_READING } from '../communication/speechLabel'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'

const RIVER_UTTERANCE = utteranceOf('RIVER')
const DIG = utteranceOf('DIG')

let memory = emptyMemory()

beforeEach(() => {
  useLocale.getState().setLang('en')
  memory = observeUtterance(observeUtterance(emptyMemory(), RIVER_UTTERANCE, 1), DIG, 1)
})
afterEach(() => {
  useLocale.getState().setLang('en')
})

/** The three speakers of a village corner, and how far each stands away. */
const SPEAKERS = [
  { speakerId: 'villager-1', atoms: [RIVER_UTTERANCE], distance: 6 },
  { speakerId: 'kid-2', atoms: [DIG], distance: 2.5 },
  { speakerId: 'villager-3', atoms: [RIVER_UTTERANCE], distance: 9 },
]

/** Renders every speaker's note, highlighting the one a click would take. */
function renderVillage(distances: Record<string, number>) {
  const target = pickSpeechTarget(
    SPEAKERS.map((s) => ({ speakerId: s.speakerId, distance: distances[s.speakerId] })),
    null,
    10,
  )
  return render(
    <>
      {SPEAKERS.map((s) => (
        <SpeechLabelCard
          key={s.speakerId}
          speakerId={s.speakerId}
          atoms={s.atoms}
          memory={memory}
          targeted={s.speakerId === target}
        />
      ))}
    </>,
  )
}

const cardOf = (id: string) => document.querySelector(`.speech-label[data-speaker="${id}"]`)

describe('the note over a speaker’s head (design.md §13.4)', () => {
  it('shows the syllables beside the reading, ??? where none is written', () => {
    render(<SpeechLabelCard speakerId="kid-1" atoms={[RIVER_UTTERANCE]} memory={memory} />)
    expect(document.querySelector('.speech-label .syllables')?.textContent).toBe(RIVER_UTTERANCE)
    expect(document.querySelector('.speech-label .reading')?.textContent).toBe(NO_READING)
  })

  it('shows the reading the player wrote in the journal', () => {
    render(
      <SpeechLabelCard speakerId="kid-1" atoms={[RIVER_UTTERANCE]} memory={setHypothesis(memory, RIVER_UTTERANCE, 'come here')} />,
    )
    expect(document.querySelector('.speech-label .reading')?.textContent).toBe('come here')
  })
})

describe('which note a click would take (point 588)', () => {
  it('highlights the nearest speaker alone, and invites the click on him', () => {
    renderVillage({ 'villager-1': 6, 'kid-2': 2.5, 'villager-3': 9 })
    expect(cardOf('kid-2')?.className).toContain('targeted')
    expect(cardOf('villager-1')?.className).not.toContain('targeted')
    expect(cardOf('villager-3')?.className).not.toContain('targeted')
    expect(cardOf('kid-2')?.querySelector('.speech-invite')?.textContent).toBe(en.speechGuess.invite)
    expect(cardOf('villager-1')?.querySelector('.speech-invite')).toBeNull()
  })

  it('moves the highlight and the invitation when another speaker comes nearer', () => {
    renderVillage({ 'villager-1': 1.5, 'kid-2': 2.5, 'villager-3': 9 })
    expect(cardOf('villager-1')?.className).toContain('targeted')
    expect(cardOf('villager-1')?.querySelector('.speech-invite')?.textContent).toBe(en.speechGuess.invite)
    expect(cardOf('kid-2')?.querySelector('.speech-invite')).toBeNull()
  })

  it('invites in both languages, and in neither of them shouts', () => {
    for (const [lang, dict] of [['en', en], ['de', de]] as const) {
      useLocale.getState().setLang(lang)
      const view = render(<SpeechLabelCard speakerId="kid-1" atoms={[RIVER_UTTERANCE]} memory={memory} targeted />)
      const invite = document.querySelector('.speech-invite')?.textContent ?? ''
      expect(invite).toBe(dict.speechGuess.invite)
      expect(invite.length).toBeGreaterThan(0)
      expect(invite).not.toBe(invite.toUpperCase())
      view.unmount()
    }
  })

  it('offers no guess on the debug concept view — that is the answer, not a question', () => {
    render(<SpeechLabelCard speakerId="kid-1" atoms={[RIVER_UTTERANCE]} memory={memory} targeted conceptLabels />)
    expect(document.querySelector('.speech-invite')).toBeNull()
  })
})
