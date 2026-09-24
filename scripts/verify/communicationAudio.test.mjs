import { describe, it, expect } from 'vitest'
import { analyseAudioWindow, stereoWav } from './communicationAudio.mjs'
const sr = 8192
const tone = (hz, amp = 0.5) => Array.from({ length: sr }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr))
const bands = { low: [100, 180], high: [220, 280] }
describe('final-output audio evidence', () => {
  it('measures stereo peaks, RMS and calibrated band energy independently', () => {
    const a = analyseAudioWindow([tone(128), tone(256, 0.25)], sr, bands)
    expect(a.channels[0].peak).toBeCloseTo(0.5)
    expect(a.channels[0].rms).toBeCloseTo(0.5 / Math.sqrt(2))
    expect(a.channels[0].bandMeanSquare.low).toBeCloseTo(0.125, 5)
    expect(a.channels[1].bandMeanSquare.high).toBeCloseTo(0.03125, 5)
    expect(a.channels[0].bandMeanSquare.high).toBeLessThan(1e-10)
    expect(a.channels[1].bandMeanSquare.low).toBeLessThan(1e-10)
  })
  it('keeps silence zero and reports missing and overlapping sample blocks', () => {
    const zero = Array(sr).fill(0)
    const a = analyseAudioWindow([zero, zero], sr, bands, [
      { frame: 0, length: 128 }, { frame: 256, length: 128 }, { frame: 300, length: 128 },
    ])
    expect(a.channels.every((c) => c.peak === 0 && c.rms === 0)).toBe(true)
    expect(a.gaps.map((g) => g.missingFrames)).toEqual([128, -84])
  })
  it('reads an early block followed by an equally late one as a restamp, not a gap', () => {
    const zero = Array(sr).fill(0)
    const a = analyseAudioWindow([zero, zero], sr, bands, [
      { frame: 0, length: 128 }, { frame: 0, length: 128 }, { frame: 256, length: 128 }, { frame: 384, length: 128 },
    ])
    expect(a.gaps).toEqual([])
    expect(a.restamped).toEqual([{ afterFrame: 0, shiftFrames: -128 }])
    const lost = analyseAudioWindow([zero, zero], sr, bands, [
      { frame: 0, length: 128 }, { frame: 0, length: 128 }, { frame: 384, length: 128 },
    ])
    expect(lost.gaps.map((g) => g.missingFrames)).toEqual([-128, 256])
  })
  it('rejects missing, malformed and undersized evidence', () => {
    expect(() => analyseAudioWindow([[], []], sr, bands)).toThrow()
    expect(() => analyseAudioWindow([tone(128), [0]], sr, bands)).toThrow()
    expect(() => analyseAudioWindow([tone(128), tone(128)], sr, { bad: [0, sr] })).toThrow()
    expect(() => analyseAudioWindow([[NaN], [0]], sr, bands)).toThrow()
    expect(() => analyseAudioWindow([[0], [0]], sr, bands)).toThrow()
  })
  it('writes playable, interleaved stereo PCM with clipping and correct duration', () => {
    const wav = stereoWav([[0, 1, -2], [0.5, -1, 2]], sr)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(sr)
    expect(wav.readUInt32LE(40)).toBe(12)
    expect(wav.readInt16LE(46)).toBe(16384)
    expect(wav.readInt16LE(52)).toBe(-32767)
    expect(wav.readInt16LE(54)).toBe(32767)
    expect(() => stereoWav([[0], []], sr)).toThrow()
  })
})
