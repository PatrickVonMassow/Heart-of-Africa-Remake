import { writeFileSync } from 'node:fs'
import { analyseAudioWindow, stereoWav } from './communicationAudio.mjs'

/** Measurement only: connect to the deployed output on ITS context. The silent
 * branch keeps the worklet processing without doubling what the player hears. */
export async function installCommunicationCapture(page) {
  await page.evaluate(async () => {
    const context = window.__ambience.context(), output = window.__ambience.output()
    if (!context || !output || context.state !== 'running') throw new Error('Missing evidence: audio context did not resume on the entry gesture')
    const source = `class ReceiptPCM extends AudioWorkletProcessor {
      constructor() { super(); this.parts = [[], []]; this.start = currentFrame; }
      process(inputs) {
        // An inactive upstream graph arrives as zero channels: that quantum is
        // silence at the output, recorded as zeros rather than as a gap.
        const input = inputs[0]?.[0] ? inputs[0] : [new Float32Array(128)];
        if (!this.parts[0].length) this.start = currentFrame;
        for (let c = 0; c < 2; c++) this.parts[c].push(...(input[c] || input[0]));
        if (this.parts[0].length >= 2048) {
          this.port.postMessage({ frame: this.start, channels: this.parts });
          this.parts = [[], []];
        }
        return true;
      }
    }; registerProcessor('receipt-pcm', ReceiptPCM);`
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    try { await context.audioWorklet.addModule(url) } finally { URL.revokeObjectURL(url) }
    const node = new AudioWorkletNode(context, 'receipt-pcm', { channelCount: 2, channelCountMode: 'explicit' })
    const silence = context.createGain(); silence.gain.value = 0
    output.connect(node); node.connect(silence); silence.connect(context.destination)
    const ring = [], windows = new Map()
    node.port.onmessage = ({ data }) => {
      data.receivedMs = performance.now()
      data.contextTime = context.currentTime
      data.labels = window.__speech?.labels() ?? []
      data.performance = window.__ui.getState().drumPerformance?.plan.message ?? null
      ring.push(data)
      while (ring.length && (data.frame - ring[0].frame) / context.sampleRate > 3) ring.shift()
      for (const win of windows.values()) win.push(data)
    }
    window.__communicationCapture = {
      start(name, preRoll = 0) {
        if (windows.has(name)) throw new Error('Duplicate audio window: ' + name)
        windows.set(name, ring.filter((b) => b.frame / context.sampleRate >= context.currentTime - preRoll))
        return { contextTime: context.currentTime, pageMs: performance.now(), state: context.state }
      },
      take(name) {
        const blocks = windows.get(name)
        if (!blocks?.length) throw new Error('Missing audio samples: ' + name)
        windows.delete(name)
        return { sampleRate: context.sampleRate, state: context.state, blocks }
      },
      stop() { output.disconnect(node); node.disconnect(); silence.disconnect(); node.port.close() },
    }
  })
}

export async function startAudioWindow(page, name, preRoll = 0) {
  return page.evaluate(({ name, preRoll }) => window.__communicationCapture.start(name, preRoll), { name, preRoll })
}

export async function saveAudioWindow(page, out, name, bands, fileStem = name) {
  const captured = await page.evaluate((name) => window.__communicationCapture.take(name), name)
  const channels = [0, 1].map((c) => captured.blocks.flatMap((b) => b.channels[c]))
  const blocks = captured.blocks.map(({ channels, ...b }) => ({ ...b, length: channels[0].length }))
  const receipt = { name, state: captured.state, startFrame: blocks[0].frame,
    endFrame: blocks.at(-1).frame + blocks.at(-1).length,
    recording: `${fileStem}.wav`, blocks, ...analyseAudioWindow(channels, captured.sampleRate, bands, blocks) }
  writeFileSync(`${out}${fileStem}.wav`, stereoWav(channels, captured.sampleRate))
  writeFileSync(`${out}${fileStem}.json`, JSON.stringify(receipt, null, 2))
  if (receipt.state !== 'running' || receipt.gaps.length || receipt.channels.every((c) => c.peak === 0)) {
    throw new Error(`Missing audio evidence in ${name}: state=${receipt.state}, gaps=${receipt.gaps.length}, peaks=${receipt.channels.map((c) => c.peak)}`)
  }
  return receipt
}
