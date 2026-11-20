// Which renderer backend the session actually got, and which GPU behind it.
// Read by every report that has to name its environment: the F8 benchmark
// (design.md §21.1) and the F6 bug report. Kept here rather than inside the
// benchmark runner, which is lazily imported on purpose and must stay out of
// the eager startup chunks.

export interface BackendInfo {
  /** 'webgpu' or 'webgl2' — what the renderer ended up on, not what was asked. */
  backend: string
  /** Adapter/renderer string where the backend exposes one, else 'unknown'. */
  adapter: string
}

export function describeBackend(gl: unknown): BackendInfo {
  const backend = (gl as { backend?: { isWebGPUBackend?: boolean } } | null)?.backend
  const isWebGpu = backend?.isWebGPUBackend === true
  const info = backend as unknown as {
    // three keeps no adapter handle, but the device carries its info
    // (GPUDevice.adapterInfo) — that is the GPU's name in the report.
    device?: { adapterInfo?: { vendor?: string; architecture?: string; device?: string; description?: string } }
    gl?: WebGL2RenderingContext
  } | null
  let adapter = 'unknown'
  if (isWebGpu && info?.device?.adapterInfo) {
    const a = info.device.adapterInfo
    adapter = [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' ').trim() || 'unknown'
  } else if (info?.gl) {
    try {
      const dbg = info.gl.getExtension('WEBGL_debug_renderer_info')
      adapter = dbg ? String(info.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(info.gl.getParameter(info.gl.RENDERER))
    } catch {
      // Some drivers refuse the unmasked string — the backend name is enough.
    }
  }
  return { backend: isWebGpu ? 'webgpu' : 'webgl2', adapter }
}

/** The unmasked WebGL renderer name from a throwaway context, or '' where the
 *  browser masks or refuses it. WebGPU names only vendor and architecture, so
 *  the first-start pick (point 1562) reads this to tell an APU ("AMD Radeon(TM)
 *  Graphics") from a discrete card of the same architecture ("Radeon RX 6800"). */
export function probeWebglRendererName(): string {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = document.createElement('canvas').getContext('webgl2')
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    return ''
  } finally {
    try {
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      // the context is dropped with the canvas anyway
    }
  }
}

/** The probed WebGL name for the first-start pick: only on WebGPU, whose own
 *  adapter name is architecture-only. On a hybrid machine it may name a
 *  different GPU than WebGPU's, so the pick uses it to EXEMPT a discrete card,
 *  never to declare one weak (WEAK_ADAPTER_RULES `unless`). */
export function startProbeName(info: BackendInfo, probe: () => string = probeWebglRendererName): string {
  return info.backend === 'webgpu' ? probe() : ''
}
