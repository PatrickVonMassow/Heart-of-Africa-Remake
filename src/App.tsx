import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

export default function App() {
  return (
    <Canvas style={{ height: '100vh' }}>
      <ambientLight />
      <pointLight position={[5, 5, 5]} />
      <mesh rotation={[0.4, 0.6, 0]}>
        <boxGeometry />
        <meshStandardMaterial color="orange" />
      </mesh>
      <OrbitControls />
    </Canvas>
  )
}