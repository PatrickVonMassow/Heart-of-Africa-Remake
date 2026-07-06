import { Suspense } from 'react'
import { Canvas, extend, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useGame } from './state/store'
import { TravelScene } from './scenes/travel/TravelScene'
import { PlaceScene } from './scenes/place/PlaceScene'
import { Hud } from './ui/Hud'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}

// Register the WebGPU build's classes for JSX elements (R3F v9 pattern).
extend(THREE as unknown as Parameters<typeof extend>[0])

export default function App() {
  const mode = useGame((s) => s.mode)
  return (
    <div className="game-root">
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 2000, position: [0, 40, 20] }}
        gl={async (props) => {
          // WebGPU primary; the renderer falls back to WebGL 2 automatically
          // when WebGPU is unavailable (CLAUDE.md §3).
          const renderer = new THREE.WebGPURenderer({
            ...(props as ConstructorParameters<typeof THREE.WebGPURenderer>[0]),
            antialias: true,
          })
          await renderer.init()
          return renderer
        }}
      >
        <Suspense fallback={null}>
          {mode === 'travel' ? <TravelScene /> : <PlaceScene />}
        </Suspense>
      </Canvas>
      <Hud />
    </div>
  )
}
