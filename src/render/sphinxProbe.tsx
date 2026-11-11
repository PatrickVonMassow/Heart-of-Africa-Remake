// The field Sphinx (bird's-eye landmark, Cairo skyline) as its own mesh, with
// a DEV probe the picture checks use (scripts/verify/polish-panorama.mjs,
// sections `sphinx-travel` and `giza-skyline`): it projects the Sphinx's
// bounds and head anchors into the frame and switches the mesh to hidden or to
// a flat mask colour, so a check can cut the Sphinx's own pixels out of the
// rendered frame and judge them against the ground or the sky behind.

import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { buildFieldSphinx, fieldSphinxAnchors } from './landmarks'

type Mode = 'normal' | 'hidden' | 'mask'

export interface SphinxProbe {
  mode: (m: Mode) => void
  /** Frame pixels (CSS px from the top left) of the Sphinx's bounding box and head anchors. */
  project: () => {
    width: number
    height: number
    box: { minX: number; maxX: number; minY: number; maxY: number }
    crown: [number, number]
    headBase: [number, number]
  }
}

/** Mask colour: pure magenta, unlit and unfogged, so it survives tone mapping. */
const MASK_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false, toneMapped: false })

export function FieldSphinx({ lod, material, probe, castShadow = false }: {
  lod: 'landmark' | 'skyline'
  material: THREE.Material
  /** The window key the DEV probe is published under. */
  probe: string
  castShadow?: boolean
}) {
  const geometry = useMemo(() => buildFieldSphinx(lod), [lod])
  const mesh = useRef<THREE.Mesh>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const anchors = fieldSphinxAnchors(lod)
    geometry.computeBoundingBox()
    const bb = geometry.boundingBox!
    const toPx = (p: THREE.Vector3): [number, number] => {
      p.applyMatrix4(mesh.current!.matrixWorld).project(camera)
      return [((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height]
    }
    const api: SphinxProbe = {
      mode: (m) => {
        if (!mesh.current) return
        mesh.current.visible = m !== 'hidden'
        mesh.current.material = m === 'mask' ? MASK_MATERIAL : material
      },
      project: () => {
        mesh.current!.updateWorldMatrix(true, false)
        const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        for (let i = 0; i < 8; i++) {
          const [x, y] = toPx(new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z))
          box.minX = Math.min(box.minX, x)
          box.maxX = Math.max(box.maxX, x)
          box.minY = Math.min(box.minY, y)
          box.maxY = Math.max(box.maxY, y)
        }
        return {
          width: size.width,
          height: size.height,
          box,
          crown: toPx(new THREE.Vector3(...anchors.crown)),
          headBase: toPx(new THREE.Vector3(...anchors.headBase)),
        }
      },
    }
    w[probe] = api
    return () => {
      delete w[probe]
    }
  }, [camera, size, geometry, lod, material, probe])
  return <mesh ref={mesh} geometry={geometry} material={material} castShadow={castShadow} receiveShadow={castShadow} />
}
