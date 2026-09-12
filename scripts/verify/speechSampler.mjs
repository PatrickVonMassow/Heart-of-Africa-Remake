// Live analyser reads must not wait for a paint: under WebGL load RAF can skip
// both low-syllable windows. Timers schedule reads; the audio clock locates them.
export async function sampleSpeech(ac, analysers, tones, startedAt) {
  const bands = [[-Infinity, -Infinity], [-Infinity, -Infinity]]
  let peak = 0
  const spectra = new Float32Array(analysers[0].frequencyBinCount)
  const wave = new Float32Array(analysers[0].fftSize)
  const until = ac.currentTime + 1.4
  while (ac.currentTime < until) {
    const elapsed = ac.currentTime - startedAt
    analysers.forEach((node, channel) => {
      node.getFloatTimeDomainData(wave)
      for (const value of wave) peak = Math.max(peak, Math.abs(value))
      // RIVER's first and third syllables are low. The adult HIGH carrier is
      // near the child LOW, so retain these exact windows for the comparison.
      if (!((elapsed > 0.04 && elapsed < 0.18) || (elapsed > 0.64 && elapsed < 0.78))) return
      node.getFloatFrequencyData(spectra)
      tones.forEach((hz, voice) => {
        const from = Math.floor(hz * 0.92 * node.fftSize / ac.sampleRate)
        const to = Math.ceil(hz * 1.03 * node.fftSize / ac.sampleRate)
        for (let i = from; i <= to; i++) bands[voice][channel] = Math.max(bands[voice][channel], spectra[i])
      })
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return { peak, bands }
}
