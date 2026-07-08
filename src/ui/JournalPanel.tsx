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

import { useEffect, useRef, useState, type CSSProperties } from 'react'
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

/** The writing hand gripping a pen (design.md §16); tinted by wound level.
 *  The nib sits at the lower-left so it meets the text baseline as it writes. */
function WritingHand({ wounds }: { wounds: 0 | 1 | 2 }) {
  const cls = wounds === 2 ? ' bloody' : wounds === 1 ? ' marked' : ''
  return (
    <span className={`writing-hand${cls}`} aria-hidden="true">
      <svg viewBox="0 0 40 34" width="34" height="29">
        {/* Pen shaft and dark nib touching the writing line */}
        <line x1="6" y1="30" x2="31" y2="5" className="pen-shaft" strokeLinecap="round" />
        <line x1="6" y1="30" x2="10.5" y2="25.5" className="pen-nib" strokeLinecap="round" />
        {/* Ink dot at the nib */}
        <circle cx="6" cy="30" r="1.3" className="pen-ink" />
        {/* Back of the hand / cuff */}
        <path d="M27 5 Q39 9 39 20 Q39 31 27 30 L19 21 Q22 12 27 5 Z" className="hand-skin" />
        {/* Three fingers curling over the pen shaft */}
        <ellipse cx="23" cy="15" rx="5.4" ry="2.6" className="hand-skin" transform="rotate(-45 23 15)" />
        <ellipse cx="20.3" cy="18.2" rx="4.9" ry="2.4" className="hand-skin" transform="rotate(-45 20.3 18.2)" />
        <ellipse cx="18" cy="21.2" rx="4.2" ry="2.2" className="hand-skin" transform="rotate(-45 18 21.2)" />
      </svg>
    </span>
  )
}

/** Deterministic blood traces on entries written by a wounded hand (§16):
 *  irregular droplets with a run-off drip and a few satellite specks, so they
 *  read as spattered blood rather than tidy dots. */
function BloodMarks({ entry }: { entry: JournalEntry }) {
  if (!entry.wounds) return null
  const count = entry.wounds === 2 ? 5 : 2
  const rand = (a: number, b: number) => {
    const h = Math.sin(entry.id * a + b) * 43758.5453
    return h - Math.floor(h)
  }
  const marks = Array.from({ length: count }, (_, i) => {
    const r1 = rand(12.9898 + i * 4.1, 78.233)
    const r2 = rand(39.346 + i * 2.7, 11.135)
    const r3 = rand(7.135 + i * 3.3, 21.71)
    return {
      left: `${8 + r1 * 82}%`,
      top: `${12 + r2 * 70}%`,
      size: entry.wounds === 2 ? 6 + r1 * 8 : 3.5 + r1 * 3.5,
      rot: Math.floor(r3 * 360),
    }
  })
  return (
    <div className={`blood-marks${entry.wounds === 2 ? ' severe' : ''}`} aria-hidden="true">
      {marks.map((m, i) => (
        <span
          key={i}
          className="blood-drop"
          style={{ left: m.left, top: m.top, width: m.size, height: m.size, ['--rot']: `${m.rot}deg` } as CSSProperties}
        />
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

  // While a new entry is written into the book (design.md §16), follow the
  // growing text down so the appearing content stays in view. `writing` gets a
  // fresh object each reveal tick, so this re-runs as the text grows.
  useEffect(() => {
    if (open && writing) endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [open, writing])

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

  // Initial narration (design.md §15): the entry already in the book when
  // the game starts (the departure entry) also counts as newly appearing,
  // but the browser's autoplay policy blocks audio until the first user
  // gesture — so its narration is deferred to exactly that gesture.
  useEffect(() => {
    if (!speechAvailable(t.lang)) return
    const onGesture = (ev: Event) => {
      // Synthetic events (e.g. gamepad button mapping) carry no user
      // activation and must not consume the one-shot narration.
      if (!ev.isTrusted) return
      cleanup()
      const g = useGame.getState()
      if (useUi.getState().journalDnd || !g.journalOpen || g.journal.length === 0) return
      const e = g.journal[g.journal.length - 1]
      startSpeech(e.id, resolveText(t, e.title), resolveText(t, e.text), true)
    }
    const cleanup = () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return cleanup
    // Mount-only: the very first user gesture decides once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
