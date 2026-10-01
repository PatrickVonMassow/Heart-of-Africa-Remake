// Can this device draw the game at all? The renderer is WebGPU primary with an
// automatic WebGL 2 fallback (CLAUDE.md §3), but a device or browser may offer
// NEITHER — a blocklisted driver, a GPU process that died, a headless host
// without a display. three's WebGL backend then dereferences the null context
// inside renderer.init() ("Cannot read properties of null (reading
// 'getSupportedExtensions')") and the start crashes instead of degrading.
// This probe runs before the canvas mounts, so the app can show the
// compatibility notice instead of throwing.

/** What the probe needs from the browser — injectable for the Vitest layer. */
export interface RenderSupportEnv {
  createCanvas: () => { getContext: (id: 'webgl2') => unknown } | null
  gpu?: { requestAdapter: () => Promise<unknown> } | null
}

function browserEnv(): RenderSupportEnv {
  return {
    createCanvas: () => (typeof document === 'undefined' ? null : document.createElement('canvas')),
    gpu: typeof navigator === 'undefined' ? null : ((navigator as unknown as { gpu?: RenderSupportEnv['gpu'] }).gpu ?? null),
  }
}

/** True when a WebGL 2 context can be created. The probe context is released
 *  at once so it does not count against the browser's context limit. */
export function hasWebgl2(env: RenderSupportEnv = browserEnv()): boolean {
  try {
    const gl = env.createCanvas()?.getContext('webgl2') as
      | { getExtension?: (n: string) => { loseContext?: () => void } | null }
      | null
      | undefined
    if (!gl) return false
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.()
    return true
  } catch {
    return false
  }
}

/** True when a WebGPU adapter is offered. */
export async function hasWebgpuAdapter(env: RenderSupportEnv = browserEnv()): Promise<boolean> {
  if (!env.gpu) return false
  try {
    return (await env.gpu.requestAdapter()) != null
  } catch {
    return false
  }
}

/** Synchronous first answer: `true` when WebGL 2 is there (the renderer can
 *  start on either backend), `null` when only the asynchronous WebGPU check
 *  can still decide. The common case therefore mounts the canvas without
 *  waiting for anything. */
export function renderSupportNow(env: RenderSupportEnv = browserEnv()): true | null {
  return hasWebgl2(env) ? true : null
}

/** The full answer: can the renderer start on any backend? */
export async function probeRenderSupport(env: RenderSupportEnv = browserEnv()): Promise<boolean> {
  return renderSupportNow(env) === true || (await hasWebgpuAdapter(env))
}
