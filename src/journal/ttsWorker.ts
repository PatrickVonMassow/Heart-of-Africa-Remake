// TTS worker (design.md §15/§16): runs the Kokoro model off the main thread so
// synthesis never blocks the game loop. The main thread posts a text segment
// and gets back raw PCM; all the heavy work (module import, model download and
// init, phonemization, inference) happens here. The engine always runs the
// quantized WASM path (q8): the onnxruntime WebGPU init saturated the GPU
// process during the cold load and froze the RENDERED game ~15 s (the
// compositor delivered no frames while timers kept firing — measured in dev
// AND the built app, point 100), and the WebGPU path needs the 4x larger fp32
// weights for no audible gain on an 82M voice model.

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
}

interface WarmupRequest {
  warmup: true
}

type WorkerRequest = GenerateRequest | WarmupRequest

let enginePromise: Promise<KokoroLike> | null = null

function loadEngine(): Promise<KokoroLike> {
  if (!enginePromise) {
    // Quantized WASM everywhere (point 100): audibly equivalent for the 82M
    // voice model, a quarter of the fp32 download, and it never touches the
    // GPU process — so the game keeps rendering through the cold load.
    enginePromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
    }) as unknown as Promise<KokoroLike>
    // A failed load must not poison later attempts.
    enginePromise.catch(() => {
      enginePromise = null
    })
  }
  return enginePromise
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  // Warm-up: start the (slow) model download+init early so the first real
  // narration only has to synthesize, not cold-load (point 117). Fire-and-forget.
  if ('warmup' in e.data) {
    void loadEngine().catch(() => {})
    return
  }
  const { id, text, voice, speed } = e.data
  try {
    const tts = await loadEngine()
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
