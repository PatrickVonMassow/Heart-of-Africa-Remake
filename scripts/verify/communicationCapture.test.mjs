import { it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { saveAudioWindow } from './communicationCapture.mjs'
it('persists recordings and timestamped receipts, and refuses silent evidence after saving it', async () => {
  const out = mkdtempSync(`${tmpdir()}/communication-audio-`) + '/'
  try {
    const sampleRate = 8192
    const wave = Array.from({ length: 4096 }, (_, i) => Math.sin(i * 2 * Math.PI * 128 / sampleRate) / 4)
    const page = { evaluate: async () => ({ sampleRate, state: 'running', blocks: [
      { frame: 1024, receivedMs: 99, contextTime: 0.1, labels: [{ speakerId: 'villager-1' }], channels: [wave, wave] },
    ] }) }
    const receipt = await saveAudioWindow(page, out, 'adult-talk', { low: [100, 170], high: [200, 300] })
    expect(receipt.startFrame).toBe(1024)
    expect(receipt.endFrame).toBe(5120)
    expect(JSON.parse(readFileSync(`${out}adult-talk.json`)).blocks[0].labels[0].speakerId).toBe('villager-1')
    expect(readFileSync(`${out}adult-talk.wav`).length).toBe(44 + wave.length * 4)
    wave.fill(0)
    await expect(saveAudioWindow(page, out, 'silence', { low: [100, 170] })).rejects.toThrow('Missing audio evidence')
    expect(JSON.parse(readFileSync(`${out}silence.json`)).channels[0].rms).toBe(0)
  } finally { rmSync(out, { recursive: true, force: true }) }
})
