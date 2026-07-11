import { Suspense } from 'react'
import { Canvas, extend, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useGame } from './state/store'
import { useUi } from './state/ui'
import { TravelScene } from './scenes/travel/TravelScene'
import { PlaceScene } from './scenes/place/PlaceScene'
import { Effects } from './render/Effects'
import { Hud } from './ui/Hud'
import { AmbienceController } from './ui/AmbienceController'

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
        shadows
        gl={async (props) => {
          // WebGPU primary; the renderer falls back to WebGL 2 automatically
          // when WebGPU is unavailable (CLAUDE.md §3).
          const renderer = new THREE.WebGPURenderer({
            ...(props as ConstructorParameters<typeof THREE.WebGPURenderer>[0]),
            antialias: true,
          })
          await renderer.init()
          // Surface the automatic WebGL 2 fallback to the player (CLAUDE.md §3).
          const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
          useUi.getState().setWebglFallback(backend?.isWebGPUBackend !== true)
          // Dev hook for the headless verification (CLAUDE.md §7.2): the
          // pipeline-rebuild leak gate reads renderer.info.memory.
          if (import.meta.env.DEV) {
            ;(window as unknown as Record<string, unknown>).__renderer = renderer
          }
          // Filmic look: soft shadows + ACES tone mapping.
          renderer.shadowMap.enabled = true
          renderer.shadowMap.type = THREE.PCFSoftShadowMap
          renderer.toneMapping = THREE.ACESFilmicToneMapping
          renderer.toneMappingExposure = 1.05
          return renderer
        }}
      >
        <Suspense fallback={null}>
          {mode === 'travel' ? <TravelScene /> : <PlaceScene />}
          <Effects />
        </Suspense>
      </Canvas>
      <Hud />
      <AmbienceController />
    </div>
  )
}
