// Journal/chronicle panel (design.md §15): grows automatically, stores hints.
// Entries are stored as language-neutral text references and rendered in the
// currently selected language (design.md §17). Bodies carry the emotional
// voice markup; it is stripped for display and drives the read-aloud
// (English only — Kokoro has no German voice yet). POC simplification: plain
// text; the animated handwriting of design.md §16 is out of POC scope.

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/store'
import { START_YEAR } from '../config/balance'
import { Sketch } from '../journal/sketches'
import { resolveText, useStrings } from '../i18n'
import { stripVoiceMarkup, toSpeechSegments } from '../journal/voiceMarkup'
import { speakSegments, speechAvailable, stopSpeech } from '../journal/speech'

type SpeechUiState = { entryId: number; status: 'loading' | 'speaking' } | null

export function JournalPanel() {
  const t = useStrings()
  const journal = useGame((s) => s.journal)
  const open = useGame((s) => s.journalOpen)
  const setOpen = useGame((s) => s.setJournalOpen)
  const setToast = useGame((s) => s.setToast)
  const endRef = useRef<HTMLDivElement>(null)
  const [speech, setSpeech] = useState<SpeechUiState>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, journal.length])

  // Stop narration when the panel closes or the component unmounts.
  useEffect(() => {
    if (!open) {
      stopSpeech()
      setSpeech(null)
    }
    return stopSpeech
  }, [open])

  if (!open) return null

  const speakEntry = (entryId: number, title: string, text: string) => {
    if (speech?.entryId === entryId) {
      stopSpeech()
      setSpeech(null)
      return
    }
    setSpeech({ entryId, status: 'loading' })
    const segments = [
      { text: stripVoiceMarkup(title), speed: 1, volume: 1, pauseAfter: 0.6 },
      ...toSpeechSegments(text),
    ]
    speakSegments(segments, () => setSpeech({ entryId, status: 'speaking' }))
      .then(() => setSpeech((s) => (s?.entryId === entryId ? null : s)))
      .catch(() => {
        setToast(t.journalPanel.voiceError)
        setSpeech((s) => (s?.entryId === entryId ? null : s))
      })
  }

  return (
    <div className="journal">
      <header>
        <span>{t.journalPanel.title}</span>
        <button onClick={() => setOpen(false)}>{t.journalPanel.close}</button>
      </header>
      <div className="entries">
        {journal.map((e) => {
          const title = resolveText(t, e.title)
          const text = resolveText(t, e.text)
          const state = speech?.entryId === e.id ? speech.status : null
          return (
            <div key={e.id} className={`entry${e.kind === 'hint' ? ' hint' : ''}`}>
              <div className="date">{t.formatDate(e.day, START_YEAR)}</div>
              <h4>
                {stripVoiceMarkup(title)}
                {speechAvailable(t.lang) && (
                  <button
                    className="speak"
                    title={state ? t.journalPanel.stopReading : t.journalPanel.readAloud}
                    aria-label={state ? t.journalPanel.stopReading : t.journalPanel.readAloud}
                    onClick={() => speakEntry(e.id, title, text)}
                  >
                    {state === 'loading' ? '…' : state === 'speaking' ? '■' : '▶'}
                  </button>
                )}
              </h4>
              {state === 'loading' && <div className="voice-loading">{t.journalPanel.voiceLoading}</div>}
              {e.sketch && <Sketch id={e.sketch} />}
              <p>{stripVoiceMarkup(text)}</p>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}
