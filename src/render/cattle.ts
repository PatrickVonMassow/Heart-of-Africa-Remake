// The village kraal's cattle (work-order 359; design.md §19.10, research
// docs/peoples-1890.md §8.8). A small, lyre-horned Sanga-type beast — the
// Nguni / Zulu and Maasai cattle are Sanga and zebu crosses, not European
// breeds — built on the shared swept-tube ungulate plan, so it walks on the
// same hip pivots and gait math as the goats (`GoatLeg`, `gaitRig`).
// The cervico-thoracic hump of the Sanga is not modelled. // OPEN: hump shape.

import * as THREE from 'three/webgpu'
import { buildUngulateParts, DEFAULT_FAUNA_BODY_SEGMENTS, type UngulateSpec } from './faunaUngulates'
import type { GoatLeg } from './faunaGeometry'

/** Coat colours of the kraal herd: the period cattle were mixed in colour
 *  (dun, red-brown, black, pale) — placeholders, calibratable by eye. */
export const CATTLE_COATS = ['#7a4e30', '#2e2621', '#b08458', '#cfc2ac'] as const

const CATTLE: UngulateSpec = {
  bodyLen: 1.2,
  bodyR: 0.33,
  legH: 0.6,
  legR: 0.06,
  neckLen: 0.42,
  neckTilt: 0.85,
  headSize: 0.17,
  bodyColor: CATTLE_COATS[0],
  headColor: CATTLE_COATS[0],
  horns: true,
  seed: 359,
  bodyWidth: 0.92,
  headLen: 2.5,
  headPitch: 1.05,
  ear: { len: 0.75, width: 0.3, spread: 1.45, back: 0.1 },
  tail: { len: 2.1, color: CATTLE_COATS[0], tip: '#1f1c19' },
  hornForm: 'lyre',
  hornLen: 2.6,
  hornColor: '#d6cab0',
  hoofColor: '#2a2622',
  marking: 'none',
}

/** One beast split into body and four pivoted legs, in coat `coat`. */
export function buildCattleParts(
  coat: number,
  radial = DEFAULT_FAUNA_BODY_SEGMENTS,
): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  const c = CATTLE_COATS[((coat % CATTLE_COATS.length) + CATTLE_COATS.length) % CATTLE_COATS.length]
  return buildUngulateParts({ ...CATTLE, bodyColor: c, headColor: c, tail: { ...CATTLE.tail, color: c }, seed: CATTLE.seed + coat }, radial)
}

/**
 * The farthest horizontal reach of a built beast from its body centre (m),
 * read off the real geometry — horn tips, nose, tail and legs at rest — so the
 * pen hold radius keeps every drawn part inside the fence whatever way the
 * animal faces.
 */
export function cattleReach(parts: { body: THREE.BufferGeometry; legs: readonly GoatLeg[] }): number {
  let reach = 0
  const v = new THREE.Vector3()
  const scan = (geo: THREE.BufferGeometry, ox: number, oz: number) => {
    const pos = geo.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      reach = Math.max(reach, Math.hypot(v.x + ox, v.z + oz))
    }
  }
  scan(parts.body, 0, 0)
  for (const l of parts.legs) scan(l.geo, l.hip[0], l.hip[2])
  return reach
}
