// Analysis of the captured final-output PCM, never of the speech plan. Band
// energy is mean square in FFT bins, Hann-window compensated (not decibels).
export function analyseAudioWindow(channels, sampleRate, bands, blocks = []) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || channels.length !== 2 ||
      channels[0].length !== channels[1].length || !channels[0].length) {
    throw new Error('Audio evidence needs nonempty, equal stereo channels and a sample rate')
  }
  for (const [lo, hi] of Object.values(bands)) {
    if (!(lo >= 0 && hi > lo && hi <= sampleRate / 2)) throw new Error('Invalid audio band')
  }
  const size = 2048
  const spectra = []
  const result = channels.map((samples) => {
    let peak = 0, square = 0
    for (const v of samples) {
      if (!Number.isFinite(v)) throw new Error('Non-finite PCM')
      peak = Math.max(peak, Math.abs(v))
      square += v * v
    }
    const energy = Object.fromEntries(Object.keys(bands).map((k) => [k, 0]))
    const spectrum = new Float64Array(size / 2 + 1)
    let frames = 0
    for (let offset = 0; offset + size <= samples.length; offset += size / 2) {
      const re = new Float64Array(size), im = new Float64Array(size)
      let weight = 0
      for (let i = 0; i < size; i++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)
        re[i] = samples[offset + i] * w
        weight += w * w
      }
      // In-place radix-2 FFT, with bit-reversed input.
      for (let i = 1, j = 0; i < size; i++) {
        let bit = size >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) [re[i], re[j]] = [re[j], re[i]]
      }
      for (let len = 2; len <= size; len *= 2) {
        for (let start = 0; start < size; start += len) {
          for (let k = 0; k < len / 2; k++) {
            const angle = -2 * Math.PI * k / len, a = start + k, b = a + len / 2
            const r = re[b] * Math.cos(angle) - im[b] * Math.sin(angle)
            const m = re[b] * Math.sin(angle) + im[b] * Math.cos(angle)
            re[b] = re[a] - r; im[b] = im[a] - m
            re[a] += r; im[a] += m
          }
        }
      }
      for (let k = 0; k <= size / 2; k++) {
        spectrum[k] += (re[k] ** 2 + im[k] ** 2) * (k === 0 || k === size / 2 ? 1 : 2) / (size * weight)
      }
      frames++
    }
    if (!frames) throw new Error('Audio window shorter than one FFT frame')
    for (let k = 0; k < spectrum.length; k++) {
      spectrum[k] /= frames
      for (const [name, [lo, hi]] of Object.entries(bands)) {
        if (k * sampleRate / size >= lo && k * sampleRate / size < hi) energy[name] += spectrum[k]
      }
    }
    spectra.push(Array.from(spectrum))
    return { peak, rms: Math.sqrt(square / samples.length), bandMeanSquare: energy }
  })
  const gaps = [], restamped = []
  for (let i = 1; i < blocks.length; i++) {
    const missing = blocks[i].frame - (blocks[i - 1].frame + blocks[i - 1].length)
    const next = blocks[i + 1] ? blocks[i + 1].frame - (blocks[i].frame + blocks[i].length) : 0
    // A block stamped early and its successor late by the same amount carries
    // every sample in order: one mis-stamped block, not lost audio.
    if (missing < 0 && next === -missing) {
      restamped.push({ afterFrame: blocks[i - 1].frame, shiftFrames: missing }); i++
    } else if (missing !== 0) gaps.push({ afterFrame: blocks[i - 1].frame, missingFrames: missing })
  }
  return { sampleRate, samples: channels[0].length, duration: channels[0].length / sampleRate,
    bandsHz: bands, fftSize: size, binHz: sampleRate / size, channels: result, spectra, gaps, restamped }
}

export function stereoWav(channels, sampleRate) {
  if (channels.length !== 2 || channels[0].length !== channels[1].length) throw new Error('Expected stereo PCM')
  const buffer = Buffer.alloc(44 + channels[0].length * 4)
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 4, 28)
  buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36)
  buffer.writeUInt32LE(buffer.length - 44, 40)
  for (let i = 0; i < channels[0].length; i++) for (let c = 0; c < 2; c++) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + i * 4 + c * 2)
  }
  return buffer
}
