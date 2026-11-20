import { describe, expect, it } from 'vitest'
import { createEnvironmentTexture, updateEnvironmentTexture } from './environment'

// three's PMREM cache keys its render target by the environment TEXTURE object
// and, on that texture's dispose, frees only the target's texture — not the
// target. A new texture per sun change therefore leaked one render target per
// re-derivation (point 1520: renderTargets 45 -> 370 across rebuilds). A re-bake
// in place keeps the key, so the generator refills the cached target instead.
describe('environment re-bake', () => {
  it('keeps the same texture object and buffer, refreshes data and requests a new PMREM', () => {
    const tex = createEnvironmentTexture([0.5, 0.65, 0.36])
    const data = tex.image.data as Float32Array
    const before = Float32Array.from(data)
    const version = tex.version
    const pmremVersion = tex.pmremVersion

    updateEnvironmentTexture(tex, [-0.5, 0.2, -0.36])

    expect(tex.image.data).toBe(data)
    expect(data).not.toEqual(before)
    expect(tex.version).toBeGreaterThan(version)
    expect(tex.pmremVersion).toBeGreaterThan(pmremVersion)
  })
})
