// The Great Sphinx's site material (TSL, both backends): the vertex colours of
// the shared definition's mesh, shaded by horizontal bands — the weathered
// limestone courses on the body, the stripes of the nemes on the headcloth —
// read from the mesh's `sphinxBand` attribute (amplitude, period in metres;
// zero amplitude on the drift and the face). The bands are soft sines faded
// out by their own screen derivative, so they never alias into a shimmer
// when the camera moves or they shrink below a pixel.

import * as THREE from 'three/webgpu'
import { attribute, float, fwidth, positionLocal, sin, smoothstep, vec2, vertexColor } from 'three/tsl'
import { SPHINX_BAND_ATTRIBUTE } from './sphinx'

export function createSphinxSiteMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  const band = attribute(SPHINX_BAND_ATTRIBUTE, 'vec2') as unknown as ReturnType<typeof vec2>
  const phase = positionLocal.y.div(band.y)
  // A main course rhythm and a slower, offset one: the layers weather unevenly.
  const wave = sin(phase.mul(Math.PI * 2))
    .mul(0.65)
    .add(sin(phase.mul(Math.PI * 2 * 0.37).add(1.3)).mul(0.35))
  // Fade a band out before it becomes narrower than about two pixels.
  const fade = float(1).sub(smoothstep(0.2, 0.5, fwidth(phase)))
  const shade = float(1).sub(band.x.mul(fade).mul(wave.mul(0.5).add(0.5)))
  m.colorNode = vertexColor().rgb.mul(shade)
  return m
}
