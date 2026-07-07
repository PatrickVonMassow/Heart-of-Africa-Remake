import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The TTS stack resolves its WASM/worker assets at runtime; esbuild
  // pre-bundling breaks those URLs in dev.
  optimizeDeps: {
    exclude: ['kokoro-js', '@huggingface/transformers', 'onnxruntime-web'],
  },
  build: {
    // three.js (startup) and the lazily loaded TTS stack are single
    // indivisible library chunks well above the default 500 kB limit.
    chunkSizeWarningLimit: 2300,
    rolldownOptions: {
      output: {
        // Vendor chunks: stable libraries cache independently of game code
        // and load in parallel.
        codeSplitting: {
          groups: [
            // TTS stays its own chunk so the dynamic import keeps it out of
            // the eagerly loaded vendor bundle (journal read-aloud only).
            { name: 'tts', test: /node_modules[\\/](kokoro-js|@huggingface|onnxruntime-[^\\/]+|phonemizer)[\\/]/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
})
