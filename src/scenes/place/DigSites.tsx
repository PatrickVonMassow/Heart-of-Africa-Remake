import { useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import type { DigSite, DigSiteProgress } from './adultWork'
import { digSiteAppearance, digSiteFurniture, DIG_BASKETS, DIG_STORE_COVER, DIG_SEEDLING_TRAY } from './digSiteAppearance'
import { digEarthFlight, digSiteRotation } from './placeGround'
import { PlaceGroundContext } from './PlaceGroundContext'
import { buildDigSpoilGeometry, updateDigSpoilGeometry } from './digSpoilGeometry'

/** The brief shower from one completed tool stroke, thrown toward the heap. */
function EarthThrow({ strike, site, index }: { strike: number; site: DigSite; index: number }) {
  const ground = useContext(PlaceGroundContext)
  const group = useRef<THREE.Group>(null)
  const age = useRef(Number.POSITIVE_INFINITY)
  const previous = useRef(strike)
  useEffect(() => {
    if (strike > previous.current) age.current = 0
    previous.current = strike
  }, [strike])
  useFrame((_, rawDt) => {
    const g = group.current
    if (!g) return
    age.current += Math.min(rawDt, 0.1)
    g.visible = age.current < 0.72
    if (!g.visible) return
    for (let i = 0; i < g.children.length; i++) {
      const t = age.current
      const clod = g.children[i]
      const p = digEarthFlight(site, ground.progress[index], t, i)
      clod.position.set(p.x, p.y, p.z)
      clod.rotation.x += rawDt * (3 + i)
      clod.rotation.z += rawDt * (2 + i * 0.4)
    }
  })
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} scale={0.045 + (i % 2) * 0.012} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={i % 2 ? '#6b4929' : '#52351f'} roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function Spoil({ site, index }: { site: DigSite; index: number }) {
  const ground = useContext(PlaceGroundContext)
  const geometry = useMemo(() => buildDigSpoilGeometry(site, ground.progress[index]), [site, ground, index])
  const last = useRef(-1)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const progress = ground.progress[index]
    const work = digSiteAppearance(progress).work
    if (last.current === work) return
    last.current = work
    updateDigSpoilGeometry(geometry, site, progress)
  })
  return <mesh name="dig-spoil" geometry={geometry} receiveShadow castShadow>
    <meshStandardMaterial color="#795438" roughness={1} />
  </mesh>
}

function Seedling({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0.055, z]}>
    <mesh position={[0, 0.11, 0]}><cylinderGeometry args={[0.012, 0.018, 0.22, 5]} /><meshStandardMaterial color="#6f7d35" /></mesh>
    {[-1, 1].map((side) => <mesh key={side} position={[side * 0.075, 0.17, 0]} rotation={[0, 0, side * -0.6]} scale={[0.1, 0.035, 0.045]}>
      <sphereGeometry args={[1, 6, 4]} /><meshStandardMaterial color="#58733c" roughness={1} />
    </mesh>)}
  </group>
}

function Basket({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.32, 0.23, 0.5, 12]} /><meshStandardMaterial color="#a58a57" roughness={1} /></mesh>
    {[0.1, 0.2, 0.3, 0.4, 0.5].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.23 + y * 0.18, 0.018, 4, 12]} /><meshStandardMaterial color="#715332" roughness={1} />
    </mesh>)}
    <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.29, 0.29, 0.015, 12]} /><meshStandardMaterial color="#ccb173" roughness={1} /></mesh>
  </group>
}

export function DigSites({ sites, progress }: { sites: readonly DigSite[]; progress: readonly DigSiteProgress[] }) {
  return <>{sites.map((site, i) => {
    const worked = progress[i]
    const look = digSiteAppearance(worked)
    const furniture = digSiteFurniture(site.kind, worked)
    const patch = furniture.ground === 'furrows'
    const r = furniture.ground === 'narrow-mouth' ? 0.32 : 0.9
    return <group key={i} name="dig-site" position={[site.x, 0, site.z]} rotation={[0, digSiteRotation(site), 0]}
      userData={{ kind: site.kind, dug: worked?.dug ?? 0, strikes: worked?.strikes ?? 0, completed: !!worked?.completed }}>
      {patch ? <group name="dig-furrows">
        <mesh position={[0, 0.018, 0]} receiveShadow><boxGeometry args={[2.55, 0.035, 1.9]} /><meshStandardMaterial color="#503721" roughness={1} /></mesh>
        {[-0.65, 0, 0.65].map((z) => <mesh key={z} position={[0, 0.065, z]} scale={[1, 0.45, 1]} rotation={[0, 0, Math.PI / 2]} receiveShadow>
          <cylinderGeometry args={[0.14, 0.14, 2.45, 7]} /><meshStandardMaterial color="#775334" roughness={1} />
        </mesh>)}
      </group> : <group name="dig-mouth">
        <mesh position={[0, 0.018, 0]} receiveShadow><cylinderGeometry args={[r * 1.08, r * 1.12, 0.035, 16]} /><meshStandardMaterial color="#62452a" roughness={1} /></mesh>
        <mesh position={[0, 0.058, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow><torusGeometry args={[r * 0.78, r * 0.14, 5, 16]} /><meshStandardMaterial color="#775334" roughness={1} /></mesh>
        <mesh position={[0, 0.045 - look.wallDepth * 0.12, 0]}><cylinderGeometry args={[r * 0.82, r * look.bottomRadius, look.wallDepth, 16, 2, true]} /><meshStandardMaterial color="#49301f" side={THREE.DoubleSide} roughness={1} /></mesh>
        <mesh position={[0, 0.026, 0]}><cylinderGeometry args={[r * look.bottomRadius, r * look.bottomRadius, 0.025, 16]} /><meshStandardMaterial color="#211914" roughness={1} /></mesh>
      </group>}
      <group name={furniture.beside}>
        {furniture.beside === 'grain-baskets-and-cover' && <>
          {DIG_BASKETS.map((p) => <Basket key={p.x} x={p.x} z={p.z} />)}
          {!furniture.result && <mesh position={[DIG_STORE_COVER.x, 0.06, DIG_STORE_COVER.z]}><cylinderGeometry args={[0.65, 0.65, 0.08, 16]} /><meshStandardMaterial color="#967548" roughness={1} /></mesh>}
        </>}
        {furniture.beside === 'seedling-tray' && <group position={[DIG_SEEDLING_TRAY.x, 0, DIG_SEEDLING_TRAY.z]}>
          <mesh position={[0, 0.055, 0]}><boxGeometry args={[0.85, 0.11, 0.45]} /><meshStandardMaterial color="#93754d" roughness={1} /></mesh>
          {[-0.25, 0, 0.25].map((x) => <Seedling key={x} x={x} z={0} />)}
        </group>}
        {furniture.beside === 'stacked-posts' && [0, 1, 2].map((k) => <mesh key={k} position={[0.6 + k * 0.22, 0.12, -1.6]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 1.8, 7]} /><meshStandardMaterial color="#886239" roughness={1} />
        </mesh>)}
      </group>
      {furniture.result && <group name={furniture.result}>
        {furniture.result === 'covered-store' && <>
          <mesh position={[0, 0.085, 0]} receiveShadow><cylinderGeometry args={[0.66, 0.66, 0.09, 16]} /><meshStandardMaterial color="#a18451" roughness={1} /></mesh>
          {[-0.35, -0.12, 0.12, 0.35].map((x) => <mesh key={x} position={[x, 0.135, 0]}><boxGeometry args={[0.024, 0.012, 0.95]} /><meshStandardMaterial color="#6d512f" roughness={1} /></mesh>)}
        </>}
        {furniture.result === 'planted-rows' && [-0.65, 0, 0.65].flatMap((z) => [-0.85, -0.3, 0.3, 0.85].map((x) => <Seedling key={`${x}/${z}`} x={x} z={z} />))}
        {furniture.result === 'set-post' && <mesh position={[0, 0.85, 0]} castShadow><cylinderGeometry args={[0.09, 0.13, 1.7, 8]} /><meshStandardMaterial color="#886239" roughness={1} /></mesh>}
      </group>}
      <Spoil site={site} index={i} />
      <EarthThrow strike={worked?.strikes ?? 0} site={site} index={i} />
    </group>
  })}</>
}
