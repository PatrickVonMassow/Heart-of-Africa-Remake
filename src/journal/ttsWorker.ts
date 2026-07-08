// TTS worker (design.md §15/§16): runs the Kokoro model off the main thread so
// synthesis never blocks the game loop. The main thread posts a text segment
// and gets back raw PCM; all the heavy work (module import, model download and
// init, phonemization, inference) happens here. The device is decided on the
// main thread (WebGPU only on Chromium) and passed in as `preferWebgpu`.

/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js'

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

let enginePromise: Promise<KokoroLike> | null = null

function loadEngine(preferWebgpu: boolean): Promise<KokoroLike> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // WASM q8 works everywhere; WebGPU needs fp32 (quantized weights sound
      // wrong on the GPU path). WebGPU is available in workers on Chromium.
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

self.onmessage = async (e: MessageEvent<GenerateRequest>) => {
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
