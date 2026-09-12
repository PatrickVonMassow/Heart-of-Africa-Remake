// Live analyser reads must not wait for a paint: under WebGL load RAF can skip
// both low-syllable windows. Timers schedule reads; the audio clock locates them.
export async function sampleSpeech(ac, analysers, tones, startedAt) {
  const bands = [[-Infinity, -Infinity], [-Infinity, -Infinity]]
  const windowHits = [0, 0]
  let passes = 0
  let peak = 0
  const spectra = new Float32Array(analysers[0].frequencyBinCount)
  const wave = new Float32Array(analysers[0].fftSize)
  const until = ac.currentTime + 1.4
  while (ac.currentTime < until) {
    const elapsed = ac.currentTime - startedAt
    passes++
    // Count complete stereo reads, once per pass, separately for each window.
    const window = elapsed > 0.04 && elapsed < 0.18 ? 0
      : elapsed > 0.64 && elapsed < 0.78 ? 1 : -1
    analysers.forEach((node, channel) => {
      node.getFloatTimeDomainData(wave)
      for (const value of wave) peak = Math.max(peak, Math.abs(value))
      // RIVER's first and third syllables are low. The adult HIGH carrier is
      // near the child LOW, so retain these exact windows for the comparison.
      if (window === -1) return
      node.getFloatFrequencyData(spectra)
      tones.forEach((hz, voice) => {
        const from = Math.floor(hz * 0.92 * node.fftSize / ac.sampleRate)
        const to = Math.ceil(hz * 1.03 * node.fftSize / ac.sampleRate)
        for (let i = from; i <= to; i++) bands[voice][channel] = Math.max(bands[voice][channel], spectra[i])
      })
    })
    if (window !== -1) windowHits[window]++
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return { peak, bands, passes, windowHits }
}

// A timer decouples sampling from paint, but cannot prevent main-thread stalls.
// Fail explicitly if either window was skipped, even if the other yielded bands.
export function judgeSpeechSampling(measured) {
  const missing = []
  for (const name of ['deployed', 'withDrums']) {
    measured[name].windowHits.forEach((hits, window) => {
      if (hits === 0) missing.push(`${name} ${window === 0 ? '0.04–0.18' : '0.64–0.78'} s: 0 hits`)
    })
  }
  return {
    ok: missing.length === 0,
    detail: missing.length ? `SAMPLER MISSED LOW-SYLLABLE WINDOWS — ${missing.join('; ')}` : JSON.stringify(measured),
  }
}
