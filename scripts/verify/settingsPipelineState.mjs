/** Runs inside the page. Read-only evidence at the TRAA shutter, with no wait
 * or compilation: a black frame still fails at the original deadline. */
export function settingsPipelineState() {
  const renderer = window.__renderer
  const cache = renderer?._pipelines?.caches
  const composites = []
  if (cache) {
    for (const pipeline of cache.values()) {
      if (pipeline.fragmentProgram?.name !== 'RenderPipeline') continue
      const data = renderer.backend.get(pipeline)
      composites.push({
        key: pipeline.cacheKey,
        usedTimes: pipeline.usedTimes,
        ready: data.pipeline != null,
      })
    }
  }
  return {
    frame: renderer?.info?.frame ?? null,
    drawCalls: renderer?.info?.render?.drawCalls ?? null,
    pipelines: window.__shaderPipelines?.() ?? null,
    diagnostics: window.__shaderPipelineDiagnostics?.() ?? null,
    composites,
  }
}

/** Same callback-completion clock as startup.mjs's painted-frame-gap rows.
 * Observe existing rAF callbacks only: scheduling a new frame train here would
 * change the section's own cadence. Includes both edges of the OFF window. */
export function startSettingsFrameTiming() {
  const original = window.requestAnimationFrame
  const start = performance.now()
  let previous = start
  let maxGapMs = 0
  let callbacks = 0
  const observed = function (callback) {
    return original.call(window, function (time) {
      try {
        return callback(time)
      } finally {
        const now = performance.now()
        maxGapMs = Math.max(maxGapMs, now - previous)
        previous = now
        callbacks++
      }
    })
  }
  window.requestAnimationFrame = observed
  window.__stopSettingsFrameTiming = () => {
    if (window.requestAnimationFrame === observed) window.requestAnimationFrame = original
    delete window.__stopSettingsFrameTiming
    const end = performance.now()
    return {
      maxGapMs: Math.max(maxGapMs, end - previous),
      elapsedMs: end - start,
      callbacks,
    }
  }
}

export function stopSettingsFrameTiming() {
  return window.__stopSettingsFrameTiming()
}
