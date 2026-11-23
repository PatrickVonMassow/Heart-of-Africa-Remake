// A scene-graph portal that lets go of what it was mounted into (point 1447).
//
// WHY. @react-three/fiber 9.6.1's createPortal subscribes its mirrored store to
// the parent store while it renders and never unsubscribes (fixed upstream in
// 9.8). The leaked listener holds the portal's container, and a figure's portal
// containers are its bones (the shovel on the right hand, a hand load, the
// crown for a head load) — so through the bones' parent chain every glTF
// villager ever drawn stayed reachable with its rig, skinned meshes and
// geometry: ~140 MB of heap per village visited (owner measurement,
// 21.11.2026; heap-snapshot retainer path Window -> R3F root store ->
// listeners -> onMutate -> container -> Bone -> ... -> SkinnedMesh).
//
// WHAT. The portal is handed a stand-in parent store: same state, but its
// subscribers live in a set owned by this component, fed by ONE listener on the
// real store that is removed when the component unmounts (and re-added after
// React StrictMode's simulated remount). The listener R3F never removes then
// lands in that set and dies with the component.

import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { context, createPortal, useStore } from '@react-three/fiber'
import type * as THREE from 'three/webgpu'

type Listener = (state: unknown, previous: unknown) => void
type ParentStore = ReturnType<typeof useStore>

/** A stand-in for `root` whose subscriptions end when `listeners` is dropped. */
export function forwardingStore(root: ParentStore, listeners: Set<Listener>): ParentStore {
  const hook = ((...args: unknown[]) => (root as unknown as (...a: unknown[]) => unknown)(...args)) as unknown as ParentStore
  return Object.assign(hook, root, {
    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  })
}

/** `createPortal(children, container)` without the leaked parent subscription. */
export function ScenePortal({ children, container }: { children: ReactNode; container: THREE.Object3D }) {
  const root = useStore()
  const forward = useMemo(() => {
    const listeners = new Set<Listener>()
    return { listeners, store: forwardingStore(root, listeners) }
  }, [root])
  useLayoutEffect(() => {
    const { listeners } = forward
    const off = (root as unknown as { subscribe: (l: Listener) => () => void }).subscribe((state, previous) => {
      for (const l of listeners) l(state, previous)
    })
    // catch up on anything that changed between the portal's render and now
    const now = root.getState()
    for (const l of listeners) l(now, now)
    return off
  }, [root, forward])
  return <context.Provider value={forward.store}>{createPortal(children, container)}</context.Provider>
}
