// Journal/chronicle panel (design.md §15): grows automatically, stores hints.
// Entries are stored as language-neutral text references and rendered in the
// currently selected language (design.md §17). Bodies carry the emotional
// voice markup; it is stripped for display and drives the read-aloud
// (English only — Kokoro has no German voice yet). New entries are narrated
// automatically; the per-entry control replays or stops. A new entry is
// visibly written into the book by a hand (design.md §16): the text reveals
// stroke by stroke behind a moving hand, which is marked by the wound level
// recorded on the entry — a severely wounded hand is bloody and leaves blood
// traces on the page.

import { useEffect, useRef, useState } from 'react'
import { useGame, type JournalEntry } from '../state/store'
import { useUi } from '../state/ui'
import { START_YEAR } from '../config/balance'
import { Sketch } from '../journal/sketches'
import { resolveText, useStrings } from '../i18n'
import { stripVoiceMarkup, toSpeechSegments } from '../journal/voiceMarkup'
import { speakSegments, speechAvailable, stopSpeech } from '../journal/speech'

type SpeechUiState = { entryId: number; status: 'loading' | 'speaking' } | null

/** Reveal speed of the handwriting animation (characters per second). */
const WRITE_CHARS_PER_SEC = 55

/** The writing hand holding a pen (design.md §16); tinted by wound level. */
function WritingHand({ wounds }: { wounds: 0 | 1 | 2 }) {
  const cls = wounds === 2 ? ' bloody' : wounds === 1 ? ' marked' : ''
  return (
    <span className={`writing-hand${cls}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        {/* Pen */}
        <path d="M4 20 L14 6 L16 8 L6 22 Z" fill="#4a3826" />
        {/* Hand: palm and two hinted fingers gripping the pen */}
        <ellipse cx="16" cy="9" rx="5.2" ry="4" className="hand-skin" transform="rotate(38 16 9)" />
        <ellipse cx="13.2" cy="8.2" rx="1.4" ry="3" className="hand-skin" transform="rotate(48 13.2 8.2)" />
        <ellipse cx="15" cy="5.8" rx="1.3" ry="2.8" className="hand-skin" transform="rotate(52 15 5.8)" />
      </svg>
    </span>
  )
}

/** Deterministic blood traces on entries written by a wounded hand (§16). */
function BloodMarks({ entry }: { entry: JournalEntry }) {
  if (!entry.wounds) return null
  const count = entry.wounds === 2 ? 5 : 2
  const marks = Array.from({ length: count }, (_, i) => {
    const h = Math.sin(entry.id * 12.9898 + i * 78.233) * 43758.5453
    const r1 = h - Math.floor(h)
    const h2 = Math.sin(entry.id * 39.346 + i * 11.135) * 24634.6345
    const r2 = h2 - Math.floor(h2)
    return {
      left: `${8 + r1 * 84}%`,
      top: `${10 + r2 * 75}%`,
      size: entry.wounds === 2 ? 5 + r1 * 7 : 3 + r1 * 3,
    }
  })
  return (
    <div className={`blood-marks${entry.wounds === 2 ? ' severe' : ''}`} aria-hidden="true">
      {marks.map((m, i) => (
        <span key={i} style={{ left: m.left, top: m.top, width: m.size, height: m.size }} />
      ))}
    </div>
  )
}

export function JournalPanel() {
  const t = useStrings()
  const journal = useGame((s) => s.journal)
  const open = useGame((s) => s.journalOpen)
  const setOpen = useGame((s) => s.setJournalOpen)
  const setToast = useGame((s) => s.setToast)
  const endRef = useRef<HTMLDivElement>(null)
  const [speech, setSpeech] = useState<SpeechUiState>(null)
  /** Handwriting animation (design.md §16): entry id and revealed chars. */
  const [writing, setWriting] = useState<{ entryId: number; chars: number } | null>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, journal.length])

  // A newly arriving entry is written into the book by a hand (§16); when
  // the journal stays closed (do not disturb) the entry appears silently.
  const writingPrev = useRef(journal.length)
  useEffect(() => {
    const prev = writingPrev.current
    writingPrev.current = journal.length
    if (journal.length <= prev) return
    if (!useGame.getState().journalOpen) return
    setWriting({ entryId: journal[journal.length - 1].id, chars: 0 })
  }, [journal])

  const writingId = writing?.entryId ?? null
  useEffect(() => {
    if (writingId === null) return
    const entry = useGame.getState().journal.find((e) => e.id === writingId)
    if (!entry) {
      setWriting(null)
      return
    }
    const total = stripVoiceMarkup(resolveText(t, entry.text)).length
    const tick = setInterval(() => {
      setWriting((w) => {
        if (!w || w.entryId !== writingId) return w
        const chars = w.chars + WRITE_CHARS_PER_SEC * 0.06
        return chars >= total ? null : { ...w, chars }
      })
    }, 60)
    return () => clearInterval(tick)
  }, [writingId, t])

  // Stop narration when the panel closes or the component unmounts.
  useEffect(() => {
    if (!open) {
      stopSpeech()
      setSpeech(null)
    }
    return stopSpeech
  }, [open])

  const startSpeech = (entryId: number, title: string, text: string, quiet = false) => {
    setSpeech({ entryId, status: 'loading' })
    const segments = [
      { text: stripVoiceMarkup(title), speed: 1, volume: 1, pauseAfter: 0.6 },
      ...toSpeechSegments(text),
    ]
    speakSegments(segments, () => setSpeech({ entryId, status: 'speaking' }))
      .then(() => setSpeech((s) => (s?.entryId === entryId ? null : s)))
      .catch(() => {
        // Quiet mode: auto-narration failures (e.g. autoplay policy before
        // the first user gesture) must not surface as an error toast.
        if (!quiet) setToast(t.journalPanel.voiceError)
        setSpeech((s) => (s?.entryId === entryId ? null : s))
      })
  }

  // Auto-narration (design.md §15): a newly appearing entry is read aloud
  // without requiring a click, when the language has a voice and the
  // do-not-disturb option (design.md §16) is off.
  const prevCount = useRef(journal.length)
  useEffect(() => {
    const prev = prevCount.current
    prevCount.current = journal.length
    if (journal.length <= prev || !speechAvailable(t.lang)) return
    if (useUi.getState().journalDnd) return
    const e = journal[journal.length - 1]
    startSpeech(e.id, resolveText(t, e.title), resolveText(t, e.text), true)
    // startSpeech is recreated per render; the entry count is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journal, t])

  if (!open) return null

  const speakEntry = (entryId: number, title: string, text: string) => {
    if (speech?.entryId === entryId) {
      stopSpeech()
      setSpeech(null)
      return
    }
    startSpeech(entryId, title, text)
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
          const plain = stripVoiceMarkup(text)
          const isWriting = writing?.entryId === e.id
          return (
            <div
              key={e.id}
              className={`entry${e.kind === 'hint' ? ' hint' : ''}${isWriting ? ' writing' : ''}`}
              // A click finishes the handwriting immediately (§16 comfort).
              onClick={isWriting ? () => setWriting(null) : undefined}
            >
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
              <p>
                {isWriting ? plain.slice(0, Math.floor(writing.chars)) : plain}
                {isWriting && <WritingHand wounds={e.wounds ?? 0} />}
              </p>
              <BloodMarks entry={e} />
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}
