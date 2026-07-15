// Journal read-aloud (design.md §15/§16): speaks journal entries with the
// Kokoro TTS model (kokoro-js), fetched from the Hugging Face CDN on first use
// and cached by the browser. The model runs in a Web Worker (ttsWorker.ts) so
// synthesis never blocks the game loop — the main thread only posts text and
// plays back the returned PCM through the AudioContext. The engine always runs
// the quantized WASM path (q8, point 100): the onnxruntime WebGPU init
// saturated the GPU process during the cold load and froze the rendered game
// ~15 s. Kokoro currently has no German voice, so read-aloud is offered for
// English only — German texts carry the same voice markup so a German-capable
// engine can be added later.
// OPEN: German read-aloud once a German-capable TTS voice is available.

import type { SpeechSegment } from './voiceMarkup'

/** Languages the speech engine can narrate. */
const SPEECH_LANGS = ['en']

export function speechAvailable(lang: string): boolean {
  return SPEECH_LANGS.includes(lang)
}

// British male voice — fits the Victorian explorer reading his own diary.
const VOICE = 'bm_george'

interface RawAudioLike {
  audio: Float32Array
  sampling_rate: number
}

// The Kokoro model runs in a Web Worker so synthesis never blocks the game
// loop (design.md §16): the main thread only posts text and receives PCM.
let worker: Worker | null = null
let reqId = 0
const pending = new Map<number, { resolve: (r: RawAudioLike) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./ttsWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, audio, samplingRate, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok) p.resolve({ audio, sampling_rate: samplingRate })
      else p.reject(new Error(error))
    }
    worker.onerror = () => {
      // A worker crash fails every outstanding request and resets the worker.
      for (const p of pending.values()) p.reject(new Error('tts worker error'))
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

/** Synthesize one segment in the worker; resolves with its raw PCM. */
function synthesize(text: string, voice: string, speed: number): Promise<RawAudioLike> {
  const id = ++reqId
  return new Promise<RawAudioLike>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, text, voice, speed })
  })
}

interface Run {
  cancelled: boolean
  source: AudioBufferSourceNode | null
}

let ctx: AudioContext | null = null
let currentRun: Run | null = null

/** Stop the current narration immediately (no-op when idle). */
export function stopSpeech(): void {
  if (!currentRun) return
  currentRun.cancelled = true
  try {
    currentRun.source?.stop()
  } catch {
    // Source may not have started yet.
  }
  currentRun = null
}

function playSegment(run: Run, raw: RawAudioLike, seg: SpeechSegment): Promise<void> {
  return new Promise((resolve) => {
    if (!ctx || run.cancelled) return resolve()
    const buffer = ctx.createBuffer(1, raw.audio.length, raw.sampling_rate)
    buffer.getChannelData(0).set(raw.audio)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = seg.volume
    source.connect(gain)
    gain.connect(ctx.destination)
    run.source = source
    source.onended = () => {
      run.source = null
      if (seg.pauseAfter > 0 && !run.cancelled) {
        setTimeout(resolve, seg.pauseAfter * 1000)
      } else {
        resolve()
      }
    }
    source.start()
  })
}

/**
 * Narrate the given segments in order. Cancels any narration in progress.
 * `onSpeaking` fires when the first audio actually starts (after the model
 * has loaded and the first chunk is synthesized). Resolves when narration
 * finishes or is stopped; rejects when the engine cannot be loaded.
 */
export async function speakSegments(segments: SpeechSegment[], onSpeaking?: () => void): Promise<void> {
  stopSpeech()
  const run: Run = { cancelled: false, source: null }
  currentRun = run

  // Check the autoplay policy BEFORE loading the engine: while audio is
  // blocked (no user gesture yet), the model download must not start.
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  if ((ctx.state as string) !== 'running') throw new Error('audio context suspended')

  // Fire EVERY segment's synthesis up front so the worker runs maximally ahead
  // of playback and builds a growing buffer. A lockstep one-ahead lookahead was
  // enough on the fast WebGPU path but not on the slower WASM path (point 100):
  // there the next segment finished synthesizing only AFTER the current one
  // stopped playing, so the narration stuttered — a bit, a long pause, a bit
  // more. The worker processes the queued requests in order; playback consumes
  // them in order, catching up during the longer segments. (One rejected
  // request must not surface as an unhandled rejection on the ones we never
  // await, e.g. after a cancel.)
  const audios = segments.map((seg) => synthesize(seg.text, VOICE, seg.speed))
  audios.forEach((p) => p.catch(() => {}))
  let playing: Promise<void> = Promise.resolve()
  let started = false
  for (let i = 0; i < segments.length; i++) {
    if (run.cancelled) return
    const raw = await audios[i]
    await playing
    if (run.cancelled) return
    if (!started) {
      started = true
      onSpeaking?.()
    }
    playing = playSegment(run, raw, segments[i])
  }
  await playing
  if (currentRun === run) currentRun = null
}
