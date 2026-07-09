// Pure voice-markup parser (CLAUDE.md §7.1 pt. 19, design.md §15). Ported from
// the window.__voiceMarkup asserts of scripts/verify/voice.mjs — same coverage,
// no browser. The read-aloud audio itself stays a Playwright/TTS check.
import { describe, it, expect } from 'vitest'
import { stripVoiceMarkup, toSpeechSegments } from './voiceMarkup'

const SAMPLE =
  '[excited]At last![/excited] [pause]I found it. [whisper]I am afraid.[/whisper] [mute](note)[/mute] [emph]Unbelievable.[/emph]'

describe('stripVoiceMarkup (display)', () => {
  it('removes every tag and leaves well-formed prose', () => {
    const out = stripVoiceMarkup(SAMPLE)
    expect(out).not.toMatch(/\[[a-z/]+\]/)
    expect(out).toContain('At last!')
  })

  it('keeps [mute] text for display', () => {
    expect(stripVoiceMarkup(SAMPLE)).toContain('(note)')
  })

  it('collapses the double spaces a stripped tag leaves behind', () => {
    expect(stripVoiceMarkup('a [pause] b')).toBe('a b')
  })
})

describe('toSpeechSegments (prosody)', () => {
  const segs = toSpeechSegments(SAMPLE)

  it('drops [mute] text from speech', () => {
    expect(segs.every((s) => !s.text.includes('note'))).toBe(true)
  })

  it('varies speed by mood', () => {
    expect(new Set(segs.map((s) => s.speed)).size).toBeGreaterThanOrEqual(3)
  })

  it('varies loudness by mood', () => {
    expect(new Set(segs.map((s) => s.volume)).size).toBeGreaterThanOrEqual(2)
  })

  it('inserts real pauses', () => {
    expect(segs.some((s) => s.pauseAfter > 0)).toBe(true)
  })

  it('shapes punctuation for whisper (period → ellipsis)', () => {
    expect(segs.some((s) => s.text.includes('afraid...'))).toBe(true)
  })

  it('produces no empty segments', () => {
    expect(segs.every((s) => s.text.length > 0)).toBe(true)
  })

  it('the innermost mood wins for nested spans', () => {
    // [emph] inside [excited]: the emph segment slows below the plain excited speed.
    const nested = toSpeechSegments('[excited]Look [emph]there[/emph] now.[/excited]')
    const emph = nested.find((s) => s.text.includes('there'))
    const plain = nested.find((s) => s.text.includes('Look'))
    expect(emph).toBeDefined()
    expect(plain).toBeDefined()
    expect(emph!.speed).toBeLessThan(plain!.speed)
  })
})
