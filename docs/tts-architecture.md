# Journal read-aloud architecture

Implementation detail for the journal speech rule in `CLAUDE.md` §§3 and 6.
The binding outcome remains in that file; this document holds the mechanics and
decision history needed when the voice pipeline changes.

The journal uses `kokoro-js` fully in the browser. Synthesis runs in
`src/journal/ttsWorker.ts`; the main thread sends text segments and plays the
returned PCM, so synthesis never blocks the game loop. Chromium uses the
onnxruntime WebGPU fp32 path and other browsers use WASM q8. The main thread
selects the device and passes it to the worker.

Point 117 reversed point 100's WASM-only decision because WebGPU produces speech
faster than real time. Its cold onnxruntime initialization can saturate the GPU
process for roughly 15 seconds, so `warmupSpeech` starts about 1.2 seconds after
mount and pays that stall before the first narration. The WASM fallback does not
occupy the GPU process; headless verification selects it through
`window.__ttsForceWasm`, and `scripts/verify/voice.mjs` probes requestAnimationFrame
liveness while it loads. Model weights stream from the Hugging Face CDN and use
the browser cache; they are neither repository nor bundle assets. The entire TTS
stack, worker included, stays lazy and out of startup chunks.

Voice markup travels through
`src/journal/voiceMarkup.ts` → `src/journal/speech.ts` →
`src/journal/ttsWorker.ts`. Display strips the markers; speech converts them to
prosody. Both language files carry markup even though Kokoro currently supplies
no German voice.
