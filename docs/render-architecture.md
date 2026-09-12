# Renderer architecture

Implementation detail for the renderer rule in `CLAUDE.md` §3. The binding
target remains WebGPU primary with automatic WebGL 2 fallback; this document
records how the current stack realizes it.

React Three Fiber v9 creates the renderer through its asynchronous `gl` factory
and awaits `renderer.init()`. `WebGPURenderer`, imported through `three/webgpu`,
falls back to WebGL 2 when WebGPU is unavailable. The fallback is the supported
compatibility lane, not a second renderer implementation, and the localized,
dismissible compatibility notice tells the player when it is active.

Shaders use Three Shading Language rather than raw GLSL or WGSL so the same
nodes compile for both backends. Browser-specific capability branches must
remain localized; game behavior must not depend on Chrome-only APIs.

`src/render/scenePass.ts` owns the scene MRT's attachment formats and sample
count together. Color, signed normals and velocities use RGBA
half-float textures with explicit `samples: 0` on both backends. Some adapters
refuse half-float MSAA, so disabling TRAA (including LOW quality) drops AA
without adding a replacement pass. Explicit zero also prevents Three from
inheriting the renderer's four samples during pass setup; TRAA requires
single-sampled depth for its history copy.
