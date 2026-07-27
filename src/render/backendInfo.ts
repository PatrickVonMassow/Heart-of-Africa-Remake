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
