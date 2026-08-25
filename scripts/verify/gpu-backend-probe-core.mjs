// Pure verdict for the verify host's fast GPU-backend probe. The browser-facing half
// lives in gpu-backend-probe.mjs; keeping the policy here lets Vitest pose an absent or
// degraded host without depending on the machine that runs the unit layer.

const REQUIRED_LANES = ['webgl2', 'webgpu']
const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'softpipe', 'lavapipe']

function clean(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** Whether Chrome names a CPU rasteriser rather than a physical GPU. */
export function softwareRenderer(renderer) {
  const lowered = typeof renderer === 'string' ? renderer.toLowerCase() : ''
  return SOFTWARE_RENDERERS.find((name) => lowered.includes(name)) ?? null
}

/** One compact diagnostic suitable for a terminal line. */
export function backendProbeDetail(result) {
  if (!result || typeof result !== 'object') return 'probe returned no result'
  if (result.error) return clean(result.error, 'browser launch failed')

  const api = result.available ? 'API ready' : 'API missing'
  const renderer = clean(result.renderer, 'renderer unnamed')
  const implementation = clean(result.implementation, 'GL implementation unnamed')
  const feature = result.lane === 'webgpu' ? result.featureStatus?.webgpu : result.featureStatus?.webgl
  return `${api}; renderer=${renderer}; implementation=${implementation}; feature=${clean(feature, 'unknown')}`
}

/**
 * Classify the two exact verification lanes.
 *
 * PRESENT means both browser APIs exist and Chrome names a non-software renderer.
 * ABSENT means neither API exists: the host/browser layer failed before app code ran.
 * DEGRADED covers one missing lane, a software rasteriser, or an unnamed renderer.
 */
export function gpuBackendVerdict(results) {
  const byLane = new Map(
    (Array.isArray(results) ? results : [])
      .filter((result) => result && REQUIRED_LANES.includes(result.lane))
      .map((result) => [result.lane, result]),
  )
  const lanes = REQUIRED_LANES.map((lane) => byLane.get(lane) ?? { lane, available: false, error: 'not probed' })
  const available = lanes.filter((result) => result.available === true)

  if (available.length === 0) {
    return {
      ok: false,
      state: 'absent',
      results: lanes,
      summary:
        'GPU BACKENDS ABSENT: neither WebGL 2 nor WebGPU exists in the verification browsers; ' +
        'the host/browser GPU layer failed before app startup.',
    }
  }

  const degraded = lanes.filter((result) => {
    if (result.available !== true) return true
    return !clean(result.renderer, '') || softwareRenderer(result.renderer) !== null
  })
  if (degraded.length > 0) {
    const problems = degraded.map((result) => {
      if (result.available !== true) return `${result.lane} missing`
      const software = softwareRenderer(result.renderer)
      return software ? `${result.lane} uses ${software}` : `${result.lane} renderer unnamed`
    })
    return {
      ok: false,
      state: 'degraded',
      results: lanes,
      summary:
        `GPU BACKENDS DEGRADED: ${problems.join(', ')}; ` +
        'the browser lane is not ready for picture verification.',
    }
  }

  return {
    ok: true,
    state: 'present',
    results: lanes,
    summary:
      'GPU BACKENDS PRESENT: WebGL 2 context and WebGPU adapter are ready on hardware; ' +
      'a later window.__renderer timeout is an app startup failure, not host GPU loss.',
  }
}
