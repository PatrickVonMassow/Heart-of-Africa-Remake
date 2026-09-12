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
        id: pipeline.id,
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
