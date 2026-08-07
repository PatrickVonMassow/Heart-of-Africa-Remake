// The release path the point-546 fix rests on: leaving the bird's-eye view must
// hand the cascade shadow maps back, and must survive every shape the node can
// be in when a scene tears down.
import { describe, it, expect, vi } from 'vitest'
import { releaseCascadeShadowMaps, type CascadedShadowNode } from './shadowRelease'

const cascade = () => ({ shadowMap: { dispose: vi.fn() } })

describe('releaseCascadeShadowMaps', () => {
  it('disposes the render target of every rendered cascade', () => {
    const cascades = [cascade(), cascade(), cascade()]
    const csm: CascadedShadowNode = { _shadowNodes: cascades }
    expect(releaseCascadeShadowMaps(csm)).toBe(3)
    for (const c of cascades) expect(c.shadowMap.dispose).toHaveBeenCalledTimes(1)
  })

  it('leaves the shadowMap reference in place so three rebuilds it on the next frame', () => {
    // Nulling it would strip the node of the target its own updateShadow()
    // renders into; the map must survive the release and only lose its backend
    // data, which three re-creates the next time it is rendered into.
    const cascades = [cascade()]
    releaseCascadeShadowMaps({ _shadowNodes: cascades })
    expect(cascades[0].shadowMap).not.toBeNull()
  })

  it('skips a cascade that has never been rendered', () => {
    const rendered = cascade()
    // A cascade's map is null until its first shadow render — leaving the view
    // before that must release what exists and count only that.
    expect(releaseCascadeShadowMaps({ _shadowNodes: [{ shadowMap: null }, {}, rendered] })).toBe(1)
    expect(rendered.shadowMap.dispose).toHaveBeenCalledTimes(1)
  })

  it('releases nothing, and throws nothing, without a usable node', () => {
    expect(releaseCascadeShadowMaps(null)).toBe(0)
    expect(releaseCascadeShadowMaps(undefined)).toBe(0)
    expect(releaseCascadeShadowMaps({})).toBe(0)
    // An upstream rename of the internal field must degrade to "nothing to
    // release", never to a throw inside a scene teardown.
    expect(releaseCascadeShadowMaps({ _shadowNodes: undefined })).toBe(0)
    expect(releaseCascadeShadowMaps({ _shadowNodes: 'not an array' } as unknown as CascadedShadowNode)).toBe(0)
  })

  it('ignores a cascade whose map cannot be disposed', () => {
    expect(
      releaseCascadeShadowMaps({ _shadowNodes: [{ shadowMap: {} as never }] }),
    ).toBe(0)
  })

  it('is safe to call again after a release', () => {
    const cascades = [cascade()]
    releaseCascadeShadowMaps({ _shadowNodes: cascades })
    expect(() => releaseCascadeShadowMaps({ _shadowNodes: cascades })).not.toThrow()
    expect(cascades[0].shadowMap.dispose).toHaveBeenCalledTimes(2)
  })
})
