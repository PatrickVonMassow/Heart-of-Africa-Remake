// Emotional voice markup for journal texts (design.md §15). Journal strings
// in the language files carry lightweight inline tags that describe the
// delivery, e.g. "[awe]The desert![pause] A sea of sand …[/awe]". The tags
// are additive: removing them must yield well-formed prose, so the display
// pipeline simply strips them. The speech pipeline turns them into prosody —
// pacing, punctuation shaping, per-passage speed and loudness — before the
// text reaches the TTS engine (parser → TTS text → audio).
//
// Vocabulary:
//   Span moods   [awe] [whisper] [excited] [somber] [weary] [fear] … [/tag]
//   Emphasis     [emph]word[/emph]  — a stressed word or short phrase
//   Display-only [mute]…[/mute]     — shown in the journal, never spoken
//   Beats        [pause] [breath]   — short / long silence between words
//
// Spans may nest (e.g. [emph] inside [excited]); the innermost mood wins.

export type VoiceMood = 'neutral' | 'awe' | 'whisper' | 'excited' | 'somber' | 'weary' | 'fear'

/** One unit of speech: shaped text plus delivery parameters. */
export interface SpeechSegment {
  text: string
  /** Kokoro speaking-speed multiplier. */
  speed: number
  /** Playback gain 0..1. */
  volume: number
  /** Seconds of silence after this segment. */
  pauseAfter: number
}

const MOODS = ['awe', 'whisper', 'excited', 'somber', 'weary', 'fear'] as const
const TAG_RE = /\[(\/?)(awe|whisper|excited|somber|weary|fear|emph|mute|pause|breath)\]/g

const PAUSE_SHORT = 0.45
const PAUSE_LONG = 0.9
const PAUSE_EMPH = 0.25

/** Remove all voice tags for display; the remaining text is normal prose. */
export function stripVoiceMarkup(text: string): string {
  return text.replace(TAG_RE, '').replace(/ {2,}/g, ' ').trim()
}

// Punctuation shaping per mood: Kokoro reads "…" as a beat and "!" with
// energy, so sentence endings are rewritten to carry the emotion.
const endOfSentence = /(?<=\S)\.(?=\s|$)/g
const softEnd = /(?<=\S)[.!](?=\s|$)/g

interface MoodStyle {
  speed: number
  volume: number
  shape?: (text: string) => string
}

const MOOD_STYLE: Record<VoiceMood, MoodStyle> = {
  neutral: { speed: 1, volume: 1 },
  awe: { speed: 0.86, volume: 0.95, shape: (t) => t.replace(endOfSentence, '...') },
  whisper: { speed: 0.8, volume: 0.45, shape: (t) => t.replace(softEnd, '...') },
  excited: { speed: 1.12, volume: 1, shape: (t) => t.replace(endOfSentence, '!') },
  somber: { speed: 0.9, volume: 0.8 },
  weary: { speed: 0.82, volume: 0.75, shape: (t) => t.replace(endOfSentence, '...') },
  fear: { speed: 0.94, volume: 0.6, shape: (t) => t.replace(softEnd, '...') },
}

/**
 * Parse a marked-up journal text into TTS-ready segments. Mood spans map to
 * speed/volume and punctuation shaping, [emph] slows down and isolates its
 * words between micro-pauses, beats become real silence, [mute] is dropped.
 */
export function toSpeechSegments(text: string): SpeechSegment[] {
  interface RawSeg {
    text: string
    mood: VoiceMood
    emph: boolean
    pauseAfter: number
  }
  const raw: RawSeg[] = []
  const moodStack: VoiceMood[] = ['neutral']
  let emphDepth = 0
  let muteDepth = 0

  const addPause = (seconds: number) => {
    const last = raw[raw.length - 1]
    if (last) last.pauseAfter = Math.max(last.pauseAfter, seconds)
  }
  const addText = (chunk: string) => {
    if (muteDepth > 0 || !chunk.trim()) return
    const mood = moodStack[moodStack.length - 1]
    const emph = emphDepth > 0
    const last = raw[raw.length - 1]
    if (last && last.mood === mood && last.emph === emph && last.pauseAfter === 0) {
      last.text += chunk
    } else {
      raw.push({ text: chunk, mood, emph, pauseAfter: 0 })
    }
  }

  let cursor = 0
  for (const match of text.matchAll(TAG_RE)) {
    addText(text.slice(cursor, match.index))
    cursor = match.index + match[0].length
    const closing = match[1] === '/'
    const tag = match[2]
    if (tag === 'pause') addPause(PAUSE_SHORT)
    else if (tag === 'breath') addPause(PAUSE_LONG)
    else if (tag === 'mute') muteDepth = Math.max(0, muteDepth + (closing ? -1 : 1))
    else if (tag === 'emph') {
      emphDepth = Math.max(0, emphDepth + (closing ? -1 : 1))
      addPause(PAUSE_EMPH)
    } else if (closing) {
      if (moodStack.length > 1) moodStack.pop()
    } else if ((MOODS as readonly string[]).includes(tag)) {
      moodStack.push(tag as VoiceMood)
    }
  }
  addText(text.slice(cursor))

  return raw.map((seg) => {
    const style = MOOD_STYLE[seg.mood]
    return {
      text: (style.shape ? style.shape(seg.text) : seg.text).replace(/\s+/g, ' ').trim(),
      speed: seg.emph ? style.speed * 0.88 : style.speed,
      volume: style.volume,
      pauseAfter: seg.pauseAfter,
    }
  }).filter((seg) => seg.text.length > 0)
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__voiceMarkup = { stripVoiceMarkup, toSpeechSegments }
}
