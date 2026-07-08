// Journal read-aloud (design.md §15): speaks journal entries with the Kokoro
// TTS model running in the browser (kokoro-js). The model is fetched from the
// Hugging Face CDN on first use and cached by the browser afterwards. Kokoro
// runs on a *separate* WebGPU compute path (onnxruntime-web), distinct from the
// three.js renderer's WebGPU: that compute backend is only reliable on
// Chromium, so the GPU path is restricted to Chromium and every other browser
// (Firefox, Safari) uses the universally-working WASM path — otherwise Firefox
// picks WebGPU (navigator.gpu exists there and drives the renderer fine) and
// the synthesis fails. Kokoro currently has no German voice, so read-aloud is
// offered for English only — German texts carry the same voice markup so a
// German-capable engine can be added later.
// OPEN: German read-aloud once a German-capable TTS voice is available.

import type { SpeechSegment } from './voiceMarkup'

/** Languages the speech engine can narrate. */
const SPEECH_LANGS = ['en']

export function speechAvailable(lang: string): boolean {
  return SPEECH_LANGS.includes(lang)
}

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
// British male voice — fits the Victorian explorer reading his own diary.
const VOICE = 'bm_george'

interface RawAudioLike {
  audio: Float32Array
  sampling_rate: number
}
interface KokoroLike {
  generate(text: string, opts: { voice: string; speed: number }): Promise<RawAudioLike>
}

let enginePromise: Promise<KokoroLike> | null = null

function loadEngine(): Promise<KokoroLike> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { KokoroTTS } = await import('kokoro-js')
      // Dev hook: the headless verification forces the small WASM model to
      // avoid the large fp32 download (CLAUDE.md §7.2).
      const forceWasm =
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        Boolean((window as unknown as Record<string, unknown>).__ttsForceWasm)
      // Only Chromium's onnxruntime WebGPU backend is reliable for the TTS.
      // navigator.userAgentData is Chromium-only, so it gates the GPU path;
      // Firefox/Safari fall through to WASM instead of a broken WebGPU run.
      const chromium = typeof navigator !== 'undefined' && 'userAgentData' in navigator
      const webgpu = !forceWasm && chromium && 'gpu' in navigator
      // WASM q8 sounds fine and works everywhere; WebGPU needs fp32 (quantized
      // weights produce audible artifacts on the GPU path).
      const buildModel = (device: 'webgpu' | 'wasm') =>
        KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: device === 'webgpu' ? 'fp32' : 'q8',
          device,
        }) as unknown as Promise<KokoroLike>
      if (webgpu) {
        try {
          return await buildModel('webgpu')
        } catch (err) {
          // WebGPU present but the compute backend failed to initialise —
          // fall back to WASM rather than leaving read-aloud broken.
          console.warn('Kokoro WebGPU unavailable; falling back to WASM.', err)
        }
      }
      return await buildModel('wasm')
    })()
    // A failed download (e.g. offline) must not poison later attempts.
    enginePromise.catch(() => {
      enginePromise = null
    })
  }
  return enginePromise
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

  const tts = await loadEngine()
  if (run.cancelled) return

  // Lookahead of one: synthesize the next segment while the current plays.
  let playing: Promise<void> = Promise.resolve()
  let started = false
  for (const seg of segments) {
    if (run.cancelled) return
    const raw = await tts.generate(seg.text, { voice: VOICE, speed: seg.speed })
    await playing
    if (run.cancelled) return
    if (!started) {
      started = true
      onSpeaking?.()
    }
    playing = playSegment(run, raw, seg)
  }
  await playing
  if (currentRun === run) currentRun = null
}
