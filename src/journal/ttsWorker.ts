// TTS worker (design.md §15/§16): runs the Kokoro model off the main thread so
// synthesis never blocks the game loop. The main thread posts a text segment
// and gets back raw PCM; all the heavy work (module import, model download and
// init, phonemization, inference) happens here. On Chromium the engine runs the
// WebGPU path (fp32) because it synthesizes FASTER THAN REALTIME — a fast,
// gapless read-aloud (user decision, point 117, reversing the WASM switch of
// point 100). Its one cost is the cold model load, which briefly stalls the
// GPU process (~15 s); the game pre-warms the model right at start (warmupSpeech)
// so that one freeze happens up front rather than at the first narration. Every
// non-Chromium browser (and the headless verification) uses the universally
// working WASM path (q8). The device is chosen on the main thread and passed in
// as `preferWebgpu`.

/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js'

// onnxruntime's WASM runtime prints two session-setup warning blocks
// ("[W:onnxruntime:...] Some nodes were not assigned ...") straight to
// stderr → console.error on every model load, and kokoro-js offers no
// session-options passthrough to lower that severity. Filter the known
// noise here — this worker's console is otherwise ours alone.
const rawConsoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  if (String(args[0] ?? '').includes('[W:onnxruntime:')) return
  rawConsoleError(...args)
}

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

interface RawAudioLike {
  audio: Float32Array
  sampling_rate: number
}
interface KokoroLike {
  generate(text: string, opts: { voice: string; speed: number }): Promise<RawAudioLike>
}

interface GenerateRequest {
  id: number
  text: string
  voice: string
  speed: number
  preferWebgpu: boolean
}

interface WarmupRequest {
  warmup: true
  preferWebgpu: boolean
}

type WorkerRequest = GenerateRequest | WarmupRequest

let enginePromise: Promise<KokoroLike> | null = null

function loadEngine(preferWebgpu: boolean): Promise<KokoroLike> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // WebGPU needs fp32 (the quantized weights sound wrong on the GPU path);
      // WASM uses q8. WebGPU synthesizes faster than realtime for a gapless
      // read-aloud; WASM is the universal fallback (point 117).
      const build = (device: 'webgpu' | 'wasm') =>
        KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: device === 'webgpu' ? 'fp32' : 'q8',
          device,
        }) as unknown as Promise<KokoroLike>
      if (preferWebgpu && typeof navigator !== 'undefined' && 'gpu' in navigator) {
        try {
          return await build('webgpu')
        } catch (err) {
          console.warn('TTS worker: WebGPU init failed, falling back to WASM.', err)
        }
      }
      return await build('wasm')
    })()
    // A failed load must not poison later attempts.
    enginePromise.catch(() => {
      enginePromise = null
    })
  }
  return enginePromise
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  // Warm-up: start the (slow) model download+init early so the first real
  // narration only has to synthesize, not cold-load, and so the WebGPU cold-load
  // GPU stall happens up front rather than mid-play (point 117). Fire-and-forget.
  if ('warmup' in e.data) {
    void loadEngine(e.data.preferWebgpu).catch(() => {})
    return
  }
  const { id, text, voice, speed, preferWebgpu } = e.data
  try {
    const tts = await loadEngine(preferWebgpu)
    const raw = await tts.generate(text, { voice, speed })
    // Transfer the audio buffer instead of copying it back to the main thread.
    ;(self as unknown as Worker).postMessage(
      { id, ok: true, audio: raw.audio, samplingRate: raw.sampling_rate },
      [raw.audio.buffer],
    )
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, error: String(err) })
  }
}
