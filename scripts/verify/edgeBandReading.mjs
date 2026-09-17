import sharp from 'sharp'
import { luminanceSamples, READ_COUNT, SHOT_DRIFT_BAR, shotDrift, shotReading } from './cropLuma.mjs'

/** Keep the reason beside a missing reading all the way to the check's log. */
export async function groundSamples(buf, ndc, view, width, height) {
  const crop = {
    left: Math.round(((ndc.x + 1) / 2) * view.width - width / 2),
    top: Math.round(((1 - ndc.y) / 2) * view.height - height / 2),
    width,
    height,
  }
  if (crop.left < 0 || crop.top < 0 || crop.left + width > view.width || crop.top + height > view.height) {
    return { value: null, detail: `crop off-frame: rectangle ${JSON.stringify(crop)} against viewport ${JSON.stringify(view)}` }
  }
  const { data, info } = await sharp(buf).extract(crop).raw().toBuffer({ resolveWithObject: true })
  return { value: luminanceSamples(data, info) }
}

export function edgeShotReading(reads) {
  const value = shotReading(reads.slice(0, READ_COUNT))
  // All-black shots have undefined relative drift. Report the zero explicitly;
  // the ratio adds which ON/OFF shot produced it.
  const drift = shotDrift(reads)
  if (value === 0 && drift === null) {
    return { value: null, detail: 'zero-luminance shot: reading=0, drift=null' }
  }
  if (drift === null || drift > SHOT_DRIFT_BAR) {
    return {
      value: null,
      detail: `shot rejected: luminance=${value}, drift=${drift}, bar=${SHOT_DRIFT_BAR}`,
    }
  }
  return { value }
}

/** Preserve the symmetric ON/OFF/ON measurement and identify the failed shot. */
export async function bandRatio(shot) {
  const on1 = await shot(1)
  const off = await shot(0)
  const on2 = await shot(1)
  const failed = [on1, off, on2].flatMap((reading, i) =>
    reading.value === null ? [`${['on1', 'off', 'on2'][i]}: ${reading.detail}`] : [])
  if (failed.length) return { value: null, detail: failed.join('; ') }
  if (!(off.value > 0)) {
    return { value: null, detail: `band-off luminance is not positive: off=${off.value}, on1=${on1.value}, on2=${on2.value}` }
  }
  return { value: (on1.value + on2.value) / 2 / off.value }
}
