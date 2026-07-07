import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js is a single indivisible startup dependency; even as its own
    // chunk it exceeds the default 500 kB warning limit.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        // Vendor chunks: stable libraries cache independently of game code
        // and load in parallel.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
})
